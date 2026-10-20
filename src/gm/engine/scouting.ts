import type {
  GmDevTrait,
  GmLeagueState,
  GmPlayer,
  GmPosition,
  GmRatings,
  ProspectArchetypeId,
  ScoutLetterGrade,
  ScoutProfile,
  ScoutedRatings,
} from "@/gm/types";
import { playerSheet } from "@/gm/engine/attributes";
import { playerDevTrait, traitLabel } from "@/gm/engine/dev-traits";
import { clamp, createRng, pick, randInt } from "@/gm/engine/rng";
import {
  archetypeLabel,
  assignProspectIdentity,
  codenameDef,
  detectArchetype,
} from "@/gm/seed/prospect-identities";
import type { GmScout } from "@/gm/seed/scouts";
import {
  defaultTeamScout,
  effectiveScoutLevel,
  ensureScoutKnack,
  expertiseLabel,
  generateScoutMarket,
  scoutMatchBonus,
} from "@/gm/seed/scouts";
import { scoutKnackPreferredFocus } from "@/gm/seed/staff-knacks";

type CompTier = "elite" | "starter" | "fringe";

/** Ordered tiers per mold. Ceiling picks from the high end; floor stays below. */
const NBA_COMPS: Record<
  ProspectArchetypeId,
  Record<CompTier, string[]>
> = {
  splash: {
    elite: ["Stephen Curry", "Klay Thompson", "Devin Booker"],
    starter: ["Desmond Bane", "Buddy Hield", "Norman Powell"],
    fringe: ["Duncan Robinson", "Grayson Allen", "Gary Harris"],
  },
  paint_beast: {
    elite: ["Giannis Antetokounmpo", "Zion Williamson", "Bam Adebayo"],
    starter: ["Aaron Gordon", "Jaren Jackson Jr.", "John Collins"],
    fringe: ["Jabari Parker", "Kevon Looney", "Daniel Theis"],
  },
  rim_protector: {
    elite: ["Rudy Gobert", "Anthony Davis", "Brook Lopez"],
    starter: ["Myles Turner", "Jakob Poeltl", "Isaiah Hartenstein"],
    fringe: ["Mo Bamba", "Jalen Duren", "Nick Richards"],
  },
  stretch_big: {
    elite: ["Kristaps Porzingis", "Karl-Anthony Towns", "Lauri Markkanen"],
    starter: ["Bobby Portis", "PJ Washington", "Naz Reid"],
    fringe: ["Kelly Olynyk", "Maxi Kleber", "Dario Saric"],
  },
  floor_general: {
    elite: ["Chris Paul", "Jrue Holiday", "Tyrese Haliburton"],
    starter: ["Mike Conley", "Derrick White", "Immanuel Quickley"],
    fringe: ["Cory Joseph", "Delon Wright", "Pat Connaughton"],
  },
  pass_first: {
    elite: ["Nikola Jokic", "Trae Young", "Tyrese Haliburton"],
    starter: ["Fred VanVleet", "Tyus Jones", "D'Angelo Russell"],
    fringe: ["Facundo Campazzo", "Monte Morris", "T.J. McConnell"],
  },
  combo_guard: {
    elite: ["James Harden", "Shai Gilgeous-Alexander", "Donovan Mitchell"],
    starter: ["CJ McCollum", "Anfernee Simons", "Jordan Poole"],
    fringe: ["Jordan Clarkson", "Malik Monk", "Bennedict Mathurin"],
  },
  iso_scorer: {
    elite: ["Kevin Durant", "Kawhi Leonard", "Paul George"],
    starter: ["Brandon Ingram", "Jerami Grant", "Michael Porter Jr."],
    fringe: ["Bojan Bogdanovic", "Harrison Barnes", "Buddy Hield"],
  },
  two_way_wing: {
    elite: ["Kawhi Leonard", "OG Anunoby", "Mikal Bridges"],
    starter: ["Herbert Jones", "Dillon Brooks", "Ausar Thompson"],
    fringe: ["Torrey Craig", "Kenrich Williams", "Josh Okogie"],
  },
  three_and_d: {
    elite: ["OG Anunoby", "Derrick White", "Aaron Gordon"],
    starter: ["Alex Caruso", "Lu Dort", "Donte DiVincenzo"],
    fringe: ["Landry Shamet", "Gabe Vincent", "Nassir Little"],
  },
  athletic_freak: {
    elite: ["Ja Morant", "Anthony Edwards", "Jaylen Brown"],
    starter: ["Scottie Barnes", "Jalen Green", "Amen Thompson"],
    fringe: ["Hamidou Diallo", "Thanasis Antetokounmpo", "Oshae Brissett"],
  },
  glue_guy: {
    elite: ["Draymond Green", "Jrue Holiday", "Dillon Brooks"],
    starter: ["Alex Caruso", "Marcus Smart", "Josh Hart"],
    fringe: ["P.J. Tucker", "Patrick Beverley", "Kenrich Williams"],
  },
};

