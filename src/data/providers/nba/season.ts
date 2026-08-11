/**
 * Season string helpers for ESPN (uses ending calendar year).
 * Canonical: "2024-25"  ↔  ESPN: 2025
 */

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

/** Recent seasons to expose when none is requested. */
export function defaultCanonicalSeasons(count = 3): string[] {
  // ESPN season year for "current" completed-or-active campaign.
  // Prefer ending year of the latest NBA season that has stats.
  const now = new Date();
  // NBA season year flips around October; before Oct use previous ESPN year.
  const espnYear =
    now.getUTCMonth() >= 9 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  return Array.from({ length: count }, (_, i) =>
    canonicalSeasonFromEspnYear(espnYear - i)
  );
}
