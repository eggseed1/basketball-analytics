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
  steals: number;
  blocks: number;
  turnovers: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  threePointersMade: number;
  threePointersAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  plusMinus: number;
}
