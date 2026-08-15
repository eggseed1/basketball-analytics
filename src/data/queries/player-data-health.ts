/**
 * Player-season board snapshot with health — reuses one board fetch.
 */

import { getDataProvider } from "@/data/providers";
import { cacheExists } from "@/data/providers/historical/games-cache";
import type { BasketballFilters, PlayerSeason } from "@/data/types";
import {
  assessPlayerBoardHealth,
  type PlayerBoardHealth,
} from "@/data/diagnostics/player-board-health";
import { describeProvider } from "@/data/diagnostics/provider-meta";
import { getFilteredPlayerSeasonsDetailed } from "./players";

export type PlayerSeasonBoardSnapshot = {
  rows: PlayerSeason[];
  health: PlayerBoardHealth;
};

/**
 * Load filtered player-season rows once and attach board health.
 * Does not add a second ESPN board request beyond the normal board load.
 */
export async function getPlayerSeasonBoardSnapshot(
  filters: BasketballFilters = {}
): Promise<PlayerSeasonBoardSnapshot> {
  const provider = getDataProvider();
  const season = filters.season ?? "";
  const { rows, error } = await getFilteredPlayerSeasonsDetailed(filters);

  let historicalGamesCachePresent: boolean | null = null;
  if (season) {
    try {
      historicalGamesCachePresent = await cacheExists(season);
    } catch {
      historicalGamesCachePresent = null;
    }
  }

  const health = assessPlayerBoardHealth({
    providerName: provider.name,
    season: season || "(unspecified)",
    rowCount: rows.length,
    error: error ?? undefined,
    historicalGamesCachePresent,
  });

  return { rows, health };
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
