import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import tipDates from "@/data/runtime/first-regular-season-tips.json";
import { nbaTodayIso } from "@/lib/nba-calendar-date";

type TipFile = {
  tips?: Record<string, string>;
};

const tips = (tipDates as TipFile).tips ?? {};

export function isCurrentNbaSeason(season: string, now = new Date()): boolean {
  return season === canonicalSeasonFromStartYear(currentNbaStartYear(now));
}

/**
 * First regular-season tip date on the bundled schedule, or null when unknown.
 * Used to flip "preseason roster" defaults the night the league opens —
 * not a fixed calendar day that drifts relative to the real opener.
 *
 * Tip dates live in a tiny JSON extracted from game-snapshot so season-status
 * checks do not pull the 1.4MB schedule into every board route.
 */
export function firstRegularSeasonTipDate(season: string): string | null {
  const tip = tips[season];
  return tip && /^\d{4}-\d{2}-\d{2}$/.test(tip) ? tip : null;
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

/**
 * This club has no measured games yet on the current year board (missing row
 * or GP=0). League may already be open — ESPN by-team often omits 0-GP teams.
 */
export function isTeamAwaitingFirstGame(
  season: string,
  team: { gamesPlayed: number } | null | undefined,
  now = new Date()
): boolean {
  if (!isCurrentNbaSeason(season, now)) return false;
  if (isSeasonAwaitingFirstGame(season, [], now)) return true;
  if (!team) return true;
  const gp = team.gamesPlayed;
  return !Number.isFinite(gp) || gp <= 0;
}
