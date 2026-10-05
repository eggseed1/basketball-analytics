import "server-only";

import { sharedGetOrSet } from "@/data/cache/shared-ttl-cache";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { fetchRecentScoreboardGames } from "@/data/providers/nba/scoreboard-client";
import { getGameBoxScore } from "@/data/queries/games";
import type { Game, GameBoxScore } from "@/data/types";
import {
  buildRecentInsights,
  type RecentInsight,
  type SlateGameInput,
  type SlatePlayerLine,
} from "@/lib/recent-insights";

const CARD_LIMIT = 6;
/** Box score fetches per refresh; a busy regular-season night is about 15 games. */
const MAX_GAMES = 16;
const MAX_DATES = 4;
const CACHE_TTL_MS = 1000 * 60 * 10;
const CACHE_STALE_MS = 1000 * 60 * 60 * 6;

export type LiveRecentInsights = {
  insights: RecentInsight[];
  season: string;
  preseason: boolean;
  slateDates: string[];
};

function slateInput(g: Game): SlateGameInput {
  return {
    id: g.id,
    season: g.season,
    gameDate: g.gameDate,
    homeTeamId: g.homeTeamId,
    awayTeamId: g.awayTeamId,
    homeTeamAbbr: g.homeTeamAbbr ?? "HOME",
    awayTeamAbbr: g.awayTeamAbbr ?? "AWAY",
    homeScore: g.homeScore ?? 0,
    awayScore: g.awayScore ?? 0,
    homePeriodScores: g.homePeriodScores,
    awayPeriodScores: g.awayPeriodScores,
    gameType: g.gameType,
  };
}

function linesFromBox(g: Game, box: GameBoxScore): SlatePlayerLine[] {
  const homeAbbr = g.homeTeamAbbr ?? "HOME";
  const awayAbbr = g.awayTeamAbbr ?? "AWAY";
  const homeWon = (g.homeScore ?? 0) > (g.awayScore ?? 0);
  const out: SlatePlayerLine[] = [];
  for (const p of box.players) {
    if (!p.playerId || !p.playerName || !((p.minutes ?? 0) >= 1)) continue;
    const home = p.teamId === g.homeTeamId;
    if (!home && p.teamId !== g.awayTeamId) continue;
    out.push({
      gameId: g.id,
      gameDate: g.gameDate,
      profileId: String(p.playerId),
      playerName: p.playerName,
      teamId: home ? g.homeTeamId : g.awayTeamId,
      teamAbbr: home ? homeAbbr : awayAbbr,
      opponentAbbr: home ? awayAbbr : homeAbbr,
      homeAway: home ? "home" : "away",
      result: home === homeWon ? "W" : "L",
      minutesNum: p.minutes ?? 0,
      points: p.points ?? 0,
      rebounds: p.rebounds ?? 0,
      assists: p.assists ?? 0,
      steals: p.steals ?? 0,
      blocks: p.blocks ?? 0,
      turnovers: p.turnovers ?? 0,
      fgm: p.fieldGoalsMade ?? 0,
      fga: p.fieldGoalsAttempted ?? 0,
      threePm: p.threePointersMade ?? 0,
      threePa: p.threePointersAttempted ?? 0,
      ftm: p.freeThrowsMade ?? 0,
      fta: p.freeThrowsAttempted ?? 0,
      seasonPpg: null,
    });
  }
  return out;
}

async function buildLive(season: string): Promise<LiveRecentInsights | null> {
  const finals = (await fetchRecentScoreboardGames({ season, limit: 40 })).filter(
    (g) => g.status === "final" && (g.homeScore ?? 0) + (g.awayScore ?? 0) > 0
  );
  if (!finals.length) return null;

  // Exhibition games only stand in until real games exist.
  const official = finals.filter((g) => g.gameType !== "preseason");
  const preseason = official.length === 0;
  const pool = preseason ? finals : official;
  const dates = [...new Set(pool.map((g) => g.gameDate))].sort((a, b) => b.localeCompare(a));

  const boxes = new Map<string, SlatePlayerLine[]>();
  const loadLines = async (games: Game[]) => {
    await Promise.all(
      games
        .filter((g) => !boxes.has(g.id))
        .map(async (g) => {
          const box = await getGameBoxScore(g.id).catch(() => null);
          boxes.set(g.id, box ? linesFromBox(g, box) : []);
        })
    );
  };

  let insights: RecentInsight[] = [];
  let slateDates: string[] = [];
  for (let n = 1; n <= Math.min(MAX_DATES, dates.length); n++) {
    const window = dates.slice(0, n);
    const games = pool.filter((g) => window.includes(g.gameDate)).slice(0, MAX_GAMES);
    await loadLines(games);
    insights = buildRecentInsights({
      games: games.map(slateInput),
      lines: games.flatMap((g) => boxes.get(g.id) ?? []),
      limit: CARD_LIMIT,
    });
    slateDates = window;
    if (insights.length >= CARD_LIMIT || games.length >= MAX_GAMES) break;
  }
  if (!insights.length) return null;
  return { insights, season, preseason, slateDates };
}

/**
 * Homepage Recent Insights from the latest completed games, rebuilt from live
 * scoreboard and box score data every few minutes. Null when the current
 * season has no finals yet or the feeds are down; callers fall back to the
 * bundled snapshot.
 */
export async function getLiveRecentInsights(): Promise<LiveRecentInsights | null> {
  const season = canonicalSeasonFromStartYear(currentNbaStartYear());
  try {
    return await sharedGetOrSet(
      `recent-insights-live:${season}`,
      { ttlMs: CACHE_TTL_MS, staleMs: CACHE_STALE_MS, tags: ["recent-insights-live"] },
      () => buildLive(season)
    );
  } catch {
    return null;
  }
}
