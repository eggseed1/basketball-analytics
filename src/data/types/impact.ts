/**
 * Player impact / plus-minus style ratings.
 *
 * DARKO (Daily Adjusted and Regressed Kalman Optimized) - predictive DPM from
 * darko.app (Kostya Medvedovsky). Units: points per 100 possessions vs average.
 *
 * LEBRON (Luck-adjusted Estimate using a Box prior Regularized ON-off)  - 
 * descriptive impact from BBall Index. Same units; O-/D- components optional.
 */

export type ImpactSource = "darko" | "lebron";

export interface ImpactRating {
  playerId: string;
  /** Display name when the impact feed is keyed by name rather than ESPN id. */
  playerName: string;
  /** NBA.com / BallDontLie player id when known. */
  nbaPlayerId?: string;
  teamId?: string;
  teamName?: string;
  teamAbbr?: string;
  position?: string;
  /** Canonical season YYYY-YY, or "current" for live projection snapshot. */
  season: string;
  source: ImpactSource;
  /** Overall impact (DARKO DPM or LEBRON). */
  impact: number;
  offensive?: number;
  defensive?: number;
  /** DARKO-only extras. */
  boxImpact?: number;
  onOffImpact?: number;
  projectedMinutes?: number;
  /** LEBRON-only: estimated wins added over the season. */
  winsAdded?: number;
  updatedAt?: string;
}

export interface DarkoRating extends ImpactRating {
  source: "darko";
}

export interface LebronRating extends ImpactRating {
  source: "lebron";
}
