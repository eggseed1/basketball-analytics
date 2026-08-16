/**
 * Server-only player deep-link resolution (may load career seasons via queries).
 * Client UI must use sync helpers from `@/lib/player-season-resolve` with
 * already-known seasons, or consume precomputed `href` from the server.
 */

import "server-only";

import { getPlayerCareerSeasons } from "@/data/queries/players";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import {
  playerPageHref,
  resolvePlayerDefaultSeason,
} from "@/lib/player-season-resolve";

export { playerPageHref, resolvePlayerDefaultSeason };

/**
 * Async resolver for deep links when only playerId is known.
 * Returns a season even if career load fails (current NBA season fallback).
 */
export async function getPlayerDefaultSeason(
  playerId: string
): Promise<string> {
  try {
    const career = await getPlayerCareerSeasons(playerId);
    const sorted = [...career].sort((a, b) =>
      b.season.localeCompare(a.season)
    );
    return resolvePlayerDefaultSeason(sorted);
  } catch {
    return canonicalSeasonFromStartYear(currentNbaStartYear());
  }
}

export async function getPlayerPageHref(
  playerId: string,
  season?: string | null
): Promise<string> {
  const resolved = season ?? (await getPlayerDefaultSeason(playerId));
  return playerPageHref(playerId, resolved);
}