const TIER_RANK: Record<CompTier, number> = { elite: 2, starter: 1, fringe: 0 };

function lowerTier(tier: CompTier): CompTier {
  if (tier === "elite") return "starter";
  return "fringe";
}

/**
 * Board + tools set the ceiling tier. High upside kids stay in elite/starter;
 * fringe names never become a lottery ceiling.
 */
function ceilingTierForProspect(
  boardIndex: number,
  impact: number,
  potential: number,
  scoutLevel: number,
  rng: () => number
): CompTier {
  const lottery = boardIndex <= 13;
  const mid = boardIndex <= 29;
  const tools = impact * 1.2 + potential * 0.55;
  let tier: CompTier =
    lottery || tools >= 9.5
      ? "elite"
      : mid || tools >= 6.5
        ? "starter"
        : tools >= 4.2
          ? "starter"
          : "fringe";
  // Weak eyes can miss one tier down — never dump elite into fringe.
  if (scoutLevel < 2.6 && rng() < 0.35 && tier !== "fringe") {
    tier = lowerTier(tier);
  }
  return tier;
}

function pickCompPair(
  mold: ProspectArchetypeId,
  boardIndex: number,
  player: GmPlayer,
  scoutLevel: number,
  rng: () => number
): { ceiling: string; floor: string; ceilingTier: CompTier; floorTier: CompTier } {
  const pool = NBA_COMPS[mold] ?? NBA_COMPS.glue_guy;
  const wrongMold =
    scoutLevel < 3 && rng() < 0.28
      ? (Object.keys(NBA_COMPS) as ProspectArchetypeId[])[
          randInt(rng, 0, Object.keys(NBA_COMPS).length - 1)
        ]!
      : mold;
  const compPool = NBA_COMPS[wrongMold] ?? pool;
  const ceilTier = ceilingTierForProspect(
    boardIndex,
    player.ratings.impact,
    player.ratings.potential,
    scoutLevel,
    rng
  );
  // Prefer the high end within the tier (first names are the headline comps).
  const ceilPool = compPool[ceilTier];
  const ceilBias = Math.min(ceilPool.length - 1, Math.floor(rng() * rng() * ceilPool.length));
  let ceiling = ceilPool[ceilBias] ?? ceilPool[0]!;

  let floorTier: CompTier =
    ceilTier === "elite" ? (rng() < 0.55 ? "starter" : "fringe") : "fringe";
  if (TIER_RANK[floorTier] >= TIER_RANK[ceilTier]) {
    floorTier = lowerTier(ceilTier);
  }
  const floorPool = compPool[floorTier];
  let floor = pick(rng, floorPool);

  if (scoutLevel < 1.6) {
    ceiling = `Maybe ${ceiling}?`;
    floor = "Tape is too thin";
  } else if (scoutLevel < 2.2 && rng() < 0.25) {
    ceiling = `Maybe ${ceiling}?`;
  }

  return { ceiling, floor, ceilingTier: ceilTier, floorTier };
}

