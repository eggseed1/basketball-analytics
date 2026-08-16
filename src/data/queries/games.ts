import { getDataProvider } from "@/data/providers";
import type {
  BasketballFilters,
  Game,
  GameBoxScore,
  GameSummary,
  PlayerGame,
} from "@/data/types";
import { applyGameFilters, toGameSummary } from "./filter-utils";
import { getHistoricalBoxScore, getHistoricalGame, getHistoricalGames } from "./historical";
import { ensureGameTeamIdentity } from "@/lib/game-team-identity";
import {
  addDaysIso,
  fetchHomeWeekStrip,
  fetchRecentScoreboardGames,
  fetchScoreboardDay,
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
  const fromProvider = await getDataProvider().getGame(gameId);
  if (fromProvider) return fromProvider;

  // BallDontLie / schedule ids (e.g. Season Evidence) are not ESPN 40… events.
  if (!looksLikeEspnEventId(gameId)) {
    try {
      const historical = await getHistoricalGame(gameId);
      if (historical) return historical;
    } catch {
      // fall through
    }
  }

  return null;
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

  // Non-ESPN schedule ids (e.g. BallDontLie) must not retry the ESPN box path —
  // different id spaces; the ESPN call only adds latency.
  return null;
}

/**
 * Best-available canonical game for Game Lab.
 * A known schedule/scoreboard game is never treated as "not found" merely
 * because the box score is missing.
 */
export type GameShellAvailability = "full" | "partial" | "scoreboard";

export type GameShell = {
  game: Game;
  players: PlayerGame[];
  availability: GameShellAvailability;
  /** Where the Game row came from when box was absent. */
  source: "box" | "historical" | "provider";
  hasBoxScore: boolean;
  hasPeriodScores: boolean;
};

function shellFromBox(box: GameBoxScore): GameShell {
  const hasBoxScore = box.players.some(
    (p) => p.minutes > 0 || p.points > 0 || p.fieldGoalsAttempted > 0
  );
  const hasPeriodScores = Boolean(
    box.game.homePeriodScores?.length && box.game.awayPeriodScores?.length
  );
  let availability: GameShellAvailability = "scoreboard";
  if (hasBoxScore) {
    availability = hasPeriodScores ? "full" : "partial";
  } else if (hasPeriodScores) {
    availability = "partial";
  }
  return {
    game: ensureGameTeamIdentity(
      box.game,
      box.game.teamIdProvider ??
        (looksLikeEspnEventId(box.game.id) ? "espn" : "bdl")
    ),
    players: box.players,
    availability,
    source: "box",
    hasBoxScore,
    hasPeriodScores,
  };
}

function shellFromGame(
  game: Game,
  source: "historical" | "provider"
): GameShell {
  const hasPeriodScores = Boolean(
    game.homePeriodScores?.length && game.awayPeriodScores?.length
  );
  const fallback = source === "historical" ? "bdl" : "espn";
  return {
    game: ensureGameTeamIdentity(game, game.teamIdProvider ?? fallback),
    players: [],
    availability: hasPeriodScores ? "partial" : "scoreboard",
    source,
    hasBoxScore: false,
    hasPeriodScores,
  };
}

export async function getGameShell(gameId: string): Promise<GameShell | null> {
  // ESPN event ids: box is the primary source.
  if (looksLikeEspnEventId(gameId)) {
    const box = await getGameBoxScore(gameId);
    if (box?.game) return shellFromBox(box);

    const fromProvider = await getDataProvider().getGame(gameId);
    if (fromProvider) return shellFromGame(fromProvider, "provider");
    return null;
  }

  // Schedule / BallDontLie ids: resolve the scoreboard row first (lightweight).
  // Only attempt box when we may upgrade — never 404 solely for a missing box.
  let historical: Game | null = null;
  try {
    historical = await getHistoricalGame(gameId);
  } catch {
    historical = null;
  }

  const box = await getGameBoxScore(gameId);
  if (box?.game) {
    const fromBox = shellFromBox(box);
    if (fromBox.hasBoxScore || fromBox.hasPeriodScores || !historical) {
      return fromBox;
    }
  }

  if (historical) return shellFromGame(historical, "historical");

  // Do not fan out ESPN season schedules for non-event ids — different id space.
  return null;
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

/**
 * Batched live scoreboard snapshot for today (ET).
 * Short provider TTL; force bypasses memory cache for visibility wakes.
 */
export async function getLiveScoreboardSummaries(options: {
  season?: string;
  force?: boolean;
  /** When set, only return these ids (still one provider day fetch). */
  gameIds?: string[];
  signal?: AbortSignal;
} = {}): Promise<{
  season: string;
  retrievedAt: string;
  games: GameSummary[];
}> {
  const season = options.season ?? upcomingScheduleSeason();
  const games = await fetchScoreboardDay({
    season,
    force: options.force,
    signal: options.signal,
  });
  const retrievedAt = new Date().toISOString();
  let mapped = games.map((g) => ({
    ...toGameSummary(g),
    retrievedAt: g.retrievedAt ?? retrievedAt,
  }));
  if (options.gameIds?.length) {
    const want = new Set(options.gameIds);
    mapped = mapped.filter((g) => want.has(g.id));
  }
  return { season, retrievedAt, games: mapped };
}

export {
  shiftMonthKey,
  monthKeyFromDate,
  startOfWeekSundayIso,
  addDaysIso,
  upcomingScheduleSeason,
};
