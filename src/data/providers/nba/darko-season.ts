import { brefSeasonYear } from "@/data/providers/nba/bref-season-year";

/** DARKO / darko.app season coverage starts with 1996-97. */
export const EARLIEST_DARKO_SEASON_YEAR = 1997;

export function darkoSeasonYear(canonicalSeason: string): number {
  return brefSeasonYear(canonicalSeason);
}

export function isDarkoSeasonAvailable(canonicalSeason: string): boolean {
  try {
    return darkoSeasonYear(canonicalSeason) >= EARLIEST_DARKO_SEASON_YEAR;
  } catch {
    return false;
  }
}
