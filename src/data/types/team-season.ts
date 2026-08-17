/**
 * Team-level season board used by web Team Intelligence / Explore Teams.
 * Sourced from ESPN-style by-team totals (not RAPTOR / team DARKO).
 * Coexists with {@link TeamSeason} (NBA Stats advanced grain).
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
  /** Estimated opponent PPG. */
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
  effectiveFieldGoalPct?: number;
  trueShootingPct?: number;
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

/**
 * Season-level team stats (league table grain).
 * Percentages are fractions in [0, 1]. Ratings use the ~100 scale.
 */
export interface TeamSeason {
  teamId: string;
  teamName: string;
  teamAbbreviation: string;
  season: string;
  conference?: "East" | "West";
  division?: string;

  gamesPlayed: number;
  wins: number;
  losses: number;
  /** Win percentage as fraction 0–1. */
  winPct: number;

  /** Per-game counting (from NBA Stats PerGame). */
  pointsPerGame: number;
  assistsPerGame: number;
  reboundsPerGame: number;
  offensiveReboundsPerGame: number;
  defensiveReboundsPerGame: number;
  stealsPerGame: number;
  blocksPerGame: number;
  turnoversPerGame: number;
  fieldGoalsMadePerGame: number;
  fieldGoalsAttemptedPerGame: number;
  threePointersMadePerGame: number;
  threePointersAttemptedPerGame: number;
  freeThrowsMadePerGame: number;
  freeThrowsAttemptedPerGame: number;

  fieldGoalPct: number;
  threePointPct: number;
  freeThrowPct: number;
  effectiveFieldGoalPct: number;
  trueShootingPct: number;

  offensiveRating: number;
  defensiveRating: number;
  netRating: number;
  pace: number;
  assistPct: number;
  turnoverPct: number;
  offensiveReboundPct: number;
  defensiveReboundPct: number;
  reboundPct: number;
  /** Player Impact Estimate aggregate for the team. */
  pie: number;
  plusMinus: number;
}
