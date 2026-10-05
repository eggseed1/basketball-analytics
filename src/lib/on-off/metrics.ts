/**
 * On/off metric definitions shared by the season builder and the UI.
 *
 * Every split is a stat vector summed over possessions. "Off" is always
 * team minus "on", so the files only store the on side.
 */

export const ON_OFF_KEYS = [
  "poss",
  "pts",
  /** Sum of squared possession points, for sampling error. */
  "pts2",
  "fga",
  "fgm",
  "fg3a",
  "fg3m",
  "fta",
  "ftm",
  "tov",
  "orb",
  /** Missed shots that ended in a live rebound for either side. */
  "orbChances",
  "rimA",
  "rimM",
  "shortMidA",
  "shortMidM",
  "longMidA",
  "longMidM",
  "corner3A",
  "corner3M",
  "astFgm",
  "sec",
  /** Opponent starters on the floor, summed per possession. */
  "oppStarters",
] as const;

export type OnOffKey = (typeof ON_OFF_KEYS)[number];
export type OnOffVec = number[];

export const K = Object.fromEntries(ON_OFF_KEYS.map((k, i) => [k, i])) as Record<OnOffKey, number>;

export const emptyVec = (): OnOffVec => new Array(ON_OFF_KEYS.length).fill(0);

export function addVec(into: OnOffVec, from: OnOffVec): void {
  for (let i = 0; i < into.length; i++) into[i]! += from[i] ?? 0;
}

export function subVec(a: OnOffVec, b: OnOffVec): OnOffVec {
  return a.map((v, i) => v - (b[i] ?? 0));
}

/** Offense (o) is the team with the ball; defense (d) is the opponent's offense. */
export type OnOffSplit = { o: OnOffVec; d: OnOffVec };

export type OnOffView = "clean" | "all";

export type LeagueRates = {
  fg3Pct: number;
  ftPct: number;
  /** Variance of points per possession, league-wide. */
  pppVar: number;
};

const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null);

export function per100(v: OnOffVec, key: OnOffKey = "pts"): number | null {
  const r = ratio(v[K[key]]!, v[K.poss]!);
  return r == null ? null : r * 100;
}

export type FourFactors = {
  efg: number | null;
  tovPct: number | null;
  orbPct: number | null;
  ftRate: number | null;
};

export function fourFactors(v: OnOffVec): FourFactors {
  return {
    efg: ratio(v[K.fgm]! + 0.5 * v[K.fg3m]!, v[K.fga]!),
    tovPct: ratio(v[K.tov]!, v[K.poss]!),
    orbPct: ratio(v[K.orb]!, v[K.orbChances]!),
    ftRate: ratio(v[K.ftm]!, v[K.fga]!),
  };
}

export type ShotZone = "rim" | "shortMid" | "longMid" | "corner3" | "arc3";

export const SHOT_ZONES: Array<{ zone: ShotZone; label: string }> = [
  { zone: "rim", label: "Rim" },
  { zone: "shortMid", label: "Short mid" },
  { zone: "longMid", label: "Long mid" },
  { zone: "corner3", label: "Corner 3" },
  { zone: "arc3", label: "Above-break 3" },
];

export function zoneCounts(v: OnOffVec, zone: ShotZone): { att: number; made: number } {
  switch (zone) {
    case "rim":
      return { att: v[K.rimA]!, made: v[K.rimM]! };
    case "shortMid":
      return { att: v[K.shortMidA]!, made: v[K.shortMidM]! };
    case "longMid":
      return { att: v[K.longMidA]!, made: v[K.longMidM]! };
    case "corner3":
      return { att: v[K.corner3A]!, made: v[K.corner3M]! };
    case "arc3":
      return { att: v[K.fg3a]! - v[K.corner3A]!, made: v[K.fg3m]! - v[K.corner3M]! };
  }
}

