/**
 * Client-safe explore / player-board helpers. No game-snapshot / ASSETS JSON.
 * Schedule-backed minutes live in player-board-season.ts (server).
 */

import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import type { PlayerSeason } from "@/data/types";
import { DEFAULT_PLAYER_MINIMUM_MINUTES } from "@/data/types";
import { nbaTodayIso } from "@/lib/nba-calendar-date";
import { isCurrentNbaSeason } from "@/lib/nba-season-status";
import { shiftCanonicalSeason } from "@/lib/player-stat-comps";

/** ~3 weeks: 500 season minutes still excludes almost everyone. */
export const EARLY_SEASON_MINUTES_WINDOW_DAYS = 21;

/**
 * Full baked peer board (finished / mid-season). Below this, Explore prefers
 * another season unless the current year is in its opening-week thin bake.
 */
export const BUNDLED_PEER_BOARD_FULL_MIN = 100;

export type PlayerStatsSeasonContext = {
  /** Season selected in URL / filters */
  requestSeason: string;
  /** Season whose counting stats power tables and percentiles */
  statsSeason: string;
  usingPriorSeasonStats: boolean;
};

export function priorSeasonForStats(season: string): string {
  return shiftCanonicalSeason(season, -1);
}

export function seasonHasPlayedGames(rows: readonly PlayerSeason[]): boolean {
  return rows.some((row) => row.gamesPlayed > 0);
}

/** Season on a track, or the latest one at or before `season` when that year is missing. */
export function seasonOnTrack(seasons: readonly string[], season: string): string {
  if (seasons.includes(season)) return season;
  let best: string | null = null;
  for (const candidate of seasons) {
    if (candidate <= season && (best == null || candidate > best)) best = candidate;
  }
  if (best) return best;
  return [...seasons].sort((a, b) => b.localeCompare(a))[0] ?? season;
}

export function priorSeasonStatsNotice(
  requestSeason: string,
  statsSeason: string
): string {
  return `${requestSeason} hasn't started. Showing ${statsSeason} stats until regular-season games are played.`;
}

/** Live/bundled board miss after tip — keep Explore usable with last year's rows. */
export function priorSeasonBoardCatchUpNotice(
  requestSeason: string,
  statsSeason: string
): string {
  return `${requestSeason} board is still catching up. Showing ${statsSeason} for now.`;
}

/**
 * Explore Players board default: All seasons (current board + career search).
 */
export function defaultExplorePlayersSeason(
  _availableSeasons?: readonly string[],
  _now?: Date,
  _options?: {
    boardReadySeasons?: readonly string[];
  }
): string {
  return "ALL";
}

/**
 * Client-safe minutes default when the schedule snapshot is not available.
 * Uses a mid-October tip approximation so chip defaults stay usable in the
 * browser without pulling ASSETS JSON.
 */
export function defaultExploreMinimumMinutesSync(
  season: string,
  now = new Date()
): number {
  const key = String(season ?? "").trim();
  const leagueSeason = canonicalSeasonFromStartYear(currentNbaStartYear(now));
  const resolved =
    !key || key.toUpperCase() === "ALL" ? leagueSeason : key;
  if (!isCurrentNbaSeason(resolved, now)) return DEFAULT_PLAYER_MINIMUM_MINUTES;
  const startYear = currentNbaStartYear(now);
  const approxOpener = `${startYear}-10-21`;
  const today = nbaTodayIso(now);
  if (today < approxOpener) return DEFAULT_PLAYER_MINIMUM_MINUTES;
  const tipMs = Date.parse(`${approxOpener}T12:00:00.000Z`);
  const todayMs = Date.parse(`${today}T12:00:00.000Z`);
  if (!Number.isFinite(tipMs) || !Number.isFinite(todayMs)) {
    return DEFAULT_PLAYER_MINIMUM_MINUTES;
  }
  const days = (todayMs - tipMs) / 86_400_000;
  if (days >= 0 && days < EARLY_SEASON_MINUTES_WINDOW_DAYS) return 0;
  return DEFAULT_PLAYER_MINIMUM_MINUTES;
}
