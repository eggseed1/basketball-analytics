/**
 * Box-score line for one player in one game.
 */
export interface PlayerGame {
  id: string;
  gameId: string;
  playerId: string;
  /** Display name when available from the box-score source. */
  playerName?: string;
  teamId: string;
  season: string;
  /** ISO date string YYYY-MM-DD. */
  gameDate: string;
  opponentTeamId: string;
  isHome: boolean;
  minutes: number;
  points: number;
  assists: number;
  rebounds: number;
  offensiveRebounds?: number;
  defensiveRebounds?: number;
  steals: number;
  blocks: number;
  turnovers: number;
  personalFouls?: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  threePointersMade: number;
  threePointersAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  plusMinus: number;
  /** Optional advanced rates when the source provides them. */
  offensiveRating?: number;
  defensiveRating?: number;
  netRating?: number;
  trueShootingPct?: number;
  effectiveFieldGoalPct?: number;
  usagePct?: number;
  assistPct?: number;
  turnoverPct?: number;
  reboundPct?: number;
  gameScore?: number;
  pie?: number;
}
