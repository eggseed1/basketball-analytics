/**
 * Locale-aware date formatters for UI display.
 * Preserves explicit timeZone options (UTC calendar days, America/New_York tips).
 * Accepts BCP-47 tags from next-intl (including en-XA → en for Intl).
 */

export type AppDateStyle =
  | "monthDay"
  | "monthDayYear"
  | "monthYear"
  | "monthLongYear"
  | "weekdayShort"
  | "weekdayLong"
  | "monthShort"
  | "weekdayMonthDayYear"
  | "fullDate";

const STYLE_OPTIONS: Record<AppDateStyle, Intl.DateTimeFormatOptions> = {
  monthDay: { month: "short", day: "numeric" },
  monthDayYear: { month: "short", day: "numeric", year: "numeric" },
  monthYear: { month: "short", year: "numeric" },
  monthLongYear: { month: "long", year: "numeric" },
  weekdayShort: { weekday: "short" },
  weekdayLong: { weekday: "long" },
  monthShort: { month: "short" },
  /** "Tue, Oct 20, 2026" (game hero). */
  weekdayMonthDayYear: { weekday: "short", month: "short", day: "numeric", year: "numeric" },
  /** "Tuesday, October 20, 2026" (night headings, insight detail). */
  fullDate: { weekday: "long", month: "long", day: "numeric", year: "numeric" },
};

/** Intl cannot format en-XA; use English glyphs for the pseudolocale. */
export function intlLocale(locale: string | undefined | null): string {
  if (!locale || locale === "en-XA") return "en";
  return locale;
}

function asDate(input: Date | number | string): Date {
  if (input instanceof Date) return input;
  if (typeof input === "number") return new Date(input);
  return new Date(input);
}

/**
 * Format a Date / ms / ISO string with the app UI locale.
 * Pass timeZone explicitly when the instant must stay on a calendar day
 * (UTC noon for game dates) or Eastern tip-off clock.
 */
export function formatAppDate(
  input: Date | number | string,
  locale: string | undefined | null,
  style: AppDateStyle,
  options?: { timeZone?: string }
): string {
  const d = asDate(input);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    ...STYLE_OPTIONS[style],
    ...(options?.timeZone ? { timeZone: options.timeZone } : {}),
  }).format(d);
}

/** YYYY-MM-DD game/night calendar labels (noon UTC → that calendar day). */
export function formatGameCalendarDate(
  isoDate: string | undefined | null,
  locale: string | undefined | null,
  style: AppDateStyle = "monthDayYear"
): string | null {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  return formatAppDate(`${isoDate}T12:00:00Z`, locale, style, {
    timeZone: "UTC",
  });
}

export function formatAppDateTime(
  input: Date | number | string,
  locale: string | undefined | null,
  options: Intl.DateTimeFormatOptions
): string {
  const d = asDate(input);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), options).format(d);
}
