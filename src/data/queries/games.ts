import { getDataProvider } from "@/data/providers";
import type {
  BasketballFilters,
  Game,
  GameBoxScore,
  GamePlayByPlay,
  GameSummary,
  PlayerGame,
} from "@/data/types";
import { applyGameFilters, toGameSummary } from "./filter-utils";
import { getHistoricalBoxScore, getHistoricalGame, getHistoricalGames } from "./historical";
import { ensureGameTeamIdentity } from "@/lib/game-team-identity";
import {
  isMalformedEmptyFinalShell,
  validateGamePresentation,
} from "@/lib/game-presentation";
import { loadRawArchiveBoxScore } from "@/data/history/raw-archive-box";
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
import {
  isAdequateSeasonGamesCache,
  readGamesCache,
} from "@/data/providers/historical/games-cache";
import {
  getProviderTeamId,
  resolveCanonicalTeam,
  HISTORICAL_SCHEDULE_TEAM_PROVIDER,
} from "@/data/identity/team-map";
import {
  looksLikeEspnEventId as looksLikeEspnEventIdShared,
  looksLikeNbaStatsGameId,
} from "@/data/identity/game-id";
import { espnFetchJson } from "@/data/providers/nba/espn-client";
import {
  transformEspnBoxScore,
  type EspnSummaryResponse,
} from "@/data/transformers/espn";
import { CACHE_TTL_MS } from "@/data/providers/nba/cache-policy";

/** ESPN event ids are typically 9 digits starting with 40… */
export function looksLikeEspnEventId(gameId: string): boolean {
  return looksLikeEspnEventIdShared(gameId);
}

export { looksLikeNbaStatsGameId };

/**
 * ESPN summary → box / scoreboard shell.
 * Distinguishes hard 404 (invalid event) from network/5xx (rethrows).
 */
