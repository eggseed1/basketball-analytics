/**
 * Validated DRBL estimate availability + percentile qualification (M16k0.1).
 *
 * Separates:
 *   hasValidatedDrblEstimate  — mathematical availability of the validated point estimate
 *   existingProductQualification — preexisting product display rule (minutes >= 500)
 *   qualifiesForValidatedDrblPercentile — both
 *
 * Does NOT change live `hasValidDrblEstimate` (legacy uncertainty proxy) until M16k1.
 * Does NOT introduce a new scientific exposure threshold beyond N > 0.
 */

export const VALIDATED_PERCENTILE_PRODUCT_MIN_MINUTES = 500;

export const VALIDATED_PERCENTILE_ELIGIBILITY_VERSION =
  "drbl-validated-percentile-eligibility-v1";

export type ValidatedEstimateFields = {
  validatedDRBL100: number;
  validatedRawP100: number;
  validatedActualPossessions: number;
};

export type ProductQualificationFields = {
  minutes: number;
};

/**
 * Explicit validated-estimate availability (not missingness, not qualification).
 * Zero is a valid R1-replacement estimate when N > 0 and raw is finite.
 */
export function hasValidatedDrblEstimate(
  row: ValidatedEstimateFields
): boolean {
  return (
    Number.isFinite(row.validatedDRBL100) &&
    Number.isFinite(row.validatedRawP100) &&
    Number.isFinite(row.validatedActualPossessions) &&
    row.validatedActualPossessions > 0
  );
}

/**
 * Preexisting product display qualification for percentile cohorts.
 * Exact boundary: minutes >= 500 (preserved from computePlayerPercentiles default).
 */
export function existingProductQualification(
  row: ProductQualificationFields,
  minimumMinutes: number = VALIDATED_PERCENTILE_PRODUCT_MIN_MINUTES
): boolean {
  return row.minutes >= minimumMinutes;
}

/**
 * Validated percentile universe:
 *   existingProductQualification AND hasValidatedDrblEstimate
 *
 * Does not reference uncertainty / intervals / fusion / WAR.
 */
export function qualifiesForValidatedDrblPercentile(
  row: ValidatedEstimateFields & ProductQualificationFields,
  minimumMinutes: number = VALIDATED_PERCENTILE_PRODUCT_MIN_MINUTES
): boolean {
  return (
    existingProductQualification(row, minimumMinutes) &&
    hasValidatedDrblEstimate(row)
  );
}
