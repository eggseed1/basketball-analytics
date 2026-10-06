/**
 * Soft-fail scoreboard / gamefeed catalogs with stale-aware last-good cache.
 *
 * Hierarchy: live ESPN → shared/process last-good → unavailable.
 * Cached data is always labeled stale - never presented as live.
 */

import { classifyProviderFailure } from "@/data/diagnostics/provider-failure";
import {
  sharedClearPrefix,
  sharedGetOrSet,
  sharedPeek,
  sharedRemember,
} from "@/data/cache/shared-ttl-cache";
import { LIVE_SCOREBOARD_TTL_MS } from "@/lib/live-refresh-policy";
import type { Game, GameSummary } from "@/data/types";
import {
  addDaysIso,
  espnLiveScoreboardDateKeys,
  fetchHomeWeekStrip,
  fetchRecentScoreboardGames,
  fetchScoreboardDay,
  fetchScoreboardMonth,
  fetchScoreboardWeek,
  fetchUpcomingScoreboardGames,
  startOfWeekSundayIso,
  upcomingScheduleSeason,
} from "@/data/providers/nba/scoreboard-client";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { toGameSummary } from "./filter-utils";

type MonthLoader = typeof fetchScoreboardMonth;
type DayLoader = typeof fetchScoreboardDay;

let monthLoaderOverride: MonthLoader | null = null;
let dayLoaderOverride: DayLoader | null = null;

function loadMonth(
  ...args: Parameters<typeof fetchScoreboardMonth>
): ReturnType<typeof fetchScoreboardMonth> {
  return (monthLoaderOverride ?? fetchScoreboardMonth)(...args);
}

function loadDay(
  ...args: Parameters<typeof fetchScoreboardDay>
): ReturnType<typeof fetchScoreboardDay> {
  return (dayLoaderOverride ?? fetchScoreboardDay)(...args);
}

export type ScoreboardFeedSource = "live-espn" | "cached-espn" | "unavailable";

export type ScoreboardFeedResult<T> = {
  data: T;
  source: ScoreboardFeedSource;
  warnings: string[];
  retrievedAt: string | null;
  isStale: boolean;
};

const STALE_WARNING =
  "Showing recently cached scoreboard data, not a live update.";
const UNAVAILABLE_WARNING = "Live scores temporarily unavailable.";

/** Soft last-good across serverless instances (memory L1 + Next Data Cache). */
const SOFT_TTL_MS = 1000 * 60 * 10;
const SOFT_STALE_MS = 1000 * 60 * 60 * 24;

type CacheEntry<T> = { value: T; retrievedAt: string };

const monthCache = new Map<string, CacheEntry<Game[]>>();
const weekCache = new Map<string, CacheEntry<Game[]>>();
const upcomingCache = new Map<
  string,
  CacheEntry<{ season: string; games: Game[]; hasMore: boolean }>
>();
const dayCache = new Map<string, CacheEntry<Game[]>>();
const homeStripCache = new Map<
  string,
  CacheEntry<{ mode: "week" | "upcoming"; games: Game[] }>
>();
const recentCache = new Map<string, CacheEntry<Game[]>>();

/**
 * Days with games in progress. The 10 minute catalog cache would freeze scores
 * inside a warm isolate, so live days get the live TTL and no stale window.
 */
const LIVE_CACHE = { ttlMs: LIVE_SCOREBOARD_TTL_MS, staleMs: 0 } as const;