/** Exposed for tests — fringe names that must not top a lottery ceiling. */
export function fringeCompNames(mold: ProspectArchetypeId): string[] {
  return [...(NBA_COMPS[mold] ?? NBA_COMPS.glue_guy).fringe];
}

const GRADE_SCALE: ScoutLetterGrade[] = [
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
];

/** Letter grades ≈ projected NBA tool vs an average rotation player. */
export const GRADE_LEGEND: { grade: string; meaning: string }[] = [
  { grade: "A+ / A", meaning: "Elite NBA tool: star / All-NBA caliber in that skill" },
  { grade: "A- / B+", meaning: "Plus starter skill: clear strength on a good roster" },
  { grade: "B / B-", meaning: "Solid NBA average: holds up as a rotation piece" },
  { grade: "C+ / C", meaning: "Fringe / below-average: needs scheme or limited role" },
  { grade: "C- / D / F", meaning: "Well below NBA average: major weakness or non-translator" },
];

export function gradeMeaning(g: ScoutLetterGrade | null | undefined): string {
  if (!g) return "Scout hasn’t graded this tool yet (fog).";
  if (g === "A+" || g === "A") return "Elite NBA-level tool";
  if (g === "A-" || g === "B+") return "Plus starter skill";
  if (g === "B" || g === "B-") return "Solid NBA average";
  if (g === "C+" || g === "C") return "Below-average / fringe";
  return "Well below NBA average";
}

function ratingToGrade(value0to100: number, noise: number): ScoutLetterGrade {
  const v = clamp(value0to100 + noise, 0, 100);
  const idx = Math.round((v / 100) * (GRADE_SCALE.length - 1));
  return GRADE_SCALE[clamp(idx, 0, GRADE_SCALE.length - 1)]!;
}

function impactToUpsideGrade(impact: number, potential: number, noise: number): ScoutLetterGrade {
  const score = clamp((impact + 3) * 10 + potential * 6 + noise, 0, 100);
  return ratingToGrade(score, 0);
}

type GradeFocus =
  | "overall"
  | "offense"
  | "defense"
  | "shooting"
  | "creation"
  | "athleticism"
  | "feel";

function focusLevel(
  baseLevel: number,
  scout: GmScout | null | undefined,
  position: GmPosition,
  focus: GradeFocus,
  player?: GmPlayer | null
): number {
  const bonus = scoutMatchBonus(scout, position, focus, player);
  return clamp(baseLevel + bonus, 1, 5);
}

function fogGrade(
  grade: ScoutLetterGrade,
  level: number,
  rng: () => number
): ScoutLetterGrade | null {
  if (level <= 1.4 && rng() < 0.45) return null;
  if (level < 2.4 && rng() < 0.25) return null;
  if (level >= 4.2) return grade;
  const idx = GRADE_SCALE.indexOf(grade);
  const drift = randInt(rng, -2, 2) - Math.max(0, 3 - Math.floor(level));
  return GRADE_SCALE[clamp(idx + drift, 0, GRADE_SCALE.length - 1)]!;
}

const MEDICAL_NOTES = [
  "Clean medical so far; trainers like the load profile.",
  "Minor ankle history; nothing that scares most boards.",
  "Conditioning flag after combine shuttle; worth a closer look.",
  "Knee monitored in college; imaging reportedly clean.",
  "Durability projection is a soft concern for some staffs.",
];

const FOG_SUMMARIES = [
  "Tape is noisy: tools flash, translation still debated.",
  "High-upside skeleton with incomplete offensive polish.",
  "Role clarity is the swing skill; floor looks rotation-ready.",
  "Some teams see a star pathway; others see a specialist.",
  "Measurables check out; feel for the game is the unknown.",
];

function buildSummary(
  defFlavor: string | undefined,
  archetype: ProspectArchetypeId,
  scoutLevel: number,
  rng: () => number
): string {
  if (scoutLevel >= 4 && defFlavor) return defFlavor;
  if (scoutLevel >= 3) {
    return `${archetypeLabel(archetype)} mold. ${pick(rng, FOG_SUMMARIES)}`;
  }
  return pick(rng, FOG_SUMMARIES);
}

