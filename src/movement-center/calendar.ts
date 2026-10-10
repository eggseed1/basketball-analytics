/**
 * League dates that close movement stories. The nightly trade-deadlines step
 * adds each season's deadline once the NBA publishes its key dates; a season
 * without one never closes trade stories by date.
 */
import deadlinesFile from "../../data/movement-center/trade-deadlines.json";

/** Season start year → trade deadline (ET date). */
const TRADE_DEADLINES: Record<string, string> = deadlinesFile.deadlines;

/** Days after the deadline before an open trade story is closed, for late ledger posts. */
export const DEADLINE_GRACE_DAYS = 2;

/** NBA season start year for a date: July onward belongs to the season starting that fall. */
function seasonStartYear(iso: string): number {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  return month >= 7 ? year : year - 1;
}

/** The trade deadline that follows a story first seen on `iso`, if published. */
export function tradeDeadlineAfter(iso: string): string | null {
  const deadline = TRADE_DEADLINES[seasonStartYear(iso)];
  return deadline && iso.slice(0, 10) <= deadline ? deadline : null;
}
