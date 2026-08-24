import "server-only";

import type { Game } from "@/data/types";
import {
  applyHistoricalTeamEraToGame,
  normalizeGameTeamSide,
} from "@/lib/game-team-identity";
import type { GameStatusKind } from "@/lib/game-status";

const NBA_CDN = "https://cdn.nba.com/static/json";
const SCHEDULE_URL = `${NBA_CDN}/staticData/scheduleLeagueV2.json`;
const TODAY_URL = `${NBA_CDN}/liveData/scoreboard/todaysScoreboard_00.json`;

const NBA_HEADERS = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://www.nba.com",
  Referer: "https://www.nba.com/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
} as const;

type NbaCdnTeam = {
  teamId?: string | number;
  teamTricode?: string;
  teamName?: string;
  teamCity?: string;
  wins?: number | string;
  losses?: number | string;
  score?: number | string;
  periods?: Array<{ score?: number | string }>;
};

type NbaCdnGame = {
  gameId?: string;
  gameCode?: string;
  gameStatus?: number | string;
  gameStatusText?: string;
  gameDateEst?: string;
  gameDateTimeEst?: string;
  gameDateTimeUTC?: string;
  gameTimeUTC?: string;
  gameLabel?: string;
  gameSubtype?: string;
  period?: number | string;
  gameClock?: string;
  homeTeam?: NbaCdnTeam;
  awayTeam?: NbaCdnTeam;
};

type NbaScheduleResponse = {
  leagueSchedule?: {
    seasonYear?: string | number;
    gameDates?: Array<{
      gameDate?: string;
      games?: NbaCdnGame[];
    }>;
  };
};

type NbaTodayResponse = {
  scoreboard?: {
    gameDate?: string;
    games?: NbaCdnGame[];
  };
};

let schedulePromise: Promise<Game[]> | null = null;
let scheduleLoadedAt = 0;
const SCHEDULE_TTL_MS = 1000 * 60 * 30;

function numberOrZero(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function statusFromNba(game: NbaCdnGame): GameStatusKind {
  const text = String(game.gameStatusText ?? "").toLowerCase();
  if (text.includes("postpon")) return "postponed";
  if (text.includes("cancel")) return "cancelled";
  if (text.includes("suspend")) return "suspended";
  if (text.includes("delay")) return "delayed";
  if (text.includes("half")) return "halftime";

  const code = Number(game.gameStatus);
  if (code === 1) return "scheduled";
  if (code === 2) return "in_progress";
  if (code === 3) return "final";
  return "unknown";
}

function gameTypeFromNba(game: NbaCdnGame): Game["gameType"] {
  const label = `${game.gameLabel ?? ""} ${game.gameSubtype ?? ""}`.toLowerCase();
  if (label.includes("preseason")) return "preseason";
  if (label.includes("play-in") || label.includes("play in")) return "play-in";
  if (label.includes("playoff") || label.includes("finals")) return "playoff";
  return "regular";
}

function isoDateFromGame(game: NbaCdnGame, fallbackDate?: string): string {
  const raw =
    game.gameDateTimeUTC ??
    game.gameDateTimeEst ??
    game.gameDateEst ??
    fallbackDate ??
    "";
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(raw));
  return match?.[1] ?? String(fallbackDate ?? "").slice(0, 10);
}

function isoTipOff(game: NbaCdnGame): string | undefined {
  const utc = String(game.gameDateTimeUTC ?? game.gameTimeUTC ?? "").trim();
  if (utc && /^\d{4}-\d{2}-\d{2}T/.test(utc)) return utc;

  const est = String(game.gameDateTimeEst ?? "").trim();
  // Avoid inventing a timezone offset for NBA's ET wall clock. Only retain it
  // when the source already supplied an ISO offset/Z suffix.
  if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(est)) return est;
  return undefined;
}

function teamRecord(team: NbaCdnTeam | undefined): string | undefined {
  const wins = team?.wins;
  const losses = team?.losses;
  if (wins == null || losses == null) return undefined;
  return `${wins}-${losses}`;
}

function periodScores(team: NbaCdnTeam | undefined): number[] | undefined {
  if (!team?.periods?.length) return undefined;
  const values = team.periods.map((period) => numberOrZero(period.score));
  return values.length ? values : undefined;
}

