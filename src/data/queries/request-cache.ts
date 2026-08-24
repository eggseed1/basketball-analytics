/**
 * Request-scoped memoization helpers for shared query entry points.
 * Prefer React.cache so metadata + page / Suspense islands share one load.
 */

import { cache } from "react";

import { runtimeTimeoutMs } from "@/data/providers/nba/runtime-policy";
import { withBudget } from "@/data/queries/budget";
import { getPlayerAccolades as getPlayerAccoladesUncached } from "@/data/queries/player-awards";
import {
  enrichPlayerCareerAdvanced as enrichPlayerCareerAdvancedUncached,
  getPlayer as getPlayerUncached,
  getPlayerGameLog as getPlayerGameLogUncached,
  getPlayerSeason as getPlayerSeasonUncached,
  getTeamRoster as getTeamRosterUncached,
} from "@/data/queries/players";
import { getPlayerCriticalCareerSeasons } from "@/data/queries/player-critical";
import { withPlayerSeasonDefaults } from "@/data/transformers/player-season-defaults";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { isPreseasonRosterSeason } from "@/data/providers/nba/espn-roster-client";
import type { Player, PlayerGame, PlayerSeason } from "@/data/types";
import {
  getTeamSeasonBoard as getTeamSeasonBoardUncached,
  getTeamSeasonStats as getTeamSeasonStatsUncached,
} from "@/data/queries/team-seasons";
import {
  getGameShell as getGameShellUncached,
  getSeasonGamesArchive as getSeasonGamesArchiveUncached,
  getTeamSeasonGames as getTeamSeasonGamesUncached,
} from "@/data/queries/games";
import { getHomeAnalytics as getHomeAnalyticsUncached } from "@/data/queries/home";

/**
 * Player identity is allowed to fail open; career/alias data can still render.
 * Bound this above-the-fold request so a cold ESPN miss cannot hold the whole
 * route open until the serverless function is terminated.
 */
export const getPlayerCached = cache(async (playerId: string) => {
  const result = await withBudget(
    getPlayerUncached(playerId).catch(() => null),
    runtimeTimeoutMs(5_000, 2_800),
    null as Player | null
  );
  return result.value;
});

export { resolvePlayerIdentityCached } from "@/data/identity/player-identity-cache";

export const getPlayerAccoladesCached = cache((playerId: string) =>
  getPlayerAccoladesUncached(playerId)
);

export const getPlayerSeasonCached = cache(
  async (playerId: string, season: string, statsSeason?: string) => {
    const result = await withBudget(
      getPlayerSeasonUncached(
        playerId,
        season,
        statsSeason ? { statsSeason } : undefined
      ).catch(() => null),
      runtimeTimeoutMs(6_000, 3_000),
      null as PlayerSeason | null
    );
    return result.value;
  }
);

export const getPlayerGameLogCached = cache(
  async (playerId: string, season: string) => {
    const result = await withBudget(
      getPlayerGameLogUncached(playerId, season).catch(() => []),
      runtimeTimeoutMs(7_000, 3_500),
      [] as PlayerGame[]
    );
    return result.value;
  }
);

async function currentTeamFallbackRow(playerId: string): Promise<PlayerSeason[]> {
  const season = canonicalSeasonFromStartYear(currentNbaStartYear());
  if (!isPreseasonRosterSeason(season)) return [];

  const player = await getPlayerCached(playerId).catch(() => null);
  const teamId = String(player?.currentTeamId ?? "").trim();
  if (!player || !teamId) return [];

  return [
    withPlayerSeasonDefaults({
      playerId,
      playerName: player.fullName,
      teamId,
      teamName: teamId,
      teamIdProvider: "espn",
      providerTeamId: teamId,
      season,
      position: player.position,
      age: player.age,
      gamesPlayed: 0,
      gamesStarted: 0,
      minutes: 0,
    }),
  ];
}

/**
 * Critical player-page career rows only: factual ESPN/history counting data.
 * Optional impact and roster overlays stream inside their own Suspense islands.
 */
export const getPlayerCareerSeasonsCached = cache(async (playerId: string) => {
  const result = await withBudget(
    getPlayerCriticalCareerSeasons(playerId),
    runtimeTimeoutMs(7_000, 3_400),
    [] as PlayerSeason[]
  );
  if (result.value.length > 0) return result.value;

  // During the July-September league-year gap, a slow career endpoint used to
  // erase the current-team row entirely. That made the player schedule card
  // disappear even though the faster ESPN profile had a verified current team.
  // Keep only the explicit zero-GP identity shell; never invent season stats.
  return currentTeamFallbackRow(playerId);
});

/**
 * Shared DRBL + YoY Advanced enrich for Statistics / Career / percentile.
 * Keyed by playerId + career reference so islands sharing page career hit once.
 * This is optional presentation data: bound it so a slow BRef/DARKO/NBA overlay
 * cannot keep the streamed player response open until Vercel terminates it.
 */
export const enrichPlayerCareerAdvancedCached = cache(
  async (playerId: string, career: PlayerSeason[]) => {
    const result = await withBudget(
      enrichPlayerCareerAdvancedUncached(playerId, career).catch(() => career),
      runtimeTimeoutMs(12_000, 4_500),
      career
    );
    return result.value;
  }
);

export const getTeamSeasonStatsCached = cache((season: string) =>
  getTeamSeasonStatsUncached(season)
);

export const getTeamSeasonBoardCached = cache((season: string) =>
  getTeamSeasonBoardUncached(season)
);

/** Shared by roster + assets islands - one athlete-board load per request. */
export const getTeamRosterCached = cache(
  (teamId: string, season: string, minimumGames: number) =>
    getTeamRosterUncached(teamId, season, { minimumGames })
);

/** One season archive load shared by Games + Evidence islands. */
export const getSeasonGamesArchiveCached = cache((season: string) =>
  getSeasonGamesArchiveUncached(season)
);

export const getTeamSeasonGamesCached = cache(
  (teamId: string, season: string, abbreviation: string) =>
    getTeamSeasonGamesUncached({ teamId, season, abbreviation })
);

/**
 * Game identity must also fail open. Deep play-by-play and analysis already
 * stream later; a blocked summary endpoint should become an unavailable shell,
 * not a serverless timeout.
 */
export const getGameShellCached = cache(async (gameId: string) => {
  const result = await withBudget(
    getGameShellUncached(gameId).catch(() => null),
    runtimeTimeoutMs(9_000, 4_800),
    null
  );
  return result.value;
});

export const getHomeAnalyticsCached = cache(() => getHomeAnalyticsUncached());

/** Shared board cohort for P18 depth islands still on this branch. */
export const getFilteredPlayerSeasonsCached = cache(
  async (season: string, minimumGames: number) => {
    const { getFilteredPlayerSeasons } = await import("@/data/queries/players");
    const result = await withBudget(
      getFilteredPlayerSeasons({ season, minimumGames }).catch(() => []),
      runtimeTimeoutMs(10_000, 5_000),
      [] as PlayerSeason[]
    );
    return result.value;
  }
);