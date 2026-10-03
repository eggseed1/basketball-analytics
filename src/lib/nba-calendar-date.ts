const NBA_TIME_ZONE = "America/New_York";

const etDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: NBA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * League calendar day (US Eastern) as `YYYY-MM-DD`.
 *
 * ESPN stamps tip-offs in UTC, so a 7:30 PM ET game carries the next UTC day.
 * Date-only strings pass through unchanged.
 */
export function nbaCalendarDate(input: string | Date = new Date()): string {
  if (typeof input === "string") {
    const raw = input.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    if (!/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw.slice(0, 10);
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
    return etDateFormat.format(d);
  }
  if (Number.isNaN(input.getTime())) return "";
  return etDateFormat.format(input);
}

/** Today on the league calendar (US Eastern). */
export function nbaTodayIso(now: Date = new Date()): string {
  return etDateFormat.format(now);
}
