/**
 * Madden-style development traits. Rare X-Factor / Superstar kids are the
 * jackpot on draft night. League players get traits from age, overall, and production.
 */

import type { GmCountingLine, GmDevPath, GmDevTrait, GmPlayer, GmPotential } from "@/gm/types";
import { clamp, createRng } from "@/gm/engine/rng";
import { overallOf } from "@/gm/engine/lineup";

export const DEV_TRAIT_LABEL: Record<GmDevTrait, string> = {
  xfactor: "X-Factor",
  superstar: "Superstar",
  star: "Star",
  normal: "Normal",
  bust: "Bust",
};

const TRAIT_RANK: Record<GmDevTrait, number> = {
  bust: 0,
  normal: 1,
  star: 2,
  superstar: 3,
  xfactor: 4,
};

export function traitLabel(trait: GmDevTrait | undefined): string {
  return DEV_TRAIT_LABEL[trait ?? "normal"];
}

export function pathFromTrait(trait: GmDevTrait): GmDevPath {
  if (trait === "bust") return "bust";
  if (trait === "normal") return "average";
  return "boom";
}

/** Growth multiplier stacked on the boom/bust path math. */
export function traitGrowthMul(trait: GmDevTrait | undefined): number {
  switch (trait) {
    case "xfactor":
      return 1.55;
    case "superstar":
      return 1.32;
    case "star":
      return 1.12;
    case "bust":
      return 0.72;
    default:
      return 1;
  }
}

export function preferHigherTrait(
  a: GmDevTrait,
  b: GmDevTrait | null | undefined
): GmDevTrait {
  if (!b) return a;
  return TRAIT_RANK[b] > TRAIT_RANK[a] ? b : a;
}

