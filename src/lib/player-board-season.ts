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

/**
 * Full baked peer board (finished / mid-season). Below this, Explore prefers
 * another season unless the current year is in its opening-week thin bake.
 */
export const BUNDLED_PEER_BOARD_FULL_MIN = 100;

/**
 * True when a bundled season-tables peer board can power Explore without a
 * live ESPN crawl. Opening week may only have dozens of rows; that still beats
 * a Cloudflare provider failure on every future tip-off.
 */
export function isBundledPeerBoardReady(
  season: string,
  rowCount: number,
  now = new Date()
): boolean {
  if (rowCount >= BUNDLED_PEER_BOARD_FULL_MIN) return true;
  if (rowCount <= 0) return false;
  return (
    isCurrentNbaSeason(season, now) && leagueRegularSeasonHasOpened(season, now)
  );
}

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
 * Concrete season for styles / visualizations (All is not a board year).
 * Pre-tip and unbaked current years fall back to the last completed season.
 */
export function defaultExploreConcretePlayersSeason(
  availableSeasons: readonly string[],
  now = new Date(),
  options?: {
    /** Seasons with a usable bundled peer board (from season-tables). */
    boardReadySeasons?: readonly string[];
  }
): string {
  const leagueSeason = canonicalSeasonFromStartYear(currentNbaStartYear(now));
  const prior = priorSeasonForStats(leagueSeason);
  if (isPreseasonRosterSeason(leagueSeason, now)) {
    if (availableSeasons.includes(prior)) return prior;
  }
  const ready = options?.boardReadySeasons;
  if (
    ready &&
    !ready.includes(leagueSeason) &&
    availableSeasons.includes(prior)
  ) {
    return prior;
  }
  if (availableSeasons.includes(leagueSeason)) return leagueSeason;
  return availableSeasons[0] ?? leagueSeason;
}

/**
 * Qualifying minutes for Explore. The usual 500 floor hides every opener
 * line in week 1 — drop to 0 until the campaign has had time to accumulate.
 *
 * `ALL` is the current board plus career name-search extras, so it must use
 * the current league year's early-week floor — otherwise opener lines vanish
 * behind a 500-minute gate and the board looks empty.
 */
export function defaultExploreMinimumMinutes(
  season: string,
  now = new Date()
): number {
  const key = String(season ?? "").trim();
  if (!key || key.toUpperCase() === "ALL") {
    return defaultExploreMinimumMinutes(
      canonicalSeasonFromStartYear(currentNbaStartYear(now)),
      now
    );
  }
  if (!isCurrentNbaSeason(key, now) || !leagueRegularSeasonHasOpened(key, now)) {
    return DEFAULT_PLAYER_MINIMUM_MINUTES;
  }
  const opener = firstRegularSeasonTipDate(key);
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
