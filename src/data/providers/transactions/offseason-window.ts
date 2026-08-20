/**
 * Offseason calendar helpers.
 * "2026 NBA Offseason" = summer window of calendar year 2026 (into 2026-27).
 */

import { canonicalSeasonFromStartYear } from "@/data/providers/historical/season-range";
import type { OffseasonWindow } from "@/data/types/transaction-event";

/** Inclusive offseason window for a summer label year. */
export function offseasonWindowForYear(labelYear: number): OffseasonWindow {
  return {
    labelYear,
    startDate: `${labelYear}-06-01`,
    endDate: `${labelYear}-10-15`,
    upcomingSeason: canonicalSeasonFromStartYear(labelYear),
  };
}

/**
 * Default offseason label year for "what's happening now?"
 * June-December → this calendar year; January-May → previous summer.
 */
export function currentOffseasonLabelYear(now = new Date()): number {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  return m >= 6 ? y : y - 1;
}

export function currentOffseasonWindow(now = new Date()): OffseasonWindow {
  return offseasonWindowForYear(currentOffseasonLabelYear(now));
}

/** Monday 00:00 UTC of the week containing `now`, through today (ISO dates). */
export function weekDateRange(now = new Date()): {
  from: string;
  to: string;
} {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const day = d.getUTCDay(); // 0 Sun
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + mondayOffset);
  const to = d.toISOString().slice(0, 10);
  const from = monday.toISOString().slice(0, 10);
  return { from, to };
}

export function monthKeyFromDate(isoDate: string): string {
  return isoDate.slice(0, 7); // YYYY-MM
}

export function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  const names = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const name = names[(m ?? 1) - 1] ?? yyyyMm;
  return `${name} ${y}`;
}