async function softLoad<T>(options: {
  key: string;
  cache: Map<string, CacheEntry<T>>;
  load: () => Promise<T>;
  label: string;
  empty: T;
  live?: boolean;
  bypass?: boolean;
}): Promise<ScoreboardFeedResult<T>> {
  const sharedKey = `scoreboard-soft:${options.key}`;
  const cacheOptions = options.live
    ? { ...LIVE_CACHE, tags: ["scoreboard-soft", sharedKey] }
    : {
        ttlMs: SOFT_TTL_MS,
        staleMs: SOFT_STALE_MS,
        tags: ["scoreboard-soft", sharedKey],
      };
  try {
    const value = options.bypass
      ? sharedRemember(sharedKey, await options.load(), cacheOptions)
      : await sharedGetOrSet(sharedKey, cacheOptions, options.load);
    const retrievedAt = new Date().toISOString();
    options.cache.set(options.key, { value, retrievedAt });
    return {
      data: value,
      source: "live-espn",
      warnings: [],
      retrievedAt,
      isStale: false,
    };
  } catch (error) {
    console.warn(
      `[scoreboard] ${options.label} unavailable (${classifyProviderFailure(error).label}); activating fallback`
    );
    const cached = options.cache.get(options.key);
    if (cached) {
      return {
        data: cached.value,
        source: "cached-espn",
        warnings: [STALE_WARNING],
        retrievedAt: cached.retrievedAt,
        isStale: true,
      };
    }
    const peeked = sharedPeek<T>(sharedKey);
    if (peeked != null) {
      return {
        data: peeked,
        source: "cached-espn",
        warnings: [STALE_WARNING],
        retrievedAt: null,
        isStale: true,
      };
    }
    return {
      data: options.empty,
      source: "unavailable",
      warnings: [UNAVAILABLE_WARNING],
      retrievedAt: null,
      isStale: false,
    };
  }
}

export async function getScoreboardMonthFeed(options: {
  monthKey: string;
  season?: string;
}): Promise<
  ScoreboardFeedResult<{
    monthKey: string;
    season: string;
    games: GameSummary[];
  }>
> {
  const season =
    options.season ?? canonicalSeasonFromStartYear(currentNbaStartYear());
  const key = `${season}:${options.monthKey}`;
  const result = await softLoad({
    key,
    cache: monthCache,
    label: `month ${options.monthKey}`,
    empty: [] as Game[],
    load: () => loadMonth({ monthKey: options.monthKey, season }),
  });
  return {
    ...result,
    data: {
      monthKey: options.monthKey,
      season,
      games: result.data.map(toGameSummary),
    },
  };
}

export async function getScoreboardWeekFeed(options: {
  weekStart?: string;
  season?: string;
}): Promise<
  ScoreboardFeedResult<{
    weekStart: string;
    weekEnd: string;
    season: string;
    games: GameSummary[];
  }>
> {
  const season =
    options.season ?? canonicalSeasonFromStartYear(currentNbaStartYear());
  const weekStart = startOfWeekSundayIso(
    options.weekStart ?? new Date().toISOString().slice(0, 10)
  );
  const key = `${season}:${weekStart}`;
  const result = await softLoad({
    key,
    cache: weekCache,
    label: `week ${weekStart}`,
    empty: [] as Game[],
    load: async () => {
      const r = await fetchScoreboardWeek({
        weekStartIso: weekStart,
        season,
      });
      return r.games;
    },
  });
  return {
    ...result,
    data: {
      weekStart,
      weekEnd: addDaysIso(weekStart, 6),
      season,
      games: result.data.map(toGameSummary),
    },
  };
}

export async function getUpcomingScoreboardFeed(
  options: {
    season?: string;
    fromDate?: string;
    afterTipOffAt?: string;
    afterId?: string;
    monthCount?: number;
    limit?: number;
  } = {}
): Promise<
  ScoreboardFeedResult<{
    season: string;
    games: GameSummary[];
    hasMore: boolean;
  }>
> {
  const seasonHint = options.season ?? upcomingScheduleSeason();
  const key = `${seasonHint}:${options.fromDate ?? ""}:${options.afterTipOffAt ?? ""}:${options.afterId ?? ""}:${options.limit ?? 60}`;
  const result = await softLoad({
    key,
    cache: upcomingCache,
    label: "upcoming",
    empty: {
      season: seasonHint,
      games: [] as Game[],
      hasMore: false,
    },
    load: () =>
      fetchUpcomingScoreboardGames({
        season: options.season,
        fromDate: options.fromDate,
        afterTipOffAt: options.afterTipOffAt,
        afterId: options.afterId,
        monthCount: options.monthCount ?? 8,
        limit: options.limit ?? 60,
      }),
  });
  return {
    ...result,
    data: {
      season: result.data.season,
      games: result.data.games.map(toGameSummary),
      hasMore: result.data.hasMore,
    },
  };
}

