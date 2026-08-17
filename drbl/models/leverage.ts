/**
 * M14 — formal possession leverage from a win-probability derivative.
 *
 * λ(s) ∝ ∂WP/∂ExpectedPoints (finite difference), then normalized so the
 * season-sample mean λ* = 1.
 *
 * DRBL-L = Σ BaseValue × λ*  (descriptive; never folded into WAR).
 */

import type { PossessionEpState } from "./expected-points";

/** Seconds of game clock per team possession (approx NBA pace). */
export const SECONDS_PER_POSSESSION = 14.4;

/** Regulation periods × minutes × 60. */
const REGULATION_PERIOD_SECONDS = 12 * 60;

/**
 * Approximate seconds remaining in the game (regulation + simple OT).
 * OT periods treated as 5 minutes.
 */
export function remainingGameSeconds(state: PossessionEpState): number {
  const period = Math.max(1, state.period);
  const clock = Math.max(0, state.clockSeconds);
  if (period <= 4) {
    return (4 - period) * REGULATION_PERIOD_SECONDS + clock;
  }
  // Overtime: current OT clock + future OTs unknown → use current OT only.
  return clock + (period - 4) * 5 * 60 * 0; // current OT clock only
}

export function remainingPossessions(state: PossessionEpState): number {
  return Math.max(0.5, remainingGameSeconds(state) / SECONDS_PER_POSSESSION);
}

/**
 * P(offense wins | state) via a logistic scoreboard model.
 *
 * logit ≈ κ · scoreDiff / sqrt(remainingPossessions)
 * κ tuned so a 1-point edge late (~2 rem poss) moves WP ~3–4%.
 */
export function offenseWinProbability(state: PossessionEpState): number {
  const rem = remainingPossessions(state);
  const kappa = 0.35;
  const z = (kappa * state.scoreDiff) / Math.sqrt(rem);
  // Bound extreme logits for numerics.
  const ez = Math.exp(Math.max(-20, Math.min(20, z)));
  return ez / (1 + ez);
}

/**
 * Raw leverage λ(s) ≈ ∂WP_offense/∂ExpectedPoints via +1 point finite difference.
 * Always ≥ 0 (absolute sensitivity of win chance to a point).
 */
export function leverageLambdaRaw(
  state: PossessionEpState,
  eps = 1
): number {
  const wp0 = offenseWinProbability(state);
  const wp1 = offenseWinProbability({
    ...state,
    scoreDiff: state.scoreDiff + eps,
  });
  // Absolute marginal WP per point — clutch either way.
  return Math.abs(wp1 - wp0) / eps;
}

/**
 * Season-normalized leverage weight (mean λ* = 1 when meanRaw is the sample mean).
 */
export function normalizeLeverage(
  raw: number,
  meanRaw: number
): number {
  const m = meanRaw > 1e-12 ? meanRaw : 1;
  return raw / m;
}

/**
 * Default λ used during attribution before season mean is known.
 * Equivalent to raw λ; finalize rescales DRBL-L by 1/meanRaw.
 */
export function leverageWeight(state: PossessionEpState): number {
  return Math.max(1e-6, leverageLambdaRaw(state));
}

export interface LeverageModelArtifact {
  version: string;
  fittedAt: string;
  /** Mean raw λ over attributed possessions (normalization constant). */
  meanRawLambda: number;
  minRawLambda: number;
  maxRawLambda: number;
  possessions: number;
  /** Example λ* for a tied end-of-4th (~30s) possession. */
  exampleClutchLambdaStar: number;
}

export function buildLeverageModelArtifact(
  meanRawLambda: number,
  options: {
    minRawLambda?: number;
    maxRawLambda?: number;
    possessions?: number;
  } = {}
): LeverageModelArtifact {
  const clutchRaw = leverageLambdaRaw({
    period: 4,
    clockSeconds: 30,
    offenseIsHome: true,
    scoreDiff: 0,
  });
  return {
    version: "drbl-l-wp-v1",
    fittedAt: new Date().toISOString(),
    meanRawLambda: Math.round(meanRawLambda * 1e6) / 1e6,
    minRawLambda: Math.round((options.minRawLambda ?? 0) * 1e6) / 1e6,
    maxRawLambda: Math.round((options.maxRawLambda ?? 0) * 1e6) / 1e6,
    possessions: options.possessions ?? 0,
    exampleClutchLambdaStar: Number(
      normalizeLeverage(clutchRaw, meanRawLambda).toFixed(3)
    ),
  };
}
