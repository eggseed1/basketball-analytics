/**
 * M16i — P-only predictive uncertainty selection.
 *   npm run drbl:m16i
 *
 * Point estimate LOCKED (identity EB1600). Uncertainty does not modify DRBL/100.
 * Eligible: U0 constant, U1 c/sqrt(N), U2 floor+sampling. No LN/B/disagreement.
 * No M16b VALIDATION selection. No RESERVED_TEST. No production overwrite.
 */
import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";

import {
  EVALUATION_PROTOCOL_VERSION,
  METRIC_CONTRACT,
} from "../drbl/evaluation/protocol";
import { verifyFrozenSplitHashes } from "../drbl/evaluation/m16c-dataset";
import { hashGames, type SplitGame } from "../drbl/evaluation/splits";
import {
  pearson,
  spearman,
} from "../drbl/evaluation/metrics";
import { SEQUENTIAL_ATTRIBUTION_VERSION } from "../drbl/models/sequential-attribution";
import {
  CALIBRATION_IDENTITY_VERSION,
  RESEARCH_RATE_CONFIG_V1,
  RESEARCH_RATE_VERSION,
  computeResearchRateV1,
} from "../drbl/models/research-rate-v1";
import {
  RESEARCH_K,
  RESEARCH_POSTERIOR_LAYER_COUNT,
  RESEARCH_POSTERIOR_VERSION,
} from "../drbl/models/research-ability-v1";
import {
  RESEARCH_PREDICTIVE_UNCERTAINTY_VERSION,
  assertMonotoneSigma,
  computeResearchPredictionIntervalsV1,
  empiricalAbsZQuantiles,
  fitU0,
  fitU1,
  fitU2,
  sigmaOf,
  weightedIntervalScore,
  type QuantileParams,
  type UncertaintyModelType,
  type U0Params,
  type U1Params,
  type U2Params,
} from "../drbl/models/research-predictive-uncertainty-v1";
import {
  DEFAULT_DISAGREEMENT_COEF,
  rawUncertaintyScale,
} from "../drbl/models/uncertainty";
import {
  WAR_EXPOSURE_UNIT,
  WAR_FORMULA_VERSION,
} from "../drbl/models/pipeline-value";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m16i");
const CHARTS = path.join(OUT, "charts");
const M16G = path.join(ROOT, "reports", "m16g");
const M16G1 = path.join(ROOT, "reports", "m16g1");
const M16H = path.join(ROOT, "reports", "m16h");

const EXPECTED_TRAIN =
  "7bec77be45295ee858d90896d9383e4da951e98e81ad1ef31b5285fb055d1550";
const EXPECTED_VAL =
  "4fd339a445f269162c2d76e9102ea5bb965a5d0fc05e0fcd2f60593117c5faf0";
const EXPECTED_RES =
  "e542aa54602390ed65792f37e10207814e10b62bfdf552ddf4da69825076c1ce";

const PRACTICAL = 0.005;
const BOOTSTRAP_RESAMPLES = METRIC_CONTRACT.practicalSignificance.bootstrapResamples;
const BOOTSTRAP_SEED = 42;
const LEGACY_SCALE_MULT = 0.52751;
const LEGACY_MAX_HW = 4;

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
function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}
function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}
function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((p / 100) * (sorted.length - 1)))
  );
  return sorted[idx]!;
}
function mae(xs: number[]): number {
  return mean(xs.map(Math.abs));
}
function rmse(xs: number[]): number {
  return Math.sqrt(mean(xs.map((x) => x * x)));
}

async function loadSplitList(
  name: "train" | "validation" | "reserved_test"
): Promise<SplitGame[]> {
  const file =
    name === "reserved_test"
      ? "reserved_test_game_ids.json"
      : `${name}_game_ids.json`;
  const p = path.join(ROOT, "reports/m16b/splits", file);
  const raw = JSON.parse(await readFile(p, "utf8")) as
    | { games?: SplitGame[] }
    | SplitGame[];
  return Array.isArray(raw) ? raw : (raw.games ?? []);
}

type FoldRow = {
  foldId: number;
  playerId: string;
  rawPB: number;
  N: number;
  target: number;
};

function parseFoldRows(csv: string): FoldRow[] {
  const lines = csv.trim().split(/\r?\n/);
  const h = lines[0]!.split(",");
  const ix = (n: string) => h.indexOf(n);
  return lines.slice(1).map((line) => {
    const c = line.split(",");
    return {
      foldId: Number(c[ix("foldId")]),
      playerId: c[ix("playerId")]!,
      rawPB: Number(c[ix("rawPB")]),
      N: Number(c[ix("N")]),
      target: Number(c[ix("target")]),
    };
  });
}

type CandParams =
  | { model: "U0"; params: U0Params }
  | { model: "U1"; params: U1Params }
  | { model: "U2"; params: U2Params };

function modelTypeOf(c: CandParams): UncertaintyModelType {
  if (c.model === "U0") return "U0_CONSTANT";
  if (c.model === "U1") return "U1_INVERSE_SQRT";
  return "U2_FLOOR_PLUS_SAMPLING";
}

function fitCand(
  model: "U0" | "U1" | "U2",
  errors: number[],
  ns: number[]
): CandParams {
  if (model === "U0") return { model, params: fitU0(errors) };
  if (model === "U1") return { model, params: fitU1(errors, ns) };
  const f = fitU2(errors, ns);
  if (!f.converged) throw new Error("UNCERTAINTY_SCALE_FIT_FAILURE U2");
  return { model, params: { sigmaFloor: f.sigmaFloor, c: f.c } };
}

function sigmaCand(c: CandParams, n: number): number {
  return sigmaOf(modelTypeOf(c), n, c.params);
}

/** Paired bootstrap on WIS difference (candidate - baseline); negative => candidate better. */
function pairedBlockBootstrapWisDiff(
  wisBaseline: number[],
  wisCandidate: number[],
  blockIds: string[],
  options: { resamples?: number; seed?: number } = {}
): {
  pointEstimate: number;
  ciLow: number;
  ciHigh: number;
  probCandidateBeatsBaseline: number;
  resamples: number;
  seed: number;
} {
  const resamples = options.resamples ?? 1000;
  const seed = options.seed ?? 42;
  const n = Math.min(wisBaseline.length, wisCandidate.length, blockIds.length);
  const blocks = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const id = blockIds[i]!;
    const arr = blocks.get(id) ?? [];
    arr.push(i);
    blocks.set(id, arr);
  }
  const keys = [...blocks.keys()];
  const diffOf = (idxs: number[]) => {
    let s = 0;
    for (const i of idxs) s += wisCandidate[i]! - wisBaseline[i]!;
    return s / (idxs.length || 1);
  };
  const all = Array.from({ length: n }, (_, i) => i);
  const pointEstimate = diffOf(all);
  let t = seed >>> 0;
  const rng = () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const diffs: number[] = [];
  for (let r = 0; r < resamples; r++) {
    const sampled: number[] = [];
    for (let b = 0; b < keys.length; b++) {
      const key = keys[Math.floor(rng() * keys.length)]!;
      sampled.push(...(blocks.get(key) ?? []));
    }
    diffs.push(diffOf(sampled));
  }
  diffs.sort((a, b) => a - b);
  const ciLow = diffs[Math.floor(0.025 * diffs.length)]!;
  const ciHigh = diffs[Math.min(diffs.length - 1, Math.floor(0.975 * diffs.length))]!;
  const probCandidateBeatsBaseline =
    diffs.filter((d) => d < 0).length / diffs.length;
  return {
    pointEstimate,
    ciLow,
    ciHigh,
    probCandidateBeatsBaseline,
    resamples,
    seed,
  };
}

