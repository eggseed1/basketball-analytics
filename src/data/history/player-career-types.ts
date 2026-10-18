/**
 * Client-safe historical career types + pure helpers (no Node fs).
 */

export type HistoryPlayerSeason = {
  season: string;
  playerId: string;
  playerName: string;
  teamIds: string[];
  primaryTeamId: string;
  gp: number;
  gs: number | null;
  minutes: number | null;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  steals: number | null;
  blocks: number | null;
  turnovers: number | null;
  fgm: number | null;
  fga: number | null;
  threePm: number | null;
  threePa: number | null;
  ftm: number | null;
  fta: number | null;
  drbl100: null;
  war1: null;
};

export type HistoryCareerSummary = {
  playerId: string;
  playerName: string;
  firstSeason: string;
  lastSeason: string;
  seasons: number;
  games: number;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  teams: string[];
  careerDrbl100: null;
  careerWar1: null;
};

export type HistoryPlayerGame = {
  gameId: string;
  season: string;
  date: string;
  playerId: string;
  playerName: string;
  teamId: string;
  opponentId: string;
  homeAway: string;
  result: string;
  minutes: string | null;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fgm: number;
  fga: number;
  threePm: number;
  threePa: number;
  ftm: number;
  fta: number;
  starter: boolean | null;
};

/** First season with a published DRBL artifact. Earlier seasons stay blank. */
export const DRBL_SUPPORTED_START = "2018-19";

/** DRBL available only for supported product seasons. */
export function historySeasonSupportsDrbl(season: string): boolean {
  return season >= DRBL_SUPPORTED_START;
}
