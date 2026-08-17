/**
 * M12 — calibrated uncertainty for published DRBL/100.
 *
 * Half-width of an ~80% predictive interval around fused DRBL/100, scaled by
 * sample size (+ mild estimator disagreement as an empirical error proxy).
 * Multiplier `k` is chosen so OOF |error| ≤ k · scale hits target coverage.
 *
 * Disagreement widens intervals when estimators diverge; it does **not**
 * shrink the point estimate (see fusion disagreement diagnostic).
 */

export interface UncertaintyObservation {
  playerId: string;
  possessions: number;
  disagreement: number;
  /** OOF fused prediction − stacking target. */
  error: number;
  asOfDate: string;
}

export interface UncertaintyCalibration {
  version: string;
  fittedAt: string;
  /** Nominal coverage for published ± uncertainty (e.g. 0.80). */
  targetCoverage: number;
  /** Multiplier on rawScale: halfWidth = k · rawScale. */
  scaleMultiplier: number;
  /** Coefficient on disagreement inside rawScale. */
  disagreementCoef: number;
  /** Floor / ceiling on published half-width. */
  minHalfWidth: number;
  maxHalfWidth: number;
  /** Chronological OOF coverage of the calibrated interval. */
  oof: {
    n: number;
    coverage: number;
    /** |coverage − target| ≤ tolerance → calibrated. */
    calibrated: boolean;
    tolerance: number;
    meanAbsError: number;
  };
}

export const DEFAULT_DISAGREEMENT_COEF = 0.15;
export const DEFAULT_TARGET_COVERAGE = 0.8;
export const DEFAULT_COVERAGE_TOLERANCE = 0.08;

/**
 * Uncalibrated scale: larger with fewer possessions; mild disagreement bump.
 */
export function rawUncertaintyScale(
  possessions: number,
  disagreement: number,
  disagreementCoef = DEFAULT_DISAGREEMENT_COEF
): number {
  const sample = 1 / Math.sqrt(Math.max(1, possessions) / 100);
  return sample + disagreementCoef * Math.max(0, disagreement);
}

function quantile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 1;
  const clamped = Math.min(1, Math.max(0, q));
  const idx = (sortedAsc.length - 1) * clamped;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo]!;
  const t = idx - lo;
  return sortedAsc[lo]! * (1 - t) + sortedAsc[hi]! * t;
}

/** Fit scale multiplier so |e| ≤ k · scale covers `targetCoverage` of obs. */
export function fitScaleMultiplier(
  obs: UncertaintyObservation[],
  options: {
    targetCoverage?: number;
    disagreementCoef?: number;
  } = {}
): number {
  const target = options.targetCoverage ?? DEFAULT_TARGET_COVERAGE;
  const coef = options.disagreementCoef ?? DEFAULT_DISAGREEMENT_COEF;
  const ratios: number[] = [];
  for (const row of obs) {
    const scale = rawUncertaintyScale(
      row.possessions,
      row.disagreement,
      coef
    );
    if (scale <= 1e-9) continue;
    ratios.push(Math.abs(row.error) / scale);
  }
  ratios.sort((a, b) => a - b);
  const k = quantile(ratios, target);
  return Number.isFinite(k) && k > 0 ? k : 1.2;
}

export function predictHalfWidth(
  possessions: number,
  disagreement: number,
  calib: Pick<
    UncertaintyCalibration,
    | "scaleMultiplier"
    | "disagreementCoef"
    | "minHalfWidth"
    | "maxHalfWidth"
  >
): number {
  const scale = rawUncertaintyScale(
    possessions,
    disagreement,
    calib.disagreementCoef
  );
  const half = calib.scaleMultiplier * scale;
  return Math.max(
    calib.minHalfWidth,
    Math.min(calib.maxHalfWidth, half)
  );
}

function coverageOf(
  obs: UncertaintyObservation[],
  k: number,
  disagreementCoef: number
): { n: number; coverage: number; mae: number } {
  if (obs.length === 0) return { n: 0, coverage: 0, mae: 0 };
  let hit = 0;
  let abs = 0;
  for (const row of obs) {
    const hw =
      k *
      rawUncertaintyScale(row.possessions, row.disagreement, disagreementCoef);
    if (Math.abs(row.error) <= hw) hit += 1;
    abs += Math.abs(row.error);
  }
  return {
    n: obs.length,
    coverage: hit / obs.length,
    mae: abs / obs.length,
  };
}

