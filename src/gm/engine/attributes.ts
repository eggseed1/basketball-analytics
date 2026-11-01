import type {
  GmAttributes,
  GmCountingLine,
  GmDevPath,
  GmPlayer,
  GmPosition,
  GmPotential,
  GmSheet,
  GmTendencies,
} from "@/gm/types";
import { clamp, createRng } from "@/gm/engine/rng";
import {
  ensurePotentialTrait,
  pathFromTrait,
  rollDevTrait,
  traitGrowthMul,
} from "@/gm/engine/dev-traits";
import entrySkillRates from "@/gm/seed/entry-skill-rates.json";
import { ensureSimProfile } from "@/gm/engine/player-profile";

/** Rebuild stored sheets when this changes. */
export const SHEET_VERSION = 8;

export type SheetStatHint = {
  twoPct?: number;
  twoAttempts?: number;
  threeAttempts?: number;
  freeThrowAttempts?: number;
  threeRate?: number;
  threePct?: number;
  ftPct?: number;
  fgPct?: number;
  mpg?: number;
  ppg?: number;
  rpg?: number;
  apg?: number;
  spg?: number;
  bpg?: number;
  /** Percent points. 23.9 means 23.9% of available rebounds. */
  orbPct?: number;
  drbPct?: number;
  blkPct?: number;
  stlPct?: number;
  astPct?: number;
};

type EntrySkill = {
  orb?: number;
  drb?: number;
  blk?: number;
  stl?: number;
  ast?: number;
};

const ENTRY_RATES = entrySkillRates as Record<string, EntrySkill>;

const POS_WEIGHT: Record<GmPosition, [number, number, number, number, number, number]> = {
  PG: [0.12, 0.22, 0.28, 0.16, 0.06, 0.16],
  SG: [0.14, 0.26, 0.18, 0.18, 0.06, 0.18],
  SF: [0.16, 0.2, 0.14, 0.2, 0.12, 0.18],
  PF: [0.2, 0.14, 0.1, 0.2, 0.18, 0.18],
  C: [0.22, 0.08, 0.08, 0.22, 0.22, 0.18],
};

const GROW_KEYS: Record<GmPosition, Array<keyof GmAttributes>> = {
  PG: ["passAccuracy", "ballHandle", "threePoint", "midrange", "perimeterDefense", "freeThrow"],
  SG: ["threePoint", "midrange", "ballHandle", "perimeterDefense", "drivingLayup", "freeThrow"],
  SF: ["threePoint", "midrange", "perimeterDefense", "closeShot", "defReb", "freeThrow"],
  PF: ["closeShot", "postControl", "interiorDefense", "defReb", "strength", "freeThrow"],
  C: ["closeShot", "postControl", "interiorDefense", "offReb", "defReb", "strength"],
};

const DECLINE_KEYS: Array<keyof GmAttributes> = [
  "speed",
  "agility",
  "vertical",
  "drivingDunk",
  "stamina",
  "speedWithBall",
];

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function band(value: number): number {
  return clamp(Math.round(Number.isFinite(value) ? value : 60), 25, 99);
}

/** Fractions (0.239) and percent points (23.9) both become percent points. */
export function asPercentPoints(value: number | undefined): number | undefined {
  if (value == null || !Number.isFinite(value) || value < 0) return undefined;
  if (value === 0) return 0;
  return value <= 1 ? value * 100 : value;
}

function scale(value: number, stops: Array<[number, number]>): number {
  const first = stops[0]!;
  if (value <= first[0]) return first[1];
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1]!;
    const next = stops[i]!;
    if (value <= next[0]) {
      const t = (value - prev[0]) / (next[0] - prev[0]);
      return prev[1] + t * (next[1] - prev[1]);
    }
  }
  return stops[stops.length - 1]![1];
}

/** Inverse of `scale`. A 99 three rating maps back to the make rate that earned it. */
export function threeMakeRateFromRating(rating: number): number {
  if (rating < 40) return 0.22;
  return clamp(unscale(rating, THREE_STOPS), 0.22, 0.48);
}

export function freeThrowMakeRateFromRating(rating: number): number {
  return clamp(unscale(rating, FT_STOPS), 0.4, 0.96);
}

/** Close and mid blended into a two-point make rate. */
export function twoMakeRateFromRating(close: number, mid: number): number {
  const skill = close * 0.72 + mid * 0.28;
  return clamp(0.4 + (skill - 60) * 0.0055, 0.4, 0.76);
}

export function unscale(rating: number, stops: Array<[number, number]>): number {
  const first = stops[0]!;
  if (rating <= first[1]) return first[0];
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1]!;
    const next = stops[i]!;
    if (rating <= next[1]) {
      const span = next[1] - prev[1];
      const t = span === 0 ? 0 : (rating - prev[1]) / span;
      return prev[0] + t * (next[0] - prev[0]);
    }
  }
  return stops[stops.length - 1]![0];
}

