/**
 * M11 ??fuse independent DRBL-P / LN / B into a published rating.
 *
 * Modes:
 * - **lite** ??reliability-weighted blend (fallback / small samples)
 * - **OOF stack** ??chronological K-fold ridge meta-model; published
 *   ratings use out-of-fold predictions (no in-sample fusion leak)
 *
 * Disagreement = SD(P, LN, B) is diagnostic ??do not auto-penalize.
 */

import { createHash } from "node:crypto";

export interface FusionInputs {
  drblP: number;
  drblLn: number;
  drblB?: number;
  possessions: number;
}

export interface FusionWeights {
  wP: number;
  wLn: number;
  wB: number;
}

export const DEFAULT_FUSION_WEIGHTS: FusionWeights = {
  wP: 0.55,
  wLn: 0.3,
  wB: 0.15,
};

/**
 * Reliability blend: more LN/B weight as possession sample grows, capped.
 * If B is absent/undefined, redistribute its weight to P+LN.
 */
export function fusePlayerRating(
  input: FusionInputs,
  weights: FusionWeights = DEFAULT_FUSION_WEIGHTS
): number {
  const hasB = input.drblB != null && Number.isFinite(input.drblB);
  const sampleBoost = Math.min(0.12, input.possessions / 4000);

  let wLn = Math.min(0.4, weights.wLn + sampleBoost * 0.6);
  let wB = hasB ? Math.min(0.25, weights.wB + sampleBoost * 0.4) : 0;
  let wP = 1 - wLn - wB;

  if (!hasB) {
    const denom = weights.wP + weights.wLn || 1;
    wP = (1 - wLn) * (weights.wP / denom);
    wLn = 1 - wP;
    wB = 0;
  }

  return wP * input.drblP + wLn * input.drblLn + wB * (input.drblB ?? 0);
}

/** Diagnostic: SD of independent estimators (do not auto-penalize). */
export function estimatorDisagreement(
  drblP: number,
  drblLn: number,
  drblB: number | null | undefined
): number {
  const xs =
    drblB != null && Number.isFinite(drblB)
      ? [drblP, drblLn, drblB]
      : [drblP, drblLn];
  if (xs.length === 0) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const var_ = xs.reduce((s, x) => s + (x - mean) * (x - mean), 0) / xs.length;
  return Math.sqrt(var_);
}

export interface FusionStackRow {
  playerId: string;
  drblP: number;
  drblLn: number;
  /** Null when behavioral model unavailable for this player. */
  drblB: number | null;
  /** Realized residual / 100 (stacking target). */
  targetPer100: number;
  possessions: number;
  asOfDate: string;
}

export interface FusionStackWeights {
  intercept: number;
  wP: number;
  wLn: number;
  wB: number;
}

export interface FusionModelArtifact {
  version: string;
  fittedAt: string;
  lambda: number;
  folds: number;
  /** Full-sample stack weights (diagnostics; published ratings use OOF). */
  weights: FusionStackWeights;
  /** Alias for clarity vs fold-specific OOF weights. */
  finalFitWeights?: FusionStackWeights;
  /** Non-negative renormalized view of full-sample weights. */
  simplexWeights: FusionWeights;
  train: { n: number; mae: number; rmse: number };
  holdout?: { n: number; mae: number; rmse: number };
  oof: {
    n: number;
    mae: number;
    rmse: number;
    /** Equal-weight baseline MAE on same OOF targets. */
    equalMae: number;
    /** Lite reliability-blend MAE on same OOF targets. */
    liteMae: number;
    improvedVsEqual: boolean;
    improvedVsLite: boolean;
  };
}

/** Per-fold OOF provenance (M16b instrumentation; does not change predictions). */
export interface OofFoldModel {
  foldId: number;
  lambda: number;
  nTrain: number;
  nTest: number;
  coefficients: FusionOofCoefficients;
  simplexWeights: FusionWeights;
}

export interface OofPredictionRecord {
  playerId: string;
  foldId: number | "lite_fallback";
  asOfDate: string;
  possessions: number;
  drblP: number;
  drblLn: number;
  drblB: number | null;
  targetPer100: number;
  oofPrediction: number;
  mode: "ridge_oof" | "lite_fallback";
  coefficients?: FusionOofCoefficients;
}

export interface OofProvenance {
  foldAssignmentVersion: string;
  foldAssignmentHash: string;
  foldModels: OofFoldModel[];
  predictions: OofPredictionRecord[];
  finalFitWeights: FusionStackWeights;
}

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

function featureVec(row: FusionStackRow): number[] {
  // [1, P, LN, B_or_0, hasB]
  return [1, row.drblP, row.drblLn, row.drblB ?? 0, row.drblB != null ? 1 : 0];
}

