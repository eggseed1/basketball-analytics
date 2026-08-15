/**
 * Resolve the most useful season for player deep links from Transactions / Assets.
 * Prefer the first career season option (newest-first lists from the provider).
 */

import { getPlayerCareerSeasons } from "@/data/queries/players";
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

/**
 * Async resolver for deep links when only playerId is known.
 * Returns null season only if the player cannot be loaded (href still valid).
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
