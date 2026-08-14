import { getDataProvider } from "@/data/providers";
import type {
  BasketballFilters,
  Game,
  GameBoxScore,
  GameSummary,
} from "@/data/types";
import { applyGameFilters, toGameSummary } from "./filter-utils";
import { getHistoricalBoxScore, getHistoricalGames } from "./historical";
import {
  addDaysIso,
  fetchHomeWeekStrip,
  fetchRecentScoreboardGames,
  fetchScoreboardMonth,
  fetchScoreboardWeek,
  fetchUpcomingScoreboardGames,
  monthKeyFromDate,
  shiftMonthKey,
  startOfWeekSundayIso,
  upcomingScheduleSeason,
} from "@/data/providers/nba/scoreboard-client";
import { attachStartersToGames } from "@/data/providers/nba/starters-client";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
  startYearFromCanonicalSeason,
} from "@/data/providers/historical/season-range";
import { espnYearFromCanonicalSeason } from "@/data/providers/nba/season";

/** ESPN event ids are typically 9 digits starting with 40… */
export function looksLikeEspnEventId(gameId: string): boolean {
  return /^40\d{7,}$/.test(gameId);
}

export async function getGames(season?: string): Promise<Game[]> {
  return getDataProvider().getGames(season);
}

export async function getGame(gameId: string): Promise<Game | null> {
  return getDataProvider().getGame(gameId);
}

export async function getGameBoxScore(
  gameId: string
): Promise<GameBoxScore | null> {
  // ESPN ids must not hit BallDontLie first - wrong id space + multi-minute stalls.
  if (looksLikeEspnEventId(gameId)) {
    try {
      return await getDataProvider().getGameBoxScore(gameId);
    } catch {
      return null;
    }
  }

  try {
    const box = await getHistoricalBoxScore(gameId);
    if (box) return box;
  } catch {
    // fall through
  }
  try {
    return await getDataProvider().getGameBoxScore(gameId);
  } catch {
    return null;
  }
}

/**
 * Filtered game summaries - prefers BallDontLie historical path (1960-present).
 * Modern seasons use ESPN (fast) unless a full disk cache exists.
 */
export async function getFilteredGames(
  filters: BasketballFilters = {}
): Promise<GameSummary[]> {
  let games: Game[] = [];
  const season = filters.season;
  const start = season ? startYearFromCanonicalSeason(season) : null;
  try {
    games = await getHistoricalGames({
      season,
      maxPages: start != null && start < 2000 ? 20 : 8,
      preferSource: "auto",
    });
  } catch {
    games = [];
  }
  if (games.length === 0) {
    games = await getDataProvider().getGames(filters.season);
  }
  return applyGameFilters(games, filters);
}

/** Scoreboard-sized recent slate - never waits on full-season schedule fan-out. */
export async function getRecentGameSummaries(
  options: { season?: string; limit?: number } = {}
): Promise<GameSummary[]> {
  const season =
    options.season ?? canonicalSeasonFromStartYear(currentNbaStartYear());
  const limit = options.limit ?? 14;

  try {
    const recent = await fetchRecentScoreboardGames({ season, limit });
    if (recent.length) {
      return recent.map(toGameSummary);
    }
  } catch {
    // fall through
  }

  const games = await getFilteredGames({ season });
  return games
    .slice()
    .sort((a, b) =>
      a.gameDate === b.gameDate
        ? b.id.localeCompare(a.id)
        : b.gameDate.localeCompare(a.gameDate)
    )
    .slice(0, limit)
    .map(toGameSummary);
}