export function fitFusionRidge(
  rows: FusionStackRow[],
  options: { lambda?: number } = {}
): FusionStackWeights {
  const full = fitFusionRidgeFull(rows, options.lambda ?? 8);
  return {
    intercept: full.intercept,
    wP: full.wP,
    wLn: full.wLn,
    wB: full.wB,
  };
}

export function predictFusionStacked(
  row: Pick<FusionStackRow, "drblP" | "drblLn" | "drblB">,
  weights: FusionStackWeights
): number {
  return (
    weights.intercept +
    weights.wP * row.drblP +
    weights.wLn * row.drblLn +
    weights.wB * (row.drblB ?? 0)
  );
}

/** OOF ridge coefficients including hasB indicator weight. */
export interface FusionOofCoefficients {
  intercept: number;
  wP: number;
  wLn: number;
  wB: number;
  wHasB: number;
}

/** Internal alias. */
type FullBeta = FusionOofCoefficients;

/** Exported for M16c TRAIN-only fixed-fit scoring (same math as OOF fold fits). */
export function fitFusionRidgeFull(
  rows: FusionStackRow[],
  lambda: number
): FullBeta {
  const dim = 5;
  const xtx: number[][] = Array.from({ length: dim }, () =>
    Array.from({ length: dim }, () => 0)
  );
  const xty: number[] = Array.from({ length: dim }, () => 0);
  for (const row of rows) {
    const x = featureVec(row);
    const y = row.targetPer100;
    for (let i = 0; i < dim; i++) {
      xty[i]! += x[i]! * y;
      for (let j = 0; j < dim; j++) xtx[i]![j]! += x[i]! * x[j]!;
    }
  }
  for (let i = 1; i < dim; i++) xtx[i]![i]! += lambda;
  const beta = solveLinearSystem(xtx, xty);
  return {
    intercept: beta[0] ?? 0,
    wP: beta[1] ?? 0,
    wLn: beta[2] ?? 0,
    wB: beta[3] ?? 0,
    wHasB: beta[4] ?? 0,
  };
}

/** Predict with full OOF ridge coefficients including hasB indicator. */
export function predictFusionFull(
  row: FusionStackRow,
  beta: FullBeta
): number {
  const x = featureVec(row);
  return (
    beta.intercept +
    beta.wP * x[1]! +
    beta.wLn * x[2]! +
    beta.wB * x[3]! +
    beta.wHasB * x[4]!
  );
}

function maeRmse(
  rows: FusionStackRow[],
  pred: (r: FusionStackRow) => number
): { n: number; mae: number; rmse: number } {
  if (rows.length === 0) return { n: 0, mae: 0, rmse: 0 };
  let abs = 0;
  let sq = 0;
  for (const row of rows) {
    const err = pred(row) - row.targetPer100;
    abs += Math.abs(err);
    sq += err * err;
  }
  const n = rows.length;
  return { n, mae: abs / n, rmse: Math.sqrt(sq / n) };
}

function chronologicalFolds(
  rows: FusionStackRow[],
  folds: number
): FusionStackRow[][] {
  const sorted = rows
    .slice()
    .sort(
      (a, b) =>
        a.asOfDate.localeCompare(b.asOfDate) ||
        a.playerId.localeCompare(b.playerId)
    );
  const buckets: FusionStackRow[][] = Array.from({ length: folds }, () => []);
  for (let i = 0; i < sorted.length; i++) {
    buckets[i % folds]!.push(sorted[i]!);
  }
  return buckets;
}

export function toSimplexWeights(w: FusionStackWeights): FusionWeights {
  const raw = [Math.max(0, w.wP), Math.max(0, w.wLn), Math.max(0, w.wB)];
  const sum = raw[0]! + raw[1]! + raw[2]!;
  if (sum <= 1e-9) return { ...DEFAULT_FUSION_WEIGHTS };
  return {
    wP: raw[0]! / sum,
    wLn: raw[1]! / sum,
    wB: raw[2]! / sum,
  };
}

/**
 * Chronological K-fold OOF stacking. Returns artifact + per-player OOF fused
 * ratings (use these for published drbl100) + M16b provenance (predictions unchanged).
 */
