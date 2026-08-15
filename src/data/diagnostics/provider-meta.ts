/**
 * Human-readable provider metadata — derived from provider `name` values.
 */

export type KnownProviderName = "nba" | "local" | string;

export type ProviderStatus = {
  name: string;
  description: string;
  isSample: boolean;
  isLive: boolean;
};

/** Local sample corpus sizes (must stay in sync with local-sample-data). */
export const LOCAL_SAMPLE_PLAYER_COUNT = 15;
export const LOCAL_SAMPLE_PLAYER_SEASON_COUNT = 17;

/**
 * Modern ESPN athlete boards are typically hundreds of rows.
 * Below this for a modern season, treat as suspiciously sample-sized
 * (not a hard "must be ≥N" product rule).
 */
export const MODERN_LIVE_BOARD_HEALTHY_MIN = 200;

/** Seasons at/after this start year are expected to have ESPN player boards. */
export const ESPN_PLAYER_BOARD_RELIABLE_START_YEAR = 2000;

export function describeProvider(providerName: string): ProviderStatus {
  const name = providerName.toLowerCase();
  if (name === "nba") {
    return {
      name: "nba",
      description: "Live ESPN-backed NBA data",
      isSample: false,
      isLive: true,
    };
  }
  if (name === "local") {
    return {
      name: "local",
      description: "Local sample dataset",
      isSample: true,
      isLive: false,
    };
  }
  return {
    name: providerName,
    description: `Custom provider (${providerName})`,
    isSample: false,
    isLive: false,
  };
}

export function configuredDataProviderKey(): string {
  return (process.env.DATA_PROVIDER ?? "local").toLowerCase();
}
