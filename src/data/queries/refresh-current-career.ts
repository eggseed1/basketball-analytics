import "server-only";

import { espnFetchJson } from "@/data/providers/nba/espn-client";
import { transformCompleteEspnAthleteCareerStats } from "@/data/providers/nba/espn-stat-integrity";
import type { EspnAthleteCareerStatsResponse } from "@/data/transformers/espn-career";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import type { PlayerGame, PlayerSeason } from "@/data/types";
import { aggregatePlayerSeasonFromGames } from "@/data/transformers/espn-career";
import { resolvePlayerSeasonGameLog } from "@/data/runtime/player-game-logs-store";
import { preferFreshCurrentCareerRows } from "@/data/queries/fresh-current-career";

const LIVE_CAREER_TTL_MS = 15 * 60 * 1000;

/**
 * An individual ESPN athlete request is much cheaper than crawling the
 * league-wide player board from Cloudflare. Only use its *current-season*
 * counting rows; the baked BRef source remains season-true history.
 * Failed/lagging ESPN responses never reduce a player's GP.
 */
export async function refreshCurrentCareerFromEspn(
  rows: PlayerSeason[],
  espnId: string | null | undefined,
  fallbackName?: string | null
): Promise<PlayerSeason[]> {
  if (!espnId || !/^\d+$/.test(espnId)) return rows;
  const season = canonicalSeasonFromStartYear(currentNbaStartYear());
  // The nightly deploy already bakes individual game logs. Use those first:
  // unlike the NBA Stats home-runner bundle, these advance every day without
  // requiring a full league re-bake. ESPN is still the direct live cross-check.
  let best = rows;
  try {
    const baked = await resolvePlayerSeasonGameLog({
      season, playerId: rows[0]?.playerId ?? espnId, espnId,
    });
    const games: PlayerGame[] = baked
      .filter((game) =>
        game.season === season &&
        (game.seasonType == null || game.seasonType === "regular") &&
        game.minutesNum > 0
      )
      .map((game) => ({
        id: `${game.gameId}:${espnId}`, gameId: game.gameId, playerId: espnId,
        teamId: game.teamNbaId, opponentTeamId: game.opponentNbaId,
        season, seasonType: "regular" as const, gameDate: game.date,
        isHome: game.homeAway === "home",
        minutes: game.minutesNum, points: game.points,
        rebounds: game.rebounds, assists: game.assists, steals: game.steals,
        blocks: game.blocks, turnovers: game.turnovers,
        fieldGoalsMade: game.fgm, fieldGoalsAttempted: game.fga,
        threePointersMade: game.threePm, threePointersAttempted: game.threePa,
        freeThrowsMade: game.ftm, freeThrowsAttempted: game.fta,
        plusMinus: game.plusMinus ?? Number.NaN,
      }));
    if (games.length) {
      const grouped = new Map<string, PlayerGame[]>();
      for (const game of games) {
        const group = grouped.get(game.teamId) ?? [];
        group.push(game);
        grouped.set(game.teamId, group);
      }
      const name = fallbackName || rows[0]?.playerName || espnId;
      const live = [...grouped.entries()]
        .map(([teamId, group]) => {
          const row = aggregatePlayerSeasonFromGames(group, name);
          const teamAbbreviation = baked.find(
            (game) => game.teamNbaId === teamId
          )?.teamAbbr;
          return row
            ? { ...row, teamAbbreviation, teamName: teamAbbreviation || row.teamName }
            : null;
        })
        .filter((row): row is PlayerSeason => row != null);
      if (grouped.size > 1) {
        const total = aggregatePlayerSeasonFromGames(games, name, "Multiple Teams");
        if (total) live.push({ ...total, teamId: "TOT", teamAbbreviation: "TOT" });
      }
      best = preferFreshCurrentCareerRows(best, live, season);
    }
  } catch {
    // No baked logs: keep the snapshot and still ask ESPN below.
  }
  try {
    const payload = await espnFetchJson<EspnAthleteCareerStatsResponse>(
      `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${encodeURIComponent(espnId)}/stats`,
      { ttlMs: LIVE_CAREER_TTL_MS, retries: 1, timeoutMs: 2_500 }
    );
    const fresh = transformCompleteEspnAthleteCareerStats(
      espnId,
      fallbackName || rows[0]?.playerName || espnId,
      payload
    );
    return preferFreshCurrentCareerRows(best, fresh, season);
  } catch {
    return best;
  }
}
