/**
 * Request-scoped memoization helpers for shared query entry points.
 * Prefer React.cache so metadata + page / Suspense islands share one load.
 */

import { cache } from "react";

import {
  getPlayer as getPlayerUncached,
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

export const getPlayerSeasonCached = cache(
  (playerId: string, season: string) => getPlayerSeasonUncached(playerId, season)
);

export const getPlayerGameLogCached = cache(
  (playerId: string, season: string) =>
    getPlayerGameLogUncached(playerId, season)
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
