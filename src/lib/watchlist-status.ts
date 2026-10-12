import type { Game, PlayerGame } from "@/data/types";
import { isFinalStatus, isLiveLikeStatus, isPreTipStatus } from "@/lib/game-status";

export type WatchGame = {
  gameId: string;
  /** NBA (Eastern) calendar day, YYYY-MM-DD. */
  date: string;
  tipOffAt: string | null;
  opponentId: string;
  opponentAbbr: string;
  home: boolean;
  gameType: Game["gameType"];
  state: "final" | "live" | "upcoming";
  /** Null until the game is final. */
  teamScore: number | null;
  opponentScore: number | null;
  /** The team's overall record as the feed reports it; regular season and playoffs only. */
  record: string | null;
  /** When the final buzzer sounded (epoch ms), for games that ended in the last few hours. */
  endedAt?: number | null;
};

export type WatchPlayerLine = {
  gameId: string;
  date: string;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
};

export type WatchScoringTrend = {
  season: string;
  recentGames: number;
  recentPpg: number;
  seasonGames: number;
  seasonPpg: number;
};

export type WatchDrbl = {
  season: string;
  value: number;
  prior: { season: string; value: number } | null;
};

export type WatchInjury = {
  status: "out" | "day-to-day" | "other";
  statusLabel: string;
  injury: string | null;
  returnDate: string | null;
};

export type WatchTeamStatus = {
  kind: "team";
  id: string;
  last: WatchGame | null;
  live: WatchGame | null;
  next: WatchGame | null;
};

export type WatchPlayerStatus = {
  kind: "player";
  id: string;
  teamId: string | null;
  last: WatchGame | null;
  live: WatchGame | null;
  next: WatchGame | null;
  /** The player's box line for `last`, when the game log has it. */
  line: WatchPlayerLine | null;
  trend: WatchScoringTrend | null;
  drbl: WatchDrbl | null;
  injury: WatchInjury | null;
};

export type WatchStatus = WatchTeamStatus | WatchPlayerStatus;

export const WATCHLIST_MAX_ITEMS = 12;
const TREND_RECENT_GAMES = 5;
/** Below this, "season average" is barely more than the last five games. */
const TREND_MIN_SEASON_GAMES = 10;

function toWatchGame(game: Game, teamId: string): WatchGame | null {
  const home = game.homeTeamId === teamId;
  if (!home && game.awayTeamId !== teamId) return null;
  const state = isFinalStatus(game.status)
    ? "final"
    : isLiveLikeStatus(game.status)
      ? "live"
      : isPreTipStatus(game.status)
        ? "upcoming"
        : null;
  if (!state) return null;
  const counted = game.gameType === "regular" || game.gameType === "playoff" || game.gameType === "play-in";
  const record = (home ? game.homeRecord : game.awayRecord)?.trim() || null;
  return {
    gameId: game.id,
    date: game.gameDate,
    tipOffAt: game.tipOffAt ?? null,
    opponentId: home ? game.awayTeamId : game.homeTeamId,
    opponentAbbr: (home ? game.awayTeamAbbr : game.homeTeamAbbr) ?? "",
    home,
    gameType: game.gameType,
    state,
    teamScore: state === "final" ? (home ? game.homeScore : game.awayScore) : null,
    opponentScore: state === "final" ? (home ? game.awayScore : game.homeScore) : null,
    record: counted ? record : null,
  };
}

function tipKey(g: WatchGame): string {
  return g.tipOffAt ?? `${g.date}T23:59:59Z`;
}

/** Latest final, any game in progress, and the next tip-off for one team. */
export function teamGameWindow(
  games: readonly Game[],
  teamId: string
): Pick<WatchTeamStatus, "last" | "live" | "next"> {
  const byId = new Map<string, WatchGame>();
  for (const game of games) {
    const g = toWatchGame(game, teamId);
    if (g) byId.set(g.gameId, g);
  }
  let last: WatchGame | null = null;
  let live: WatchGame | null = null;
  let next: WatchGame | null = null;
  for (const g of byId.values()) {
    if (g.state === "final") {
      if (!last || tipKey(g) > tipKey(last)) last = g;
    } else if (g.state === "live") {
      if (!live || tipKey(g) > tipKey(live)) live = g;
    } else if (!next || tipKey(g) < tipKey(next)) {
      next = g;
    }
  }
  return { last, live, next };
}

function sortedSeasonGames(log: readonly PlayerGame[], season: string): PlayerGame[] {
  return log
    .filter((g) => g.season === season)
    .slice()
    .sort((a, b) => b.gameDate.localeCompare(a.gameDate));
}

/** The player's line for one game, if the log has it. */
export function playerLineFor(
  log: readonly PlayerGame[],
  gameId: string | null | undefined
): WatchPlayerLine | null {
  if (!gameId) return null;
  const g = log.find((row) => row.gameId === gameId);
  if (!g) return null;
  return {
    gameId: g.gameId,
    date: g.gameDate,
    minutes: g.minutes,
    points: g.points,
    rebounds: g.rebounds,
    assists: g.assists,
  };
}

/** Points over the last five games against the season average. */
export function scoringTrend(
  log: readonly PlayerGame[],
  season: string
): WatchScoringTrend | null {
  const games = sortedSeasonGames(log, season).filter((g) => g.minutes > 0);
  if (games.length < TREND_MIN_SEASON_GAMES) return null;
  const recent = games.slice(0, TREND_RECENT_GAMES);
  const sum = (rows: PlayerGame[]) => rows.reduce((n, g) => n + g.points, 0);
  return {
    season,
    recentGames: recent.length,
    recentPpg: sum(recent) / recent.length,
    seasonGames: games.length,
    seasonPpg: sum(games) / games.length,
  };
}

/** "vs CHI" at home, "at UTA" away. */
export function opponentText(g: Pick<WatchGame, "home" | "opponentAbbr">): string {
  return `${g.home ? "vs" : "at"} ${g.opponentAbbr || "TBD"}`;
}

/** "W 117-106 at UTA"; null unless the game is final with a score. */
export function resultText(g: WatchGame): string | null {
  if (g.state !== "final" || g.teamScore == null || g.opponentScore == null) return null;
  const mark = g.teamScore > g.opponentScore ? "W" : g.teamScore < g.opponentScore ? "L" : "T";
  return `${mark} ${g.teamScore}-${g.opponentScore} ${opponentText(g)}`;
}

/** "28 pts, 9 reb, 10 ast"; a player who logged no minutes reads "Did not play". */
export function playerLineText(line: WatchPlayerLine): string {
  if (!(line.minutes > 0)) return "Did not play";
  return `${line.points} pts, ${line.rebounds} reb, ${line.assists} ast`;
}

function signed1(n: number): string {
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}`;
}

/** "Last 5: 31.2 PPG (season 27.4)". */
export function trendText(t: WatchScoringTrend): string {
  return `Last ${t.recentGames}: ${t.recentPpg.toFixed(1)} PPG (season ${t.seasonPpg.toFixed(1)})`;
}

/** "DRBL/100 +3.1 in 2026-27, +4.2 in 2025-26". */
export function drblText(d: WatchDrbl): string {
  const now = `DRBL/100 ${signed1(d.value)} in ${d.season}`;
  return d.prior ? `${now}, ${signed1(d.prior.value)} in ${d.prior.season}` : now;
}

/** Comma-separated ids from a query param, deduped and capped. */
export function parseWatchIds(raw: string | null): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || out.includes(id)) continue;
    out.push(id);
    if (out.length >= WATCHLIST_MAX_ITEMS) break;
  }
  return out;
}
