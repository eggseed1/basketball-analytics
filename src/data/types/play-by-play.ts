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
  /** Assister on a make, blocker on a blocked shot, or stealer on a steal, when the source names one. */
  secondPlayerId?: string | null;
  scoreHome: number;
  scoreAway: number;
  shotResult: "Made" | "Missed" | null;
  isFieldGoal: boolean;
  /** Points scored on this action (0 if none). */
  points: number;
  /**
   * Where the source places the play, in feet from the attacked rim (x across,
   * y toward half court). Null when the source has no real spot; never estimated.
   */
  locX?: number | null;
  locY?: number | null;
}

export interface GamePlayByPlay {
  gameId: string;
  source: "cdn" | "stats" | "espn" | "sample";
  events: PlayByPlayEvent[];
}
