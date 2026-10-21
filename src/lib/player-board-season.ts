import { isPreseasonRosterSeason } from "@/data/providers/nba/espn-roster-client";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import type { PlayerSeason } from "@/data/types";
import { DEFAULT_PLAYER_MINIMUM_MINUTES } from "@/data/types";
import {
  firstRegularSeasonTipDate,
  isCurrentNbaSeason,
  isSeasonAwaitingFirstGame,
  leagueRegularSeasonHasOpened,
} from "@/lib/nba-season-status";
import { nbaTodayIso } from "@/lib/nba-calendar-date";
import { shiftCanonicalSeason } from "@/lib/player-stat-comps";

/** ~3 weeks: 500 season minutes still excludes almost everyone. */
const EARLY_SEASON_MINUTES_WINDOW_DAYS = 21;

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

/**
 * League explore board: pre-tip current year has rosters but no qualifying stats.
 * Fall back to the most recent completed season for stat columns.
 *
 * After tip-off, never force prior-season stats — an empty live board means
 * upstream lag (stale ESPN / box-score crawl), not "season hasn't started."
 */
export function shouldUsePriorSeasonBoardStats(
  requestSeason: string,
  rows: readonly PlayerSeason[],
  now = new Date()
): boolean {
  if (!requestSeason || requestSeason.toUpperCase() === "ALL") return false;
  if (
    !isCurrentNbaSeason(requestSeason, now) &&
    !isPreseasonRosterSeason(requestSeason, now)
  ) {
    return false;
  }
  // Calendar tip is the gate. Empty rows after opening night must not flip
  // Explore back to last year's board (that blanked real early-season GP).
  if (!isSeasonAwaitingFirstGame(requestSeason, rows, now)) return false;
  return !rows.length || !seasonHasPlayedGames(rows);
}

/** Player destination: which season row should power stat tabs. */
export function resolvePlayerStatsSeason(
  career: readonly PlayerSeason[],
  requestSeason: string,
  now = new Date()
): PlayerStatsSeasonContext {
  const requestRows = career.filter((row) => row.season === requestSeason);
  if (seasonHasPlayedGames(requestRows)) {
    return {
      requestSeason,
      statsSeason: requestSeason,
      usingPriorSeasonStats: false,
    };
  }

  // Only fall back to prior-season counting stats while the league is still
  // in the pre-tip roster window. After tip night, keep the request season
  // even when this player's GP row is still empty (injured / DNP / late call-up).
  if (!isPreseasonRosterSeason(requestSeason, now)) {
    return {
      requestSeason,
      statsSeason: requestSeason,
      usingPriorSeasonStats: false,
    };
  }

  const prior = priorSeasonForStats(requestSeason);
  const priorRows = career.filter((row) => row.season === prior);
  if (seasonHasPlayedGames(priorRows)) {
    return {
      requestSeason,
      statsSeason: prior,
      usingPriorSeasonStats: true,
    };
  }

  return {
    requestSeason,
    statsSeason: requestSeason,
    usingPriorSeasonStats: false,
  };
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

/**
 * Explore Players board default: keep the last completed season selected until
 * regular-season tip. After the opener, default to the current league year.
 * Upcoming season remains pickable in the season control before tip.
 */
export function defaultExplorePlayersSeason(
  availableSeasons: readonly string[],
  now = new Date()
): string {
  const leagueSeason = canonicalSeasonFromStartYear(currentNbaStartYear(now));
  if (isPreseasonRosterSeason(leagueSeason, now)) {
    const prior = priorSeasonForStats(leagueSeason);
    if (availableSeasons.includes(prior)) return prior;
  }
  if (availableSeasons.includes(leagueSeason)) return leagueSeason;
  return availableSeasons[0] ?? leagueSeason;
}

/**
 * Qualifying minutes for Explore. The usual 500 floor hides every opener
 * line in week 1 — drop to 0 until the campaign has had time to accumulate.
 */
export function defaultExploreMinimumMinutes(
  season: string,
  now = new Date()
): number {
  if (
    !season ||
    season.toUpperCase() === "ALL" ||
    !isCurrentNbaSeason(season, now) ||
    !leagueRegularSeasonHasOpened(season, now)
  ) {
    return DEFAULT_PLAYER_MINIMUM_MINUTES;
  }
  const opener = firstRegularSeasonTipDate(season);
  if (!opener) return DEFAULT_PLAYER_MINIMUM_MINUTES;
  const today = nbaTodayIso(now);
  const tipMs = Date.parse(`${opener}T12:00:00.000Z`);
  const todayMs = Date.parse(`${today}T12:00:00.000Z`);
  if (!Number.isFinite(tipMs) || !Number.isFinite(todayMs)) {
    return DEFAULT_PLAYER_MINIMUM_MINUTES;
  }
  const days = (todayMs - tipMs) / 86_400_000;
  if (days >= 0 && days < EARLY_SEASON_MINUTES_WINDOW_DAYS) return 0;
  return DEFAULT_PLAYER_MINIMUM_MINUTES;
}
