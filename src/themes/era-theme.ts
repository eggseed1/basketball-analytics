/**
 * NBA Time Machine — era theme layer over shared DRBL design tokens.
 * Cosmetics only: one product, one data model; theme follows season.
 */

import {
  startYearFromCanonicalSeason,
  currentNbaStartYear,
  canonicalSeasonFromStartYear,
} from "@/data/providers/historical/season-range";

export type EraThemeId =
  | "early"
  | "1980s"
  | "1990s"
  | "2000s"
  | "2010s"
  | "modern";

/** Manual override: historical follows season; modern forces DRBL tokens. */
export type ThemeMode = "historical" | "modern";

export type EraTheme = {
  id: EraThemeId;
  /** Inclusive first season start year. */
  startYear: number;
  /** Inclusive last season start year. */
  endYear: number;
  name: string;
  shortLabel: string;
  /** CSS `data-era-theme` value applied to the scope. */
  cssKey: EraThemeId;
  description: string;
};

/**
 * Sensible historical eras — not one theme per season.
 * Boundaries favor readable visual shifts over strict decade math.
 */
export const ERA_THEMES: readonly EraTheme[] = [
  {
    id: "early",
    startYear: 1946,
    endYear: 1979,
    name: "Early NBA",
    shortLabel: "Early",
    cssKey: "early",
    description: "Pre-1980 atmosphere — print, wood, classic serif character.",
  },
  {
    id: "1980s",
    startYear: 1980,
    endYear: 1989,
    name: "1980s",
    shortLabel: "80s",
    cssKey: "1980s",
    description: "Showtime era — warm neutrals, bold sans, soft amber accent.",
  },
  {
    id: "1990s",
    startYear: 1990,
    endYear: 1999,
    name: "1990s",
    shortLabel: "90s",
    cssKey: "1990s",
    description: "Mid-90s broadcast feel — cooler slate, tighter geometry.",
  },
  {
    id: "2000s",
    startYear: 2000,
    endYear: 2009,
    name: "2000s",
    shortLabel: "00s",
    cssKey: "2000s",
    description: "Early web / HD transition — crisp panels, blue-steel accent.",
  },
  {
    id: "2010s",
    startYear: 2010,
    endYear: 2019,
    name: "2010s",
    shortLabel: "10s",
    cssKey: "2010s",
    description: "Analytics decade — clean surfaces, restrained contrast.",
  },
  {
    id: "modern",
    startYear: 2020,
    endYear: 2100,
    name: "Modern",
    shortLabel: "Modern",
    cssKey: "modern",
    description: "Current DRBL design system.",
  },
] as const;

export function parseThemeMode(
  value: string | null | undefined
): ThemeMode {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "modern") return "modern";
  return "historical";
}

export function resolveEraThemeForSeason(season: string): EraTheme {
  let start: number;
  try {
    start = startYearFromCanonicalSeason(season);
  } catch {
    return ERA_THEMES.find((e) => e.id === "modern")!;
  }
  for (const era of ERA_THEMES) {
    if (start >= era.startYear && start <= era.endYear) return era;
  }
  return ERA_THEMES.find((e) => e.id === "modern")!;
}

/**
 * Active presentation theme for Time Machine.
 * Modern override always wins; otherwise season maps to an era.
 */
export function resolveActiveEraTheme(
  season: string | null | undefined,
  themeMode: ThemeMode = "historical"
): EraTheme {
  if (themeMode === "modern" || !season) {
    return ERA_THEMES.find((e) => e.id === "modern")!;
  }
  return resolveEraThemeForSeason(season);
}

export function defaultTimeMachineSeason(
  seasons: string[],
  now = new Date()
): string {
  const classic =
    seasons.find((s) => s.startsWith("1978")) ??
    seasons.find((s) => s.startsWith("1980")) ??
    seasons.find((s) => s.startsWith("1995"));
  if (classic) return classic;
  return (
    seasons[Math.floor(seasons.length / 2)] ??
    canonicalSeasonFromStartYear(currentNbaStartYear(now))
  );
}

/** Season calendar helpers for date explorer (UTC dates). */
export function seasonDateBounds(season: string): {
  start: string;
  end: string;
} {
  const y = startYearFromCanonicalSeason(season);
  return {
    start: `${y}-10-01`,
    end: `${y + 1}-06-30`,
  };
}

export function clampDateToSeason(date: string, season: string): string {
  const { start, end } = seasonDateBounds(season);
  if (date < start) return start;
  if (date > end) return end;
  return date;
}

/** Month/day in America/New_York (NBA calendar day). */
export function nbaCalendarMonthDay(now: Date = new Date()): {
  month: number;
  day: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  return {
    month: Number.isFinite(month) ? month : now.getUTCMonth() + 1,
    day: Number.isFinite(day) ? day : now.getUTCDate(),
  };
}

/**
 * Map a calendar month/day onto the selected season’s year span (Oct–Jun).
 * Returns null for Jul–Sep (offseason) or invalid dates.
 */
export function mapCalendarDayOntoSeason(
  season: string,
  month: number,
  day: number
): string | null {
  if (!Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Jul–Sep sit between seasons.
  if (month >= 7 && month <= 9) return null;

  const y = startYearFromCanonicalSeason(season);
  const year = month >= 10 ? y : y + 1;
  const candidate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  // Reject impossible calendar strings (e.g. Feb 31).
  const probe = new Date(`${candidate}T12:00:00Z`);
  if (Number.isNaN(probe.getTime()) || probe.toISOString().slice(0, 10) !== candidate) {
    return null;
  }
  const { start, end } = seasonDateBounds(season);
  if (candidate < start || candidate > end) return null;
  return candidate;
}

export function shiftIsoDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function adjacentSeason(
  season: string,
  delta: -1 | 1,
  available: string[]
): string | null {
  const set = new Set(available);
  try {
    const next = canonicalSeasonFromStartYear(
      startYearFromCanonicalSeason(season) + delta
    );
    return set.has(next) ? next : null;
  } catch {
    return null;
  }
}
