import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";

/** Pure calendar check — safe for client modules. */
export function isCurrentNbaSeason(season: string, now = new Date()): boolean {
  return season === canonicalSeasonFromStartYear(currentNbaStartYear(now));
}
