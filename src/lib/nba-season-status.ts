import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";

export function isCurrentNbaSeason(season: string, now = new Date()): boolean {
  return season === canonicalSeasonFromStartYear(currentNbaStartYear(now));
}

/** Current season with no regular-season games on the board yet (pre-tip roster). */
export function isSeasonAwaitingFirstGame(
  season: string,
  rows: readonly { gamesPlayed: number }[],
  now = new Date()
): boolean {
  if (season.trim().toUpperCase() === "ALL") return false;
  if (!isCurrentNbaSeason(season, now)) return false;
  if (!rows.length) return true;
  return !rows.some((row) => row.gamesPlayed > 0);
}
