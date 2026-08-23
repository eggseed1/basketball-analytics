/**
 * Request-scoped memoization helpers for shared query entry points.
 * Prefer React.cache so metadata + page / Suspense islands share one load.
 */

import { cache } from "react";

import { getPlayerAccolades as getPlayerAccoladesUncached } from "@/data/queries/player-awards";
import {
  enrichPlayerCareerAdvanced as enrichPlayerCareerAdvancedUncached,
  getPlayer as getPlayerUncached,
  getPlayerCareerSeasons as getPlayerCareerSeasonsUncached,
  getPlayerGameLog as getPlayerGameLogUncached,
  getPlayerSeason as getPlayerSeasonUncached,
  getTeamRoster as getTeamRosterUncached,
} from "@/data/queries/players";
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

export const getPlayerCached = cache((playerId: string) =>
  getPlayerUncached(playerId)
);

export { resolvePlayerIdentityCached } from "@/data/identity/player-identity-cache";

export const getPlayerAccoladesCached = cache((playerId: string) =>
  getPlayerAccoladesUncached(playerId)
);

export const getPlayerSeasonCached = cache(
  (playerId: string, season: string, statsSeason?: string) =>
    getPlayerSeasonUncached(playerId, season, statsSeason ? { statsSeason } : undefined)
);

export const getPlayerGameLogCached = cache(
  (playerId: string, season: string) =>
    getPlayerGameLogUncached(playerId, season)
);

export const getPlayerCareerSeasonsCached = cache((playerId: string) =>
  getPlayerCareerSeasonsUncached(playerId)
);

/**
 * Shared DRBL + YoY Advanced enrich for Statistics / Career / percentile.
 * Keyed by playerId + career reference so islands sharing page career hit once.
 */
export const enrichPlayerCareerAdvancedCached = cache(
  (playerId: string, career: import("@/data/types").PlayerSeason[]) =>
    enrichPlayerCareerAdvancedUncached(playerId, career)
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

export const getGameShellCached = cache((gameId: string) =>
  getGameShellUncached(gameId)
);

export const getHomeAnalyticsCached = cache(() => getHomeAnalyticsUncached());

/** Shared board cohort for P18 depth islands still on this branch. */
export const getFilteredPlayerSeasonsCached = cache(
  async (season: string, minimumGames: number) => {
    const { getFilteredPlayerSeasons } = await import("@/data/queries/players");
    return getFilteredPlayerSeasons({ season, minimumGames });
  }
);
