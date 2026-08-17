/**
 * Canonical R1 cumulative value (M16l1.2 / M16l2 / M16l3).
 * Single source of truth for production R1 Points and R1 Win Equivalents.
 * Do NOT duplicate these formulas in frontend/API code.
 */
export const R1_POINT_VALUE_VERSION = "drbl-r1-points-v1" as const;
export const R1_WIN_EQUIVALENT_VERSION = "drbl-r1-wineq-v1" as const;

/** Frozen development net-points-per-win (M16l1 P1). Do not refit. */
export const R1_POINTS_PER_WIN = 37.490662671779255;

export const R1_POINTS_UNIT = "SCOREBOARD_POINT_EQUIVALENT_RESIDUAL" as const;
export const R1_POINTS_REFERENCE = "CONTEXTUAL_ROLE_MATCHED_R1" as const;

/**
 * Realized R1 Points = primitive Approach-B attributed value.
 * Equivalently: rawAbilityRateExact * N / 100 at full precision.
 */
export function computeR1PointsFromApproachBAttributedValue(
  approachBAttributedValue: number
): number {
  return approachBAttributedValue;
}

/** Equivalent reconstruction identity (full precision). */
export function computeR1PointsFromRawRate(
  rawAbilityRateExact: number,
  actualCombinedPossessionAppearances: number
): number {
  const n = Math.max(0, actualCombinedPossessionAppearances);
  return (rawAbilityRateExact * n) / 100;
}

/**
 * R1 Win Equivalents = R1 Points / frozen P1.
 * Not conventional WAR. Not a causal replacement effect.
 */
export function computeR1WinEquivalents(r1Points: number): number {
  return r1Points / R1_POINTS_PER_WIN;
}

export type R1ValueFields = {
  r1Points: number;
  r1WinEquivalents: number;
  r1PointValueVersion: typeof R1_POINT_VALUE_VERSION;
  r1WinEquivalentVersion: typeof R1_WIN_EQUIVALENT_VERSION;
  r1PointsPerWin: typeof R1_POINTS_PER_WIN;
};

export function buildR1ValueFieldsFromAttributed(
  approachBAttributedValue: number
): R1ValueFields {
  const r1Points =
    computeR1PointsFromApproachBAttributedValue(approachBAttributedValue);
  return {
    r1Points,
    r1WinEquivalents: computeR1WinEquivalents(r1Points),
    r1PointValueVersion: R1_POINT_VALUE_VERSION,
    r1WinEquivalentVersion: R1_WIN_EQUIVALENT_VERSION,
    r1PointsPerWin: R1_POINTS_PER_WIN,
  };
}