/** Highest non-null trait, or null when nothing qualifies. */
export function maxTrait(
  ...traits: Array<GmDevTrait | null | undefined>
): GmDevTrait | null {
  let best: GmDevTrait | null = null;
  for (const trait of traits) {
    if (!trait) continue;
    if (!best || TRAIT_RANK[trait] > TRAIT_RANK[best]) best = trait;
  }
  return best;
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function isDraftProspect(player: GmPlayer): boolean {
  if (player.draftYear == null) return false;
  if (player.teamId == null) return true;
  // Rookies with real NBA minutes are league players for trait floors.
  const line = productionLine(player);
  if (line && line.gp >= 15 && line.min / line.gp >= 12) return false;
  return player.age <= 22;
}

function productionLine(player: GmPlayer): GmCountingLine | null {
  for (const line of [player.nbaSeason, player.seasonLine, player.priorLine]) {
    if (line && line.gp > 0 && line.min > 0) return line;
  }
  return null;
}

/**
 * Discourse / production overrides for household names.
 * Keeps real-league seed stars from rolling Bust on a cold seed.
 * minOverall stays low because sheet OVR can lag when advanced metrics are blank.
 */
const DISCOURSE_TRAITS: Array<{
  match: RegExp;
  trait: GmDevTrait;
  minOverall?: number;
}> = [
  {
    match: /joki[cć]|gilgeous-alexander|antetokounmpo|don[cč]i[cć]|wembanyama/i,
    trait: "xfactor",
    minOverall: 74,
  },
  {
    match:
      /anthony edward|stephen curry|kevin durant|cunningham|tatum|embiid|donovan mitchell|devin booker|brunson|haliburton|jaylen brown/i,
    trait: "superstar",
    minOverall: 72,
  },
  {
    match:
      /ja morant|maxey|banchero|mobley|de'aaron fox|trae young|zion|lamelo|scottie barnes|franz wagner|jaren jackson/i,
    trait: "superstar",
    minOverall: 72,
  },
  {
    match: /kawhi|lebron|harden|lillard|towns|sabonis|garland|herro|jamal murray/i,
    trait: "star",
    minOverall: 70,
  },
];

export function discourseTraitHint(
  player: GmPlayer,
  overall: number
): GmDevTrait | null {
  for (const row of DISCOURSE_TRAITS) {
    if (!row.match.test(player.name)) continue;
    if (row.minOverall != null && overall < row.minOverall) continue;
    return row.trait;
  }
  return null;
}

/**
 * Floor for players already in the league. Counting stats and impact beat a
 * cold Normal roll when the board already knows who the stars are.
 */
export function leagueProductionFloor(
  player: GmPlayer,
  overall: number
): GmDevTrait | null {
  if (isDraftProspect(player)) return null;

  const line = productionLine(player);
  const impact = player.ratings.impact;
  const age = player.age;
  const gp = line?.gp ?? 0;
  const mpg = line && gp > 0 ? line.min / gp : 0;
  const ppg = line && gp > 0 ? line.pts / gp : 0;
  const apg = line && gp > 0 ? line.ast / gp : 0;
  const rpg = line && gp > 0 ? line.reb / gp : 0;
  const counted = gp >= 20 && mpg >= 22;

  // True MVP / generational tier — impact has to back real creation volume.
  if (
    (impact >= 5.5 && (ppg >= 20 || overall >= 92)) ||
    overall >= 94 ||
    (counted && impact >= 4.0 && ppg >= 27 && apg >= 7) ||
    (counted && impact >= 4.0 && ppg >= 25 && rpg >= 10 && apg >= 8)
  ) {
    return "xfactor";
  }

  // All-NBA / MVP-ballot names.
  if (
    (impact >= 3.8 && (ppg >= 14 || overall >= 84)) ||
    (impact >= 3.2 && ppg >= 16 && overall >= 82) ||
    overall >= 88 ||
    (counted && impact >= 2.0 && ppg >= 22) ||
    (counted && impact >= 1.5 && ppg >= 20 && apg >= 7) ||
    (counted && impact >= 2.5 && ppg >= 24)
  ) {
    return "superstar";
  }

  // All-Star / clear foundational starters.
  if (
    impact >= 2.0 ||
    overall >= 80 ||
    (counted && impact >= 1.0 && ppg >= 17) ||
    (counted && impact >= 1.2 && apg >= 6.5) ||
    (counted && impact >= 0 && ppg >= 22 && mpg >= 32) ||
    (counted && ppg >= 16 && age <= 25 && mpg >= 30 && impact >= 0.5) ||
    (age <= 25 && overall >= 76 && impact >= 1.4)
  ) {
    return "star";
  }

  return null;
}

function applyTraitFloors(
  rolled: GmDevTrait,
  player: GmPlayer,
  overall: number
): GmDevTrait {
  return (
    maxTrait(
      rolled,
      discourseTraitHint(player, overall),
      leagueProductionFloor(player, overall)
    ) ?? rolled
  );
}

function nextTraitUp(trait: GmDevTrait): GmDevTrait | null {
  if (trait === "bust") return "normal";
  if (trait === "normal") return "star";
  if (trait === "star") return "superstar";
  if (trait === "superstar") return "xfactor";
  return null;
}

/**
 * Roll a trait for a new sheet. Young, high-impact players lean Star+.
 * Veterans with soft production lean Normal / Bust.
 * Named stars and production floors lift cold rolls so the board matches the NBA.
 */
export function rollDevTrait(
  player: GmPlayer,
  overall: number,
  potentialHint: number,
  rng: () => number = createRng(hashId(player.id) ^ 0xde07)
): GmDevTrait {
  const age = player.age;
  const impact = player.ratings.impact;
  const prospect = isDraftProspect(player);
  const young = age <= 23;
  const teen = age <= 19;
  const senior = age >= 22 && age <= 24;
  const prime = age >= 24 && age <= 29;
  const old = age >= 32;

  // Rostered players: production + discourse set the designation. RNG only
  // fills gaps for role players, so volume scorers with soft impact cannot
  // lottery into X-Factor.
  if (!prospect) {
    const floor = maxTrait(
      discourseTraitHint(player, overall),
      leagueProductionFloor(player, overall)
    );
    if (floor) {
      const bump = nextTraitUp(floor);
      if (
        bump &&
        young &&
        potentialHint >= 8 &&
        impact >= 3.5 &&
        floor !== "xfactor" &&
        rng() < 0.08
      ) {
        return bump;
      }
      return floor;
    }
  }

  // Role players already in the league do not lottery into Superstar+.
  let x = prospect ? 0.004 : 0;
  let ss = prospect ? 0.018 : 0;
  let star = prospect ? 0.08 : 0.05;
  let bust = 0.1;

  if (young && overall >= 84) {
    x += 0.04;
    ss += 0.1;
    star += 0.18;
    // Ready-made teens still bust more than polished seniors.
    bust = Math.min(bust, teen ? 0.1 : 0.04);
  } else if (young && overall >= 78) {
    x += 0.015;
    ss += 0.05;
    star += 0.14;
    bust = Math.min(bust, teen ? 0.12 : 0.06);
  } else if (young && overall >= 72) {
    ss += 0.02;
    star += 0.08;
    bust = Math.min(bust + (teen ? 0.06 : 0.02), teen ? 0.2 : 0.14);
  } else if (young && overall < 68) {
    bust += teen ? 0.16 : 0.12;
  }

  // High-impact board names: seniors are safer; teens keep real bust juice.
  if (young && impact >= 3.2) {
    bust = Math.min(bust, teen ? 0.14 : senior ? 0.05 : 0.08);
    star += senior ? 0.02 : 0.05;
  }
  if (young && impact >= 4.2) {
    bust = Math.min(bust, teen ? 0.1 : 0.04);
  }

  // Draft seniors: more "normal / star", fewer jackpots and fewer busts.
  if (prospect && senior) {
    x *= 0.45;
    ss *= 0.55;
    bust = Math.min(bust, 0.07);
    star += 0.04;
  }
  if (prospect && teen) {
    x += 0.01;
    ss += 0.03;
    bust = Math.max(bust, 0.12);
  }

  if (prime && overall >= 88) {
    x += 0.02;
    ss += 0.08;
    star += 0.12;
  } else if (prime && overall >= 82) {
    ss += 0.03;
    star += 0.1;
  }

  if (old) {
    x = 0;
    ss *= 0.15;
    star *= 0.4;
    bust += 0.08;
  }

  if (impact >= 4) {
    x += 0.02;
    ss += 0.05;
  } else if (impact <= 0.2 && young) {
    bust += teen ? 0.1 : 0.06;
  }

  if (potentialHint >= 8) {
    x += 0.015;
    ss += 0.04;
    star += 0.06;
    // High upside on a teen is not a safety stamp — that is the lottery risk.
    if (young && !teen) bust = Math.min(bust, 0.05);
    if (teen) bust = Math.max(bust, 0.1);
  } else if (potentialHint >= 6.5 && young) {
    star += 0.05;
    if (!teen) bust = Math.min(bust, 0.08);
  } else if (potentialHint <= 2 && !young) {
    // Only treat washed production as Bust fuel for non-kids. Young players
    // with a cold prior still have draft room on the potential dial.
    bust += 0.08;
    x *= 0.3;
  }

  // Discourse stand-ins: real-metric stars get a bump when present.
  if ((player.darko ?? 0) >= 2.5 || (player.raptor ?? 0) >= 4) {
    ss += 0.04;
    star += 0.06;
  }
  // A soft Darko on a kid is prior noise, not a Bust stamp.
  if ((player.darko ?? 0) <= -1.5 && age >= 24 && age <= 28) {
    bust += 0.05;
  }

  // League kids who are already good stay mostly Normal+; draft teens do not.
  if (!prospect && young && overall >= 80 && impact >= 3) bust = Math.min(bust, 0.07);
  if (!prospect && young && overall >= 84 && impact >= 3.5) bust = Math.min(bust, 0.04);
  if (!prospect && young && potentialHint >= 7) bust = Math.min(bust, 0.06);

  // Established league producers should almost never land Bust.
  if (!prospect && leagueProductionFloor(player, overall)) {
    bust = Math.min(bust, 0.03);
  }

  x = clamp(x, 0, 0.08);
  ss = clamp(ss, 0, 0.18);
  star = clamp(star, 0, 0.28);
  const bustFloor = prospect && teen ? 0.08 : young && impact >= 3.5 && !teen ? 0.02 : 0.04;
  bust = clamp(bust, bustFloor, prospect && teen ? 0.42 : 0.35);

  const roll = rng();
  let rolled: GmDevTrait = "normal";
  if (roll < x) rolled = "xfactor";
  else if (roll < x + ss) rolled = "superstar";
  else if (roll < x + ss + star) rolled = "star";
  else if (roll > 1 - bust) rolled = "bust";

  return applyTraitFloors(rolled, player, overall);
}

export function ensurePotentialTrait(potential: GmPotential, player: GmPlayer): GmPotential {
  // Current overall only — never potential.ceiling. A 95 ceiling is upside,
  // not a reason to stamp X-Factor on every high-upside kid.
  const overall = Math.max(player.sheet?.overall ?? 0, overallOf(player));
  if (!isDraftProspect(player)) {
    const floor = maxTrait(
      discourseTraitHint(player, overall),
      leagueProductionFloor(player, overall)
    );
    if (floor) {
      if (floor === potential.trait && potential.path === pathFromTrait(floor)) {
        return potential;
      }
      return {
        ...potential,
        trait: floor,
        path: pathFromTrait(floor),
      };
    }
    // Strip unearned jackpots left over from older sheets / RNG.
    if (potential.trait === "xfactor" || potential.trait === "superstar") {
      return {
        ...potential,
        trait: "normal",
        path: pathFromTrait("normal"),
      };
    }
  }
  if (potential.trait) return potential;
  const rng = createRng(hashId(player.id) ^ Math.round(potential.ceiling * 97));
  const trait = rollDevTrait(player, overall, player.ratings.potential, rng);
  return {
    ...potential,
    trait,
    path: pathFromTrait(trait),
  };
}

export function playerDevTrait(player: GmPlayer): GmDevTrait {
  const overall = overallOf(player);
  if (!isDraftProspect(player)) {
    const floor = maxTrait(
      discourseTraitHint(player, overall),
      leagueProductionFloor(player, overall)
    );
    if (floor) return floor;
    const stamped = player.sheet?.potential?.trait;
    if (stamped === "xfactor" || stamped === "superstar") return "normal";
    if (stamped) return stamped;
    return rollDevTrait(player, overall, player.ratings.potential);
  }
  const stamped = player.sheet?.potential?.trait;
  if (stamped) return stamped;
  return rollDevTrait(player, overall, player.ratings.potential);
}

/** True while the prospect is still on the board (pre-pick fog). */
export function isDraftFogged(player: GmPlayer, draftPool: string[]): boolean {
  if (draftPool.includes(player.id)) return true;
  return player.identityRevealed === false && player.teamId == null;
}
