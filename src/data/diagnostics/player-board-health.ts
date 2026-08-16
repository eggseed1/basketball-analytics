/**
 * Player-season board health — distinguish sample / empty / unsupported / failure.
 * Pure assessment over already-fetched rows (no network).
 */

import {
  ESPN_PLAYER_BOARD_RELIABLE_START_YEAR,
  LOCAL_SAMPLE_PLAYER_COUNT,
  LOCAL_SAMPLE_PLAYER_SEASON_COUNT,
  MODERN_LIVE_BOARD_HEALTHY_MIN,
  describeProvider,
  type ProviderStatus,
} from "./provider-meta";
import { startYearFromCanonicalSeason } from "@/data/providers/historical/season-range";

export type PlayerBoardHealthStatus =
  | "healthy"
  | "cached_board"
  | "sample_dataset"
  | "sample_sized_unexpected"
  | "empty_qualifying"
  | "board_unavailable"
  | "season_unsupported"
  | "provider_failure";

export type PlayerBoardHealth = {
  provider: string;
  providerDescription: string;
  providerMeta: ProviderStatus;
  season: string;
  rowCount: number;
  isSampleData: boolean;
  status: PlayerBoardHealthStatus;
  /** Short operator-facing label */
  label: string;
  /** User-facing explanation */
  message: string;
  /** Historical game cache may exist even when player boards do not. */
  historicalGamesCachePresent: boolean | null;
  seasonStartYear: number | null;
  espnBoardExpected: boolean;
};

export type AssessPlayerBoardHealthInput = {
  providerName: string;
  season: string;
  rowCount: number;
  /** Provider/query threw while loading the board. */
  error?: unknown;
  /** Optional: ignored game cache presence (not a PlayerSeason board). */
  historicalGamesCachePresent?: boolean | null;
  /**
   * When rows come from process-local last-good real board after a live miss.
   * Never set for sample/local corpora.
   */
  fromCachedRealBoard?: boolean;
};

