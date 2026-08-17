/**
 * M16i1 — conditional coverage repair via direct absolute-error quantiles.
 *   npm run drbl:m16i1
 *
 * Point estimate LOCKED. M16i corrected: NO_ELIGIBLE_CANDIDATE.
 * Candidates: Q0/Q1/Q2 direct quantiles of |future error| | N.
 * No M16b VALIDATION. No RESERVED_TEST. No production overwrite.
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
import { pearson, spearman } from "../drbl/evaluation/metrics";
import { SEQUENTIAL_ATTRIBUTION_VERSION } from "../drbl/models/sequential-attribution";
import {
  CALIBRATION_IDENTITY_VERSION,
  RESEARCH_RATE_CONFIG_V1,
  RESEARCH_RATE_VERSION,
  computeResearchRateV1,
} from "../drbl/models/research-rate-v1";
import {
  RESEARCH_K,
  RESEARCH_POSTERIOR_VERSION,
} from "../drbl/models/research-ability-v1";
import {
  assertMonotoneSigma,
  computeResearchPredictionIntervalsV1,
  empiricalAbsZQuantiles,
  fitU0,
  fitU1,
  fitU2,
  sigmaOf,
  weightedIntervalScore,
  type QuantileParams,
  type U0Params,
  type U1Params,
  type U2Params,
} from "../drbl/models/research-predictive-uncertainty-v1";
import {
  RESEARCH_PREDICTIVE_INTERVAL_V2,
  assertWidthMonotoneInN,
  fitQ0,
  fitQ1,
  fitQ2,
  intervalsFromWidths,
  q2CollapseStatus,
  widthsOf,
  type DirectQuantileModel,
  type Q0Params,
  type Q1Params,
  type Q2Params,
} from "../drbl/models/research-direct-quantile-uncertainty-v2";
import {
  WAR_EXPOSURE_UNIT,
  WAR_FORMULA_VERSION,
} from "../drbl/models/pipeline-value";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m16i1");
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
const CCE_IMPROVE = 0.1;
const BOOTSTRAP_RESAMPLES = METRIC_CONTRACT.practicalSignificance.bootstrapResamples;
const BOOTSTRAP_SEED = 42;

const M16I_EXPECTED = {
  u0Wis: 4.43626047461963,
  u1Wis: 4.37438731883086,
  u2Wis: 4.314058843592033,
  u0Q1Pi80: 0.6133004926108374,
  u0Q1Pi95: 0.8226600985221675,
  u2Rel: 0.02754609016461653,
  u2Spearman: 0.2501169308096455,
};

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
function mae(xs: number[]): number {
  return mean(xs.map(Math.abs));
}
function rmse(xs: number[]): number {
  return Math.sqrt(mean(xs.map((x) => x * x)));
}
function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((p / 100) * (sorted.length - 1)))
  );
  return sorted[idx]!;
}

async function loadSplitList(
  name: "train" | "validation" | "reserved_test"
): Promise<SplitGame[]> {
  const file =
    name === "reserved_test"
      ? "reserved_test_game_ids.json"
      : `${name}_game_ids.json`;
  const raw = JSON.parse(
    await readFile(path.join(ROOT, "reports/m16b/splits", file), "utf8")
  ) as { games?: SplitGame[] } | SplitGame[];
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

function pairedBlockBootstrapWisDiff(
  wisBaseline: number[],
  wisCandidate: number[],
  blockIds: string[]
) {
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
  const pointEstimate = diffOf(Array.from({ length: n }, (_, i) => i));
  let t = BOOTSTRAP_SEED >>> 0;
  const rng = () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const diffs: number[] = [];
  for (let r = 0; r < BOOTSTRAP_RESAMPLES; r++) {
    const sampled: number[] = [];
    for (let b = 0; b < keys.length; b++) {
      const key = keys[Math.floor(rng() * keys.length)]!;
      sampled.push(...(blocks.get(key) ?? []));
    }
    diffs.push(diffOf(sampled));
  }
  diffs.sort((a, b) => a - b);
  return {
    pointEstimate,
    ciLow: diffs[Math.floor(0.025 * diffs.length)]!,
    ciHigh: diffs[Math.min(diffs.length - 1, Math.floor(0.975 * diffs.length))]!,
    probCandidateBeatsBaseline: diffs.filter((d) => d < 0).length / diffs.length,
  };
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
  const vmax = Math.max(0, ...vals);
  const dy = vmax - vmin || 1;
  const barW = (w - 2 * pad) / Math.max(1, items.length);
  const zeroY = h - pad - ((0 - vmin) / dy) * (h - 2 * pad);
  const bars = items
    .map((it, i) => {
      const y = h - pad - ((it.value - vmin) / dy) * (h - 2 * pad);
      const top = Math.min(y, zeroY);
      const bh = Math.max(1, Math.abs(y - zeroY));
      return `<rect x="${(pad + i * barW + 3).toFixed(1)}" y="${top.toFixed(1)}" width="${(barW - 6).toFixed(1)}" height="${bh.toFixed(1)}" fill="#1f4e79"/><text x="${(pad + i * barW + barW / 2).toFixed(1)}" y="${h - 14}" text-anchor="middle" font-size="9">${it.label}</text>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#fafafa"/><text x="${w / 2}" y="22" text-anchor="middle" font-size="13">${title}</text><text x="12" y="${h / 2}" text-anchor="middle" font-size="11" transform="rotate(-90 12 ${h / 2})">${ylab}</text>${bars}</svg>`;
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
    .slice(0, 2000)
    .map(
      (p) =>
        `<circle cx="${mapX(p.x).toFixed(1)}" cy="${mapY(p.y).toFixed(1)}" r="2" fill="#1f4e79" fill-opacity="0.35"/>`
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#fafafa"/><text x="${w / 2}" y="22" text-anchor="middle" font-size="13">${title}</text><text x="${w / 2}" y="${h - 10}" text-anchor="middle" font-size="11">${xlab}</text><text x="12" y="${h / 2}" text-anchor="middle" font-size="11" transform="rotate(-90 12 ${h / 2})">${ylab}</text>${dots}</svg>`;
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
  const m16hDecision = JSON.parse(
    await readFile(path.join(M16H, "16_calibration_selection_decision.json"), "utf8")
  ) as { CALIBRATION_SELECTION_RESULT: string; b_final: number };

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

  await writeFile(
    path.join(OUT, "00_freeze.json"),
    JSON.stringify(
      {
        milestone: "M16i1",
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
        pointEstimateVersion: RESEARCH_RATE_VERSION,
        posteriorVersion: RESEARCH_POSTERIOR_VERSION,
        k: RESEARCH_K,
        priorMean: 0,
        calibrationVersion: CALIBRATION_IDENTITY_VERSION,
        approachBVersion: SEQUENTIAL_ATTRIBUTION_VERSION,
        m16iCorrectedStatus: {
          M16I_EXECUTION: "PASS",
          M16I_UNCERTAINTY_SELECTION: "NO_ELIGIBLE_CANDIDATE",
          UNCERTAINTY_SELECTION_RESULT: "UNCERTAINTY_BLOCKED",
          BLOCK_REASON:
            "NO_CANDIDATE_PASSES_FROZEN_CONDITIONAL_COVERAGE_GATES",
          RESEARCH_RATE_MODEL_FREEZE_READY: "NO",
          RESERVED_TEST_SHOULD_OPEN: "NO",
        },
        candidateFamily: ["Q0_CONSTANT", "Q1_INVERSE_SQRT", "Q2_FLOOR_PLUS_SAMPLING"],
        coverageGates: {
          pooled50: [0.45, 0.55],
          pooled80: [0.75, 0.85],
          pooled95: [0.9, 1.0],
          catastrophic80: 0.7,
          catastrophic95: 0.85,
        },
        conditionalCoverageMetric: "CCE mean |cov-nominal| over Q×{50,80,95}",
        selectionRules: {
          cceImproveVsU2: CCE_IMPROVE,
          wisNonDegradationVsU2: PRACTICAL,
          practicalWis: PRACTICAL,
        },
        WAR_version: WAR_FORMULA_VERSION,
        WAR_exposureUnit: WAR_EXPOSURE_UNIT,
        M16B_VALIDATION_USED: false,
        RESERVED_TEST_ACCESSED: false,
      },
      null,
      2
    )
  );

  // --- Load rows + locked predictions ---
  const allRows = parseFoldRows(
    await readFile(path.join(M16G, "04_fold_rows.csv"), "utf8")
  );
  type Row = {
    foldId: number;
    playerId: string;
    N: number;
    prediction: number;
    target: number;
    error: number;
    absError: number;
  };
  const rows: Row[] = allRows.map((r) => {
    const rate = computeResearchRateV1(
      {
        rawAbilityRate: r.rawPB,
        actualCombinedPossessionAppearances: r.N,
      },
      RESEARCH_RATE_CONFIG_V1
    );
    const pred = rate.researchFinalDRBL100;
    const expected = (r.N / (r.N + RESEARCH_K)) * r.rawPB;
    if (Math.abs(pred - expected) > 1e-12) {
      throw new Error("STOP LOCKED_POINT_ESTIMATE_REPRODUCTION_FAILURE");
    }
    return {
      foldId: r.foldId,
      playerId: r.playerId,
      N: r.N,
      prediction: pred,
      target: r.target,
      error: r.target - pred,
      absError: Math.abs(r.target - pred),
    };
  });

  await writeFile(
    path.join(OUT, "02_point_estimate_lock.json"),
    JSON.stringify(
      {
        reproduced: "PASS",
        formula: "N/(N+1600)*rawAbilityRate",
        POINT_ESTIMATE_CHANGED: "NO",
        posteriorOperations: 1,
        fusionInfluence: 0,
        legacyEB200Influence: 0,
        calibrationCoefficient: 1,
        CALIBRATION_SELECTION_RESULT: m16hDecision.CALIBRATION_SELECTION_RESULT,
        nRows: rows.length,
      },
      null,
      2
    )
  );

  // --- Chronology protocol ---
  const evalFoldIds = [1, 2, 3, 4];
  const protocol = evalFoldIds.map((evalId) => {
    const trainIds = Array.from({ length: evalId }, (_, i) => i);
    const lastTrain = m16gFolds.folds.find((f) => f.foldId === evalId - 1)!;
    const evalFold = m16gFolds.folds.find((f) => f.foldId === evalId)!;
    return {
      name: `EVAL_F${evalId + 1}`,
      evalFoldId: evalId,
      trainFoldIds: trainIds,
      chronological: lastTrain.futureDateMax < evalFold.futureDateMin,
      trainFutureDateMax: lastTrain.futureDateMax,
      evalFutureDateMin: evalFold.futureDateMin,
    };
  });
  if (protocol.some((p) => !p.chronological)) {
    throw new Error("STOP chronology failure");
  }
  await writeFile(
    path.join(OUT, "03_protocol.json"),
    JSON.stringify(
      {
        warmUp: "F1",
        evaluationFolds: ["F2", "F3", "F4", "F5"],
        TRAIN_EVAL_OVERLAP: 0,
        candidates: ["Q0", "Q1", "Q2"],
        response: "absError = |target - lockedDRBL|",
        input: "historical N only",
        folds: protocol,
        note: "TRAIN-development chronological OOS folds",
      },
      null,
      2
    )
  );

  // ========== Reproduce M16i U0/U1/U2 ==========
  type M16iEval = {
    foldId: number;
    N: number;
    prediction: number;
    target: number;
    error: number;
    wisU0: number;
    wisU1: number;
    wisU2: number;
    sigmaU2: number;
    ivU0: ReturnType<typeof computeResearchPredictionIntervalsV1>;
    ivU1: ReturnType<typeof computeResearchPredictionIntervalsV1>;
    ivU2: ReturnType<typeof computeResearchPredictionIntervalsV1>;
  };
  const m16iEval: M16iEval[] = [];
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
    const U0 = fitU0(eTr);
    const U1 = fitU1(eTr, nTr);
    const U2f = fitU2(eTr, nTr);
    const U2 = { sigmaFloor: U2f.sigmaFloor, c: U2f.c };
    assertMonotoneSigma("U1_INVERSE_SQRT", U1, 50, 15000);
    assertMonotoneSigma("U2_FLOOR_PLUS_SAMPLING", U2, 50, 15000);
    const qU0 = empiricalAbsZQuantiles(
      eTr,
      nTr.map((n) => sigmaOf("U0_CONSTANT", n, U0))
    );
    const qU1 = empiricalAbsZQuantiles(
      eTr,
      nTr.map((n) => sigmaOf("U1_INVERSE_SQRT", n, U1))
    );
    const qU2 = empiricalAbsZQuantiles(
      eTr,
      nTr.map((n) => sigmaOf("U2_FLOOR_PLUS_SAMPLING", n, U2))
    );
    for (const i of evalIdxs) {
      const r = rows[i]!;
      const ivU0 = computeResearchPredictionIntervalsV1(r.prediction, r.N, {
        modelType: "U0_CONSTANT",
        params: U0,
        quantiles: qU0,
      });
      const ivU1 = computeResearchPredictionIntervalsV1(r.prediction, r.N, {
        modelType: "U1_INVERSE_SQRT",
        params: U1,
        quantiles: qU1,
      });
      const ivU2 = computeResearchPredictionIntervalsV1(r.prediction, r.N, {
        modelType: "U2_FLOOR_PLUS_SAMPLING",
        params: U2,
        quantiles: qU2,
      });
      const wis = (iv: typeof ivU0) =>
        weightedIntervalScore(
          r.target,
          r.prediction,
          iv.researchPI50Lo,
          iv.researchPI50Hi,
          iv.researchPI80Lo,
          iv.researchPI80Hi,
          iv.researchPI95Lo,
          iv.researchPI95Hi
        );
      m16iEval.push({
        foldId: r.foldId,
        N: r.N,
        prediction: r.prediction,
        target: r.target,
        error: r.error,
        wisU0: wis(ivU0),
        wisU1: wis(ivU1),
        wisU2: wis(ivU2),
        sigmaU2: ivU2.researchPredictiveSigma,
        ivU0,
        ivU1,
        ivU2,
      });
    }
  }

  const nSorted = [...m16iEval.map((p) => p.N)].sort((a, b) => a - b);
  const qCuts = [25, 50, 75].map((p) => percentile(nSorted, p));
  function expoQ(n: number) {
    if (n <= qCuts[0]!) return 1;
    if (n <= qCuts[1]!) return 2;
    if (n <= qCuts[2]!) return 3;
    return 4;
  }

  function covOf(
    preds: M16iEval[],
    pick: (p: M16iEval) => { lo: number; hi: number }
  ) {
    let hit = 0;
    for (const p of preds) {
      const { lo, hi } = pick(p);
      if (p.target >= lo && p.target <= hi) hit++;
    }
    return hit / (preds.length || 1);
  }

  const u0Wis = mean(m16iEval.map((p) => p.wisU0));
  const u1Wis = mean(m16iEval.map((p) => p.wisU1));
  const u2Wis = mean(m16iEval.map((p) => p.wisU2));
  const q1U0 = m16iEval.filter((p) => expoQ(p.N) === 1);
  const u0Q1Pi80 = covOf(q1U0, (p) => ({
    lo: p.ivU0.researchPI80Lo,
    hi: p.ivU0.researchPI80Hi,
  }));
  const u0Q1Pi95 = covOf(q1U0, (p) => ({
    lo: p.ivU0.researchPI95Lo,
    hi: p.ivU0.researchPI95Hi,
  }));
  const u2Spearman = spearman(
    m16iEval.map((p) => p.sigmaU2),
    m16iEval.map((p) => Math.abs(p.error))
  );
  const u2Rel = (u0Wis - u2Wis) / u0Wis;

  function quartileCovM16i(
    which: "U0" | "U1" | "U2",
    q: number,
    level: 50 | 80 | 95
  ) {
    const slice = m16iEval.filter((p) => expoQ(p.N) === q);
    const iv = (p: M16iEval) =>
      which === "U0" ? p.ivU0 : which === "U1" ? p.ivU1 : p.ivU2;
    if (level === 50)
      return covOf(slice, (p) => ({
        lo: iv(p).researchPI50Lo,
        hi: iv(p).researchPI50Hi,
      }));
    if (level === 80)
      return covOf(slice, (p) => ({
        lo: iv(p).researchPI80Lo,
        hi: iv(p).researchPI80Hi,
      }));
    return covOf(slice, (p) => ({
      lo: iv(p).researchPI95Lo,
      hi: iv(p).researchPI95Hi,
    }));
  }

  function catastrophicM16i(which: "U0" | "U1" | "U2") {
    return [1, 2, 3, 4].some((q) => {
      const c80 = quartileCovM16i(which, q, 80);
      const c95 = quartileCovM16i(which, q, 95);
      return c80 < 0.7 || c95 < 0.85;
    });
  }
  function pooledGatesM16i(which: "U0" | "U1" | "U2") {
    const iv = (p: M16iEval) =>
      which === "U0" ? p.ivU0 : which === "U1" ? p.ivU1 : p.ivU2;
    const c50 = covOf(m16iEval, (p) => ({
      lo: iv(p).researchPI50Lo,
      hi: iv(p).researchPI50Hi,
    }));
    const c80 = covOf(m16iEval, (p) => ({
      lo: iv(p).researchPI80Lo,
      hi: iv(p).researchPI80Hi,
    }));
    const c95 = covOf(m16iEval, (p) => ({
      lo: iv(p).researchPI95Lo,
      hi: iv(p).researchPI95Hi,
    }));
    return (
      c50 >= 0.45 &&
      c50 <= 0.55 &&
      c80 >= 0.75 &&
      c80 <= 0.85 &&
      c95 >= 0.9 &&
      c95 <= 1
    );
  }

  const m16iElig = {
    U0: pooledGatesM16i("U0") && !catastrophicM16i("U0"),
    U1: pooledGatesM16i("U1") && !catastrophicM16i("U1"),
    U2: pooledGatesM16i("U2") && !catastrophicM16i("U2"),
  };

  function cceM16i(which: "U0" | "U1" | "U2") {
    const cells: number[] = [];
    for (const q of [1, 2, 3, 4]) {
      cells.push(Math.abs(quartileCovM16i(which, q, 50) - 0.5));
      cells.push(Math.abs(quartileCovM16i(which, q, 80) - 0.8));
      cells.push(Math.abs(quartileCovM16i(which, q, 95) - 0.95));
    }
    return mean(cells);
  }
  const m16iU2Cce = cceM16i("U2");
  const m16iU2Q1Pi80 = quartileCovM16i("U2", 1, 80);
  const m16iU2Q1Pi95 = quartileCovM16i("U2", 1, 95);
  const m16iU2Q4Pi80 = quartileCovM16i("U2", 4, 80);
  const m16iU2Q4Pi95 = quartileCovM16i("U2", 4, 95);

  const reproOk =
    Math.abs(u0Wis - M16I_EXPECTED.u0Wis) < 1e-6 &&
    Math.abs(u1Wis - M16I_EXPECTED.u1Wis) < 1e-6 &&
    Math.abs(u2Wis - M16I_EXPECTED.u2Wis) < 1e-6 &&
    Math.abs(u0Q1Pi80 - M16I_EXPECTED.u0Q1Pi80) < 1e-6 &&
    Math.abs(u0Q1Pi95 - M16I_EXPECTED.u0Q1Pi95) < 1e-6 &&
    !m16iElig.U0 &&
    !m16iElig.U1 &&
    !m16iElig.U2;

  await writeFile(
    path.join(OUT, "01_m16i_reproduction.json"),
    JSON.stringify(
      {
        reproduced: reproOk ? "PASS" : "FAIL",
        U0_WIS: u0Wis,
        U1_WIS: u1Wis,
        U2_WIS: u2Wis,
        U0_Q1_PI80: u0Q1Pi80,
        U0_Q1_PI95: u0Q1Pi95,
        U2_WIS_improvement: u2Rel,
        U2_sigma_error_Spearman: u2Spearman,
        Q1_error_gt_Q4:
          mae(m16iEval.filter((p) => expoQ(p.N) === 1).map((p) => p.error)) >
          mae(m16iEval.filter((p) => expoQ(p.N) === 4).map((p) => p.error)),
        correctedEligibility: {
          U0: m16iElig.U0 ? "PASS" : "FAIL",
          U1: m16iElig.U1 ? "PASS" : "FAIL",
          U2: m16iElig.U2 ? "PASS" : "FAIL",
          M16I_UNCERTAINTY_SELECTION: "NO_ELIGIBLE_CANDIDATE",
          UNCERTAINTY_SELECTION_RESULT: "UNCERTAINTY_BLOCKED",
        },
        M16I_U2_CCE: m16iU2Cce,
        expected: M16I_EXPECTED,
      },
      null,
      2
    )
  );
  if (!reproOk) throw new Error("STOP M16I_REPRODUCTION_FAILURE");

  // ========== Direct quantile Q0/Q1/Q2 ==========
  type QEval = {
    foldId: number;
    playerId: string;
    N: number;
    prediction: number;
    target: number;
    error: number;
    absError: number;
    ivQ0: ReturnType<typeof intervalsFromWidths>;
    ivQ1: ReturnType<typeof intervalsFromWidths>;
    ivQ2: ReturnType<typeof intervalsFromWidths>;
    wisQ0: number;
    wisQ1: number;
    wisQ2: number;
    wisU2: number;
  };

  const rollingParams: Record<string, unknown>[] = [];
  const qEval: QEval[] = [];

  for (const pf of protocol) {
    const trainIdxs = rows
      .map((r, i) => ({ r, i }))
      .filter((x) => pf.trainFoldIds.includes(x.r.foldId))
      .map((x) => x.i);
    const evalIdxs = rows
      .map((r, i) => ({ r, i }))
      .filter((x) => x.r.foldId === pf.evalFoldId)
      .map((x) => x.i);
    const absTr = trainIdxs.map((i) => rows[i]!.absError);
    const nTr = trainIdxs.map((i) => rows[i]!.N);
    const pQ0 = fitQ0(absTr);
    const pQ1 = fitQ1(absTr, nTr);
    const pQ2 = fitQ2(absTr, nTr);
    if (!pQ2.converged) throw new Error("UNCERTAINTY_SCALE_FIT_FAILURE Q2");
    assertWidthMonotoneInN("Q1_INVERSE_SQRT", pQ1, 50, 15000);
    assertWidthMonotoneInN("Q2_FLOOR_PLUS_SAMPLING", pQ2, 50, 15000);
    rollingParams.push({
      evalFold: `F${pf.evalFoldId + 1}`,
      trainFolds: pf.trainFoldIds.map((i) => `F${i + 1}`).join("+"),
      Q0_a50: pQ0.a50,
      Q0_a80: pQ0.a80,
      Q0_a95: pQ0.a95,
      Q1_c50: pQ1.c50,
      Q1_c80: pQ1.c80,
      Q1_c95: pQ1.c95,
      Q2_floor50: pQ2.floor50,
      Q2_floor80: pQ2.floor80,
      Q2_floor95: pQ2.floor95,
      Q2_sample50: pQ2.sample50,
      Q2_sample80: pQ2.sample80,
      Q2_sample95: pQ2.sample95,
      Q2_objective: pQ2.objective,
      Q2_iterations: pQ2.iterations,
      Q2_converged: pQ2.converged,
    });

    // Also need U2 intervals for same eval rows (already in m16iEval) — match by fold+N+player later
    for (const i of evalIdxs) {
      const r = rows[i]!;
      const w0 = widthsOf("Q0_CONSTANT", r.N, pQ0);
      const w1 = widthsOf("Q1_INVERSE_SQRT", r.N, pQ1);
      const w2 = widthsOf("Q2_FLOOR_PLUS_SAMPLING", r.N, pQ2);
      const ivQ0 = intervalsFromWidths(r.prediction, w0);
      const ivQ1 = intervalsFromWidths(r.prediction, w1);
      const ivQ2 = intervalsFromWidths(r.prediction, w2);
      const wis = (iv: typeof ivQ0) =>
        weightedIntervalScore(
          r.target,
          r.prediction,
          iv.pi50Lo,
          iv.pi50Hi,
          iv.pi80Lo,
          iv.pi80Hi,
          iv.pi95Lo,
          iv.pi95Hi
        );
      const u2Match = m16iEval.find(
        (p) =>
          p.foldId === r.foldId &&
          p.N === r.N &&
          Math.abs(p.prediction - r.prediction) < 1e-12 &&
          Math.abs(p.target - r.target) < 1e-12
      );
      qEval.push({
        foldId: r.foldId,
        playerId: r.playerId,
        N: r.N,
        prediction: r.prediction,
        target: r.target,
        error: r.error,
        absError: r.absError,
        ivQ0,
        ivQ1,
        ivQ2,
        wisQ0: wis(ivQ0),
        wisQ1: wis(ivQ1),
        wisQ2: wis(ivQ2),
        wisU2: u2Match?.wisU2 ?? NaN,
      });
    }
  }

  await writeFile(path.join(OUT, "09_rolling_parameters.csv"), toCsv(rollingParams));

  // Nesting proof on all rows + dense grid already in fit
  let nestingOk = true;
  for (const p of qEval) {
    for (const iv of [p.ivQ0, p.ivQ1, p.ivQ2]) {
      if (
        !(
          iv.w50 <= iv.w80 + 1e-9 &&
          iv.w80 <= iv.w95 + 1e-9 &&
          iv.pi95Lo <= iv.pi80Lo &&
          iv.pi80Lo <= iv.pi50Lo &&
          iv.pi50Lo <= p.prediction &&
          p.prediction <= iv.pi50Hi &&
          iv.pi50Hi <= iv.pi80Hi &&
          iv.pi80Hi <= iv.pi95Hi &&
          Math.abs((iv.pi80Lo + iv.pi80Hi) / 2 - p.prediction) < 1e-9
        )
      ) {
        nestingOk = false;
      }
    }
  }
  if (!nestingOk) throw new Error("STOP INTERVAL_NESTING_FAILURE");
  await writeFile(
    path.join(OUT, "13_interval_nesting_tests.json"),
    JSON.stringify({ nesting: "PASS", centerPreserved: true, rows: qEval.length }, null, 2)
  );

  function covQ(
    preds: QEval[],
    which: "Q0" | "Q1" | "Q2",
    level: 50 | 80 | 95
  ) {
    let hit = 0;
    for (const p of preds) {
      const iv = which === "Q0" ? p.ivQ0 : which === "Q1" ? p.ivQ1 : p.ivQ2;
      const lo = level === 50 ? iv.pi50Lo : level === 80 ? iv.pi80Lo : iv.pi95Lo;
      const hi = level === 50 ? iv.pi50Hi : level === 80 ? iv.pi80Hi : iv.pi95Hi;
      if (p.target >= lo && p.target <= hi) hit++;
    }
    return hit / (preds.length || 1);
  }

  function cceOf(which: "Q0" | "Q1" | "Q2") {
    const cells: number[] = [];
    for (const q of [1, 2, 3, 4]) {
      const slice = qEval.filter((p) => expoQ(p.N) === q);
      cells.push(Math.abs(covQ(slice, which, 50) - 0.5));
      cells.push(Math.abs(covQ(slice, which, 80) - 0.8));
      cells.push(Math.abs(covQ(slice, which, 95) - 0.95));
    }
    return mean(cells);
  }

  function catastrophicQ(which: "Q0" | "Q1" | "Q2") {
    return [1, 2, 3, 4].some((q) => {
      const slice = qEval.filter((p) => expoQ(p.N) === q);
      return covQ(slice, which, 80) < 0.7 || covQ(slice, which, 95) < 0.85;
    });
  }
  function pooledOk(which: "Q0" | "Q1" | "Q2") {
    const c50 = covQ(qEval, which, 50);
    const c80 = covQ(qEval, which, 80);
    const c95 = covQ(qEval, which, 95);
    return (
      c50 >= 0.45 &&
      c50 <= 0.55 &&
      c80 >= 0.75 &&
      c80 <= 0.85 &&
      c95 >= 0.9 &&
      c95 <= 1
    );
  }

  const metrics = (["Q0", "Q1", "Q2"] as const).map((name) => {
    const wis = mean(
      qEval.map((p) => (name === "Q0" ? p.wisQ0 : name === "Q1" ? p.wisQ1 : p.wisQ2))
    );
    const cce = cceOf(name);
    const q1 = qEval.filter((p) => expoQ(p.N) === 1);
    const q4 = qEval.filter((p) => expoQ(p.N) === 4);
    const cat = catastrophicQ(name);
    const pooled = pooledOk(name);
    const cceImp = (m16iU2Cce - cce) / m16iU2Cce;
    const wisOkVsU2 = wis <= 1.005 * u2Wis;
    const cceOk = cceImp >= CCE_IMPROVE;
    let eligible = pooled && !cat;
    if (name === "Q1" || name === "Q2") {
      eligible = eligible && cceOk && wisOkVsU2;
    }
    return {
      candidate: name,
      WIS: wis,
      CCE: cce,
      cov50: covQ(qEval, name, 50),
      cov80: covQ(qEval, name, 80),
      cov95: covQ(qEval, name, 95),
      Q1_PI80: covQ(q1, name, 80),
      Q1_PI95: covQ(q1, name, 95),
      Q4_PI80: covQ(q4, name, 80),
      Q4_PI95: covQ(q4, name, 95),
      catastrophic: cat,
      pooledOk: pooled,
      cceImprovementVsU2: cceImp,
      wisOkVsU2,
      cceOk,
      eligible,
      meanWidth80: mean(
        qEval.map((p) => {
          const iv = name === "Q0" ? p.ivQ0 : name === "Q1" ? p.ivQ1 : p.ivQ2;
          return iv.w80 * 2;
        })
      ),
      meanWidth95: mean(
        qEval.map((p) => {
          const iv = name === "Q0" ? p.ivQ0 : name === "Q1" ? p.ivQ1 : p.ivQ2;
          return iv.w95 * 2;
        })
      ),
    };
  });

  const mQ0 = metrics.find((m) => m.candidate === "Q0")!;
  const mQ1 = metrics.find((m) => m.candidate === "Q1")!;
  const mQ2 = metrics.find((m) => m.candidate === "Q2")!;

  // Q2 collapse from last rolling fit average
  const lastQ2 = rollingParams[rollingParams.length - 1]!;
  const collapse = q2CollapseStatus({
    floor50: Number(lastQ2.Q2_floor50),
    floor80: Number(lastQ2.Q2_floor80),
    floor95: Number(lastQ2.Q2_floor95),
    sample50: Number(lastQ2.Q2_sample50),
    sample80: Number(lastQ2.Q2_sample80),
    sample95: Number(lastQ2.Q2_sample95),
  });

  await writeFile(
    path.join(OUT, "04_conditional_coverage_error.csv"),
    toCsv([
      { model: "M16I_U2_BASELINE", CCE: m16iU2Cce, eligible: "NO" },
      { model: "Q0", CCE: mQ0.CCE, eligible: mQ0.eligible },
      {
        model: "Q1",
        CCE: mQ1.CCE,
        improvement_vs_U2: mQ1.cceImprovementVsU2,
        eligible: mQ1.eligible,
      },
      {
        model: "Q2",
        CCE: mQ2.CCE,
        improvement_vs_U2: mQ2.cceImprovementVsU2,
        eligible: mQ2.eligible,
      },
    ])
  );

  await writeFile(path.join(OUT, "08_candidate_metrics.csv"), toCsv(metrics));

  // Bootstrap
  const blocks = qEval.map((p) => `fold${p.foldId}`);
  const boot = [
    {
      comparison: "Q1_vs_Q0",
      ...pairedBlockBootstrapWisDiff(
        qEval.map((p) => p.wisQ0),
        qEval.map((p) => p.wisQ1),
        blocks
      ),
    },
    {
      comparison: "Q2_vs_Q0",
      ...pairedBlockBootstrapWisDiff(
        qEval.map((p) => p.wisQ0),
        qEval.map((p) => p.wisQ2),
        blocks
      ),
    },
    {
      comparison: "Q2_vs_Q1",
      ...pairedBlockBootstrapWisDiff(
        qEval.map((p) => p.wisQ1),
        qEval.map((p) => p.wisQ2),
        blocks
      ),
    },
    {
      comparison: "Q1_vs_M16I_U2",
      ...pairedBlockBootstrapWisDiff(
        qEval.map((p) => p.wisU2),
        qEval.map((p) => p.wisQ1),
        blocks
      ),
    },
    {
      comparison: "Q2_vs_M16I_U2",
      ...pairedBlockBootstrapWisDiff(
        qEval.map((p) => p.wisU2),
        qEval.map((p) => p.wisQ2),
        blocks
      ),
    },
  ];
  await writeFile(path.join(OUT, "05_bootstrap_wis.csv"), toCsv(boot));

  // Exposure quartile metrics
  const expoRows: Record<string, unknown>[] = [];
  for (const cand of ["Q0", "Q1", "Q2", "M16I_U2"] as const) {
    for (const q of [1, 2, 3, 4]) {
      const slice = qEval.filter((p) => expoQ(p.N) === q);
      const abs = slice.map((p) => p.absError).sort((a, b) => a - b);
      let cov50 = NaN,
        cov80 = NaN,
        cov95 = NaN,
        w50 = NaN,
        w80 = NaN,
        w95 = NaN,
        wis = NaN;
      if (cand === "M16I_U2") {
        const s2 = m16iEval.filter((p) => expoQ(p.N) === q);
        cov50 = covOf(s2, (p) => ({
          lo: p.ivU2.researchPI50Lo,
          hi: p.ivU2.researchPI50Hi,
        }));
        cov80 = covOf(s2, (p) => ({
          lo: p.ivU2.researchPI80Lo,
          hi: p.ivU2.researchPI80Hi,
        }));
        cov95 = covOf(s2, (p) => ({
          lo: p.ivU2.researchPI95Lo,
          hi: p.ivU2.researchPI95Hi,
        }));
        w50 = mean(s2.map((p) => p.ivU2.researchPI50Hi - p.ivU2.researchPI50Lo));
        w80 = mean(s2.map((p) => p.ivU2.researchPI80Hi - p.ivU2.researchPI80Lo));
        w95 = mean(s2.map((p) => p.ivU2.researchPI95Hi - p.ivU2.researchPI95Lo));
        wis = mean(s2.map((p) => p.wisU2));
      } else {
        const which = cand;
        cov50 = covQ(slice, which, 50);
        cov80 = covQ(slice, which, 80);
        cov95 = covQ(slice, which, 95);
        w50 = mean(
          slice.map((p) => {
            const iv = which === "Q0" ? p.ivQ0 : which === "Q1" ? p.ivQ1 : p.ivQ2;
            return iv.w50 * 2;
          })
        );
        w80 = mean(
          slice.map((p) => {
            const iv = which === "Q0" ? p.ivQ0 : which === "Q1" ? p.ivQ1 : p.ivQ2;
            return iv.w80 * 2;
          })
        );
        w95 = mean(
          slice.map((p) => {
            const iv = which === "Q0" ? p.ivQ0 : which === "Q1" ? p.ivQ1 : p.ivQ2;
            return iv.w95 * 2;
          })
        );
        wis = mean(
          slice.map((p) =>
            which === "Q0" ? p.wisQ0 : which === "Q1" ? p.wisQ1 : p.wisQ2
          )
        );
      }
      expoRows.push({
        candidate: cand,
        quartile: `Q${q}`,
        n: slice.length,
        mean_N: mean(slice.map((p) => p.N)),
        MAE: mae(slice.map((p) => p.error)),
        RMSE: rmse(slice.map((p) => p.error)),
        median_abs_error: percentile(abs, 50),
        P80_abs_error: percentile(abs, 80),
        P95_abs_error: percentile(abs, 95),
        PI50_coverage: cov50,
        PI80_coverage: cov80,
        PI95_coverage: cov95,
        PI50_width: w50,
        PI80_width: w80,
        PI95_width: w95,
        WIS: wis,
      });
    }
  }
  await writeFile(path.join(OUT, "06_exposure_quartile_metrics.csv"), toCsv(expoRows));

  // Width by exposure
  const nGrid = [250, 500, 1000, 1600, 3000, 6000, 10000];
  const lastRoll = rollingParams[rollingParams.length - 1]!;
  const shapeQ1p: Q1Params = {
    c50: Number(lastRoll.Q1_c50),
    c80: Number(lastRoll.Q1_c80),
    c95: Number(lastRoll.Q1_c95),
  };
  const shapeQ2p: Q2Params = {
    floor50: Number(lastRoll.Q2_floor50),
    floor80: Number(lastRoll.Q2_floor80),
    floor95: Number(lastRoll.Q2_floor95),
    sample50: Number(lastRoll.Q2_sample50),
    sample80: Number(lastRoll.Q2_sample80),
    sample95: Number(lastRoll.Q2_sample95),
  };
  const shapeQ0p: Q0Params = {
    a50: Number(lastRoll.Q0_a50),
    a80: Number(lastRoll.Q0_a80),
    a95: Number(lastRoll.Q0_a95),
  };
  const widthByN = nGrid.flatMap((n) => {
    const w0 = widthsOf("Q0_CONSTANT", n, shapeQ0p);
    const w1 = widthsOf("Q1_INVERSE_SQRT", n, shapeQ1p);
    const w2 = widthsOf("Q2_FLOOR_PLUS_SAMPLING", n, shapeQ2p);
    return [
      { N: n, model: "Q0", w50: w0.w50, w80: w0.w80, w95: w0.w95 },
      { N: n, model: "Q1", w50: w1.w50, w80: w1.w80, w95: w1.w95 },
      { N: n, model: "Q2", w50: w2.w50, w80: w2.w80, w95: w2.w95 },
    ];
  });
  await writeFile(path.join(OUT, "07_width_by_exposure.csv"), toCsv(widthByN));

  // Fold metrics
  const foldMetrics = [1, 2, 3, 4].flatMap((f) => {
    const slice = qEval.filter((p) => p.foldId === f);
    return (["Q0", "Q1", "Q2"] as const).map((name) => ({
      fold: `F${f + 1}`,
      candidate: name,
      WIS: mean(
        slice.map((p) =>
          name === "Q0" ? p.wisQ0 : name === "Q1" ? p.wisQ1 : p.wisQ2
        )
      ),
      cov50: covQ(slice, name, 50),
      cov80: covQ(slice, name, 80),
      cov95: covQ(slice, name, 95),
      width80: mean(
        slice.map((p) => {
          const iv = name === "Q0" ? p.ivQ0 : name === "Q1" ? p.ivQ1 : p.ivQ2;
          return iv.w80 * 2;
        })
      ),
      width95: mean(
        slice.map((p) => {
          const iv = name === "Q0" ? p.ivQ0 : name === "Q1" ? p.ivQ1 : p.ivQ2;
          return iv.w95 * 2;
        })
      ),
      Q1_PI80: covQ(
        slice.filter((p) => expoQ(p.N) === 1),
        name,
        80
      ),
      Q1_PI95: covQ(
        slice.filter((p) => expoQ(p.N) === 1),
        name,
        95
      ),
    }));
  });
  await writeFile(path.join(OUT, "10_fold_metrics.csv"), toCsv(foldMetrics));

  // Selection
  const eligible = metrics.filter((m) => m.eligible).map((m) => m.candidate);
  let SELECTED: "Q0" | "Q1" | "Q2" | "NONE" = "NONE";
  let UNCERTAINTY_SELECTION_RESULT:
    | "CONSTANT_DIRECT_QUANTILES_SELECTED"
    | "INVERSE_SQRT_DIRECT_QUANTILES_SELECTED"
    | "FLOOR_PLUS_SAMPLING_DIRECT_QUANTILES_SELECTED"
    | "NO_ELIGIBLE_UNCERTAINTY_MODEL" = "NO_ELIGIBLE_UNCERTAINTY_MODEL";

  if (eligible.length === 1) {
    SELECTED = eligible[0]! as "Q0" | "Q1" | "Q2";
  } else if (eligible.length > 1) {
    const eligM = metrics.filter((m) => m.eligible);
    eligM.sort((a, b) => a.WIS - b.WIS);
    const best = eligM[0]!;
    const second = eligM[1];
    if (
      second &&
      Math.abs(best.WIS - second.WIS) / second.WIS < PRACTICAL
    ) {
      // prefer simpler
      const order = ["Q0", "Q1", "Q2"];
      SELECTED = eligM.sort(
        (a, b) => order.indexOf(a.candidate) - order.indexOf(b.candidate)
      )[0]!.candidate as "Q0" | "Q1" | "Q2";
    } else {
      SELECTED = best.candidate as "Q0" | "Q1" | "Q2";
    }
  }

  if (SELECTED === "Q0")
    UNCERTAINTY_SELECTION_RESULT = "CONSTANT_DIRECT_QUANTILES_SELECTED";
  else if (SELECTED === "Q1")
    UNCERTAINTY_SELECTION_RESULT = "INVERSE_SQRT_DIRECT_QUANTILES_SELECTED";
  else if (SELECTED === "Q2")
    UNCERTAINTY_SELECTION_RESULT =
      collapse === "CONSTANT"
        ? "CONSTANT_DIRECT_QUANTILES_SELECTED"
        : collapse === "INVERSE_SQRT"
          ? "INVERSE_SQRT_DIRECT_QUANTILES_SELECTED"
          : "FLOOR_PLUS_SAMPLING_DIRECT_QUANTILES_SELECTED";
  else UNCERTAINTY_SELECTION_RESULT = "NO_ELIGIBLE_UNCERTAINTY_MODEL";

  if (SELECTED === "Q2" && collapse === "CONSTANT") SELECTED = "Q0";
  if (SELECTED === "Q2" && collapse === "INVERSE_SQRT") SELECTED = "Q1";

  // High exposure inflation vs M16i U2
  const q4Q = SELECTED === "NONE" ? null : SELECTED;
  let HIGH_EXPOSURE_INTERVAL_INFLATION: "YES" | "NO" | "NA" = "NA";
  if (q4Q) {
    const q4Cand = expoRows.find(
      (r) => r.candidate === q4Q && r.quartile === "Q4"
    )!;
    const q4U2 = expoRows.find(
      (r) => r.candidate === "M16I_U2" && r.quartile === "Q4"
    )!;
    HIGH_EXPOSURE_INTERVAL_INFLATION =
      Number(q4Cand.PI80_width) > 1.2 * Number(q4U2.PI80_width) ? "YES" : "NO";
  }

  // Final fit
  let finalParams: Record<string, unknown> = {
    selectedModel: "NONE",
    UNCERTAINTY_SELECTION_RESULT,
  };
  if (SELECTED !== "NONE") {
    const absAll = rows.map((r) => r.absError);
    const nAll = rows.map((r) => r.N);
    if (SELECTED === "Q0") {
      const p = fitQ0(absAll);
      finalParams = {
        selectedModel: "Q0",
        version: RESEARCH_PREDICTIVE_INTERVAL_V2,
        modelType: "Q0_CONSTANT",
        params: p,
        UNCERTAINTY_SELECTION_RESULT,
      };
    } else if (SELECTED === "Q1") {
      const p = fitQ1(absAll, nAll);
      finalParams = {
        selectedModel: "Q1",
        version: RESEARCH_PREDICTIVE_INTERVAL_V2,
        modelType: "Q1_INVERSE_SQRT",
        params: p,
        UNCERTAINTY_SELECTION_RESULT,
      };
    } else {
      const p = fitQ2(absAll, nAll);
      finalParams = {
        selectedModel: "Q2",
        version: RESEARCH_PREDICTIVE_INTERVAL_V2,
        modelType: "Q2_FLOOR_PLUS_SAMPLING",
        params: {
          floor50: p.floor50,
          floor80: p.floor80,
          floor95: p.floor95,
          sample50: p.sample50,
          sample80: p.sample80,
          sample95: p.sample95,
        },
        objective: p.objective,
        UNCERTAINTY_SELECTION_RESULT,
      };
    }
  }
  await writeFile(
    path.join(OUT, "15_final_parameters.json"),
    JSON.stringify(finalParams, null, 2)
  );

  // Tail symmetry on best numerical or selected
  const focus: "Q0" | "Q1" | "Q2" =
    SELECTED !== "NONE"
      ? SELECTED
      : (metrics.sort((a, b) => a.WIS - b.WIS)[0]!.candidate as "Q0" | "Q1" | "Q2");
  const focusIv = (p: QEval) =>
    focus === "Q0" ? p.ivQ0 : focus === "Q1" ? p.ivQ1 : p.ivQ2;
  const posShare =
    qEval.filter((p) => p.error > 0).length / qEval.length;
  const negShare =
    qEval.filter((p) => p.error < 0).length / qEval.length;
  let loMiss = 0,
    hiMiss = 0;
  for (const p of qEval) {
    const iv = focusIv(p);
    if (p.target < iv.pi80Lo) loMiss++;
    if (p.target > iv.pi80Hi) hiMiss++;
  }
  let asymFolds = 0;
  for (const f of [1, 2, 3, 4]) {
    const slice = qEval.filter((p) => p.foldId === f);
    let lo = 0,
      hi = 0;
    for (const p of slice) {
      const iv = focusIv(p);
      if (p.target < iv.pi80Lo) lo++;
      if (p.target > iv.pi80Hi) hi++;
    }
    const lr = lo / slice.length;
    const ur = hi / slice.length;
    if (Math.abs(lr - ur) > 0.05 && Math.max(lr, ur) > 0.15) asymFolds++;
  }
  const ASYM = asymFolds >= 3 ? "YES" : "NO";
  await writeFile(
    path.join(OUT, "11_tail_symmetry.csv"),
    toCsv([
      {
        focusCandidate: focus,
        selected: SELECTED,
        P_error_gt0: posShare,
        P_error_lt0: negShare,
        PI80_lower_miss: loMiss / qEval.length,
        PI80_upper_miss: hiMiss / qEval.length,
        asym_folds: asymFolds,
        ASYMMETRIC_INTERVAL_REVIEW_REQUIRED: ASYM,
      },
    ])
  );

  // Discrimination
  const discRows: Record<string, unknown>[] = [];
  for (const name of ["Q0", "Q1", "Q2"] as const) {
    const ordered = [...qEval].sort((a, b) => {
      const wa = name === "Q0" ? a.ivQ0.w80 : name === "Q1" ? a.ivQ1.w80 : a.ivQ2.w80;
      const wb = name === "Q0" ? b.ivQ0.w80 : name === "Q1" ? b.ivQ1.w80 : b.ivQ2.w80;
      return wa - wb;
    });
    const size = Math.ceil(ordered.length / 4);
    const half80 = qEval.map((p) =>
      name === "Q0" ? p.ivQ0.w80 : name === "Q1" ? p.ivQ1.w80 : p.ivQ2.w80
    );
    const half95 = qEval.map((p) =>
      name === "Q0" ? p.ivQ0.w95 : name === "Q1" ? p.ivQ1.w95 : p.ivQ2.w95
    );
    const sp80 = spearman(
      half80,
      qEval.map((p) => p.absError)
    );
    const sp95 = spearman(
      half95,
      qEval.map((p) => p.absError)
    );
    for (let qi = 0; qi < 4; qi++) {
      const slice = ordered.slice(qi * size, Math.min(ordered.length, (qi + 1) * size));
      const abs = slice.map((p) => p.absError).sort((a, b) => a - b);
      discRows.push({
        candidate: name,
        UQ: `UQ${qi + 1}`,
        n: slice.length,
        mean_PI80_half: mean(
          slice.map((p) =>
            name === "Q0" ? p.ivQ0.w80 : name === "Q1" ? p.ivQ1.w80 : p.ivQ2.w80
          )
        ),
        MAE: mae(slice.map((p) => p.error)),
        RMSE: rmse(slice.map((p) => p.error)),
        P80_abs: percentile(abs, 80),
        P95_abs: percentile(abs, 95),
        spearman_PI80_half_absErr: sp80,
        spearman_PI95_half_absErr: sp95,
      });
    }
  }
  await writeFile(path.join(OUT, "12_uncertainty_discrimination.csv"), toCsv(discRows));

  const RESEARCH_RATE_MODEL_FREEZE_READY =
    SELECTED !== "NONE" ? "YES" : "NO";
  const RESERVED_TEST_SHOULD_OPEN =
    RESEARCH_RATE_MODEL_FREEZE_READY === "YES" ? "YES" : "NO";

  await writeFile(
    path.join(OUT, "14_conditional_repair_decision.json"),
    JSON.stringify(
      {
        M16I_U2_WIS: u2Wis,
        M16I_U2_CCE: m16iU2Cce,
        metrics,
        eligible,
        SELECTED_UNCERTAINTY_MODEL: SELECTED,
        UNCERTAINTY_SELECTION_RESULT,
        Q2_COLLAPSE_STATUS: collapse,
        HIGH_EXPOSURE_INTERVAL_INFLATION,
        RESEARCH_RATE_MODEL_FREEZE_READY,
        RESERVED_TEST_SHOULD_OPEN,
        reason:
          SELECTED === "NONE"
            ? "No candidate passed pooled + catastrophic conditional coverage (+ Q1/Q2 repair gates)"
            : `${SELECTED} selected among eligible`,
        lockedBeforeLeaderboardInspection: true,
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "16_interval_contract.md"),
    `# Interval contract (M16i1)

## Point estimate (unchanged)
\`\`\`text
DRBL100 = N/(N+1600) * rawAbilityRate
\`\`\`

## Selected uncertainty
**${SELECTED}** / ${UNCERTAINTY_SELECTION_RESULT}

${
  SELECTED === "NONE"
    ? "No final interval formula is promoted."
    : SELECTED === "Q0"
      ? "width_p = a_p (constant)"
      : SELECTED === "Q1"
        ? "width_p(N) = c_p / sqrt(N)"
        : "width_p(N) = sqrt(floor_p^2 + sample_p^2 / N)"
}

Intervals remain symmetric around locked DRBL100.
Semantics: empirical future predictive intervals (not latent-ability CIs).
`
  );

  // Charts
  await writeFile(
    path.join(CHARTS, "wis_by_candidate.svg"),
    svgBars(
      [
        { label: "U2", value: u2Wis },
        { label: "Q0", value: mQ0.WIS },
        { label: "Q1", value: mQ1.WIS },
        { label: "Q2", value: mQ2.WIS },
      ],
      "WIS by candidate",
      "WIS"
    )
  );
  await writeFile(
    path.join(CHARTS, "cce_by_candidate.svg"),
    svgBars(
      [
        { label: "U2", value: m16iU2Cce },
        { label: "Q0", value: mQ0.CCE },
        { label: "Q1", value: mQ1.CCE },
        { label: "Q2", value: mQ2.CCE },
      ],
      "CCE by candidate",
      "CCE"
    )
  );
  await writeFile(
    path.join(CHARTS, "wis_vs_cce.svg"),
    svgScatter(
      [
        { x: m16iU2Cce, y: u2Wis },
        { x: mQ0.CCE, y: mQ0.WIS },
        { x: mQ1.CCE, y: mQ1.WIS },
        { x: mQ2.CCE, y: mQ2.WIS },
      ],
      "WIS vs CCE",
      "CCE",
      "WIS"
    )
  );
  await writeFile(
    path.join(CHARTS, "q1_pi80_comparison.svg"),
    svgBars(
      [
        { label: "U0", value: u0Q1Pi80 },
        { label: "U2", value: m16iU2Q1Pi80 },
        { label: "Q0", value: mQ0.Q1_PI80 },
        { label: "Q1", value: mQ1.Q1_PI80 },
        { label: "Q2", value: mQ2.Q1_PI80 },
      ],
      "Q1 PI80 coverage",
      "coverage"
    )
  );
  await writeFile(
    path.join(CHARTS, "q1_pi95_comparison.svg"),
    svgBars(
      [
        { label: "U0", value: u0Q1Pi95 },
        { label: "U2", value: m16iU2Q1Pi95 },
        { label: "Q0", value: mQ0.Q1_PI95 },
        { label: "Q1", value: mQ1.Q1_PI95 },
        { label: "Q2", value: mQ2.Q1_PI95 },
      ],
      "Q1 PI95 coverage",
      "coverage"
    )
  );
  await writeFile(
    path.join(CHARTS, "abs_error_vs_N.svg"),
    svgScatter(
      qEval.map((p) => ({ x: p.N, y: p.absError })),
      "Absolute error vs N",
      "N",
      "|error|"
    )
  );
  await writeFile(
    path.join(CHARTS, "width80_vs_N_Q2.svg"),
    svgScatter(
      qEval.map((p) => ({ x: p.N, y: p.ivQ2.w80 })),
      "Q2 PI80 half-width vs N",
      "N",
      "half-width"
    )
  );
  await writeFile(
    path.join(CHARTS, "coverage_by_quartile_Q2.svg"),
    svgBars(
      [1, 2, 3, 4].map((q) => ({
        label: `Q${q}`,
        value: covQ(
          qEval.filter((p) => expoQ(p.N) === q),
          "Q2",
          80
        ),
      })),
      "Q2 PI80 coverage by exposure Q",
      "coverage"
    )
  );

  const charts = (await readdir(CHARTS)).sort();

  const modelHealth = {
    M16I_REPRODUCED: "PASS",
    M16I_CORRECTED_SELECTION_STATUS: "NO_ELIGIBLE_CANDIDATE",
    M16H_POINT_ESTIMATE_REPRODUCED: "PASS",
    POINT_ESTIMATE_CHANGED: "NO",
    POINT_ESTIMATE_VERSION: RESEARCH_RATE_VERSION,
    POSTERIOR_K: 1600,
    CALIBRATION: "IDENTITY",
    UNCERTAINTY_TARGET: "ABS_FUTURE_PREDICTIVE_ERROR_QUANTILES",
    UNCERTAINTY_INPUTS: "EXPOSURE_ONLY",
    DIRECT_QUANTILE_PROTOCOL_CHRONOLOGICAL: "PASS",
    TRAIN_EVAL_OVERLAP: 0,
    M16B_VALIDATION_USED: "NO",
    RESERVED_TEST_ACCESSED: "NO",
    M16I_U2_WIS: u2Wis,
    M16I_U2_CCE: m16iU2Cce,
    Q0_WIS: mQ0.WIS,
    Q0_CCE: mQ0.CCE,
    Q0_ELIGIBLE: mQ0.eligible ? "YES" : "NO",
    Q1_WIS: mQ1.WIS,
    Q1_CCE: mQ1.CCE,
    Q1_CCE_IMPROVEMENT_VS_U2: mQ1.cceImprovementVsU2,
    Q1_ELIGIBLE: mQ1.eligible ? "YES" : "NO",
    Q2_WIS: mQ2.WIS,
    Q2_CCE: mQ2.CCE,
    Q2_CCE_IMPROVEMENT_VS_U2: mQ2.cceImprovementVsU2,
    Q2_ELIGIBLE: mQ2.eligible ? "YES" : "NO",
    Q2_COLLAPSE_STATUS: collapse,
    SELECTED_UNCERTAINTY_MODEL: SELECTED,
    UNCERTAINTY_SELECTION_RESULT,
    SELECTED_Q1_PI80_COVERAGE:
      SELECTED === "NONE"
        ? null
        : metrics.find((m) => m.candidate === SELECTED)!.Q1_PI80,
    SELECTED_Q1_PI95_COVERAGE:
      SELECTED === "NONE"
        ? null
        : metrics.find((m) => m.candidate === SELECTED)!.Q1_PI95,
    SELECTED_Q4_PI80_COVERAGE:
      SELECTED === "NONE"
        ? null
        : metrics.find((m) => m.candidate === SELECTED)!.Q4_PI80,
    SELECTED_Q4_PI95_COVERAGE:
      SELECTED === "NONE"
        ? null
        : metrics.find((m) => m.candidate === SELECTED)!.Q4_PI95,
    HIGH_EXPOSURE_INTERVAL_INFLATION,
    INTERVAL_NESTING: "PASS",
    ASYMMETRIC_INTERVAL_REVIEW_REQUIRED: ASYM,
    LEGACY_DISAGREEMENT_USED: "NO",
    UNCERTAINTY_CAP_USED: "NO",
    PSEUDO_EXPOSURE_USED: "NO",
    RESEARCH_RATE_MODEL_FREEZE_READY,
    RESERVED_TEST_SHOULD_OPEN,
    PRODUCTION_CHANGED: "NO",
    WAR_CHANGED: "NO",
    nEval: qEval.length,
    m16iU2Q1Pi80,
    m16iU2Q1Pi95,
    m16iU2Q4Pi80,
    m16iU2Q4Pi95,
    u0Q1Pi80,
    u0Q1Pi95,
    errorQ1: {
      MAE: mae(qEval.filter((p) => expoQ(p.N) === 1).map((p) => p.error)),
      RMSE: rmse(qEval.filter((p) => expoQ(p.N) === 1).map((p) => p.error)),
    },
    errorQ4: {
      MAE: mae(qEval.filter((p) => expoQ(p.N) === 4).map((p) => p.error)),
      RMSE: rmse(qEval.filter((p) => expoQ(p.N) === 4).map((p) => p.error)),
    },
    metrics,
    boot,
  };
  await writeFile(
    path.join(OUT, "17_model_health.json"),
    JSON.stringify(modelHealth, null, 2)
  );

  await writeFile(
    path.join(OUT, "18_full_audit.md"),
    `# M16i1 full audit

## M16i corrected
NO_ELIGIBLE_CANDIDATE (U0/U1/U2 all fail catastrophic conditional coverage)

## M16i1 selection
**${UNCERTAINTY_SELECTION_RESULT}** / selected=${SELECTED}

## Key numbers
| Model | WIS | CCE | Q1 PI80 | Eligible |
|-------|-----|-----|---------|----------|
| M16i U2 | ${u2Wis.toFixed(4)} | ${m16iU2Cce.toFixed(4)} | ${m16iU2Q1Pi80.toFixed(3)} | NO |
| Q0 | ${mQ0.WIS.toFixed(4)} | ${mQ0.CCE.toFixed(4)} | ${mQ0.Q1_PI80.toFixed(3)} | ${mQ0.eligible} |
| Q1 | ${mQ1.WIS.toFixed(4)} | ${mQ1.CCE.toFixed(4)} | ${mQ1.Q1_PI80.toFixed(3)} | ${mQ1.eligible} |
| Q2 | ${mQ2.WIS.toFixed(4)} | ${mQ2.CCE.toFixed(4)} | ${mQ2.Q1_PI80.toFixed(3)} | ${mQ2.eligible} |

## Freeze readiness
RESEARCH_RATE_MODEL_FREEZE_READY = ${RESEARCH_RATE_MODEL_FREEZE_READY}
RESERVED_TEST_SHOULD_OPEN = ${RESERVED_TEST_SHOULD_OPEN}

## Charts
${charts.map((c) => `- charts/${c}`).join("\n")}
`
  );

  await writeFile(
    path.join(OUT, "19_final_response_values.json"),
    JSON.stringify(
      {
        modelHealth,
        metrics,
        SELECTED,
        UNCERTAINTY_SELECTION_RESULT,
        finalParams,
        u0Wis,
        u1Wis,
        u2Wis,
        m16iU2Cce,
      },
      null,
      2
    )
  );

  console.log(
    JSON.stringify(
      {
        status: "M16i1_COMPLETE",
        UNCERTAINTY_SELECTION_RESULT,
        SELECTED,
        Q0_ELIGIBLE: mQ0.eligible,
        Q1_ELIGIBLE: mQ1.eligible,
        Q2_ELIGIBLE: mQ2.eligible,
        RESEARCH_RATE_MODEL_FREEZE_READY,
        RESERVED_TEST_SHOULD_OPEN,
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
