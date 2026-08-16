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
};

type CachedBoard = {
  unfiltered: PlayerSeason[];
  cachedAt: number;
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
  });
}

function hasNarrowingFilters(filters: BasketballFilters): boolean {
  return (
    Boolean(filters.team) ||
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
  const load = boardLoaderOverride ?? getFilteredPlayerSeasonsDetailed;

  const loaded = await load(filters);
  let rows = loaded.rows;
  const error = loaded.error;
  let source: PlayerBoardSource =
    provider.name === "local" && !boardLoaderOverride
      ? "local-sample"
      : "live-espn";
  const warnings: string[] = [];
  let fromCachedRealBoard = false;

  if (provider.name === "local" && !boardLoaderOverride) {
    // Intentionally no last-good path for sample — keep sample explicit.
    const health = await buildHealth({
      providerName: provider.name,
      season,
      rowCount: rows.length,
      error,
      fromCachedRealBoard: false,
    });
    return { rows, health, source: "local-sample", warnings: [] };
  }

  // Seed last-good from a successful real board (prefer unfiltered season board).
  if (error == null && rows.length > 0 && season) {
    if (!hasNarrowingFilters(filters)) {
      seedLastGood(season, rows);
    } else {
      try {
        const full = await getFilteredPlayerSeasonsDetailed({ season });
        if (full.error == null && full.rows.length > 0) {
          seedLastGood(season, full.rows);
        }
      } catch {
        /* ignore */
      }
    }
  } else if (
    boardLoaderOverride &&
    error == null &&
    rows.length > 0 &&
    season
  ) {
    seedLastGood(season, rows);
  }

  // Live miss → process-local last-good real board for this season.
  // Only activate on provider failure — not on a successful empty filter result.
  if (error != null && season) {
    const cached = lastGoodBySeason.get(season);
    if (cached && cached.unfiltered.length > 0) {
      rows = applyPlayerSeasonFilters(cached.unfiltered, filters);
      source = "cached-espn";
      fromCachedRealBoard = true;
      warnings.push(CACHED_WARNING);
      console.warn(
        `[player-board] live board unavailable (${classifyProviderFailure(error).label}); using cached real board for ${season}`
      );
    } else {
      source = "unavailable";
      warnings.push(UNAVAILABLE_WARNING);
      console.warn(
        `[player-board] live board unavailable (${classifyProviderFailure(error).label}); no cached board for ${season}`
      );
    }
  }

  const health = await buildHealth({
    providerName: boardLoaderOverride ? "nba" : provider.name,
    season,
    rowCount: rows.length,
    error,
    fromCachedRealBoard,
  });

  return { rows, health, source, warnings };
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

/** Provider identity for badges — no board fetch. */
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
      ? `Sample data — ${meta.description}`
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
  lastGoodBySeason.set(season, { unfiltered: rows, cachedAt: Date.now() });
}
