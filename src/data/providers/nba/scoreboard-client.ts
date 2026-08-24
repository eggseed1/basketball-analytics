import type { Game } from "@/data/types";
import { sharedGetOrSet } from "@/data/cache/shared-ttl-cache";
import { espnFetchJson } from "@/data/providers/nba/espn-client";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { espnYearFromCanonicalSeason } from "@/data/providers/nba/season";
import {
  isVercelRuntime,
  runtimeTimeoutMs,
} from "@/data/providers/nba/runtime-policy";
import {
  transformEspnScheduleEvent,
  type EspnScheduleEvent,
} from "@/data/transformers/espn";
import { LIVE_SCOREBOARD_TTL_MS } from "@/lib/live-refresh-policy";

const SITE_API = "https://site.api.espn.com";
/** Scoreboard months are large payloads — give Vercel more than identity TTLs. */
const SCOREBOARD_TIMEOUT_MS = runtimeTimeoutMs(8_000, 6_000);
const SEASON_SCHEDULE_TTL_MS = 1000 * 60 * 30;
/** Cold serverless: prefer fewer sequential month walks over completeness. */
const RECENT_MONTH_ATTEMPTS = isVercelRuntime() ? 4 : 8;
const SEASON_MONTH_CONCURRENCY = isVercelRuntime() ? 3 : 4;

type ScoreboardResponse = {
  events?: EspnScheduleEvent[];
};

/**
 * Season that owns the next tip-offs — same Jul 1 flip as roster/cap surfaces.
 */
export function upcomingScheduleSeason(now = new Date()): string {
  return canonicalSeasonFromStartYear(currentNbaStartYear(now));
}

/** `2026-06` → `202606` for ESPN scoreboard. */
export function espnMonthParam(monthKey: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey.trim());
  if (!m) throw new Error(`Invalid month key "${monthKey}". Use YYYY-MM.`);
  return `${m[1]}${m[2]}`;
}

