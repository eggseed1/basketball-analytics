import { isPreseasonRosterSeason } from "@/data/providers/nba/espn-roster-client";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import type { PlayerSeason } from "@/data/types";
import {
  isCurrentNbaSeason,
  isSeasonAwaitingFirstGame,
} from "@/lib/nba-season-status";
import { shiftCanonicalSeason } from "@/lib/player-stat-comps";

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
 */
export function shouldUsePriorSeasonBoardStats(
  requestSeason: string,
  rows: readonly PlayerSeason[]
): boolean {
  if (!requestSeason || requestSeason.toUpperCase() === "ALL") return false;
  if (
    !isCurrentNbaSeason(requestSeason) &&
    !isPreseasonRosterSeason(requestSeason)
  ) {
    return false;
  }
  if (!rows.length) return true;
  return isSeasonAwaitingFirstGame(requestSeason, rows);
}

/** Player destination: which season row should power stat tabs. */
export function resolvePlayerStatsSeason(
  career: readonly PlayerSeason[],
  requestSeason: string,
  now = new Date()
): PlayerStatsSeasonContext {
  const nowSeason = canonicalSeasonFromStartYear(currentNbaStartYear(now));
  const inPreTipWindow =
    requestSeason === nowSeason || isPreseasonRosterSeason(requestSeason);
  if (!inPreTipWindow) {
    return {
      requestSeason,
      statsSeason: requestSeason,
      usingPriorSeasonStats: false,
    };
  }

  const requestRows = career.filter((row) => row.season === requestSeason);
  if (seasonHasPlayedGames(requestRows)) {
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

export function priorSeasonStatsNotice(
  requestSeason: string,
  statsSeason: string
): string {
  return `${requestSeason} hasn't started — showing ${statsSeason} stats until regular-season games are played.`;
}
