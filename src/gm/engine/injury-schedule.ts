/**
 * Map injury gamesRemaining onto the published slate so the calendar can show
 * a return date, and so game nights know who is still out.
 */

import type { GmLeagueState, GmPlayer, GmScheduleGame } from "@/gm/types";
import type { CalendarMark } from "@/gm/engine/calendar-marks";

export function isInjured(player: GmPlayer): boolean {
  return Boolean(player.injury && player.injury.gamesRemaining > 0);
}

function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

/** Distinct upcoming schedule days that still have a tip (injury ticks follow these). */
function upcomingGameDays(schedule: GmScheduleGame[], fromDay: number): number[] {
  const days = new Set<number>();
  for (const game of schedule) {
    if (game.played || game.day < fromDay) continue;
    if (game.exhibition === "allstar") continue;
    days.add(game.day);
  }
  return [...days].sort((a, b) => a - b);
}

function dateForDay(schedule: GmScheduleGame[], day: number): string | null {
  const hit = schedule.find((game) => game.day === day && game.gameDate);
  return hit?.gameDate ?? null;
}

/**
 * First slate day the player is expected to be available.
 * Injuries tick once per game-day, so N games remaining ≈ N slate days out.
 */
export function injuryReturnDay(
  player: GmPlayer,
  schedule: GmScheduleGame[],
  fromDay: number
): number | null {
  if (!isInjured(player)) return null;
  const skip = Math.max(1, Math.ceil(player.injury!.gamesRemaining));
  const days = upcomingGameDays(schedule, fromDay);
  return days[skip] ?? null;
}

export function injuryReturnDate(
  player: GmPlayer,
  schedule: GmScheduleGame[],
  fromDay: number
): string | null {
  const day = injuryReturnDay(player, schedule, fromDay);
  return day == null ? null : dateForDay(schedule, day);
}

/** True when the player is still sidelined on this tip date. */
export function injuredOnDate(
  player: GmPlayer,
  iso: string,
  schedule: GmScheduleGame[],
  fromDay: number
): boolean {
  if (!isInjured(player)) return false;
  const back = injuryReturnDate(player, schedule, fromDay);
  if (!back) return true;
  return iso < back;
}

/**
 * User-team injury marks for the season calendar.
 * Return nights get a short last-name label; out windows keep a quiet wash.
 */
export function userInjuryMarks(league: GmLeagueState): CalendarMark[] {
  const { schedule, day, userTeamId, players } = league;
  const hurt = players.filter(
    (player) => player.teamId === userTeamId && isInjured(player)
  );
  if (!hurt.length) return [];

  const marks: CalendarMark[] = [];
  const byReturn = new Map<string, GmPlayer[]>();

  for (const player of hurt) {
    const back = injuryReturnDate(player, schedule, day);
    if (!back) continue;
    const list = byReturn.get(back) ?? [];
    list.push(player);
    byReturn.set(back, list);
  }

  for (const [iso, group] of byReturn) {
    const names = group.map((player) => lastName(player.name));
    const line =
      names.length === 1
        ? names[0]!
        : names.length === 2
          ? names.join("+")
          : `${names[0]}+`;
    const detail = group
      .map((player) => {
        const games = Math.ceil(player.injury!.gamesRemaining);
        return `${player.name} (${player.injury!.type}, ~${games} left)`;
      })
      .join(". ");
    marks.push({
      iso,
      label: "Back",
      line,
      title: `${detail}. Expected back ${iso}.`,
      kind: "injury",
    });
  }

  return marks;
}

/** Healthy-enough names out for the user’s tip on this date (for cell captions). */
export function userOutsOnDate(league: GmLeagueState, iso: string): GmPlayer[] {
  return league.players.filter(
    (player) =>
      player.teamId === league.userTeamId &&
      injuredOnDate(player, iso, league.schedule, league.day)
  );
}
