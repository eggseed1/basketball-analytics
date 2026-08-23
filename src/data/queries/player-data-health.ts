/**
 * Soft-fail player-season board snapshot with real last-good cache.
 *
 * Hierarchy (live nba provider):
 *   live ESPN board → process-local last-good real board → unavailable
 *
 * Historical fill inside getFilteredPlayerSeasonsDetailed remains allowed
 * (real data). NEVER substitutes LocalDataProvider/sample under nba.
 */

import { getDataProvider } from "@/data/providers";
import { cacheExists } from "@/data/providers/historical/games-cache";
import type { BasketballFilters, PlayerSeason } from "@/data/types";
import {
  assessPlayerBoardHealth,
  type PlayerBoardHealth,
} from "@/data/diagnostics/player-board-health";
import { classifyProviderFailure } from "@/data/diagnostics/provider-failure";
import { describeProvider } from "@/data/diagnostics/provider-meta";
import { applyPlayerSeasonFilters } from "./filter-utils";
import { getFilteredPlayerSeasonsDetailed } from "./players";
import {
  priorSeasonForStats,
  priorSeasonStatsNotice,
  shouldUsePriorSeasonBoardStats,
} from "@/lib/player-board-season";
import { isPreseasonRosterSeason } from "@/data/providers/nba/espn-roster-client";

export type PlayerBoardSource =
  | "live-espn"
  | "cached-espn"
  | "local-sample"
  | "unavailable";

export type PlayerSeasonBoardSnapshot = {
  rows: PlayerSeason[];
  health: PlayerBoardHealth;
  source: PlayerBoardSource;
  warnings: string[];
  requestSeason: string;
  statsSeason: string;
  usingPriorSeasonStats: boolean;
};

type CachedBoard = {
  unfiltered: PlayerSeason[];
  cachedAt: number;
  /** True when the snapshot is serving last-good data after a live miss. */
  servingFromFallback?: boolean;
};

/** Process-local last-good REAL boards keyed by season. Never stores sample. */
const lastGoodBySeason = new Map<string, CachedBoard>();

type BoardLoader = (filters: BasketballFilters) => Promise<{
  rows: PlayerSeason[];
  error: unknown | null;
}>;

let boardLoaderOverride: BoardLoader | null = null;

const CACHED_WARNING =
  "Live player data temporarily unavailable; showing the most recent verified data.";

const UNAVAILABLE_WARNING =
  "Live player data is temporarily unavailable. Please try again shortly.";

function seedLastGood(season: string, unfiltered: PlayerSeason[]) {
  if (!season || unfiltered.length === 0) return;
  // Allow seeding under test overrides even when default provider is local.
  if (getDataProvider().name === "local" && !boardLoaderOverride) return;
  lastGoodBySeason.set(season, {
    unfiltered,
    cachedAt: Date.now(),
    servingFromFallback: false,
  });
}

function hasNarrowingFilters(filters: BasketballFilters): boolean {
  return (
    Boolean(filters.team) ||
    Boolean(filters.conference) ||
    Boolean(filters.draftClass) ||
    Boolean(filters.position) ||
    Boolean(filters.player) ||
    (filters.minimumMinutes != null && filters.minimumMinutes > 0) ||
    (filters.minimumGames != null && filters.minimumGames > 0)
  );
}

/**
 * Load filtered player-season rows once and attach board health + source.
 */
