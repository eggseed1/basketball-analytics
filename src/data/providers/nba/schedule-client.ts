import { CACHE_TTL_MS } from "./cache-policy";
import { nbaTeamName } from "./nba-team-meta";
import type { Game } from "@/data/types";

export interface ScheduleLeader {
  playerId: string;
  playerName: string;
  teamId: string;
  points?: number;
}

export interface ScheduleGame {
  game: Game;
  statusText?: string;
  gameLabel?: string;
  leaders: ScheduleLeader[];
}

type CacheEntry = {
  freshUntil: number;
  value: ScheduleGame[];
};

const scheduleCache = new Map<string, CacheEntry>();

interface RawScheduleTeam {
  teamId?: number;
  teamName?: string;
  teamCity?: string;
  teamTricode?: string;
  score?: number;
}

interface RawScheduleLeader {
  personId?: number;
  firstName?: string;
  lastName?: string;
  teamId?: number;
  points?: number;
}

interface RawScheduleGame {
  gameId?: string;
  gameStatus?: number;
  gameStatusText?: string;
  gameLabel?: string;
  gameDateEst?: string;
  homeTeam?: RawScheduleTeam;
  awayTeam?: RawScheduleTeam;
  pointsLeaders?: RawScheduleLeader[];
}

/**
 * Full season schedule from stats.nba.com (includes finals + future dates).
 * Shape is leagueSchedule JSON, not the classic resultSets envelope.
 */
export async function fetchLeagueSchedule(
  season: string,
  options: { ttlMs?: number } = {}
): Promise<ScheduleGame[]> {
  const ttlMs = options.ttlMs ?? CACHE_TTL_MS.games;
  const cached = scheduleCache.get(season);
  if (cached && cached.freshUntil > Date.now()) return cached.value;

  const url = `https://stats.nba.com/stats/scheduleleaguev2?LeagueID=00&Season=${encodeURIComponent(season)}`;
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          Origin: "https://www.nba.com",
          Referer: "https://www.nba.com/",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "x-nba-stats-origin": "stats",
          "x-nba-stats-token": "true",
        },
      });
      if (!response.ok) {
        throw new Error(`scheduleleaguev2 failed (${response.status})`);
      }
      const json = (await response.json()) as {
        leagueSchedule?: { gameDates?: Array<{ games?: RawScheduleGame[] }> };
      };
      const rows: ScheduleGame[] = [];
      for (const day of json.leagueSchedule?.gameDates ?? []) {
        for (const raw of day.games ?? []) {
          const parsed = parseScheduleGame(raw, season);
          if (parsed) rows.push(parsed);
        }
      }
      scheduleCache.set(season, {
        value: rows,
        freshUntil: Date.now() + ttlMs,
      });
      return rows;
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`scheduleleaguev2 failed for ${season}`);
}

function parseScheduleGame(
  raw: RawScheduleGame,
  season: string
): ScheduleGame | null {
  const id = String(raw.gameId ?? "");
  if (!id) return null;
  const homeId = String(raw.homeTeam?.teamId ?? "");
  const awayId = String(raw.awayTeam?.teamId ?? "");
  if (!homeId || !awayId) return null;

  const homeAbbr = raw.homeTeam?.teamTricode;
  const awayAbbr = raw.awayTeam?.teamTricode;
  const statusCode = Number(raw.gameStatus ?? 1);
  let status: Game["status"] = "scheduled";
  if (statusCode === 3) status = "final";
  else if (statusCode === 2) status = "in_progress";

  const gameDate = String(raw.gameDateEst ?? "").slice(0, 10);
  const label = raw.gameLabel ?? "";
  let gameType: Game["gameType"] = "regular";
  if (/play.?in/i.test(label)) gameType = "play-in";
  else if (/playoff|final/i.test(label) || id.startsWith("004"))
    gameType = "playoff";
  else if (/preseason/i.test(label) || id.startsWith("001"))
    gameType = "preseason";

  const leaders: ScheduleLeader[] = (raw.pointsLeaders ?? [])
    .filter((l) => l.personId != null)
    .map((l) => ({
      playerId: String(l.personId),
      playerName: `${l.firstName ?? ""} ${l.lastName ?? ""}`.trim(),
      teamId: String(l.teamId ?? ""),
      points: l.points,
    }));

  return {
    game: {
      id,
      season,
      gameDate,
      homeTeamId: homeId,
      awayTeamId: awayId,
      homeTeamAbbr: homeAbbr,
      awayTeamAbbr: awayAbbr,
      homeTeamName: nbaTeamName(homeId, homeAbbr ?? ""),
      awayTeamName: nbaTeamName(awayId, awayAbbr ?? ""),
      homeScore: Number(raw.homeTeam?.score ?? 0),
      awayScore: Number(raw.awayTeam?.score ?? 0),
      gameType,
      status,
    },
    statusText: raw.gameStatusText,
    gameLabel: label || undefined,
    leaders,
  };
}
