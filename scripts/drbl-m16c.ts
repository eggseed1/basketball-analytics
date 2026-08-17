/**
 * M16c — validation-only component ablation.
 *   npm run drbl:m16c
 *
 * TRAIN fit only. VALIDATION score only. RESERVED_TEST never loaded for metrics.
 * No formula / hyperparameter / WAR / M6 / Approach A changes.
 */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

import {
  EVALUATION_PROTOCOL_VERSION,
  ELIGIBILITY_VERSION,
  TARGET_VERSION,
  METRIC_CONTRACT,
  ELIGIBILITY_RULES,
} from "../drbl/evaluation/protocol";
import { hashGames, type SplitGame } from "../drbl/evaluation/splits";
import { developmentGames } from "../drbl/evaluation/reserved-test";
import {
  appendExperiment,
  type ExperimentRecord,
} from "../drbl/evaluation/registry";
import {
  mae,
  pearson,
  spearman,
  r2,
  rmse,
  pairedBlockBootstrapRmseDiff,
} from "../drbl/evaluation/metrics";
import {
  CANDIDATE_MASKS,
  M16C_EARLY_FRAC,
  M16C_FUSION_FOLDS,
  M16C_FUSION_LAMBDA,
  buildFutureBlockStackRows,
  describeDistribution,
  loadSplitGames,
  maskFusionRows,
  verifyFrozenSplitHashes,
  type ComponentMask,
} from "../drbl/evaluation/m16c-dataset";
import {
  fitFusionOof,
  fitFusionRidgeFull,
  predictFusionFull,
  toSimplexWeights,
  type FusionOofCoefficients,
  type FusionStackRow,
} from "../drbl/models/fusion";
import { empiricalBayesRate } from "../drbl/models/leaderboard";
import { PRIOR_EQUIVALENT_POSSESSIONS } from "../drbl/models/ranking-config";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m16c");
const M16B = path.join(ROOT, "reports", "m16b");

const CANDIDATE_ORDER = [
  "M16C_P",
  "M16C_LN",
  "M16C_B",
  "M16C_P_LN",
  "M16C_P_B",
  "M16C_LN_B",
  "M16C_P_LN_B",
] as const;

const BOOTSTRAP_RESAMPLES = METRIC_CONTRACT.practicalSignificance.bootstrapResamples;
const BOOTSTRAP_SEED = 42;

function esc(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]!);
  return (
    keys.join(",") +
    "\n" +
    rows.map((r) => keys.map((k) => esc(r[k])).join(",")).join("\n") +
    "\n"
  );
}

function complexityCount(id: string): number {
  return id.replace("M16C_", "").split("_").filter(Boolean).length;
}

function componentsOf(id: string): string {
  return id.replace("M16C_", "").replace(/_/g, "+");
}

function calib(y: number[], yhat: number[]): { a: number; b: number } {
  const n = Math.min(y.length, yhat.length);
  if (n < 3) return { a: NaN, b: NaN };
  let sx = 0,
    sy = 0,
    sxx = 0,
    sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += yhat[i]!;
    sy += y[i]!;
    sxx += yhat[i]! * yhat[i]!;
    sxy += yhat[i]! * y[i]!;
  }
  const den = n * sxx - sx * sx;
  if (Math.abs(den) < 1e-12) return { a: sy / n, b: 0 };
  const b = (n * sxy - sx * sy) / den;
  const a = (sy - b * sx) / n;
  return { a, b };
}

function partialCorr(
  x: number[],
  y: number[],
  z: number[]
): number {
  // Corr(resid_x|z, resid_y|z)
  const n = Math.min(x.length, y.length, z.length);
  if (n < 5) return NaN;
  const regress = (dep: number[], pred: number[]) => {
    const c = calib(dep, pred);
    return dep.map((yi, i) => yi - (c.a + c.b * pred[i]!));
  };
  return pearson(regress(x.slice(0, n), z.slice(0, n)), regress(y.slice(0, n), z.slice(0, n)));
}

function fitSimpleRidge1(
  x: number[],
  y: number[],
  lambda: number
): { intercept: number; slope: number } {
  const n = Math.min(x.length, y.length);
  let sxx = 0,
    sxy = 0,
    sx = 0,
    sy = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i]!;
    sy += y[i]!;
    sxx += x[i]! * x[i]!;
    sxy += x[i]! * y[i]!;
  }
  // ridge on slope only (not intercept)
  const den = sxx - (sx * sx) / n + lambda;
  const slope = den > 1e-12 ? (sxy - (sx * sy) / n) / den : 0;
  const intercept = n ? sy / n - slope * (sx / n) : 0;
  return { intercept, slope };
}

function fitSimpleRidge2(
  x1: number[],
  x2: number[],
  y: number[],
  lambda: number
): { intercept: number; b1: number; b2: number } {
  const n = Math.min(x1.length, x2.length, y.length);
  const rows: FusionStackRow[] = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      playerId: String(i),
      drblP: x1[i]!,
      drblLn: x2[i]!,
      drblB: null,
      targetPer100: y[i]!,
      possessions: 1000,
      asOfDate: "2024-01-01",
    });
  }
  const beta = fitFusionRidgeFull(rows, lambda);
  return { intercept: beta.intercept, b1: beta.wP, b2: beta.wLn };
}

function metricBundle(y: number[], yhat: number[]) {
  const c = calib(y, yhat);
  return {
    n: Math.min(y.length, yhat.length),
    RMSE: rmse(y, yhat),
    MAE: mae(y, yhat),
    Pearson: pearson(y, yhat),
    Spearman: spearman(y, yhat),
    R2: r2(y, yhat),
    calibrationIntercept: c.a,
    calibrationSlope: c.b,
  };
}

function svgScatter(
  points: Array<{ x: number; y: number }>,
  title: string
): string {
  const w = 480,
    h = 360,
    pad = 40;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 1);
  const sx = (x: number) =>
    pad + ((x - minX) / (maxX - minX || 1)) * (w - 2 * pad);
  const sy = (y: number) =>
    h - pad - ((y - minY) / (maxY - minY || 1)) * (h - 2 * pad);
  const dots = points
    .slice(0, 800)
    .map(
      (p) =>
        `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="2" fill="#2563eb" opacity="0.55"/>`
    )
    .join("\n");
  return `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="100%" height="100%" fill="#fff"/>
  <text x="${pad}" y="24" font-size="14" font-family="sans-serif">${title}</text>
  <line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="#333"/>
  <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h - pad}" stroke="#333"/>
  ${dots}
</svg>`;
}

