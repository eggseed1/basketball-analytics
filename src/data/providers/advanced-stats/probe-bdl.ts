/**
 * Live probe of BallDontLie advanced / season-average endpoints.
 * Uses the existing BallDontLieClient auth pattern. Does not paginate league-wide.
 */

import {
  BallDontLieError,
  createBallDontLieClient,
  getBallDontLieApiKey,
} from "@/data/providers/balldontlie/client";

export type BdlAdvancedAccessProbe = {
  apiKeyPresent: boolean;
  playersEndpoint: "ok" | "unauthorized" | "error" | "skipped";
  gameAdvanced: "ok" | "unauthorized" | "error" | "skipped";
  seasonAveragesAdvanced: "ok" | "unauthorized" | "error" | "skipped";
  seasonAveragesUsage: "ok" | "unauthorized" | "error" | "skipped";
  notes: string[];
};

async function classify(
  run: () => Promise<unknown>
): Promise<"ok" | "unauthorized" | "error"> {
  try {
    await run();
    return "ok";
  } catch (err) {
    if (err instanceof BallDontLieError && err.status === 401) {
      return "unauthorized";
    }
    return "error";
  }
}

/**
 * Minimal access check — one page / one player where possible.
 * Skip network when `skipNetwork` is true (unit tests).
 */
export async function probeBallDontLieAdvancedAccess(options?: {
  skipNetwork?: boolean;
}): Promise<BdlAdvancedAccessProbe> {
  const notes: string[] = [];
  const apiKeyPresent = Boolean(getBallDontLieApiKey());

  if (options?.skipNetwork) {
    return {
      apiKeyPresent,
      playersEndpoint: "skipped",
      gameAdvanced: "skipped",
      seasonAveragesAdvanced: "skipped",
      seasonAveragesUsage: "skipped",
      notes: ["Network probe skipped."],
    };
  }

  if (!apiKeyPresent) {
    notes.push("BALLDONTLIE_API_KEY is not set.");
    return {
      apiKeyPresent: false,
      playersEndpoint: "skipped",
      gameAdvanced: "skipped",
      seasonAveragesAdvanced: "skipped",
      seasonAveragesUsage: "skipped",
      notes,
    };
  }

  const client = createBallDontLieClient();
  if (!client) {
    notes.push("Failed to construct BallDontLie client.");
    return {
      apiKeyPresent: true,
      playersEndpoint: "error",
      gameAdvanced: "skipped",
      seasonAveragesAdvanced: "skipped",
      seasonAveragesUsage: "skipped",
      notes,
    };
  }

  const playersEndpoint = await classify(() =>
    client.getPlayers({ search: "Jokic" })
  );

  const gameAdvanced = await classify(() =>
    client.getAdvancedStats({ seasons: [2024], playerIds: [246] })
  );

  const seasonAveragesAdvanced = await classify(() =>
    client.getSeasonAverages({
      category: "general",
      type: "advanced",
      season: 2024,
      seasonType: "regular",
      playerIds: [246],
      perPage: 1,
    })
  );

  const seasonAveragesUsage = await classify(() =>
    client.getSeasonAverages({
      category: "general",
      type: "usage",
      season: 2024,
      seasonType: "regular",
      playerIds: [246],
      perPage: 1,
    })
  );

  if (
    gameAdvanced === "unauthorized" ||
    seasonAveragesAdvanced === "unauthorized"
  ) {
    notes.push(
      "Configured BallDontLie key cannot access GOAT advanced / season_averages endpoints (HTTP 401)."
    );
  }

  return {
    apiKeyPresent: true,
    playersEndpoint,
    gameAdvanced,
    seasonAveragesAdvanced,
    seasonAveragesUsage,
    notes,
  };
}
