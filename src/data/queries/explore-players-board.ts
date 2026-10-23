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
import {
  overlayHustleRatingsForPeers,
  overlayImpactRatingsForPeers,
} from "@/data/queries/players";
import { hasValidDrblEstimate } from "@/data/queries/percentiles";
import {
  isRaptorSeasonAvailable,
  RAPTOR_BOARD_COLUMNS,
} from "@/data/providers/impact/raptor-season";
import { isDarkoSeasonAvailable } from "@/data/providers/nba/darko-season";
import { isHustleStatsSeason } from "@/data/providers/nba/season";
import type { BasketballFilters, PlayerSeason } from "@/data/types";
import {
  DEFAULT_PLAYER_BOARD_VIEWS,
  PLAYER_BOARD_VIEW_COLUMNS,
  type PlayerBoardRate,
  type PlayerBoardView,
} from "@/lib/explore-players-display";
import { boardStatValue } from "@/lib/player-board-stats";
import {
  defaultPlayerSeasonSortDir,
  type PlayerSeasonSortKey,
} from "@/lib/player-season-sort";
import {
  isCurrentNbaSeason,
  isSeasonAwaitingFirstGame,
  leagueRegularSeasonHasOpened,
} from "@/lib/nba-season-status";
import {
  type ExplorePlayerBoardRow,
  slimExplorePlayerBoardRow,
  sortExplorePlayerRows,
  toExplorePlayerBoardRow,
} from "@/data/queries/explore-players-board-pure";
import {
  getExplorePlayersFirstPageSnapshot,
  matchesExplorePlayersFirstPage,
} from "@/data/runtime/explore-players-first-page";

/** Sort keys that need DARKO/RAPTOR on the full board before ordering. */
const IMPACT_OVERLAY_SORT_KEYS = new Set<PlayerSeasonSortKey>([
  "darkoDpm",
  "darkoOff",
  "darkoDef",
  "raptor",
  "oRaptor",
  "dRaptor",
  "winsAdded",
]);

const HUSTLE_SORT_KEYS = new Set<PlayerSeasonSortKey>(
  PLAYER_BOARD_VIEW_COLUMNS.hustle
);

const DARKO_BOARD_COLUMNS = [
  "darkoDpm",
  "darkoOff",
  "darkoDef",
] as const satisfies readonly PlayerSeasonSortKey[];

/** Columns filled only by deferred page overlays — keep visible on cold path. */
const DEFERRED_OVERLAY_COLUMNS = new Set<PlayerSeasonSortKey>([
  ...IMPACT_OVERLAY_SORT_KEYS,
  ...HUSTLE_SORT_KEYS,
]);

/** Mixed / blank season pickers still show overlay columns when any year can have them. */
function seasonMayHaveOverlay(
  season: string,
  available: (canonical: string) => boolean
): boolean {
  const key = String(season ?? "").trim();
  if (!key || key.toUpperCase() === "ALL") return true;
  return available(key);
}

function mergeEmptyColumns(
  base: PlayerSeasonSortKey[],
  ...extras: Array<Iterable<PlayerSeasonSortKey>>
): PlayerSeasonSortKey[] {
  const out = new Set(base);
  for (const extra of extras) {
    for (const key of extra) out.add(key);
  }
  return [...out];
}

/** Overlay families with no source for this season → always hide. */
function unavailableOverlayColumns(
  statsSeason: string
): PlayerSeasonSortKey[] {
  const hide: PlayerSeasonSortKey[] = [];
  if (!seasonMayHaveOverlay(statsSeason, isDarkoSeasonAvailable)) {
    hide.push(...DARKO_BOARD_COLUMNS);
  }
  if (!seasonMayHaveOverlay(statsSeason, isRaptorSeasonAvailable)) {
    hide.push(...RAPTOR_BOARD_COLUMNS);
  }
  if (!seasonMayHaveOverlay(statsSeason, isHustleStatsSeason)) {
    hide.push(...PLAYER_BOARD_VIEW_COLUMNS.hustle);
  }
  return hide;
}

/** Deferred columns that are still blank after page overlays attached. */
function emptyDeferredOverlayColumns(
  rows: Array<Parameters<typeof boardStatValue>[0]>
): PlayerSeasonSortKey[] {
  return [...DEFERRED_OVERLAY_COLUMNS].filter(
    (key) =>
      !rows.some((row) => {
        const v = boardStatValue(row, key, "totals");
        return v != null && v !== 0;
      })
  );
}

