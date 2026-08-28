/**
 * Player impact / plus-minus style ratings.
 *
 * DARKO (Daily Adjusted and Regressed Kalman Optimized) - predictive DPM from
 * darko.app (Kostya Medvedovsky). Units: points per 100 possessions vs average.
 *
 * RAPTOR (Robust Algorithm using Player Tracking and On/Off Ratings) -
 * descriptive impact from FiveThirtyEight’s open data. Same units; O-/D-
 * components and WAR optional.
 */

export type ImpactSource = "darko" | "raptor";

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
  /** Overall impact (DARKO DPM or RAPTOR). */
  impact: number;
  offensive?: number;
  defensive?: number;
  /** DARKO-only extras. */
  boxImpact?: number;
  onOffImpact?: number;
  projectedMinutes?: number;
  /** RAPTOR WAR (wins above replacement) for the season. */
  winsAdded?: number;
  updatedAt?: string;
}

export interface DarkoRating extends ImpactRating {
  source: "darko";
}

export interface RaptorRating extends ImpactRating {
  source: "raptor";
}
