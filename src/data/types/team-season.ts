/**
 * Team-level season board - counting + derived efficiency metrics.
 * Sourced from ESPN by-team totals (not RAPTOR / team DARKO).
 */
export type TeamSeasonStats = {
  season: string;
  teamId: string;
  abbreviation: string;
  fullName: string;
  conference: "East" | "West";
  gamesPlayed: number;
  /** Points per game. */
  ppg: number;
  /** Estimated opponent PPG via avgPoints − avgPointsDifferential. */
  oppPpg: number;
  /** Average point differential (team − opponent). */
  avgDiff: number;
  rpg: number;
  apg: number;
  spg: number;
  bpg: number;
  topg: number;
  fieldGoalPct: number;
  threePointPct: number;
  freeThrowPct: number;
  effectiveFieldGoalPct: number;
  trueShootingPct: number;
  /** Assists / turnovers (season totals). */
  assistToTurnover: number;
  offensiveReboundPct: number;
  points: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  threePointersMade: number;
  threePointersAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  assists: number;
  turnovers: number;
};
