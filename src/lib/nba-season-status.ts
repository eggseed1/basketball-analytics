import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { getRuntimeSnapshotGames } from "@/data/runtime/game-snapshot";
import { nbaTodayIso } from "@/lib/nba-calendar-date";

export function isCurrentNbaSeason(season: string, now = new Date()): boolean {
  return season === canonicalSeasonFromStartYear(currentNbaStartYear(now));
}

/**
 * First regular-season tip date on the bundled schedule, or null when unknown.
 * Used to flip "preseason roster" defaults the night the league opens —
 * not a fixed calendar day that drifts relative to the real opener.
 */
export function firstRegularSeasonTipDate(season: string): string | null {
  const dates = getRuntimeSnapshotGames(season)
    .filter((game) => (game.gameType ?? "regular") === "regular")
    .map((game) => game.gameDate)
    .filter(Boolean)
    .sort();
  return dates[0] ?? null;
}

/** True once today's league calendar day is on or after the RS opener. */
export function leagueRegularSeasonHasOpened(
  season: string,
  now = new Date()
): boolean {
  const opener = firstRegularSeasonTipDate(season);
  if (!opener) return false;
  return nbaTodayIso(now) >= opener;
}

/**
 * Current season before the first regular-season tip on the calendar.
 * Once opening night has passed, the season has started even if every board
 * row still shows 0 GP (late box scores / empty dash).
 */
export function isSeasonAwaitingFirstGame(
  season: string,
  _rows: readonly { gamesPlayed: number }[] = [],
  now = new Date()
): boolean {
  if (season.trim().toUpperCase() === "ALL") return false;
  if (!isCurrentNbaSeason(season, now)) return false;
  return !leagueRegularSeasonHasOpened(season, now);
}