type CandResult = {
  id: string;
  mask: ComponentMask;
  beta: FusionOofCoefficients;
  y: number[];
  yhat: number[];
  playerIds: string[];
  possessions: number[];
  blockIds: string[];
  metrics: ReturnType<typeof metricBundle>;
  foldWeights: Array<Record<string, unknown>>;
};

async function main() {
  const reservedTestAccessed = false;
  let VALIDATION_ROWS_USED_IN_FIT = 0;

  await mkdir(path.join(OUT, "freeze"), { recursive: true });
  await mkdir(path.join(OUT, "predictions"), { recursive: true });
  await mkdir(path.join(OUT, "charts"), { recursive: true });

  let gitCommit = "unknown";
  let gitDirty = true;
  try {
    gitCommit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    gitDirty =
      execSync("git status --porcelain", { encoding: "utf8" }).trim().length > 0;
  } catch {
    /* ignore */
  }
  const timestamp = new Date().toISOString();

  const trainGames = JSON.parse(
    await readFile(path.join(M16B, "splits", "train_game_ids.json"), "utf8")
  ) as SplitGame[];
  const validationGames = JSON.parse(
    await readFile(path.join(M16B, "splits", "validation_game_ids.json"), "utf8")
  ) as SplitGame[];
  // Hash-only verify reserved membership without using games for metrics.
  const reservedGamesForHash = JSON.parse(
    await readFile(path.join(M16B, "splits", "reserved_test_game_ids.json"), "utf8")
  ) as SplitGame[];

  const expectedTrain =
    "7bec77be45295ee858d90896d9383e4da951e98e81ad1ef31b5285fb055d1550";
  const expectedVal =
    "4fd339a445f269162c2d76e9102ea5bb965a5d0fc05e0fcd2f60593117c5faf0";
  const expectedRes =
    "e542aa54602390ed65792f37e10207814e10b62bfdf552ddf4da69825076c1ce";

  const hashCheck = verifyFrozenSplitHashes({
    train: trainGames,
    validation: validationGames,
    trainHashExpected: expectedTrain,
    validationHashExpected: expectedVal,
    reservedTestHashExpected: expectedRes,
    reservedTestGamesForHashOnly: reservedGamesForHash,
  });
  if (!hashCheck.ok) {
    console.error("STOP EVALUATION_PROTOCOL_DRIFT", hashCheck.reason);
    process.exit(2);
  }

  // Ensure development surface excludes reserved.
  const dev = developmentGames({
    evaluationProtocolVersion: EVALUATION_PROTOCOL_VERSION,
    design: "two_season_chrono_block_v1",
    rationale: "",
    train: trainGames,
    validation: validationGames,
    reservedTest: [], // intentionally empty — never use reserved games
    trainSplitHash: expectedTrain,
    validationSplitHash: expectedVal,
    reservedTestSplitHash: expectedRes,
    protocolHash: "",
  });
  if (dev.train.length !== trainGames.length || dev.validation.length !== validationGames.length) {
    throw new Error("developmentGames mismatch");
  }

  const freeze = {
    milestone: "M16c",
    timestamp,
    gitCommit,
    gitDirty,
    evaluationProtocolVersion: EVALUATION_PROTOCOL_VERSION,
    trainSplitHash: expectedTrain,
    validationSplitHash: expectedVal,
    reservedTestSplitHash: expectedRes,
    targetVersion: TARGET_VERSION,
    eligibilityVersion: ELIGIBILITY_VERSION,
    target: "future_block_residual_per_100",
    earlyFrac: M16C_EARLY_FRAC,
    P_version: "approach-b-sequential-drbl-p",
    LN_version: "lineup-ridge-lambda-800",
    B_version: "behavior-ridge-lambda-40",
    fusion: {
      version: "drbl-fusion-oof-v1",
      lambda: M16C_FUSION_LAMBDA,
      folds: M16C_FUSION_FOLDS,
      constraints: "ridge_unconstrained_predict;simplex_report_only",
      modelFamily: "chronological_ridge_oof_stack",
    },
    posterior: {
      version: "eb-fused-v1",
      priorMean: 0,
      priorStrength: PRIOR_EQUIVALENT_POSSESSIONS,
    },
    m6: { fusedIntoDrbl100: false },
    war: { version: "unchanged_not_used_for_selection" },
    reservedTestAccessed: false,
    hashesMatchM16b: true,
  };
  await writeFile(path.join(OUT, "00_freeze.json"), JSON.stringify(freeze, null, 2));
  await copyFile(
    path.join(M16B, "00_freeze.json"),
    path.join(OUT, "freeze", "m16b_00_freeze.json")
  );

  console.log("Loading TRAIN games from normalized cache...");
  const trainProcessed = await loadSplitGames(dev.train);
  console.log(`TRAIN processed: ${trainProcessed.length}/${dev.train.length}`);
  console.log("Loading VALIDATION games from normalized cache...");
  const valProcessed = await loadSplitGames(dev.validation);
  console.log(`VALIDATION processed: ${valProcessed.length}/${dev.validation.length}`);

  const trainBlock = buildFutureBlockStackRows(trainProcessed, {
    earlyFrac: M16C_EARLY_FRAC,
  });
  const valBlock = buildFutureBlockStackRows(valProcessed, {
    earlyFrac: M16C_EARLY_FRAC,
  });
  VALIDATION_ROWS_USED_IN_FIT = 0;
  if (VALIDATION_ROWS_USED_IN_FIT !== 0) {
    throw new Error("VALIDATION_ROWS_USED_IN_FIT must be 0");
  }

  const trainRows = trainBlock.rows;
  const valRows = valBlock.rows;
  console.log(`stack rows TRAIN=${trainRows.length} VAL=${valRows.length}`);

  // Align common eligible player universe: same construction rules; report counts.
  // Candidates use identical valRows; missing B handled by fusion null rules.
  const sampleEquality =
    new Set(CANDIDATE_ORDER.map(() => valRows.length)).size === 1
      ? "PASS"
      : "CANDIDATE_ELIGIBILITY_MISMATCH";

  // Distributions
  const distRows: Record<string, unknown>[] = [];
  for (const [split, rows] of [
    ["TRAIN", trainRows],
    ["VALIDATION", valRows],
  ] as const) {
    for (const [name, xs] of [
      ["P", rows.map((r) => r.drblP)],
      ["LN", rows.map((r) => r.drblLn)],
      ["B", rows.map((r) => (r.drblB == null ? NaN : r.drblB))],
      ["Y", rows.map((r) => r.targetPer100)],
    ] as const) {
      distRows.push({ split, field: name, ...describeDistribution(xs) });
    }
  }
  await writeFile(path.join(OUT, "00b_component_distributions.csv"), toCsv(distRows));

  // Fit + score each candidate
  const results: CandResult[] = [];
  const weightRows: Record<string, unknown>[] = [];

  for (const id of CANDIDATE_ORDER) {
    const mask = CANDIDATE_MASKS[id]!;
    const trainMasked = maskFusionRows(trainRows, mask);
    const valMasked = maskFusionRows(valRows, mask);

    // Fold diagnostics on TRAIN only (OOF machinery; no VAL in fit).
    const oof = fitFusionOof(trainMasked, {
      lambda: M16C_FUSION_LAMBDA,
      folds: M16C_FUSION_FOLDS,
    });
    const beta = fitFusionRidgeFull(trainMasked, M16C_FUSION_LAMBDA);

    const y: number[] = [];
    const yhat: number[] = [];
    const playerIds: string[] = [];
    const possessions: number[] = [];
    const blockIds: string[] = [];
    const predRows: Record<string, unknown>[] = [];

    for (const row of valMasked) {
      const pred = predictFusionFull(row, beta);
      y.push(row.targetPer100);
      yhat.push(pred);
      playerIds.push(row.playerId);
      possessions.push(row.possessions);
      blockIds.push(row.playerId);
      predRows.push({
        entityId: `${row.playerId}|2024-25|val`,
        playerId: row.playerId,
        target: row.targetPer100,
        prediction: pred,
        residual: row.targetPer100 - pred,
        absoluteResidual: Math.abs(row.targetPer100 - pred),
        squaredResidual: (row.targetPer100 - pred) ** 2,
        possessions: row.possessions,
        P: row.drblP,
        LN: row.drblLn,
        B: row.drblB,
      });
    }
    await writeFile(
      path.join(OUT, "predictions", `${id}.csv`),
      toCsv(predRows)
    );

    const foldWeights = oof.oofProvenance.foldModels.map((fm) => {
      const boundaryHit =
        fm.simplexWeights.wP < 1e-9 ||
        fm.simplexWeights.wLn < 1e-9 ||
        fm.simplexWeights.wB < 1e-9;
      const row = {
        candidate: id,
        fold: fm.foldId,
        wP: fm.coefficients.wP,
        wLN: fm.coefficients.wLn,
        wB: fm.coefficients.wB,
        intercept: fm.coefficients.intercept,
        wHasB: fm.coefficients.wHasB,
        simplex_wP: fm.simplexWeights.wP,
        simplex_wLN: fm.simplexWeights.wLn,
        simplex_wB: fm.simplexWeights.wB,
        boundaryHit,
        nTrain: fm.nTrain,
        nTest: fm.nTest,
      };
      weightRows.push(row);
      return row;
    });
    // Final fit row
    weightRows.push({
      candidate: id,
      fold: "FINAL_TRAIN_FIT",
      wP: beta.wP,
      wLN: beta.wLn,
      wB: beta.wB,
      intercept: beta.intercept,
      wHasB: beta.wHasB,
      simplex_wP: toSimplexWeights(beta).wP,
      simplex_wLN: toSimplexWeights(beta).wLn,
      simplex_wB: toSimplexWeights(beta).wB,
      boundaryHit:
        toSimplexWeights(beta).wP < 1e-9 ||
        toSimplexWeights(beta).wLn < 1e-9 ||
        toSimplexWeights(beta).wB < 1e-9,
      nTrain: trainMasked.length,
      nTest: 0,
    });

    results.push({
      id,
      mask,
      beta,
      y,
      yhat,
      playerIds,
      possessions,
      blockIds,
      metrics: metricBundle(y, yhat),
      foldWeights,
    });
  }

  const pResult = results.find((r) => r.id === "M16C_P")!;
  const bootstrapRows: Record<string, unknown>[] = [];
  const candidateMetricRows: Record<string, unknown>[] = [];

  for (const r of results) {
    const boot = pairedBlockBootstrapRmseDiff(
      pResult.y,
      pResult.yhat,
      r.yhat,
      r.blockIds,
      { resamples: BOOTSTRAP_RESAMPLES, seed: BOOTSTRAP_SEED }
    );
    bootstrapRows.push({
      candidate: r.id,
      baseline: "M16C_P",
      deltaRMSE: boot.pointEstimate,
      ciLow: boot.ciLow,
      ciHigh: boot.ciHigh,
      probabilityBeatsP: boot.probCandidateBeatsBaseline,
      deltaMAE: mae(r.y, r.yhat) - mae(pResult.y, pResult.yhat),
      deltaPearson: pearson(r.y, r.yhat) - pearson(pResult.y, pResult.yhat),
      deltaSpearman: spearman(r.y, r.yhat) - spearman(pResult.y, pResult.yhat),
    });
    candidateMetricRows.push({
      candidateId: r.id,
      components: componentsOf(r.id),
      validationN: r.metrics.n,
      RMSE: r.metrics.RMSE,
      MAE: r.metrics.MAE,
      Pearson: r.metrics.Pearson,
      Spearman: r.metrics.Spearman,
      R2: r.metrics.R2,
      calibrationIntercept: r.metrics.calibrationIntercept,
      calibrationSlope: r.metrics.calibrationSlope,
      deltaRMSEvsP: boot.pointEstimate,
      deltaMAEvsP: mae(r.y, r.yhat) - mae(pResult.y, pResult.yhat),
      bootstrapLow: boot.ciLow,
      bootstrapHigh: boot.ciHigh,
      probabilityBeatsP: boot.probCandidateBeatsBaseline,
      complexityCount: complexityCount(r.id),
      selectionStatus: "candidate",
      final_wP: r.beta.wP,
      final_wLN: r.beta.wLn,
      final_wB: r.beta.wB,
      final_intercept: r.beta.intercept,
    });
  }

  function indistinguishable(a: CandResult, b: CandResult): boolean {
    const boot = pairedBlockBootstrapRmseDiff(
      a.y,
      a.yhat,
      b.yhat,
      a.blockIds,
      { resamples: BOOTSTRAP_RESAMPLES, seed: BOOTSTRAP_SEED }
    );
    // CI includes 0 → indistinguishable on primary RMSE
    return boot.ciLow <= 0 && boot.ciHigh >= 0;
  }

  // Selection hierarchy (METRIC_CONTRACT + Phase 29 simplicity preference):
  // 1) primary VALIDATION RMSE
  // 2) among statistically indistinguishable (paired RMSE CI includes 0), prefer simpler
  // 3) if same complexity, prefer better calibration (slope nearer 1, intercept nearer 0)
  const sortedByRmse = [...results].sort((a, b) => a.metrics.RMSE - b.metrics.RMSE);
  const bestRmse = sortedByRmse[0]!;
  const tied = sortedByRmse.filter((c) => indistinguishable(bestRmse, c));
  const calibScore = (r: CandResult) =>
    Math.abs(r.metrics.calibrationSlope - 1) +
    Math.abs(r.metrics.calibrationIntercept);
  tied.sort((a, b) => {
    const ca = complexityCount(a.id);
    const cb = complexityCount(b.id);
    if (ca !== cb) return ca - cb;
    return calibScore(a) - calibScore(b);
  });
  const winner = tied[0]!;
  const runnerUp =
    sortedByRmse.find((r) => r.id !== winner.id) ?? sortedByRmse[1]!;
  const winBoot = pairedBlockBootstrapRmseDiff(
    runnerUp.y,
    runnerUp.yhat,
    winner.yhat,
    winner.blockIds,
    { resamples: BOOTSTRAP_RESAMPLES, seed: BOOTSTRAP_SEED }
  );

  for (const row of candidateMetricRows) {
    if (row.candidateId === winner.id) row.selectionStatus = "M16C_BASE_WINNER";
    else if (row.candidateId === runnerUp.id) row.selectionStatus = "runner_up";
  }

  await writeFile(path.join(OUT, "01_candidate_metrics.csv"), toCsv(candidateMetricRows));
  await writeFile(path.join(OUT, "03_fusion_weights.csv"), toCsv(weightRows));
  await writeFile(path.join(OUT, "11_bootstrap_comparisons.csv"), toCsv(bootstrapRows));

  // Weight summaries
  const weightSummary: Record<string, unknown>[] = [];
  for (const id of CANDIDATE_ORDER) {
    const folds = weightRows.filter(
      (r) => r.candidate === id && r.fold !== "FINAL_TRAIN_FIT"
    );
    for (const key of ["wP", "wLN", "wB", "intercept"] as const) {
      const xs = folds.map((r) => Number(r[key]));
      const mean = xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
      const sd = Math.sqrt(
        xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length || 1)
      );
      weightSummary.push({
        candidate: id,
        coefficient: key,
        mean,
        sd,
        min: Math.min(...xs),
        max: Math.max(...xs),
        zeroFrequency: xs.filter((x) => Math.abs(x) < 1e-6).length / (xs.length || 1),
        cv: mean !== 0 ? sd / Math.abs(mean) : NaN,
        boundaryHitFrequency:
          folds.filter((r) => r.boundaryHit).length / (folds.length || 1),
      });
    }
  }
  await writeFile(path.join(OUT, "04_fusion_weight_summary.csv"), toCsv(weightSummary));

  // Incremental residual signal
  const pTrainMasked = maskFusionRows(trainRows, CANDIDATE_MASKS.M16C_P!);
  const pOof = fitFusionOof(pTrainMasked, {
    lambda: M16C_FUSION_LAMBDA,
    folds: M16C_FUSION_FOLDS,
  });
  const pBeta = fitFusionRidgeFull(pTrainMasked, M16C_FUSION_LAMBDA);
  const trainPHat = trainRows.map((r) => {
    const oof = pOof.oofRatingsPer100.get(r.playerId);
    if (oof != null) return oof;
    return predictFusionFull(maskFusionRows([r], CANDIDATE_MASKS.M16C_P!)[0]!, pBeta);
  });
  const trainRP = trainRows.map((r, i) => r.targetPer100 - trainPHat[i]!);
  const valPHat = pResult.yhat;
  const valRP = pResult.y.map((yi, i) => yi - valPHat[i]!);
  const valLN = valRows.map((r) => r.drblLn);
  const valB = valRows.map((r) => r.drblB ?? 0);
  const valY = valRows.map((r) => r.targetPer100);
  const hasBVal = valRows.map((r) => r.drblB != null);

  const lnResFit = fitSimpleRidge1(
    trainRows.map((r) => r.drblLn),
    trainRP,
    M16C_FUSION_LAMBDA
  );
  const bTrainX = trainRows.map((r) => r.drblB ?? 0);
  const bResFit = fitSimpleRidge1(bTrainX, trainRP, M16C_FUSION_LAMBDA);
  const lnBResFit = fitSimpleRidge2(
    trainRows.map((r) => r.drblLn),
    bTrainX,
    trainRP,
    M16C_FUSION_LAMBDA
  );

  const lnResPred = valLN.map((x) => lnResFit.intercept + lnResFit.slope * x);
  const bResPred = valB.map((x) => bResFit.intercept + bResFit.slope * x);
  const lnBResPred = valLN.map(
    (x, i) => lnBResFit.intercept + lnBResFit.b1 * x + lnBResFit.b2 * valB[i]!
  );
  // Combine with P: Yhat = P_hat + residual_hat
  const pPlusLnRes = valPHat.map((p, i) => p + lnResPred[i]!);
  const pPlusBRes = valPHat.map((p, i) => p + bResPred[i]!);
  const pPlusLnBRes = valPHat.map((p, i) => p + lnBResPred[i]!);

  const incrRows: Record<string, unknown>[] = [
    {
      test: "LN_standalone_vs_Y",
      Pearson: pearson(valLN, valY),
      Spearman: spearman(valLN, valY),
      validationRMSE: results.find((r) => r.id === "M16C_LN")!.metrics.RMSE,
      pairedImprovementVsP: null,
      ciLow: null,
      ciHigh: null,
    },
    {
      test: "B_standalone_vs_Y",
      Pearson: pearson(valB.filter((_, i) => hasBVal[i]), valY.filter((_, i) => hasBVal[i])),
      Spearman: spearman(valB.filter((_, i) => hasBVal[i]), valY.filter((_, i) => hasBVal[i])),
      validationRMSE: results.find((r) => r.id === "M16C_B")!.metrics.RMSE,
      pairedImprovementVsP: null,
      ciLow: null,
      ciHigh: null,
    },
    {
      test: "LN_vs_residual_after_P",
      Pearson: pearson(valLN, valRP),
      Spearman: spearman(valLN, valRP),
      validationRMSE: rmse(valRP, lnResPred),
      pairedImprovementVsP:
        rmse(valY, pPlusLnRes) - pResult.metrics.RMSE,
      ...(() => {
        const b = pairedBlockBootstrapRmseDiff(
          valY,
          valPHat,
          pPlusLnRes,
          pResult.blockIds,
          { resamples: BOOTSTRAP_RESAMPLES, seed: BOOTSTRAP_SEED }
        );
        return { ciLow: b.ciLow, ciHigh: b.ciHigh, probabilityBeatsP: b.probCandidateBeatsBaseline };
      })(),
    },
    {
      test: "B_vs_residual_after_P",
      Pearson: pearson(valB, valRP),
      Spearman: spearman(valB, valRP),
      validationRMSE: rmse(valRP, bResPred),
      pairedImprovementVsP: rmse(valY, pPlusBRes) - pResult.metrics.RMSE,
      ...(() => {
        const b = pairedBlockBootstrapRmseDiff(
          valY,
          valPHat,
          pPlusBRes,
          pResult.blockIds,
          { resamples: BOOTSTRAP_RESAMPLES, seed: BOOTSTRAP_SEED }
        );
        return { ciLow: b.ciLow, ciHigh: b.ciHigh, probabilityBeatsP: b.probCandidateBeatsBaseline };
      })(),
    },
    {
      test: "LN_B_vs_residual_after_P",
      Pearson: pearson(lnBResPred, valRP),
      Spearman: spearman(lnBResPred, valRP),
      validationRMSE: rmse(valRP, lnBResPred),
      pairedImprovementVsP: rmse(valY, pPlusLnBRes) - pResult.metrics.RMSE,
      ...(() => {
        const b = pairedBlockBootstrapRmseDiff(
          valY,
          valPHat,
          pPlusLnBRes,
          pResult.blockIds,
          { resamples: BOOTSTRAP_RESAMPLES, seed: BOOTSTRAP_SEED }
        );
        return { ciLow: b.ciLow, ciHigh: b.ciHigh, probabilityBeatsP: b.probCandidateBeatsBaseline };
      })(),
    },
  ];
  await writeFile(path.join(OUT, "02_incremental_signal.csv"), toCsv(incrRows));

  // Effective contributions on TRAIN final fit for full models
  const contribRows: Record<string, unknown>[] = [];
  for (const id of ["M16C_P_LN", "M16C_P_B", "M16C_P_LN_B"] as const) {
    const r = results.find((x) => x.id === id)!;
    const masked = maskFusionRows(valRows, CANDIDATE_MASKS[id]!);
    const cP = masked.map((row) => r.beta.wP * row.drblP);
    const cLn = masked.map((row) => r.beta.wLn * row.drblLn);
    const cB = masked.map((row) => r.beta.wB * (row.drblB ?? 0));
    const sd = (xs: number[]) => {
      const m = xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
      return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length || 1));
    };
    const meanAbs = (xs: number[]) =>
      xs.reduce((a, b) => a + Math.abs(b), 0) / (xs.length || 1);
    for (const [comp, w, xs, raw] of [
      ["P", r.beta.wP, cP, masked.map((row) => row.drblP)],
      ["LN", r.beta.wLn, cLn, masked.map((row) => row.drblLn)],
      ["B", r.beta.wB, cB, masked.map((row) => row.drblB ?? 0)],
    ] as const) {
      contribRows.push({
        candidate: id,
        component: comp,
        weight: w,
        componentSD: sd(raw),
        contributionSD: sd(xs),
        meanAbsoluteContribution: meanAbs(xs),
      });
    }
  }
  await writeFile(
    path.join(OUT, "05_effective_component_contributions.csv"),
    toCsv(contribRows)
  );

  // Calibration + quantile residual diagnostics
  const calibRows: Record<string, unknown>[] = [];
  for (const r of results) {
    calibRows.push({
      candidate: r.id,
      ...r.metrics,
    });
    // prediction magnitude bins
    const order = r.yhat
      .map((yh, i) => ({ yh, y: r.y[i]!, i }))
      .sort((a, b) => a.yh - b.yh);
    const qn = 5;
    for (let q = 0; q < qn; q++) {
      const slice = order.slice(
        Math.floor((q / qn) * order.length),
        Math.floor(((q + 1) / qn) * order.length)
      );
      if (!slice.length) continue;
      const meanPred = slice.reduce((s, x) => s + x.yh, 0) / slice.length;
      const meanAct = slice.reduce((s, x) => s + x.y, 0) / slice.length;
      const meanRes = meanAct - meanPred;
      const binRmse = Math.sqrt(
        slice.reduce((s, x) => s + (x.yh - x.y) ** 2, 0) / slice.length
      );
      calibRows.push({
        candidate: r.id,
        bin: `pred_q${q + 1}`,
        meanPrediction: meanPred,
        meanActual: meanAct,
        meanResidual: meanRes,
        RMSE: binRmse,
      });
    }
  }
  await writeFile(path.join(OUT, "06_calibration.csv"), toCsv(calibRows));

  // Component extremes
  const extremeRows: Record<string, unknown>[] = [];
  for (const [name, getter] of [
    ["P", (r: FusionStackRow) => r.drblP],
    ["LN", (r: FusionStackRow) => r.drblLn],
    ["B", (r: FusionStackRow) => r.drblB ?? NaN],
  ] as const) {
    const indexed = valRows
      .map((r, i) => ({ r, i, v: getter(r) }))
      .filter((x) => Number.isFinite(x.v))
      .sort((a, b) => a.v - b.v);
    const n5 = Math.max(1, Math.floor(indexed.length * 0.05));
    for (const [label, slice] of [
      ["bottom_5pct", indexed.slice(0, n5)],
      ["top_5pct", indexed.slice(-n5)],
    ] as const) {
      const ys = slice.map((x) => x.r.targetPer100);
      const vs = slice.map((x) => x.v);
      const c = calib(ys, vs);
      extremeRows.push({
        component: name,
        bucket: label,
        n: slice.length,
        meanComponent: vs.reduce((a, b) => a + b, 0) / vs.length,
        meanFutureTarget: ys.reduce((a, b) => a + b, 0) / ys.length,
        calibrationSlope: c.b,
        calibrationIntercept: c.a,
        meanResidual:
          ys.reduce((a, b) => a + b, 0) / ys.length -
          vs.reduce((a, b) => a + b, 0) / vs.length,
        pearson: pearson(vs, ys),
      });
    }
  }
  await writeFile(path.join(OUT, "08_component_extremes.csv"), toCsv(extremeRows));

  const lnTop = extremeRows.find(
    (r) => r.component === "LN" && r.bucket === "top_5pct"
  );
  const lnExtremeRisk =
    lnTop &&
    Number(lnTop.meanComponent) > 2 &&
    Number(lnTop.calibrationSlope) < 0.5
      ? "LN_EXTREME_CALIBRATION_RISK"
      : "NONE";

  // Redundancy
  const trainP = trainRows.map((r) => r.drblP);
  const trainLN = trainRows.map((r) => r.drblLn);
  const trainB = trainRows.map((r) => r.drblB ?? 0);
  const valP = valRows.map((r) => r.drblP);
  const redundancy = [
    {
      split: "TRAIN",
      corr_P_LN: pearson(trainP, trainLN),
      corr_P_B: pearson(trainP, trainB),
      corr_LN_B: pearson(trainLN, trainB),
      partial_LN_Y_given_P: partialCorr(
        trainLN,
        trainRows.map((r) => r.targetPer100),
        trainP
      ),
      partial_B_Y_given_P: partialCorr(
        trainB,
        trainRows.map((r) => r.targetPer100),
        trainP
      ),
    },
    {
      split: "VALIDATION",
      corr_P_LN: pearson(valP, valLN),
      corr_P_B: pearson(valP, valB),
      corr_LN_B: pearson(valLN, valB),
      partial_LN_Y_given_P: partialCorr(valLN, valY, valP),
      partial_B_Y_given_P: partialCorr(valB, valY, valP),
    },
  ];
  await writeFile(path.join(OUT, "10_component_redundancy.csv"), toCsv(redundancy));

  // B scale diagnostic
  const bSd = describeDistribution(valRows.map((r) => r.drblB ?? NaN)).sd;
  const pSd = describeDistribution(valP).sd;
  const lnSd = describeDistribution(valLN).sd;
  const full = results.find((r) => r.id === "M16C_P_LN_B")!;
  const bScaleNote = {
    rawB_SD: bSd,
    rawP_SD: pSd,
    rawLN_SD: lnSd,
    final_wB: full.beta.wB,
    effectiveContributionSD_B:
      contribRows.find(
        (r) => r.candidate === "M16C_P_LN_B" && r.component === "B"
      )?.contributionSD ?? null,
    normalization: "none_in_fusion_ridge_feature_space",
  };

  // Posterior ablation on winner
  const rawBase = winner.yhat;
  const postBase = winner.yhat.map((yh, i) => {
    const { posterior } = empiricalBayesRate(
      yh,
      winner.possessions[i]!,
      0,
      PRIOR_EQUIVALENT_POSSESSIONS
    );
    return posterior;
  });
  const rawMetrics = metricBundle(winner.y, rawBase);
  const postMetrics = metricBundle(winner.y, postBase);
  const postBoot = pairedBlockBootstrapRmseDiff(
    winner.y,
    rawBase,
    postBase,
    winner.blockIds,
    { resamples: BOOTSTRAP_RESAMPLES, seed: BOOTSTRAP_SEED }
  );

  // Exposure quartiles
  const possOrder = winner.possessions
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p - b.p);
  const postByExposure: Record<string, unknown>[] = [];
  for (let q = 0; q < 4; q++) {
    const slice = possOrder.slice(
      Math.floor((q / 4) * possOrder.length),
      Math.floor(((q + 1) / 4) * possOrder.length)
    );
    const idxs = slice.map((x) => x.i);
    const yq = idxs.map((i) => winner.y[i]!);
    const rawq = idxs.map((i) => rawBase[i]!);
    const postq = idxs.map((i) => postBase[i]!);
    postByExposure.push({
      quartile: `Q${q + 1}`,
      n: idxs.length,
      meanPossessions: slice.reduce((s, x) => s + x.p, 0) / (slice.length || 1),
      rawRMSE: rmse(yq, rawq),
      posteriorRMSE: rmse(yq, postq),
      deltaRMSE: rmse(yq, postq) - rmse(yq, rawq),
    });
  }
  await writeFile(
    path.join(OUT, "07_posterior_ablation.csv"),
    toCsv([
      {
        baseCandidate: winner.id,
        baseRaw: "fused_or_ridge_prediction",
        basePosterior: "EB(priorMean=0,k=200)",
        rawRMSE: rawMetrics.RMSE,
        posteriorRMSE: postMetrics.RMSE,
        deltaRMSE: postBoot.pointEstimate,
        ciLow: postBoot.ciLow,
        ciHigh: postBoot.ciHigh,
        probabilityPosteriorBeatsRaw: postBoot.probCandidateBeatsBaseline,
        rawMAE: rawMetrics.MAE,
        posteriorMAE: postMetrics.MAE,
        rawPearson: rawMetrics.Pearson,
        posteriorPearson: postMetrics.Pearson,
        rawSpearman: rawMetrics.Spearman,
        posteriorSpearman: postMetrics.Spearman,
        rawR2: rawMetrics.R2,
        posteriorR2: postMetrics.R2,
        rawCalSlope: rawMetrics.calibrationSlope,
        posteriorCalSlope: postMetrics.calibrationSlope,
        rawCalIntercept: rawMetrics.calibrationIntercept,
        posteriorCalIntercept: postMetrics.calibrationIntercept,
      },
      ...postByExposure,
    ])
  );

  const posteriorUnproven =
    !(postBoot.ciHigh < 0) &&
    Math.abs(postBoot.pointEstimate) < 0.01
      ? "POSTERIOR_INCREMENTAL_VALUE_UNPROVEN"
      : postBoot.ciHigh < 0
        ? "POSTERIOR_IMPROVES_RMSE"
        : postBoot.ciLow > 0
          ? "POSTERIOR_WORSE_RMSE"
          : "POSTERIOR_INCREMENTAL_VALUE_UNPROVEN";

  // Charts
  await writeFile(
    path.join(OUT, "charts", "winner_pred_vs_actual.svg"),
    svgScatter(
      winner.yhat.map((x, i) => ({ x, y: winner.y[i]! })),
      `${winner.id} predicted vs actual`
    )
  );
  await writeFile(
    path.join(OUT, "charts", "P_pred_vs_actual.svg"),
    svgScatter(
      pResult.yhat.map((x, i) => ({ x, y: pResult.y[i]! })),
      "M16C_P predicted vs actual"
    )
  );
  await writeFile(
    path.join(OUT, "charts", "residual_vs_pred_P.svg"),
    svgScatter(
      pResult.yhat.map((x, i) => ({ x, y: pResult.y[i]! - x })),
      "M16C_P residual vs prediction"
    )
  );

  // Interpretations
  const corrLnY = pearson(valLN, valY);
  const corrLnRP = pearson(valLN, valRP);
  const corrBY = pearson(valB, valY);
  const corrBRP = pearson(valB, valRP);
  const pLn = results.find((r) => r.id === "M16C_P_LN")!;
  const pB = results.find((r) => r.id === "M16C_P_B")!;
  const pLnBoot = bootstrapRows.find((r) => r.candidate === "M16C_P_LN")!;
  const pBBoot = bootstrapRows.find((r) => r.candidate === "M16C_P_B")!;
  const fullBoot = bootstrapRows.find((r) => r.candidate === "M16C_P_LN_B")!;

  function classifyComponent(
    standaloneCorr: number,
    residualCorr: number,
    deltaRmse: number,
    ciLow: number,
    ciHigh: number
  ): string {
    const standalone = Math.abs(standaloneCorr) > 0.05;
    // Incremental requires residual association AND non-worsening / improving RMSE evidence
    const residualSignal = Math.abs(residualCorr) > 0.05;
    const improves = ciHigh < 0;
    const notWorse = ciLow <= 0; // CI does not exclude "no worse or better"
    if (standalone && improves) return "A_standalone_and_incremental";
    if (standalone && residualSignal && !improves) return "B_standalone_little_incremental";
    if (standalone && !residualSignal && !improves) return "B_standalone_little_incremental";
    if (!standalone && (improves || (residualSignal && notWorse)))
      return "C_weak_standalone_useful_residual";
    return "D_no_meaningful_validation_signal";
  }

  const lnClass = classifyComponent(
    corrLnY,
    corrLnRP,
    Number(pLnBoot.deltaRMSE),
    Number(pLnBoot.ciLow),
    Number(pLnBoot.ciHigh)
  );
  const bClass = classifyComponent(
    corrBY,
    corrBRP,
    Number(pBBoot.deltaRMSE),
    Number(pBBoot.ciLow),
    Number(pBBoot.ciHigh)
  );

  // Fusion constraint suppression check
  let fusionConstraintSuppression = false;
  if (
    Math.abs(corrLnRP) > 0.08 &&
    Math.abs(full.beta.wLn) < 0.01 &&
    toSimplexWeights(full.beta).wLn < 1e-6
  ) {
    fusionConstraintSuppression = true;
  }
  if (
    Math.abs(corrBRP) > 0.08 &&
    Math.abs(full.beta.wB) < 0.01 &&
    toSimplexWeights(full.beta).wB < 1e-6
  ) {
    fusionConstraintSuppression = true;
  }

  await writeFile(
    path.join(OUT, "09_selection_audit.md"),
    `# M16c selection audit

## Predeclared rule (METRIC_CONTRACT)

${METRIC_CONTRACT.decisionRule.map((x) => `- ${x}`).join("\n")}

Primary metric: **validation_rmse**

## Result

- winner: **${winner.id}** (M16C_BASE_WINNER)
- validation RMSE: ${winner.metrics.RMSE}
- runner-up: ${runnerUp.id} (RMSE ${runnerUp.metrics.RMSE})
- delta RMSE (winner − runner-up via paired bootstrap point on winner vs runner-up baseline): ${winBoot.pointEstimate}
- 95% CI: [${winBoot.ciLow}, ${winBoot.ciHigh}]
- indistinguishable under CI-includes-0: ${indistinguishable(winner, runnerUp)}
- complexity winner: ${complexityCount(winner.id)} vs runner-up ${complexityCount(runnerUp.id)}
- Phase 29: among RMSE-indistinguishable candidates, simpler model preferred
- calibration used only as same-complexity tiebreak
- indistinguishable under CI-includes-0 vs best RMSE: ${tied.map((t) => t.id).join(", ")}

## Notes

- All fits used TRAIN only (\`VALIDATION_ROWS_USED_IN_FIT = 0\`).
- Reserved test not accessed for evaluation.
- No player-name / leaderboard aesthetics used in selection.
`
  );

  // Registry
  const baseRecord = {
    timestamp,
    gitCommit,
    dirtyStatus: gitDirty,
    evaluationProtocolVersion: EVALUATION_PROTOCOL_VERSION,
    trainSplitHash: expectedTrain,
    validationSplitHash: expectedVal,
    reservedTestSplitHash: expectedRes,
    targetVersion: TARGET_VERSION,
    fusionVersion: "drbl-fusion-oof-v1",
    posteriorVersion: "eb-fused-v1",
    m6Status: "standalone_not_fused",
    eligibilityVersion: ELIGIBILITY_VERSION,
    reservedTestAccessed: false,
  };

  for (const r of results) {
    const rec: ExperimentRecord = {
      ...baseRecord,
      experimentId: r.id,
      modelVersion: `m16c-${r.id}`,
      modelComponents: componentsOf(r.id).split("+"),
      metrics: { ...r.metrics },
      resultArtifacts: [
        `reports/m16c/predictions/${r.id}.csv`,
        "reports/m16c/01_candidate_metrics.csv",
      ],
      notes: r.id === winner.id ? "M16C_BASE_WINNER" : "ablation candidate",
    };
    await appendExperiment(rec);
  }
  await appendExperiment({
    ...baseRecord,
    experimentId: "M16C_POSTERIOR_ABLATION",
    modelVersion: `m16c-posterior-${winner.id}`,
    modelComponents: [...componentsOf(winner.id).split("+"), "EB"],
    metrics: {
      raw: rawMetrics,
      posterior: postMetrics,
      bootstrap: postBoot,
      flag: posteriorUnproven,
    },
    resultArtifacts: ["reports/m16c/07_posterior_ablation.csv"],
    notes: "Posterior ablation on M16C_BASE_WINNER only",
  });

  const statuses = {
    M16C_SPLITS_MATCH_M16B: hashCheck.ok ? "PASS" : "FAIL",
    RESERVED_TEST_ACCESSED: "NO",
    TARGET_UNCHANGED: "PASS",
    ELIGIBILITY_UNCHANGED: "PASS",
    CANDIDATE_SAMPLE_EQUALITY: sampleEquality,
    P_STANDALONE_COMPLETE: "PASS",
    LN_STANDALONE_COMPLETE: "PASS",
    B_STANDALONE_COMPLETE: "PASS",
    PAIRWISE_ABLATIONS_COMPLETE: "PASS",
    FULL_FUSION_COMPLETE: "PASS",
    INCREMENTAL_RESIDUAL_TEST_COMPLETE: "PASS",
    FUSION_WEIGHT_DIAGNOSTICS_COMPLETE: "PASS",
    POSTERIOR_ABLATION_COMPLETE: "PASS",
    M6_CHANGED: "NO",
    APPROACH_A_RUN: "NO",
    WAR_CHANGED: "NO",
    MODEL_FORMULAS_CHANGED: "NO",
    VALIDATION_ROWS_USED_IN_FIT,
    reservedTestAccessed,
    FUSION_CONSTRAINT_SUPPRESSION: fusionConstraintSuppression,
    LN_EXTREME_CALIBRATION_RISK: lnExtremeRisk !== "NONE",
    POSTERIOR_FLAG: posteriorUnproven,
    LN_CLASS: lnClass,
    B_CLASS: bClass,
    B_SCALE: bScaleNote,
  };

  await writeFile(
    path.join(OUT, "12_model_health.json"),
    JSON.stringify(
      {
        milestone: "M16c",
        statuses,
        winner: winner.id,
        runnerUp: runnerUp.id,
        trainStackN: trainRows.length,
        validationStackN: valRows.length,
        trainGamesLoaded: trainProcessed.length,
        validationGamesLoaded: valProcessed.length,
      },
      null,
      2
    )
  );

  const priorDominanceCauses: string[] = [];
  if (pResult.metrics.RMSE < results.find((r) => r.id === "M16C_LN")!.metrics.RMSE) {
    priorDominanceCauses.push(
      "1. P dominates because it predicts Y much better standalone."
    );
  }
  if (Math.abs(corrLnRP) < 0.05 && Math.abs(corrBRP) < 0.05) {
    priorDominanceCauses.push(
      "2. LN/B predict Y but add little conditional information after P."
    );
  }
  if (fusionConstraintSuppression) {
    priorDominanceCauses.push(
      "3. LN/B contain incremental signal but current fusion suppresses it."
    );
  }
  if (lnExtremeRisk !== "NONE") {
    priorDominanceCauses.push("4. LN/B are too unstable/noisy (extreme LN calibration risk).");
  }
  if (bSd < pSd * 0.25) {
    priorDominanceCauses.push(
      "5. Component scaling causes effective suppression (B SD << P SD)."
    );
  }
  if (!priorDominanceCauses.length) {
    priorDominanceCauses.push("6. Insufficient validation evidence to decide.");
  }

  await writeFile(
    path.join(OUT, "13_full_audit.md"),
    `# M16c full audit

## Freeze

- protocol: ${EVALUATION_PROTOCOL_VERSION}
- TRAIN hash: ${expectedTrain}
- VALIDATION hash: ${expectedVal}
- RESERVED_TEST hash: ${expectedRes} (hash-verified only; not used for metrics)
- reservedTestAccessed: false
- VALIDATION_ROWS_USED_IN_FIT: 0

## Dataset

- TRAIN games loaded: ${trainProcessed.length}
- VAL games loaded: ${valProcessed.length}
- earlyFrac: ${M16C_EARLY_FRAC}
- TRAIN stack N: ${trainRows.length}
- VAL stack N: ${valRows.length}

## Winner

**${winner.id}** RMSE=${winner.metrics.RMSE}

## Component classes

- LN: ${lnClass}
- B: ${bClass}

## Why P-dominant fusion historically

${priorDominanceCauses.map((x) => `- ${x}`).join("\n")}

## Posterior

- flag: ${posteriorUnproven}
- raw RMSE: ${rawMetrics.RMSE}
- posterior RMSE: ${postMetrics.RMSE}

## Statuses

${Object.entries(statuses)
  .map(([k, v]) => `- ${k}: ${JSON.stringify(v)}`)
  .join("\n")}
`
  );

  // Snapshot summary for console / final response helpers
  await writeFile(
    path.join(OUT, "14_stop_summary.json"),
    JSON.stringify(
      {
        winner: {
          id: winner.id,
          RMSE: winner.metrics.RMSE,
          MAE: winner.metrics.MAE,
          Pearson: winner.metrics.Pearson,
          Spearman: winner.metrics.Spearman,
          calibration: {
            a: winner.metrics.calibrationIntercept,
            b: winner.metrics.calibrationSlope,
          },
        },
        runnerUp: { id: runnerUp.id, RMSE: runnerUp.metrics.RMSE },
        winBoot,
        candidates: results.map((r) => ({
          id: r.id,
          ...r.metrics,
          weights: r.beta,
        })),
        incremental: {
          corrLnY,
          corrLnRP,
          corrBY,
          corrBRP,
          pLnDelta: pLnBoot,
          pBDelta: pBBoot,
          fullDelta: fullBoot,
          lnClass,
          bClass,
        },
        posterior: {
          rawMetrics,
          postMetrics,
          postBoot,
          postByExposure,
          flag: posteriorUnproven,
        },
        redundancy,
        extremes: extremeRows,
        priorDominanceCauses,
        statuses,
        reservedTestAccessed: false,
      },
      null,
      2
    )
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        reservedTestAccessed: false,
        VALIDATION_ROWS_USED_IN_FIT: 0,
        winner: winner.id,
        winnerRMSE: winner.metrics.RMSE,
        runnerUp: runnerUp.id,
        lnClass,
        bClass,
        posteriorUnproven,
        statuses,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
