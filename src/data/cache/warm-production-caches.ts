/**
 * Cache warmer for Vercel cron — fills shared ESPN / scoreboard / career caches
 * so cold serverless instances inherit warm Data Cache hits.
 */

import {
  isProductionApprovedPlayerAlias,
  loadPlayerIdAliases,
} from "@/data/providers/impact/player-id-aliases";
import {
  fetchRecentScoreboardGames,
  fetchUpcomingScoreboardGames,
  upcomingScheduleSeason,
} from "@/data/providers/nba/scoreboard-client";
import { getPlayerCriticalCareerSeasons } from "@/data/queries/player-critical";
import { getTeamSeasonBoard } from "@/data/queries/team-seasons";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";

const DEFAULT_PLAYER_LIMIT = 24;

export type WarmCacheReport = {
  ok: boolean;
  season: string;
  scheduleSeason: string;
  warmed: {
    recentGames: number;
    upcomingGames: number;
    teamBoardRows: number;
    playerCareers: number;
  };
  errors: string[];
  durationMs: number;
};

async function warmPlayerCareers(limit: number): Promise<{
  count: number;
  errors: string[];
}> {
  const index = await loadPlayerIdAliases();
  const approved = [...index.byEspn.values()].filter((alias) =>
    isProductionApprovedPlayerAlias(alias)
  );
  // Prefer a stable slice so cron work is predictable across deploys.
  const targets = approved
    .map((alias) => alias.espnPlayerId)
    .filter(Boolean)
    .slice(0, limit);

  let count = 0;
  const errors: string[] = [];
  // Sequential — avoid ESPN fan-out from the warmer itself.
  for (const playerId of targets) {
    try {
      const rows = await getPlayerCriticalCareerSeasons(playerId);
      if (rows.length > 0) count += 1;
    } catch (error) {
      errors.push(
        `player ${playerId}: ${
          error instanceof Error ? error.message.slice(0, 80) : "error"
        }`
      );
    }
  }
  return { count, errors };
}

export async function warmProductionCaches(options?: {
  playerLimit?: number;
}): Promise<WarmCacheReport> {
  const started = Date.now();
  const season = canonicalSeasonFromStartYear(currentNbaStartYear());
  const scheduleSeason = upcomingScheduleSeason();
  const errors: string[] = [];
  let recentGames = 0;
  let upcomingGames = 0;
  let teamBoardRows = 0;
  let playerCareers = 0;

  try {
    const recent = await fetchRecentScoreboardGames({
      season,
      limit: 16,
    });
    recentGames = recent.length;
  } catch (error) {
    errors.push(
      `recent: ${error instanceof Error ? error.message.slice(0, 100) : "error"}`
    );
  }

  try {
    const upcoming = await fetchUpcomingScoreboardGames({
      season: scheduleSeason,
      monthCount: 3,
      limit: 40,
    });
    upcomingGames = upcoming.games.length;
  } catch (error) {
    errors.push(
      `upcoming: ${error instanceof Error ? error.message.slice(0, 100) : "error"}`
    );
  }

  try {
    const board = await getTeamSeasonBoard(season, { budgetMs: 4_000 });
    teamBoardRows = board.rows.length;
    if (board.status === "error" || board.status === "timeout") {
      errors.push(`teamBoard: ${board.error ?? board.status}`);
    }
  } catch (error) {
    errors.push(
      `teamBoard: ${error instanceof Error ? error.message.slice(0, 100) : "error"}`
    );
  }

  const players = await warmPlayerCareers(
    options?.playerLimit ?? DEFAULT_PLAYER_LIMIT
  );
  playerCareers = players.count;
  errors.push(...players.errors.slice(0, 5));

  return {
    ok: errors.length === 0,
    season,
    scheduleSeason,
    warmed: {
      recentGames,
      upcomingGames,
      teamBoardRows,
      playerCareers,
    },
    errors,
    durationMs: Date.now() - started,
  };
}
