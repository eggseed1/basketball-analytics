import type { DrblGameMeta, DrblSeason } from "../types";
import { rawPath, readOrFetchJson } from "./disk-cache";
import {
  getResultSet,
  resultSetToObjects,
  statsNbaFetch,
} from "../../src/data/providers/nba/stats-nba-client";
import { nbaTeamAbbr } from "../../src/data/providers/nba/nba-team-meta";

/**
 * List final regular-season games for a canonical season via leaguegamelog.
 */
export async function listSeasonGames(
  season: DrblSeason,
  options: { force?: boolean; seasonType?: string } = {}
): Promise<DrblGameMeta[]> {
  const seasonType = options.seasonType ?? "Regular Season";
  const cacheFile = rawPath(
    season,
    "meta",
    `games_${seasonType.replace(/\s+/g, "_").toLowerCase()}.json`
  );

  const { data } = await readOrFetchJson(
    cacheFile,
    async () => {
      const response = await statsNbaFetch(
        "leaguegamelog",
        {
          Counter: 0,
          Direction: "ASC",
          LeagueID: "00",
          PlayerOrTeam: "T",
          Season: season,
          SeasonType: seasonType,
          Sorter: "DATE",
        },
        { ttlMs: 12 * 60 * 60 * 1000, staleMs: 0 }
      );
      const set = getResultSet(response);
      if (!set) return [] as DrblGameMeta[];

      const byId = new Map<string, DrblGameMeta>();
      for (const row of resultSetToObjects(set)) {
        const gameId = String(row.GAME_ID ?? "");
        if (!gameId) continue;
        const teamId = String(row.TEAM_ID ?? "");
        const matchup = String(row.MATCHUP ?? "");
        const isHome = matchup.includes(" vs.");
        const pts = Number(row.PTS ?? 0) || 0;
        const gameDate = String(row.GAME_DATE ?? "").slice(0, 10);
        const existing = byId.get(gameId);
        if (!existing) {
          byId.set(gameId, {
            gameId,
            season,
            gameDate,
            homeTeamId: isHome ? teamId : "",
            awayTeamId: isHome ? "" : teamId,
            homeTeamTricode: isHome ? nbaTeamAbbr(teamId) : "",
            awayTeamTricode: isHome ? "" : nbaTeamAbbr(teamId),
            homeScore: isHome ? pts : 0,
            awayScore: isHome ? 0 : pts,
            status: 3,
          });
        } else {
          if (isHome) {
            existing.homeTeamId = teamId;
            existing.homeTeamTricode = nbaTeamAbbr(teamId);
            existing.homeScore = pts;
          } else {
            existing.awayTeamId = teamId;
            existing.awayTeamTricode = nbaTeamAbbr(teamId);
            existing.awayScore = pts;
          }
        }
      }

      return [...byId.values()]
        .filter((g) => g.homeTeamId && g.awayTeamId)
        .sort((a, b) => a.gameDate.localeCompare(b.gameDate));
    },
    { force: options.force }
  );

  return data;
}
