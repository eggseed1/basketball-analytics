/**
 * Season string helpers.
 * Canonical: "2024-25"  ↔  ending calendar year 2025
 */

/** First season with factual NBA-lineage player membership (1946-47 BAA). */
export const EARLIEST_NBA_STATS_ESPN_YEAR = 1947;

/** First season where stats.nba.com leagueleaders returns rows (1951-52). */
export const EARLIEST_LEAGUELEADERS_ESPN_YEAR = 1952;

/** First season where leaguedashplayerstats / teamstats return data (1996-97). */
export const MODERN_LEAGUE_DASH_ESPN_YEAR = 1997;

export function canonicalSeasonFromEspnYear(year: number): string {
  const start = year - 1;
  const end = String(year).slice(-2);
  return `${start}-${end}`;
}

export function espnYearFromCanonicalSeason(season: string): number {
  const match = /^(\d{4})-(\d{2})$/.exec(season.trim());
  if (!match) {
    throw new Error(`Invalid canonical season "${season}". Expected YYYY-YY.`);
  }
  const start = Number(match[1]);
  const endTwo = Number(match[2]);
  const expectedEnd = (start + 1) % 100;
  if (endTwo !== expectedEnd) {
    throw new Error(
      `Invalid canonical season "${season}". End year must be start+1.`
    );
  }
  return start + 1;
}

import { currentNbaStartYear } from "@/data/providers/historical/season-range";

/** Ending calendar year for the current NBA campaign (Jul flip). */
export function currentEspnSeasonYear(now = new Date()): number {
  return currentNbaStartYear(now) + 1;
}

/** Recent seasons to expose when none is requested. */
export function defaultCanonicalSeasons(count = 3): string[] {
  const espnYear = currentEspnSeasonYear();
  return Array.from({ length: count }, (_, i) =>
    canonicalSeasonFromEspnYear(espnYear - i)
  );
}

/**
 * Whether stats.nba.com league-dash endpoints have season tables.
 * Pre-1996 seasons use leagueleaders (+ standings) instead.
 */
export function isModernLeagueDashSeason(season: string): boolean {
  try {
    return espnYearFromCanonicalSeason(season) >= MODERN_LEAGUE_DASH_ESPN_YEAR;
  } catch {
    return false;
  }
}

/**
 * Season picker list for explore / dashboard.
 * Goes back to 1946-47 (NBA-recognized lineage player registry).
 * Each season loads on demand when selected.
 */
export function availableCanonicalSeasons(
  earliestEspnYear = EARLIEST_NBA_STATS_ESPN_YEAR
): string[] {
  const latest = currentEspnSeasonYear();
  const start = Math.min(earliestEspnYear, latest);
  return Array.from({ length: latest - start + 1 }, (_, i) =>
    canonicalSeasonFromEspnYear(latest - i)
  );
}
