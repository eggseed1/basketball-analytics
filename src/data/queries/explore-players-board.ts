/**
 * Explore Players board view - server-side filter/sort/window + slim rows.
 * Full board stays in the query/cache layer; the browser gets the first
 * window, then later pages via infinite scroll.
 */

import {
  buildLeaderboardContextIndex,
  type LeaderboardContextIndex,
} from "@/analytics/leaderboard-context";
import { getPlayerSeasonBoardSnapshot } from "@/data/queries/player-data-health";
import { hasValidDrblEstimate } from "@/data/queries/percentiles";
import type { BasketballFilters, PlayerSeason } from "@/data/types";
import {
  defaultPlayerSeasonSortDir,
  type PlayerSeasonSortKey,
} from "@/lib/player-season-sort";

export const EXPLORE_PLAYERS_PAGE_SIZE = 100;

/** Display + Level-2 context fields only - not the full canonical PlayerSeason. */
export type ExplorePlayerBoardRow = {
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  teamAbbreviation?: string;
  season: string;
  position?: string;
  gamesPlayed: number;
  minutes: number;
  points: number;
  assists: number;
  rebounds: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fieldGoalPct: number;
  threePointPct: number;
  freeThrowPct: number;
  trueShootingPct?: number;
  effectiveFieldGoalPct?: number;
  usagePct?: number;
  offensiveRating?: number;
  defensiveRating?: number;
  netRating?: number;
  darkoDpm?: number;
  darkoOff?: number;
  darkoDef?: number;
  lebron?: number;
  oLebron?: number;
  dLebron?: number;
  /** Unrounded validated DRBL/100 when overlay present; omit when missing. */
  drbl100?: number;
  /** null/omitted when DRBL overlay absent - never coerce missing to 0. */
  r1Points?: number | null;
  /** null/omitted when DRBL overlay absent - never coerce missing to 0. */
  r1WinEquivalents?: number | null;
  mpg: number;
  ppg: number;
  rpg: number;
  apg: number;
  spg: number;
  bpg: number;
  tov: number;
  age?: number;
  twoPointPct?: number;
  turnoverPct?: number;
  threePointersAttempted?: number;
  freeThrowsAttempted?: number;
  offensiveRebounds?: number;
  defensiveRebounds?: number;
  /** Player TS% minus board mean TS% (fraction). */
  relativeTrueShootingPct?: number;
};

export type ExplorePlayersBoardView = {
  rows: ExplorePlayerBoardRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  pageCount: number;
  sortKey: PlayerSeasonSortKey;
  sortDir: "asc" | "desc";
  hasDarko: boolean;
  hasLebron: boolean;
  hasDrbl: boolean;
  /** Full filtered board size used for Level-2 percentile pools. */
  boardSampleSize: number;
  /** Serializable percentile pools for the active sort (full board). */
  contextPools: Record<string, number[]>;
  health: Awaited<ReturnType<typeof getPlayerSeasonBoardSnapshot>>["health"];
  source: Awaited<ReturnType<typeof getPlayerSeasonBoardSnapshot>>["source"];
  warnings: string[];
};

function perGame(total: number, gp: number): number {
  if (!gp) return 0;
  return total / gp;
}

