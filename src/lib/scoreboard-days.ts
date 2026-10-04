/** Date labels and links for the scores day view. Dates are NBA calendar days (YYYY-MM-DD). */

export function shiftIsoDay(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function formatIsoDay(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    ...opts,
    timeZone: "UTC",
  });
}

export function relativeDayLabel(iso: string, today: string): string {
  if (iso === today) return "Today";
  if (iso === shiftIsoDay(today, -1)) return "Yesterday";
  if (iso === shiftIsoDay(today, 1)) return "Tomorrow";
  return formatIsoDay(iso, { weekday: "long", month: "short", day: "numeric" });
}

export function scoresDayHref(date: string, today: string): string {
  return date === today ? "/scores" : `/scores?view=day&date=${date}`;
}