export function monthKeyFromDate(d = new Date()): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${mo}`;
}

/** Shift YYYY-MM by delta months. */
export function shiftMonthKey(monthKey: string, delta: number): string {
  const [ys, ms] = monthKey.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const idx = y * 12 + (m - 1) + delta;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export function seasonMonthBounds(season: string): {
  firstMonth: string;
  lastMonth: string;
} {
  const endYear = espnYearFromCanonicalSeason(season);
  return {
    firstMonth: `${endYear - 1}-10`,
    lastMonth: `${endYear}-06`,
  };
}

function listSeasonMonthKeys(
  season: string,
  options?: { throughMonth?: string }
): string[] {
  const { firstMonth, lastMonth } = seasonMonthBounds(season);
  const through = options?.throughMonth ?? lastMonth;
  const end = through < lastMonth ? through : lastMonth;
  const keys: string[] = [];
  let cursor = firstMonth;
  while (cursor <= end) {
    keys.push(cursor);
    cursor = shiftMonthKey(cursor, 1);
  }
  return keys;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await worker(items[index]!);
      }
    }
  );
  await Promise.all(runners);
  return results;
}

/**
 * Full (or through-today) season slate via ESPN monthly scoreboards.
 * Used when stats.nba leaguegamelog is disabled (Vercel) or empty.
 */
export async function fetchEspnSeasonSchedule(season: string): Promise<Game[]> {
  return sharedGetOrSet(
    `espn-season-schedule:${season}`,
    {
      ttlMs: SEASON_SCHEDULE_TTL_MS,
      staleMs: SEASON_SCHEDULE_TTL_MS * 2,
      tags: ["espn-schedule", `espn-schedule:${season}`],
    },
    async () => {
      const throughMonth = monthKeyFromDate();
      const monthKeys = listSeasonMonthKeys(season, { throughMonth });
      const chunks = await mapPool(
        monthKeys,
        SEASON_MONTH_CONCURRENCY,
        async (monthKey) => {
          try {
            return await fetchScoreboardMonth({ monthKey, season });
          } catch {
            return [] as Game[];
          }
        }
      );
      const byId = new Map<string, Game>();
      for (const games of chunks) {
        for (const game of games) {
          if (!byId.has(game.id)) byId.set(game.id, game);
        }
      }
      return [...byId.values()].sort((a, b) =>
        a.gameDate === b.gameDate
          ? a.id.localeCompare(b.id)
          : a.gameDate.localeCompare(b.gameDate)
      );
    }
  );
}

/**
 * Locate one ESPN event across recent scoreboard months (no stats.nba scan).
 */
export async function findEspnGameById(
  gameId: string,
  options?: { season?: string; monthAttempts?: number }
): Promise<Game | null> {
  const id = String(gameId ?? "").trim();
  if (!id) return null;
  const season =
    options?.season ?? canonicalSeasonFromStartYear(currentNbaStartYear());
  const attempts = options?.monthAttempts ?? RECENT_MONTH_ATTEMPTS;
  let cursor = monthKeyFromDate();
  const { firstMonth } = seasonMonthBounds(season);

  for (let i = 0; i < attempts && cursor >= firstMonth; i += 1) {
    try {
      const games = await fetchScoreboardMonth({ monthKey: cursor, season });
      const hit = games.find((game) => game.id === id);
      if (hit) return hit;
    } catch {
      // keep walking
    }
    cursor = shiftMonthKey(cursor, -1);
  }
  return null;
}

/**
 * Resolve the newest started season/month that can contain completed games.
 * During July–September the league-year season has not tipped, so "recent"
 * must point at the just-completed season rather than future March–June pages.
 */
export function recentScoreboardWindow(
  requestedSeason: string,
  now = new Date()
): {
  season: string;
  firstMonth: string;
  startMonth: string;
} {
  const currentMonth = monthKeyFromDate(now);
  let endYear = espnYearFromCanonicalSeason(requestedSeason);
  let firstMonth = `${endYear - 1}-10`;

  while (currentMonth < firstMonth) {
    endYear -= 1;
    firstMonth = `${endYear - 1}-10`;
  }

  const season = canonicalSeasonFromStartYear(endYear - 1);
  const lastMonth = `${endYear}-06`;
  return {
    season,
    firstMonth,
    startMonth: currentMonth > lastMonth ? lastMonth : currentMonth,
  };
}

/**
 * All ESPN scoreboard events for one calendar month (finals + live + scheduled).
 */
export async function fetchScoreboardMonth(options: {
  monthKey: string;
  season?: string;
}): Promise<Game[]> {
  const season =
    options.season ?? canonicalSeasonFromStartYear(currentNbaStartYear());
  const dates = espnMonthParam(options.monthKey);
  const payload = await espnFetchJson<ScoreboardResponse>(
    `${SITE_API}/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dates}&limit=400`,
    { ttlMs: 1000 * 60 * 10, retries: 2, timeoutMs: SCOREBOARD_TIMEOUT_MS }
  );

  const byId = new Map<string, Game>();
  for (const event of payload.events ?? []) {
    const game = transformEspnScheduleEvent(event, season);
    if (!game) continue;
    if (!byId.has(game.id)) byId.set(game.id, game);
  }

  return [...byId.values()].sort((a, b) =>
    a.gameDate === b.gameDate
      ? a.id.localeCompare(b.id)
      : a.gameDate.localeCompare(b.gameDate)
  );
}

/**
 * Recent finals via ESPN monthly scoreboards.
 *
 * Fetch newest month first and stop as soon as the requested slate is full.
 * This avoids four parallel requests on every cold render and avoids querying
 * future months during the offseason.
 */
export async function fetchRecentScoreboardGames(options: {
  season?: string;
  limit?: number;
  now?: Date;
}): Promise<Game[]> {
  const requestedSeason =
    options.season ?? canonicalSeasonFromStartYear(currentNbaStartYear());
  const limit = Math.max(1, options.limit ?? 16);
  const window = recentScoreboardWindow(requestedSeason, options.now);
  const byId = new Map<string, Game>();

  let cursor = window.startMonth;
  let successfulMonths = 0;
  let lastError: unknown;

  for (
    let attempted = 0;
    attempted < RECENT_MONTH_ATTEMPTS &&
    cursor >= window.firstMonth &&
    byId.size < limit;
    attempted += 1
  ) {
    try {
      const games = await fetchScoreboardMonth({
        monthKey: cursor,
        season: window.season,
      });
      successfulMonths += 1;
      for (const game of games) {
        if (game.status !== "final") continue;
        if (!byId.has(game.id)) byId.set(game.id, game);
      }
    } catch (error) {
      lastError = error;
    }
    cursor = shiftMonthKey(cursor, -1);
  }

  if (successfulMonths === 0 && lastError) throw lastError;

  return [...byId.values()]
    .sort((a, b) =>
      a.gameDate === b.gameDate
        ? b.id.localeCompare(a.id)
        : b.gameDate.localeCompare(a.gameDate)
    )
    .slice(0, limit);
}

/**
 * Games in the current local week (Sun–Sat). When the week is empty
 * (offseason / break), returns upcoming scheduled tip-offs as a preview.
 */
export async function fetchHomeWeekStrip(options: {
  season?: string;
  limit?: number;
  now?: Date;
}): Promise<{
  mode: "week" | "upcoming";
  games: Game[];
}> {
  const limit = options.limit ?? 10;
  const now = options.now ?? new Date();
  const season =
    options.season ?? canonicalSeasonFromStartYear(currentNbaStartYear());

  const weekStart = startOfWeekSunday(now);
  const weekEnd = addDays(weekStart, 6);
  const weekStartIso = toIsoDate(weekStart);
  const weekEndIso = toIsoDate(weekEnd);

  const monthKeys = [
    ...new Set([
      monthKeyFromDate(weekStart),
      monthKeyFromDate(weekEnd),
      monthKeyFromDate(now),
    ]),
  ];

  const weekSettled = await Promise.allSettled(
    monthKeys.map((monthKey) => fetchScoreboardMonth({ monthKey, season }))
  );
  const weekPool = weekSettled.flatMap((r) =>
    r.status === "fulfilled" ? r.value : []
  );
  if (
    weekPool.length === 0 &&
    weekSettled.every((r) => r.status === "rejected")
  ) {
    // Fall through to upcoming path; if that also fails entirely, throw.
  }

  const byId = new Map<string, Game>();
  for (const g of weekPool) byId.set(g.id, g);

  const weekGames = [...byId.values()]
    .filter((g) => g.gameDate >= weekStartIso && g.gameDate <= weekEndIso)
    .sort((a, b) =>
      a.gameDate === b.gameDate
        ? a.id.localeCompare(b.id)
        : a.gameDate.localeCompare(b.gameDate)
    );

  if (weekGames.length) {
    return { mode: "week", games: weekGames.slice(0, limit) };
  }

  // Quiet week: preview the next tip-offs on the board.
  const upcomingSeason = upcomingScheduleSeason(now);
  const upcomingMonths: string[] = [];
  const upcomingBounds = seasonMonthBounds(upcomingSeason);
  let cursor = monthKeyFromDate(now);
  if (cursor < upcomingBounds.firstMonth) cursor = upcomingBounds.firstMonth;

  // Two months normally cover the requested strip; avoid empty offseason months.
  for (
    let i = 0;
    i < 2 && cursor <= upcomingBounds.lastMonth;
    i += 1
  ) {
    upcomingMonths.push(cursor);
    cursor = shiftMonthKey(cursor, 1);
  }

  const upcomingSettled = await Promise.allSettled(
    upcomingMonths.map((monthKey) =>
      fetchScoreboardMonth({ monthKey, season: upcomingSeason })
    )
  );
  const upcomingPool = upcomingSettled.flatMap((r) =>
    r.status === "fulfilled" ? r.value : []
  );
  if (
    upcomingPool.length === 0 &&
    weekPool.length === 0 &&
    [...weekSettled, ...upcomingSettled].every((r) => r.status === "rejected")
  ) {
    const first = [...weekSettled, ...upcomingSettled].find(
      (r) => r.status === "rejected"
    );
    throw first && first.status === "rejected"
      ? first.reason
      : new Error("Home week strip unavailable");
  }

  const todayIso = toIsoDate(now);
  const upcoming = upcomingPool
    .filter(
      (g) =>
        g.gameDate >= todayIso &&
        (g.status === "scheduled" || g.status === "in_progress")
    )
    .sort((a, b) =>
      a.gameDate === b.gameDate
        ? a.id.localeCompare(b.id)
        : a.gameDate.localeCompare(b.gameDate)
    );

  const seen = new Set<string>();
  const unique: Game[] = [];
  for (const g of upcoming) {
    if (seen.has(g.id)) continue;
    seen.add(g.id);
    unique.push(g);
    if (unique.length >= limit) break;
  }

  return { mode: "upcoming", games: unique };
}

function startOfWeekSunday(d: Date): Date {
  const x = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
  x.setUTCDate(x.getUTCDate() - x.getUTCDay());
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Sunday (UTC) of the week containing `d` or an ISO date. */
export function startOfWeekSundayIso(input: Date | string = new Date()): string {
  const d =
    typeof input === "string"
      ? new Date(`${input.slice(0, 10)}T12:00:00Z`)
      : new Date(
          Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate())
        );
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return toIsoDate(d);
}

export function addDaysIso(isoDate: string, n: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return toIsoDate(d);
}

/** All games (final / live / scheduled) for a Sun–Sat week via ESPN months. */
export async function fetchScoreboardWeek(options: {
  weekStartIso?: string;
  season?: string;
}): Promise<{ weekStart: string; weekEnd: string; games: Game[] }> {
  const season =
    options.season ?? canonicalSeasonFromStartYear(currentNbaStartYear());
  const weekStart = startOfWeekSundayIso(
    options.weekStartIso ?? new Date().toISOString().slice(0, 10)
  );
  const weekEnd = addDaysIso(weekStart, 6);

  const monthKeys = [...new Set([
    monthKeyFromDate(new Date(`${weekStart}T12:00:00Z`)),
    monthKeyFromDate(new Date(`${weekEnd}T12:00:00Z`)),
  ])];

  const settled = await Promise.allSettled(
    monthKeys.map((monthKey) => fetchScoreboardMonth({ monthKey, season }))
  );
  const pool = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  if (pool.length === 0 && settled.every((r) => r.status === "rejected")) {
    const first = settled.find((r) => r.status === "rejected");
    throw first && first.status === "rejected"
      ? first.reason
      : new Error("Scoreboard week unavailable");
  }

  const byId = new Map<string, Game>();
  for (const g of pool) {
    if (g.gameDate < weekStart || g.gameDate > weekEnd) continue;
    byId.set(g.id, g);
  }

  const games = [...byId.values()].sort((a, b) =>
    a.gameDate === b.gameDate
      ? (a.tipOffAt ?? a.id).localeCompare(b.tipOffAt ?? b.id)
      : a.gameDate.localeCompare(b.gameDate)
  );

  return { weekStart, weekEnd, games };
}

function mergeUpcomingGames(existing: Game[], more: Game[]): Game[] {
  const byId = new Map(existing.map((game) => [game.id, game]));
  for (const game of more) {
    if (!byId.has(game.id)) byId.set(game.id, game);
  }
  return [...byId.values()].sort((a, b) => {
    const ta = a.tipOffAt ?? a.gameDate;
    const tb = b.tipOffAt ?? b.gameDate;
    if (ta !== tb) return ta.localeCompare(tb);
    return a.id.localeCompare(b.id);
  });
}

/**
 * Upcoming tip-offs for the gamefeed list.
 * Starts with two relevant months, then fetches one additional month only when
 * the requested page is still not full. Never fans out across all eight months.
 */
export async function fetchUpcomingScoreboardGames(options: {
  season?: string;
  fromDate?: string;
  /** Skip games at/before this tip (ISO) when paginating. */
  afterTipOffAt?: string;
  afterId?: string;
  monthCount?: number;
  limit?: number;
}): Promise<{ season: string; games: Game[]; hasMore: boolean }> {
  let season = options.season ?? upcomingScheduleSeason();
  const fromDate = options.fromDate ?? new Date().toISOString().slice(0, 10);
  const monthCount = Math.max(0, options.monthCount ?? 8);
  const limit = Math.max(1, options.limit ?? 60);
  const afterTip = options.afterTipOffAt;
  const afterId = options.afterId;
  let bounds = seasonMonthBounds(season);

  let cursor = monthKeyFromDate(new Date(`${fromDate}T12:00:00Z`));
  if (cursor < bounds.firstMonth) cursor = bounds.firstMonth;

  // After the June closer, the completed season has no future tip-offs. Flip to
  // the schedule season that owns the next October slate (preseason / opener).
  if (cursor > bounds.lastMonth) {
    const nextSeason = upcomingScheduleSeason(
      new Date(`${fromDate}T12:00:00Z`)
    );
    if (nextSeason === season) {
      return { season, games: [], hasMore: false };
    }
    season = nextSeason;
    bounds = seasonMonthBounds(season);
    cursor = bounds.firstMonth;
  }

  if (monthCount === 0) {
    return { season, games: [], hasMore: false };
  }

  const collect = async (monthKeys: string[]) => {
    const settled = await Promise.allSettled(
      monthKeys.map((monthKey) => fetchScoreboardMonth({ monthKey, season }))
    );
    const pool = settled.flatMap((r) =>
      r.status === "fulfilled" ? r.value : []
    );
    if (pool.length === 0 && settled.every((r) => r.status === "rejected")) {
      const first = settled.find((r) => r.status === "rejected");
      throw first && first.status === "rejected"
        ? first.reason
        : new Error("Upcoming scoreboard unavailable");
    }

    return pool
      .filter((g) => {
        if (g.gameDate < fromDate) return false;
        if (
          g.status !== "scheduled" &&
          g.status !== "pregame" &&
          g.status !== "delayed" &&
          g.status !== "in_progress" &&
          g.status !== "halftime" &&
          g.status !== "period_break"
        ) {
          return false;
        }
        const tip = g.tipOffAt ?? `${g.gameDate}T00:00:00Z`;
        if (afterTip) {
          if (tip < afterTip) return false;
          if (tip === afterTip && afterId && g.id <= afterId) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const ta = a.tipOffAt ?? a.gameDate;
        const tb = b.tipOffAt ?? b.gameDate;
        if (ta !== tb) return ta.localeCompare(tb);
        return a.id.localeCompare(b.id);
      });
  };

  const initialMonths: string[] = [];
  for (
    let i = 0;
    i < Math.min(2, monthCount) && cursor <= bounds.lastMonth;
    i += 1
  ) {
    initialMonths.push(cursor);
    cursor = shiftMonthKey(cursor, 1);
  }

  let sorted = await collect(initialMonths);
  let fetchedMonths = initialMonths.length;

  while (
    sorted.length < limit + 1 &&
    fetchedMonths < monthCount &&
    cursor <= bounds.lastMonth
  ) {
    const more = await collect([cursor]);
    sorted = mergeUpcomingGames(sorted, more);
    cursor = shiftMonthKey(cursor, 1);
    fetchedMonths += 1;
  }

  const hasMore = sorted.length > limit;
  return { season, games: sorted.slice(0, limit), hasMore };
}

/** America/New_York calendar day as ESPN `dates=YYYYMMDD`. */
export function espnScoreboardDateKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}${m}${d}`;
}

/**
 * Lightweight day scoreboard for live refresh — short TTL, optional bypass.
 * One ESPN request covers all games that day (batch, not N per game).
 */
export async function fetchScoreboardDay(options: {
  /** YYYYMMDD or omit for today (ET). */
  dateKey?: string;
  season?: string;
  force?: boolean;
  signal?: AbortSignal;
}): Promise<Game[]> {
  const season =
    options.season ?? canonicalSeasonFromStartYear(currentNbaStartYear());
  const dateKey = options.dateKey ?? espnScoreboardDateKey();
  const payload = await espnFetchJson<ScoreboardResponse>(
    `${SITE_API}/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateKey}&limit=100`,
    {
      ttlMs: LIVE_SCOREBOARD_TTL_MS,
      retries: 1,
      bypassCache: options.force === true,
      signal: options.signal,
    }
  );

  const byId = new Map<string, Game>();
  for (const event of payload.events ?? []) {
    const game = transformEspnScheduleEvent(event, season);
    if (!game) continue;
    if (!byId.has(game.id)) byId.set(game.id, game);
  }
  return [...byId.values()];
}
