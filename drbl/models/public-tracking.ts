/**
 * Public NBA tracking / hustle endpoints (season aggregates).
 *
 * These are NOT possession-level events and must not be fabricated into PBP.
 * Use for DRBL-B features / diagnostics only until event-level join exists.
 *
 * Sources (stats.nba.com, public with standard NBA headers):
 * - leaguedashptstats PtMeasureType=Drives|Passing|CatchShoot|...
 * - leaguehustlestatsplayer (screen assists, deflections, ...)
 * - leaguedashplayerptshot filters: CloseDefDistRange, ShotClockRange, DribbleRange
 */

import {
  getResultSet,
  resultSetToObjects,
  statsNbaFetch,
} from "../../src/data/providers/nba/stats-nba-client";

export type PtMeasureType =
  | "Drives"
  | "Passing"
  | "CatchShoot"
  | "PullUpShot"
  | "Possessions"
  | "PaintTouch"
  | "PostTouch"
  | "ElbowTouch"
  | "Defense"
  | "Efficiency"
  | "SpeedDistance"
  | "Rebounding";

export async function fetchPlayerTrackingMeasure(
  season: string,
  measure: PtMeasureType,
  seasonType = "Regular Season"
): Promise<Array<Record<string, string | number | null>>> {
  const response = await statsNbaFetch("leaguedashptstats", {
    College: "",
    Conference: "",
    Country: "",
    DateFrom: "",
    DateTo: "",
    Division: "",
    DraftPick: "",
    DraftYear: "",
    GameScope: "",
    Height: "",
    LastNGames: 0,
    LeagueID: "00",
    Location: "",
    Month: 0,
    OpponentTeamID: 0,
    Outcome: "",
    PORound: 0,
    PerMode: "PerGame",
    PlayerExperience: "",
    PlayerOrTeam: "Player",
    PlayerPosition: "",
    PtMeasureType: measure,
    Season: season,
    SeasonSegment: "",
    SeasonType: seasonType,
    StarterBench: "",
    TeamID: 0,
    VsConference: "",
    VsDivision: "",
    Weight: "",
  });
  const set = getResultSet(response);
  return set ? resultSetToObjects(set) : [];
}

export async function fetchPlayerHustleStats(
  season: string,
  seasonType = "Regular Season"
): Promise<Array<Record<string, string | number | null>>> {
  const response = await statsNbaFetch("leaguehustlestatsplayer", {
    College: "",
    Conference: "",
    Country: "",
    DateFrom: "",
    DateTo: "",
    Division: "",
    DraftPick: "",
    DraftYear: "",
    GameScope: "",
    Height: "",
    LastNGames: 0,
    LeagueID: "00",
    Location: "",
    Month: 0,
    OpponentTeamID: 0,
    Outcome: "",
    PORound: 0,
    PerMode: "PerGame",
    PlayerExperience: "",
    PlayerPosition: "",
    Season: season,
    SeasonSegment: "",
    SeasonType: seasonType,
    TeamID: 0,
    VsConference: "",
    VsDivision: "",
    Weight: "",
  });
  const set = getResultSet(response);
  return set ? resultSetToObjects(set) : [];
}

/** Documented availability matrix for sequential-attribution consumers. */
export const PUBLIC_TRACKING_AVAILABILITY = {
  possessionLevel: {
    screens: "unavailable",
    drives: "unavailable",
    cuts: "unavailable",
    defenderDistance: "unavailable",
    shotClock: "unavailable",
    assists: "cdn_assistPersonId_or_description",
    shotCoordinates: "cdn_xy",
    possessionAgeProxy: "inferable_from_game_clock",
  },
  seasonAggregatesPublic: {
    drives: "stats.nba.com/leaguedashptstats?PtMeasureType=Drives",
    passing: "stats.nba.com/leaguedashptstats?PtMeasureType=Passing",
    screenAssists: "stats.nba.com/leaguehustlestatsplayer",
    catchShoot: "stats.nba.com/leaguedashptstats?PtMeasureType=CatchShoot",
    closestDefenderBuckets:
      "stats.nba.com/leaguedashplayerptshot?CloseDefDistRange=...",
    shotClockBuckets:
      "stats.nba.com/leaguedashplayerptshot?ShotClockRange=...",
  },
  commercialNotUsed: [
    "Second Spectrum",
    "Synergy play-types",
    "full SportVU raw archives",
  ],
} as const;
