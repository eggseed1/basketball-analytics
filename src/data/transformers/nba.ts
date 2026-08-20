import type { PlayerSeason } from "@/data/types";
import { withPlayerSeasonDefaults } from "@/data/transformers/player-season-defaults";

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
 * Missing advanced rates stay omitted (undefined) - never invent 0.
 */
export function transformNbaPlayerSeason(
  raw: NbaLeagueDashPlayerStatsRow,
  season: string,
  teamNameLookup: (teamId: string) => string
): PlayerSeason {
  const teamId = String(raw.TEAM_ID);

  return withPlayerSeasonDefaults({
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
    ...(raw.TS_PCT != null ? { trueShootingPct: raw.TS_PCT } : {}),
    ...(raw.EFG_PCT != null ? { effectiveFieldGoalPct: raw.EFG_PCT } : {}),
    ...(raw.USG_PCT != null ? { usagePct: raw.USG_PCT } : {}),
    ...(raw.OFF_RATING != null ? { offensiveRating: raw.OFF_RATING } : {}),
    ...(raw.DEF_RATING != null ? { defensiveRating: raw.DEF_RATING } : {}),
    ...(raw.NET_RATING != null ? { netRating: raw.NET_RATING } : {}),
  });
}