function svgScatter(
  pts: Array<{ x: number; y: number }>,
  title: string,
  xlab: string,
  ylab: string
): string {
  const w = 560,
    h = 340,
    pad = 52;
  const xs = pts.map((p) => p.x).filter(Number.isFinite);
  const ys = pts.map((p) => p.y).filter(Number.isFinite);
  if (!xs.length || !ys.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="20" y="40">${title}</text></svg>`;
  }
  const xmin = Math.min(...xs),
    xmax = Math.max(...xs),
    ymin = Math.min(...ys),
    ymax = Math.max(...ys);
  const dx = xmax - xmin || 1;
  const dy = ymax - ymin || 1;
  const mapX = (x: number) => pad + ((x - xmin) / dx) * (w - 2 * pad);
  const mapY = (y: number) => h - pad - ((y - ymin) / dy) * (h - 2 * pad);
  const dots = pts
    .slice(0, 2200)
    .map(
      (p) =>
        `<circle cx="${mapX(p.x).toFixed(1)}" cy="${mapY(p.y).toFixed(1)}" r="2" fill="#1f4e79" fill-opacity="0.35"/>`
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="100%" height="100%" fill="#fafafa"/>
  <text x="${w / 2}" y="24" text-anchor="middle" font-size="13">${title}</text>
  <text x="${w / 2}" y="${h - 12}" text-anchor="middle" font-size="11">${xlab}</text>
  <text x="14" y="${h / 2}" text-anchor="middle" font-size="11" transform="rotate(-90 14 ${h / 2})">${ylab}</text>
  ${dots}
</svg>`;
}

function svgBars(
  items: Array<{ label: string; value: number }>,
  title: string,
  ylab: string
): string {
  const w = 560,
    h = 340,
    pad = 52;
  const vals = items.map((i) => i.value);
  const vmin = Math.min(0, ...vals);
  const vmax = Math.max(...vals, 0);
  const dy = vmax - vmin || 1;
  const barW = (w - 2 * pad) / Math.max(1, items.length);
  const zeroY = h - pad - ((0 - vmin) / dy) * (h - 2 * pad);
  const bars = items
    .map((it, i) => {
      const y = h - pad - ((it.value - vmin) / dy) * (h - 2 * pad);
      const top = Math.min(y, zeroY);
      const bh = Math.abs(y - zeroY) || 1;
      return `<rect x="${(pad + i * barW + 4).toFixed(1)}" y="${top.toFixed(1)}" width="${(barW - 8).toFixed(1)}" height="${bh.toFixed(1)}" fill="#1f4e79"/><text x="${(pad + i * barW + barW / 2).toFixed(1)}" y="${h - 16}" text-anchor="middle" font-size="10">${it.label}</text>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="100%" height="100%" fill="#fafafa"/>
  <text x="${w / 2}" y="24" text-anchor="middle" font-size="13">${title}</text>
  <text x="14" y="${h / 2}" text-anchor="middle" font-size="11" transform="rotate(-90 14 ${h / 2})">${ylab}</text>
  ${bars}
</svg>`;
}

function svgHist(values: number[], title: string, xlab: string): string {
  const w = 560,
    h = 340,
    pad = 52,
    bins = 30;
  const finite = values.filter(Number.isFinite);
  if (!finite.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="20" y="40">${title}</text></svg>`;
  }
  const xmin = Math.min(...finite);
  const xmax = Math.max(...finite);
  const dx = (xmax - xmin) / bins || 1;
  const counts = new Array(bins).fill(0) as number[];
  for (const v of finite) {
    counts[Math.min(bins - 1, Math.floor((v - xmin) / dx))]!++;
  }
  const ymax = Math.max(...counts) || 1;
  const barW = (w - 2 * pad) / bins;
  const bars = counts
    .map((c, i) => {
      const bh = (c / ymax) * (h - 2 * pad);
      return `<rect x="${(pad + i * barW).toFixed(1)}" y="${(h - pad - bh).toFixed(1)}" width="${(barW - 1).toFixed(1)}" height="${bh.toFixed(1)}" fill="#1f4e79" fill-opacity="0.75"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="100%" height="100%" fill="#fafafa"/>
  <text x="${w / 2}" y="24" text-anchor="middle" font-size="13">${title}</text>
  <text x="${w / 2}" y="${h - 12}" text-anchor="middle" font-size="11">${xlab}</text>
  ${bars}
</svg>`;
}

async function main() {
  await mkdir(CHARTS, { recursive: true });
  const timestamp = new Date().toISOString();
  const gitCommit = execSync("git rev-parse HEAD", {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  const dirty =
    execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" }).trim()
      .length > 0;

  const m16gFolds = JSON.parse(
    await readFile(path.join(M16G, "03_posterior_folds.json"), "utf8")
  ) as {
    folds: Array<{
      foldId: number;
      historyHash: string;
      futureHash: string;
      nRows: number;
      historyDateMax: string;
      futureDateMin: string;
      futureDateMax: string;
    }>;
  };
  const m16hDecision = JSON.parse(
    await readFile(path.join(M16H, "16_calibration_selection_decision.json"), "utf8")
  ) as { CALIBRATION_SELECTION_RESULT: string; b_final: number };
  const m16g1Freeze = JSON.parse(
    await readFile(path.join(M16G1, "00_freeze.json"), "utf8")
  ) as {
    m16gFoldHashes: Array<{
      foldId: number;
      historyHash: string;
      futureHash: string;
      nRows: number;
    }>;
  };

  const trainGames = await loadSplitList("train");
  const valGames = await loadSplitList("validation");
  const reservedGames = await loadSplitList("reserved_test");
  const hashCheck = verifyFrozenSplitHashes({
    train: trainGames,
    validation: valGames,
    trainHashExpected: EXPECTED_TRAIN,
    validationHashExpected: EXPECTED_VAL,
    reservedTestHashExpected: EXPECTED_RES,
    reservedTestGamesForHashOnly: reservedGames,
  });
  if (!hashCheck.ok || hashGames(reservedGames) !== EXPECTED_RES) {
    throw new Error("STOP EVALUATION_PROTOCOL_DRIFT");
  }
  const foldHashOk = m16g1Freeze.m16gFoldHashes.every((ef) => {
    const f = m16gFolds.folds.find((x) => x.foldId === ef.foldId);
    return (
      !!f &&
      f.historyHash === ef.historyHash &&
      f.futureHash === ef.futureHash &&
      f.nRows === ef.nRows
    );
  });
  if (!foldHashOk) throw new Error("STOP EVALUATION_PROTOCOL_DRIFT fold hashes");

  const freeze = {
    milestone: "M16i",
    timestamp,
    gitCommit,
    gitDirty: dirty,
    evaluationProtocolVersion: EVALUATION_PROTOCOL_VERSION,
    trainSplitHash: EXPECTED_TRAIN,
    validationSplitHash: EXPECTED_VAL,
    reservedTestSplitHash: EXPECTED_RES,
    m16gFoldHashes: m16gFolds.folds.map((f) => ({
      foldId: f.foldId,
      historyHash: f.historyHash,
      futureHash: f.futureHash,
      nRows: f.nRows,
    })),
    m16hCalibrationResult: m16hDecision.CALIBRATION_SELECTION_RESULT,
    approachBVersion: SEQUENTIAL_ATTRIBUTION_VERSION,
    researchPointEstimateVersion: RESEARCH_RATE_VERSION,
    posteriorVersion: RESEARCH_POSTERIOR_VERSION,
    k: RESEARCH_K,
    priorMean: 0,
    calibrationVersion: CALIBRATION_IDENTITY_VERSION,
    legacyUncertaintyVersion: "drbl-uncertainty-v1",
    researchUncertaintyVersion: RESEARCH_PREDICTIVE_UNCERTAINTY_VERSION,
    WAR_version: WAR_FORMULA_VERSION,
    WAR_exposureUnit: WAR_EXPOSURE_UNIT,
    M16B_VALIDATION_USED_FOR_UNCERTAINTY: false,
    RESERVED_TEST_ACCESSED: false,
  };
  await writeFile(path.join(OUT, "00_freeze.json"), JSON.stringify(freeze, null, 2));

  // --- Phase 1 reproduce point estimate ---
  const allRows = parseFoldRows(
    await readFile(path.join(M16G, "04_fold_rows.csv"), "utf8")
  );
  const rates = allRows.map((r) =>
    computeResearchRateV1(
      {
        rawAbilityRate: r.rawPB,
        actualCombinedPossessionAppearances: r.N,
      },
      RESEARCH_RATE_CONFIG_V1
    )
  );
  const maxPeResidual = Math.max(
    ...allRows.map((r, i) => {
      const expected = (r.N / (r.N + RESEARCH_K)) * r.rawPB;
      return Math.abs(rates[i]!.researchFinalDRBL100 - expected);
    })
  );
  const peOk =
    maxPeResidual < 1e-12 &&
    m16hDecision.CALIBRATION_SELECTION_RESULT === "IDENTITY_SELECTED" &&
    m16hDecision.b_final === 1 &&
    rates.every((r) => r.posteriorOperationsApplied === 1) &&
    rates.every((r) => r.calibrationCoefficient === 1) &&
    RESEARCH_POSTERIOR_LAYER_COUNT === 1;

  await writeFile(
    path.join(OUT, "01_point_estimate_reproduction.json"),
    JSON.stringify(
      {
        reproduced: peOk ? "PASS" : "FAIL",
        maxFormulaResidual: maxPeResidual,
        CALIBRATION_SELECTION_RESULT: m16hDecision.CALIBRATION_SELECTION_RESULT,
        calibrationCoefficient: 1,
        posteriorLayerCount: 1,
        fusionInfluence: 0,
        legacyEB200Influence: 0,
        nRows: allRows.length,
        POINT_ESTIMATE_CHANGED: "NO",
      },
      null,
      2
    )
  );
  if (!peOk) throw new Error("STOP LOCKED_POINT_ESTIMATE_REPRODUCTION_FAILURE");

  await writeFile(
    path.join(OUT, "02_uncertainty_semantics.md"),
    `# Uncertainty semantics (M16i)

## Estimand
For each chronological player-fold observation:

\`\`\`text
prediction = FINAL_RESEARCH_DRBL100 = N/(N+1600)*rawAbilityRate
target     = future_block_residual_per_100
error      = target - prediction
\`\`\`

M16i intervals estimate the **empirical range of future player-impact outcomes**
around the locked current DRBL/100 estimate under the historical development distribution.

The interval combines:
- point-estimate error
- future-performance variation
- residual outcome noise present in the future-block target

## Interval type
\`EMPIRICALLY CALIBRATED PREDICTIVE INTERVALS\`
(rolling standardized-residual quantiles × exposure-only scale)

## Does NOT claim
- Bayesian credible intervals for true talent
- frequentist confidence intervals for latent ability
- causal-effect intervals
`
  );

  type Row = {
    foldId: number;
    playerId: string;
    N: number;
    prediction: number;
    target: number;
    error: number;
    reliability: number;
    historyDateMax: string;
    futureDateMin: string;
    futureDateMax: string;
  };
  const rows: Row[] = allRows.map((r, i) => {
    const f = m16gFolds.folds.find((x) => x.foldId === r.foldId)!;
    const pred = rates[i]!.researchFinalDRBL100;
    return {
      foldId: r.foldId,
      playerId: r.playerId,
      N: r.N,
      prediction: pred,
      target: r.target,
      error: r.target - pred,
      reliability: rates[i]!.researchReliability,
      historyDateMax: f.historyDateMax,
      futureDateMin: f.futureDateMin,
      futureDateMax: f.futureDateMax,
    };
  });

  const evalFoldIds = [1, 2, 3, 4];
  const protocol = evalFoldIds.map((evalId) => {
    const trainIds = Array.from({ length: evalId }, (_, i) => i);
    const lastTrain = m16gFolds.folds.find((f) => f.foldId === evalId - 1)!;
    const evalFold = m16gFolds.folds.find((f) => f.foldId === evalId)!;
    const chronological = lastTrain.futureDateMax < evalFold.futureDateMin;
    return {
      name: `UNC_EVAL_${evalId + 1}`,
      evalFoldId: evalId,
      trainFoldIds: trainIds,
      trainFutureDateMax: lastTrain.futureDateMax,
      evalFutureDateMin: evalFold.futureDateMin,
      chronological,
    };
  });
  if (protocol.some((p) => !p.chronological)) {
    throw new Error("STOP chronology failure");
  }
  await writeFile(
    path.join(OUT, "03_uncertainty_protocol.json"),
    JSON.stringify(
      {
        warmUp: "F1",
        evaluationFolds: ["F2", "F3", "F4", "F5"],
        candidates: ["U0_CONSTANT", "U1_INVERSE_SQRT", "U2_FLOOR_PLUS_SAMPLING"],
        scaleFit: "Gaussian NLL on prior-fold residuals",
        quantileFit: "empirical |error|/sigma percentiles on prior folds",
        intervalLevels: [0.5, 0.8, 0.95],
        primaryMetric: "WIS",
        practicalThreshold: PRACTICAL,
        folds: protocol,
        UNCERTAINTY_TRAIN_EVAL_OVERLAP: 0,
        M16B_VALIDATION_USED_FOR_UNCERTAINTY: false,
        RESERVED_TEST_ACCESSED: false,
        note: "TRAIN-development OOS corpus (already used in prior TRAIN research)",
      },
      null,
      2
    )
  );

  type FoldFit = {
    evalFoldId: number;
    trainFoldIds: number[];
    evalIdxs: number[];
    U0: CandParams;
    U1: CandParams;
    U2: CandParams;
    qU0: QuantileParams;
    qU1: QuantileParams;
    qU2: QuantileParams;
  };

  const foldFits: FoldFit[] = [];
  for (const pf of protocol) {
    const trainIdxs = rows
      .map((r, i) => ({ r, i }))
      .filter((x) => pf.trainFoldIds.includes(x.r.foldId))
      .map((x) => x.i);
    const evalIdxs = rows
      .map((r, i) => ({ r, i }))
      .filter((x) => x.r.foldId === pf.evalFoldId)
      .map((x) => x.i);
    const eTr = trainIdxs.map((i) => rows[i]!.error);
    const nTr = trainIdxs.map((i) => rows[i]!.N);
    const U0 = fitCand("U0", eTr, nTr);
    const U1 = fitCand("U1", eTr, nTr);
    const U2 = fitCand("U2", eTr, nTr);
    assertMonotoneSigma(modelTypeOf(U1), U1.params, 50, 15000);
    assertMonotoneSigma(modelTypeOf(U2), U2.params, 50, 15000);
    const sig = (c: CandParams) => nTr.map((n) => sigmaCand(c, n));
    const qU0 = empiricalAbsZQuantiles(eTr, sig(U0));
    const qU1 = empiricalAbsZQuantiles(eTr, sig(U1));
    const qU2 = empiricalAbsZQuantiles(eTr, sig(U2));
    foldFits.push({
      evalFoldId: pf.evalFoldId,
      trainFoldIds: pf.trainFoldIds,
      evalIdxs,
      U0,
      U1,
      U2,
      qU0,
      qU1,
      qU2,
    });
  }

  type EvalPred = {
    gi: number; // global row index
    foldId: number;
    N: number;
    prediction: number;
    target: number;
    error: number;
    reliability: number;
    playerId: string;
    sigmaU0: number;
    sigmaU1: number;
    sigmaU2: number;
    ivU0: ReturnType<typeof computeResearchPredictionIntervalsV1>;
    ivU1: ReturnType<typeof computeResearchPredictionIntervalsV1>;
    ivU2: ReturnType<typeof computeResearchPredictionIntervalsV1>;
    wisU0: number;
    wisU1: number;
    wisU2: number;
  };

  const evalPreds: EvalPred[] = [];
  for (const ff of foldFits) {
    for (const gi of ff.evalIdxs) {
      const r = rows[gi]!;
      const s0 = sigmaCand(ff.U0, r.N);
      const s1 = sigmaCand(ff.U1, r.N);
      const s2 = sigmaCand(ff.U2, r.N);
      const ivU0 = computeResearchPredictionIntervalsV1(r.prediction, r.N, {
        modelType: "U0_CONSTANT",
        params: ff.U0.params,
        quantiles: ff.qU0,
      });
      const ivU1 = computeResearchPredictionIntervalsV1(r.prediction, r.N, {
        modelType: "U1_INVERSE_SQRT",
        params: ff.U1.params,
        quantiles: ff.qU1,
      });
      const ivU2 = computeResearchPredictionIntervalsV1(r.prediction, r.N, {
        modelType: "U2_FLOOR_PLUS_SAMPLING",
        params: ff.U2.params,
        quantiles: ff.qU2,
      });
      evalPreds.push({
        gi,
        foldId: r.foldId,
        N: r.N,
        prediction: r.prediction,
        target: r.target,
        error: r.error,
        reliability: r.reliability,
        playerId: r.playerId,
        sigmaU0: s0,
        sigmaU1: s1,
        sigmaU2: s2,
        ivU0,
        ivU1,
        ivU2,
        wisU0: weightedIntervalScore(
          r.target,
          r.prediction,
          ivU0.researchPI50Lo,
          ivU0.researchPI50Hi,
          ivU0.researchPI80Lo,
          ivU0.researchPI80Hi,
          ivU0.researchPI95Lo,
          ivU0.researchPI95Hi
        ),
        wisU1: weightedIntervalScore(
          r.target,
          r.prediction,
          ivU1.researchPI50Lo,
          ivU1.researchPI50Hi,
          ivU1.researchPI80Lo,
          ivU1.researchPI80Hi,
          ivU1.researchPI95Lo,
          ivU1.researchPI95Hi
        ),
        wisU2: weightedIntervalScore(
          r.target,
          r.prediction,
          ivU2.researchPI50Lo,
          ivU2.researchPI50Hi,
          ivU2.researchPI80Lo,
          ivU2.researchPI80Hi,
          ivU2.researchPI95Lo,
          ivU2.researchPI95Hi
        ),
      });
    }
  }

  await writeFile(
    path.join(OUT, "04_uncertainty_rows.csv"),
    toCsv(
      evalPreds.map((p) => ({
        foldId: p.foldId,
        playerId: p.playerId,
        N: p.N,
        locked_DRBL100: p.prediction,
        target: p.target,
        error: p.error,
        reliability: p.reliability,
        sigma_U0: p.sigmaU0,
        sigma_U1: p.sigmaU1,
        sigma_U2: p.sigmaU2,
        wis_U0: p.wisU0,
        wis_U1: p.wisU1,
        wis_U2: p.wisU2,
      }))
    )
  );

  const nDist = {
    n: evalPreds.length,
    perFold: [1, 2, 3, 4].map((f) => ({
      foldId: f,
      n: evalPreds.filter((p) => p.foldId === f).length,
    })),
    N_mean: mean(evalPreds.map((p) => p.N)),
    N_median: percentile([...evalPreds.map((p) => p.N)].sort((a, b) => a - b), 50),
    N_min: Math.min(...evalPreds.map((p) => p.N)),
    N_max: Math.max(...evalPreds.map((p) => p.N)),
  };

  function coverage(
    preds: EvalPred[],
    pick: (p: EvalPred) => { lo: number; hi: number }
  ): number {
    let hit = 0;
    for (const p of preds) {
      const { lo, hi } = pick(p);
      if (p.target >= lo && p.target <= hi) hit++;
    }
    return hit / (preds.length || 1);
  }
  function meanWidth(
    preds: EvalPred[],
    pick: (p: EvalPred) => { lo: number; hi: number }
  ): number {
    return mean(preds.map((p) => {
      const { lo, hi } = pick(p);
      return hi - lo;
    }));
  }
  function candMetrics(name: "U0" | "U1" | "U2", preds: EvalPred[]) {
    const wis = preds.map((p) =>
      name === "U0" ? p.wisU0 : name === "U1" ? p.wisU1 : p.wisU2
    );
    const sig = preds.map((p) =>
      name === "U0" ? p.sigmaU0 : name === "U1" ? p.sigmaU1 : p.sigmaU2
    );
    const absE = preds.map((p) => Math.abs(p.error));
    const iv =
      name === "U0"
        ? (p: EvalPred) => p.ivU0
        : name === "U1"
          ? (p: EvalPred) => p.ivU1
          : (p: EvalPred) => p.ivU2;
    return {
      candidate: name,
      WIS: mean(wis),
      cov50: coverage(preds, (p) => ({
        lo: iv(p).researchPI50Lo,
        hi: iv(p).researchPI50Hi,
      })),
      cov80: coverage(preds, (p) => ({
        lo: iv(p).researchPI80Lo,
        hi: iv(p).researchPI80Hi,
      })),
      cov95: coverage(preds, (p) => ({
        lo: iv(p).researchPI95Lo,
        hi: iv(p).researchPI95Hi,
      })),
      width50: meanWidth(preds, (p) => ({
        lo: iv(p).researchPI50Lo,
        hi: iv(p).researchPI50Hi,
      })),
      width80: meanWidth(preds, (p) => ({
        lo: iv(p).researchPI80Lo,
        hi: iv(p).researchPI80Hi,
      })),
      width95: meanWidth(preds, (p) => ({
        lo: iv(p).researchPI95Lo,
        hi: iv(p).researchPI95Hi,
      })),
      medianWidth80: percentile(
        preds
          .map((p) => iv(p).researchPI80Hi - iv(p).researchPI80Lo)
          .sort((a, b) => a - b),
        50
      ),
      spearmanSigmaAbsErr: spearman(sig, absE),
      pearsonSigmaAbsErr: pearson(sig, absE),
    };
  }

  const mU0 = candMetrics("U0", evalPreds);
  const mU1 = candMetrics("U1", evalPreds);
  const mU2 = candMetrics("U2", evalPreds);

  const blockIds = evalPreds.map((p) => `fold${p.foldId}`);
  const bootU1 = pairedBlockBootstrapWisDiff(
    evalPreds.map((p) => p.wisU0),
    evalPreds.map((p) => p.wisU1),
    blockIds,
    { resamples: BOOTSTRAP_RESAMPLES, seed: BOOTSTRAP_SEED }
  );
  const bootU2 = pairedBlockBootstrapWisDiff(
    evalPreds.map((p) => p.wisU0),
    evalPreds.map((p) => p.wisU2),
    blockIds,
    { resamples: BOOTSTRAP_RESAMPLES, seed: BOOTSTRAP_SEED }
  );
  const bootU2v1 = pairedBlockBootstrapWisDiff(
    evalPreds.map((p) => p.wisU1),
    evalPreds.map((p) => p.wisU2),
    blockIds,
    { resamples: BOOTSTRAP_RESAMPLES, seed: BOOTSTRAP_SEED }
  );

  await writeFile(
    path.join(OUT, "05_bootstrap_model_comparisons.csv"),
    toCsv([
      {
        comparison: "U1_vs_U0",
        deltaWIS: bootU1.pointEstimate,
        ciLow: bootU1.ciLow,
        ciHigh: bootU1.ciHigh,
        P_candidate_beats: bootU1.probCandidateBeatsBaseline,
      },
      {
        comparison: "U2_vs_U0",
        deltaWIS: bootU2.pointEstimate,
        ciLow: bootU2.ciLow,
        ciHigh: bootU2.ciHigh,
        P_candidate_beats: bootU2.probCandidateBeatsBaseline,
      },
      {
        comparison: "U2_vs_U1",
        deltaWIS: bootU2v1.pointEstimate,
        ciLow: bootU2v1.ciLow,
        ciHigh: bootU2v1.ciHigh,
        P_candidate_beats: bootU2v1.probCandidateBeatsBaseline,
      },
    ])
  );

  await writeFile(
    path.join(OUT, "06_rolling_uncertainty_parameters.csv"),
    toCsv(
      foldFits.map((ff) => ({
        evalFold: `F${ff.evalFoldId + 1}`,
        trainFolds: ff.trainFoldIds.map((i) => `F${i + 1}`).join("+"),
        U0_s: (ff.U0.params as U0Params).s,
        U1_c: (ff.U1.params as U1Params).c,
        U2_sigmaFloor: (ff.U2.params as U2Params).sigmaFloor,
        U2_c: (ff.U2.params as U2Params).c,
        U0_q50: ff.qU0.q50,
        U0_q80: ff.qU0.q80,
        U0_q95: ff.qU0.q95,
        U1_q50: ff.qU1.q50,
        U1_q80: ff.qU1.q80,
        U1_q95: ff.qU1.q95,
        U2_q50: ff.qU2.q50,
        U2_q80: ff.qU2.q80,
        U2_q95: ff.qU2.q95,
      }))
    )
  );

  // Exposure quartiles
  const nSorted = [...evalPreds.map((p) => p.N)].sort((a, b) => a - b);
  const qCuts = [25, 50, 75].map((p) => percentile(nSorted, p));
  function expoQ(n: number) {
    if (n <= qCuts[0]!) return 1;
    if (n <= qCuts[1]!) return 2;
    if (n <= qCuts[2]!) return 3;
    return 4;
  }

  function expoCoverage(name: "U0" | "U1" | "U2") {
    return [1, 2, 3, 4].map((q) => {
      const slice = evalPreds.filter((p) => expoQ(p.N) === q);
      const m = candMetrics(name, slice);
      const iv =
        name === "U0"
          ? (p: EvalPred) => p.ivU0
          : name === "U1"
            ? (p: EvalPred) => p.ivU1
            : (p: EvalPred) => p.ivU2;
      const sig = slice.map((p) =>
        name === "U0" ? p.sigmaU0 : name === "U1" ? p.sigmaU1 : p.sigmaU2
      );
      return {
        candidate: name,
        quartile: `Q${q}`,
        n: slice.length,
        mean_N: mean(slice.map((p) => p.N)),
        mean_sigma: mean(sig),
        mean_abs_error: mae(slice.map((p) => p.error)),
        cov50: m.cov50,
        cov80: m.cov80,
        cov95: m.cov95,
        width80: m.width80,
        width95: m.width95,
        WIS: m.WIS,
      };
    });
  }
  const expoRows = [
    ...expoCoverage("U0"),
    ...expoCoverage("U1"),
    ...expoCoverage("U2"),
  ];
  await writeFile(path.join(OUT, "07_exposure_quartile_coverage.csv"), toCsv(expoRows));

  // Error vs exposure diagnostic
  const errorVsExpo = [1, 2, 3, 4].map((q) => {
    const slice = evalPreds.filter((p) => expoQ(p.N) === q);
    const abs = slice.map((p) => Math.abs(p.error)).sort((a, b) => a - b);
    return {
      quartile: `Q${q}`,
      n: slice.length,
      mean_N: mean(slice.map((p) => p.N)),
      MAE: mae(slice.map((p) => p.error)),
      RMSE: rmse(slice.map((p) => p.error)),
      median_abs_error: percentile(abs, 50),
      P80_abs_error: percentile(abs, 80),
      P95_abs_error: percentile(abs, 95),
    };
  });
  await writeFile(path.join(OUT, "08_error_vs_exposure.csv"), toCsv(errorVsExpo));

  function discrimination(name: "U0" | "U1" | "U2") {
    const ordered = [...evalPreds].sort((a, b) => {
      const sa = name === "U0" ? a.sigmaU0 : name === "U1" ? a.sigmaU1 : a.sigmaU2;
      const sb = name === "U0" ? b.sigmaU0 : name === "U1" ? b.sigmaU1 : b.sigmaU2;
      return sa - sb;
    });
    const size = Math.ceil(ordered.length / 4);
    return [0, 1, 2, 3].map((qi) => {
      const slice = ordered.slice(qi * size, Math.min(ordered.length, (qi + 1) * size));
      const sig = slice.map((p) =>
        name === "U0" ? p.sigmaU0 : name === "U1" ? p.sigmaU1 : p.sigmaU2
      );
      const abs = slice.map((p) => Math.abs(p.error)).sort((a, b) => a - b);
      return {
        candidate: name,
        uncertainty_quartile: `UQ${qi + 1}`,
        n: slice.length,
        mean_predicted_sigma: mean(sig),
        mean_abs_error: mae(slice.map((p) => p.error)),
        RMSE: rmse(slice.map((p) => p.error)),
        P80_abs_error: percentile(abs, 80),
        P95_abs_error: percentile(abs, 95),
      };
    });
  }
  const discRows = [
    ...discrimination("U0"),
    ...discrimination("U1"),
    ...discrimination("U2"),
  ];
  await writeFile(path.join(OUT, "09_uncertainty_discrimination.csv"), toCsv(discRows));

  // Legacy diagnostic (non-eligible): scale without disagreement + optional cap
  const legacyHalf = evalPreds.map((p) => {
    const raw = rawUncertaintyScale(p.N, 0, DEFAULT_DISAGREEMENT_COEF);
    const hw = Math.min(LEGACY_MAX_HW, Math.max(0.15, LEGACY_SCALE_MULT * raw));
    return hw;
  });
  const legacyWis = evalPreds.map((p, i) => {
    const hw = legacyHalf[i]!;
    // treat as PI80-ish half-width only; fabricate nested widths for WIS descriptive
    const m = p.prediction;
    const w80 = 2 * hw;
    const w50 = w80 * (0.7 / 1.3);
    const w95 = w80 * (2.0 / 1.3);
    return weightedIntervalScore(
      p.target,
      m,
      m - w50 / 2,
      m + w50 / 2,
      m - w80 / 2,
      m + w80 / 2,
      m - w95 / 2,
      m + w95 / 2
    );
  });
  await writeFile(
    path.join(OUT, "10_legacy_uncertainty_diagnostic.csv"),
    toCsv([
      {
        model: "LEGACY_UNCERTAINTY_DIAGNOSTIC",
        eligible: "NO",
        disagreementUsed: "NO (fold rows lack LN/B; disagreement set to 0)",
        cap: LEGACY_MAX_HW,
        scaleMultiplier: LEGACY_SCALE_MULT,
        descriptive_WIS: mean(legacyWis),
        spearman_hw_absErr: spearman(
          legacyHalf,
          evalPreds.map((p) => Math.abs(p.error))
        ),
        mean_half_width: mean(legacyHalf),
        note: "Non-eligible descriptive only; not recalibrated for promotion",
      },
    ])
  );

  await writeFile(
    path.join(OUT, "11_product_semantics.md"),
    `# Product semantics recommendation (M16i)

## Scientific object
Rolling empirically calibrated **predictive intervals** for future R1-centered
player impact around the locked DRBL/100.

## Preferred UI wording
- Predictive range
- Expected impact range
- DRBL predictive interval (50% / 80% / 95%)

## Avoid
- "95% confidence that true talent is here"
- "standard error of ability"
- implying LN/B disagreement drives uncertainty

## Single display number
Choosing PI50 vs PI80 vs PI95 for a single UI half-width is a **product** decision
after scientific lock — not part of M16i model selection.
`
  );

  // Fold WIS
  const foldWis = [1, 2, 3, 4].map((f) => {
    const slice = evalPreds.filter((p) => p.foldId === f);
    return {
      fold: `F${f + 1}`,
      WIS_U0: mean(slice.map((p) => p.wisU0)),
      WIS_U1: mean(slice.map((p) => p.wisU1)),
      WIS_U2: mean(slice.map((p) => p.wisU2)),
      U1_beats_U0: mean(slice.map((p) => p.wisU1)) < mean(slice.map((p) => p.wisU0)),
      U2_beats_U0: mean(slice.map((p) => p.wisU2)) < mean(slice.map((p) => p.wisU0)),
    };
  });
  const u1FoldWins = foldWis.filter((f) => f.U1_beats_U0).length;
  const u2FoldWins = foldWis.filter((f) => f.U2_beats_U0).length;

  await writeFile(
    path.join(OUT, "13_interval_coverage.csv"),
    toCsv(
      (["U0", "U1", "U2"] as const).map((c) => {
        const m = c === "U0" ? mU0 : c === "U1" ? mU1 : mU2;
        return {
          candidate: c,
          cov50: m.cov50,
          cov80: m.cov80,
          cov95: m.cov95,
          gate50: m.cov50 >= 0.45 && m.cov50 <= 0.55,
          gate80: m.cov80 >= 0.75 && m.cov80 <= 0.85,
          gate95: m.cov95 >= 0.9 && m.cov95 <= 1.0,
        };
      })
    )
  );

  await writeFile(
    path.join(OUT, "14_interval_widths.csv"),
    toCsv(
      (["U0", "U1", "U2"] as const).map((c) => {
        const m = c === "U0" ? mU0 : c === "U1" ? mU1 : mU2;
        return {
          candidate: c,
          mean_PI50_width: m.width50,
          mean_PI80_width: m.width80,
          mean_PI95_width: m.width95,
          median_PI80_width: m.medianWidth80,
        };
      })
    )
  );

  // Catastrophic coverage by quartile
  function catastrophic(name: "U0" | "U1" | "U2"): boolean {
    return [1, 2, 3, 4].some((q) => {
      const row = expoRows.find(
        (r) => r.candidate === name && r.quartile === `Q${q}`
      )!;
      return row.cov80 < 0.7 || row.cov95 < 0.85;
    });
  }
  const catU1 = catastrophic("U1");
  const catU2 = catastrophic("U2");
  const catU0 = catastrophic("U0");

  function coverageGatesOk(m: typeof mU0): boolean {
    return (
      m.cov50 >= 0.45 &&
      m.cov50 <= 0.55 &&
      m.cov80 >= 0.75 &&
      m.cov80 <= 0.85 &&
      m.cov95 >= 0.9 &&
      m.cov95 <= 1.0
    );
  }

  const u1Rel = (mU0.WIS - mU1.WIS) / mU0.WIS;
  const u2Rel = (mU0.WIS - mU2.WIS) / mU0.WIS;
  const u1Clears =
    mU1.WIS < mU0.WIS &&
    u1Rel >= PRACTICAL &&
    bootU1.probCandidateBeatsBaseline >= 0.95 &&
    u1FoldWins >= 3 &&
    !catU1 &&
    coverageGatesOk(mU1);
  const u2Clears =
    mU2.WIS < mU0.WIS &&
    u2Rel >= PRACTICAL &&
    bootU2.probCandidateBeatsBaseline >= 0.95 &&
    u2FoldWins >= 3 &&
    !catU2 &&
    coverageGatesOk(mU2);

  await writeFile(
    path.join(OUT, "12_candidate_metrics.csv"),
    toCsv([
      {
        candidate: "U0",
        WIS: mU0.WIS,
        cov50: mU0.cov50,
        cov80: mU0.cov80,
        cov95: mU0.cov95,
        width50: mU0.width50,
        width80: mU0.width80,
        width95: mU0.width95,
        spearmanSigmaAbsErr: mU0.spearmanSigmaAbsErr,
        deltaWIS_vs_U0: 0,
        relImp: 0,
        foldWins: "n/a",
        clears_U0_gates: "baseline",
      },
      {
        candidate: "U1",
        WIS: mU1.WIS,
        cov50: mU1.cov50,
        cov80: mU1.cov80,
        cov95: mU1.cov95,
        width50: mU1.width50,
        width80: mU1.width80,
        width95: mU1.width95,
        spearmanSigmaAbsErr: mU1.spearmanSigmaAbsErr,
        deltaWIS_vs_U0: mU1.WIS - mU0.WIS,
        relImp: u1Rel,
        foldWins: `${u1FoldWins}/4`,
        clears_U0_gates: u1Clears,
      },
      {
        candidate: "U2",
        WIS: mU2.WIS,
        cov50: mU2.cov50,
        cov80: mU2.cov80,
        cov95: mU2.cov95,
        width50: mU2.width50,
        width80: mU2.width80,
        width95: mU2.width95,
        spearmanSigmaAbsErr: mU2.spearmanSigmaAbsErr,
        deltaWIS_vs_U0: mU2.WIS - mU0.WIS,
        relImp: u2Rel,
        foldWins: `${u2FoldWins}/4`,
        clears_U0_gates: u2Clears,
      },
      ...foldWis.map((f) => ({
        candidate: "fold",
        WIS: "",
        cov50: "",
        cov80: "",
        cov95: "",
        width50: "",
        width80: "",
        width95: "",
        spearmanSigmaAbsErr: "",
        deltaWIS_vs_U0: "",
        relImp: "",
        foldWins: f.fold,
        clears_U0_gates: `U0=${f.WIS_U0};U1=${f.WIS_U1};U2=${f.WIS_U2}`,
      })),
    ])
  );

  // U2 collapse
  const u2Params = foldFits.map((f) => f.U2.params as U2Params);
  const meanSf = mean(u2Params.map((p) => p.sigmaFloor));
  const meanC = mean(u2Params.map((p) => p.c));
  const u0s = foldFits.map((f) => (f.U0.params as U0Params).s);
  const u1c = foldFits.map((f) => (f.U1.params as U1Params).c);
  let collapses: "CONSTANT" | "INVERSE_SQRT" | "NO" = "NO";
  if (meanC / (mean(u1c) || 1) < 0.05) collapses = "CONSTANT";
  else if (meanSf / (mean(u0s) || 1) < 0.05) collapses = "INVERSE_SQRT";

  let UNCERTAINTY_SELECTION_RESULT:
    | "CONSTANT_SCALE_SELECTED"
    | "INVERSE_SQRT_SELECTED"
    | "FLOOR_PLUS_SAMPLING_SELECTED"
    | "UNCERTAINTY_BLOCKED";

  if (!u1Clears && !u2Clears) {
    UNCERTAINTY_SELECTION_RESULT = "CONSTANT_SCALE_SELECTED";
  } else if (u1Clears && !u2Clears) {
    UNCERTAINTY_SELECTION_RESULT = "INVERSE_SQRT_SELECTED";
  } else if (!u1Clears && u2Clears) {
    UNCERTAINTY_SELECTION_RESULT =
      collapses === "CONSTANT"
        ? "CONSTANT_SCALE_SELECTED"
        : collapses === "INVERSE_SQRT"
          ? "INVERSE_SQRT_SELECTED"
          : "FLOOR_PLUS_SAMPLING_SELECTED";
  } else {
    // both clear
    const relU2U1 = Math.abs(mU2.WIS - mU1.WIS) / mU1.WIS;
    if (relU2U1 < PRACTICAL && bootU2v1.probCandidateBeatsBaseline < 0.95) {
      UNCERTAINTY_SELECTION_RESULT = "INVERSE_SQRT_SELECTED";
    } else if (mU2.WIS < mU1.WIS) {
      UNCERTAINTY_SELECTION_RESULT =
        collapses === "INVERSE_SQRT"
          ? "INVERSE_SQRT_SELECTED"
          : collapses === "CONSTANT"
            ? "CONSTANT_SCALE_SELECTED"
            : "FLOOR_PLUS_SAMPLING_SELECTED";
    } else {
      UNCERTAINTY_SELECTION_RESULT = "INVERSE_SQRT_SELECTED";
    }
  }

  // Tail symmetry on selected candidate (use U0 if constant, etc.)
  const selectedName: "U0" | "U1" | "U2" =
    UNCERTAINTY_SELECTION_RESULT === "CONSTANT_SCALE_SELECTED"
      ? "U0"
      : UNCERTAINTY_SELECTION_RESULT === "INVERSE_SQRT_SELECTED"
        ? "U1"
        : "U2";
  const selectedIv = (p: EvalPred) =>
    selectedName === "U0" ? p.ivU0 : selectedName === "U1" ? p.ivU1 : p.ivU2;

  const errors = evalPreds.map((p) => p.error);
  const posShare = errors.filter((e) => e > 0).length / errors.length;
  const negShare = errors.filter((e) => e < 0).length / errors.length;
  let lowerMiss80 = 0;
  let upperMiss80 = 0;
  for (const p of evalPreds) {
    const iv = selectedIv(p);
    if (p.target < iv.researchPI80Lo) lowerMiss80++;
    if (p.target > iv.researchPI80Hi) upperMiss80++;
  }
  const lowerMissRate = lowerMiss80 / evalPreds.length;
  const upperMissRate = upperMiss80 / evalPreds.length;

  // asymmetry persistence across folds
  let asymFolds = 0;
  for (const f of [1, 2, 3, 4]) {
    const slice = evalPreds.filter((p) => p.foldId === f);
    let lo = 0,
      hi = 0;
    for (const p of slice) {
      const iv = selectedIv(p);
      if (p.target < iv.researchPI80Lo) lo++;
      if (p.target > iv.researchPI80Hi) hi++;
    }
    const lr = lo / slice.length;
    const ur = hi / slice.length;
    if (Math.abs(lr - ur) > 0.05 && Math.max(lr, ur) > 0.15) asymFolds++;
  }
  const ASYMMETRIC_INTERVAL_REVIEW_REQUIRED = asymFolds >= 3 ? "YES" : "NO";

  const posTail = errors.filter((e) => e > 0).sort((a, b) => a - b);
  const negTail = errors.filter((e) => e < 0).map(Math.abs).sort((a, b) => a - b);
  await writeFile(
    path.join(OUT, "15_tail_symmetry.csv"),
    toCsv([
      {
        selected: selectedName,
        P_error_gt0: posShare,
        P_error_lt0: negShare,
        mean_error: mean(errors),
        median_error: percentile([...errors].sort((a, b) => a - b), 50),
        P95_positive_residual: percentile(posTail, 95),
        P95_abs_negative_residual: percentile(negTail, 95),
        PI80_lower_miss_rate: lowerMissRate,
        PI80_upper_miss_rate: upperMissRate,
        asym_folds_flagged: asymFolds,
        ASYMMETRIC_INTERVAL_REVIEW_REQUIRED,
      },
    ])
  );

  // Final fit on all F1-F5
  const allErr = rows.map((r) => r.error);
  const allN = rows.map((r) => r.N);
  let finalConfig: {
    modelType: UncertaintyModelType;
    params: U0Params | U1Params | U2Params;
    quantiles: QuantileParams;
  };
  if (selectedName === "U0") {
    const params = fitU0(allErr);
    const sig = allN.map((n) => sigmaCand({ model: "U0", params }, n));
    finalConfig = {
      modelType: "U0_CONSTANT",
      params,
      quantiles: empiricalAbsZQuantiles(allErr, sig),
    };
  } else if (selectedName === "U1") {
    const params = fitU1(allErr, allN);
    const sig = allN.map((n) => sigmaCand({ model: "U1", params }, n));
    finalConfig = {
      modelType: "U1_INVERSE_SQRT",
      params,
      quantiles: empiricalAbsZQuantiles(allErr, sig),
    };
  } else {
    const f = fitU2(allErr, allN);
    const params = { sigmaFloor: f.sigmaFloor, c: f.c };
    const sig = allN.map((n) => sigmaCand({ model: "U2", params }, n));
    finalConfig = {
      modelType: "U2_FLOOR_PLUS_SAMPLING",
      params,
      quantiles: empiricalAbsZQuantiles(allErr, sig),
    };
  }

  await writeFile(
    path.join(OUT, "16_final_uncertainty_parameters.json"),
    JSON.stringify(
      {
        version: RESEARCH_PREDICTIVE_UNCERTAINTY_VERSION,
        pointEstimateVersion: RESEARCH_RATE_VERSION,
        UNCERTAINTY_SELECTION_RESULT,
        modelType: finalConfig.modelType,
        params: finalConfig.params,
        quantiles: finalConfig.quantiles,
        exposureDefinition: "actual_combined_possession_appearances",
        intervalSemantics: "empirically_calibrated_predictive",
        trainingProtocol: "chronological_OOS_F1_to_F5_after_selection",
        UNCERTAINTY_PSEUDO_EXPOSURE: "NO",
        UNCERTAINTY_CAP_USED: "NO",
        LEGACY_DISAGREEMENT_USED: "NO",
      },
      null,
      2
    )
  );

  const decision = {
    candidates: ["U0", "U1", "U2"],
    U0_WIS: mU0.WIS,
    U1_WIS: mU1.WIS,
    U2_WIS: mU2.WIS,
    U1_relImp: u1Rel,
    U2_relImp: u2Rel,
    U1_bootstrapP: bootU1.probCandidateBeatsBaseline,
    U2_bootstrapP: bootU2.probCandidateBeatsBaseline,
    U1_foldWins: `${u1FoldWins}/4`,
    U2_foldWins: `${u2FoldWins}/4`,
    U1_clears_gates: u1Clears,
    U2_clears_gates: u2Clears,
    U2_collapse: collapses,
    catastrophic: { U0: catU0, U1: catU1, U2: catU2 },
    coverageGates: {
      U0: coverageGatesOk(mU0),
      U1: coverageGatesOk(mU1),
      U2: coverageGatesOk(mU2),
    },
    UNCERTAINTY_SELECTION_RESULT,
    finalConfig,
    ASYMMETRIC_INTERVAL_REVIEW_REQUIRED,
    lockedBeforeLeaderboardInspection: true,
    practicalThreshold: PRACTICAL,
  };
  await writeFile(
    path.join(OUT, "17_uncertainty_selection_decision.json"),
    JSON.stringify(decision, null, 2)
  );

  // Identity tests
  const idCases = [
    { n: 100, pred: 1 },
    { n: 800, pred: -0.5 },
    { n: 5000, pred: 0 },
    { n: 50, pred: 2.5 },
  ].map((c) => {
    const iv = computeResearchPredictionIntervalsV1(
      c.pred,
      c.n,
      finalConfig
    );
    return {
      N: c.n,
      locked_DRBL100: c.pred,
      sigma: iv.researchPredictiveSigma,
      PI50Lo: iv.researchPI50Lo,
      PI50Hi: iv.researchPI50Hi,
      PI80Lo: iv.researchPI80Lo,
      PI80Hi: iv.researchPI80Hi,
      PI95Lo: iv.researchPI95Lo,
      PI95Hi: iv.researchPI95Hi,
      centered: (iv.researchPI80Lo + iv.researchPI80Hi) / 2 === c.pred,
      nested:
        iv.researchPI50Hi - iv.researchPI50Lo <=
          iv.researchPI80Hi - iv.researchPI80Lo + 1e-12 &&
        iv.researchPI80Hi - iv.researchPI80Lo <=
          iv.researchPI95Hi - iv.researchPI95Lo + 1e-12,
    };
  });
  await writeFile(path.join(OUT, "18_research_interval_identity.csv"), toCsv(idCases));

  const selectedMetrics =
    selectedName === "U0" ? mU0 : selectedName === "U1" ? mU1 : mU2;
  const selExpo = expoRows.filter((r) => r.candidate === selectedName);
  const discSel = discrimination(selectedName);
  const narrowMae = discSel.find((d) => d.uncertainty_quartile === "UQ1")!
    .mean_abs_error;
  const wideMae = discSel.find((d) => d.uncertainty_quartile === "UQ4")!
    .mean_abs_error;

  const RESEARCH_RATE_MODEL_FREEZE_READY =
    UNCERTAINTY_SELECTION_RESULT !== "UNCERTAINTY_BLOCKED" ? "YES" : "NO";

  // Stability classification
  function stability(vals: number[]): string {
    const mn = Math.min(...vals);
    const mx = Math.max(...vals);
    if (mn <= 0) return "UNSTABLE";
    const ratio = mx / mn;
    if (ratio <= 1.25) return "STABLE";
    if (ratio <= 1.5) return "MODERATE_VARIATION";
    return "UNSTABLE";
  }

  const modelHealth = {
    M16H_POINT_ESTIMATE_REPRODUCED: "PASS",
    M16B_HASHES_MATCH: "PASS",
    M16G_FOLD_HASHES_MATCH: "PASS",
    POINT_ESTIMATE_CHANGED: "NO",
    POINT_ESTIMATE_VERSION: RESEARCH_RATE_VERSION,
    UNCERTAINTY_ESTIMAND: "FUTURE_PREDICTIVE_ERROR",
    UNCERTAINTY_INPUTS: "EXPOSURE_ONLY",
    UNCERTAINTY_PROTOCOL_CHRONOLOGICAL: "PASS",
    UNCERTAINTY_TRAIN_EVAL_OVERLAP: 0,
    M16B_VALIDATION_USED_FOR_UNCERTAINTY: "NO",
    RESERVED_TEST_ACCESSED: "NO",
    U0_WIS: mU0.WIS,
    U1_WIS: mU1.WIS,
    U2_WIS: mU2.WIS,
    U1_RELATIVE_IMPROVEMENT_VS_U0: u1Rel,
    U2_RELATIVE_IMPROVEMENT_VS_U0: u2Rel,
    U1_BOOTSTRAP_P: bootU1.probCandidateBeatsBaseline,
    U2_BOOTSTRAP_P: bootU2.probCandidateBeatsBaseline,
    U1_FOLD_WINS: `${u1FoldWins}/4`,
    U2_FOLD_WINS: `${u2FoldWins}/4`,
    SELECTED_50_COVERAGE: selectedMetrics.cov50,
    SELECTED_80_COVERAGE: selectedMetrics.cov80,
    SELECTED_95_COVERAGE: selectedMetrics.cov95,
    SELECTED_80_MEAN_WIDTH: selectedMetrics.width80,
    SELECTED_95_MEAN_WIDTH: selectedMetrics.width95,
    SELECTED_SIGMA_ABSERROR_SPEARMAN: selectedMetrics.spearmanSigmaAbsErr,
    UNCERTAINTY_PSEUDO_EXPOSURE: "NO",
    LEGACY_DISAGREEMENT_USED_IN_SELECTED_MODEL: "NO",
    UNCERTAINTY_CAP_USED: "NO",
    ASYMMETRIC_INTERVAL_REVIEW_REQUIRED,
    UNCERTAINTY_SELECTION_RESULT,
    RESEARCH_RATE_MODEL_FREEZE_READY,
    PRODUCTION_CHANGED: "NO",
    WAR_CHANGED: "NO",
    nEval: evalPreds.length,
    nDist,
    stability: {
      U0_s: stability(u0s),
      U1_c: stability(u1c),
      U2_sf: stability(u2Params.map((p) => p.sigmaFloor || 1e-12)),
      U2_c: stability(u2Params.map((p) => p.c || 1e-12)),
    },
    U2_collapse: collapses,
    selectedName,
    finalConfig,
    errorVsExpo,
    discrimination: discSel,
    selExpo,
    narrowMae,
    wideMae,
    bootstrap: { bootU1, bootU2, bootU2v1 },
    metrics: { mU0, mU1, mU2 },
    foldWis,
    legacyDescriptiveWIS: mean(legacyWis),
  };
  await writeFile(
    path.join(OUT, "19_model_health.json"),
    JSON.stringify(modelHealth, null, 2)
  );

  // Charts
  await writeFile(
    path.join(CHARTS, "abs_error_vs_exposure.svg"),
    svgScatter(
      evalPreds.map((p) => ({ x: p.N, y: Math.abs(p.error) })),
      "Absolute error vs exposure",
      "N",
      "|error|"
    )
  );
  await writeFile(
    path.join(CHARTS, "mae_by_exposure_quartile.svg"),
    svgBars(
      errorVsExpo.map((r) => ({ label: String(r.quartile), value: Number(r.MAE) })),
      "MAE by exposure quartile",
      "MAE"
    )
  );
  await writeFile(
    path.join(CHARTS, "rmse_by_exposure_quartile.svg"),
    svgBars(
      errorVsExpo.map((r) => ({ label: String(r.quartile), value: Number(r.RMSE) })),
      "RMSE by exposure quartile",
      "RMSE"
    )
  );
  const selSigma = (p: EvalPred) =>
    selectedName === "U0" ? p.sigmaU0 : selectedName === "U1" ? p.sigmaU1 : p.sigmaU2;
  await writeFile(
    path.join(CHARTS, "predicted_sigma_vs_exposure.svg"),
    svgScatter(
      evalPreds.map((p) => ({ x: p.N, y: selSigma(p) })),
      `Predicted sigma (${selectedName}) vs exposure`,
      "N",
      "sigma"
    )
  );
  await writeFile(
    path.join(CHARTS, "sigma_vs_abs_error.svg"),
    svgScatter(
      evalPreds.map((p) => ({ x: selSigma(p), y: Math.abs(p.error) })),
      "Predicted sigma vs |error|",
      "sigma",
      "|error|"
    )
  );
  await writeFile(
    path.join(CHARTS, "coverage_vs_nominal.svg"),
    svgBars(
      [
        { label: "50%", value: selectedMetrics.cov50 },
        { label: "80%", value: selectedMetrics.cov80 },
        { label: "95%", value: selectedMetrics.cov95 },
      ],
      "Selected coverage vs nominal",
      "coverage"
    )
  );
  await writeFile(
    path.join(CHARTS, "coverage_by_exposure_q_pi80.svg"),
    svgBars(
      selExpo.map((r) => ({ label: String(r.quartile), value: Number(r.cov80) })),
      "Selected PI80 coverage by exposure Q",
      "coverage"
    )
  );
  await writeFile(
    path.join(CHARTS, "width_by_exposure_q_pi80.svg"),
    svgBars(
      selExpo.map((r) => ({ label: String(r.quartile), value: Number(r.width80) })),
      "Selected PI80 width by exposure Q",
      "width"
    )
  );
  await writeFile(
    path.join(CHARTS, "wis_by_candidate.svg"),
    svgBars(
      [
        { label: "U0", value: mU0.WIS },
        { label: "U1", value: mU1.WIS },
        { label: "U2", value: mU2.WIS },
      ],
      "Pooled WIS by candidate",
      "WIS"
    )
  );
  await writeFile(
    path.join(CHARTS, "per_fold_wis.svg"),
    svgBars(
      foldWis.flatMap((f) => [
        { label: `${f.fold}U0`, value: Number(f.WIS_U0) },
        { label: `${f.fold}U1`, value: Number(f.WIS_U1) },
        { label: `${f.fold}U2`, value: Number(f.WIS_U2) },
      ]),
      "Per-fold WIS",
      "WIS"
    )
  );
  // bootstrap hist for U2-U0
  {
    const diffs: number[] = [];
    let t = BOOTSTRAP_SEED >>> 0;
    const rng = () => {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
    const blocks = new Map<string, number[]>();
    for (let i = 0; i < blockIds.length; i++) {
      const arr = blocks.get(blockIds[i]!) ?? [];
      arr.push(i);
      blocks.set(blockIds[i]!, arr);
    }
    const keys = [...blocks.keys()];
    for (let r = 0; r < 400; r++) {
      const sampled: number[] = [];
      for (let b = 0; b < keys.length; b++) {
        const key = keys[Math.floor(rng() * keys.length)]!;
        sampled.push(...(blocks.get(key) ?? []));
      }
      let s = 0;
      for (const i of sampled) s += evalPreds[i]!.wisU2 - evalPreds[i]!.wisU0;
      diffs.push(s / sampled.length);
    }
    await writeFile(
      path.join(CHARTS, "bootstrap_delta_wis_u2_u0.svg"),
      svgHist(diffs, "Bootstrap ΔWIS (U2−U0)", "ΔWIS")
    );
  }
  const zStd = evalPreds.map((p) => Math.abs(p.error) / selSigma(p));
  await writeFile(
    path.join(CHARTS, "standardized_residual_abs.svg"),
    svgHist(zStd, "Standardized |error|/sigma (selected)", "|z|")
  );
  await writeFile(
    path.join(CHARTS, "residual_signed_hist.svg"),
    svgHist(errors, "Signed predictive residuals", "error")
  );
  // anonymized PI examples
  const examples = [...evalPreds]
    .sort((a, b) => a.N - b.N)
    .filter((_, i) => i % Math.ceil(evalPreds.length / 12) === 0)
    .slice(0, 12);
  await writeFile(
    path.join(CHARTS, "pi80_examples.svg"),
    svgBars(
      examples.map((p, i) => ({
        label: `r${i + 1}`,
        value: selectedIv(p).researchPI80Hi - selectedIv(p).researchPI80Lo,
      })),
      "Anonymized PI80 widths (sample rows)",
      "width"
    )
  );
  await writeFile(
    path.join(CHARTS, "pi95_examples.svg"),
    svgBars(
      examples.map((p, i) => ({
        label: `r${i + 1}`,
        value: selectedIv(p).researchPI95Hi - selectedIv(p).researchPI95Lo,
      })),
      "Anonymized PI95 widths (sample rows)",
      "width"
    )
  );
  await writeFile(
    path.join(CHARTS, "legacy_hw_vs_abs_error.svg"),
    svgScatter(
      evalPreds.map((p, i) => ({ x: legacyHalf[i]!, y: Math.abs(p.error) })),
      "Legacy half-width vs |error| (diagnostic)",
      "legacy HW",
      "|error|"
    )
  );

  const charts = (await readdir(CHARTS)).sort();
  await writeFile(
    path.join(OUT, "20_full_audit.md"),
    `# M16i full audit

## Selection
**${UNCERTAINTY_SELECTION_RESULT}** (${selectedName})

## WIS
- U0: ${mU0.WIS}
- U1: ${mU1.WIS} (rel ${(u1Rel * 100).toFixed(3)}%, P=${bootU1.probCandidateBeatsBaseline}, folds ${u1FoldWins}/4)
- U2: ${mU2.WIS} (rel ${(u2Rel * 100).toFixed(3)}%, P=${bootU2.probCandidateBeatsBaseline}, folds ${u2FoldWins}/4)

## Selected coverage
50%=${selectedMetrics.cov50}, 80%=${selectedMetrics.cov80}, 95%=${selectedMetrics.cov95}

## Final params
${JSON.stringify(finalConfig, null, 2)}

## Freeze readiness
RESEARCH_RATE_MODEL_FREEZE_READY = ${RESEARCH_RATE_MODEL_FREEZE_READY}

## Charts
${charts.map((c) => `- charts/${c}`).join("\n")}
`
  );

  await writeFile(
    path.join(OUT, "21_final_response_values.json"),
    JSON.stringify(
      {
        freeze,
        decision,
        modelHealth,
        mU0,
        mU1,
        mU2,
        selectedName,
        finalConfig,
        errorVsExpo,
        selExpo,
        discSel,
        ASYMMETRIC_INTERVAL_REVIEW_REQUIRED,
        RESEARCH_RATE_MODEL_FREEZE_READY,
      },
      null,
      2
    )
  );

  console.log(
    JSON.stringify(
      {
        status: "M16i_COMPLETE",
        UNCERTAINTY_SELECTION_RESULT,
        selectedName,
        U0_WIS: mU0.WIS,
        U1_WIS: mU1.WIS,
        U2_WIS: mU2.WIS,
        RESEARCH_RATE_MODEL_FREEZE_READY,
        out: OUT,
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
