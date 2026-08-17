import type { PlayerSeason } from "@/data/types";
import {
  freeThrowRate,
  threePointAttemptRate,
  turnoverPct,
  twoPointPct,
} from "@/data/providers/nba/compute-advanced";

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
  GS?: number;
  MIN: number;
  FGM?: number;
  FGA?: number;
  FG3M?: number;
  FG3A?: number;
  FTM?: number;
  FTA?: number;
  OREB?: number;
  DREB?: number;
  PF?: number;
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
  AST_PCT?: number;
  OREB_PCT?: number;
  DREB_PCT?: number;
  REB_PCT?: number;
  PIE?: number;
  PLUS_MINUS?: number;
}

/**
 * Translates NBA Stats API league-dash rows into canonical PlayerSeason.
 */
export function transformNbaPlayerSeason(
  raw: NbaLeagueDashPlayerStatsRow,
  season: string,
  teamNameLookup: (teamId: string) => string
): PlayerSeason {
  const teamId = String(raw.TEAM_ID);
  const fgm = raw.FGM ?? 0;
  const fga = raw.FGA ?? 0;
  const tpm = raw.FG3M ?? 0;
  const tpa = raw.FG3A ?? 0;
  const ftm = raw.FTM ?? 0;
  const fta = raw.FTA ?? 0;
  const orb = raw.OREB ?? 0;
  const drb = raw.DREB ?? Math.max(0, raw.REB - orb);

  return {
    playerId: String(raw.PLAYER_ID),
    playerName: raw.PLAYER_NAME,
    teamId,
    teamName: teamNameLookup(teamId) || raw.TEAM_ABBREVIATION,
    teamAbbreviation: raw.TEAM_ABBREVIATION,
    season,
    age: raw.AGE,
    gamesPlayed: raw.GP,
    gamesStarted: raw.GS ?? raw.GP,
    minutes: raw.MIN,
    fieldGoalsMade: fgm,
    fieldGoalsAttempted: fga,
    threePointersMade: tpm,
    threePointersAttempted: tpa,
    freeThrowsMade: ftm,
    freeThrowsAttempted: fta,
    offensiveRebounds: orb,
    defensiveRebounds: drb,
    rebounds: raw.REB,
    assists: raw.AST,
    steals: raw.STL,
    blocks: raw.BLK,
    turnovers: raw.TOV,
    personalFouls: raw.PF ?? 0,
    points: raw.PTS,
    plusMinus: raw.PLUS_MINUS ?? 0,
    fieldGoalPct: raw.FG_PCT,
    twoPointPct: twoPointPct(fgm, tpm, fga, tpa),
    threePointPct: raw.FG3_PCT,
    freeThrowPct: raw.FT_PCT,
    trueShootingPct: raw.TS_PCT ?? 0,
    effectiveFieldGoalPct: raw.EFG_PCT ?? 0,
    threePointAttemptRate: threePointAttemptRate(tpa, fga),
    freeThrowRate: freeThrowRate(fta, fga),
    turnoverPct: turnoverPct(raw.TOV, fga, fta),
    usagePct: raw.USG_PCT ?? 0,
    assistPct: raw.AST_PCT ?? 0,
    offensiveReboundPct: raw.OREB_PCT ?? 0,
    defensiveReboundPct: raw.DREB_PCT ?? 0,
    reboundPct: raw.REB_PCT ?? 0,
    stealPct: 0,
    blockPct: 0,
    pie: raw.PIE ?? 0,
    offensiveRating: raw.OFF_RATING ?? 0,
    defensiveRating: raw.DEF_RATING ?? 0,
    netRating: raw.NET_RATING ?? 0,
    per: 0,
    ows: 0,
    dws: 0,
    winShares: 0,
    winSharesPer48: 0,
    obpm: 0,
    dbpm: 0,
    bpm: 0,
    vorp: 0,
    dpm: 0,
    oDpm: 0,
    dDpm: 0,
    boxDpm: 0,
    onOffDpm: 0,
    drbl100: 0,
    drblP: 0,
    drblLn: 0,
    drblB: 0,
    drblO: 0,
    drblD: 0,
    sdv100: 0,
    shotMaking100: 0,
    epvShootMean: 0,
    vContMean: 0,
    r1Points: null,
    r1WinEquivalents: null,
    r1PointValueVersion: null,
    r1WinEquivalentVersion: null,
    drblWar: 0,
    drblSeasonalImpact: 0,
    drblL: 0,
    drblMeanLeverage: 0,
    drblDisagreement: 0,
    drblUncertainty: 0,
    drblIntervalLo: 0,
    drblIntervalHi: 0,
  };
}
