import { cache } from "react";

import { getBundledBrefPeerBoard } from "@/data/runtime/bref-advanced-snapshot";
import { draftNightPicks } from "@/data/runtime/draft-night-snapshot";
import { getBundledDrblSeason } from "@/data/runtime/drbl-overlay-snapshot";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/lib/nba-season-phase";
import {
  buildRookieTracker,
  type RookieTrackerModel,
  type RookieTrackerSort,
} from "@/lib/home-rookie-tracker";

/** Draft calendar year for the current NBA season's rookie class. */
export function currentRookieDraftYear(now = new Date()): number {
  return currentNbaStartYear(now);
}

export const getHomeRookieTracker = cache(async function getHomeRookieTracker(
  options: {
    season?: string;
    draftYear?: number;
    sort?: RookieTrackerSort;
  } = {}
): Promise<RookieTrackerModel> {
  const season =
    options.season ??
    canonicalSeasonFromStartYear(currentNbaStartYear());
  const draftYear = options.draftYear ?? currentRookieDraftYear();
  const board = getBundledBrefPeerBoard(season);
  const seasonLines = board.map((row) => ({
    playerId: row.playerId?.startsWith("bref:") ? null : row.playerId,
    playerName: row.playerName,
    teamAbbr: row.teamAbbreviation ?? "",
    gamesPlayed: row.gamesPlayed,
    minutes: row.minutes,
    points: row.points,
    rebounds: row.rebounds,
    assists: row.assists,
  }));
  const drblLines = getBundledDrblSeason(season).map((row) => ({
    playerName: row.playerName,
    war1:
      row.r1WinEquivalents != null && Number.isFinite(row.r1WinEquivalents)
        ? row.r1WinEquivalents
        : null,
  }));

  return buildRookieTracker({
    season,
    draftYear,
    picks: draftNightPicks(),
    seasonLines,
    drblLines,
    sort: options.sort,
  });
});
