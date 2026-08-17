/**
 * Research final rate v1 — LOCKED after M16h audit.
 *
 * Canonical point estimate:
 *   rawAbilityRate → EB1600 (priorMean=0) → researchFinalDRBL100
 *
 * Calibration: IDENTITY (b=1). No additional scale layer.
 * See reports/m16h/22_research_rate_lock.md
 *
 * Do not alter this rate for uncertainty, WAR, fusion, or LN/B/M6.
 */

import {
  RESEARCH_ABILITY_VERSION,
  RESEARCH_K,
  RESEARCH_POSTERIOR_LAYER_COUNT,
  RESEARCH_POSTERIOR_VERSION,
  RESEARCH_PRIOR_MEAN,
  computeResearchAbilityV1,
  type ResearchAbilityInput,
} from "./research-ability-v1";

export const RESEARCH_RATE_VERSION = "drbl-research-rate-v1";
export const CALIBRATION_IDENTITY_VERSION = "drbl-calibration-identity-v1";
export const CALIBRATION_ZERO_LINEAR_VERSION =
  "drbl-calibration-zero-linear-v1";

export type ResearchCalibrationType = "identity" | "zero_linear";

export type ResearchRateConfig = {
  calibrationType: ResearchCalibrationType;
  /** Zero-preserving slope; must be 1 for identity. */
  b: number;
  calibrationVersion: string;
};

/** Locked by M16h: IDENTITY_SELECTED (b=1). Zero-linear did not clear gates. */
export const RESEARCH_RATE_CONFIG_V1: ResearchRateConfig = {
  calibrationType: "identity",
  b: 1,
  calibrationVersion: CALIBRATION_IDENTITY_VERSION,
};

export type ResearchRateResult = {
  researchRateVersion: typeof RESEARCH_RATE_VERSION;
  researchAbilityVersion: typeof RESEARCH_ABILITY_VERSION;
  researchPosteriorVersion: typeof RESEARCH_POSTERIOR_VERSION;
  calibrationVersion: string;
  calibrationType: ResearchCalibrationType;
  calibrationCoefficient: number;
  researchRawP100: number;
  researchN: number;
  researchReliability: number;
  researchPosteriorP100: number;
  researchFinalDRBL100: number;
  posteriorOperationsApplied: number;
  calibrationLayerCount: 0 | 1;
  researchSeasonalImpact: number;
};

export function computeResearchRateV1(
  input: ResearchAbilityInput,
  config: ResearchRateConfig = RESEARCH_RATE_CONFIG_V1
): ResearchRateResult {
  const post = computeResearchAbilityV1(input);
  const b = config.calibrationType === "identity" ? 1 : config.b;
  if (!(b > 0) || !Number.isFinite(b)) {
    throw new Error(`Invalid calibration coefficient b=${b}`);
  }
  const final = b * post.researchPosteriorP100;
  const calibrationLayerCount: 0 | 1 =
    config.calibrationType === "identity" || b === 1 ? 0 : 1;
  return {
    researchRateVersion: RESEARCH_RATE_VERSION,
    researchAbilityVersion: RESEARCH_ABILITY_VERSION,
    researchPosteriorVersion: RESEARCH_POSTERIOR_VERSION,
    calibrationVersion: config.calibrationVersion,
    calibrationType: config.calibrationType,
    calibrationCoefficient: b,
    researchRawP100: post.researchRawP100,
    researchN: post.researchN,
    researchReliability: post.researchReliability,
    researchPosteriorP100: post.researchPosteriorP100,
    researchFinalDRBL100: final,
    posteriorOperationsApplied: RESEARCH_POSTERIOR_LAYER_COUNT,
    calibrationLayerCount,
    researchSeasonalImpact: (final * post.researchN) / 100,
  };
}

export function fitZeroLinearSlope(
  x: number[],
  y: number[],
  w?: number[]
): number {
  let num = 0;
  let den = 0;
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const wi = w?.[i] ?? 1;
    num += wi * x[i]! * y[i]!;
    den += wi * x[i]! * x[i]!;
  }
  if (Math.abs(den) < 1e-18) return NaN;
  return num / den;
}

export function fitAffineOLS(
  x: number[],
  y: number[]
): { a: number; b: number } {
  const n = Math.min(x.length, y.length);
  if (n < 2) return { a: NaN, b: NaN };
  let sx = 0,
    sy = 0,
    sxx = 0,
    sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i]!;
    sy += y[i]!;
    sxx += x[i]! * x[i]!;
    sxy += x[i]! * y[i]!;
  }
  const den = n * sxx - sx * sx;
  if (Math.abs(den) < 1e-18) return { a: sy / n, b: 0 };
  const b = (n * sxy - sx * sy) / den;
  const a = (sy - b * sx) / n;
  return { a, b };
}

export {
  RESEARCH_ABILITY_VERSION,
  RESEARCH_K,
  RESEARCH_POSTERIOR_LAYER_COUNT,
  RESEARCH_POSTERIOR_VERSION,
  RESEARCH_PRIOR_MEAN,
};