const ORB_STOPS: Array<[number, number]> = [
  [0, 25],
  [2, 38],
  [5, 55],
  [8, 70],
  [12, 82],
  [16, 92],
  [20, 97],
  [24, 99],
];
const DRB_STOPS: Array<[number, number]> = [
  [0, 25],
  [6, 40],
  [12, 58],
  [18, 72],
  [24, 84],
  [30, 92],
  [36, 99],
];
const BLK_STOPS: Array<[number, number]> = [
  [0, 25],
  [1, 45],
  [2.5, 65],
  [4.5, 80],
  [6.5, 90],
  [9, 99],
];
const STL_STOPS: Array<[number, number]> = [
  [0, 25],
  [0.8, 45],
  [1.5, 62],
  [2.2, 75],
  [3, 88],
  [4, 97],
];
const AST_STOPS: Array<[number, number]> = [
  [0, 25],
  [5, 48],
  [10, 62],
  [18, 78],
  [28, 90],
  [40, 99],
];
const THREE_STOPS: Array<[number, number]> = [
  [0.28, 55],
  [0.33, 68],
  [0.36, 76],
  [0.39, 84],
  [0.42, 92],
  [0.46, 99],
];
const FT_STOPS: Array<[number, number]> = [
  [0.4, 42],
  [0.55, 58],
  [0.7, 72],
  [0.8, 82],
  [0.9, 94],
  [0.95, 99],
];

export function rateKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tend(value: number): number {
  return clamp(Math.round(value), 0, 99);
}

