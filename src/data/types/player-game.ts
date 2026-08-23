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
  seasonType?: "regular" | "playoffs";
  /** ISO date string YYYY-MM-DD. */
  gameDate: string;
  opponentTeamId: string;
  isHome: boolean;
  /**
   * NBA START_POSITION (G/F/C) when the player started; empty/undefined = bench.
   */
  startPosition?: string;
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
  /**
   * True when the player was listed but did not play (inactive / DNP / injured).
   * Keep the roster row so OUT status can be shown explicitly.
   */
  didNotPlay?: boolean;
  /** Provider status reason when known (e.g. "Injured", "Coach's Decision"). */
  statusReason?: string;
}
