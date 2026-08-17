/**
 * Research ability architecture v1 (M16g2 shadow path).
 *
 * Canonical research estimate:
 *   rawAbilityRate (unshrunk Approach B / drbl-seq-attr-v1)
 *     → single EB(k=1600, priorMean=0, N=actual combined appearances)
 *     → researchDRBL100
 *
 * Isolated from production fields:
 *   drblP, fusedRateRaw, posteriorAbilityRate, drbl100, LN, B, M6, calibration, WAR.
 */

import { empiricalBayesRate } from "./leaderboard";

export const RESEARCH_ABILITY_VERSION = "drbl-research-ability-v1";
export const RESEARCH_POSTERIOR_VERSION = "drbl-eb-posterior-k1600-v1";
export const RESEARCH_K = 1600;
export const RESEARCH_PRIOR_MEAN = 0;
export const RESEARCH_POSTERIOR_LAYER_COUNT = 1;

export type ResearchAbilityInput = {
  /** Unshrunk Approach-B rate: 100 * totalValue / combined possession appearances. */
  rawAbilityRate: number;
  /** Actual combined on-court possession appearances (never N+k). */
  actualCombinedPossessionAppearances: number;
};

export type ResearchAbilityResult = {
  researchAbilityVersion: typeof RESEARCH_ABILITY_VERSION;
  researchPosteriorVersion: typeof RESEARCH_POSTERIOR_VERSION;
  researchRawP100: number;
  researchN: number;
  researchK: typeof RESEARCH_K;
  researchPriorMean: typeof RESEARCH_PRIOR_MEAN;
  researchReliability: number;
  researchPosteriorP100: number;
  /** Alias of researchPosteriorP100 — pre-calibration research ability. */
  researchDRBL100: number;
  /** Instrumentation: must equal 1 for the research path. */
  posteriorOperationsApplied: number;
  researchSeasonalImpact: number;
};

/**
 * Pure research posterior. Does not read production shrunk/fused fields.
 */
export function computeResearchAbilityV1(
  input: ResearchAbilityInput
): ResearchAbilityResult {
  const n = Math.max(0, input.actualCombinedPossessionAppearances);
  const raw = input.rawAbilityRate;
  const { posterior, reliability } = empiricalBayesRate(
    raw,
    n,
    RESEARCH_PRIOR_MEAN,
    RESEARCH_K
  );
  const researchSeasonalImpact = (posterior * n) / 100;
  return {
    researchAbilityVersion: RESEARCH_ABILITY_VERSION,
    researchPosteriorVersion: RESEARCH_POSTERIOR_VERSION,
    researchRawP100: raw,
    researchN: n,
    researchK: RESEARCH_K,
    researchPriorMean: RESEARCH_PRIOR_MEAN,
    researchReliability: reliability,
    researchPosteriorP100: posterior,
    researchDRBL100: posterior,
    posteriorOperationsApplied: RESEARCH_POSTERIOR_LAYER_COUNT,
    researchSeasonalImpact,
  };
}

/** Wrong-path helpers for identity tests (must NOT equal research shadow). */
export function wrongPathEb1600OfEb200(
  raw: number,
  n: number
): number {
  const mid = empiricalBayesRate(raw, n, 0, 200).posterior;
  return empiricalBayesRate(mid, n, 0, RESEARCH_K).posterior;
}

export function wrongPathEb200OfEb1600(raw: number, n: number): number {
  const mid = empiricalBayesRate(raw, n, 0, RESEARCH_K).posterior;
  return empiricalBayesRate(mid, n, 0, 200).posterior;
}

export function wrongPathEb1600OfDrblP(drblP: number, n: number): number {
  return empiricalBayesRate(drblP, n, 0, RESEARCH_K).posterior;
}
