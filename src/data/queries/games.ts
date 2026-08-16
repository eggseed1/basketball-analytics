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
  fetchRecentScoreboardGames,
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
  source?: import("./scoreboard-feed").ScoreboardFeedSource;
  warnings?: string[];
  isStale?: boolean;
}> {
  const { getHomeWeekStripFeed } = await import("./scoreboard-feed");
  const feed = await getHomeWeekStripFeed(options);
  const strip = feed.data;
  try {
    const withStarters = await attachStartersToGames(strip.games);
    return {
      mode: strip.mode,
      games: withStarters.map((g) => ({
        ...toGameSummary(g),
        awayStarters: g.awayStarters,
        homeStarters: g.homeStarters,
      })),
      source: feed.source,
      warnings: feed.warnings,
      isStale: feed.isStale,
    };
  } catch {
    return {
      mode: strip.mode,
      games: strip.games.map((g) => ({
        ...toGameSummary(g),
        awayStarters: [],
        homeStarters: [],
      })),
      source: feed.source,
      warnings: feed.warnings,
      isStale: feed.isStale,
    };
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
}): Promise<{
  monthKey: string;
  season: string;
  games: GameSummary[];
  source?: import("./scoreboard-feed").ScoreboardFeedSource;
  warnings?: string[];
  isStale?: boolean;
}> {
  const season =
    options.season ?? canonicalSeasonFromStartYear(currentNbaStartYear());
  const monthKey = options.monthKey ?? defaultScoreboardMonthKey(season);
  const { getScoreboardMonthFeed } = await import("./scoreboard-feed");
  const feed = await getScoreboardMonthFeed({ monthKey, season });
  return {
    ...feed.data,
    source: feed.source,
    warnings: feed.warnings,
    isStale: feed.isStale,
  };
}

export async function getScoreboardWeekSummaries(options: {
  weekStart?: string;
  season?: string;
}): Promise<{
  weekStart: string;
  weekEnd: string;
  season: string;
  games: GameSummary[];
  source?: import("./scoreboard-feed").ScoreboardFeedSource;
  warnings?: string[];
  isStale?: boolean;
}> {
  const { getScoreboardWeekFeed } = await import("./scoreboard-feed");
  const feed = await getScoreboardWeekFeed(options);
  return {
    ...feed.data,
    source: feed.source,
    warnings: feed.warnings,
    isStale: feed.isStale,
  };
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
  source?: import("./scoreboard-feed").ScoreboardFeedSource;
  warnings?: string[];
  isStale?: boolean;
}> {
  const { getUpcomingScoreboardFeed } = await import("./scoreboard-feed");
  const feed = await getUpcomingScoreboardFeed(options);
  return {
    ...feed.data,
    source: feed.source,
    warnings: feed.warnings,
    isStale: feed.isStale,
  };
}

/**
 * Batched live scoreboard snapshot for today (ET).
 * Soft-fails with stale cache labeling — never throws for provider outage.
 */
export async function getLiveScoreboardSummaries(options: {
  season?: string;
  force?: boolean;
  gameIds?: string[];
  signal?: AbortSignal;
} = {}): Promise<{
  season: string;
  retrievedAt: string;
  games: GameSummary[];
  source?: import("./scoreboard-feed").ScoreboardFeedSource;
  warnings?: string[];
  isStale?: boolean;
}> {
  const { getLiveScoreboardFeed } = await import("./scoreboard-feed");
  const feed = await getLiveScoreboardFeed(options);
  return {
    season: feed.data.season,
    retrievedAt: feed.data.retrievedAt ?? new Date().toISOString(),
    games: feed.data.games,
    source: feed.source,
    warnings: feed.warnings,
    isStale: feed.isStale,
  };
}

export {
  shiftMonthKey,
  monthKeyFromDate,
  startOfWeekSundayIso,
  addDaysIso,
  upcomingScheduleSeason,
};