function mean(values: number[]): number {
  if (!values.length) return 60;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function categoryMeans(attributes: GmAttributes): number[] {
  return [
    mean([
      attributes.closeShot,
      attributes.drivingLayup,
      attributes.drivingDunk,
      attributes.standingDunk,
      attributes.postControl,
    ]),
    mean([attributes.midrange, attributes.threePoint, attributes.freeThrow]),
    mean([attributes.passAccuracy, attributes.ballHandle, attributes.speedWithBall]),
    mean([
      attributes.interiorDefense,
      attributes.perimeterDefense,
      attributes.steal,
      attributes.block,
    ]),
    mean([attributes.offReb, attributes.defReb]),
    mean([
      attributes.speed,
      attributes.agility,
      attributes.strength,
      attributes.vertical,
      attributes.stamina,
    ]),
  ];
}

/** MyNBA Simple roster columns: INS MID 3PT INT D PER D PLAY REB ATHL IQ. */
export const SIMPLE_CATS = [
  { id: "ins", label: "INS", title: "Inside scoring" },
  { id: "mid", label: "MID", title: "Mid-range" },
  { id: "3pt", label: "3PT", title: "Three-point" },
  { id: "intd", label: "INT D", title: "Interior defense" },
  { id: "perd", label: "PER D", title: "Perimeter defense" },
  { id: "play", label: "PLAY", title: "Playmaking" },
  { id: "reb", label: "REB", title: "Rebounding" },
  { id: "athl", label: "ATHL", title: "Athleticism" },
  { id: "iq", label: "IQ", title: "Basketball IQ" },
] as const;

export type SimpleCatId = (typeof SIMPLE_CATS)[number]["id"];

export function simpleCategoryMeans(attributes: GmAttributes): number[] {
  return [
    mean([
      attributes.closeShot,
      attributes.drivingLayup,
      attributes.drivingDunk,
      attributes.standingDunk,
      attributes.postControl,
    ]),
    mean([attributes.midrange]),
    mean([attributes.threePoint]),
    mean([attributes.interiorDefense, attributes.block]),
    mean([attributes.perimeterDefense, attributes.steal]),
    mean([attributes.passAccuracy, attributes.ballHandle, attributes.speedWithBall]),
    mean([attributes.offReb, attributes.defReb]),
    mean([
      attributes.speed,
      attributes.agility,
      attributes.strength,
      attributes.vertical,
      attributes.stamina,
    ]),
    mean([attributes.passAccuracy, attributes.freeThrow, attributes.steal]),
  ];
}

const LETTER_GRADES = [
  "F",
  "D",
  "C-",
  "C",
  "C+",
  "B-",
  "B",
  "B+",
  "A-",
  "A",
  "A+",
] as const;

export type LetterGrade = (typeof LETTER_GRADES)[number];

/** Map a 25–99 rating onto the MyNBA letter board. */
export function ratingToLetter(value: number): LetterGrade {
  const v = clamp(value, 25, 99);
  // 40 and under is F; 96+ is A+.
  const t = (v - 40) / (96 - 40);
  const idx = Math.round(clamp(t, 0, 1) * (LETTER_GRADES.length - 1));
  return LETTER_GRADES[idx]!;
}

export function letterRank(grade: LetterGrade): number {
  return LETTER_GRADES.indexOf(grade);
}

export type OverallExtras = {
  /** Points/100 prior (DARKO / BPM). Spine of the number. */
  impact?: number;
  /** Site entry rate when we have it — lifts stars DARKO undersells. */
  drbl100?: number | null;
  /** Real counting — keeps 25+ ppg stars from sitting in the mid-70s. */
  mpg?: number | null;
  ppg?: number | null;
  apg?: number | null;
  rpg?: number | null;
};

/**
 * Box-score floor for high-minute producers. DARKO alone left Curry/LeBron in
 * the mid-70s while role bigs with better rates sat higher — bad for Franchise.
 */
export function productionOverallSpine(extras: {
  mpg?: number | null;
  ppg?: number | null;
  apg?: number | null;
  rpg?: number | null;
}): number | null {
  const mpg = extras.mpg;
  const ppg = extras.ppg;
  if (
    mpg == null ||
    ppg == null ||
    !Number.isFinite(mpg) ||
    !Number.isFinite(ppg) ||
    mpg < 24 ||
    ppg < 12
  ) {
    return null;
  }
  const apg = Number.isFinite(extras.apg) ? (extras.apg as number) : 0;
  const rpg = Number.isFinite(extras.rpg) ? (extras.rpg as number) : 0;
  // ~27/34/6 → ~91; ~21/33/7 → ~86; ~15/28/3 → ~78.
  return clamp(
    55 + ppg * 1.05 + Math.max(0, mpg - 24) * 0.5 + apg * 0.9 + rpg * 0.4,
    68,
    96
  );
}

/**
 * Overall is impact-first, attributes second.
 * The old category blend alone ranked role bigs and tiny-sample flukes over
 * consensus stars (Luka / Giannis / KD) whose sheets had one weak category.
 */
export function overallFromAttributes(
  position: GmPosition,
  attributes: GmAttributes,
  extras?: OverallExtras | number
): number {
  const weights = POS_WEIGHT[position];
  const cats = categoryMeans(attributes);
  const attrBlend = cats.reduce(
    (sum, cat, index) => sum + cat * weights[index]!,
    0
  );
  const opts: OverallExtras =
    typeof extras === "number" ? { impact: extras } : (extras ?? {});
  const impact = Number.isFinite(opts.impact) ? (opts.impact as number) : null;
  if (impact == null) {
    return clamp(Math.round(attrBlend), 25, 99);
  }

  // ~72 + 3.45×impact → Jokic 7.3≈97, Tatum 5.1≈90, SGA 5.8≈92,
  // solid starter 1.5≈77, fringe −1≈69. Tracks the public DARKO board.
  let spine = clamp(72 + impact * 3.45, 42, 98);
  const drbl = opts.drbl100;
  // DRBL lifts stars DARKO undersells (and patches a bad season DARKO row).
  // Role bigs with elite rate alone still need impact or production to climb.
  if (typeof drbl === "number" && Number.isFinite(drbl) && drbl > 1.0) {
    const drblSpine = clamp(69 + drbl * 6.0, 48, 98);
    if (impact >= 2.5 || (impact >= 1.2 && drbl >= 2.8) || drbl >= 3.5) {
      const lift = Math.min(4.5, Math.max(0, (drblSpine - spine) * 0.55));
      spine += lift;
    } else if (impact < 1.2 && drbl >= 1.4) {
      // Soft floor when DARKO is near zero but entry DRBL says starter+.
      spine = Math.max(spine, spine * 0.55 + drblSpine * 0.45);
    }
  }

  const production = productionOverallSpine(opts);
  let productionLift = false;
  if (production != null && production > spine) {
    // Box score lifts DARKO-undersold stars. Allow a bigger pull when impact
    // is near replacement but the counting line is clearly a star (Cade '25).
    const maxLift = impact < 1.0 ? 17 : impact < 2.2 ? 13 : 10;
    const target = Math.min(production, spine + maxLift);
    spine = spine * 0.3 + target * 0.7;
    productionLift = true;
  }

  // Attributes only flavor the card (~±4). When box score already lifted the
  // spine, weight them less so speed/reb decline cannot bury Curry/LeBron.
  const attrWeight = productionLift ? 0.1 : 0.16;
  return clamp(
    Math.round(spine * (1 - attrWeight) + attrBlend * attrWeight),
    25,
    99
  );
}

export const ATTRIBUTE_GROUPS: Array<{
  label: string;
  keys: Array<keyof GmAttributes>;
}> = [
  {
    label: "Finishing",
    keys: ["closeShot", "drivingLayup", "drivingDunk", "standingDunk", "postControl"],
  },
  { label: "Shooting", keys: ["midrange", "threePoint", "freeThrow"] },
  { label: "Playmaking", keys: ["passAccuracy", "ballHandle", "speedWithBall"] },
  {
    label: "Defense",
    keys: ["interiorDefense", "perimeterDefense", "steal", "block"],
  },
  { label: "Rebounding", keys: ["offReb", "defReb"] },
  {
    label: "Physical",
    keys: ["speed", "agility", "strength", "vertical", "stamina"],
  },
];

export const ATTRIBUTE_LABEL: Record<keyof GmAttributes, string> = {
  closeShot: "Close",
  drivingLayup: "Layup",
  drivingDunk: "Dunk",
  standingDunk: "Stand dunk",
  postControl: "Post",
  midrange: "Mid",
  threePoint: "Three",
  freeThrow: "FT",
  passAccuracy: "Pass",
  ballHandle: "Handle",
  speedWithBall: "SwB",
  interiorDefense: "Interior",
  perimeterDefense: "Perimeter",
  steal: "Steal",
  block: "Block",
  offReb: "OReb",
  defReb: "DReb",
  speed: "Speed",
  agility: "Agility",
  strength: "Strength",
  vertical: "Vertical",
  stamina: "Stamina",
};

export function buildSheet(player: GmPlayer, hint?: SheetStatHint): GmSheet {
  const rng = createRng(hashId(player.id));
  const { ratings, position, age } = player;
  // Attribute floor tracks DARKO so shotmaking / defense cards match the OVR.
  const anchor = clamp(66 + ratings.offense * 1.3, 48, 84);
  const big = position === "C" || position === "PF";
  const guard = position === "PG" || position === "SG";
  const size = big ? 1 : guard ? -1 : 0;
  const jitter = () => (rng() - 0.5) * 3;
  const bump = (raw: number, limit = 12) => clamp(raw, -limit, limit);

  const shrink = (value: number | undefined, attempts: number | undefined, mean: number, strength: number) => value == null ? undefined : attempts == null ? value : (value * attempts + mean * strength) / (attempts + strength);
  const threePct = shrink(hint?.threePct, hint?.threeAttempts, 0.35, 100);
  const ftPct = shrink(hint?.ftPct, hint?.freeThrowAttempts, big ? 0.73 : 0.8, 35);
  const fgPct = hint?.fgPct;
  const threeRate = hint?.threeRate;
  const threeNudge =
    threePct != null && threePct > 0 ? bump((threePct - 0.36) * 40, 14) : 0;
  const ftNudge = ftPct != null && ftPct > 0 ? bump((ftPct - 0.78) * 45, 22) : 0;
  const finishNudge =
    hint?.twoPct != null ? bump((hint.twoPct - 0.52) * 65, 18) : bump((ratings.finishing - 55) * 0.4, 15);
  const ageTax = age >= 33 ? (age - 32) * 2 : 0;
  const noThree = threeRate != null && threeRate < 0.08;
  const orbPct = asPercentPoints(hint?.orbPct);
  const drbPct = asPercentPoints(hint?.drbPct);
  const blkPct = asPercentPoints(hint?.blkPct);
  const stlPct = asPercentPoints(hint?.stlPct);
  const astPct = asPercentPoints(hint?.astPct);
  const rimFinisher = noThree && fgPct != null && fgPct >= 0.6;
  const rated = (measured: number | undefined, fallback: number) => {
    if (measured == null || !Number.isFinite(measured)) return band(fallback + jitter());
    if (measured >= 97) return band(measured);
    return band(measured + jitter() * 0.35);
  };

  const attributes: GmAttributes = {
    closeShot: rated(
      rimFinisher ? scale(fgPct!, [[0.6, 82], [0.7, 90], [0.8, 97]]) : undefined,
      anchor + (big ? 4 : 1) + finishNudge
    ),
    drivingLayup: band(anchor + (guard ? 3 : 0) + finishNudge + jitter()),
    drivingDunk: band((guard ? 60 : 72) - ageTax + jitter()),
    standingDunk: rated(
      rimFinisher ? scale(fgPct!, [[0.6, 80], [0.7, 88], [0.8, 96]]) : undefined,
      anchor + size * 8
    ),
    postControl: band(anchor + (position === "C" ? 8 : position === "PG" ? -14 : size * 6) + jitter()),
    midrange: band(58 + ratings.offense * 1.5 + (ftPct == null ? 0 : (ftPct - 0.75) * 45) + jitter()),
    threePoint: rated(
      noThree || threePct == null || threePct <= 0
        ? noThree
          ? 30
          : undefined
        : scale(threePct, THREE_STOPS),
      anchor + (big ? -12 : guard ? 3 : 1) + threeNudge
    ),
    freeThrow: rated(
      ftPct != null && ftPct > 0 ? scale(ftPct, FT_STOPS) : undefined,
      anchor + (big ? -2 : 2) + ftNudge
    ),
    passAccuracy: rated(
      astPct != null ? scale(astPct, AST_STOPS) : undefined,
      anchor + (position === "PG" ? 6 : position === "C" ? -10 : 0) + bump((hint?.apg ?? 3) - 3, 10)
    ),
    ballHandle: band((position === "PG" ? 76 : position === "C" ? 42 : guard ? 69 : 61) + Math.min(14, (hint?.apg ?? 2) * 2) - ageTax * 0.4 + jitter()),
    speedWithBall: band((guard ? 77 : position === "C" ? 49 : 67) - ageTax + jitter()),
    interiorDefense: band(62 + size * 10 + bump(ratings.defense * 5, 22) + jitter()),
    perimeterDefense: band(65 + (guard ? 5 : big ? -12 : 0) + bump(ratings.defense * 5, 22) + jitter()),
    steal: rated(
      stlPct != null ? scale(stlPct, STL_STOPS) : undefined,
      anchor + (guard ? 3 : -4) + bump(((hint?.spg ?? 0.8) - 0.9) * 10, 10)
    ),
    block: rated(
      blkPct != null ? scale(blkPct, BLK_STOPS) : undefined,
      anchor + (position === "C" ? 12 : size * 6) + bump(((hint?.bpg ?? 0.4) - 0.5) * 14, 12)
    ),
    offReb: rated(
      orbPct != null ? scale(orbPct, ORB_STOPS) : undefined,
      anchor - 8 + size * 10 + bump(((hint?.rpg ?? 4) - 5) * 1.2, 8)
    ),
    defReb: rated(
      drbPct != null ? scale(drbPct, DRB_STOPS) : undefined,
      anchor + size * 8 + bump(((hint?.rpg ?? 4) - 5) * 1.5, 10)
    ),
    speed: band((big ? 62 : guard ? 80 : 73) - ageTax + jitter()),
    agility: band((big ? 59 : guard ? 79 : 73) - ageTax + jitter()),
    strength: band(58 + (player.weightLbs - 190) * 0.32 + jitter()),
    vertical: band((big ? 67 : 72) - ageTax * 0.8 + jitter()),
    stamina: band(75 + bump(((hint?.mpg ?? 24) - 28) * 0.7, 10) - ageTax * 0.4),
  };

  const overall = overallFromAttributes(position, attributes, {
    impact: ratings.impact,
    drbl100: player.drbl100,
    mpg: hint?.mpg,
    ppg: hint?.ppg,
    apg: hint?.apg,
    rpg: hint?.rpg,
  });
  const tendencies: GmTendencies = {
    shootClose: tend(big ? 62 : 38 + (100 - attributes.threePoint) * 0.15),
    shootMid: tend(48 + (attributes.midrange - 70) * 0.4),
    shootThree: tend(
      threeRate != null ? threeRate * 100 : Math.max(0, (attributes.threePoint - 30) * 0.9)
    ),
    drive: tend(attributes.ballHandle * 0.75 + (guard ? 10 : -8)),
    postUp: tend(attributes.postControl * 0.8 + (big ? 8 : -20)),
    dish: tend(30 + attributes.passAccuracy * 0.45 + (hint?.apg ?? 0) * 3),
    flashyPass: tend(attributes.ballHandle * 0.35 + (position === "PG" ? 8 : 0)),
    steal: tend(20 + attributes.steal * 0.45),
    block: tend(15 + attributes.block * 0.5),
    crashOffensive: tend(25 + attributes.offReb * 0.4),
    foul: tend(28 + (100 - ratings.durability) * 0.2),
  };

  const upside = clamp(ratings.potential, 0, 10);
  // Peak is mostly about potential, not "years left * 2.2". The old formula
  // handed 95–99 ceilings to half the draft and the league filled with stars.
  // Cold current impact must not pin a high-upside kid's ceiling to "finished".
  const yearsLeft = Math.max(0, (big ? 26 : 24) - age);
  const ceilingBase =
    age <= 22 && upside >= 6.5 ? Math.max(overall, 74) : overall;
  let ceilingRaw =
    ceilingBase + upside * 1.35 + yearsLeft * (age <= 21 ? 0.7 : 0.4);
  if (upside < 7 && ceilingRaw > 86) ceilingRaw = 86 + (ceilingRaw - 86) * 0.3;
  if (upside < 8.3 && ceilingRaw > 90) ceilingRaw = 90 + (ceilingRaw - 90) * 0.35;
  if (upside < 9.2 && ceilingRaw > 94) ceilingRaw = 94 + (ceilingRaw - 94) * 0.3;
  const ceiling = band(Math.min(98, Math.max(overall, ceilingRaw)));
  // Draft-age profile: kids keep a soft floor (bust risk); seniors sit closer
  // to what they already are (sure things with less rocket fuel).
  const draftKid = Boolean(player.draftYear) && age <= 23;
  const floorGap =
    age <= 19 ? 8 : age <= 20 ? 7 : age <= 21 ? 5 : age <= 23 ? 3 : age >= 29 ? 2 : 4;
  const floor = band(
    Math.min(overall, overall - floorGap - (10 - upside) * (draftKid && age <= 20 ? 0.55 : 0.35))
  );
  let boom = clamp(
    Math.round(
      14 +
        upside * 3.2 +
        (age <= 18 ? 18 : age <= 19 ? 14 : age <= 20 ? 10 : age <= 21 ? 4 : age >= 23 ? -6 : 0)
    ),
    6,
    65
  );
  let bust = clamp(
    Math.round(
      22 -
        upside * 1.15 +
        (age <= 18 ? 16 : age <= 19 ? 12 : age <= 20 ? 8 : age >= 23 && age <= 25 ? -8 : 0) +
        (age >= 29 ? 12 : 0)
    ),
    6,
    55
  );
  let average = 100 - boom - bust;
  if (average < 10) {
    const scale = 90 / (boom + bust);
    boom = Math.round(boom * scale);
    bust = Math.round(bust * scale);
    average = 100 - boom - bust;
  }
  const trait = rollDevTrait(
    player,
    overall,
    ratings.potential,
    rng
  );
  const path: GmDevPath = pathFromTrait(trait);
  // Keep the probability bands aligned with the trait so old UI still reads.
  if (trait === "xfactor" || trait === "superstar") {
    boom = Math.max(boom, trait === "xfactor" ? 55 : 42);
    bust = Math.min(bust, 12);
    average = 100 - boom - bust;
  } else if (trait === "star") {
    boom = Math.max(boom, 28);
    average = 100 - boom - bust;
  } else if (trait === "bust") {
    bust = Math.max(bust, 40);
    boom = Math.min(boom, 12);
    average = 100 - boom - bust;
  }
  const peakStart = age <= 23 ? (big ? 26 : 24) : Math.min(age, 29);
  const peakEnd = peakStart + (ratings.durability >= 80 ? 8 : 6);
  const potential: GmPotential = {
    floor: Math.min(floor, overall),
    ceiling: Math.max(ceiling, overall),
    boom,
    average,
    bust,
    path,
    trait,
    peakStart,
    peakEnd,
  };

  const overallOffset = overall - overallFromAttributes(position, attributes, { impact: ratings.impact, drbl100: player.drbl100 });
  return { version: SHEET_VERSION, overall, overallOffset, attributes, tendencies, potential };
}

export function hintFromCounting(line?: GmCountingLine): SheetStatHint | undefined {
  if (!line || line.gp < 1) return undefined;
  return {
    twoPct: line.fga > line.tpa ? (line.fgm - line.tpm) / (line.fga - line.tpa) : undefined,
    twoAttempts: Math.max(0, line.fga - line.tpa),
    threeAttempts: line.tpa,
    freeThrowAttempts: line.fta,
    threeRate: line.fga > 0 ? line.tpa / line.fga : 0,
    threePct: line.tpa > 0 ? line.tpm / line.tpa : undefined,
    ftPct: line.fta > 0 ? line.ftm / line.fta : undefined,
    fgPct: line.fga > 0 ? line.fgm / line.fga : undefined,
    mpg: line.min / line.gp,
    ppg: line.pts / line.gp,
    rpg: line.reb / line.gp,
    apg: line.ast / line.gp,
    spg: line.stl / line.gp,
    bpg: line.blk / line.gp,
    orbPct: line.orbPct,
    drbPct: line.drbPct,
    blkPct: line.blkPct,
    stlPct: line.stlPct,
    astPct: line.astPct,
  };
}

/** 2025-26 saves stored totals without the rebound split. Fill the rates by name. */
function definedHint(hint: SheetStatHint): SheetStatHint {
  return Object.fromEntries(
    Object.entries(hint).filter(([, value]) => value != null)
  ) as SheetStatHint;
}

export function sheetHint(player: GmPlayer, hint?: SheetStatHint): SheetStatHint {
  const fromLine = hintFromCounting(player.nbaSeason) ?? {};
  const season = player.nbaSeason?.season;
  const useEntry = season == null || season === "2025-26";
  const saved = useEntry ? ENTRY_RATES[rateKey(player.name)] : undefined;
  return {
    ...definedHint({
      orbPct: saved?.orb,
      drbPct: saved?.drb,
      blkPct: saved?.blk,
      stlPct: saved?.stl,
      astPct: saved?.ast,
    }),
    ...definedHint(fromLine),
    ...definedHint(hint ?? {}),
  };
}

export function playerSheet(player: GmPlayer, hint?: SheetStatHint): GmSheet {
  const resolved = sheetHint(player, hint);
  if (player.sheet) {
    // Reconcile trait floors (production / discourse) without rebuilding ratings.
    return {
      ...player.sheet,
      version: SHEET_VERSION,
      overallOffset: player.sheet.overallOffset ?? player.sheet.overall - overallFromAttributes(player.position, player.sheet.attributes, { impact: player.ratings.impact, drbl100: player.drbl100 }),
      potential: ensurePotentialTrait(player.sheet.potential, player),
    };
  }
  return buildSheet(player, resolved);
}

/** Older saves have no sheet, or a sheet from an earlier formula. */
export function ensurePlayerSheet(player: GmPlayer): GmPlayer {
  if (player.sheet?.version === SHEET_VERSION) return player;
  return { ...player, sheet: playerSheet(player) };
}

function addKeys(
  attributes: GmAttributes,
  keys: Array<keyof GmAttributes>,
  delta: number
): GmAttributes {
  const next = { ...attributes };
  for (const key of keys) {
    next[key] = band(next[key] + delta);
  }
  return next;
}

/**
 * Population aging for a per-possession impact, at the age the player just turned.
 * Wings peak around 27. Bigs are looked up one year younger, so their peak sits later.
 * Gains run through the early 20s, the late 20s are flat, and the drop steepens after 32.
 */
function agingBase(age: number): number {
  if (age <= 20) return 0.24;
  if (age <= 22) return 0.18;
  if (age <= 24) return 0.1;
  if (age <= 26) return 0.04;
  if (age <= 28) return 0;
  if (age <= 30) return -0.08;
  if (age === 31) return -0.16;
  if (age === 32) return -0.22;
  if (age === 33) return -0.3;
  if (age === 34) return -0.38;
  return -0.48;
}

type DevelopmentOptions = {
  coach?: number; minutes?: number; pace?: "season" | "summer"; form?: number;
  playoffGames?: number; devStaff?: number; speed?: number;
};

/** Fractional development avoids a free whole attribute at every check-in. */
function progressDevelopmentPath(player:GmPlayer, sheet:GmSheet, opts:DevelopmentOptions):GmPlayer {
  const potential=sheet.potential,age=player.age,gap=Math.max(0,potential.ceiling-sheet.overall);
  const minutes=Math.max(0,opts.minutes??0),coach=clamp(opts.coach??0,0,1.5);
  const rng=createRng(hashId(player.id+":"+(opts.pace??"summer"))+age*997);
  const reasons:string[]=[];
  const ageFactor=age<=21?1.08:age<=23?0.95:age<=25?0.86:age<=27?0.58:0.25;
  let path=potential.path==="boom"?1.45:potential.path==="bust"?0.2:1;
  if(potential.path==="bust"&&age>=22&&age<=25&&rng()<0.08) {path=0.85;reasons.push("A better development stretch after a slow start");}
  else if(potential.path==="average"&&age<=25&&player.personality>=10&&rng()<0.1) {path=1.45;reasons.push("A productive development stretch");}
  const trait=potential.trait==="xfactor"?1.25:potential.trait==="superstar"?1.18:potential.trait==="star"?1.08:potential.trait==="bust"?0.65:1;
  let opportunity=0.72+Math.min(minutes,24)/24*0.4;
  if(player.developmentPlan==="practice") {opportunity=minutes<18?0.94+coach*0.05:0.91;reasons.push("Skills work preserves a path while rotation minutes are limited");}
  else if(player.developmentPlan==="rotation") {opportunity=0.5+Math.min(minutes,26)/26*0.7;reasons.push(minutes>=16?"Regular game reps support the role plan":"The rotation plan needs more game reps");}
  if(minutes>34) {opportunity*=0.94;reasons.push("Heavy minutes add workload, not extra development credit");}
  if(player.injury) {opportunity*=0.72;reasons.push("Injury limited development work");}
  const staff=(1+coach*0.06)*clamp(opts.devStaff??1,0.85,1.25);
  const work=1+clamp(player.personality,-20,25)*0.004;
  const annual=clamp((0.9+gap*0.14)*ageFactor*path*trait*opportunity*staff*work*(0.85+rng()*0.3),0,5.5);
  const pace=opts.pace==="season"?0.15:0.7;
  const budget=annual*pace*clamp(opts.speed??1,0.5,2)+(sheet.developmentCarry??0);
  const steps=Math.min(Math.max(0,potential.ceiling-sheet.overall),Math.floor(budget));
  const carry=gap>0?budget-Math.floor(budget):0;
  const focusKeys:Record<string,Array<keyof GmAttributes>>={shooting:["threePoint","midrange","freeThrow"],creation:["passAccuracy","ballHandle","speedWithBall","drivingLayup"],defense:["interiorDefense","perimeterDefense","steal","block"],rebounding:["offReb","defReb","strength"]};
  const keys=focusKeys[player.developmentFocus??"balanced"]??GROW_KEYS[player.position];
  const attributes={...sheet.attributes},gains:string[]=[];
  for(const key of keys) {
    const before=attributes[key];attributes[key]=band(before+Math.ceil(steps*1.5));
    if(attributes[key]>before) gains.push(ATTRIBUTE_LABEL[key]+" +"+(attributes[key]-before));
  }
  if(steps&&age<=21) for(const key of ["strength","stamina"] as const) attributes[key]=band(attributes[key]+1);
  const offset=sheet.overallOffset??sheet.overall-overallFromAttributes(player.position,sheet.attributes,{impact:player.ratings.impact,drbl100:player.drbl100});
  const target=Math.min(potential.ceiling,sheet.overall+steps);
  let low=player.ratings.impact,high=Math.min(10,low+steps*0.7);
  for(let pass=0;pass<18&&steps;pass++) {
    const middle=(low+high)/2;
    if(offset+overallFromAttributes(player.position,attributes,{impact:middle,drbl100:player.drbl100})<target) low=middle; else high=middle;
  }
  const impact=steps?Math.round(high*100)/100:player.ratings.impact;
  const overall=clamp(offset+overallFromAttributes(player.position,attributes,{impact,drbl100:player.drbl100}),25,potential.ceiling);
  const delta=impact-player.ratings.impact;
  const offenseShare=player.developmentFocus==="defense"?0.15:player.developmentFocus==="rebounding"?0.35:0.75;
  if(gap<=2) reasons.push("Limited headroom slows further gains");
  else reasons.push(age<=23?"Young player with skills still to develop":"Growth slows as the player approaches his prime");
  if(!steps&&gap>2) reasons.push("Small gains accumulate between reports");
  return {...player,sheet:{...sheet,attributes,overall,overallOffset:offset,priorOverall:sheet.overall,priorSimple:simpleCategoryMeans(sheet.attributes),developmentCarry:carry,developmentReport:{age,before:sheet.overall,after:overall,reasons,gains}},ratings:{...player.ratings,impact,offense:Math.round((player.ratings.offense+delta*offenseShare)*100)/100,defense:Math.round((player.ratings.defense+delta*(1-offenseShare))*100)/100}};
}

/** One offseason. Age on the player is the age they just turned. */
export function progressSheet(
  player: GmPlayer,
  opts?: DevelopmentOptions
): GmPlayer {
  player = ensureSimProfile(ensurePlayerSheet(player));
  const sheet = player.sheet ?? buildSheet(player);
  if((player.draftModel===2||player.developmentPlan)&&player.age<=28) return progressDevelopmentPath(player,sheet,opts??{});
  const { potential } = sheet;
  const age = player.age;
  const big = player.position === "C" || player.position === "PF";
  const minutes = opts?.minutes ?? player.minutesPreference ?? 24;
  const coach = opts?.coach ?? 0;
  const devStaff = opts?.devStaff ?? 1;
  const rng = createRng(hashId(player.id) + age * 997);
  let delta = agingBase(big ? age - 1 : age);
  const traitMul = traitGrowthMul(potential.trait);
  if (delta > 0) {
    const pathMul = potential.path === "boom" ? 1.85 : potential.path === "bust" ? 0.25 : 1;
    const minuteMul = clamp(minutes / 26, 0.55, 1.15);
    const coachMul = 1 + clamp(coach, 0, 1.5) * 0.08;
    const work = player.personality > 15 ? 1.08 : player.personality < -15 ? 0.92 : 1;
    delta *= pathMul * traitMul * minuteMul * coachMul * work * clamp(devStaff, 0.85, 1.25);
    if (potential.path === "bust") delta *= 0.5;
    // Slow down once a player has already grabbed most of their realistic peak.
    // Stops mid-tier books from all drifting into the 80s over a long save.
    const span = Math.max(6, potential.ceiling - potential.floor);
    const progress = (sheet.overall - potential.floor) / span;
    if (progress > 0.55) delta *= clamp(1.15 - progress, 0.25, 1);
    if (
      sheet.overall >= 78 &&
      (potential.trait === "normal" || potential.trait === "bust")
    ) {
      delta *= 0.4;
    }
  } else {
    const pathMul = potential.path === "boom" ? 0.7 : potential.path === "bust" ? 1.3 : 1;
    const durable =
      player.ratings.durability >= 80 ? 0.8 : player.ratings.durability < 55 ? 1.25 : 1;
    // Elite traits hang onto their prime longer.
    const declineMul =
      potential.trait === "xfactor" || potential.trait === "superstar" ? 0.78 : 1;
    // Ordinary players fall a bit faster so the league mean does not creep up.
    const roleDecline =
      potential.trait === "normal" || potential.trait === "bust" ? 1.12 : 1;
    // PD knack < 1 softens decline (vet whisperer); > 1 is unused on the way down.
    delta *= pathMul * durable * declineMul * roleDecline * clamp(devStaff, 0.8, 1.05);
  }
  if (
    (potential.path === "boom" ||
      potential.trait === "star" ||
      potential.trait === "superstar" ||
      potential.trait === "xfactor") &&
    age >= 25 &&
    age <= 28
  ) {
    delta += potential.trait === "xfactor" ? 0.08 : potential.trait === "superstar" ? 0.06 : 0.04;
  }
  delta += (rng() - 0.5) * 0.08;
  if (delta > 0 && sheet.overall >= potential.ceiling) delta = 0;
  if (delta > 0 && potential.path === "bust" && sheet.overall <= potential.floor + 1) delta = 0;
  delta = clamp(delta * clamp(opts?.speed ?? 1, 0.5, 2), -0.7, 0.65);
  if (opts?.pace === "season") {
    delta = delta > 0 ? delta * 0.32 : delta * 0.12;
    delta += clamp(opts?.form ?? 0, -0.04, 0.06);
    delta = clamp(delta, -0.16, 0.2);
  } else if ((opts?.playoffGames ?? 0) >= 4 && age <= potential.peakEnd && delta > -0.15) {
    delta = clamp(delta + ((opts?.playoffGames ?? 0) >= 12 ? 0.05 : 0.03), -0.7, 0.62);
  }

  const ticks =
    opts?.pace === "season"
      ? delta >= 0.05
        ? 1
        : delta <= -0.08
          ? -1
          : 0
      : delta >= 0.22
        ? 2
        : delta >= 0.09
          ? 1
          : delta <= -0.4
            ? -3
            : delta <= -0.2
              ? -2
              : delta <= -0.08
                ? -1
                : 0;
  let attributes = sheet.attributes;
  const focusKeys: Record<string, Array<keyof GmAttributes>> = { shooting: ["threePoint", "midrange", "freeThrow"], creation: ["passAccuracy", "ballHandle", "drivingLayup"], defense: ["interiorDefense", "perimeterDefense", "steal", "block"], rebounding: ["offReb", "defReb", "strength"] };
  if (ticks > 0) attributes = addKeys(attributes, focusKeys[player.developmentFocus ?? "balanced"] ?? GROW_KEYS[player.position], ticks);
  if (ticks < 0) {
    attributes = addKeys(attributes, DECLINE_KEYS, ticks);
    if (age >= 33) {
      attributes = addKeys(
        attributes,
        ["drivingLayup", "drivingDunk", "ballHandle", "speedWithBall"],
        Math.min(-1, Math.round(ticks / 2))
      );
    }
  }
  const offenseShare = player.developmentFocus === "shooting" || player.developmentFocus === "creation" ? 0.9 : player.developmentFocus === "defense" ? 0.15 : player.developmentFocus === "rebounding" ? 0.35 : delta > 0 ? 0.62 : 0.45;
  // Impact tracks development, but at a damped rate so long saves do not
  // turn every rotation guy into a +1.5 board name.
  const impactDelta = delta * (delta > 0 ? 0.45 : 0.7);
  const nextImpact = clamp(
    Math.round((player.ratings.impact + impactDelta) * 100) / 100,
    -4,
    10
  );
  const overallOffset = sheet.overallOffset ?? sheet.overall - overallFromAttributes(player.position, sheet.attributes, { impact: player.ratings.impact, drbl100: player.drbl100 });
  const overall = clamp(overallOffset + overallFromAttributes(player.position, attributes, {
    impact: nextImpact,
    drbl100: player.drbl100,
  }), 25, 99);
  return {
    ...player,
    sheet: {
      ...sheet,
      overall,
      overallOffset,
      attributes,
      priorOverall: sheet.overall,
      priorSimple: simpleCategoryMeans(sheet.attributes),
    },
    ratings: {
      ...player.ratings,
      impact: nextImpact,
      offense: clamp(
        Math.round((player.ratings.offense + impactDelta * offenseShare) * 100) / 100,
        -5,
        12
      ),
      defense: clamp(
        Math.round((player.ratings.defense + impactDelta * (1 - offenseShare)) * 100) / 100,
        -5,
        10
      ),
    },
  };
}

