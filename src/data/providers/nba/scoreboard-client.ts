import type { Game } from "@/data/types";
import { espnFetchJson } from "@/data/providers/nba/espn-client";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { espnYearFromCanonicalSeason } from "@/data/providers/nba/season";
import {
  transformEspnScheduleEvent,
  type EspnScheduleEvent,
} from "@/data/transformers/espn";
import { LIVE_SCOREBOARD_TTL_MS } from "@/lib/live-refresh-policy";

const SITE_API = "https://site.api.espn.com";

type ScoreboardResponse = {
  events?: EspnScheduleEvent[];
};

/**
 * Season that owns the next tip-offs.
 * Jul–Sep (offseason) → upcoming fall campaign; otherwise the active season.
 */
export function upcomingScheduleSeason(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0–11
  const startYear = m >= 6 ? y : y - 1;
  return canonicalSeasonFromStartYear(startYear);
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
    { ttlMs: 1000 * 60 * 10, retries: 1 }
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
 * Recent finals via ESPN monthly scoreboards - one request covers ~a month.
 * Avoids 30× team schedule fan-out and empty “upcoming season” calendars.
 */
export async function fetchRecentScoreboardGames(options: {
  season?: string;
  limit?: number;
}): Promise<Game[]> {
  const limit = options.limit ?? 16;
  const season =
    options.season ?? canonicalSeasonFromStartYear(currentNbaStartYear());
  const endYear = espnYearFromCanonicalSeason(season);

  // Newest months first (Finals → late regular season).
  const months = [
    `${endYear}06`,
    `${endYear}05`,
    `${endYear}04`,
    `${endYear}03`,
  ];

  const byId = new Map<string, Game>();
  const payloads = await Promise.all(
    months.map((month) =>
      espnFetchJson<ScoreboardResponse>(
        `${SITE_API}/apis/site/v2/sports/basketball/nba/scoreboard?dates=${month}&limit=200`,
        { ttlMs: 1000 * 60 * 15, retries: 1 }
      ).catch(() => ({ events: [] }) as ScoreboardResponse)
    )
  );

  for (const payload of payloads) {
    for (const event of payload.events ?? []) {
      const game = transformEspnScheduleEvent(event, season);
      if (!game) continue;
      if (game.status !== "final") continue;
      if (!byId.has(game.id)) byId.set(game.id, game);
    }
  }

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
  let cursor = monthKeyFromDate(now);
  for (let i = 0; i < 5; i++) {
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

/**
 * Upcoming tip-offs for the gamefeed list.
 * Uses monthly ESPN scoreboards (few parallel requests).
 */
export async function fetchUpcomingScoreboardGames(options: {
  season?: string;
  fromDate?: string;
  /** Skip games at/before this tip (ISO) when paginating. */
  afterTipOffAt?: string;
  afterId?: string;
  monthCount?: number;
  limit?: number;
}): Promise<{ games: Game[]; hasMore: boolean }> {
  const season = options.season ?? upcomingScheduleSeason();
  const fromDate = options.fromDate ?? new Date().toISOString().slice(0, 10);
  const monthCount = options.monthCount ?? 8;
  const limit = options.limit ?? 60;
  const afterTip = options.afterTipOffAt;
  const afterId = options.afterId;

  const months: string[] = [];
  let cursor = monthKeyFromDate(new Date(`${fromDate}T12:00:00Z`));
  const monthsNeeded = Math.min(
    monthCount,
    Math.max(2, Math.ceil(limit / 40) + 1)
  );
  for (let i = 0; i < monthsNeeded; i++) {
    months.push(cursor);
    cursor = shiftMonthKey(cursor, 1);
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

  let sorted = await collect(months);

  if (sorted.length < limit + 1 && monthsNeeded < monthCount) {
    const extraMonths: string[] = [];
    let extra = cursor;
    for (let i = monthsNeeded; i < monthCount; i++) {
      extraMonths.push(extra);
      extra = shiftMonthKey(extra, 1);
    }
    if (extraMonths.length) {
      const more = await collect(extraMonths);
      const seen = new Set(sorted.map((g) => g.id));
      for (const g of more) {
        if (seen.has(g.id)) continue;
        sorted.push(g);
      }
      sorted.sort((a, b) => {
        const ta = a.tipOffAt ?? a.gameDate;
        const tb = b.tipOffAt ?? b.gameDate;
        if (ta !== tb) return ta.localeCompare(tb);
        return a.id.localeCompare(b.id);
      });
    }
  }

  const seen = new Set<string>();
  const unique: Game[] = [];
  for (const g of sorted) {
    if (seen.has(g.id)) continue;
    seen.add(g.id);
    unique.push(g);
  }

  const hasMore = unique.length > limit;
  return { games: unique.slice(0, limit), hasMore };
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
