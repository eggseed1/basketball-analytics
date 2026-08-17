/**
 * Client-safe player deep-link helpers.
 * Sync only — never import data queries or Node filesystem here.
 *
 * Async season resolution lives in `player-season-resolve.server.ts`.
 */

import type { PlayerSeason } from "@/data/types";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";

/**
 * From an already-loaded career list (newest-first typical).
 * Never hardcodes a single season forever.
 */
export function resolvePlayerDefaultSeason(
  career: Array<Pick<PlayerSeason, "season" | "gamesPlayed">>
): string {
  if (career.length) {
    // Prefer the first listed season (caller should sort newest-first).
    const first = career[0]?.season;
    if (first) return first;
  }
  return canonicalSeasonFromStartYear(currentNbaStartYear());
}

/** Build `/players/[id]?season=…` with a resolved season. */
export function playerPageHref(
  playerId: string,
  season?: string | null
): string {
  const base = `/players/${encodeURIComponent(playerId)}`;
  if (!season) return base;
  return `${base}?season=${encodeURIComponent(season)}`;
}