export function buildScoutedRatings(
  trueR: GmRatings,
  scoutLevel: number,
  rng: () => number,
  scout?: GmScout | null,
  position: GmPosition = "SF"
): ScoutedRatings {
  const level = focusLevel(scoutLevel, scout, position, "overall");
  const noiseAmp = Math.max(0.12, 2.4 - level * 0.42);
  const noise = (rng() - 0.5) * noiseAmp;
  const known = level >= 2 || rng() > 0.4;
  return {
    impact: known ? Math.round((trueR.impact + noise) * 100) / 100 : null,
    offense: known ? Math.round((trueR.offense + noise * 0.5) * 100) / 100 : null,
    defense: known ? Math.round((trueR.defense + noise * 0.5) * 100) / 100 : null,
    uncertainty: clamp(1.15 - level * 0.2, 0.08, 1),
  };
}

export function buildScoutProfile(
  player: GmPlayer,
  scoutLevel: number,
  boardIndex: number,
  rng: () => number,
  scout?: GmScout | null
): ScoutProfile {
  const position = player.position;
  const archetype =
    (player.scoutProfile?.archetypeId as ProspectArchetypeId | undefined) ??
    detectArchetype(player.ratings, position);
  const def = codenameDef(player.codename);
  const overall = focusLevel(scoutLevel, scout, position, "overall", player);
  const noise = (rng() - 0.5) * (28 - overall * 4);

  const trueGrades = {
    athleticism: ratingToGrade(
      (player.ratings.finishing + player.ratings.durability) / 2,
      noise
    ),
    shooting: ratingToGrade(player.ratings.shooting, noise),
    creation: ratingToGrade(
      (player.ratings.playmaking + player.ratings.offense * 8) / 2,
      noise
    ),
    defense: ratingToGrade(
      clamp(50 + player.ratings.defense * 8, 0, 100),
      noise
    ),
    feel: ratingToGrade(
      (player.ratings.playmaking + player.ratings.rebounding) / 2,
      noise * 0.8
    ),
    upside: impactToUpsideGrade(
      player.ratings.impact,
      player.ratings.potential,
      noise
    ),
  };

  const mold = def?.archetype ?? archetype;
  const { ceiling, floor } = pickCompPair(
    mold,
    boardIndex,
    player,
    overall,
    rng
  );
  const comps =
    overall >= 2
      ? [`Ceiling ${ceiling}`, `Floor ${floor}`]
      : overall >= 1
        ? [`Ceiling ${ceiling}`]
        : ["Unclear, need more tape"];

  const heightNoise = overall >= 4 ? 0 : randInt(rng, -2, 2);
  const weightNoise = overall >= 4 ? 0 : randInt(rng, -12, 12);

  return {
    archetypeLabel: archetypeLabel(mold),
    archetypeId: mold,
    comps,
    compCeiling: overall >= 1 ? ceiling : null,
    compFloor: overall >= 1.5 ? floor : null,
    grades: {
      athleticism: fogGrade(
        trueGrades.athleticism,
        focusLevel(scoutLevel, scout, position, "athleticism", player),
        rng
      ),
      shooting: fogGrade(
        trueGrades.shooting,
        focusLevel(scoutLevel, scout, position, "shooting", player),
        rng
      ),
      creation: fogGrade(
        trueGrades.creation,
        focusLevel(scoutLevel, scout, position, "creation", player),
        rng
      ),
      defense: fogGrade(
        trueGrades.defense,
        focusLevel(scoutLevel, scout, position, "defense", player),
        rng
      ),
      feel: fogGrade(
        trueGrades.feel,
        focusLevel(scoutLevel, scout, position, "feel", player),
        rng
      ),
      upside: fogGrade(
        trueGrades.upside,
        focusLevel(scoutLevel, scout, position, "overall", player),
        rng
      ),
    },
    heightInEstimate:
      overall >= 1 ? clamp(player.heightIn + heightNoise, 68, 90) : null,
    weightLbsEstimate:
      overall >= 2 ? clamp(player.weightLbs + weightNoise, 160, 320) : null,
    medicalNote:
      overall >= 3
        ? pick(rng, MEDICAL_NOTES)
        : overall >= 2 && rng() > 0.6
          ? "Limited medical; waiting on team workouts."
          : null,
    summary: buildSummary(def?.flavor, mold, overall, rng),
    confidence: clamp(0.2 + overall * 0.16 + (rng() * 0.08 - 0.04), 0.15, 0.95),
    boardRankHint:
      overall >= 2
        ? clamp(boardIndex + 1 + randInt(rng, -3, 4), 1, 60)
        : null,
  };
}

