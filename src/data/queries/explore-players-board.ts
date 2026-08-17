/**
 * Explore Players board view — server-side filter/sort/window + slim rows.
 * Full board stays in the query/cache layer; the browser gets one page.
 */

import {
  buildLeaderboardContextIndex,
  type LeaderboardContextIndex,
} from "@/analytics/leaderboard-context";
import { getPlayerSeasonBoardSnapshot } from "@/data/queries/player-data-health";
import type { BasketballFilters, PlayerSeason } from "@/data/types";
import {
  defaultPlayerSeasonSortDir,
  type PlayerSeasonSortKey,
} from "@/lib/player-season-sort";

export const EXPLORE_PLAYERS_PAGE_SIZE = 100;

/** Display + Level-2 context fields only — not the full canonical PlayerSeason. */
export type ExplorePlayerBoardRow = {
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
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
  mpg: number;
  ppg: number;
  rpg: number;
  apg: number;
  spg: number;
  bpg: number;
  tov: number;
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
  if (p.darkoDef != null) row.darkoDef = p.darkoDef;
  if (p.lebron != null) row.lebron = p.lebron;
  if (p.oLebron != null) row.oLebron = p.oLebron;
  if (p.dLebron != null) row.dLebron = p.dLebron;
  return row;
}

function sortKeyIsImpact(key: PlayerSeasonSortKey): boolean {
  return key === "darkoDpm" || key === "lebron";
}

function sortKeyIsOptionalRating(key: PlayerSeasonSortKey): boolean {
  return (
    key === "offensiveRating" ||
    key === "defensiveRating" ||
    key === "netRating" ||
    key === "trueShootingPct" ||
    key === "effectiveFieldGoalPct" ||
    key === "usagePct" ||
    sortKeyIsImpact(key)
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
    if (sortKeyIsOptionalRating(key) || sortKeyIsImpact(key)) {
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
}): Promise<ExplorePlayersBoardView> {
  const board = await getPlayerSeasonBoardSnapshot(options.filters);
  const hasDarko = board.rows.some((p) => p.darkoDpm != null);
  const hasLebron = board.rows.some((p) => p.lebron != null);
  const sortKey =
    options.sortKey ?? (hasDarko ? "darkoDpm" : "ppg");
  const sortDir =
    options.sortDir ?? defaultPlayerSeasonSortDir(sortKey);
  const pageSize = options.pageSize ?? EXPLORE_PLAYERS_PAGE_SIZE;

  const mapped = board.rows.map(toExplorePlayerBoardRow);
  const sorted = sortExplorePlayerRows(mapped, sortKey, sortDir);
  const totalCount = sorted.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize) || 1);
  const page = Math.min(
    Math.max(1, options.page ?? 1),
    pageCount
  );
  const start = (page - 1) * pageSize;
  const rows = sorted.slice(start, start + pageSize);

  // Percentiles over the full filtered board (not just the page).
  const contextIndex = buildLeaderboardContextIndex(board.rows, sortKey);

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
    boardSampleSize: contextIndex.sampleSize,
    contextPools: serializeContextPools(contextIndex),
    health: board.health,
    source: board.source,
    warnings: board.warnings,
  };
}
