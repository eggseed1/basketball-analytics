import type { DrblGameMeta, DrblSeason } from "../types";
import { downloadCdnBoxScore, downloadCdnSchedule } from "./cdn-client";
import { rawPath, readOrFetchJson } from "./disk-cache";
import {
  getResultSet,
  resultSetToObjects,
  statsNbaFetch,
} from "../../src/data/providers/nba/stats-nba-client";
import { nbaTeamAbbr } from "../../src/data/providers/nba/nba-team-meta";

/** NBA game id prefix for each leaguegamelog SeasonType. */
const SEASON_TYPE_PREFIX: Record<string, string> = {
  "Regular Season": "002",
  Playoffs: "004",
  PlayIn: "005",
};
const REGULAR_SEASON_GAMES = 1230;
/** Series per playoff round, first round to Finals. */
const PLAYOFF_SERIES = [8, 4, 2, 1];
const BOX_CONCURRENCY = 8;

type CdnTeam = { teamId?: number | string; teamTricode?: string; score?: number };
type CdnGame = {
  gameId?: string;
  gameStatus?: number;
  gameEt?: string;
  gameDateEst?: string;
  gameTimeUTC?: string;
  homeTeam?: CdnTeam;
  awayTeam?: CdnTeam;
};

function cdnMeta(season: DrblSeason, gameId: string, g: CdnGame, date: string): DrblGameMeta | null {
  if (!g.homeTeam?.teamId || !g.awayTeam?.teamId || g.gameStatus !== 3 || !date) return null;
  return {
    gameId,
    season,
    gameDate: date,
    homeTeamId: String(g.homeTeam.teamId),
    awayTeamId: String(g.awayTeam.teamId),
    homeTeamTricode: g.homeTeam.teamTricode ?? nbaTeamAbbr(String(g.homeTeam.teamId)),
    awayTeamTricode: g.awayTeam.teamTricode ?? nbaTeamAbbr(String(g.awayTeam.teamId)),
    homeScore: Number(g.homeTeam.score ?? 0),
    awayScore: Number(g.awayTeam.score ?? 0),
    status: 3,
  };
}

const byDate = (a: DrblGameMeta, b: DrblGameMeta) =>
  a.gameDate.localeCompare(b.gameDate) || a.gameId.localeCompare(b.gameId);

/** Finals from the CDN schedule, or null when the schedule is for another season. */
async function scheduleGames(season: DrblSeason, prefix: string): Promise<DrblGameMeta[] | null> {
  const data = (await downloadCdnSchedule()) as {
    leagueSchedule?: { seasonYear?: string; gameDates?: Array<{ games?: CdnGame[] }> };
  };
  const schedule = data.leagueSchedule;
  if (schedule?.seasonYear !== season) return null;
  return (schedule.gameDates ?? [])
    .flatMap((d) => d.games ?? [])
    .filter((g) => g.gameId?.startsWith(prefix))
    .map((g) => cdnMeta(season, g.gameId!, g, (g.gameDateEst ?? "").slice(0, 10)))
    .filter((g): g is DrblGameMeta => g != null)
    .sort(byDate);
}

export function cdnGameIds(season: DrblSeason, prefix: string): string[] {
  const yy = season.slice(2, 4);
  if (prefix === "002") {
    return Array.from(
      { length: REGULAR_SEASON_GAMES },
      (_, i) => `002${yy}0${String(i + 1).padStart(4, "0")}`
    );
  }
  if (prefix === "004") {
    const ids: string[] = [];
    PLAYOFF_SERIES.forEach((series, round) => {
      for (let s = 0; s < series; s++) {
        for (let g = 1; g <= 7; g++) ids.push(`004${yy}00${round + 1}${s}${g}`);
      }
    });
    return ids;
  }
  return [];
}

/** Final-game metadata from the CDN box score; null for ids that were never played. */
export async function cdnBoxGameMeta(season: DrblSeason, gameId: string): Promise<DrblGameMeta | null> {
  try {
    const { data } = await readOrFetchJson<{ game?: CdnGame }>(
      rawPath("games", gameId, "boxscore.json"),
      () => downloadCdnBoxScore(gameId) as Promise<{ game?: CdnGame }>,
      { endpoint: `cdn.nba.com/liveData/boxscore/boxscore_${gameId}.json` }
    );
    const g = data.game ?? {};
    return cdnMeta(season, gameId, g, (g.gameEt ?? g.gameTimeUTC ?? "").slice(0, 10));
  } catch {
    return null;
  }
}

/** Finals found by walking every possible game id and reading its CDN box score. */
async function enumeratedGames(season: DrblSeason, prefix: string): Promise<DrblGameMeta[]> {
  const ids = cdnGameIds(season, prefix);
  const out: Array<DrblGameMeta | null> = new Array(ids.length).fill(null);
  let next = 0;
  await Promise.all(
    Array.from({ length: BOX_CONCURRENCY }, async () => {
      while (next < ids.length) {
        const i = next++;
        out[i] = await cdnBoxGameMeta(season, ids[i]!);
      }
    })
  );
  return out.filter((g): g is DrblGameMeta => g != null).sort(byDate);
}

async function leagueGameLog(season: DrblSeason, seasonType: string): Promise<DrblGameMeta[]> {
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
  if (!set) return [];

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
      // Neutral-site games (international, Cup semifinals) can list both
      // teams on the same side; the second team takes the open slot.
      const homeOpen = !existing.homeTeamId;
      const awayOpen = !existing.awayTeamId;
      if ((isHome && homeOpen) || (!isHome && !awayOpen && homeOpen)) {
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
}

/**
 * List final games for a canonical season. The current season comes from the
 * NBA CDN schedule; older seasons from leaguegamelog, or CDN box scores by game
 * id when stats.nba.com is unreachable (it blocks GitHub Actions and Workers).
 */
export async function listSeasonGames(
  season: DrblSeason,
  options: { force?: boolean; seasonType?: string } = {}
): Promise<DrblGameMeta[]> {
  const seasonType = options.seasonType ?? "Regular Season";
  const prefix = SEASON_TYPE_PREFIX[seasonType];
  const cacheFile = rawPath(
    season,
    "meta",
    `games_${seasonType.replace(/\s+/g, "_").toLowerCase()}.json`
  );

  const { data } = await readOrFetchJson(
    cacheFile,
    async () => {
      if (prefix) {
        const scheduled = await scheduleGames(season, prefix).catch(() => null);
        if (scheduled) return scheduled;
      }
      try {
        return await leagueGameLog(season, seasonType);
      } catch (error) {
        if (!prefix || cdnGameIds(season, prefix).length === 0) throw error;
        return enumeratedGames(season, prefix);
      }
    },
    { force: options.force }
  );

  return data;
}
