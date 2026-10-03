import leagueAverages from "@/data/runtime/league-season-averages.json";
import type { PlayerSeason } from "@/data/types";
import type { SheetStatId } from "@/lib/player-stat-sheet-registry";

/** Per-team, per-game NBA league averages for one season (BRef). */
export type LeagueSeasonAverages = {
  pts: number | null;
  trb: number | null;
  orb: number | null;
  drb: number | null;
  ast: number | null;
  stl: number | null;
  blk: number | null;
  tov: number | null;
  pf: number | null;
  fg: number | null;
  fga: number | null;
  fg3: number | null;
  fg3a: number | null;
  ft: number | null;
  fta: number | null;
  fgPct: number | null;
  fg3Pct: number | null;
  ftPct: number | null;
  efgPct: number | null;
  tsPct: number | null;
  pace: number | null;
  ortg: number | null;
};

const SEASONS = leagueAverages.seasons as Record<string, LeagueSeasonAverages>;

/** Newest season with league averages; adjusted numbers are stated in its terms. */
export const ERA_REFERENCE_SEASON = Object.keys(SEASONS).sort().at(-1)!;

export const LEAGUE_AVERAGES_SOURCE = leagueAverages.source;

export function leagueAveragesFor(season: string): LeagueSeasonAverages | null {
  return SEASONS[season] ?? null;
}

type Scaled = {
  field: keyof PlayerSeason;
  league: keyof LeagueSeasonAverages;
  stats: SheetStatId[];
};

/** Counting totals scale by the ratio of league per-game averages. */
const SCALED: Scaled[] = [
  { field: "points", league: "pts", stats: ["pts"] },
  { field: "rebounds", league: "trb", stats: ["trb"] },
  { field: "offensiveRebounds", league: "orb", stats: ["orb"] },
  { field: "defensiveRebounds", league: "drb", stats: ["drb"] },
  { field: "assists", league: "ast", stats: ["ast", "atr"] },
  { field: "steals", league: "stl", stats: ["stl"] },
  { field: "blocks", league: "blk", stats: ["blk"] },
  { field: "turnovers", league: "tov", stats: ["tov", "atr"] },
  { field: "personalFouls", league: "pf", stats: ["pf"] },
  { field: "fieldGoalsMade", league: "fg", stats: ["fg"] },
  { field: "fieldGoalsAttempted", league: "fga", stats: ["fga"] },
  { field: "freeThrowsMade", league: "ft", stats: ["ft"] },
  { field: "freeThrowsAttempted", league: "fta", stats: ["fta"] },
];

type Shifted = {
  field: keyof PlayerSeason;
  league: (lg: LeagueSeasonAverages) => number | null;
  stats: SheetStatId[];
};

function leagueTwoPct(lg: LeagueSeasonAverages): number | null {
  if (lg.fg == null || lg.fga == null) return null;
  const made = lg.fg - (lg.fg3 ?? 0);
  const att = lg.fga - (lg.fg3a ?? 0);
  return att > 0 ? made / att : null;
}

/** Percentages and ratings shift by the gap between league averages. */
const SHIFTED: Shifted[] = [
  { field: "fieldGoalPct", league: (lg) => lg.fgPct, stats: ["fgPct"] },
  { field: "twoPointPct", league: leagueTwoPct, stats: ["fg2Pct"] },
  { field: "threePointPct", league: (lg) => lg.fg3Pct, stats: ["fg3Pct"] },
  { field: "freeThrowPct", league: (lg) => lg.ftPct, stats: ["ftPct"] },
  { field: "effectiveFieldGoalPct", league: (lg) => lg.efgPct, stats: ["efg"] },
  { field: "trueShootingPct", league: (lg) => lg.tsPct, stats: ["ts"] },
  { field: "offensiveRating", league: (lg) => lg.ortg, stats: ["ortg"] },
  { field: "defensiveRating", league: (lg) => lg.ortg, stats: ["drtg"] },
];

/**
 * 3-point volume isn't scaled: the league took about 3 a game in 1980 and 37
 * now, so a ratio would invent shots nobody took. 2P counts mix scaled FG
 * with unscaled 3s, so they read as not adjusted too.
 */
export const NEVER_ERA_ADJUSTED: SheetStatId[] = ["fg3", "fg3a", "fg2", "fg2a"];

/** Stats the adjustment can change. Everything else is already league-relative or a raw total. */
export const ERA_ADJUSTED_STATS = new Set<SheetStatId>([
  ...SCALED.flatMap((s) => s.stats),
  ...SHIFTED.flatMap((s) => s.stats),
]);

export type EraAdjustedRow = {
  row: PlayerSeason;
  /** Adjustable stats left as played because a league average is missing. */
  unadjusted: Set<SheetStatId>;
};

function finite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * Restate one season in reference-season terms. A season with no league
 * row (or newer than the reference) comes back unchanged and flagged.
 */