export function fitFusionOof(
  rows: FusionStackRow[],
  options: { lambda?: number; folds?: number } = {}
): FusionModelArtifact & {
  oofRatingsPer100: Map<string, number>;
  oofProvenance: OofProvenance;
} {
  const lambda = options.lambda ?? 8;
  const folds = Math.max(2, Math.min(options.folds ?? 5, rows.length));
  const oofRatingsPer100 = new Map<string, number>();
  const oofPredPairs: { y: number; yhat: number; equal: number; lite: number }[] =
    [];
  const foldModels: OofFoldModel[] = [];
  const predictions: OofPredictionRecord[] = [];
  const foldAssignments: string[] = [];

  if (rows.length < 20) {
    for (const row of rows) {
      const fused = fusePlayerRating({
        drblP: row.drblP,
        drblLn: row.drblLn,
        drblB: row.drblB ?? undefined,
        possessions: row.possessions,
      });
      const pred = Number(fused.toFixed(2));
      oofRatingsPer100.set(row.playerId, pred);
      predictions.push({
        playerId: row.playerId,
        foldId: "lite_fallback",
        asOfDate: row.asOfDate,
        possessions: row.possessions,
        drblP: row.drblP,
        drblLn: row.drblLn,
        drblB: row.drblB,
        targetPer100: row.targetPer100,
        oofPrediction: pred,
        mode: "lite_fallback",
      });
      foldAssignments.push(`${row.playerId}|lite_fallback`);
    }
    const full = fitFusionRidgeFull(rows, lambda);
    const weights: FusionStackWeights = {
      intercept: full.intercept,
      wP: full.wP,
      wLn: full.wLn,
      wB: full.wB,
    };
    const foldAssignmentHash = createHash("sha256")
      .update(foldAssignments.sort().join("\n"))
      .digest("hex");
    return {
      version: "drbl-fusion-oof-v1",
      fittedAt: new Date().toISOString(),
      lambda,
      folds: 0,
      weights: {
        intercept: Math.round(weights.intercept * 1e6) / 1e6,
        wP: Math.round(weights.wP * 1e6) / 1e6,
        wLn: Math.round(weights.wLn * 1e6) / 1e6,
        wB: Math.round(weights.wB * 1e6) / 1e6,
      },
      finalFitWeights: {
        intercept: Math.round(weights.intercept * 1e6) / 1e6,
        wP: Math.round(weights.wP * 1e6) / 1e6,
        wLn: Math.round(weights.wLn * 1e6) / 1e6,
        wB: Math.round(weights.wB * 1e6) / 1e6,
      },
      simplexWeights: toSimplexWeights(weights),
      train: maeRmse(rows, (r) => predictFusionFull(r, full)),
      oof: {
        n: rows.length,
        mae: 0,
        rmse: 0,
        equalMae: 0,
        liteMae: 0,
        improvedVsEqual: false,
        improvedVsLite: false,
      },
      oofRatingsPer100,
      oofProvenance: {
        foldAssignmentVersion: "drbl-fusion-oof-chrono-mod-v1",
        foldAssignmentHash,
        foldModels: [],
        predictions,
        finalFitWeights: weights,
      },
    };
  }

  const buckets = chronologicalFolds(rows, folds);
  for (let f = 0; f < folds; f++) {
    const test = buckets[f]!;
    const train = buckets.flatMap((b, i) => (i === f ? [] : b));
    if (train.length < 10 || test.length === 0) continue;
    const beta = fitFusionRidgeFull(train, lambda);
    foldModels.push({
      foldId: f,
      lambda,
      nTrain: train.length,
      nTest: test.length,
      coefficients: { ...beta },
      simplexWeights: toSimplexWeights({
        intercept: beta.intercept,
        wP: beta.wP,
        wLn: beta.wLn,
        wB: beta.wB,
      }),
    });
    for (const row of test) {
      const yhat = predictFusionFull(row, beta);
      const pred = Number(yhat.toFixed(2));
      oofRatingsPer100.set(row.playerId, pred);
      predictions.push({
        playerId: row.playerId,
        foldId: f,
        asOfDate: row.asOfDate,
        possessions: row.possessions,
        drblP: row.drblP,
        drblLn: row.drblLn,
        drblB: row.drblB,
        targetPer100: row.targetPer100,
        oofPrediction: pred,
        mode: "ridge_oof",
        coefficients: { ...beta },
      });
      foldAssignments.push(`${row.playerId}|${f}`);
      const equal =
        row.drblB != null
          ? (row.drblP + row.drblLn + row.drblB) / 3
          : (row.drblP + row.drblLn) / 2;
      const lite = fusePlayerRating({
        drblP: row.drblP,
        drblLn: row.drblLn,
        drblB: row.drblB ?? undefined,
        possessions: row.possessions,
      });
      oofPredPairs.push({ y: row.targetPer100, yhat, equal, lite });
    }
  }

  for (const row of rows) {
    if (!oofRatingsPer100.has(row.playerId)) {
      const pred = Number(
        fusePlayerRating({
          drblP: row.drblP,
          drblLn: row.drblLn,
          drblB: row.drblB ?? undefined,
          possessions: row.possessions,
        }).toFixed(2)
      );
      oofRatingsPer100.set(row.playerId, pred);
      predictions.push({
        playerId: row.playerId,
        foldId: "lite_fallback",
        asOfDate: row.asOfDate,
        possessions: row.possessions,
        drblP: row.drblP,
        drblLn: row.drblLn,
        drblB: row.drblB,
        targetPer100: row.targetPer100,
        oofPrediction: pred,
        mode: "lite_fallback",
      });
      foldAssignments.push(`${row.playerId}|lite_fallback`);
    }
  }

  const full = fitFusionRidgeFull(rows, lambda);
  const weights: FusionStackWeights = {
    intercept: full.intercept,
    wP: full.wP,
    wLn: full.wLn,
    wB: full.wB,
  };

  const sorted = rows
    .slice()
    .sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));
  const cut = Math.floor(sorted.length * 0.8);
  const trainRows = sorted.slice(0, cut);
  const holdRows = sorted.slice(cut);
  const holdBeta =
    trainRows.length >= 10 ? fitFusionRidgeFull(trainRows, lambda) : full;

  function metricFromPairs(
    pairs: { y: number; pred: number }[]
  ): { n: number; mae: number; rmse: number } {
    if (pairs.length === 0) return { n: 0, mae: 0, rmse: 0 };
    let abs = 0;
    let sq = 0;
    for (const p of pairs) {
      const err = p.pred - p.y;
      abs += Math.abs(err);
      sq += err * err;
    }
    return {
      n: pairs.length,
      mae: abs / pairs.length,
      rmse: Math.sqrt(sq / pairs.length),
    };
  }

  const oofM = metricFromPairs(
    oofPredPairs.map((p) => ({ y: p.y, pred: p.yhat }))
  );
  const equalM = metricFromPairs(
    oofPredPairs.map((p) => ({ y: p.y, pred: p.equal }))
  );
  const liteM = metricFromPairs(
    oofPredPairs.map((p) => ({ y: p.y, pred: p.lite }))
  );

  const round3 = (x: number) => Math.round(x * 1000) / 1000;
  const foldAssignmentHash = createHash("sha256")
    .update(foldAssignments.sort().join("\n"))
    .digest("hex");

  const finalFitWeights = {
    intercept: Math.round(weights.intercept * 1e6) / 1e6,
    wP: Math.round(weights.wP * 1e6) / 1e6,
    wLn: Math.round(weights.wLn * 1e6) / 1e6,
    wB: Math.round(weights.wB * 1e6) / 1e6,
  };

  return {
    version: "drbl-fusion-oof-v1",
    fittedAt: new Date().toISOString(),
    lambda,
    folds,
    weights: finalFitWeights,
    finalFitWeights,
    simplexWeights: toSimplexWeights(weights),
    train: (() => {
      const m = maeRmse(trainRows.length >= 10 ? trainRows : rows, (r) =>
        predictFusionFull(r, holdBeta)
      );
      return { n: m.n, mae: round3(m.mae), rmse: round3(m.rmse) };
    })(),
    holdout:
      holdRows.length > 0
        ? (() => {
            const m = maeRmse(holdRows, (r) => predictFusionFull(r, holdBeta));
            return { n: m.n, mae: round3(m.mae), rmse: round3(m.rmse) };
          })()
        : undefined,
    oof: {
      n: oofM.n,
      mae: round3(oofM.mae),
      rmse: round3(oofM.rmse),
      equalMae: round3(equalM.mae),
      liteMae: round3(liteM.mae),
      improvedVsEqual: oofM.mae <= equalM.mae,
      improvedVsLite: oofM.mae <= liteM.mae,
    },
    oofRatingsPer100,
    oofProvenance: {
      foldAssignmentVersion: "drbl-fusion-oof-chrono-mod-v1",
      foldAssignmentHash,
      foldModels,
      predictions,
      finalFitWeights: weights,
    },
  };
}

/** Reconstruct OOF fused rate from serialized provenance (exact stored value). */
export function reconstructOofFusedRate(
  playerId: string,
  provenance: OofProvenance
): number | null {
  const rec = provenance.predictions.find((p) => p.playerId === playerId);
  return rec ? rec.oofPrediction : null;
}

/** Player-level OOF fusion trace (instrumentation only). */
export function traceOofFusion(
  playerId: string,
  provenance: OofProvenance
): OofPredictionRecord | null {
  return provenance.predictions.find((p) => p.playerId === playerId) ?? null;
}