export async function getPlayerSeasonBoardSnapshot(
  filters: BasketballFilters = {}
): Promise<PlayerSeasonBoardSnapshot> {
  const provider = getDataProvider();
  const season = filters.season ?? "";
  const requestSeason = season;
  let statsSeason = season;
  let usingPriorSeasonStats = false;
  const load = boardLoaderOverride ?? getFilteredPlayerSeasonsDetailed;

  // During the known pre-tip window, the current league year only has roster
  // shells (GP=0). Go straight to the completed season board instead of first
  // crawling all 30 ESPN team rosters and then loading the prior board.
  if (
    season &&
    season.toUpperCase() !== "ALL" &&
    (provider.name !== "local" || Boolean(boardLoaderOverride)) &&
    isPreseasonRosterSeason(season)
  ) {
    statsSeason = priorSeasonForStats(season);
    usingPriorSeasonStats = true;
  }

  if (provider.name === "local" && !boardLoaderOverride) {
    const loaded = await load(filters);
    const health = await buildHealth({
      providerName: provider.name,
      season,
      rowCount: loaded.rows.length,
      error: loaded.error,
      fromCachedRealBoard: false,
    });
    return {
      rows: loaded.rows,
      health,
      source: "local-sample",
      warnings: [],
      requestSeason,
      statsSeason,
      usingPriorSeasonStats,
    };
  }

  const cached =
    statsSeason && statsSeason.toUpperCase() !== "ALL"
      ? lastGoodBySeason.get(statsSeason)
      : undefined;
  const narrowing = hasNarrowingFilters(filters);

  // Draft class / team / position / minutes only re-filter the season snapshot.
  if (cached && cached.unfiltered.length > 0 && narrowing) {
    const rows = applyPlayerSeasonFilters(cached.unfiltered, {
      ...filters,
      season: statsSeason,
    });
    const health = await buildHealth({
      providerName: boardLoaderOverride ? "nba" : provider.name,
      season: statsSeason,
      rowCount: rows.length,
      error: null,
      fromCachedRealBoard: Boolean(cached.servingFromFallback),
    });
    return {
      rows,
      health,
      source: cached.servingFromFallback ? "cached-espn" : "live-espn",
      warnings: [
        ...(usingPriorSeasonStats
          ? [priorSeasonStatsNotice(requestSeason, statsSeason)]
          : []),
        ...(cached.servingFromFallback ? [CACHED_WARNING] : []),
      ],
      requestSeason,
      statsSeason,
      usingPriorSeasonStats,
    };
  }

  // All-seasons mode needs the player name (and other filters) inside the loader
  // so career matches can be merged. Single-season mode can load the season
  // snapshot once, then re-filter.
  const loaded = await load(
    season.toUpperCase() === "ALL"
      ? filters
      : narrowing && statsSeason
        ? { season: statsSeason }
        : { ...filters, season: statsSeason }
  );
  let unfilteredRows = loaded.rows;
  let rows = loaded.rows;
  const error = loaded.error;
  let source: PlayerBoardSource = "live-espn";
  const warnings: string[] = [];
  if (usingPriorSeasonStats) {
    warnings.push(priorSeasonStatsNotice(requestSeason, statsSeason));
  }
  let fromCachedRealBoard = false;

  if (
    error == null &&
    unfilteredRows.length > 0 &&
    season &&
    season.toUpperCase() !== "ALL"
  ) {
    seedLastGood(statsSeason, unfilteredRows);
    rows = applyPlayerSeasonFilters(unfilteredRows, {
      ...filters,
      season: statsSeason,
    });
  } else if (error == null && unfilteredRows.length > 0 && season.toUpperCase() === "ALL") {
    // Loader already applied filters for the all-seasons merge path.
    rows = applyPlayerSeasonFilters(unfilteredRows, { ...filters, season: undefined });
  }

  // Pre-tip current season: show last completed season stats on the board.
  if (
    error == null &&
    !usingPriorSeasonStats &&
    season &&
    season.toUpperCase() !== "ALL" &&
    shouldUsePriorSeasonBoardStats(season, unfilteredRows)
  ) {
    const priorSeason = priorSeasonForStats(season);
    const priorLoaded = await load({ season: priorSeason });
    if (priorLoaded.error == null && priorLoaded.rows.length > 0) {
      statsSeason = priorSeason;
      usingPriorSeasonStats = true;
      unfilteredRows = priorLoaded.rows;
      rows = applyPlayerSeasonFilters(priorLoaded.rows, {
        ...filters,
        season: priorSeason,
      });
      warnings.push(priorSeasonStatsNotice(season, priorSeason));
    }
  }

  // Live miss → process-local last-good real board for this season.
  // Only activate on provider failure - not on a successful empty filter result.
  if (error != null && season) {
    const cached = lastGoodBySeason.get(statsSeason);
    if (cached && cached.unfiltered.length > 0) {
      rows = applyPlayerSeasonFilters(cached.unfiltered, {
        ...filters,
        season: statsSeason,
      });
      source = "cached-espn";
      fromCachedRealBoard = true;
      cached.servingFromFallback = true;
      lastGoodBySeason.set(statsSeason, cached);
      warnings.push(CACHED_WARNING);
      console.warn(
        `[player-board] live board unavailable (${classifyProviderFailure(error).label}); using cached real board for ${statsSeason}`
      );
    } else {
      source = "unavailable";
      warnings.push(UNAVAILABLE_WARNING);
      console.warn(
        `[player-board] live board unavailable (${classifyProviderFailure(error).label}); no cached board for ${statsSeason}`
      );
    }
  }

  const health = await buildHealth({
    providerName: boardLoaderOverride ? "nba" : provider.name,
    season: usingPriorSeasonStats ? statsSeason : season,
    rowCount: rows.length,
    error: usingPriorSeasonStats ? null : error,
    fromCachedRealBoard,
  });

  return {
    rows,
    health,
    source,
    warnings,
    requestSeason,
    statsSeason,
    usingPriorSeasonStats,
  };
}

async function buildHealth(input: {
  providerName: string;
  season: string;
  rowCount: number;
  error: unknown | null;
  fromCachedRealBoard: boolean;
}): Promise<PlayerBoardHealth> {
  let historicalGamesCachePresent: boolean | null = null;
  if (input.season) {
    try {
      historicalGamesCachePresent = await cacheExists(input.season);
    } catch {
      historicalGamesCachePresent = null;
    }
  }
  return assessPlayerBoardHealth({
    providerName: input.providerName,
    season: input.season || "(unspecified)",
    rowCount: input.rowCount,
    error: input.error ?? undefined,
    historicalGamesCachePresent,
    fromCachedRealBoard: input.fromCachedRealBoard,
  });
}

/** Provider identity for badges - no board fetch. */
export function getActiveProviderChip(): {
  name: string;
  description: string;
  isSample: boolean;
  isLive: boolean;
  label: string;
} {
  const provider = getDataProvider();
  const meta = describeProvider(provider.name);
  return {
    ...meta,
    label: meta.isSample
      ? `Sample data - ${meta.description}`
      : meta.isLive
        ? "Data: Live NBA"
        : `Data: ${meta.name}`,
  };
}

export function __setPlayerBoardLoaderForTests(loader: BoardLoader | null) {
  boardLoaderOverride = loader;
}

export function __resetPlayerBoardCacheForTests() {
  lastGoodBySeason.clear();
  boardLoaderOverride = null;
}

export function __seedPlayerBoardCacheForTests(
  season: string,
  rows: PlayerSeason[]
) {
  lastGoodBySeason.set(season, {
    unfiltered: rows,
    cachedAt: Date.now(),
    servingFromFallback: true,
  });
}
