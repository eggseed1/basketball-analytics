/**
 * Request-scoped memoization helpers for shared query entry points.
 * Prefer React.cache so metadata + page / Suspense islands share one load.
 */

import { cache } from "react";

import { resolvePlayerIdentityCached } from "@/data/identity/player-identity-cache";
import { runtimeTimeoutMs, slimEdgeProductEnabled } from "@/data/providers/nba/runtime-policy";
import { fetchEspnCdnGameBoxScore } from "@/data/providers/nba/espn-cdn-game-client";
import { findNbaCdnGame } from "@/data/providers/nba/nba-cdn-game-client";
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
import type {
  Game,
  GameBoxScore,
  Player,
  PlayerGame,
  PlayerSeason,
} from "@/data/types";
import {
  getTeamSeasonBoard as getTeamSeasonBoardUncached,
  getTeamSeasonStats as getTeamSeasonStatsUncached,
} from "@/data/queries/team-seasons";
import {
  getGameShell as getGameShellUncached,
  getSeasonGamesArchive as getSeasonGamesArchiveUncached,
  getTeamSeasonGames as getTeamSeasonGamesUncached,
  looksLikeEspnEventId,
  looksLikeNbaStatsGameId,
  upcomingScheduleSeason,
  type GameShell,
} from "@/data/queries/games";
import { getHomeAnalytics as getHomeAnalyticsUncached } from "@/data/queries/home";