async function fetchEspnEventBoxScore(
  gameId: string
): Promise<GameBoxScore | null> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${encodeURIComponent(gameId)}`;
  let summary: EspnSummaryResponse;
  try {
    summary = await espnFetchJson<EspnSummaryResponse>(url, {
      ttlMs: CACHE_TTL_MS.boxScore ?? 1000 * 60 * 5,
      retries: 2,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // ESPN 404 → invalid / unknown event (semantic miss).
    if (/\(404\)/.test(msg)) return null;
    // Network / 5xx — do not classify as not-found at this layer.
    throw error;
  }

  const endYear = summary.header?.season?.year;
  const season =
    typeof endYear === "number" && Number.isFinite(endYear)
      ? canonicalSeasonFromStartYear(endYear - 1)
      : canonicalSeasonFromStartYear(currentNbaStartYear());

  const transformed = transformEspnBoxScore(summary, season);
  if (!transformed?.game?.id) return null;
  return {
    game: transformed.game,
    players: transformed.players,
  };
}

export async function getGames(season?: string): Promise<Game[]> {
  return getDataProvider().getGames(season);
}

export async function getGame(gameId: string): Promise<Game | null> {
  if (looksLikeEspnEventId(gameId)) {
    try {
      const box = await fetchEspnEventBoxScore(gameId);
      if (box?.game) return box.game;
    } catch {
      // network — fall through to provider
    }
  }

  if (looksLikeNbaStatsGameId(gameId)) {
    const fromProvider = await getDataProvider().getGame(gameId);
    if (fromProvider) return fromProvider;
    try {
      const box = await getDataProvider().getGameBoxScore(gameId);
      return box?.game ?? null;
    } catch {
      return null;
    }
  }

  const fromProvider = await getDataProvider().getGame(gameId);
  if (fromProvider) return fromProvider;

  // BallDontLie / schedule ids (e.g. Season Evidence) are not ESPN 40… events.
  if (!looksLikeEspnEventId(gameId) && !looksLikeNbaStatsGameId(gameId)) {
    try {
      const historical = await getHistoricalGame(gameId);
      if (historical) return historical;
    } catch {
      // fall through
    }
  }

  return null;
}

export type GameLookupFailureClass =
  | "INVALID_GAME_ID"
  | "VALID_GAME_PROVIDER_MISMATCH"
  | "VALID_GAME_DATA_UNAVAILABLE"
  | "NETWORK_FAILURE";

export async function getGameBoxScore(
  gameId: string
): Promise<GameBoxScore | null> {
  // ESPN event ids → ESPN summary (never NBA Stats GameID / BDL).
  if (looksLikeEspnEventId(gameId)) {
    try {
      return await fetchEspnEventBoxScore(gameId);
    } catch {
      // Preserve prior shell behavior: callers treat null as unavailable.
      // Network errors are reclassified in getGameShell.
      return null;
    }
  }

  // NBA Stats GameID → stats.nba.com box path via active provider.
  if (looksLikeNbaStatsGameId(gameId)) {
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

  // Non-ESPN / non-NBA schedule ids must not retry foreign box paths.
  return null;
}

export async function getGamePlayByPlay(
  gameId: string
): Promise<GamePlayByPlay | null> {
  const provider = getDataProvider();
  if (typeof provider.getGamePlayByPlay !== "function") return null;
  return provider.getGamePlayByPlay(gameId);
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
  source: "box" | "historical" | "provider" | "runtime-snapshot";
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
        (looksLikeEspnEventId(box.game.id)
          ? "espn"
          : looksLikeNbaStatsGameId(box.game.id)
            ? "nba"
            : "bdl")
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
  source: "historical" | "provider" | "runtime-snapshot"
): GameShell {
  const hasPeriodScores = Boolean(
    game.homePeriodScores?.length && game.awayPeriodScores?.length
  );
  const fallback =
    source === "historical"
      ? "bdl"
      : looksLikeEspnEventId(game.id)
        ? "espn"
        : "espn";
  return {
    game: ensureGameTeamIdentity(game, game.teamIdProvider ?? fallback),
    players: [],
    availability: hasPeriodScores ? "partial" : "scoreboard",
    source,
    hasBoxScore: false,
    hasPeriodScores,
  };
}

function acceptShell(shell: GameShell | null): GameShell | null {
  if (!shell?.game) return null;
  if (isMalformedEmptyFinalShell(shell.game)) return null;
  const v = validateGamePresentation(shell.game);
  if (!v.canRenderScoreHeader && v.state !== "PARTIAL") return null;
  if (
    v.issues.includes("MISSING_HOME_TEAM") ||
    v.issues.includes("MISSING_AWAY_TEAM")
  ) {
    return null;
  }
  return shell;
}

export async function getGameShell(gameId: string): Promise<GameShell | null> {
  const id = String(gameId ?? "").trim();
  if (!id) return null;

  // Build-time schedule snapshot (critical on Cloudflare Workers where live
  // ESPN + node:fs-backed archives are unreliable / unavailable).
  const { getRuntimeSnapshotGame } = await import("@/data/runtime/game-snapshot");
  const fromSnapshot = getRuntimeSnapshotGame(id);
  if (fromSnapshot) {
    const shell = acceptShell(shellFromGame(fromSnapshot, "runtime-snapshot"));
    if (shell) return shell;
  }

  // Local raw archive first for NBA GameIDs — complete teams/scores without inventing shells.
  if (looksLikeNbaStatsGameId(id)) {
    const archived = loadRawArchiveBoxScore(id);
    if (archived?.game) {
      const shell = acceptShell(shellFromBox(archived));
      if (shell) return shell;
    }
  }

  // ESPN event ids: ESPN summary is the matching lookup contract for Scores/Home.
  if (looksLikeEspnEventId(id)) {
    try {
      const box = await fetchEspnEventBoxScore(id);
      const shell = box?.game ? acceptShell(shellFromBox(box)) : null;
      if (shell) return shell;
    } catch {
      // NETWORK_FAILURE: do not pretend the game is invalid — try scoreboard row.
      try {
        const fromProvider = await getDataProvider().getGame(id);
        const shell = fromProvider
          ? acceptShell(shellFromGame(fromProvider, "provider"))
          : null;
        if (shell) return shell;
      } catch {
        // still network
      }
      return null;
    }
    return null;
  }

  // NBA Stats GameID: never query BDL with this id space.
  if (looksLikeNbaStatsGameId(id)) {
    try {
      const box = await getDataProvider().getGameBoxScore(id);
      const shell = box?.game ? acceptShell(shellFromBox(box)) : null;
      if (shell) return shell;
    } catch {
      // fall through to schedule row
    }
    try {
      const fromProvider = await getDataProvider().getGame(id);
      const shell = fromProvider
        ? acceptShell(shellFromGame(fromProvider, "provider"))
        : null;
      if (shell) return shell;
    } catch {
      return null;
    }
    return null;
  }

  // Schedule / BallDontLie ids: resolve the scoreboard row first (lightweight).
  // Only attempt box when we may upgrade — never 404 solely for a missing box.
  let historical: Game | null = null;
  try {
    historical = await getHistoricalGame(id);
  } catch {
    historical = null;
  }

  const box = await getGameBoxScore(id);
  if (box?.game) {
    const fromBox = acceptShell(shellFromBox(box));
    if (
      fromBox &&
      (fromBox.hasBoxScore || fromBox.hasPeriodScores || !historical)
    ) {
      return fromBox;
    }
  }

  if (historical) {
    const shell = acceptShell(shellFromGame(historical, "historical"));
    if (shell) return shell;
  }

  // Do not fan out ESPN season schedules for non-event ids — different id space.
  return null;
}

/**
 * Filtered game summaries - prefers local season archive, then modern ESPN.
 * Never passes ESPN canonical team ids as BallDontLie teamIds (25 OKC ≠ 25 POR).
 */
export async function getFilteredGames(
  filters: BasketballFilters = {},
  options?: {
    maxPages?: number;
    /**
     * When false (team destinations), skip remote historical crawls if the
     * local season archive is missing — return empty instead of multi-page BDL.
     */
    allowRemoteHistoricalCrawl?: boolean;
  }
): Promise<GameSummary[]> {
  let games: Game[] = [];
  const season = filters.season;
  const start = season
    ? (() => {
        try {
          return startYearFromCanonicalSeason(season);
        } catch {
          return null;
        }
      })()
    : null;
  const dateStart = filters.dateRange?.start;
  const dateEnd = filters.dateRange?.end;
  const hasDateWindow = Boolean(dateStart || dateEnd);
  const allowRemoteHistoricalCrawl =
    options?.allowRemoteHistoricalCrawl !== false;
  const maxPages =
    options?.maxPages ??
    (hasDateWindow ? 4 : start != null && start < 2000 ? 20 : 8);

  // Prefer disk / modern archive — filter in memory (no ESPN→BDL id footgun).
  if (season && !hasDateWindow) {
    const archive = await getSeasonGamesArchive(season);
    if (archive.games.length > 0) {
      return applyGameFilters(archive.games, filters);
    }
    if (
      start != null &&
      start < 2000 &&
      !allowRemoteHistoricalCrawl
    ) {
      return [];
    }
  }

  // Map canonical ESPN ids → BDL schedule ids before any remote team crawl.
  let bdlTeamId: string | undefined;
  if (filters.team && /^\d+$/.test(String(filters.team))) {
    const resolved = resolveCanonicalTeam(String(filters.team));
    if (resolved.status === "resolved") {
      bdlTeamId =
        getProviderTeamId(
          HISTORICAL_SCHEDULE_TEAM_PROVIDER,
          resolved.team.canonicalTeamId
        ) ?? undefined;
    } else {
      // Already a provider schedule id (e.g. evidence second pass).
      bdlTeamId = String(filters.team);
    }
  }

  try {
    games = await getHistoricalGames({
      season,
      startDate: dateStart,
      endDate: dateEnd,
      maxPages,
      preferSource: "auto",
      ...(bdlTeamId ? { teamId: bdlTeamId } : {}),
    });
  } catch {
    games = [];
  }
  if (games.length === 0 && !hasDateWindow) {
    games = await getDataProvider().getGames(filters.season);
  }
  return applyGameFilters(games, filters);
}

export type SeasonGamesArchiveSource =
  | "disk_cache"
  | "espn"
  | "unavailable";

export type SeasonGamesArchiveResult = {
  games: Game[];
  source: SeasonGamesArchiveSource;
  warning?: string;
};

/**
 * Load a season slate from trusted local/modern sources only.
 * Pre-modern seasons without an adequate disk cache do not trigger BDL crawls.
 */
export async function getSeasonGamesArchive(
  season: string
): Promise<SeasonGamesArchiveResult> {
  const cached = await readGamesCache(season);
  if (
    cached &&
    isAdequateSeasonGamesCache(season, cached.games.length)
  ) {
    return { games: cached.games, source: "disk_cache" };
  }

  const start = (() => {
    try {
      return startYearFromCanonicalSeason(season);
    } catch {
      return null;
    }
  })();

  if (start != null && start >= 2000) {
    try {
      // Prefer ESPN monthly scoreboards. On Vercel, stats.nba leaguegamelog is
      // disabled — getGames already falls through to the same ESPN path.
      const espnGames = await getDataProvider().getGames(season);
      if (espnGames.length > 0) {
        return { games: espnGames, source: "espn" };
      }
    } catch {
      // fall through
    }
    return {
      games: [],
      source: "unavailable",
      warning: `Season games unavailable for ${season} (live schedule miss).`,
    };
  }

  return {
    games: [],
    source: "unavailable",
    warning: `Historical game archive unavailable for ${season}. No local season cache is present; remote schedule crawl skipped.`,
  };
}

export type TeamSeasonGamesResult = {
  games: GameSummary[];
  source: SeasonGamesArchiveSource;
  warning?: string;
};

/**
 * Team-scoped season games for destination Games / Evidence islands.
 * Prefer compact history-product indexes when present (no full archive filter).
 */
export async function getTeamSeasonGames(
  options: {
    teamId: string;
    season: string;
    abbreviation?: string;
    limit?: number;
  }
): Promise<TeamSeasonGamesResult> {
  const {
    hasHistoryTeamGameIndex,
    getCompactTeamSeasonGames,
    compactRowsToGameSummaries,
  } = await import("@/data/history/team-matchup-index");

  if (hasHistoryTeamGameIndex(options.season)) {
    let compact = getCompactTeamSeasonGames(options.teamId, options.season);
    if (options.limit != null) {
      compact = compact.slice(0, options.limit);
    }
    if (compact.length > 0) {
      return {
        games: compactRowsToGameSummaries(compact),
        source: "disk_cache",
      };
    }
    // Index exists but no games for this team — fall through for modern seasons.
  }

  const archive = await getSeasonGamesArchive(options.season);
  if (archive.games.length === 0) {
    return {
      games: [],
      source: archive.source,
      warning:
        archive.warning ??
        `Historical games unavailable for ${options.season}.`,
    };
  }

  const resolved = resolveCanonicalTeam(options.teamId);
  const teamFilter =
    resolved.status === "resolved"
      ? resolved.team.canonicalTeamId
      : options.teamId;

  let summaries = applyGameFilters(archive.games, {
    season: options.season,
    team: teamFilter,
  });

  summaries = summaries
    .slice()
    .sort((a, b) =>
      a.gameDate === b.gameDate
        ? b.id.localeCompare(a.id)
        : b.gameDate.localeCompare(a.gameDate)
    );

  if (options.limit != null) {
    summaries = summaries.slice(0, options.limit);
  }

  return { games: summaries, source: archive.source };
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

  const start = (() => {
    try {
      return startYearFromCanonicalSeason(season);
    } catch {
      return null;
    }
  })();

  // Historical: local season archive only — no multi-page BDL rediscovery.
  if (start != null && start < 2000) {
    const archive = await getSeasonGamesArchive(season);
    return archive.games
      .map(toGameSummary)
      .slice()
      .sort((a, b) =>
        a.gameDate === b.gameDate
          ? b.id.localeCompare(a.id)
          : b.gameDate.localeCompare(a.gameDate)
      )
      .slice(0, limit);
  }

  const games = await getFilteredGames({ season });
  return games
    .slice()
    .sort((a, b) =>
      a.gameDate === b.gameDate
        ? b.id.localeCompare(a.id)
        : b.gameDate.localeCompare(a.gameDate)
    )
    .slice(0, limit);
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
  if (feed.data.games.length > 0 || feed.source !== "unavailable") {
    return {
      ...feed.data,
      source: feed.source,
      warnings: feed.warnings,
      isStale: feed.isStale,
    };
  }

  // Cloudflare / cold hosts: live ESPN soft-fails with empty process cache.
  // Fall back to the build-time snapshot so team/player upcoming never blanks.
  const { getRuntimeSnapshotGames } = await import("@/data/runtime/game-snapshot");
  const { upcomingScheduleSeason } = await import(
    "@/data/providers/nba/scoreboard-client"
  );
  const { isPreTipStatus } = await import("@/lib/game-status");
  const season = options.season ?? upcomingScheduleSeason();
  const today = options.fromDate ?? new Date().toISOString().slice(0, 10);
  const limit = options.limit ?? 40;
  let pool = getRuntimeSnapshotGames(season)
    .filter(
      (game) =>
        game.gameDate >= today &&
        (isPreTipStatus(game.status) || game.status === "in_progress")
    )
    .sort((a, b) =>
      (a.tipOffAt ?? a.gameDate).localeCompare(b.tipOffAt ?? b.gameDate)
    );
  if (options.afterTipOffAt) {
    pool = pool.filter((game) => {
      const tip = game.tipOffAt ?? `${game.gameDate}T00:00:00Z`;
      if (tip > options.afterTipOffAt!) return true;
      if (tip < options.afterTipOffAt!) return false;
      return options.afterId ? game.id > options.afterId : false;
    });
  }
  const slice = pool.slice(0, limit);
  return {
    season,
    games: slice.map(toGameSummary),
    hasMore: pool.length > limit,
    source: "cached-espn",
    warnings: ["Showing build-time schedule snapshot — live ESPN unavailable."],
    isStale: true,
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
