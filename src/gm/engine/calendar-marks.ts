import type { GmScheduleGame } from "@/gm/types";
import { tradeDeadlineDate } from "@/gm/engine/schedule";

export type CalendarMarkKind =
  | "opener"
  | "holiday"
  | "cup"
  | "deadline"
  | "break"
  | "finale"
  | "injury";

export type CalendarMark = {
  iso: string;
  /** Short name painted on the day. */
  label: string;
  /** Name used in the month line. */
  line: string;
  title: string;
  kind: CalendarMarkKind;
  /** Later days of a break keep the wash and drop the name. */
  quiet?: boolean;
};

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year!, (month ?? 1) - 1, (day ?? 1) + days))
    .toISOString()
    .slice(0, 10);
}

/** nth weekday in a month. weekday is JS UTC: 0 Sunday, 4 Thursday. */
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const day = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  return iso(year, month, day);
}

function eachDay(start: string, end: string): string[] {
  const days: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

/**
 * Holidays, the trade deadline, signing dates, and the breaks already
 * sitting in the slate. Dates follow the season on the schedule.
 */
export function seasonMarks(schedule: GmScheduleGame[]): CalendarMark[] {
  const dates = [
    ...new Set(
      schedule
        .filter((game) => game.exhibition !== "allstar")
        .map((game) => game.gameDate)
        .filter((date): date is string => Boolean(date))
    ),
  ].sort();
  if (!dates.length) return [];
  const opener = dates[0]!;
  const finale = dates[dates.length - 1]!;
  const startYear = Number(opener.slice(0, 4));
  const endYear = Number(finale.slice(0, 4));
  const inSeason = (date: string) => date >= opener && date <= finale;
  const marks: CalendarMark[] = [
    {
      iso: opener,
      label: "Opener",
      line: "Opening night",
      title: "Opening night",
      kind: "opener",
    },
  ];
  const add = (mark: CalendarMark) => {
    if (inSeason(mark.iso)) marks.push(mark);
  };

  add({
    iso: nthWeekday(startYear, 11, 4, 4),
    label: "Thanks",
    line: "Thanksgiving",
    title: "Thanksgiving",
    kind: "holiday",
  });
  add({
    iso: iso(startYear, 12, 15),
    label: "Deals",
    line: "Dec 15",
    title: "Most summer signings can be traded from this date.",
    kind: "deadline",
  });
  add({
    iso: iso(startYear, 12, 25),
    label: "Christmas",
    line: "Christmas",
    title: "Christmas",
    kind: "holiday",
  });
  add({
    iso: iso(endYear, 1, 1),
    label: "New Year",
    line: "New Year",
    title: "New Year's Day",
    kind: "holiday",
  });
  add({
    iso: nthWeekday(endYear, 1, 1, 3),
    label: "MLK",
    line: "MLK Day",
    title: "Martin Luther King Jr. Day",
    kind: "holiday",
  });
  const deadline = tradeDeadlineDate(schedule);
  if (deadline) {
    add({
      iso: deadline,
      label: "Trade",
      line: "Trade deadline",
      title: "Trade deadline",
      kind: "deadline",
    });
  }
  add({
    iso: iso(endYear, 3, 1),
    label: "Buyout",
    line: "Buyout line",
    title: "Players waived after this date cannot sign onto a playoff roster.",
    kind: "deadline",
  });
  add({
    iso: finale,
    label: "Finale",
    line: "Finale",
    title: "Last day of the regular season",
    kind: "finale",
  });

  for (let index = 1; index < dates.length; index++) {
    const previous = dates[index - 1]!;
    const next = dates[index]!;
    const off =
      Math.round(
        (Date.parse(`${next}T00:00:00Z`) - Date.parse(`${previous}T00:00:00Z`)) /
          86_400_000
      ) - 1;
    if (off < 5) continue;
    const first = addDays(previous, 1);
    const month = first.slice(5, 7);
    const kind = month === "12" ? "cup" : month === "02" ? "break" : null;
    if (!kind) continue;
    const label = kind === "cup" ? "Cup" : "All-Star";
    const line = kind === "cup" ? "NBA Cup" : "All-Star";
    const title =
      kind === "cup"
        ? "The schedule pauses for the NBA Cup."
        : "All-Star break";
    eachDay(first, addDays(next, -1)).forEach((date, dayIndex) => {
      marks.push({
        iso: date,
        label: dayIndex === 0 ? label : "",
        line: dayIndex === 0 ? line : "",
        title,
        kind,
        quiet: dayIndex > 0,
      });
    });
  }

  const cupStart = iso(startYear, 12, 4);
  const cupDays = eachDay(cupStart, iso(startYear, 12, 11));
  cupDays.forEach((date, index) => {
    if (marks.some((mark) => mark.iso === date && mark.kind === "cup")) return;
    const label = index === 0 ? "Cup" : index === 4 ? "Semis" : index === 7 ? "Final" : "";
    marks.push({
      iso: date,
      label,
      line: index === 0 ? "NBA Cup" : label,
      title:
        index === 7
          ? "NBA Cup championship. It does not count in the standings."
          : index === 4
            ? "NBA Cup semifinals."
            : "NBA Cup knockout.",
      kind: "cup",
      quiet: label === "",
    });
  });

  return marks;
}
