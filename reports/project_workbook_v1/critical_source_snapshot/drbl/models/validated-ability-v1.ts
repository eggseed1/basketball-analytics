/**
 * Validated DRBL ability v1 — canonical production estimator after M16k1.
 *
 * Formula (immutable for this generation):
 *   validatedDRBL100 = N/(N+1600) * rawAbilityRate
 *   priorMean = 0, calibration = identity, fusion = none
 *
 * Numerically identical to:
 *   research-ability-v1 → researchDRBL100
 *   research-rate-v1 (IDENTITY) → researchFinalDRBL100
 *
 * Live production `drbl100` sources this via finalizePlayerSeasonRows /
 * applyValidatedAbilityCutoverToArtifact (M16k1).
 */

import {
  RESEARCH_ABILITY_VERSION,
  RESEARCH_K,
  RESEARCH_POSTERIOR_LAYER_COUNT,
  RESEARCH_PRIOR_MEAN,
  computeResearchAbilityV1,
} from "./research-ability-v1";
import {
  RESEARCH_RATE_CONFIG_V1,
  RESEARCH_RATE_VERSION,
  computeResearchRateV1,
} from "./research-rate-v1";

/** Canonical production-facing model id for eventual cutover metadata. */
export const VALIDATED_ABILITY_MODEL_VERSION = "drbl-ability-eb1600-r1-v1";
export const VALIDATED_ATTRIBUTION_VERSION = "drbl-seq-attr-v1";
export const VALIDATED_K = RESEARCH_K; // 1600
export const VALIDATED_PRIOR_MEAN = RESEARCH_PRIOR_MEAN; // 0
export const VALIDATED_POSTERIOR_OPERATION_COUNT =
  RESEARCH_POSTERIOR_LAYER_COUNT; // 1
export const VALIDATED_CALIBRATION = "identity" as const;
export const VALIDATED_ZERO_SEMANTICS = "r1_replacement" as const;

/**
 * Feature flag for non-default shadow presentation. Default OFF.
 * Live/default production must ignore this until M16k1 controlled cutover.
 */
export const DRBL_VALIDATED_ABILITY_SHADOW_ENV = "DRBL_VALIDATED_ABILITY_SHADOW";

export function isValidatedAbilityShadowEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const v = (env[DRBL_VALIDATED_ABILITY_SHADOW_ENV] ?? "").toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export type ValidatedAbilityInput = {
  /** Unshrunk Approach-B rate (never drblP / fusedRateRaw). */
  rawAbilityRate: number;
  /** Actual combined on-court possession appearances (never N+k). */
  actualCombinedPossessionAppearances: number;
};

export type ValidatedAbilityResult = {
  validatedAbilityModelVersion: typeof VALIDATED_ABILITY_MODEL_VERSION;
  attributionVersion: typeof VALIDATED_ATTRIBUTION_VERSION;
  researchAbilityVersion: typeof RESEARCH_ABILITY_VERSION;
  researchRateVersion: typeof RESEARCH_RATE_VERSION;
  validatedRawP100: number;
  validatedActualPossessions: number;
  validatedReliability: number;
  validatedDRBL100: number;
  validatedPosteriorK: typeof VALIDATED_K;
  validatedPriorMean: typeof VALIDATED_PRIOR_MEAN;
  validatedCalibration: typeof VALIDATED_CALIBRATION;
  validatedZeroSemantics: typeof VALIDATED_ZERO_SEMANTICS;
  posteriorOperationsApplied: typeof VALIDATED_POSTERIOR_OPERATION_COUNT;
  /** Alias equality anchors (same numeric value under identity calibration). */
  aliases: {
    researchDRBL100: number;
    researchFinalDRBL100: number;
  };
  /** Descriptive cumulative points above R1 — NOT WAR. */
  validatedSeasonValuePointsAboveR1: number;
};

/**
 * Pure validated ability. Accepts only rawAbilityRate and actual N.
 * Structurally cannot see LN/B/fusion/uncertainty/WAR.
 */
export function computeValidatedAbilityV1(
  input: ValidatedAbilityInput
): ValidatedAbilityResult {
  const ability = computeResearchAbilityV1({
    rawAbilityRate: input.rawAbilityRate,
    actualCombinedPossessionAppearances:
      input.actualCombinedPossessionAppearances,
  });
  const rate = computeResearchRateV1(
    {
      rawAbilityRate: input.rawAbilityRate,
      actualCombinedPossessionAppearances:
        input.actualCombinedPossessionAppearances,
    },
    RESEARCH_RATE_CONFIG_V1
  );
  if (RESEARCH_RATE_CONFIG_V1.calibrationType !== "identity") {
    throw new Error("Validated ability requires IDENTITY calibration lock");
  }
  if (Math.abs(ability.researchDRBL100 - rate.researchFinalDRBL100) > 1e-12) {
    throw new Error("Validated ability research alias mismatch");
  }
  return {
    validatedAbilityModelVersion: VALIDATED_ABILITY_MODEL_VERSION,
    attributionVersion: VALIDATED_ATTRIBUTION_VERSION,
    researchAbilityVersion: RESEARCH_ABILITY_VERSION,
    researchRateVersion: RESEARCH_RATE_VERSION,
    validatedRawP100: ability.researchRawP100,
    validatedActualPossessions: ability.researchN,
    validatedReliability: ability.researchReliability,
    validatedDRBL100: rate.researchFinalDRBL100,
    validatedPosteriorK: VALIDATED_K,
    validatedPriorMean: VALIDATED_PRIOR_MEAN,
    validatedCalibration: VALIDATED_CALIBRATION,
    validatedZeroSemantics: VALIDATED_ZERO_SEMANTICS,
    posteriorOperationsApplied: VALIDATED_POSTERIOR_OPERATION_COUNT,
    aliases: {
      researchDRBL100: ability.researchDRBL100,
      researchFinalDRBL100: rate.researchFinalDRBL100,
    },
    validatedSeasonValuePointsAboveR1:
      (rate.researchFinalDRBL100 * ability.researchN) / 100,
  };
}
