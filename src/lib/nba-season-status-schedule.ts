/**
 * Schedule-backed season gates. Loads game-snapshot JSON (ASSETS / disk).
 * Do not import from client components — use approximations in
 * player-board-season-sync instead.
 */
import { getRuntimeSnapshotGames } from "@/data/runtime/game-snapshot";
import { nbaTodayIso } from "@/lib/nba-calendar-date";
import { isCurrentNbaSeason } from "@/lib/nba-season-status";

/**
 * First regular-season tip date on the bundled schedule, or null when unknown.
 * Used to flip "preseason roster" defaults the night the league opens —
 * not a fixed calendar day that drifts relative to the real opener.
 */
export async function firstRegularSeasonTipDate(
  season: string
): Promise<string | null> {
  const dates = (await getRuntimeSnapshotGames(season))
    .filter((game) => (game.gameType ?? "regular") === "regular")
    .map((game) => game.gameDate)
    .filter(Boolean)
    .sort();
  return dates[0] ?? null;
}

/** True once today's league calendar day is on or after the RS opener. */
export async function leagueRegularSeasonHasOpened(
  season: string,
  now = new Date()
): Promise<boolean> {
  const opener = await firstRegularSeasonTipDate(season);
  if (!opener) return false;
  return nbaTodayIso(now) >= opener;
}

/**
 * Current season before the first regular-season tip on the calendar.
 * Once opening night has passed, the season has started even if every board
 * row still shows 0 GP (late box scores / empty dash).
 */
export async function isSeasonAwaitingFirstGame(
  season: string,
  _rows: readonly { gamesPlayed: number }[] = [],
  now = new Date()
): Promise<boolean> {
  if (season.trim().toUpperCase() === "ALL") return false;
  if (!isCurrentNbaSeason(season, now)) return false;
  return !(await leagueRegularSeasonHasOpened(season, now));
}