function seasonStartYear(season: string): number | null {
  try {
    return startYearFromCanonicalSeason(season);
  } catch {
    return null;
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Unknown provider error";
}

/**
 * Assess player-season board health from counts already in hand.
 * Does not fetch. Does not treat 0 rows as “data loss”.
 */
export function assessPlayerBoardHealth(
  input: AssessPlayerBoardHealthInput
): PlayerBoardHealth {
  const meta = describeProvider(input.providerName);
  const start = seasonStartYear(input.season);
  const espnBoardExpected =
    start != null && start >= ESPN_PLAYER_BOARD_RELIABLE_START_YEAR;
  const gamesCache = input.historicalGamesCachePresent ?? null;
  const base = {
    provider: meta.name,
    providerDescription: meta.description,
    providerMeta: meta,
    season: input.season,
    rowCount: input.rowCount,
    historicalGamesCachePresent: gamesCache,
    seasonStartYear: start,
    espnBoardExpected,
  };

  if (input.error != null) {
    // Pre-modern boards often 500 from ESPN — not the same as a live outage.
    if (!espnBoardExpected) {
      const cacheNote =
        gamesCache === true
          ? " Historical game cache may exist for this season, but that is not a PlayerSeason board."
          : gamesCache === false
            ? " No historical game cache is present for this season either."
            : "";
      return {
        ...base,
        isSampleData: meta.isSample,
        status: "season_unsupported",
        label: "Season unsupported",
        message: `Player-season board data is unavailable for ${input.season} from the current provider (${errorMessage(input.error)}).${cacheNote}`,
      };
    }
    // Live failed but we still have a verified real board snapshot.
    if (input.fromCachedRealBoard && input.rowCount > 0) {
      return {
        ...base,
        isSampleData: false,
        status: "cached_board",
        label: "Cached board",
        message:
          "Live player data temporarily unavailable; showing the most recent verified data.",
      };
    }
    return {
      ...base,
      isSampleData: meta.isSample,
      status: "provider_failure",
      label: "Provider failure",
      message: meta.isLive
        ? "Live player data is temporarily unavailable. Please try again shortly."
        : `Player data could not be loaded. ${errorMessage(input.error)}`,
    };
  }

  if (input.fromCachedRealBoard && input.rowCount > 0) {
    return {
      ...base,
      isSampleData: false,
      status: "cached_board",
      label: "Cached board",
      message:
        "Live player data temporarily unavailable; showing the most recent verified data.",
    };
  }

  if (meta.isSample) {
    return {
      ...base,
      isSampleData: true,
      status: "sample_dataset",
      label: "Sample dataset",
      message: `This environment is using the local sample dataset (${LOCAL_SAMPLE_PLAYER_COUNT} players · ${LOCAL_SAMPLE_PLAYER_SEASON_COUNT} player-season rows in corpus). Not the full NBA board.`,
    };
  }

  if (input.rowCount === 0) {
    if (!espnBoardExpected) {
      const cacheNote =
        gamesCache === true
          ? " Historical game cache may exist for this season, but that is not a PlayerSeason board."
          : gamesCache === false
            ? " No historical game cache is present for this season either."
            : "";
      return {
        ...base,
        isSampleData: false,
        status: "season_unsupported",
        label: "Season unsupported",
        message: `Player-season board data is unavailable for ${input.season} from the current provider.${cacheNote}`,
      };
    }

    return {
      ...base,
      isSampleData: false,
      status: "board_unavailable",
      label: "Board unavailable",
      message: `No player-season board rows returned for ${input.season}. This is not automatically data loss — the live source may be empty or unreachable for this season.`,
    };
  }

  // Live provider returned rows, but count looks like the local sample corpus.
  if (
    espnBoardExpected &&
    input.rowCount > 0 &&
    input.rowCount <= LOCAL_SAMPLE_PLAYER_SEASON_COUNT + 5
  ) {
    return {
      ...base,
      isSampleData: false,
      status: "sample_sized_unexpected",
      label: "Unexpectedly small board",
      message: `Only ${input.rowCount} player-season rows for ${input.season} under the live provider. A modern NBA board is usually hundreds of rows — check that DATA_PROVIDER was not intended to be local, and that filters are not over-narrow.`,
    };
  }

  if (espnBoardExpected && input.rowCount < MODERN_LIVE_BOARD_HEALTHY_MIN) {
    return {
      ...base,
      isSampleData: false,
      status: "empty_qualifying",
      label: "Thin board",
      message: `${input.rowCount} qualifying player-season rows for ${input.season}. Below the usual modern live-board range (≥${MODERN_LIVE_BOARD_HEALTHY_MIN}) — verify filters and season.`,
    };
  }

  if (input.rowCount > 0) {
    return {
      ...base,
      isSampleData: false,
      status: "healthy",
      label: "Healthy",
      message: `Live NBA player-season board loaded for ${input.season} (${input.rowCount} rows).`,
    };
  }

  return {
    ...base,
    isSampleData: false,
    status: "empty_qualifying",
    label: "No qualifying rows",
    message: "No qualifying player-season rows found.",
  };
}

export function formatPlayerBoardHealthReport(
  health: PlayerBoardHealth,
  extras?: { lebron?: string; jokic?: string }
): string {
  const lines = [
    `Provider: ${health.provider}`,
    `Description: ${health.providerDescription}`,
    `Season: ${health.season}`,
    `Player-season rows: ${health.rowCount}`,
    `Status: ${health.status}`,
    `Label: ${health.label}`,
  ];
  if (extras?.lebron) lines.push(`LeBron: ${extras.lebron}`);
  if (extras?.jokic) lines.push(`Jokic: ${extras.jokic}`);
  if (health.historicalGamesCachePresent != null) {
    lines.push(
      `Historical games cache: ${health.historicalGamesCachePresent ? "present" : "absent"} (not a PlayerSeason board)`
    );
  }
  lines.push(`Message: ${health.message}`);
  return lines.join("\n");
}