export function toExplorePlayerBoardRow(p: PlayerSeason): ExplorePlayerBoardRow {
  const gp = p.gamesPlayed || 0;
  const row: ExplorePlayerBoardRow = {
    playerId: p.playerId,
    playerName: p.playerName,
    teamId: p.teamId,
    teamName: p.teamName,
    teamAbbreviation: p.teamAbbreviation,
    season: p.season,
    position: p.position,
    gamesPlayed: p.gamesPlayed,
    minutes: p.minutes,
    points: p.points,
    assists: p.assists,
    rebounds: p.rebounds,
    steals: p.steals,
    blocks: p.blocks,
    turnovers: p.turnovers,
    fieldGoalPct: p.fieldGoalPct,
    threePointPct: p.threePointPct,
    freeThrowPct: p.freeThrowPct,
    mpg: perGame(p.minutes, gp),
    ppg: perGame(p.points, gp),
    rpg: perGame(p.rebounds, gp),
    apg: perGame(p.assists, gp),
    spg: perGame(p.steals, gp),
    bpg: perGame(p.blocks, gp),
    tov: perGame(p.turnovers, gp),
  };
  if (p.trueShootingPct != null) row.trueShootingPct = p.trueShootingPct;
  if (p.effectiveFieldGoalPct != null) {
    row.effectiveFieldGoalPct = p.effectiveFieldGoalPct;
  }
  if (p.usagePct != null) row.usagePct = p.usagePct;
  if (p.offensiveRating != null) row.offensiveRating = p.offensiveRating;
  if (p.defensiveRating != null) row.defensiveRating = p.defensiveRating;
  if (p.netRating != null) row.netRating = p.netRating;
  if (p.darkoDpm != null) row.darkoDpm = p.darkoDpm;
  if (p.darkoOff != null) row.darkoOff = p.darkoOff;
  else if (p.oDpm) row.darkoOff = p.oDpm;
  if (p.darkoDef != null) row.darkoDef = p.darkoDef;
  else if (p.dDpm) row.darkoDef = p.dDpm;
  if (row.darkoDpm == null && p.dpm) row.darkoDpm = p.dpm;
  if (p.lebron != null) row.lebron = p.lebron;
  if (p.oLebron != null) row.oLebron = p.oLebron;
  if (p.dLebron != null) row.dLebron = p.dLebron;
  if (p.age != null && p.age > 0) row.age = p.age;
  if (p.twoPointPct) row.twoPointPct = p.twoPointPct;
  if (p.turnoverPct) row.turnoverPct = p.turnoverPct;
  row.threePointersAttempted = p.threePointersAttempted;
  row.freeThrowsAttempted = p.freeThrowsAttempted;
  row.offensiveRebounds = p.offensiveRebounds;
  row.defensiveRebounds = p.defensiveRebounds;
  if (hasValidDrblEstimate(p)) {
    row.drbl100 = p.drbl100;
    row.r1Points = p.r1Points ?? null;
    row.r1WinEquivalents = p.r1WinEquivalents ?? null;
  }
  return row;
}

function sortKeyIsImpact(key: PlayerSeasonSortKey): boolean {
  return (
    key === "darkoDpm" ||
    key === "darkoOff" ||
    key === "darkoDef" ||
    key === "lebron"
  );
}

function sortKeyIsDrbl(key: PlayerSeasonSortKey): boolean {
  return (
    key === "drbl100" || key === "r1Points" || key === "r1WinEquivalents"
  );
}

function sortKeyIsOptionalRating(key: PlayerSeasonSortKey): boolean {
  return (
    key === "offensiveRating" ||
    key === "defensiveRating" ||
    key === "netRating" ||
    key === "trueShootingPct" ||
    key === "effectiveFieldGoalPct" ||
    key === "usagePct" ||
    key === "age" ||
    key === "twoPointPct" ||
    key === "turnoverPct" ||
    key === "relativeTrueShootingPct" ||
    sortKeyIsImpact(key) ||
    sortKeyIsDrbl(key)
  );
}

function sortValue(
  row: ExplorePlayerBoardRow,
  key: PlayerSeasonSortKey,
  sortDir: "asc" | "desc"
): string | number {
  const v = row[key as keyof ExplorePlayerBoardRow];
  if (v == null || (typeof v === "number" && Number.isNaN(v))) {
    if (typeof v === "string") return "";
    // Missing values always sort to the end (Missing ≠ zero).
    if (
      sortKeyIsOptionalRating(key) ||
      sortKeyIsImpact(key) ||
      sortKeyIsDrbl(key)
    ) {
      return sortDir === "asc"
        ? Number.POSITIVE_INFINITY
        : Number.NEGATIVE_INFINITY;
    }
    return 0;
  }
  return v as string | number;
}

