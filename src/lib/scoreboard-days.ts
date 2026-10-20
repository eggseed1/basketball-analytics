/** Date labels and links for the scores day view. Dates are NBA calendar days (YYYY-MM-DD). */

import { formatAppDateTime } from "@/i18n/format-date";

export function shiftIsoDay(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Calendar-day label in the UI locale. Always UTC so the noon anchor stays on `iso`. */
export function formatIsoDay(
  iso: string,
  opts: Intl.DateTimeFormatOptions,
  locale?: string | null
): string {
  return formatAppDateTime(`${iso}T12:00:00Z`, locale, {
    ...opts,
    timeZone: "UTC",
  });
}

/**
 * Weekday + month + day label. Today / Yesterday / Tomorrow words stay English
 * here; UI callers (scoreboard-day.tsx) translate those three before calling.
 */
export function relativeDayLabel(
  iso: string,
  today: string,
  locale?: string | null
): string {
  if (iso === today) return "Today";
  if (iso === shiftIsoDay(today, -1)) return "Yesterday";
  if (iso === shiftIsoDay(today, 1)) return "Tomorrow";
  return formatIsoDay(iso, { weekday: "long", month: "short", day: "numeric" }, locale);
}

export function scoresDayHref(date: string, today: string): string {
  return date === today ? "/scores" : `/scores?view=day&date=${date}`;
}
