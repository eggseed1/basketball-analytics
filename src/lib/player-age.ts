import { espnYearFromCanonicalSeason } from "@/data/providers/nba/season";

type Ymd = { y: number; m: number; d: number };

function parseIsoDate(iso: string): Ymd | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!Number.isFinite(y) || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

function ageOnDate(born: Ymd, asOf: Ymd): number {
  let age = asOf.y - born.y;
  if (asOf.m < born.m || (asOf.m === born.m && asOf.d < born.d)) age -= 1;
  return age;
}

/**
 * Age during a season - NBA/Basketball-Reference convention:
 * age on February 1 of the season's ending year (2024-25 → 2025-02-01).
 */
export function ageAsOfSeason(
  birthDate: string | null | undefined,
  season: string
): number | null {
  if (!birthDate) return null;
  const born = parseIsoDate(birthDate);
  if (!born) return null;
  let endYear: number;
  try {
    endYear = espnYearFromCanonicalSeason(season);
  } catch {
    return null;
  }
  const age = ageOnDate(born, { y: endYear, m: 2, d: 1 });
  return age >= 0 && age < 80 ? age : null;
}

export function formatBirthLine(
  birthDate: string | null | undefined,
  season: string
): string | null {
  const age = ageAsOfSeason(birthDate, season);
  if (birthDate) {
    return age != null ? `Born ${birthDate} (Age: ${age})` : `Born ${birthDate}`;
  }
  return age != null ? `Age ${age}` : null;
}
