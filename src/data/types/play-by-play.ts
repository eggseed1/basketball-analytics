/**
 * Canonical play-by-play types for game pages.
 * Sources may be NBA CDN, stats.nba.com, or ESPN summary PBP.
 */

export interface PlayByPlayEvent {
  /** Stable id within the game (action number). */
  id: string;
  gameId: string;
  actionNumber: number;
  orderNumber: number;
  period: number;
  /** Seconds remaining in the period. */
  clockSeconds: number;
  /** Display clock, e.g. "11:43". */
  clock: string;
  actionType: string;
  subType: string;
  description: string;
  teamId: string | null;
  teamTricode: string | null;
  playerId: string | null;
  playerName: string | null;
  scoreHome: number;
  scoreAway: number;
  shotResult: "Made" | "Missed" | null;
  isFieldGoal: boolean;
  /** Points scored on this action (0 if none). */
  points: number;
}

export interface GamePlayByPlay {
  gameId: string;
  source: "cdn" | "stats" | "espn" | "sample";
  events: PlayByPlayEvent[];
}
