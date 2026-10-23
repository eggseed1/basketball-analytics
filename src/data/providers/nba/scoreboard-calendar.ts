/**
 * Pure scoreboard calendar helpers — no game-snapshot / ESPN schedule module.
 * Keep /scores day shell off the 1.4MB snapshot parse.
 */
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { espnYearFromCanonicalSeason } from "@/data/providers/nba/season";

/**
 * Season that owns the next tip-offs — same Jul 1 flip as roster/cap surfaces.
 */
export function upcomingScheduleSeason(now = new Date()): string {
  return canonicalSeasonFromStartYear(currentNbaStartYear(now));
}

/** `2026-06` → `202606` for ESPN scoreboard. */
export function espnMonthParam(monthKey: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey.trim());
  if (!m) throw new Error(`Invalid month key "${monthKey}". Use YYYY-MM.`);
  return `${m[1]}${m[2]}`;
}

export function monthKeyFromDate(d = new Date()): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${mo}`;
}

/** Shift YYYY-MM by delta months. */
export function shiftMonthKey(monthKey: string, delta: number): string {
  const [ys, ms] = monthKey.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const idx = y * 12 + (m - 1) + delta;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export function seasonMonthBounds(season: string): {
  firstMonth: string;
  lastMonth: string;
} {
  const endYear = espnYearFromCanonicalSeason(season);
  return {
    firstMonth: `${endYear - 1}-10`,
    lastMonth: `${endYear}-06`,
  };
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Sunday (UTC) of the week containing `d` or an ISO date. */
export function startOfWeekSundayIso(input: Date | string = new Date()): string {
  const d =
    typeof input === "string"
      ? new Date(`${input.slice(0, 10)}T12:00:00Z`)
      : new Date(
          Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate())
        );
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return toIsoDate(d);
}

export function addDaysIso(isoDate: string, n: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return toIsoDate(d);
}

/** Default calendar month for a season (current month if in-season, else next opener). */
export function defaultScoreboardMonthKey(season?: string): string {
  const resolved =
    season ?? canonicalSeasonFromStartYear(currentNbaStartYear());
  const endYear = espnYearFromCanonicalSeason(resolved);
  const startYear = endYear - 1;
  const now = new Date();
  const current = monthKeyFromDate(now);
  const [cy, cm] = current.split("-").map(Number);
  // NBA season roughly Oct (startYear) → June (endYear).
  const inSeason =
    (cy === startYear && (cm ?? 0) >= 10) ||
    (cy === endYear && (cm ?? 0) <= 6);
  if (inSeason) return current;
  // Offseason: jump to the next October slate (preseason / opener).
  if ((cm ?? 0) >= 7) return `${cy}-10`;
  return `${endYear}-10`;
}