/** Home week strip: this week's slate, or upcoming previews when quiet. */
export async function getHomeWeekStripSummaries(
  options: { season?: string; limit?: number } = {}
): Promise<{
  mode: "week" | "upcoming";
  games: Array<
    GameSummary & {
      awayStarters: Array<{ id: string; name: string }>;
      homeStarters: Array<{ id: string; name: string }>;
    }
  >;
}> {
  const season =
    options.season ?? canonicalSeasonFromStartYear(currentNbaStartYear());
  const limit = options.limit ?? 10;

  try {
    const strip = await fetchHomeWeekStrip({ season, limit });
    const withStarters = await attachStartersToGames(strip.games);
    return {
      mode: strip.mode,
      games: withStarters.map((g) => ({
        ...toGameSummary(g),
        awayStarters: g.awayStarters,
        homeStarters: g.homeStarters,
      })),
    };
  } catch {
    return { mode: "upcoming", games: [] };
  }
}

/** Default calendar month for a season (current month if in-season, else next opener). */
export function defaultScoreboardMonthKey(season?: string): string {
  const resolved =
    season ?? canonicalSeasonFromStartYear(currentNbaStartYear());
  const endYear = espnYearFromCanonicalSeason(resolved);
  const startYear = endYear - 1;
  const now = new Date();
  const current = monthKeyFromDate(now);
  const [cy, cm] = current.split("-").map(Number);
  // NBA season roughly Oct (startYear) → June (endYear).
  const inSeason =
    (cy === startYear && (cm ?? 0) >= 10) ||
    (cy === endYear && (cm ?? 0) <= 6);
  if (inSeason) return current;
  // Offseason: jump to the next October slate (preseason / opener).
  if ((cm ?? 0) >= 7) return `${cy}-10`;
  return `${endYear}-10`;
}

export async function getScoreboardMonthSummaries(options: {
  monthKey?: string;
  season?: string;
}): Promise<{ monthKey: string; season: string; games: GameSummary[] }> {
  const season =
    options.season ?? canonicalSeasonFromStartYear(currentNbaStartYear());
  const monthKey = options.monthKey ?? defaultScoreboardMonthKey(season);
  try {
    const games = await fetchScoreboardMonth({ monthKey, season });
    return { monthKey, season, games: games.map(toGameSummary) };
  } catch {
    return { monthKey, season, games: [] };
  }
}

export async function getScoreboardWeekSummaries(options: {
  weekStart?: string;
  season?: string;
}): Promise<{
  weekStart: string;
  weekEnd: string;
  season: string;
  games: GameSummary[];
}> {
  const season =
    options.season ?? canonicalSeasonFromStartYear(currentNbaStartYear());
  const weekStart = startOfWeekSundayIso(
    options.weekStart ?? new Date().toISOString().slice(0, 10)
  );
  try {
    const result = await fetchScoreboardWeek({ weekStartIso: weekStart, season });
    return {
      weekStart: result.weekStart,
      weekEnd: result.weekEnd,
      season,
      games: result.games.map(toGameSummary),
    };
  } catch {
    return {
      weekStart,
      weekEnd: addDaysIso(weekStart, 6),
      season,
      games: [],
    };
  }
}

/** Paginated upcoming tip-offs from ESPN monthly scoreboards. */
export async function getUpcomingGameSummaries(
  options: {
    season?: string;
    fromDate?: string;
    afterTipOffAt?: string;
    afterId?: string;
    monthCount?: number;
    limit?: number;
  } = {}
): Promise<{
  season: string;
  games: GameSummary[];
  hasMore: boolean;
}> {
  const season = options.season ?? upcomingScheduleSeason();
  try {
    const { games, hasMore } = await fetchUpcomingScoreboardGames({
      season,
      fromDate: options.fromDate,
      afterTipOffAt: options.afterTipOffAt,
      afterId: options.afterId,
      monthCount: options.monthCount ?? 8,
      limit: options.limit ?? 60,
    });
    return { season, games: games.map(toGameSummary), hasMore };
  } catch {
    return { season, games: [], hasMore: false };
  }
}

export {
  shiftMonthKey,
  monthKeyFromDate,
  startOfWeekSundayIso,
  addDaysIso,
  upcomingScheduleSeason,
};