export function transformNbaCdnGame(
  raw: NbaCdnGame,
  season: string,
  fallbackDate?: string
): Game | null {
  const id = String(raw.gameId ?? "").trim();
  const homeRawId = String(raw.homeTeam?.teamId ?? "").trim();
  const awayRawId = String(raw.awayTeam?.teamId ?? "").trim();
  if (!id || !homeRawId || !awayRawId) return null;

  const home = normalizeGameTeamSide({
    provider: "nba",
    providerTeamId: homeRawId,
    abbr: raw.homeTeam?.teamTricode,
    name: [raw.homeTeam?.teamCity, raw.homeTeam?.teamName]
      .filter(Boolean)
      .join(" "),
  });
  const away = normalizeGameTeamSide({
    provider: "nba",
    providerTeamId: awayRawId,
    abbr: raw.awayTeam?.teamTricode,
    name: [raw.awayTeam?.teamCity, raw.awayTeam?.teamName]
      .filter(Boolean)
      .join(" "),
  });

  const status = statusFromNba(raw);
  const homePeriodScores = periodScores(raw.homeTeam);
  const awayPeriodScores = periodScores(raw.awayTeam);
  const period = Number(raw.period);
  const clock = String(raw.gameClock ?? "").trim();

  return applyHistoricalTeamEraToGame({
    id,
    season,
    gameDate: isoDateFromGame(raw, fallbackDate),
    ...(isoTipOff(raw) ? { tipOffAt: isoTipOff(raw) } : {}),
    ...(raw.gameStatusText?.trim()
      ? { statusDetail: raw.gameStatusText.trim() }
      : {}),
    homeTeamId: home.canonicalTeamId,
    awayTeamId: away.canonicalTeamId,
    homeTeamAbbr: home.abbr,
    awayTeamAbbr: away.abbr,
    homeTeamName: home.name,
    awayTeamName: away.name,
    homeRecord: teamRecord(raw.homeTeam),
    awayRecord: teamRecord(raw.awayTeam),
    teamIdProvider: "nba",
    homeProviderTeamId: home.providerTeamId,
    awayProviderTeamId: away.providerTeamId,
    homeScore: numberOrZero(raw.homeTeam?.score),
    awayScore: numberOrZero(raw.awayTeam?.score),
    ...(homePeriodScores && awayPeriodScores
      ? { homePeriodScores, awayPeriodScores }
      : {}),
    gameType: gameTypeFromNba(raw),
    status,
    ...(Number.isFinite(period) && period > 0 ? { period } : {}),
    ...(clock ? { displayClock: clock } : {}),
    retrievedAt: new Date().toISOString(),
  });
}

async function fetchJson<T>(url: string, revalidateSeconds: number): Promise<T> {
  const response = await fetch(url, {
    headers: NBA_HEADERS,
    signal: AbortSignal.timeout(4_000),
    next: { revalidate: revalidateSeconds },
  } as RequestInit);
  if (!response.ok) {
    throw new Error(`NBA CDN request failed (${response.status}): ${url}`);
  }
  return (await response.json()) as T;
}

export async function fetchNbaCdnSchedule(season: string): Promise<Game[]> {
  const now = Date.now();
  if (schedulePromise && now - scheduleLoadedAt < SCHEDULE_TTL_MS) {
    return schedulePromise;
  }

  const pending = fetchJson<NbaScheduleResponse>(SCHEDULE_URL, 60 * 30).then(
    (payload) => {
      const games: Game[] = [];
      for (const dateBlock of payload.leagueSchedule?.gameDates ?? []) {
        for (const raw of dateBlock.games ?? []) {
          const game = transformNbaCdnGame(raw, season, dateBlock.gameDate);
          if (game) games.push(game);
        }
      }
      return games.sort((a, b) =>
        a.gameDate === b.gameDate
          ? (a.tipOffAt ?? a.id).localeCompare(b.tipOffAt ?? b.id)
          : a.gameDate.localeCompare(b.gameDate)
      );
    }
  );

  schedulePromise = pending;
  scheduleLoadedAt = now;
  try {
    return await pending;
  } catch (error) {
    if (schedulePromise === pending) schedulePromise = null;
    throw error;
  }
}

export async function fetchNbaCdnMonth(options: {
  monthKey: string;
  season: string;
}): Promise<Game[]> {
  const schedule = await fetchNbaCdnSchedule(options.season);
  return schedule.filter((game) => game.gameDate.startsWith(options.monthKey));
}

export async function fetchNbaCdnToday(season: string): Promise<Game[]> {
  const payload = await fetchJson<NbaTodayResponse>(TODAY_URL, 20);
  const date = payload.scoreboard?.gameDate;
  return (payload.scoreboard?.games ?? [])
    .map((raw) => transformNbaCdnGame(raw, season, date))
    .filter((game): game is Game => Boolean(game));
}

export async function findNbaCdnGame(
  gameId: string,
  season: string
): Promise<Game | null> {
  const id = String(gameId ?? "").trim();
  if (!id) return null;
  const schedule = await fetchNbaCdnSchedule(season);
  return schedule.find((game) => game.id === id) ?? null;
}
