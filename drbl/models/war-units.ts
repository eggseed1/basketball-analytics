/**
 * DIAGNOSTIC_CANDIDATE — WAR unit conventions (M16e1).
 * Distinguishes combined-event vs paired-possession rates/exposures.
 * Does not change production WAR.
 */

/** Brand helpers (compile-time intent; runtime plain numbers). */
export type CombinedAppearanceCount = number & {
  readonly __brand: "CombinedAppearanceCount";
};
export type PairedPossessionCount = number & {
  readonly __brand: "PairedPossessionCount";
};
export type CombinedAppearanceRate100 = number & {
  readonly __brand: "CombinedAppearanceRate100";
};
export type PairedPossessionRate100 = number & {
  readonly __brand: "PairedPossessionRate100";
};
export type SeasonImpactPoints = number & {
  readonly __brand: "SeasonImpactPoints";
};
export type PointsPerWin = number & { readonly __brand: "PointsPerWin" };
export type Wins = number & { readonly __brand: "Wins" };

export function asCombinedCount(n: number): CombinedAppearanceCount {
  return n as CombinedAppearanceCount;
}
export function asPairedCount(n: number): PairedPossessionCount {
  return n as PairedPossessionCount;
}
export function asCombinedRate(r: number): CombinedAppearanceRate100 {
  return r as CombinedAppearanceRate100;
}
export function asPairedRate(r: number): PairedPossessionRate100 {
  return r as PairedPossessionRate100;
}
export function asImpact(x: number): SeasonImpactPoints {
  return x as SeasonImpactPoints;
}
export function asPPW(x: number): PointsPerWin {
  return x as PointsPerWin;
}
export function asWins(x: number): Wins {
  return x as Wins;
}

export const PAIRED_EXPOSURE_METHOD =
  "average_offensive_and_defensive_team_possessions_on_court" as const;

export const LOO_OUTPUT_UNIT =
  "net_points_per_100_paired_team_possessions" as const;

/**
 * Combined-event rate identity:
 *   R_combined = 100 * impact / N_combined
 *   impact = R_combined * N_combined / 100
 */
export function impactFromCombinedRate(
  rate: CombinedAppearanceRate100,
  nCombined: CombinedAppearanceCount
): SeasonImpactPoints {
  return asImpact((rate * nCombined) / 100);
}

/**
 * Paired-possession rate identity:
 *   R_paired = 100 * impact / N_paired
 */
export function impactFromPairedRate(
  rate: PairedPossessionRate100,
  nPaired: PairedPossessionCount
): SeasonImpactPoints {
  return asImpact((rate * nPaired) / 100);
}

/** Convert combined rate to paired-equivalent keeping the same impact points. */
export function combinedRateToPaired(
  rateCombined: CombinedAppearanceRate100,
  nCombined: CombinedAppearanceCount,
  nPaired: PairedPossessionCount
): PairedPossessionRate100 {
  if (!(nPaired > 0)) return asPairedRate(0);
  return asPairedRate(rateCombined * (nCombined / nPaired));
}

/** Convert paired rate to combined-equivalent keeping the same impact points. */
export function pairedRateToCombined(
  ratePaired: PairedPossessionRate100,
  nPaired: PairedPossessionCount,
  nCombined: CombinedAppearanceCount
): CombinedAppearanceRate100 {
  if (!(nCombined > 0)) return asCombinedRate(0);
  return asCombinedRate(ratePaired * (nPaired / nCombined));
}

export function warFromImpactPoints(
  impact: SeasonImpactPoints,
  pointsPerWin: PointsPerWin
): Wins {
  if (!(pointsPerWin > 0)) return asWins(0);
  return asWins(impact / pointsPerWin);
}

/**
 * DIAGNOSTIC: paired-possession WAR using LOO output as paired rate.
 */
export function diagnosticWarPaired(args: {
  calibratedRatePaired: number;
  replacementPaired: number;
  nPaired: number;
  pointsPerWin: number;
}): {
  aboveReplacementRatePaired: number;
  seasonalImpactPaired: number;
  warPaired: number;
} {
  const above = args.calibratedRatePaired - args.replacementPaired;
  const impact = (above * args.nPaired) / 100;
  return {
    aboveReplacementRatePaired: above,
    seasonalImpactPaired: impact,
    warPaired: args.pointsPerWin > 0 ? impact / args.pointsPerWin : 0,
  };
}

/**
 * DIAGNOSTIC: combined-event WAR via pure unit conversion from paired rates.
 * Must match diagnosticWarPaired when replacement is converted identically.
 */
export function diagnosticWarCombinedConverted(args: {
  calibratedRatePaired: number;
  replacementPaired: number;
  nPaired: number;
  nCombined: number;
  pointsPerWin: number;
}): {
  calibratedRateCombined: number;
  replacementCombined: number;
  aboveReplacementRateCombined: number;
  seasonalImpactCombined: number;
  warCombinedConverted: number;
} {
  const ratio =
    args.nCombined > 0 && args.nPaired > 0
      ? args.nCombined / args.nPaired
      : 2;
  const calibratedRateCombined = args.calibratedRatePaired / ratio;
  const replacementCombined = args.replacementPaired / ratio;
  const above = calibratedRateCombined - replacementCombined;
  const impact = (above * args.nCombined) / 100;
  return {
    calibratedRateCombined,
    replacementCombined,
    aboveReplacementRateCombined: above,
    seasonalImpactCombined: impact,
    warCombinedConverted:
      args.pointsPerWin > 0 ? impact / args.pointsPerWin : 0,
  };
}

/**
 * Assert rate × matching exposure reconstructs impact.
 * Throws on mismatched pairing (paired rate × combined exposure).
 */
export function assertRateExposureIdentity(args: {
  rate: number;
  exposure: number;
  impact: number;
  tol?: number;
}): void {
  const tol = args.tol ?? 1e-6;
  const recon = (args.rate * args.exposure) / 100;
  if (Math.abs(recon - args.impact) > tol) {
    throw new Error(
      `RATE_EXPOSURE_IDENTITY_FAIL: rate*exposure/100=${recon} impact=${args.impact}`
    );
  }
}

/**
 * Reject illegal pairing: paired-scale rate with combined-event count
 * when an explicit expected impact is known from the paired identity.
 */
export function assertRejectMismatchedPairedRateOnCombinedExposure(args: {
  pairedRate: number;
  nCombined: number;
  expectedImpactFromPaired: number;
  tol?: number;
}): void {
  const tol = args.tol ?? 1e-6;
  const illegal = (args.pairedRate * args.nCombined) / 100;
  if (Math.abs(illegal - args.expectedImpactFromPaired) <= tol) {
    throw new Error(
      "WAR_EXPOSURE_UNIT_MISMATCH expected: paired rate × combined exposure should NOT equal paired impact"
    );
  }
}