export function sortExplorePlayerRows(
  rows: ExplorePlayerBoardRow[],
  sortKey: PlayerSeasonSortKey,
  sortDir: "asc" | "desc"
): ExplorePlayerBoardRow[] {
  return [...rows].sort((a, b) => {
    const av = sortValue(a, sortKey, sortDir);
    const bv = sortValue(b, sortKey, sortDir);
    if (typeof av === "string" && typeof bv === "string") {
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    const an = Number(av);
    const bn = Number(bv);
    if (an === bn) return a.playerName.localeCompare(b.playerName);
    return sortDir === "asc" ? an - bn : bn - an;
  });
}

export function parseExplorePlayersPage(
  value: string | string[] | undefined
): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = raw ? Number.parseInt(raw, 10) : 1;
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

export function parseExplorePlayersSortDir(
  value: string | string[] | undefined,
  sortKey: PlayerSeasonSortKey
): "asc" | "desc" {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "asc" || raw === "desc") return raw;
  return defaultPlayerSeasonSortDir(sortKey);
}

function attachRelativeTrueShooting(
  rows: ExplorePlayerBoardRow[]
): ExplorePlayerBoardRow[] {
  const ts = rows
    .map((row) => row.trueShootingPct)
    .filter((n): n is number => n != null && Number.isFinite(n) && n > 0);
  if (!ts.length) return rows;
  const mean = ts.reduce((sum, n) => sum + n, 0) / ts.length;
  return rows.map((row) => {
    if (row.trueShootingPct == null || !(row.trueShootingPct > 0)) return row;
    return {
      ...row,
      relativeTrueShootingPct: row.trueShootingPct - mean,
    };
  });
}

function serializeContextPools(
  index: LeaderboardContextIndex
): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const [metricId, values] of index.pools) {
    out[metricId] = values;
  }
  return out;
}

/**
 * Filtered full board → sort → page window → slim rows + Level-2 pools.
 */
export async function getExplorePlayersBoardView(options: {
  filters: BasketballFilters;
  sortKey?: PlayerSeasonSortKey;
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
  /** Skip percentile pools - used for infinite-scroll page fetches. */
  includeContext?: boolean;
}): Promise<ExplorePlayersBoardView> {
  const board = await getPlayerSeasonBoardSnapshot(options.filters);
  const hasDarko = board.rows.some((p) => p.darkoDpm != null);
  const hasLebron = board.rows.some((p) => p.lebron != null);
  const hasDrbl = board.rows.some((p) => hasValidDrblEstimate(p));
  // Prefer WAR1 for registry seasons when present; else DARKO; else PPG.
  const sortKey =
    options.sortKey ??
    (hasDrbl ? "r1WinEquivalents" : hasDarko ? "darkoDpm" : "ppg");
  const sortDir =
    options.sortDir ?? defaultPlayerSeasonSortDir(sortKey);
  const pageSize = options.pageSize ?? EXPLORE_PLAYERS_PAGE_SIZE;

  const mapped = board.rows.map(toExplorePlayerBoardRow);
  const withRelativeTs = attachRelativeTrueShooting(mapped);
  const sorted = sortExplorePlayerRows(withRelativeTs, sortKey, sortDir);
  const totalCount = sorted.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize) || 1);
  const page = Math.min(
    Math.max(1, options.page ?? 1),
    pageCount
  );
  const start = (page - 1) * pageSize;
  const rows = sorted.slice(start, start + pageSize);

  const includeContext = options.includeContext !== false;
  const contextIndex = includeContext
    ? buildLeaderboardContextIndex(board.rows, sortKey)
    : null;

  return {
    rows,
    totalCount,
    page,
    pageSize,
    pageCount,
    sortKey,
    sortDir,
    hasDarko,
    hasLebron,
    hasDrbl,
    boardSampleSize: contextIndex?.sampleSize ?? totalCount,
    contextPools: contextIndex ? serializeContextPools(contextIndex) : {},
    health: board.health,
    source: board.source,
    warnings: board.warnings,
  };
}
