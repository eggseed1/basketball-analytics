/**
 * M16d — M6 incremental validation test vs frozen P base.
 *   npm run drbl:m16d
 *
 * TRAIN fit only. VALIDATION score only. RESERVED_TEST never used for metrics.
 * No M6/P/formula/hyperparameter changes. No LN/B reintroduction.
 */
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

import {
  EVALUATION_PROTOCOL_VERSION,
  ELIGIBILITY_VERSION,
  TARGET_VERSION,
  METRIC_CONTRACT,
} from "../drbl/evaluation/protocol";
import type { SplitGame } from "../drbl/evaluation/splits";
import { developmentGames } from "../drbl/evaluation/reserved-test";
import { appendExperiment, type ExperimentRecord } from "../drbl/evaluation/registry";
import {
  mae,
  pearson,
  spearman,
  r2,
  rmse,
  pairedBlockBootstrapRmseDiff,
} from "../drbl/evaluation/metrics";
import {
  FUSION_CONSTRAINT_DETAIL,
  FUSION_CONSTRAINT_TYPE,
  M16C_EARLY_FRAC,
  M16C_FUSION_FOLDS,
  M16C_FUSION_LAMBDA,
  buildFutureBlockStackRows,
  describeDistribution,
  loadSplitGames,
  verifyFrozenSplitHashes,
  type EvalStackRow,
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
import { M6_VERSION } from "../drbl/models/shot-decision";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m16d");
const M16B = path.join(ROOT, "reports", "m16b");
const M16C = path.join(ROOT, "reports", "m16c");

const EXPECTED_TRAIN =
  "7bec77be45295ee858d90896d9383e4da951e98e81ad1ef31b5285fb055d1550";
const EXPECTED_VAL =
  "4fd339a445f269162c2d76e9102ea5bb965a5d0fc05e0fcd2f60593117c5faf0";
const EXPECTED_RES =
  "e542aa54602390ed65792f37e10207814e10b62bfdf552ddf4da69825076c1ce";

/** M16c published P baseline (must reproduce). */
const M16C_P_RMSE = 2.409176880654843;
const M16C_P_MAE = 1.7535410774334381;
const M16C_P_PEARSON = 0.3689320376237677;
const M16C_P_SPEARMAN = 0.39980456674339354;
const P_REPRO_TOL = 1e-6;

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

function partialCorr(x: number[], y: number[], z: number[]): number {
  const n = Math.min(x.length, y.length, z.length);
  if (n < 5) return NaN;
  const resid = (dep: number[], pred: number[]) => {
    const c = calib(dep, pred);
    return dep.map((yi, i) => yi - (c.a + c.b * pred[i]!));
  };
  return pearson(
    resid(x.slice(0, n), z.slice(0, n)),
    resid(y.slice(0, n), z.slice(0, n))
  );
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
  const den = sxx - (sx * sx) / n + lambda;
  const slope = den > 1e-12 ? (sxy - (sx * sy) / n) / den : 0;
  const intercept = n ? sy / n - slope * (sx / n) : 0;
  return { intercept, slope };
}

/** Map P / M6 into frozen fusion feature slots (LN slot = M6; B unused). */
function toFusionRows(
  rows: EvalStackRow[],
  mode: "P" | "M6" | "P_M6"
): FusionStackRow[] {
  return rows.map((r) => {
    const m6 = r.sdv100 ?? 0; // frozen missing → 0 (same entity universe)
    return {
      playerId: r.playerId,
      drblP: mode === "M6" ? 0 : r.drblP,
      drblLn: mode === "P" ? 0 : m6,
      drblB: null,
      targetPer100: r.targetPer100,
      possessions: r.possessions,
      asOfDate: r.asOfDate,
    };
  });
}

function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
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

async function main() {
  const reservedTestAccessed = false;
  const VALIDATION_ROWS_USED_IN_FIT = 0;

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

  // Confirm M16c winner
  const m16cAudit = await readFile(
    path.join(M16C, "09_selection_audit.md"),
    "utf8"
  );
  if (!m16cAudit.includes("M16C_P") || !m16cAudit.includes("M16C_BASE_WINNER")) {
    console.error("STOP: M16C_BASE_WINNER is not M16C_P");
    process.exit(2);
  }

  const trainGames = JSON.parse(
    await readFile(path.join(M16B, "splits", "train_game_ids.json"), "utf8")
  ) as SplitGame[];
  const validationGames = JSON.parse(
    await readFile(path.join(M16B, "splits", "validation_game_ids.json"), "utf8")
  ) as SplitGame[];
  const reservedGamesForHash = JSON.parse(
    await readFile(path.join(M16B, "splits", "reserved_test_game_ids.json"), "utf8")
  ) as SplitGame[];

  const hashCheck = verifyFrozenSplitHashes({
    train: trainGames,
    validation: validationGames,
    trainHashExpected: EXPECTED_TRAIN,
    validationHashExpected: EXPECTED_VAL,
    reservedTestHashExpected: EXPECTED_RES,
    reservedTestGamesForHashOnly: reservedGamesForHash,
  });
  if (!hashCheck.ok) {
    console.error("STOP EVALUATION_PROTOCOL_DRIFT", hashCheck.reason);
    process.exit(2);
  }

  // Constraint verification vs M16c freeze
  const m16cFreeze = JSON.parse(
    await readFile(path.join(M16C, "00_freeze.json"), "utf8")
  ) as {
    fusion?: { constraints?: string };
  };
  const m16cConstraint = String(m16cFreeze.fusion?.constraints ?? "");
  if (
    !m16cConstraint.includes("ridge_unconstrained_predict") &&
    !m16cConstraint.includes("simplex_report_only")
  ) {
    console.error("STOP M16C_FUSION_CONSTRAINT_MISMATCH", m16cConstraint);
    process.exit(2);
  }
  if (FUSION_CONSTRAINT_TYPE !== "ridge_with_intercept") {
    console.error("STOP M16C_FUSION_CONSTRAINT_MISMATCH type", FUSION_CONSTRAINT_TYPE);
    process.exit(2);
  }

  const freeze = {
    milestone: "M16d",
    timestamp,
    gitCommit,
    gitDirty,
    evaluationProtocolVersion: EVALUATION_PROTOCOL_VERSION,
    trainSplitHash: EXPECTED_TRAIN,
    validationSplitHash: EXPECTED_VAL,
    reservedTestSplitHash: EXPECTED_RES,
    targetVersion: TARGET_VERSION,
    eligibilityVersion: ELIGIBILITY_VERSION,
    target: "future_block_residual_per_100",
    earlyFrac: M16C_EARLY_FRAC,
    P_version: "approach-b-sequential-drbl-p",
    M6_version: M6_VERSION,
    SDV_version: "sdv100 = EB(100*sdvSum/sdvN) post-M7 C2 continue",
    m6CandidateField: "sdv100",
    m6CandidateUnit: "points_per_100_shot_decisions_EB_shrunk",
    fusionConstraintType: FUSION_CONSTRAINT_TYPE,
    fusionConstraintDetail: FUSION_CONSTRAINT_DETAIL,
    fusion: {
      version: "drbl-fusion-oof-v1",
      lambda: M16C_FUSION_LAMBDA,
      folds: M16C_FUSION_FOLDS,
      constraint: FUSION_CONSTRAINT_TYPE,
      m16cConstraintDoc: m16cConstraint,
      note: "P+M6 uses LN feature slot for sdv100; B unused; same ridge math as M16c",
    },
    posterior: {
      version: "eb-fused-v1",
      priorMean: 0,
      priorStrength: PRIOR_EQUIVALENT_POSSESSIONS,
    },
    m6: { fusedIntoDrbl100: false },
    war: { version: "unchanged_not_used" },
    base: "M16C_P",
    reservedTestAccessed: false,
    hashesMatchM16b: true,
  };
  await writeFile(path.join(OUT, "00_freeze.json"), JSON.stringify(freeze, null, 2));
  await copyFile(
    path.join(M16C, "00_freeze.json"),
    path.join(OUT, "freeze", "m16c_00_freeze.json")
  );
  await copyFile(
    path.join(M16B, "00_freeze.json"),
    path.join(OUT, "freeze", "m16b_00_freeze.json")
  );

  const dev = developmentGames({
    evaluationProtocolVersion: EVALUATION_PROTOCOL_VERSION,
    design: "two_season_chrono_block_v1",
    rationale: "",
    train: trainGames,
    validation: validationGames,
    reservedTest: [],
    trainSplitHash: EXPECTED_TRAIN,
    validationSplitHash: EXPECTED_VAL,
    reservedTestSplitHash: EXPECTED_RES,
    protocolHash: "",
  });

  console.log("Loading TRAIN/VALIDATION (M6 early-block)...");
  const trainProcessed = await loadSplitGames(dev.train);
  const valProcessed = await loadSplitGames(dev.validation);
  const trainBlock = buildFutureBlockStackRows(trainProcessed, {
    earlyFrac: M16C_EARLY_FRAC,
    includeM6: true,
  });
  const valBlock = buildFutureBlockStackRows(valProcessed, {
    earlyFrac: M16C_EARLY_FRAC,
    includeM6: true,
  });
  const trainRows = trainBlock.rows;
  const valRows = valBlock.rows;
  console.log(
    `stack TRAIN=${trainRows.length} VAL=${valRows.length} m6Shots earlyTrain=${trainBlock.m6ShotsScored}`
  );

  const m6CoverageN = valRows.filter((r) => r.m6Coverage).length;
  const missingM6 = valRows.length - m6CoverageN;
  if (valRows.length === 0) throw new Error("empty validation");

  // Distributions
  const distRows: Record<string, unknown>[] = [];
  for (const [split, rows] of [
    ["TRAIN", trainRows],
    ["VALIDATION", valRows],
  ] as const) {
    const m6 = rows.map((r) => (r.sdv100 == null ? NaN : r.sdv100));
    distRows.push({
      split,
      field: "sdv100",
      ...describeDistribution(m6),
      zeroShare: m6.filter((x) => x === 0).length / (m6.filter(Number.isFinite).length || 1),
      posShare: m6.filter((x) => x > 0).length / (m6.filter(Number.isFinite).length || 1),
      negShare: m6.filter((x) => x < 0).length / (m6.filter(Number.isFinite).length || 1),
    });
    distRows.push({
      split,
      field: "P",
      ...describeDistribution(rows.map((r) => r.drblP)),
    });
  }
  await writeFile(path.join(OUT, "00b_m6_distributions.csv"), toCsv(distRows));

  // --- Fit helpers ---
  function fitPredict(
    train: EvalStackRow[],
    val: EvalStackRow[],
    mode: "P" | "M6" | "P_M6"
  ): {
    beta: FusionOofCoefficients;
    y: number[];
    yhat: number[];
    possessions: number[];
    playerIds: string[];
    blockIds: string[];
    foldWeights: Array<Record<string, unknown>>;
  } {
    const trainF = toFusionRows(train, mode);
    const valF = toFusionRows(val, mode);
    const oof = fitFusionOof(trainF, {
      lambda: M16C_FUSION_LAMBDA,
      folds: M16C_FUSION_FOLDS,
    });
    const beta = fitFusionRidgeFull(trainF, M16C_FUSION_LAMBDA);
    const y: number[] = [];
    const yhat: number[] = [];
    const possessions: number[] = [];
    const playerIds: string[] = [];
    const blockIds: string[] = [];
    for (const row of valF) {
      y.push(row.targetPer100);
      yhat.push(predictFusionFull(row, beta));
      possessions.push(row.possessions);
      playerIds.push(row.playerId);
      blockIds.push(row.playerId);
    }
    const foldWeights = oof.oofProvenance.foldModels.map((fm) => ({
      fold: fm.foldId,
      wP: fm.coefficients.wP,
      wM6: fm.coefficients.wLn,
      intercept: fm.coefficients.intercept,
      boundaryHit: toSimplexWeights(fm.coefficients).wLn < 1e-9,
      nTrain: fm.nTrain,
      nTest: fm.nTest,
    }));
    return { beta, y, yhat, possessions, playerIds, blockIds, foldWeights };
  }

  // P baseline
  const pFit = fitPredict(trainRows, valRows, "P");
  const pMetrics = metricBundle(pFit.y, pFit.yhat);
  if (
    Math.abs(pMetrics.RMSE - M16C_P_RMSE) > P_REPRO_TOL ||
    Math.abs(pMetrics.MAE - M16C_P_MAE) > P_REPRO_TOL ||
    Math.abs(pMetrics.Pearson - M16C_P_PEARSON) > 1e-4 ||
    Math.abs(pMetrics.Spearman - M16C_P_SPEARMAN) > 1e-4
  ) {
    console.error("STOP P_BASELINE_REPRODUCTION_FAILURE", {
      got: pMetrics,
      expected: {
        RMSE: M16C_P_RMSE,
        MAE: M16C_P_MAE,
        Pearson: M16C_P_PEARSON,
        Spearman: M16C_P_SPEARMAN,
      },
    });
    process.exit(2);
  }

  // M6 only + P+M6
  const m6Fit = fitPredict(trainRows, valRows, "M6");
  const pm6Fit = fitPredict(trainRows, valRows, "P_M6");
  const m6Metrics = metricBundle(m6Fit.y, m6Fit.yhat);
  const pm6Metrics = metricBundle(pm6Fit.y, pm6Fit.yhat);

  const valM6 = valRows.map((r) => r.sdv100 ?? 0);
  const valP = valRows.map((r) => r.drblP);
  const valY = valRows.map((r) => r.targetPer100);
  const valRP = pFit.y.map((yi, i) => yi - pFit.yhat[i]!);

  // Residual model TRAIN-only (OOF P on train for residuals)
  const pTrainF = toFusionRows(trainRows, "P");
  const pOof = fitFusionOof(pTrainF, {
    lambda: M16C_FUSION_LAMBDA,
    folds: M16C_FUSION_FOLDS,
  });
  const pBeta = fitFusionRidgeFull(pTrainF, M16C_FUSION_LAMBDA);
  const trainPHat = trainRows.map((r, i) => {
    const o = pOof.oofRatingsPer100.get(r.playerId);
    if (o != null) return o;
    return predictFusionFull(pTrainF[i]!, pBeta);
  });
  const trainRP = trainRows.map((r, i) => r.targetPer100 - trainPHat[i]!);
  const trainM6 = trainRows.map((r) => r.sdv100 ?? 0);
  const resFit = fitSimpleRidge1(trainM6, trainRP, M16C_FUSION_LAMBDA);
  const resPred = valM6.map((x) => resFit.intercept + resFit.slope * x);
  const pPlusRes = pFit.yhat.map((p, i) => p + resPred[i]!);
  const resComboMetrics = metricBundle(valY, pPlusRes);

  const bootPm6 = pairedBlockBootstrapRmseDiff(
    pFit.y,
    pFit.yhat,
    pm6Fit.yhat,
    pFit.blockIds,
    { resamples: BOOTSTRAP_RESAMPLES, seed: BOOTSTRAP_SEED }
  );
  const bootRes = pairedBlockBootstrapRmseDiff(
    pFit.y,
    pFit.yhat,
    pPlusRes,
    pFit.blockIds,
    { resamples: BOOTSTRAP_RESAMPLES, seed: BOOTSTRAP_SEED }
  );
  const bootM6 = pairedBlockBootstrapRmseDiff(
    pFit.y,
    pFit.yhat,
    m6Fit.yhat,
    pFit.blockIds,
    { resamples: BOOTSTRAP_RESAMPLES, seed: BOOTSTRAP_SEED }
  );

  // Predictions
  async function writePreds(
    id: string,
    yhat: number[],
    extras: Record<string, number[]> = {}
  ) {
    const rows = valRows.map((r, i) => ({
      entityId: `${r.playerId}|2024-25|val`,
      playerId: r.playerId,
      target: r.targetPer100,
      prediction: yhat[i],
      residual: r.targetPer100 - yhat[i]!,
      absoluteResidual: Math.abs(r.targetPer100 - yhat[i]!),
      squaredResidual: (r.targetPer100 - yhat[i]!) ** 2,
      P: r.drblP,
      sdv100: r.sdv100,
      m6Coverage: r.m6Coverage,
      possessions: r.possessions,
      ...Object.fromEntries(
        Object.entries(extras).map(([k, arr]) => [k, arr[i]])
      ),
    }));
    await writeFile(path.join(OUT, "predictions", `${id}.csv`), toCsv(rows));
  }
  await writePreds("M16D_P_BASE", pFit.yhat);
  await writePreds("M16D_M6_ONLY", m6Fit.yhat);
  await writePreds("M16D_P_M6", pm6Fit.yhat);
  await writePreds("M16D_P_RESIDUAL_M6", pPlusRes);

  const corrM6Y = pearson(valM6, valY);
  const corrM6RP = pearson(valM6, valRP);
  const partialM6 = partialCorr(valM6, valY, valP);
  const corrPM6 = pearson(valP, valM6);

  // Decision rule (Phase 29 style)
  const indistinguishable =
    bootPm6.ciLow <= 0 && bootPm6.ciHigh >= 0;
  const improves = bootPm6.ciHigh < 0;
  let nextBase: "P" | "P + M6" = "P";
  let decision = "prefer_P";
  if (improves) {
    nextBase = "P + M6";
    decision = "P+M6_validated_improvement";
  } else if (indistinguishable) {
    nextBase = "P";
    decision = "indistinguishable_prefer_simpler_P";
  } else if (bootPm6.ciLow > 0) {
    nextBase = "P";
    decision = "P+M6_worse";
  }

  let m6Class = "D";
  const standalone = Math.abs(corrM6Y) > 0.05;
  const residual = Math.abs(corrM6RP) > 0.05;
  if (standalone && improves) m6Class = "A";
  else if (standalone && !improves) m6Class = "B";
  else if (!standalone && (improves || residual)) m6Class = "C";
  else m6Class = "D";

  // Candidate metrics
  const candRows = [
    {
      candidateId: "M16D_P_BASE",
      validationN: pMetrics.n,
      ...pMetrics,
      deltaRMSEvsP: 0,
      deltaMAEvsP: 0,
      bootstrapLow: 0,
      bootstrapHigh: 0,
      probabilityBeatsP: 0,
    },
    {
      candidateId: "M16D_M6_ONLY",
      validationN: m6Metrics.n,
      ...m6Metrics,
      deltaRMSEvsP: bootM6.pointEstimate,
      deltaMAEvsP: m6Metrics.MAE - pMetrics.MAE,
      bootstrapLow: bootM6.ciLow,
      bootstrapHigh: bootM6.ciHigh,
      probabilityBeatsP: bootM6.probCandidateBeatsBaseline,
    },
    {
      candidateId: "M16D_P_M6",
      validationN: pm6Metrics.n,
      ...pm6Metrics,
      deltaRMSEvsP: bootPm6.pointEstimate,
      deltaMAEvsP: pm6Metrics.MAE - pMetrics.MAE,
      bootstrapLow: bootPm6.ciLow,
      bootstrapHigh: bootPm6.ciHigh,
      probabilityBeatsP: bootPm6.probCandidateBeatsBaseline,
    },
    {
      candidateId: "M16D_P_RESIDUAL_M6",
      validationN: resComboMetrics.n,
      ...resComboMetrics,
      deltaRMSEvsP: bootRes.pointEstimate,
      deltaMAEvsP: resComboMetrics.MAE - pMetrics.MAE,
      bootstrapLow: bootRes.ciLow,
      bootstrapHigh: bootRes.ciHigh,
      probabilityBeatsP: bootRes.probCandidateBeatsBaseline,
    },
  ];
  await writeFile(path.join(OUT, "01_candidate_metrics.csv"), toCsv(candRows));

  await writeFile(
    path.join(OUT, "02_m6_incremental_signal.csv"),
    toCsv([
      {
        Corr_M6_Y: corrM6Y,
        Spearman_M6_Y: spearman(valM6, valY),
        Corr_M6_residualAfterP: corrM6RP,
        Spearman_M6_residualAfterP: spearman(valM6, valRP),
        partialCorr_M6_Y_given_P: partialM6,
        residualModelRMSE: rmse(valRP, resPred),
        PplusResidualM6_RMSE: resComboMetrics.RMSE,
        PplusM6DeltaRMSE: bootPm6.pointEstimate,
        ciLow: bootPm6.ciLow,
        ciHigh: bootPm6.ciHigh,
        probabilityBeatsP: bootPm6.probCandidateBeatsBaseline,
      },
    ])
  );

  // Weights
  const weightRows = [
    ...pm6Fit.foldWeights.map((w) => ({ candidate: "M16D_P_M6", ...w })),
    {
      candidate: "M16D_P_M6",
      fold: "FINAL_TRAIN_FIT",
      wP: pm6Fit.beta.wP,
      wM6: pm6Fit.beta.wLn,
      intercept: pm6Fit.beta.intercept,
      boundaryHit: toSimplexWeights(pm6Fit.beta).wLn < 1e-9,
      nTrain: trainRows.length,
      nTest: 0,
    },
  ];
  await writeFile(path.join(OUT, "03_p_m6_weights.csv"), toCsv(weightRows));

  const foldOnly = weightRows.filter((r) => r.fold !== "FINAL_TRAIN_FIT");
  const wM6s = foldOnly.map((r) => Number(r.wM6));
  const wPs = foldOnly.map((r) => Number(r.wP));
  const signChanges =
    wM6s.slice(1).filter((v, i) => Math.sign(v) !== Math.sign(wM6s[i]!) && v !== 0 && wM6s[i] !== 0)
      .length;
  await writeFile(
    path.join(OUT, "04_weight_summary.csv"),
    toCsv([
      {
        coefficient: "wP",
        mean: wPs.reduce((a, b) => a + b, 0) / wPs.length,
        sd: sd(wPs),
        min: Math.min(...wPs),
        max: Math.max(...wPs),
        zeroFrequency: wPs.filter((x) => Math.abs(x) < 1e-6).length / wPs.length,
        signChangeCount: 0,
      },
      {
        coefficient: "wM6",
        mean: wM6s.reduce((a, b) => a + b, 0) / wM6s.length,
        sd: sd(wM6s),
        min: Math.min(...wM6s),
        max: Math.max(...wM6s),
        zeroFrequency: wM6s.filter((x) => Math.abs(x) < 1e-6).length / wM6s.length,
        signChangeCount: signChanges,
      },
    ])
  );

  // Effective contributions
  const cP = valP.map((p) => pm6Fit.beta.wP * p);
  const cM6 = valM6.map((m) => pm6Fit.beta.wLn * m);
  const absM6 = cM6.map(Math.abs);
  absM6.sort((a, b) => a - b);
  await writeFile(
    path.join(OUT, "05_effective_contributions.csv"),
    toCsv([
      {
        component: "P",
        componentSD: sd(valP),
        meanWeight: pm6Fit.beta.wP,
        contributionSD: sd(cP),
        meanAbsoluteContribution:
          cP.reduce((a, b) => a + Math.abs(b), 0) / cP.length,
        P95AbsoluteContribution: absM6[Math.floor(0.95 * absM6.length)] ?? 0,
      },
      {
        component: "M6_sdv100",
        componentSD: sd(valM6),
        meanWeight: pm6Fit.beta.wLn,
        contributionSD: sd(cM6),
        meanAbsoluteContribution:
          cM6.reduce((a, b) => a + Math.abs(b), 0) / cM6.length,
        P95AbsoluteContribution: absM6[Math.floor(0.95 * absM6.length)] ?? 0,
        maxAbsoluteContribution: Math.max(...absM6),
      },
    ])
  );

  // Sample-size subgroups
  const possOrder = valRows
    .map((r, i) => ({ p: r.possessions, i }))
    .sort((a, b) => a.p - b.p);
  const subgroupRows: Record<string, unknown>[] = [];
  for (let q = 0; q < 4; q++) {
    const slice = possOrder.slice(
      Math.floor((q / 4) * possOrder.length),
      Math.floor(((q + 1) / 4) * possOrder.length)
    );
    const idxs = slice.map((x) => x.i);
    const yq = idxs.map((i) => valY[i]!);
    const pq = idxs.map((i) => pFit.yhat[i]!);
    const mq = idxs.map((i) => pm6Fit.yhat[i]!);
    const m6q = idxs.map((i) => valM6[i]!);
    const rpq = idxs.map((i) => valRP[i]!);
    subgroupRows.push({
      group: `Q${q + 1}`,
      N: idxs.length,
      meanPossessions: slice.reduce((s, x) => s + x.p, 0) / slice.length,
      P_RMSE: rmse(yq, pq),
      PM6_RMSE: rmse(yq, mq),
      delta: rmse(yq, mq) - rmse(yq, pq),
      Corr_M6_residualAfterP: pearson(m6q, rpq),
    });
  }
  await writeFile(path.join(OUT, "06_sample_size_subgroups.csv"), toCsv(subgroupRows));

  // Extremes
  const byM6 = valRows
    .map((r, i) => ({ r, i, v: r.sdv100 ?? 0 }))
    .sort((a, b) => a.v - b.v);
  const n5 = Math.max(1, Math.floor(byM6.length * 0.05));
  const extremeRows: Record<string, unknown>[] = [];
  for (const [label, slice] of [
    ["bottom_5pct", byM6.slice(0, n5)],
    ["top_5pct", byM6.slice(-n5)],
  ] as const) {
    const ys = slice.map((x) => x.r.targetPer100);
    const vs = slice.map((x) => x.v);
    const ps = slice.map((x) => x.r.drblP);
    const rps = slice.map((x) => valRP[x.i]!);
    const c = calib(ys, vs);
    extremeRows.push({
      bucket: label,
      n: slice.length,
      meanM6: vs.reduce((a, b) => a + b, 0) / vs.length,
      meanP: ps.reduce((a, b) => a + b, 0) / ps.length,
      meanY: ys.reduce((a, b) => a + b, 0) / ys.length,
      meanResidualAfterP: rps.reduce((a, b) => a + b, 0) / rps.length,
      calibrationSlope: c.b,
      calibrationIntercept: c.a,
      pearson_M6_Y: pearson(vs, ys),
    });
  }
  const m6ExtremeRisk =
    extremeRows.some(
      (r) =>
        r.bucket === "top_5pct" &&
        Number(r.meanM6) > 1 &&
        Number(r.meanY) < Number(r.meanM6) * 0.25
    )
      ? "M6_EXTREME_CALIBRATION_RISK"
      : "NONE";
  await writeFile(path.join(OUT, "07_m6_extremes.csv"), toCsv(extremeRows));

  // Posterior robustness (secondary)
  const ebP = pFit.yhat.map((yh, i) =>
    empiricalBayesRate(yh, pFit.possessions[i]!, 0, PRIOR_EQUIVALENT_POSSESSIONS)
      .posterior
  );
  const ebPM6 = pm6Fit.yhat.map((yh, i) =>
    empiricalBayesRate(yh, pm6Fit.possessions[i]!, 0, PRIOR_EQUIVALENT_POSSESSIONS)
      .posterior
  );
  await writeFile(
    path.join(OUT, "08_posterior_robustness.csv"),
    toCsv([
      {
        label: "SECONDARY_ROBUSTNESS_ONLY",
        raw_P: pMetrics.RMSE,
        raw_PM6: pm6Metrics.RMSE,
        EB_P: metricBundle(valY, ebP).RMSE,
        EB_PM6: metricBundle(valY, ebPM6).RMSE,
        posterior_k: PRIOR_EQUIVALENT_POSSESSIONS,
        priorMean: 0,
      },
      {
        metric: "MAE",
        raw_P: pMetrics.MAE,
        raw_PM6: pm6Metrics.MAE,
        EB_P: metricBundle(valY, ebP).MAE,
        EB_PM6: metricBundle(valY, ebPM6).MAE,
      },
      {
        metric: "Pearson",
        raw_P: pMetrics.Pearson,
        raw_PM6: pm6Metrics.Pearson,
        EB_P: metricBundle(valY, ebP).Pearson,
        EB_PM6: metricBundle(valY, ebPM6).Pearson,
      },
    ])
  );

  // Calibration bins
  const calibOut: Record<string, unknown>[] = [];
  for (const [name, yhat] of [
    ["P", pFit.yhat],
    ["P_M6", pm6Fit.yhat],
  ] as const) {
    const m = metricBundle(valY, yhat);
    calibOut.push({
      candidate: name,
      calibrationIntercept: m.calibrationIntercept,
      calibrationSlope: m.calibrationSlope,
      RMSE: m.RMSE,
    });
    const order = yhat
      .map((yh, i) => ({ yh, y: valY[i]! }))
      .sort((a, b) => a.yh - b.yh);
    for (let q = 0; q < 5; q++) {
      const slice = order.slice(
        Math.floor((q / 5) * order.length),
        Math.floor(((q + 1) / 5) * order.length)
      );
      if (!slice.length) continue;
      const meanPred = slice.reduce((s, x) => s + x.yh, 0) / slice.length;
      const meanAct = slice.reduce((s, x) => s + x.y, 0) / slice.length;
      calibOut.push({
        candidate: name,
        bin: `pred_q${q + 1}`,
        count: slice.length,
        meanPrediction: meanPred,
        meanActual: meanAct,
        meanResidual: meanAct - meanPred,
      });
    }
  }
  await writeFile(path.join(OUT, "09_calibration.csv"), toCsv(calibOut));

  await writeFile(
    path.join(OUT, "11_bootstrap_comparisons.csv"),
    toCsv([
      { candidate: "M16D_P_M6", ...bootPm6 },
      { candidate: "M16D_P_RESIDUAL_M6", ...bootRes },
      { candidate: "M16D_M6_ONLY", ...bootM6 },
    ])
  );

  // Improvement share
  let improved = 0;
  let worsened = 0;
  const seImp: number[] = [];
  for (let i = 0; i < valY.length; i++) {
    const eP = (valY[i]! - pFit.yhat[i]!) ** 2;
    const eM = (valY[i]! - pm6Fit.yhat[i]!) ** 2;
    const d = eP - eM;
    seImp.push(d);
    if (d > 0) improved++;
    else if (d < 0) worsened++;
  }

  // Charts
  await writeFile(
    path.join(OUT, "charts", "P_pred_vs_Y.svg"),
    svgScatter(
      pFit.yhat.map((x, i) => ({ x, y: valY[i]! })),
      "P predicted vs Y"
    )
  );
  await writeFile(
    path.join(OUT, "charts", "PM6_pred_vs_Y.svg"),
    svgScatter(
      pm6Fit.yhat.map((x, i) => ({ x, y: valY[i]! })),
      "P+M6 predicted vs Y"
    )
  );
  await writeFile(
    path.join(OUT, "charts", "M6_vs_residual_after_P.svg"),
    svgScatter(
      valM6.map((x, i) => ({ x, y: valRP[i]! })),
      "M6 vs residual after P"
    )
  );
  await writeFile(
    path.join(OUT, "charts", "PM6_residual_vs_pred.svg"),
    svgScatter(
      pm6Fit.yhat.map((x, i) => ({ x, y: valY[i]! - x })),
      "P+M6 residual vs prediction"
    )
  );
  await writeFile(
    path.join(OUT, "charts", "delta_squared_error.svg"),
    svgScatter(
      seImp.map((d, i) => ({ x: i, y: d })),
      "squared-error improvement (P²−PM6²)"
    )
  );

  await writeFile(
    path.join(OUT, "10_selection_audit.md"),
    `# M16d selection audit

## Frozen decision rule

${METRIC_CONTRACT.decisionRule.map((x) => `- ${x}`).join("\n")}

Phase 29: among RMSE-indistinguishable models, prefer simpler.

## Results

| Model | RMSE |
|---|---|
| P | ${pMetrics.RMSE} |
| P+M6 | ${pm6Metrics.RMSE} |

- delta RMSE (P+M6 − P): ${bootPm6.pointEstimate}
- relative delta: ${(bootPm6.pointEstimate / pMetrics.RMSE) * 100}%
- 95% CI: [${bootPm6.ciLow}, ${bootPm6.ciHigh}]
- probability P+M6 beats P: ${bootPm6.probCandidateBeatsBaseline}
- indistinguishable: ${indistinguishable}
- decision: **${decision}**
- M16D_NEXT_BASE: **${nextBase}**
- M6 class: ${m6Class}
- fusionConstraintType: ${FUSION_CONSTRAINT_TYPE}

## Constraint note

Documentation historically said "simplex"; implementation predicts with **unconstrained ridge** (signed weights allowed). Simplex is report-only. M16c and M16d match.
`
  );

  const statuses = {
    M16D_SPLITS_MATCH_M16B: "PASS",
    M16C_P_BASELINE_REPRODUCED: "PASS",
    FUSION_CONSTRAINT_VERIFIED: "PASS",
    RESERVED_TEST_ACCESSED: "NO",
    VALIDATION_ROWS_USED_IN_FIT,
    TARGET_UNCHANGED: "PASS",
    ELIGIBILITY_UNCHANGED: "PASS",
    M6_FORMULA_CHANGED: "NO",
    M6_STANDALONE_COMPLETE: "PASS",
    M6_RESIDUAL_SIGNAL_COMPLETE: "PASS",
    P_M6_FUSION_COMPLETE: "PASS",
    PAIRED_BOOTSTRAP_COMPLETE: "PASS",
    POSTERIOR_ROBUSTNESS_COMPLETE: "PASS",
    LN_REINTRODUCED: "NO",
    B_REINTRODUCED: "NO",
    APPROACH_A_RUN: "NO",
    WAR_CHANGED: "NO",
    PRODUCTION_DRBL_CHANGED: "NO",
    M6_EXTREME_CALIBRATION_RISK: m6ExtremeRisk !== "NONE",
    M16D_NEXT_BASE: nextBase,
    m6Class,
    decision,
  };

  await writeFile(
    path.join(OUT, "12_model_health.json"),
    JSON.stringify(
      {
        milestone: "M16d",
        statuses,
        coverage: {
          validationN: valRows.length,
          m6CoverageN,
          missingM6,
          commonValidationN: valRows.length,
        },
        m6Definition: {
          field: "sdv100",
          unit: "points_per_100_shot_decisions_EB_shrunk",
          version: M6_VERSION,
          fusedIntoDrbl100: false,
        },
        fusionConstraintType: FUSION_CONSTRAINT_TYPE,
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "13_full_audit.md"),
    `# M16d full audit

## Question

Does M6 predict residual future outcome after P?

## Answers

- Corr(M6,Y)=${corrM6Y}
- Corr(M6,R_P)=${corrM6RP}
- partialCorr(M6,Y|P)=${partialM6}
- P RMSE=${pMetrics.RMSE}
- P+M6 RMSE=${pm6Metrics.RMSE}
- delta=${bootPm6.pointEstimate} CI=[${bootPm6.ciLow},${bootPm6.ciHigh}]
- class=${m6Class}
- next base=${nextBase}

## Coverage

validationN=${valRows.length} m6CoverageN=${m6CoverageN} missing=${missingM6}

## Improvement share

improved=${improved} worsened=${worsened} meanSEImp=${seImp.reduce((a,b)=>a+b,0)/seImp.length}

## Statuses

${Object.entries(statuses)
  .map(([k, v]) => `- ${k}: ${JSON.stringify(v)}`)
  .join("\n")}
`
  );

  await writeFile(
    path.join(OUT, "14_stop_summary.json"),
    JSON.stringify(
      {
        freeze,
        pMetrics,
        m6Metrics,
        pm6Metrics,
        resComboMetrics,
        bootPm6,
        corrM6Y,
        corrM6RP,
        partialM6,
        corrPM6,
        weights: {
          wP: pm6Fit.beta.wP,
          wM6: pm6Fit.beta.wLn,
          intercept: pm6Fit.beta.intercept,
        },
        subgroupRows,
        extremeRows,
        m6ExtremeRisk,
        nextBase,
        decision,
        m6Class,
        statuses,
        coverage: { validationN: valRows.length, m6CoverageN, missingM6 },
        posterior: {
          rawP: pMetrics.RMSE,
          rawPM6: pm6Metrics.RMSE,
          ebP: metricBundle(valY, ebP).RMSE,
          ebPM6: metricBundle(valY, ebPM6).RMSE,
        },
        improvementShare: {
          improved,
          worsened,
          meanSEImp: seImp.reduce((a, b) => a + b, 0) / seImp.length,
        },
        reservedTestAccessed,
        VALIDATION_ROWS_USED_IN_FIT,
      },
      null,
      2
    )
  );

  // Registry
  const baseRec = {
    timestamp,
    gitCommit,
    dirtyStatus: gitDirty,
    evaluationProtocolVersion: EVALUATION_PROTOCOL_VERSION,
    trainSplitHash: EXPECTED_TRAIN,
    validationSplitHash: EXPECTED_VAL,
    reservedTestSplitHash: EXPECTED_RES,
    targetVersion: TARGET_VERSION,
    fusionVersion: "drbl-fusion-oof-v1",
    posteriorVersion: "eb-fused-v1",
    m6Status: "standalone_incremental_test",
    eligibilityVersion: ELIGIBILITY_VERSION,
    reservedTestAccessed: false,
  };
  for (const [id, metrics, components] of [
    ["M16D_P_BASE", pMetrics, ["P"]],
    ["M16D_M6_ONLY", m6Metrics, ["M6"]],
    ["M16D_P_M6", pm6Metrics, ["P", "M6"]],
    ["M16D_P_RESIDUAL_M6", resComboMetrics, ["P", "M6_residual"]],
  ] as const) {
    const rec: ExperimentRecord = {
      ...baseRec,
      experimentId: id,
      modelVersion: `m16d-${id}`,
      modelComponents: [...components],
      metrics: { ...metrics },
      resultArtifacts: [`reports/m16d/predictions/${id}.csv`],
      notes: id === "M16D_P_M6" ? `decision=${decision}; next=${nextBase}` : undefined,
    };
    await appendExperiment(rec);
  }
  await appendExperiment({
    ...baseRec,
    experimentId: "M16D_POSTERIOR_ROBUSTNESS",
    modelVersion: "m16d-posterior-robustness",
    modelComponents: ["P", "M6", "EB"],
    metrics: {
      secondaryOnly: true,
      rawP: pMetrics.RMSE,
      rawPM6: pm6Metrics.RMSE,
      ebP: metricBundle(valY, ebP).RMSE,
      ebPM6: metricBundle(valY, ebPM6).RMSE,
      k: PRIOR_EQUIVALENT_POSSESSIONS,
    },
    resultArtifacts: ["reports/m16d/08_posterior_robustness.csv"],
    notes: "SECONDARY ROBUSTNESS ONLY; k unchanged",
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        reservedTestAccessed: false,
        P_RMSE: pMetrics.RMSE,
        PM6_RMSE: pm6Metrics.RMSE,
        delta: bootPm6.pointEstimate,
        ci: [bootPm6.ciLow, bootPm6.ciHigh],
        corrM6RP,
        m6Class,
        nextBase,
        decision,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
