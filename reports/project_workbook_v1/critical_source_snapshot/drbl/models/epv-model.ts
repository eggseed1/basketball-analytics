/**
 * M5 — time-safe EPV feature vector (pre-possession state only).
 * No final outcomes, no same-possession results, no future info.
 */

import type { PossessionEpState } from "./expected-points";

/** Ordered feature names for manifests / OOF. */
export const EPV_FEATURE_NAMES = [
  "bias",
  "offenseIsHome",
  "clockLe4",
  "clockLe8",
  "periodGe4",
  "absDiffGe10",
  "absDiffGe20",
  "trailingGe10",
  "leadingGe10",
  "clockNorm",
] as const;

export type EpvFeatureName = (typeof EPV_FEATURE_NAMES)[number];

export function epvFeatureVector(state: PossessionEpState): number[] {
  const absDiff = Math.abs(state.scoreDiff);
  const periodLen = state.period <= 4 ? 720 : 300;
  return [
    1,
    state.offenseIsHome ? 1 : 0,
    state.clockSeconds <= 4 ? 1 : 0,
    state.clockSeconds <= 8 ? 1 : 0,
    state.period >= 4 ? 1 : 0,
    absDiff >= 10 ? 1 : 0,
    absDiff >= 20 ? 1 : 0,
    state.scoreDiff <= -10 ? 1 : 0,
    state.scoreDiff >= 10 ? 1 : 0,
    periodLen > 0 ? state.clockSeconds / periodLen : 0,
  ];
}

export function predictFromCoefficients(
  state: PossessionEpState,
  coefficients: number[]
): number {
  const x = epvFeatureVector(state);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    y += (coefficients[i] ?? 0) * x[i]!;
  }
  return clamp(y, 0.7, 1.4);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Ordinary least squares with light ridge (λ) for stability.
 * Solves (X'X + λI) β = X'y for the design matrix of features.
 */
export function fitRidgeCoefficients(
  rows: Array<{ state: PossessionEpState; points: number }>,
  lambda = 1e-2
): number[] {
  const p = EPV_FEATURE_NAMES.length;
  if (rows.length === 0) {
    return Array.from({ length: p }, (_, i) => (i === 0 ? 1.08 : 0));
  }

  const xtx: number[][] = Array.from({ length: p }, () =>
    Array.from({ length: p }, () => 0)
  );
  const xty: number[] = Array.from({ length: p }, () => 0);

  for (const row of rows) {
    const x = epvFeatureVector(row.state);
    for (let i = 0; i < p; i++) {
      xty[i]! += x[i]! * row.points;
      for (let j = 0; j < p; j++) {
        xtx[i]![j]! += x[i]! * x[j]!;
      }
    }
  }

  for (let i = 0; i < p; i++) {
    xtx[i]![i]! += lambda;
  }

  return solveLinearSystem(xtx, xty);
}

/** Gaussian elimination with partial pivoting. */
function solveLinearSystem(aIn: number[][], bIn: number[]): number[] {
  const n = bIn.length;
  const a = aIn.map((row) => row.slice());
  const b = bIn.slice();

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(a[pivot]![col]!) < 1e-12) continue;
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    [b[col], b[pivot]] = [b[pivot]!, b[col]!];

    const div = a[col]![col]!;
    for (let j = col; j < n; j++) a[col]![j]! /= div;
    b[col]! /= div;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r]![col]!;
      for (let j = col; j < n; j++) a[r]![j]! -= f * a[col]![j]!;
      b[r]! -= f * b[col]!;
    }
  }
  return b;
}

export interface EpvCalibrationMetrics {
  n: number;
  mae: number;
  rmse: number;
  meanPredicted: number;
  meanActual: number;
}

export function evaluateEpv(
  rows: Array<{ state: PossessionEpState; points: number }>,
  coefficients: number[]
): EpvCalibrationMetrics {
  if (rows.length === 0) {
    return { n: 0, mae: 0, rmse: 0, meanPredicted: 0, meanActual: 0 };
  }
  let abs = 0;
  let sq = 0;
  let predSum = 0;
  let actSum = 0;
  for (const row of rows) {
    const pred = predictFromCoefficients(row.state, coefficients);
    const err = pred - row.points;
    abs += Math.abs(err);
    sq += err * err;
    predSum += pred;
    actSum += row.points;
  }
  const n = rows.length;
  return {
    n,
    mae: abs / n,
    rmse: Math.sqrt(sq / n),
    meanPredicted: predSum / n,
    meanActual: actSum / n,
  };
}
