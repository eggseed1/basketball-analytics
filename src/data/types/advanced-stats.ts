/**
 * Game-level advanced box-score metrics (possession-aware).
 * Percentages are fractions in [0, 1]. Ratings ~100 scale unless noted.
 */
export interface AdvancedPlayerGameStats {
  id: string;
  gameId: string;
  playerId: string;
  playerName?: string;
  teamId: string;
  season: string;
  gameDate: string;
  minutes: number;
  /** Offensive / defensive / net rating when available. */
  offensiveRating?: number;
  defensiveRating?: number;
  netRating?: number;
  trueShootingPct?: number;
  effectiveFieldGoalPct?: number;
  usagePct?: number;
  assistPct?: number;
  reboundPct?: number;
  turnoverPct?: number;
  pace?: number;
  pie?: number;
  plusMinus?: number;
}
