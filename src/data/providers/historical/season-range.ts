/**
 * Canonical season helpers spanning the NBA era used by historical APIs.
 * Canonical form: "YYYY-YY" (e.g. "1969-70"). BallDontLie season = start year.
 */

export const HISTORICAL_START_YEAR = 1960;

export function currentNbaStartYear(now = new Date()): number {
  // Season labeled by start year; flips around October.
  return now.getUTCMonth() >= 9
    ? now.getUTCFullYear()
    : now.getUTCFullYear() - 1;
}

export function canonicalSeasonFromStartYear(startYear: number): string {
  const endTwo = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endTwo}`;
}

export function startYearFromCanonicalSeason(season: string): number {
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
  return start;
}

/** Inclusive list of canonical seasons from `fromStart` through current. */
export function listCanonicalSeasons(
  fromStart = HISTORICAL_START_YEAR,
  toStart = currentNbaStartYear()
): string[] {
  const seasons: string[] = [];
  for (let y = fromStart; y <= toStart; y++) {
    seasons.push(canonicalSeasonFromStartYear(y));
  }
  return seasons;
}

export function parseSeasonParam(
  value: string | null | undefined
): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    startYearFromCanonicalSeason(trimmed); // validate
    return trimmed;
  }
  if (/^\d{4}$/.test(trimmed)) {
    return canonicalSeasonFromStartYear(Number(trimmed));
  }
  throw new Error(
    `Invalid season "${value}". Use YYYY-YY (1969-70) or start year (1969).`
  );
}