function chronologicalFolds(
  obs: UncertaintyObservation[],
  folds: number
): UncertaintyObservation[][] {
  const sorted = obs
    .slice()
    .sort(
      (a, b) =>
        a.asOfDate.localeCompare(b.asOfDate) ||
        a.playerId.localeCompare(b.playerId)
    );
  const buckets: UncertaintyObservation[][] = Array.from(
    { length: folds },
    () => []
  );
  for (let i = 0; i < sorted.length; i++) {
    buckets[i % folds]!.push(sorted[i]!);
  }
  return buckets;
}

/**
 * Calibrate ± half-width from OOF fusion residuals.
 * Reports chrono OOF coverage of the fitted multiplier.
 */
export function calibrateUncertainty(
  obs: UncertaintyObservation[],
  options: {
    targetCoverage?: number;
    disagreementCoef?: number;
    folds?: number;
    tolerance?: number;
    minHalfWidth?: number;
    maxHalfWidth?: number;
  } = {}
): UncertaintyCalibration {
  const targetCoverage = options.targetCoverage ?? DEFAULT_TARGET_COVERAGE;
  const disagreementCoef =
    options.disagreementCoef ?? DEFAULT_DISAGREEMENT_COEF;
  const tolerance = options.tolerance ?? DEFAULT_COVERAGE_TOLERANCE;
  const minHalfWidth = options.minHalfWidth ?? 0.15;
  const maxHalfWidth = options.maxHalfWidth ?? 4;
  const folds = Math.max(2, Math.min(options.folds ?? 5, obs.length || 2));

  let oofHits = 0;
  let oofN = 0;
  let oofAbs = 0;

  if (obs.length >= 20) {
    const buckets = chronologicalFolds(obs, folds);
    for (let f = 0; f < folds; f++) {
      const test = buckets[f]!;
      const train = buckets.flatMap((b, i) => (i === f ? [] : b));
      if (train.length < 10 || test.length === 0) continue;
      const k = fitScaleMultiplier(train, {
        targetCoverage,
        disagreementCoef,
      });
      for (const row of test) {
        const hw =
          k *
          rawUncertaintyScale(
            row.possessions,
            row.disagreement,
            disagreementCoef
          );
        if (Math.abs(row.error) <= hw) oofHits += 1;
        oofAbs += Math.abs(row.error);
        oofN += 1;
      }
    }
  }

  const scaleMultiplier = fitScaleMultiplier(obs, {
    targetCoverage,
    disagreementCoef,
  });

  const inSample = coverageOf(obs, scaleMultiplier, disagreementCoef);
  const coverage = oofN > 0 ? oofHits / oofN : inSample.coverage;
  const mae = oofN > 0 ? oofAbs / oofN : inSample.mae;

  return {
    version: "drbl-uncertainty-v1",
    fittedAt: new Date().toISOString(),
    targetCoverage,
    scaleMultiplier: Math.round(scaleMultiplier * 1e6) / 1e6,
    disagreementCoef,
    minHalfWidth,
    maxHalfWidth,
    oof: {
      n: oofN > 0 ? oofN : inSample.n,
      coverage: Math.round(coverage * 1000) / 1000,
      calibrated: Math.abs(coverage - targetCoverage) <= tolerance,
      tolerance,
      meanAbsError: Math.round(mae * 1000) / 1000,
    },
  };
}

export function buildUncertaintyObservations(
  rows: Array<{
    playerId: string;
    possessions: number;
    disagreement: number;
    asOfDate: string;
    targetPer100: number;
    fusedPer100: number;
  }>
): UncertaintyObservation[] {
  return rows.map((r) => ({
    playerId: r.playerId,
    possessions: r.possessions,
    disagreement: r.disagreement,
    asOfDate: r.asOfDate,
    error: r.fusedPer100 - r.targetPer100,
  }));
}