export const getPlayerCached = cache(async (playerId: string) => {
  // Slim edge only (SLIM_EDGE_PRODUCT=1): skip ESPN athlete-profile hang.
  if (slimEdgeProductEnabled()) return null;
  const { preferBundledProductDataOnEdge } = await import(
    "@/data/providers/nba/runtime-policy"
  );
  // Cloudflare: serve deploy-baked vitals instead of live ESPN / stats.nba /
  // draft-history on the player shell (those fetches trip Error 1102).
  if (preferBundledProductDataOnEdge()) {
    const { getBundledPlayerBio } = await import(
      "@/data/runtime/player-bio-snapshot"
    );
    const identity = await resolvePlayerIdentityCached(playerId).catch(
      () => null
    );
    return (
      getBundledPlayerBio(playerId, [
        identity?.nbaId,
        identity?.espnId,
      ]) ?? null
    );
  }
  const budgetMs = runtimeTimeoutMs(5_000, 800);
  const result = await withBudget(
    getPlayerUncached(playerId).catch(() => null),
    budgetMs,
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
    // Prefer deploy-baked logs on Cloudflare (ESPN gamelog is flaky from Workers).
    try {
      const { resolvePlayerSeasonGameLog } = await import(
        "@/data/runtime/player-game-logs-store"
      );
      const baked = await resolvePlayerSeasonGameLog({
        season,
        playerId,
      });
      if (baked.length > 0) {
        return baked.map(
          (row): PlayerGame => ({
            id: `${row.gameId}:${playerId}`,
            gameId: row.gameId,
            playerId,
            teamId: row.teamNbaId,
            opponentTeamId: row.opponentNbaId,
            season: row.season,
            seasonType:
              row.seasonType === "playoffs" ? "playoffs" : "regular",
            gameDate: row.date,
            isHome: row.homeAway === "home",
            minutes: row.minutesNum,
            points: row.points,
            rebounds: row.rebounds,
            assists: row.assists,
            steals: row.steals,
            blocks: row.blocks,
            turnovers: row.turnovers,
            fieldGoalsMade: row.fgm,
            fieldGoalsAttempted: row.fga,
            threePointersMade: row.threePm,
            threePointersAttempted: row.threePa,
            freeThrowsMade: row.ftm,
            freeThrowsAttempted: row.fta,
            offensiveRebounds: row.orb ?? 0,
            defensiveRebounds: row.drb ?? 0,
            personalFouls: row.pf ?? 0,
            plusMinus: row.plusMinus ?? 0,
            startPosition: row.starter ? "Y" : "",
          })
        );
      }
    } catch {
      /* live path */
    }

    const { longUpstreamBudgetsEnabled } = await import(
      "@/data/providers/nba/runtime-policy"
    );
    const budgetMs = longUpstreamBudgetsEnabled()
      ? 12_000
      : runtimeTimeoutMs(7_000, 3_500);
    const result = await withBudget(
      getPlayerGameLogUncached(playerId, season).catch(() => []),
      budgetMs,
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

export const getPlayerCareerSeasonsCached = cache(async (playerId: string) => {
  const { preferBundledProductDataOnEdge } = await import(
    "@/data/providers/nba/runtime-policy"
  );
  // Bundled BRef career on CF is sync; keep a thin outer budget for identity only.
  const budgetMs = preferBundledProductDataOnEdge()
    ? 1_200
    : runtimeTimeoutMs(7_000, 3_400);
  const result = await withBudget(
    getPlayerCriticalCareerSeasons(playerId),
    budgetMs,
    [] as PlayerSeason[]
  );
  if (result.value.length > 0) return result.value;
  return currentTeamFallbackRow(playerId);
});

export const enrichPlayerCareerAdvancedCached = cache(
  async (playerId: string, career: PlayerSeason[]) => {
    const { preferBundledProductDataOnEdge } = await import(
      "@/data/providers/nba/runtime-policy"
    );
    const budgetMs = preferBundledProductDataOnEdge()
      ? 4_000
      : runtimeTimeoutMs(12_000, 2_000);
    const result = await withBudget(
      enrichPlayerCareerAdvancedUncached(playerId, career).catch(() => career),
      budgetMs,
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

export const getTeamRosterCached = cache(
  (teamId: string, season: string, minimumGames: number) =>
    getTeamRosterUncached(teamId, season, { minimumGames })
);

export const getSeasonGamesArchiveCached = cache((season: string) =>
  getSeasonGamesArchiveUncached(season)
);

export const getTeamSeasonGamesCached = cache(
  (teamId: string, season: string, abbreviation: string) =>
    getTeamSeasonGamesUncached({ teamId, season, abbreviation })
);

function shellFromFallbackBox(box: GameBoxScore): GameShell {
  const hasBoxScore = box.players.some(
    (player) =>
      player.minutes > 0 ||
      player.points > 0 ||
      player.fieldGoalsAttempted > 0
  );
  const hasPeriodScores = Boolean(
    box.game.homePeriodScores?.length && box.game.awayPeriodScores?.length
  );
  return {
    game: box.game,
    players: box.players,
    availability: hasBoxScore
      ? hasPeriodScores
        ? "full"
        : "partial"
      : hasPeriodScores
        ? "partial"
        : "scoreboard",
    source: "box",
    hasBoxScore,
    hasPeriodScores,
  };
}

function shellFromFallbackGame(game: Game): GameShell {
  const hasPeriodScores = Boolean(
    game.homePeriodScores?.length && game.awayPeriodScores?.length
  );
  return {
    game,
    players: [],
    availability: hasPeriodScores ? "partial" : "scoreboard",
    source: "provider",
    hasBoxScore: false,
    hasPeriodScores,
  };
}

async function fallbackGameShell(gameId: string): Promise<GameShell | null> {
  if (looksLikeEspnEventId(gameId)) {
    const box = await fetchEspnCdnGameBoxScore(gameId).catch(() => null);
    return box?.game ? shellFromFallbackBox(box) : null;
  }

  if (looksLikeNbaStatsGameId(gameId)) {
    const game = await findNbaCdnGame(gameId, upcomingScheduleSeason()).catch(
      () => null
    );
    return game ? shellFromFallbackGame(game) : null;
  }

  return null;
}

async function boundedPrimaryGameShell(gameId: string): Promise<GameShell | null> {
  const primary = await withBudget(
    getGameShellUncached(gameId).catch(() => null),
    9_000,
    null as GameShell | null
  );
  return primary.value;
}

async function boundedFallbackGameShell(gameId: string): Promise<GameShell | null> {
  const fallback = await withBudget(
    fallbackGameShell(gameId),
    7_000,
    null as GameShell | null
  );
  return fallback.value;
}

/**
 * Host-independent game loading contract: always give the complete provider the
 * first chance to resolve identity + box depth, then use CDN fallbacks. This is
 * the same ordering Cursor/local uses, so Vercel cannot silently downgrade a
 * completed game to a scoreboard-only shell before Game Lab mounts.
 */
export const getGameShellCached = cache(async (gameId: string) => {
  const primary = await boundedPrimaryGameShell(gameId);
  if (primary) return primary;
  return boundedFallbackGameShell(gameId);
});

export const getHomeAnalyticsCached = cache(() => getHomeAnalyticsUncached());

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
