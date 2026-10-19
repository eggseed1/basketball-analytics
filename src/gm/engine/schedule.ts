import type { GmLeagueState, GmScheduleGame, GmTeam } from "@/gm/types";
import { uid } from "@/gm/engine/rng";
import { emptyStandings } from "@/gm/engine/standings";
import template from "@/gm/seed/nba-schedule-2026-27.json";

/**
 * 2026-27 regular season as published (ESPN team schedules, Oct 20–Apr 11).
 * 1,200 games, 80 a team. The NBA adds the last 2 after the Cup group stage.
 * Later seasons reuse this rest pattern, flip home court every other year,
 * and fill those two games in without a third straight night.
 */
type Tip = { id: string; date: string; home: string; away: string };

const TIPS = template as Tip[];
const OPENING_SEASON = 2027;

function parseIso(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y!, (m ?? 1) - 1, d ?? 1);
}

function formatUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  return formatUtc(parseIso(iso) + days * 86_400_000);
}

function shiftYears(iso: string, years: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return formatUtc(Date.UTC((y ?? 2026) + years, (m ?? 1) - 1, d ?? 1));
}

function toGames(rows: Tip[], season: number): GmScheduleGame[] {
  const dates = [...new Set(rows.map((row) => row.date))].sort();
  const dayByDate = new Map(dates.map((date, index) => [date, index]));
  return rows
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((row) => ({
      id: row.id.startsWith("nba_") ? row.id : `nba_${row.id}`,
      season,
      day: dayByDate.get(row.date) ?? 0,
      gameDate: row.date,
      homeTeamId: row.home,
      awayTeamId: row.away,
      played: false,
    }));
}

export function officialSchedule(season = OPENING_SEASON): GmScheduleGame[] {
  return toGames(TIPS, season);
}

/**
 * 2026-27 is the published NBA schedule, 80 games a team.
 * Later years keep that rest pattern. The NBA Cup knockout and the last
 * two games are added once group play is finished.
 */
export function generateSchedule(
  _teams: GmTeam[],
  season: number,
  _seed = 42
): GmScheduleGame[] {
  if (season === OPENING_SEASON) return officialSchedule(season);
  const years = season - OPENING_SEASON;
  const flip = years % 2 === 1;
  const shifted: Tip[] = TIPS.map((tip) => ({
    id: `${season}_${tip.id}`,
    date: shiftYears(tip.date, years),
    home: flip ? tip.away : tip.home,
    away: flip ? tip.home : tip.away,
  }));
  return toGames(shifted, season);
}

/** The open 2026-27 save was built on a packed calendar. Swap in the NBA slate. */
export function adoptRealSchedule(league: GmLeagueState): GmLeagueState {
  if (league.season !== OPENING_SEASON) return league;
  const next: GmLeagueState =
    league.schedule.length > 0 && league.schedule.every((game) => game.id.startsWith("nba_"))
      ? league
      : {
          ...league,
          day: 0,
          phase: "regular",
          schedule: officialSchedule(OPENING_SEASON),
          standings: emptyStandings(league.teams),
          boxScores: [],
          playoffBracket: undefined,
          tradeDeadlinePassed: false,
          players: league.players.map((player) => ({
            ...player,
            seasonLine: undefined,
            seasonPossessions: undefined,
          })),
          news: [
            {
              id: uid("news"),
              day: 0,
              season: league.season,
              headline: "2026-27 schedule is the NBA slate",
              body: "Tips, opponents and days off are the published calendar. Results from the old packed schedule are cleared, so the record starts at 0-0.",
              tone: "info" as const,
            },
            ...league.news,
          ].slice(0, 40),
        };
  if (next.schedule.some((game) => game.played)) return next;
  return {
    ...next,
    digest: undefined,
    news: next.news
      .filter(
        (item) =>
          !/Full traditional/i.test(item.body) && !/\d+\s+@/.test(item.headline)
      )
      .map((item) => ({
        ...item,
        body: item.body.replace("1230 games (generated)", "1,200 NBA games"),
      })),
  };
}

/** Days from the previous tip to this one. 1 means the second night of a back-to-back. */
export function gapBefore(
  schedule: GmScheduleGame[],
  teamId: string,
  gameDate: string | undefined
): number | null {
  if (!gameDate) return null;
  let previous = "";
  for (const game of schedule) {
    if (!game.gameDate || game.gameDate >= gameDate) continue;
    if (game.homeTeamId !== teamId && game.awayTeamId !== teamId) continue;
    if (game.gameDate > previous) previous = game.gameDate;
  }
  if (!previous) return null;
  return Math.round((parseIso(gameDate) - parseIso(previous)) / 86_400_000);
}

/**
 * Thursday before All-Star. The break is the long February gap with no games.
 * Falls back to 62% of the slate when a schedule has no February break.
 */
export function tradeDeadlineDate(schedule: GmScheduleGame[]): string | null {
  const dates = [
    ...new Set(schedule.map((game) => game.gameDate).filter((date): date is string => Boolean(date))),
  ].sort();
  let before = "";
  let widest = 0;
  for (let i = 1; i < dates.length; i++) {
    const prev = dates[i - 1]!;
    const gap = Math.round((parseIso(dates[i]!) - parseIso(prev)) / 86_400_000);
    if (prev.slice(5, 7) !== "02" || gap < 5 || gap <= widest) continue;
    widest = gap;
    before = prev;
  }
  if (!before) return null;
  let cursor = addDays(addDays(before, 1), -7);
  for (let step = 0; step < 7; step++) {
    if (new Date(parseIso(cursor)).getUTCDay() === 4) return cursor;
    cursor = addDays(cursor, -1);
  }
  return null;
}

export function tradeDeadlineDay(schedule: GmScheduleGame[]): number {
  const date = tradeDeadlineDate(schedule);
  if (!date) return Math.max(1, Math.round(maxScheduleDay(schedule) * 0.62));
  const onDate = schedule.find((game) => game.gameDate === date);
  if (onDate) return onDate.day;
  const next = schedule
    .filter((game) => (game.gameDate ?? "") > date)
    .sort((a, b) => (a.gameDate ?? "").localeCompare(b.gameDate ?? ""))[0];
  return next ? Math.max(1, next.day) : Math.max(1, Math.round(maxScheduleDay(schedule) * 0.62));
}

export function maxScheduleDay(schedule: GmScheduleGame[]): number {
  return schedule.reduce((m, g) => Math.max(m, g.day), 0);
}

export function regularSeasonComplete(schedule: GmScheduleGame[]): boolean {
  return schedule.every((g) => g.played);
}