export function eraAdjustSeasonRow(
  row: PlayerSeason,
  reference: string = ERA_REFERENCE_SEASON
): EraAdjustedRow {
  const lg = leagueAveragesFor(row.season);
  const ref = leagueAveragesFor(reference);
  const unadjusted = new Set<SheetStatId>();
  if (!lg || !ref) {
    for (const id of ERA_ADJUSTED_STATS) unadjusted.add(id);
    return { row, unadjusted };
  }
  if (row.season === reference) return { row, unadjusted };

  const next: PlayerSeason = { ...row };
  const out = next as unknown as Record<string, unknown>;

  for (const spec of SCALED) {
    const value = row[spec.field];
    if (!finite(value)) continue;
    const from = lg[spec.league];
    const to = ref[spec.league];
    // A blank league average means the stat wasn't tracked; blankUntracked* clears it.
    if (from == null) continue;
    if (to == null || from <= 0) {
      for (const id of spec.stats) unadjusted.add(id);
      continue;
    }
    out[spec.field] = value * (to / from);
  }

  for (const spec of SHIFTED) {
    const value = row[spec.field];
    if (!finite(value) || value <= 0) continue;
    const from = spec.league(lg);
    const to = spec.league(ref);
    if (from == null || to == null) {
      for (const id of spec.stats) unadjusted.add(id);
      continue;
    }
    out[spec.field] = value + (to - from);
  }

  if (finite(next.offensiveRating) && finite(next.defensiveRating)) {
    next.netRating = next.offensiveRating - next.defensiveRating;
  }

  return { row: next, unadjusted };
}

/**
 * Box-score stats the league started tracking partway through history.
 * Season rows carry 0 for them before then, which reads as a real zero.
 */
const LATE_TRACKED: Array<{
  field: keyof PlayerSeason;
  league: keyof LeagueSeasonAverages;
  stat: SheetStatId;
}> = [
  { field: "rebounds", league: "trb", stat: "trb" },
  { field: "steals", league: "stl", stat: "stl" },
  { field: "blocks", league: "blk", stat: "blk" },
  { field: "turnovers", league: "tov", stat: "tov" },
  { field: "offensiveRebounds", league: "orb", stat: "orb" },
  { field: "defensiveRebounds", league: "drb", stat: "drb" },
];

const LATE_TRACKED_SINCE: Partial<Record<SheetStatId, string>> = Object.fromEntries(
  LATE_TRACKED.map((t) => [
    t.stat,
    Object.keys(SEASONS)
      .sort()
      .find((season) => SEASONS[season]![t.league] != null),
  ])
);

/** First season the league tracked a late-tracked stat, e.g. "1973-74" for STL. */
export function trackedSince(stat: SheetStatId): string | undefined {
  return LATE_TRACKED_SINCE[stat];
}

/** False only when the league table has the season and the stat is blank. */
function leagueTracked(season: string, key: keyof LeagueSeasonAverages): boolean {
  const lg = SEASONS[season];
  return !lg || lg[key] != null;
}

/** Blank stats the league didn't track in this row's season. */
export function blankUntrackedSeasonStats(row: PlayerSeason): PlayerSeason {
  const untracked = LATE_TRACKED.filter((t) => !leagueTracked(row.season, t.league));
  if (!untracked.length) return row;
  const next = { ...row } as unknown as Record<string, unknown>;
  for (const t of untracked) next[t.field] = Number.NaN;
  return next as unknown as PlayerSeason;
}

/**
 * Per-game career averages for late-tracked stats use only the seasons the
 * league tracked them: blank when none were, rescaled when some were.
 * `pool` is one row per season, the same rows the career row summed.
 */
export function applyTrackedCareerStats(
  row: PlayerSeason,
  pool: PlayerSeason[]
): { row: PlayerSeason; partial: SheetStatId[] } {
  const next = { ...row } as unknown as Record<string, unknown>;
  const partial: SheetStatId[] = [];
  for (const t of LATE_TRACKED) {
    const tracked = pool.filter((r) => leagueTracked(r.season, t.league));
    if (tracked.length === pool.length) continue;
    if (!tracked.length) {
      next[t.field] = Number.NaN;
      continue;
    }
    const games = tracked.reduce((s, r) => s + r.gamesPlayed, 0);
    const total = tracked.reduce((s, r) => s + (Number(r[t.field]) || 0), 0);
    next[t.field] = games > 0 ? (total / games) * row.gamesPlayed : Number.NaN;
    partial.push(t.stat);
  }
  return { row: next as unknown as PlayerSeason, partial };
}

/** Adjust every season of a career before it is averaged. */
export function eraAdjustCareer(
  seasons: PlayerSeason[],
  reference: string = ERA_REFERENCE_SEASON
): EraAdjustedRow[] {
  return seasons.map((row) => eraAdjustSeasonRow(row, reference));
}
