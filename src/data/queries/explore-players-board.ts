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
import type { BasketballFilters } from "@/data/types";
import {
  DEFAULT_PLAYER_BOARD_VIEWS,
  type PlayerBoardView,
  type PlayerBoardRate,
} from "@/lib/explore-players-display";
import {
  defaultPlayerSeasonSortDir,
  type PlayerSeasonSortKey,
} from "@/lib/player-season-sort";
import { isCurrentNbaSeason } from "@/lib/nba-season-status";
import {
  isSeasonAwaitingFirstGame,
  leagueRegularSeasonHasOpened,
} from "@/lib/nba-season-status-schedule";
import {
  type ExplorePlayerBoardRow,
  emptyBoardColumns,
  sortExplorePlayerRows,
  slimExplorePlayerBoardRow,
  toExplorePlayerBoardRow,
} from "@/data/queries/explore-players-board-pure";

export type { ExplorePlayerBoardRow } from "@/data/queries/explore-players-board-pure";
export {
  emptyBoardColumns,
  parseExplorePlayersSortDir,
  sortExplorePlayerRows,
  slimExplorePlayerBoardRow,
  toExplorePlayerBoardRow,
} from "@/data/queries/explore-players-board-pure";

/** First paint window; infinite scroll loads the rest. Budget ≤50 (p18perf). */
export const EXPLORE_PLAYERS_PAGE_SIZE = 25;

export type ExplorePlayersBoardView = {
  rows: ExplorePlayerBoardRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  pageCount: number;
  sortKey: PlayerSeasonSortKey;
  sortDir: "asc" | "desc";
  hasDarko: boolean;
  hasRaptor: boolean;
  hasDrbl: boolean;
  hasHustle: boolean;
  /** Board columns missing on every row (null) — zeros stay visible. */
  emptyColumns: PlayerSeasonSortKey[];
  /** Full filtered board size used for Level-2 percentile pools. */
  boardSampleSize: number;
  /** Serializable percentile pools for the active sort (full board). */
  contextPools: Record<string, number[]>;
  health: Awaited<ReturnType<typeof getPlayerSeasonBoardSnapshot>>["health"];
  source: Awaited<ReturnType<typeof getPlayerSeasonBoardSnapshot>>["source"];
  warnings: string[];
  /** Current season before any regular-season games — stats show as placeholders. */
  seasonAwaitingGames: boolean;
  requestSeason: string;
  statsSeason: string;
  usingPriorSeasonStats: boolean;
};

export function parseExplorePlayersPage(
  value: string | string[] | undefined
): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = raw ? Number.parseInt(raw, 10) : 1;
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
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
  rate?: PlayerBoardRate;
  boardViews?: PlayerBoardView[];
  page?: number;
  pageSize?: number;
  /** Skip percentile pools - used for infinite-scroll page fetches. */
  includeContext?: boolean;
}): Promise<ExplorePlayersBoardView> {
  const board = await getPlayerSeasonBoardSnapshot(options.filters);
  const hasDarko = board.rows.some((p) => p.darkoDpm != null);
  const hasRaptor = board.rows.some((p) => p.raptor != null);
  const hasDrbl = board.rows.some((p) => hasValidDrblEstimate(p));
  const hasHustle = board.rows.some(
    (p) =>
      p.hustleDeflections != null ||
      p.hustleContestedShots != null ||
      p.hustleScreenAssists != null ||
      p.hustleChargesDrawn != null ||
      p.hustleLooseBallsRecovered != null ||
      p.hustleBoxOuts != null
  );
  const mapped = board.rows.map(toExplorePlayerBoardRow);
  const emptyColumns = emptyBoardColumns(mapped);
  const requested =
    options.sortKey && !emptyColumns.includes(options.sortKey)
      ? options.sortKey
      : undefined;
  // Opening weeks: prefer counting totals so tippers surface above GP=0 shells.
  const earlySeasonBoard =
    Boolean(options.filters.season) &&
    isCurrentNbaSeason(options.filters.season!) &&
    await leagueRegularSeasonHasOpened(options.filters.season!) &&
    !board.rows.some((row) => row.gamesPlayed >= 10);
  // Prefer WAR1 for registry seasons when present; else DARKO; else PPG.
  const sortKey =
    requested ??
    (earlySeasonBoard
      ? "ppg"
      : hasDrbl
        ? "r1WinEquivalents"
        : hasDarko
          ? "darkoDpm"
          : "ppg");
  const sortDir =
    (requested ? options.sortDir : undefined) ??
    defaultPlayerSeasonSortDir(sortKey);
  const pageSize = options.pageSize ?? EXPLORE_PLAYERS_PAGE_SIZE;

  const withRelativeTs = attachRelativeTrueShooting(mapped);
  const sorted = sortExplorePlayerRows(
    withRelativeTs,
    sortKey,
    sortDir,
    options.rate
  );
  const totalCount = sorted.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize) || 1);
  const page = Math.min(
    Math.max(1, options.page ?? 1),
    pageCount
  );
  const start = (page - 1) * pageSize;
  const boardViews = options.boardViews?.length
    ? options.boardViews
    : DEFAULT_PLAYER_BOARD_VIEWS;
  const rows = sorted
    .slice(start, start + pageSize)
    .map((row) => slimExplorePlayerBoardRow(row, boardViews, sortKey));

  const includeContext = options.includeContext !== false;
  const contextIndex = includeContext
    ? buildLeaderboardContextIndex(board.rows, sortKey)
    : null;

  const season = options.filters.season ?? "";
  // Placeholders / "hasn't started" follow the calendar tip only. Prior-season
  // stats (pre-tip) use PriorSeasonStatsNotice via usingPriorSeasonStats; do not
  // blank real early-season GP after opening night.
  const seasonAwaitingGames = await isSeasonAwaitingFirstGame(season, board.rows);

  return {
    rows,
    totalCount,
    page,
    pageSize,
    pageCount,
    sortKey,
    sortDir,
    hasDarko,
    hasRaptor,
    hasDrbl,
    hasHustle,
    emptyColumns,
    boardSampleSize: contextIndex?.sampleSize ?? totalCount,
    contextPools: contextIndex ? serializeContextPools(contextIndex) : {},
    health: board.health,
    source: board.source,
    warnings: board.warnings,
    seasonAwaitingGames,
    requestSeason: board.requestSeason,
    statsSeason: board.statsSeason,
    usingPriorSeasonStats: board.usingPriorSeasonStats,
  };
}