export async function getHomeWeekStripFeed(
  options: { season?: string; limit?: number } = {}
): Promise<
  ScoreboardFeedResult<{
    mode: "week" | "upcoming";
    games: Game[];
  }>
> {
  const season =
    options.season ?? canonicalSeasonFromStartYear(currentNbaStartYear());
  const limit = options.limit ?? 10;
  const key = `full-week:${season}:${limit}`;
  return softLoad({
    key,
    cache: homeStripCache,
    label: "home week strip",
    empty: { mode: "upcoming" as const, games: [] as Game[] },
    load: () => fetchHomeWeekStrip({ season, limit }),
  });
}

export async function getRecentScoreboardFeed(
  options: { season?: string; limit?: number } = {}
): Promise<ScoreboardFeedResult<GameSummary[]>> {
  const season =
    options.season ?? canonicalSeasonFromStartYear(currentNbaStartYear());
  const limit = options.limit ?? 6;
  const key = `${season}:${limit}`;
  const result = await softLoad({
    key,
    cache: recentCache,
    label: "recent finals",
    empty: [] as Game[],
    load: () => fetchRecentScoreboardGames({ season, limit }),
  });
  return {
    ...result,
    data: result.data.map(toGameSummary),
  };
}

export async function getLiveScoreboardFeed(
  options: {
    season?: string;
    force?: boolean;
    gameIds?: string[];
    signal?: AbortSignal;
  } = {}
): Promise<
  ScoreboardFeedResult<{
    season: string;
    retrievedAt: string | null;
    games: GameSummary[];
  }>
> {
  const season = options.season ?? upcomingScheduleSeason();
  const key = `${season}:day`;
  const result = await softLoad({
    key,
    cache: dayCache,
    label: "live day scoreboard",
    empty: [] as Game[],
    live: true,
    bypass: options.force === true,
    load: () =>
      loadDay({
        season,
        force: options.force,
        signal: options.signal,
      }),
  });

  let games = result.data.map((g) => ({
    ...toGameSummary(g),
    retrievedAt: g.retrievedAt ?? result.retrievedAt ?? undefined,
  }));
  if (options.gameIds?.length) {
    const want = new Set(options.gameIds);
    games = games.filter((g) => want.has(g.id));
  }

  return {
    ...result,
    data: {
      season,
      retrievedAt: result.retrievedAt,
      games,
    },
  };
}

const dateCache = new Map<string, CacheEntry<Game[]>>();

/** One ET calendar day of games (finals, live, scheduled) by `YYYY-MM-DD`. */
export async function getScoreboardDateFeed(options: {
  date: string;
  season?: string;
}): Promise<ScoreboardFeedResult<GameSummary[]>> {
  const startYear = Number(options.date.slice(0, 4));
  const month = Number(options.date.slice(5, 7));
  const season =
    options.season ??
    canonicalSeasonFromStartYear(month >= 7 ? startYear : startYear - 1);
  const dateKey = options.date.replace(/-/g, "");
  const result = await softLoad({
    key: `${season}:${dateKey}`,
    cache: dateCache,
    label: `day ${options.date}`,
    empty: [] as Game[],
    live: espnLiveScoreboardDateKeys().includes(dateKey),
    load: () => loadDay({ dateKey, season }),
  });
  return { ...result, data: result.data.map(toGameSummary) };
}

export function __resetScoreboardFeedCachesForTests() {
  monthCache.clear();
  weekCache.clear();
  upcomingCache.clear();
  dayCache.clear();
  homeStripCache.clear();
  recentCache.clear();
  dateCache.clear();
  monthLoaderOverride = null;
  dayLoaderOverride = null;
  sharedClearPrefix("scoreboard-soft:");
}

export function __setScoreboardMonthLoaderForTests(loader: MonthLoader | null) {
  monthLoaderOverride = loader;
}

export function __setScoreboardDayLoaderForTests(loader: DayLoader | null) {
  dayLoaderOverride = loader;
}

export function __seedScoreboardCacheForTests(
  kind: "day" | "month",
  key: string,
  games: Game[],
  retrievedAt = "2026-01-01T00:00:00.000Z"
) {
  const entry = { value: games, retrievedAt };
  if (kind === "day") dayCache.set(key, entry);
  else monthCache.set(key, entry);
}
