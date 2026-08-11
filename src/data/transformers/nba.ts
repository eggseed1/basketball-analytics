import type { PlayerSeason } from "@/data/types";

/**
 * Placeholder NBA Stats / CDN response shapes.
 * Replace fields as the real integration is wired.
 */
export interface NbaLeagueDashPlayerStatsRow {
  PLAYER_ID: number;
  PLAYER_NAME: string;
  TEAM_ID: number;
  TEAM_ABBREVIATION: string;
  AGE?: number;
  GP: number;
  MIN: number;
  PTS: number;
  AST: number;
  REB: number;
  STL: number;
  BLK: number;
  TOV: number;
  FG_PCT: number;
  FG3_PCT: number;
  FT_PCT: number;
  TS_PCT?: number;
  EFG_PCT?: number;
  USG_PCT?: number;
  OFF_RATING?: number;
  DEF_RATING?: number;
  NET_RATING?: number;
}

/**
 * Translates NBA Stats API league-dash rows into canonical PlayerSeason.
 * Not used until NBADataProvider is connected to a live source.
 */
export function transformNbaPlayerSeason(
  raw: NbaLeagueDashPlayerStatsRow,
  season: string,
  teamNameLookup: (teamId: string) => string
): PlayerSeason {
  const teamId = String(raw.TEAM_ID);

  return {
    playerId: String(raw.PLAYER_ID),
    playerName: raw.PLAYER_NAME,
    teamId,
    teamName: teamNameLookup(teamId) || raw.TEAM_ABBREVIATION,
    season,
    gamesPlayed: raw.GP,
    minutes: raw.MIN,
    points: raw.PTS,
    assists: raw.AST,
    rebounds: raw.REB,
    steals: raw.STL,
    blocks: raw.BLK,
    turnovers: raw.TOV,
    fieldGoalPct: raw.FG_PCT,
    threePointPct: raw.FG3_PCT,
    freeThrowPct: raw.FT_PCT,
    trueShootingPct: raw.TS_PCT ?? 0,
    effectiveFieldGoalPct: raw.EFG_PCT ?? 0,
    usagePct: raw.USG_PCT ?? 0,
    offensiveRating: raw.OFF_RATING ?? 0,
    defensiveRating: raw.DEF_RATING ?? 0,
    netRating: raw.NET_RATING ?? 0,
  };
}
