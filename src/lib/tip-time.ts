/**
 * Tip-off formatting shared by server and client. The server can't know the
 * viewer's zone, so it renders league time (US Eastern) and the client swaps in
 * the viewer's zone after hydration (see `LocalTipTime`).
 */

import { parseTipOffMs } from "@/lib/game-countdown";

export const LEAGUE_TIME_ZONE = "America/New_York";

export type TipTimeStyle =
  /** 7:30 PM */
  | "clock"
  /** 7:30 PM EDT */
  | "clockZone"
  /** Wed, Oct 8 */
  | "date"
  /** Wed, Oct 8, 2026 */
  | "dateYear"
  /** Wed 7:30 PM EDT */
  | "dayClockZone"
  /** Wed, Oct 8, 7:30 PM EDT */
  | "dateClockZone";

const OPTIONS: Record<TipTimeStyle, Intl.DateTimeFormatOptions> = {
  clock: { hour: "numeric", minute: "2-digit" },
  clockZone: { hour: "numeric", minute: "2-digit", timeZoneName: "short" },
  date: { weekday: "short", month: "short", day: "numeric" },
  dateYear: { weekday: "short", month: "short", day: "numeric", year: "numeric" },
  dayClockZone: { weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" },
  dateClockZone: {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  },
};

export function formatTipTime(
  tipOffAt: string | null | undefined,
  style: TipTimeStyle,
  timeZone: string = LEAGUE_TIME_ZONE
): string | null {
  const ms = parseTipOffMs(tipOffAt);
  if (ms == null) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { ...OPTIONS[style], timeZone }).format(new Date(ms));
  } catch {
    return null;
  }
}

/** YYYY-MM-DD of the tip-off in `timeZone`. */
export function tipCalendarDate(tipOffAt: string | null | undefined, timeZone: string): string | null {
  const ms = parseTipOffMs(tipOffAt);
  if (ms == null) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(ms));
}

/**
 * Schedule row time in `timeZone` ("7:30 PM PDT"), falling back to its
 * league-time label. Rows sit on the NBA (Eastern) day, so a tip that lands on
 * another local day says which: "8:30 AM GMT+9 (Thu)".
 */
export function scheduleTimeLabel(
  row: { tipOffAt: string | null; timeLabel: string | null; date?: string },
  timeZone: string
): string | null {
  const clock = formatTipTime(row.tipOffAt, "clockZone", timeZone);
  if (!clock) return row.timeLabel;
  const localDay = tipCalendarDate(row.tipOffAt, timeZone);
  if (!row.date || !localDay || localDay === row.date.slice(0, 10)) return clock;
  return `${clock} (${new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone }).format(new Date(row.tipOffAt!))})`;
}