export type { ExplorePlayerBoardRow } from "@/data/queries/explore-players-board-pure";
export {
  parseExplorePlayersSortDir,
  slimExplorePlayerBoardRow,
  sortExplorePlayerRows,
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
  /** Board columns with no nonzero value on the full filtered board. */
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
  rows: ExplorePlayerBoardRow[],
  /** Full board for league-mean TS (page window alone would bias the mean). */
  meanSource?: Array<{ trueShootingPct?: number | null }>
): ExplorePlayerBoardRow[] {
  const pool = meanSource ?? rows;
  const ts = pool
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

/** All-zero counts are unpublished history (pre-1973 steals), not real zeros. */
function emptyBoardColumns(
  rows: Array<Parameters<typeof boardStatValue>[0]>
): PlayerSeasonSortKey[] {
  return PLAYER_BOARD_VIEW_COLUMNS.all.filter(
    (key) =>
      !rows.some((row) => {
        const v = boardStatValue(row, key, "totals");
        return v != null && v !== 0;
      })
  );
}

/**
 * Filtered full board → sort → page window → slim rows + Level-2 pools.
 *
 * Cold default (WAR1 / non-impact sorts): load DRBL on the full board for
 * ordering, then attach DARKO/RAPTOR + hustle only on the page window.
 */
export async function getExplorePlayersBoardView(options: {
  filters: BasketballFilters;
  sortKey?: PlayerSeasonSortKey;
  sortDir?: "asc" | "desc";
  rate?: PlayerBoardRate;
  page?: number;
  pageSize?: number;
  /** Active column chips — defaults to All. */
  boardViews?: PlayerBoardView[];
  /** Skip percentile pools - used for infinite-scroll page fetches. */
  includeContext?: boolean;
}): Promise<ExplorePlayersBoardView> {
  if (process.env.SKIP_EXPLORE_FIRST_PAGE !== "1") {
    await import("@/data/runtime/explore-players-first-page").then((m) =>
      m.ensureExplorePlayersFirstPage()
    );
    if (matchesExplorePlayersFirstPage(options)) {
      const baked = getExplorePlayersFirstPageSnapshot();
      if (baked) {
        const view = baked.view as ExplorePlayersBoardView;
        const season = view.statsSeason || options.filters.season || "";
        // Season coverage + whatever stayed blank on the baked page rows
        // (RAPTOR after 2021-22, missing hustle bake, etc.).
        const emptyColumns = mergeEmptyColumns(
          view.emptyColumns ?? [],
          unavailableOverlayColumns(season),
          emptyDeferredOverlayColumns(view.rows)
        );
        const empty = new Set(emptyColumns);
        const raptorGone = RAPTOR_BOARD_COLUMNS.every((k) => empty.has(k));
        const darkoGone = DARKO_BOARD_COLUMNS.every((k) => empty.has(k));
        const hustleGone = PLAYER_BOARD_VIEW_COLUMNS.hustle.every((k) =>
          empty.has(k)
        );
        return {
          ...view,
          hasRaptor: Boolean(view.hasRaptor) && !raptorGone,
          hasDarko: Boolean(view.hasDarko) && !darkoGone,
          hasHustle: Boolean(view.hasHustle) && !hustleGone,
          emptyColumns,
        };
      }
    }
  }

  const requestedSort = options.sortKey;
  const needsFullOverlaysForSort =
    Boolean(requestedSort) &&
    (IMPACT_OVERLAY_SORT_KEYS.has(requestedSort!) ||
      HUSTLE_SORT_KEYS.has(requestedSort!));
  const peerOverlays = needsFullOverlaysForSort ? "full" : "drbl-only";

  const board = await getPlayerSeasonBoardSnapshot(options.filters, {
    peerOverlays,
  });
  const statsSeason = board.statsSeason || options.filters.season || "";
  const hasDrbl = board.rows.some((p) => hasValidDrblEstimate(p));
  const hasDarkoOnBoard = board.rows.some((p) => p.darkoDpm != null);
  // Empty-column scan + sort on PlayerSeason — avoid mapping ~650 fat board
  // rows (and portrait lookups) before the page window. Deferred DARKO /
  // RAPTOR / hustle stay visible until page overlays attach; seasons with no
  // source for a family hide those columns immediately.
  let emptyColumns = mergeEmptyColumns(
    emptyBoardColumns(board.rows).filter(
      (key) => peerOverlays === "full" || !DEFERRED_OVERLAY_COLUMNS.has(key)
    ),
    unavailableOverlayColumns(statsSeason)
  );
  const requested =
    requestedSort && !emptyColumns.includes(requestedSort)
      ? requestedSort
      : undefined;
  // Opening weeks: prefer counting totals so tippers surface above GP=0 shells.
  const earlySeasonBoard =
    Boolean(options.filters.season) &&
    isCurrentNbaSeason(options.filters.season!) &&
    leagueRegularSeasonHasOpened(options.filters.season!) &&
    !board.rows.some((row) => row.gamesPlayed >= 10);
  // Prefer WAR1 for registry seasons when present; else DARKO; else PPG.
  const sortKey =
    requested ??
    (earlySeasonBoard
      ? "ppg"
      : hasDrbl
        ? "r1WinEquivalents"
        : hasDarkoOnBoard || isDarkoSeasonAvailable(statsSeason)
          ? "darkoDpm"
          : "ppg");
  // Default darko sort after a drbl-only load needs impact on the full board.
  let sortBoard: PlayerSeason[] = board.rows;
  if (
    peerOverlays === "drbl-only" &&
    IMPACT_OVERLAY_SORT_KEYS.has(sortKey)
  ) {
    sortBoard = await overlayImpactRatingsForPeers(board.rows, statsSeason);
  } else if (
    peerOverlays === "drbl-only" &&
    HUSTLE_SORT_KEYS.has(sortKey)
  ) {
    sortBoard = await overlayHustleRatingsForPeers(board.rows, statsSeason);
  }
  const sortDir =
    (requested ? options.sortDir : undefined) ??
    defaultPlayerSeasonSortDir(sortKey);
  const pageSize = options.pageSize ?? EXPLORE_PLAYERS_PAGE_SIZE;

  const sortedSeasons = sortExplorePlayerRows(
    sortBoard,
    sortKey,
    sortDir,
    options.rate
  );
  const totalCount = sortedSeasons.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize) || 1);
  const page = Math.min(
    Math.max(1, options.page ?? 1),
    pageCount
  );
  const start = (page - 1) * pageSize;
  const boardViews = options.boardViews?.length
    ? options.boardViews
    : DEFAULT_PLAYER_BOARD_VIEWS;
  let pageSeasons = sortedSeasons.slice(start, start + pageSize);
  if (peerOverlays === "drbl-only") {
    // Full-board upgrade already attached the active sort overlay; fill the
    // other deferred overlays on the page window for All-view columns.
    if (!IMPACT_OVERLAY_SORT_KEYS.has(sortKey)) {
      pageSeasons = await overlayImpactRatingsForPeers(
        pageSeasons,
        statsSeason
      );
    }
    if (!HUSTLE_SORT_KEYS.has(sortKey)) {
      pageSeasons = await overlayHustleRatingsForPeers(
        pageSeasons,
        statsSeason
      );
    }
    // Drop deferred headers that stayed blank after overlays (missing bake,
    // coverage gap, or thin sample) instead of leaving empty SORT columns.
    emptyColumns = mergeEmptyColumns(
      emptyColumns,
      emptyDeferredOverlayColumns([...sortBoard, ...pageSeasons])
    );
  }
  const mappedPage = attachRelativeTrueShooting(
    pageSeasons.map(toExplorePlayerBoardRow),
    sortBoard
  );
  const rows = mappedPage.map((row) =>
    slimExplorePlayerBoardRow(row, boardViews, sortKey)
  );

  const includeContext = options.includeContext !== false;
  const contextIndex = includeContext
    ? buildLeaderboardContextIndex(sortBoard, sortKey)
    : null;
  const hasDarko =
    seasonMayHaveOverlay(statsSeason, isDarkoSeasonAvailable) &&
    (sortBoard.some((p) => p.darkoDpm != null) ||
      pageSeasons.some((p) => p.darkoDpm != null) ||
      isDarkoSeasonAvailable(statsSeason));
  const hasRaptor =
    seasonMayHaveOverlay(statsSeason, isRaptorSeasonAvailable) &&
    (sortBoard.some((p) => p.raptor != null) ||
      pageSeasons.some((p) => p.raptor != null));
  const hasHustle =
    seasonMayHaveOverlay(statsSeason, isHustleStatsSeason) &&
    (sortBoard.some(
      (p) =>
        p.hustleDeflections != null ||
        p.hustleContestedShots != null ||
        p.hustleScreenAssists != null ||
        p.hustleChargesDrawn != null ||
        p.hustleLooseBallsRecovered != null ||
        p.hustleBoxOuts != null
    ) ||
      pageSeasons.some(
        (p) =>
          p.hustleDeflections != null ||
          p.hustleContestedShots != null ||
          p.hustleScreenAssists != null ||
          p.hustleChargesDrawn != null ||
          p.hustleLooseBallsRecovered != null ||
          p.hustleBoxOuts != null
      ));

  const season = options.filters.season ?? "";
  // Placeholders / "hasn't started" follow the calendar tip only. Prior-season
  // stats (pre-tip) use PriorSeasonStatsNotice via usingPriorSeasonStats; do not
  // blank real early-season GP after opening night.
  const seasonAwaitingGames = isSeasonAwaitingFirstGame(season, board.rows);

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