/** Share of field goal attempts from a zone, and accuracy there. */
export function shotZone(v: OnOffVec, zone: ShotZone): { freq: number | null; pct: number | null } {
  const { att, made } = zoneCounts(v, zone);
  return { freq: ratio(att, v[K.fga]!), pct: ratio(made, att) };
}

/**
 * Points with opponent 3P% and FT% replaced by league average. Defenses shape
 * shot type and location but have little control over whether those shots fall.
 */
export function luckAdjustedPts(v: OnOffVec, league: LeagueRates): number {
  return (
    v[K.pts]! -
    3 * v[K.fg3m]! +
    3 * v[K.fg3a]! * league.fg3Pct -
    v[K.ftm]! +
    v[K.fta]! * league.ftPct
  );
}

export type Ratings = {
  ortg: number | null;
  drtg: number | null;
  net: number | null;
  /** Defense with opponent shooting luck removed. */
  drtgLuckAdj: number | null;
  netLuckAdj: number | null;
  /** One standard error of net rating, per 100 possessions. */
  netSe: number | null;
  poss: number;
};

/** Sampling variance of points per possession from a vector's own pts and pts². */
function pppVariance(v: OnOffVec, fallback: number): number {
  const n = v[K.poss]!;
  if (n < 30) return fallback;
  const mean = v[K.pts]! / n;
  return Math.max(0, v[K.pts2]! / n - mean * mean);
}

export function ratings(split: OnOffSplit, league: LeagueRates): Ratings {
  const ortg = per100(split.o);
  const drtg = per100(split.d);
  const dPoss = split.d[K.poss]!;
  const drtgLuckAdj = dPoss > 0 ? (luckAdjustedPts(split.d, league) / dPoss) * 100 : null;
  const oN = split.o[K.poss]!;
  const netSe =
    oN > 0 && dPoss > 0
      ? 100 *
        Math.sqrt(
          pppVariance(split.o, league.pppVar) / oN + pppVariance(split.d, league.pppVar) / dPoss
        )
      : null;
  return {
    ortg,
    drtg,
    net: ortg != null && drtg != null ? ortg - drtg : null,
    drtgLuckAdj,
    netLuckAdj: ortg != null && drtgLuckAdj != null ? ortg - drtgLuckAdj : null,
    netSe,
    poss: oN + dPoss,
  };
}

export function offSplit(team: OnOffSplit, on: OnOffSplit): OnOffSplit {
  return { o: subVec(team.o, on.o), d: subVec(team.d, on.d) };
}

export type OnOffComparison = {
  on: Ratings;
  off: Ratings;
  netDiff: number | null;
  netLuckAdjDiff: number | null;
  ortgDiff: number | null;
  drtgDiff: number | null;
  /** One standard error of the on-minus-off net gap. */
  netDiffSe: number | null;
};

export function compareOnOff(
  team: OnOffSplit,
  on: OnOffSplit,
  league: LeagueRates
): OnOffComparison {
  const onR = ratings(on, league);
  const offR = ratings(offSplit(team, on), league);
  const diff = (a: number | null, b: number | null) => (a != null && b != null ? a - b : null);
  return {
    on: onR,
    off: offR,
    netDiff: diff(onR.net, offR.net),
    netLuckAdjDiff: diff(onR.netLuckAdj, offR.netLuckAdj),
    ortgDiff: diff(onR.ortg, offR.ortg),
    drtgDiff: diff(onR.drtg, offR.drtg),
    netDiffSe:
      onR.netSe != null && offR.netSe != null ? Math.sqrt(onR.netSe ** 2 + offR.netSe ** 2) : null,
  };
}

/** Garbage time per Cleaning the Glass: 4th quarter, margin by clock, two or fewer starters on. */
export function garbageMarginThreshold(clockSecondsLeft: number): number {
  if (clockSecondsLeft > 540) return 25;
  if (clockSecondsLeft > 360) return 20;
  return 10;
}

/** Possessions starting with this many seconds or fewer left in a period are end-of-quarter heaves. */
export const HEAVE_SECONDS = 2;
