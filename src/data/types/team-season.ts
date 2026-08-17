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