export type ScoutedPotential = {
  low: number;
  high: number;
  comment: string;
};

function potentialFit(
  scout: GmScout | null | undefined,
  position: GmPlayer["position"]
): number {
  if (!scout) return 0;
  let bonus = clamp(scout.yearsExperience / 50, 0, 0.25);
  const exp = scout.expertise;
  if (exp === "general") bonus += 0.35;
  if (exp === "guards" && (position === "PG" || position === "SG")) bonus += 0.7;
  if (exp === "wings" && (position === "SF" || position === "SG" || position === "PF")) bonus += 0.65;
  if (exp === "bigs" && (position === "C" || position === "PF")) bonus += 0.7;
  if (exp === "international") bonus += 0.2;
  if (exp === "defense" || exp === "offense") bonus += 0.12;
  return bonus;
}

function nameSeed(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function scoutClarity(
  player: GmPlayer,
  scout: GmScout | null | undefined
): number {
  const eye = scout ? effectiveScoutLevel(scout) : 1;
  const bonus = potentialFit(scout, player.position);
  return clamp(eye + bonus, 1, 5.9);
}

/**
 * Madden-style trait read. On the draft board the trait stays sealed.
 * Only an elite matching scout gets a whisper, and it can still be wrong.
 */
export function trajectoryRead(
  player: GmPlayer,
  scout: GmScout | null | undefined
): string {
  const clarity = scoutClarity(player, scout);
  if (!scout || clarity < 4.6) return "Dev trait sealed until the pick.";
  const trait = playerDevTrait(player);
  const rng = createRng(nameSeed(`${player.id}:trait:${scout.id}`));
  // Even a great scout only gets a lean, and X-Factor almost never leaks.
  if (trait === "xfactor") {
    return rng() < 0.25 ? "Whisper: generational upside" : "Dev trait sealed until the pick.";
  }
  if (clarity < 5.2 && rng() < 0.45) {
    const decoys: GmDevTrait[] = ["star", "normal", "superstar", "bust"];
    return `Whisper: ${traitLabel(pick(rng, decoys))}`;
  }
  if (trait === "normal" || trait === "bust") {
    return `Whisper: ${traitLabel(trait)}`;
  }
  return rng() < 0.55
    ? `Whisper: ${traitLabel(trait)}`
    : "Dev trait sealed until the pick.";
}

/** One combine for the class. Measurables and the medical file lock in. */
export function applyCombine(player: GmPlayer): GmPlayer {
  const profile = player.scoutProfile;
  if (!profile) return player;
  const sheet = playerSheet(player);
  const speed = sheet.attributes.speed;
  const vertical = sheet.attributes.vertical;
  const agility = sheet.attributes.agility;
  const athletic = ratingToGrade((speed + vertical + agility) / 3, 0);
  const lengthBias = player.position === "C" || player.position === "PF" ? 5 : 3;
  const wingspan = clamp(
    player.heightIn + lengthBias + ((nameSeed(player.id) % 5) - 2),
    player.heightIn - 1,
    player.heightIn + 10
  );
  const durability = player.ratings.durability;
  const medicalNote =
    durability >= 78
      ? "Combine medical was clean."
      : durability >= 62
        ? "Combine medical noted a minor history. Imaging was clean."
        : "Combine medical flagged durability. Several teams will slide this prospect.";
  return {
    ...player,
    scoutProfile: {
      ...profile,
      grades: { ...profile.grades, athleticism: athletic },
      heightInEstimate: player.heightIn,
      weightLbsEstimate: player.weightLbs,
      medicalNote,
      combine: {
        wingspanIn: wingspan,
        verticalIn: clamp(Math.round(26 + (vertical - 40) * 0.22), 24, 44),
        sprint: Math.round(clamp(3.45 - (speed - 70) * 0.007, 2.95, 3.75) * 100) / 100,
      },
    },
  };
}

/**
 * The true floor and ceiling stay off the screen.
 * A better eye, and a matching specialty, tighten the range and the note.
 */
export function scoutPotentialView(
  player: GmPlayer,
  scout: GmScout | null | undefined
): ScoutedPotential {
  const sheet = playerSheet(player);
  const floor = sheet.potential.floor;
  const ceiling = sheet.potential.ceiling;
  const clarity = scoutClarity(player, scout);
  const bonus = potentialFit(scout, player.position);
  const extra = Math.round((5.6 - clarity) * 5);
  const rng = createRng(nameSeed(`${player.id}:${scout?.id ?? "none"}`));
  const shift = Math.round((rng() - 0.5) * extra * 1.1);
  const low = clamp(Math.round(floor - extra * 0.45 + shift), 25, 98);
  const high = clamp(
    Math.round(Math.max(ceiling, low + 1) + extra * 0.55 + Math.max(0, shift) * 0.15),
    low + 1,
    99
  );
  const matched = bonus >= 0.6;
  const lane = scout ? expertiseLabel(scout.expertise).toLowerCase() : "";
  let comment: string;
  if (!scout) {
    comment = "No director of scouting. The range is a guess until someone owns the board.";
  } else if (clarity >= 5) {
    comment = matched
      ? `${scout.name} trusts this read. ${expertiseLabel(scout.expertise)} is the specialty, and the range is about as tight as the tape allows.`
      : `${scout.name} has a strong eye. The range stays narrow even outside the specialty.`;
  } else if (clarity >= 3.6) {
    comment = matched
      ? `${expertiseLabel(scout.expertise)} film is comfortable here. The low end is the part to trust.`
      : `This sits outside ${scout.name}'s ${lane} lane, so the high end could be off by a tier.`;
  } else if (clarity >= 2.4) {
    comment = `${scout.name} wants another look before the room bets the high end.`;
  } else if (matched) {
    comment = `Even in the ${lane} lane, the sample is thin. Treat the range as a wide net.`;
  } else {
    comment = `${expertiseLabel(scout.expertise)} is the wrong specialty for a ${player.position}. This range is mostly fog.`;
  }
  return { low, high, comment };
}

/** Apply sealed identity + fogged dossier to a prospect. */
export function sealProspect(
  player: GmPlayer,
  scoutLevel: number,
  boardIndex: number,
  rng: () => number,
  scout?: GmScout | null
): GmPlayer {
  return {
    ...player,
    identityRevealed: false,
    scouted: buildScoutedRatings(
      player.ratings,
      scoutLevel,
      rng,
      scout,
      player.position
    ),
    scoutProfile: buildScoutProfile(player, scoutLevel, boardIndex, rng, scout),
    contract: null,
  };
}

/** Refresh scout fog for roster + available (FA / draft pool). */
export function revealScouting(
  players: GmPlayer[],
  teamId: string,
  scoutLevel: number,
  draftPool: string[] = [],
  scout?: GmScout | null
): GmPlayer[] {
  const rng = createRng(teamId.length * 1000 + scoutLevel * 97 + players.length);
  const draftSet = new Set(draftPool);
  return players.map((p, i) => {
    const onRoster = p.teamId === teamId;
    const available = p.teamId === null;
    if (!onRoster && !available) return p;
    if (draftSet.has(p.id) || (available && p.identityRevealed === false)) {
      return {
        ...p,
        scouted: buildScoutedRatings(p.ratings, scoutLevel, rng, scout, p.position),
        scoutProfile: buildScoutProfile(p, scoutLevel, i % 60, rng, scout),
      };
    }
    const level = focusLevel(scoutLevel, scout, p.position, "overall");
    const noise = (2.2 - level * 0.35) * 0.15;
    const scouted: ScoutedRatings = {
      impact: Math.round((p.ratings.impact + noise) * 100) / 100,
      offense: p.ratings.offense + noise * 0.4,
      defense: p.ratings.defense + noise * 0.4,
      uncertainty: clamp(1.1 - level * 0.18, 0.05, 1),
    };
    return { ...p, scouted };
  });
}

export function gradeSortValue(g: ScoutLetterGrade | null | undefined): number {
  if (!g) return -1;
  return GRADE_SCALE.indexOf(g);
}

const GRADE_FOCUSES = [
  "athleticism",
  "shooting",
  "creation",
  "defense",
  "feel",
  "upside",
] as const;

export type ScoutLookFocus = (typeof GRADE_FOCUSES)[number];

/**
 * Spend one scouting look on a fogged prospect: fill one blank grade,
 * tighten uncertainty, and raise confidence. Does not reveal identity or trait.
 */
export function spendScoutingLook(
  player: GmPlayer,
  scout: GmScout | null | undefined,
  focus?: ScoutLookFocus
): GmPlayer {
  const profile = player.scoutProfile;
  if (!profile) return player;
  const level = scout ? effectiveScoutLevel(scout) : 1;
  const rng = createRng(
    nameSeed(`${player.id}:look:${scout?.id ?? "none"}:${focus ?? "any"}`)
  );
  const blanks = GRADE_FOCUSES.filter((key) => profile.grades[key] == null);
  const knack = scout ? ensureScoutKnack(scout).knack : undefined;
  const preferred = scoutKnackPreferredFocus(knack, player);
  const target =
    focus && profile.grades[focus] == null
      ? focus
      : preferred && profile.grades[preferred] == null
        ? preferred
        : blanks.length
          ? blanks[Math.floor(rng() * blanks.length)]!
          : focus && GRADE_FOCUSES.includes(focus)
            ? focus
            : GRADE_FOCUSES[Math.floor(rng() * GRADE_FOCUSES.length)]!;

  const noiseAmp = Math.max(0.08, 1.8 - level * 0.32);
  const noise = (rng() - 0.5) * (18 - level * 2.5);
  const trueByFocus: Record<ScoutLookFocus, number> = {
    athleticism: (player.ratings.finishing + player.ratings.durability) / 2,
    shooting: player.ratings.shooting,
    creation: (player.ratings.playmaking + player.ratings.offense * 8) / 2,
    defense: clamp(50 + player.ratings.defense * 8, 0, 100),
    feel: (player.ratings.playmaking + player.ratings.rebounding) / 2,
    upside: clamp((player.ratings.impact + 3) * 10 + player.ratings.potential * 6, 0, 100),
  };
  const focusLevelValue = focusLevel(
    level,
    scout,
    player.position,
    target === "upside" ? "overall" : target,
    player
  );
  const revealed = fogGrade(
    ratingToGrade(trueByFocus[target], noise),
    focusLevelValue,
    rng
  );
  const grade = revealed ?? ratingToGrade(trueByFocus[target], noise * 0.4);
  const uncertainty = clamp(
    (player.scouted.uncertainty ?? 0.8) - 0.12 - level * 0.03,
    0.05,
    1
  );
  return {
    ...player,
    scouted: {
      ...player.scouted,
      uncertainty,
      impact:
        player.scouted.impact == null && target === "upside"
          ? Math.round((player.ratings.impact + (rng() - 0.5) * noiseAmp) * 100) / 100
          : player.scouted.impact,
    },
    scoutProfile: {
      ...profile,
      grades: { ...profile.grades, [target]: grade },
      confidence: clamp(profile.confidence + 0.06 + level * 0.015, 0.15, 0.97),
      summary:
        blanks.length > 0
          ? `${profile.summary} Fresh look locked ${target}.`
          : profile.summary,
    },
  };
}

/** How wrong a fogged grade is vs the true tool (0 = exact, higher = worse). */
export function gradeCalibrationError(
  player: GmPlayer,
  focus: ScoutLookFocus
): number | null {
  const graded = player.scoutProfile?.grades[focus];
  if (!graded) return null;
  const trueByFocus: Record<ScoutLookFocus, number> = {
    athleticism: (player.ratings.finishing + player.ratings.durability) / 2,
    shooting: player.ratings.shooting,
    creation: (player.ratings.playmaking + player.ratings.offense * 8) / 2,
    defense: clamp(50 + player.ratings.defense * 8, 0, 100),
    feel: (player.ratings.playmaking + player.ratings.rebounding) / 2,
    upside: clamp((player.ratings.impact + 3) * 10 + player.ratings.potential * 6, 0, 100),
  };
  const trueGrade = ratingToGrade(trueByFocus[focus], 0);
  return Math.abs(gradeSortValue(graded) - gradeSortValue(trueGrade));
}

/** Sort draft board by scouted upside (not true potential). */
export function sortScoutBoard(players: GmPlayer[]): GmPlayer[] {
  return [...players].sort((a, b) => {
    const ua = gradeSortValue(a.scoutProfile?.grades.upside);
    const ub = gradeSortValue(b.scoutProfile?.grades.upside);
    if (ub !== ua) return ub - ua;
    const ia = a.scouted.impact ?? -99;
    const ib = b.scouted.impact ?? -99;
    if (ib !== ia) return ib - ia;
    return (a.codename ?? a.name).localeCompare(b.codename ?? b.name);
  });
}

export function formatHeight(inches: number | null | undefined): string {
  if (inches == null) return "-";
  const ft = Math.floor(inches / 12);
  const inn = Math.round(inches % 12);
  return `${ft}'${inn}"`;
}

export function staffScoutContext(state: GmLeagueState): {
  scout: GmScout | null;
  level: number;
} {
  const staff = state.teams.find((t) => t.id === state.userTeamId)?.staff;
  const scout = staff?.scout ?? null;
  const level = effectiveScoutLevel(scout, staff?.scoutLevel ?? 1);
  return { scout, level };
}

function knownCodename(codename: string | undefined): boolean {
  return Boolean(codename && codenameDef(codename));
}

/** Lazy migrate older saves: scouts, market, style codenames. */
export function ensureProspectIdentities(state: GmLeagueState): GmLeagueState {
  let next = state;
  let changed = false;

  const teams = next.teams.map((t, i) => {
    if (t.staff.scout) return t;
    changed = true;
    const scout = defaultTeamScout(next.season * 1009 + i * 17 + t.id.charCodeAt(0));
    return {
      ...t,
      staff: {
        ...t.staff,
        scout,
        scoutLevel: scout.eye,
      },
    };
  });
  if (changed) next = { ...next, teams };

  if (!next.scoutMarket?.length) {
    changed = true;
    next = {
      ...next,
      scoutMarket: generateScoutMarket(next.season * 4243 + next.userTeamId.length * 11, 5),
    };
  }

  const used = new Set(
    next.players
      .map((p) => p.codename)
      .filter((c): c is string => Boolean(c))
  );
  const rng = createRng(next.season * 7919 + next.draftPool.length);
  const { scout, level } = staffScoutContext(next);

  const players = next.players.map((p) => {
    if (!next.draftPool.includes(p.id)) return p;
    const hasValidCodename = knownCodename(p.codename);
    if (hasValidCodename && p.identityRevealed === false && p.scoutProfile) {
      return p;
    }
    changed = true;
    let migrated = p;
    if (!hasValidCodename || p.identityRevealed !== false) {
      if (p.codename) used.delete(p.codename);
      migrated = assignProspectIdentity(p, rng, used, {
        eliteEligible:
          p.ratings.impact >= 4.0 && p.ratings.potential >= 7.5,
      });
    }
    const idx = next.draftPool.indexOf(p.id);
    return sealProspect(migrated, level, Math.max(0, idx), rng, scout);
  });

  if (changed) next = { ...next, players };
  return changed ? next : state;
}
