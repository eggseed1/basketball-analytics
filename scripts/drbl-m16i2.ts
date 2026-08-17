/**
 * M16i2 — final exposure-only monotone conditional uncertainty generation.
 *   npm run drbl:m16i2
 *
 * Point estimate LOCKED. Candidates: M1 three-regime / M2 logN PWL.
 * If neither eligible → EXPOSURE_ONLY_INFORMATION_CEILING.
 * No M16b VALIDATION. No RESERVED_TEST. No production overwrite.
 */
import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  EVALUATION_PROTOCOL_VERSION,
  METRIC_CONTRACT,
} from "../drbl/evaluation/protocol";
import { verifyFrozenSplitHashes } from "../drbl/evaluation/m16c-dataset";
import { hashGames, type SplitGame } from "../drbl/evaluation/splits";
import { spearman } from "../drbl/evaluation/metrics";
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
  fitU2,
  sigmaOf,
  weightedIntervalScore,
} from "../drbl/models/research-predictive-uncertainty-v1";
import {
  assertWidthMonotoneInN,
  fitQ2,
  intervalsFromWidths as intervalsQ,
  widthsOf,
} from "../drbl/models/research-direct-quantile-uncertainty-v2";
import {
  RESEARCH_PREDICTIVE_INTERVAL_V3,
  assertM1Monotone,
  assertM2MonotoneDense,
  fitM1,
  fitM2,
  intervalsFromWidths,
  widthsM1,
  widthsM2,
  type M2FitResult,
} from "../drbl/models/research-monotone-conditional-uncertainty-v3";
import {
  WAR_EXPOSURE_UNIT,
  WAR_FORMULA_VERSION,
} from "../drbl/models/pipeline-value";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m16i2");
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
  const vmax = Math.max(...vals, 0.01);
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

function svgLines(
  series: Array<{ label: string; pts: Array<{ x: number; y: number }> }>,
  title: string,
  xlab: string,
  ylab: string
): string {
  const w = 640,
    h = 360,
    pad = 52;
  const all = series.flatMap((s) => s.pts);
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const xmin = Math.min(...xs),
    xmax = Math.max(...xs),
    ymin = Math.min(0, ...ys),
    ymax = Math.max(...ys);
  const dx = xmax - xmin || 1;
  const dy = ymax - ymin || 1;
  const mapX = (x: number) => pad + ((x - xmin) / dx) * (w - 2 * pad);
  const mapY = (y: number) => h - pad - ((y - ymin) / dy) * (h - 2 * pad);
  const colors = ["#1f4e79", "#c45c26", "#2a7f62", "#6b4c9a"];
  const paths = series
    .map((s, si) => {
      const d = s.pts
        .map(
          (p, i) =>
            `${i === 0 ? "M" : "L"}${mapX(p.x).toFixed(1)},${mapY(p.y).toFixed(1)}`
        )
        .join(" ");
      return `<path d="${d}" fill="none" stroke="${colors[si % colors.length]}" stroke-width="2"/><text x="${w - pad}" y="${pad + si * 14}" text-anchor="end" font-size="10" fill="${colors[si % colors.length]}">${s.label}</text>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#fafafa"/><text x="${w / 2}" y="22" text-anchor="middle" font-size="13">${title}</text><text x="${w / 2}" y="${h - 10}" text-anchor="middle" font-size="11">${xlab}</text><text x="12" y="${h / 2}" text-anchor="middle" font-size="11" transform="rotate(-90 12 ${h / 2})">${ylab}</text>${paths}</svg>`;
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
        milestone: "M16i2",
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
        POINT_ESTIMATE_MODEL_FROZEN: "YES",
        m16iCorrectedStatus: {
          M16I_UNCERTAINTY_SELECTION: "NO_ELIGIBLE_CANDIDATE",
          UNCERTAINTY_SELECTION_RESULT: "UNCERTAINTY_BLOCKED",
        },
        m16i1Status: {
          SELECTED_UNCERTAINTY_MODEL: "NONE",
          UNCERTAINTY_SELECTION_RESULT: "NO_ELIGIBLE_UNCERTAINTY_MODEL",
        },
        candidateFamily: ["M1_THREE_REGIME", "M2_MONOTONE_LOGN_PWL"],
        knotRules: {
          M2_interiorKnots: 3,
          M2_positions: "training logN p25/p50/p75 + min/max",
          M2_extrapolation: "boundary-constant",
        },
        binRules: {
          M1_regimes: 3,
          M1_cutpoints: "training N tertiles 33.333/66.667",
          descriptiveDeciles: 10,
        },
        coverageGates: {
          pooled50: [0.45, 0.55],
          pooled80: [0.75, 0.85],
          pooled95: [0.9, 1.0],
          catastrophic80: 0.7,
          catastrophic95: 0.85,
        },
        CCE: "mean |cov-nominal| over 4 quartiles × 3 levels",
        WIS: "frozen M16i definition 50/80/95",
        selectionRules: {
          cceImproveVsU2: CCE_IMPROVE,
          wisNonDegradationVsU2: PRACTICAL,
          ifNone: "EXPOSURE_ONLY_INFORMATION_CEILING",
        },
        uncertaintyVersion: RESEARCH_PREDICTIVE_INTERVAL_V3,
        WAR_version: WAR_FORMULA_VERSION,
        WAR_exposureUnit: WAR_EXPOSURE_UNIT,
        M16B_VALIDATION_USED: false,
        RESERVED_TEST_ACCESSED: false,
      },
      null,
      2
    )
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
  const allRows = parseFoldRows(
    await readFile(path.join(M16G, "04_fold_rows.csv"), "utf8")
  );
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
      throw new Error("STOP POINT_ESTIMATE_DRIFT");
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
        POINT_ESTIMATE_MODEL_FROZEN: "YES",
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
  const foldCounts = Object.fromEntries(
    evalFoldIds.map((id) => [
      `F${id + 1}`,
      rows.filter((r) => r.foldId === id).length,
    ])
  );
  await writeFile(
    path.join(OUT, "03_protocol.json"),
    JSON.stringify(
      {
        warmUp: "F1",
        evaluationFolds: ["F2", "F3", "F4", "F5"],
        foldCounts,
        pooledEvalRows: rows.filter((r) => r.foldId >= 1).length,
        TRAIN_EVAL_OVERLAP: 0,
        candidates: ["M1", "M2"],
        response: "absError = |target - lockedDRBL|",
        input: "historical N only (logN for M2)",
        folds: protocol,
        note: "TRAIN-development chronological OOS folds",
      },
      null,
      2
    )
  );

  type Iv = ReturnType<typeof intervalsFromWidths>;
  type EvalRow = {
    foldId: number;
    playerId: string;
    N: number;
    prediction: number;
    target: number;
    error: number;
    absError: number;
    ivU2: ReturnType<typeof computeResearchPredictionIntervalsV1>;
    ivQ2: ReturnType<typeof intervalsQ>;
    ivM1: Iv;
    ivM2: Iv;
    wisU2: number;
    wisQ2: number;
    wisM1: number;
    wisM2: number;
  };

  const rollingParams: Record<string, unknown>[] = [];
  const evalRows: EvalRow[] = [];

  for (const pf of protocol) {
    const train = rows.filter((r) => pf.trainFoldIds.includes(r.foldId));
    const ev = rows.filter((r) => r.foldId === pf.evalFoldId);
    const eTr = train.map((r) => r.error);
    const aTr = train.map((r) => r.absError);
    const nTr = train.map((r) => r.N);

    const U2f = fitU2(eTr, nTr);
    const U2 = { sigmaFloor: U2f.sigmaFloor, c: U2f.c };
    assertMonotoneSigma("U2_FLOOR_PLUS_SAMPLING", U2, 50, 15000);
    const qU2 = empiricalAbsZQuantiles(
      eTr,
      nTr.map((n) => sigmaOf("U2_FLOOR_PLUS_SAMPLING", n, U2))
    );

    const Q2f = fitQ2(aTr, nTr);
    assertWidthMonotoneInN("Q2_FLOOR_PLUS_SAMPLING", Q2f, 50, 15000);

    const M1 = fitM1(aTr, nTr);
    assertM1Monotone(M1);
    const M2 = fitM2(aTr, nTr);
    assertM2MonotoneDense(
      M2,
      Math.min(...nTr, ...ev.map((r) => r.N)),
      Math.max(...nTr, ...ev.map((r) => r.N)),
      1000
    );

    rollingParams.push({
      fold: pf.name,
      evalFoldId: pf.evalFoldId,
      model: "M1",
      T1: M1.T1,
      T2: M1.T2,
      low50: M1.low.w50,
      low80: M1.low.w80,
      low95: M1.low.w95,
      mid50: M1.mid.w50,
      mid80: M1.mid.w80,
      mid95: M1.mid.w95,
      high50: M1.high.w50,
      high80: M1.high.w80,
      high95: M1.high.w95,
    });
    rollingParams.push({
      fold: pf.name,
      evalFoldId: pf.evalFoldId,
      model: "M2",
      startObjective: M2.startObjective,
      finalObjective: M2.finalObjective,
      iterations: M2.iterations,
      converged: M2.converged,
      constraintResidual: M2.constraintResidual,
      minWidth: M2.minWidth,
      maxWidth: M2.maxWidth,
      knots: M2.knotsLogN.join("|"),
      w50: M2.w50.join("|"),
      w80: M2.w80.join("|"),
      w95: M2.w95.join("|"),
    });

    for (const r of ev) {
      const ivU2 = computeResearchPredictionIntervalsV1(r.prediction, r.N, {
        modelType: "U2_FLOOR_PLUS_SAMPLING",
        params: U2,
        quantiles: qU2,
      });
      const wQ2 = widthsOf("Q2_FLOOR_PLUS_SAMPLING", r.N, Q2f);
      const ivQ2 = intervalsQ(r.prediction, wQ2);
      const ivM1 = intervalsFromWidths(r.prediction, widthsM1(r.N, M1));
      const ivM2 = intervalsFromWidths(r.prediction, widthsM2(r.N, M2));
      const wis = (iv: {
        pi50Lo?: number;
        pi50Hi?: number;
        pi80Lo?: number;
        pi80Hi?: number;
        pi95Lo?: number;
        pi95Hi?: number;
        researchPI50Lo?: number;
        researchPI50Hi?: number;
        researchPI80Lo?: number;
        researchPI80Hi?: number;
        researchPI95Lo?: number;
        researchPI95Hi?: number;
      }) =>
        weightedIntervalScore(
          r.target,
          r.prediction,
          iv.pi50Lo ?? iv.researchPI50Lo!,
          iv.pi50Hi ?? iv.researchPI50Hi!,
          iv.pi80Lo ?? iv.researchPI80Lo!,
          iv.pi80Hi ?? iv.researchPI80Hi!,
          iv.pi95Lo ?? iv.researchPI95Lo!,
          iv.pi95Hi ?? iv.researchPI95Hi!
        );
      // nesting / center checks
      for (const iv of [ivM1, ivM2, ivQ2]) {
        const mid50 = (iv.pi50Lo + iv.pi50Hi) / 2;
        const mid80 = (iv.pi80Lo + iv.pi80Hi) / 2;
        const mid95 = (iv.pi95Lo + iv.pi95Hi) / 2;
        if (
          Math.abs(mid50 - r.prediction) > 1e-9 ||
          Math.abs(mid80 - r.prediction) > 1e-9 ||
          Math.abs(mid95 - r.prediction) > 1e-9
        ) {
          throw new Error("STOP point estimate center moved");
        }
        if (
          !(
            iv.pi95Lo <= iv.pi80Lo + 1e-12 &&
            iv.pi80Lo <= iv.pi50Lo + 1e-12 &&
            iv.pi50Lo <= r.prediction + 1e-12 &&
            r.prediction <= iv.pi50Hi + 1e-12 &&
            iv.pi50Hi <= iv.pi80Hi + 1e-12 &&
            iv.pi80Hi <= iv.pi95Hi + 1e-12
          )
        ) {
          throw new Error("STOP INTERVAL_NESTING_FAILURE");
        }
      }
      evalRows.push({
        foldId: r.foldId,
        playerId: r.playerId,
        N: r.N,
        prediction: r.prediction,
        target: r.target,
        error: r.error,
        absError: r.absError,
        ivU2,
        ivQ2,
        ivM1,
        ivM2,
        wisU2: wis(ivU2),
        wisQ2: wis(ivQ2),
        wisM1: wis(ivM1),
        wisM2: wis(ivM2),
      });
    }
  }
  await writeFile(path.join(OUT, "07_rolling_model_parameters.csv"), toCsv(rollingParams));

  // Frozen exposure quartiles from pooled F2-F5 N
  const nSorted = [...evalRows.map((p) => p.N)].sort((a, b) => a - b);
  const qCuts = [25, 50, 75].map((p) => percentile(nSorted, p));
  function expoQ(n: number) {
    if (n <= qCuts[0]!) return 1;
    if (n <= qCuts[1]!) return 2;
    if (n <= qCuts[2]!) return 3;
    return 4;
  }

  function cov(
    slice: EvalRow[],
    pick: (p: EvalRow) => { lo: number; hi: number }
  ) {
    let hit = 0;
    for (const p of slice) {
      const { lo, hi } = pick(p);
      if (p.target >= lo && p.target <= hi) hit++;
    }
    return hit / (slice.length || 1);
  }

  function pickIv(p: EvalRow, which: "U2" | "Q2" | "M1" | "M2") {
    if (which === "U2")
      return {
        w50: (p.ivU2.researchPI50Hi - p.ivU2.researchPI50Lo) / 2,
        w80: (p.ivU2.researchPI80Hi - p.ivU2.researchPI80Lo) / 2,
        w95: (p.ivU2.researchPI95Hi - p.ivU2.researchPI95Lo) / 2,
        pi50Lo: p.ivU2.researchPI50Lo,
        pi50Hi: p.ivU2.researchPI50Hi,
        pi80Lo: p.ivU2.researchPI80Lo,
        pi80Hi: p.ivU2.researchPI80Hi,
        pi95Lo: p.ivU2.researchPI95Lo,
        pi95Hi: p.ivU2.researchPI95Hi,
      };
    if (which === "Q2") return p.ivQ2;
    if (which === "M1") return p.ivM1;
    return p.ivM2;
  }

  function wisOf(p: EvalRow, which: "U2" | "Q2" | "M1" | "M2") {
    return which === "U2"
      ? p.wisU2
      : which === "Q2"
        ? p.wisQ2
        : which === "M1"
          ? p.wisM1
          : p.wisM2;
  }

  function quartileCov(
    which: "U2" | "Q2" | "M1" | "M2",
    q: number,
    level: 50 | 80 | 95
  ) {
    const slice = evalRows.filter((p) => expoQ(p.N) === q);
    const iv = (p: EvalRow) => pickIv(p, which);
    if (level === 50)
      return cov(slice, (p) => ({ lo: iv(p).pi50Lo, hi: iv(p).pi50Hi }));
    if (level === 80)
      return cov(slice, (p) => ({ lo: iv(p).pi80Lo, hi: iv(p).pi80Hi }));
    return cov(slice, (p) => ({ lo: iv(p).pi95Lo, hi: iv(p).pi95Hi }));
  }

  function pooledCov(which: "U2" | "Q2" | "M1" | "M2", level: 50 | 80 | 95) {
    const iv = (p: EvalRow) => pickIv(p, which);
    if (level === 50)
      return cov(evalRows, (p) => ({ lo: iv(p).pi50Lo, hi: iv(p).pi50Hi }));
    if (level === 80)
      return cov(evalRows, (p) => ({ lo: iv(p).pi80Lo, hi: iv(p).pi80Hi }));
    return cov(evalRows, (p) => ({ lo: iv(p).pi95Lo, hi: iv(p).pi95Hi }));
  }

  function catastrophic(which: "U2" | "Q2" | "M1" | "M2") {
    return [1, 2, 3, 4].some((q) => {
      const c80 = quartileCov(which, q, 80);
      const c95 = quartileCov(which, q, 95);
      return c80 < 0.7 || c95 < 0.85;
    });
  }

  function pooledOk(which: "U2" | "Q2" | "M1" | "M2") {
    const c50 = pooledCov(which, 50);
    const c80 = pooledCov(which, 80);
    const c95 = pooledCov(which, 95);
    return (
      c50 >= 0.45 &&
      c50 <= 0.55 &&
      c80 >= 0.75 &&
      c80 <= 0.85 &&
      c95 >= 0.9 &&
      c95 <= 1.0
    );
  }

  function cceOf(which: "U2" | "Q2" | "M1" | "M2") {
    const cells: number[] = [];
    for (const q of [1, 2, 3, 4]) {
      cells.push(Math.abs(quartileCov(which, q, 50) - 0.5));
      cells.push(Math.abs(quartileCov(which, q, 80) - 0.8));
      cells.push(Math.abs(quartileCov(which, q, 95) - 0.95));
    }
    return mean(cells);
  }

  const u2Wis = mean(evalRows.map((p) => p.wisU2));
  const q2Wis = mean(evalRows.map((p) => p.wisQ2));
  const u2Cce = cceOf("U2");
  const q2Cce = cceOf("Q2");
  const errorQ1 = evalRows.filter((p) => expoQ(p.N) === 1);
  const errorQ4 = evalRows.filter((p) => expoQ(p.N) === 4);
  const q1Mae = mae(errorQ1.map((p) => p.error));
  const q1Rmse = rmse(errorQ1.map((p) => p.error));
  const q4Mae = mae(errorQ4.map((p) => p.error));
  const q4Rmse = rmse(errorQ4.map((p) => p.error));

  const priorOk =
    Math.abs(u2Wis - 4.314058843592033) < 0.02 &&
    Math.abs(u2Cce - 0.046018062397372744) < 0.005 &&
    Math.abs(q2Wis - 4.32459489453041) < 0.02 &&
    Math.abs(q2Cce - 0.049466338259441696) < 0.005 &&
    Math.abs(quartileCov("Q2", 1, 80) - 0.6724137931034483) < 0.02 &&
    Math.abs(q1Mae - 2.917) < 0.05 &&
    Math.abs(q4Mae - 1.319) < 0.05;

  if (!priorOk) {
    throw new Error("STOP PRIOR_UNCERTAINTY_REPRODUCTION_FAILURE");
  }

  await writeFile(
    path.join(OUT, "01_prior_uncertainty_reproduction.json"),
    JSON.stringify(
      {
        reproduced: "PASS",
        M16I_U2_WIS: u2Wis,
        M16I_U2_CCE: u2Cce,
        M16I1_Q2_WIS: q2Wis,
        M16I1_Q2_CCE: q2Cce,
        M16I1_Q2_Q1_PI80: quartileCov("Q2", 1, 80),
        M16I1_SELECTED: "NONE",
        Q1_MAE: q1Mae,
        Q1_RMSE: q1Rmse,
        Q4_MAE: q4Mae,
        Q4_RMSE: q4Rmse,
      },
      null,
      2
    )
  );

  // ===== Part I descriptive shape =====
  const evalOnly = evalRows;
  const byN = [...evalOnly].sort((a, b) => a.N - b.N);
  const decileSize = Math.ceil(byN.length / 10);
  const decileRows: Record<string, unknown>[] = [];
  const decileMed: number[] = [];
  const decileP80: number[] = [];
  const decileP95: number[] = [];
  for (let d = 0; d < 10; d++) {
    const slice = byN.slice(d * decileSize, Math.min(byN.length, (d + 1) * decileSize));
    const abs = slice.map((p) => p.absError).sort((a, b) => a - b);
    const med = percentile(abs, 50);
    const p80 = percentile(abs, 80);
    const p95 = percentile(abs, 95);
    decileMed.push(med);
    decileP80.push(p80);
    decileP95.push(p95);
    decileRows.push({
      decile: d + 1,
      nRows: slice.length,
      meanN: mean(slice.map((p) => p.N)),
      medianN: percentile(
        [...slice.map((p) => p.N)].sort((a, b) => a - b),
        50
      ),
      MAE: mae(slice.map((p) => p.error)),
      RMSE: rmse(slice.map((p) => p.error)),
      medianAbsError: med,
      P80_absError: p80,
      P95_absError: p95,
    });
  }
  await writeFile(path.join(OUT, "04_error_shape_deciles.csv"), toCsv(decileRows));

  const shapeStab: Record<string, unknown>[] = [];
  for (const fid of evalFoldIds) {
    const foldSlice = evalOnly.filter((p) => p.foldId === fid);
    const ns = [...foldSlice.map((p) => p.N)].sort((a, b) => a - b);
    const cuts = [25, 50, 75].map((p) => percentile(ns, p));
    const qOf = (n: number) =>
      n <= cuts[0]! ? 1 : n <= cuts[1]! ? 2 : n <= cuts[2]! ? 3 : 4;
    for (const q of [1, 2, 3, 4]) {
      const s = foldSlice.filter((p) => qOf(p.N) === q);
      const abs = s.map((p) => p.absError).sort((a, b) => a - b);
      shapeStab.push({
        fold: `F${fid + 1}`,
        quartile: `Q${q}`,
        n: s.length,
        medianAbsError: percentile(abs, 50),
        P80_absError: percentile(abs, 80),
        P95_absError: percentile(abs, 95),
      });
    }
  }
  await writeFile(path.join(OUT, "05_shape_stability_by_fold.csv"), toCsv(shapeStab));

  const logN = evalOnly.map((p) => Math.log(Math.max(1e-12, p.N)));
  const absE = evalOnly.map((p) => p.absError);
  const spLogN = spearman(logN, absE);
  const spN = spearman(
    evalOnly.map((p) => p.N),
    absE
  );
  const decIdx = decileMed.map((_, i) => i + 1);
  const spDecMed = spearman(decIdx, decileMed);
  const spDecP80 = spearman(decIdx, decileP80);
  const spDecP95 = spearman(decIdx, decileP95);

  // R² log(absError+eps) ~ logN
  const eps = 1e-6;
  const ys = absE.map((e) => Math.log(e + eps));
  const xs = logN;
  const xbar = mean(xs);
  const ybar = mean(ys);
  let sxx = 0,
    sxy = 0,
    syy = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i]! - xbar;
    const dy = ys[i]! - ybar;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const beta = sxy / sxx;
  const alpha = ybar - beta * xbar;
  let ssRes = 0;
  for (let i = 0; i < xs.length; i++) {
    const pred = alpha + beta * xs[i]!;
    ssRes += (ys[i]! - pred) ** 2;
  }
  const r2 = 1 - ssRes / syy;

  // fold stability: check Q1 median > Q4 median in each fold
  let stableCount = 0;
  for (const fid of evalFoldIds) {
    const q1 = shapeStab.find(
      (r) => r.fold === `F${fid + 1}` && r.quartile === "Q1"
    ) as { medianAbsError: number };
    const q4 = shapeStab.find(
      (r) => r.fold === `F${fid + 1}` && r.quartile === "Q4"
    ) as { medianAbsError: number };
    if (q1.medianAbsError > q4.medianAbsError) stableCount++;
  }
  const shapeStable =
    stableCount === 4 ? "YES" : stableCount >= 3 ? "PARTIAL" : "NO";

  await writeFile(
    path.join(OUT, "06_exposure_information_diagnostic.md"),
    `# M16i2 exposure information diagnostic

Diagnostic only — does not alter candidate family.

- Spearman(N, absError) = ${spN.toFixed(4)}
- Spearman(logN, absError) = ${spLogN.toFixed(4)}
- Spearman(decileIndex, median absError) = ${spDecMed.toFixed(4)}
- Spearman(decileIndex, P80 absError) = ${spDecP80.toFixed(4)}
- Spearman(decileIndex, P95 absError) = ${spDecP95.toFixed(4)}
- R² log(absError+ε) ~ logN = ${r2.toFixed(4)}
- Q1 MAE/RMSE = ${q1Mae.toFixed(3)} / ${q1Rmse.toFixed(3)}
- Q4 MAE/RMSE = ${q4Mae.toFixed(3)} / ${q4Rmse.toFixed(3)}
- Fold directional stability (Q1 median > Q4 median): ${stableCount}/4 → ${shapeStable}

Interpretation: exposure contains real information about future |error| magnitude,
but row-level R² is modest — N alone cannot explain most residual variation.
`
  );

  // ===== Candidate metrics =====
  function metricsOf(which: "M1" | "M2") {
    const WIS = mean(evalRows.map((p) => wisOf(p, which)));
    const CCE = cceOf(which);
    const cov50 = pooledCov(which, 50);
    const cov80 = pooledCov(which, 80);
    const cov95 = pooledCov(which, 95);
    const Q1_PI50 = quartileCov(which, 1, 50);
    const Q1_PI80 = quartileCov(which, 1, 80);
    const Q1_PI95 = quartileCov(which, 1, 95);
    const Q4_PI50 = quartileCov(which, 4, 50);
    const Q4_PI80 = quartileCov(which, 4, 80);
    const Q4_PI95 = quartileCov(which, 4, 95);
    const cat = catastrophic(which);
    const pooled = pooledOk(which);
    const cceImp = (u2Cce - CCE) / u2Cce;
    const wisOk = WIS <= u2Wis * (1 + PRACTICAL);
    const cceOk = cceImp >= CCE_IMPROVE;
    const meanW80 = mean(evalRows.map((p) => pickIv(p, which).w80 * 2));
    const meanW95 = mean(evalRows.map((p) => pickIv(p, which).w95 * 2));
    const u2MeanW80 = mean(
      evalRows.map((p) => pickIv(p, "U2").w80 * 2)
    );
    const u2MeanW95 = mean(
      evalRows.map((p) => pickIv(p, "U2").w95 * 2)
    );
    const globalInflation =
      meanW80 > 1.2 * u2MeanW80 || meanW95 > 1.2 * u2MeanW95;
    const eligible = pooled && !cat && cceOk && wisOk;
    return {
      candidate: which,
      WIS,
      CCE,
      cov50,
      cov80,
      cov95,
      Q1_PI50,
      Q1_PI80,
      Q1_PI95,
      Q4_PI50,
      Q4_PI80,
      Q4_PI95,
      catastrophic: cat,
      pooledOk: pooled,
      cceImprovementVsU2: cceImp,
      wisOkVsU2: wisOk,
      cceOk,
      eligible,
      meanWidth80: meanW80,
      meanWidth95: meanW95,
      GLOBAL_INTERVAL_INFLATION: globalInflation ? "YES" : "NO",
      deltaWisVsU2: WIS - u2Wis,
    };
  }

  const mM1 = metricsOf("M1");
  const mM2 = metricsOf("M2");

  await writeFile(
    path.join(OUT, "11_candidate_metrics.csv"),
    toCsv([
      {
        candidate: "M16I_U2",
        WIS: u2Wis,
        CCE: u2Cce,
        cov50: pooledCov("U2", 50),
        cov80: pooledCov("U2", 80),
        cov95: pooledCov("U2", 95),
        Q1_PI80: quartileCov("U2", 1, 80),
        Q1_PI95: quartileCov("U2", 1, 95),
        eligible: false,
      },
      {
        candidate: "M16I1_Q2",
        WIS: q2Wis,
        CCE: q2Cce,
        cov50: pooledCov("Q2", 50),
        cov80: pooledCov("Q2", 80),
        cov95: pooledCov("Q2", 95),
        Q1_PI80: quartileCov("Q2", 1, 80),
        Q1_PI95: quartileCov("Q2", 1, 95),
        eligible: false,
      },
      mM1,
      mM2,
    ])
  );

  // CCE detail
  const cceDetail: Record<string, unknown>[] = [];
  for (const which of ["U2", "Q2", "M1", "M2"] as const) {
    for (const q of [1, 2, 3, 4]) {
      for (const level of [50, 80, 95] as const) {
        const covv = quartileCov(which, q, level);
        const nom = level / 100;
        cceDetail.push({
          candidate: which,
          quartile: `Q${q}`,
          level,
          coverage: covv,
          nominal: nom,
          absDev: Math.abs(covv - nom),
        });
      }
    }
  }
  await writeFile(path.join(OUT, "13_conditional_coverage_error.csv"), toCsv(cceDetail));

  // Exposure quartile metrics
  const expoRows: Record<string, unknown>[] = [];
  for (const which of ["U2", "Q2", "M1", "M2"] as const) {
    for (const q of [1, 2, 3, 4]) {
      const slice = evalRows.filter((p) => expoQ(p.N) === q);
      const abs = slice.map((p) => p.absError).sort((a, b) => a - b);
      const iv = (p: EvalRow) => pickIv(p, which);
      expoRows.push({
        candidate: which,
        quartile: `Q${q}`,
        nRows: slice.length,
        meanN: mean(slice.map((p) => p.N)),
        MAE: mae(slice.map((p) => p.error)),
        RMSE: rmse(slice.map((p) => p.error)),
        medianAbsError: percentile(abs, 50),
        P80_absError: percentile(abs, 80),
        P95_absError: percentile(abs, 95),
        PI50_cov: cov(slice, (p) => ({ lo: iv(p).pi50Lo, hi: iv(p).pi50Hi })),
        PI80_cov: cov(slice, (p) => ({ lo: iv(p).pi80Lo, hi: iv(p).pi80Hi })),
        PI95_cov: cov(slice, (p) => ({ lo: iv(p).pi95Lo, hi: iv(p).pi95Hi })),
        PI50_width: mean(slice.map((p) => iv(p).w50 * 2)),
        PI80_width: mean(slice.map((p) => iv(p).w80 * 2)),
        PI95_width: mean(slice.map((p) => iv(p).w95 * 2)),
        WIS: mean(slice.map((p) => wisOf(p, which))),
      });
    }
  }
  await writeFile(path.join(OUT, "12_exposure_quartile_metrics.csv"), toCsv(expoRows));

  // Fold metrics
  const foldRowsOut: Record<string, unknown>[] = [];
  for (const which of ["U2", "M1", "M2"] as const) {
    for (const fid of evalFoldIds) {
      const slice = evalRows.filter((p) => p.foldId === fid);
      const iv = (p: EvalRow) => pickIv(p, which);
      const q1 = slice.filter((p) => expoQ(p.N) === 1);
      foldRowsOut.push({
        candidate: which,
        fold: `F${fid + 1}`,
        WIS: mean(slice.map((p) => wisOf(p, which))),
        PI50: cov(slice, (p) => ({ lo: iv(p).pi50Lo, hi: iv(p).pi50Hi })),
        PI80: cov(slice, (p) => ({ lo: iv(p).pi80Lo, hi: iv(p).pi80Hi })),
        PI95: cov(slice, (p) => ({ lo: iv(p).pi95Lo, hi: iv(p).pi95Hi })),
        Q1_PI80: cov(q1, (p) => ({ lo: iv(p).pi80Lo, hi: iv(p).pi80Hi })),
        Q1_PI95: cov(q1, (p) => ({ lo: iv(p).pi95Lo, hi: iv(p).pi95Hi })),
      });
    }
  }
  await writeFile(path.join(OUT, "14_fold_metrics.csv"), toCsv(foldRowsOut));

  const m1FoldsBeatU2 = evalFoldIds.filter((fid) => {
    const m1 = foldRowsOut.find(
      (r) => r.candidate === "M1" && r.fold === `F${fid + 1}`
    ) as { WIS: number };
    const u2 = foldRowsOut.find(
      (r) => r.candidate === "U2" && r.fold === `F${fid + 1}`
    ) as { WIS: number };
    return m1.WIS < u2.WIS;
  }).length;
  const m2FoldsBeatU2 = evalFoldIds.filter((fid) => {
    const m2 = foldRowsOut.find(
      (r) => r.candidate === "M2" && r.fold === `F${fid + 1}`
    ) as { WIS: number };
    const u2 = foldRowsOut.find(
      (r) => r.candidate === "U2" && r.fold === `F${fid + 1}`
    ) as { WIS: number };
    return m2.WIS < u2.WIS;
  }).length;

  // Bootstrap
  const blockIds = evalRows.map((p) => `${p.foldId}:${p.playerId}`);
  const boot = [
    {
      comparison: "M1_vs_U2",
      ...pairedBlockBootstrapWisDiff(
        evalRows.map((p) => p.wisU2),
        evalRows.map((p) => p.wisM1),
        blockIds
      ),
    },
    {
      comparison: "M2_vs_U2",
      ...pairedBlockBootstrapWisDiff(
        evalRows.map((p) => p.wisU2),
        evalRows.map((p) => p.wisM2),
        blockIds
      ),
    },
    {
      comparison: "M2_vs_M1",
      ...pairedBlockBootstrapWisDiff(
        evalRows.map((p) => p.wisM1),
        evalRows.map((p) => p.wisM2),
        blockIds
      ),
    },
  ];
  await writeFile(path.join(OUT, "08_bootstrap_wis.csv"), toCsv(boot));

  // Discrimination
  const discRows: Record<string, unknown>[] = [];
  for (const which of ["M1", "M2"] as const) {
    const ordered = [...evalRows].sort(
      (a, b) => pickIv(a, which).w80 - pickIv(b, which).w80
    );
    const size = Math.ceil(ordered.length / 4);
    const sp80 = spearman(
      evalRows.map((p) => pickIv(p, which).w80),
      evalRows.map((p) => p.absError)
    );
    const sp95 = spearman(
      evalRows.map((p) => pickIv(p, which).w95),
      evalRows.map((p) => p.absError)
    );
    for (let qi = 0; qi < 4; qi++) {
      const slice = ordered.slice(qi * size, Math.min(ordered.length, (qi + 1) * size));
      const abs = slice.map((p) => p.absError).sort((a, b) => a - b);
      discRows.push({
        candidate: which,
        UQ: `UQ${qi + 1}`,
        n: slice.length,
        mean_PI80_half: mean(slice.map((p) => pickIv(p, which).w80)),
        MAE: mae(slice.map((p) => p.error)),
        RMSE: rmse(slice.map((p) => p.error)),
        P80_abs: percentile(abs, 80),
        P95_abs: percentile(abs, 95),
        spearman_PI80_half_absErr: sp80,
        spearman_PI95_half_absErr: sp95,
      });
    }
  }
  await writeFile(path.join(OUT, "15_uncertainty_discrimination.csv"), toCsv(discRows));

  // Tail symmetry (focus on best numerical among M1/M2 = lower WIS)
  const focus: "M1" | "M2" = mM1.WIS <= mM2.WIS ? "M1" : "M2";
  let asymFolds = 0;
  for (const fid of evalFoldIds) {
    const slice = evalRows.filter((p) => p.foldId === fid);
    const iv = (p: EvalRow) => pickIv(p, focus);
    let lower = 0,
      upper = 0;
    for (const p of slice) {
      if (p.target < iv(p).pi80Lo) lower++;
      if (p.target > iv(p).pi80Hi) upper++;
    }
    const lr = lower / slice.length;
    const ur = upper / slice.length;
    if (Math.abs(lr - ur) > 0.05) asymFolds++;
  }
  const posShare =
    evalRows.filter((p) => p.error > 0).length / evalRows.length;
  const negShare =
    evalRows.filter((p) => p.error < 0).length / evalRows.length;
  const lowerMiss = mean(
    evalRows.map((p) => (p.target < pickIv(p, focus).pi80Lo ? 1 : 0))
  );
  const upperMiss = mean(
    evalRows.map((p) => (p.target > pickIv(p, focus).pi80Hi ? 1 : 0))
  );
  const asymRequired = asymFolds >= 3 ? "YES" : "NO";
  await writeFile(
    path.join(OUT, "16_tail_symmetry.csv"),
    toCsv([
      {
        focusCandidate: focus,
        P_error_gt0: posShare,
        P_error_lt0: negShare,
        PI80_lower_miss: lowerMiss,
        PI80_upper_miss: upperMiss,
        asym_folds: asymFolds,
        ASYMMETRIC_INTERVAL_REVIEW_REQUIRED: asymRequired,
      },
    ])
  );

  // High exposure inflation
  const u2Q4W80 = (
    expoRows.find((r) => r.candidate === "U2" && r.quartile === "Q4") as {
      PI80_width: number;
    }
  ).PI80_width;
  const m1Q4W80 = (
    expoRows.find((r) => r.candidate === "M1" && r.quartile === "Q4") as {
      PI80_width: number;
    }
  ).PI80_width;
  const m2Q4W80 = (
    expoRows.find((r) => r.candidate === "M2" && r.quartile === "Q4") as {
      PI80_width: number;
    }
  ).PI80_width;
  const highInflation =
    m1Q4W80 > 1.2 * u2Q4W80 || m2Q4W80 > 1.2 * u2Q4W80 ? "YES" : "NO";

  const m1Q1W80 = (
    expoRows.find((r) => r.candidate === "M1" && r.quartile === "Q1") as {
      PI80_width: number;
    }
  ).PI80_width;
  const m2Q1W80 = (
    expoRows.find((r) => r.candidate === "M2" && r.quartile === "Q1") as {
      PI80_width: number;
    }
  ).PI80_width;

  // Selection
  const eligible: Array<"M1" | "M2"> = [];
  if (mM1.eligible) eligible.push("M1");
  if (mM2.eligible) eligible.push("M2");

  let SELECTED: "M1" | "M2" | "NONE" = "NONE";
  let UNCERTAINTY_SELECTION_RESULT =
    "EXPOSURE_ONLY_INFORMATION_CEILING" as
      | "THREE_REGIME_MONOTONE_SELECTED"
      | "MONOTONE_SPLINE_SELECTED"
      | "EXPOSURE_ONLY_INFORMATION_CEILING";
  let practicalEq = "N/A";

  if (eligible.length === 1) {
    SELECTED = eligible[0]!;
    UNCERTAINTY_SELECTION_RESULT =
      SELECTED === "M1"
        ? "THREE_REGIME_MONOTONE_SELECTED"
        : "MONOTONE_SPLINE_SELECTED";
  } else if (eligible.length === 2) {
    const rel =
      Math.abs(mM1.WIS - mM2.WIS) / Math.min(mM1.WIS, mM2.WIS);
    const bootM2M1 = boot.find((b) => b.comparison === "M2_vs_M1")!;
    if (rel < PRACTICAL && bootM2M1.probCandidateBeatsBaseline < 0.95) {
      SELECTED = "M1";
      practicalEq = "WIS within 0.5%; choose simpler M1";
      UNCERTAINTY_SELECTION_RESULT = "THREE_REGIME_MONOTONE_SELECTED";
    } else if (
      mM2.WIS <= mM1.WIS * (1 - PRACTICAL) &&
      bootM2M1.probCandidateBeatsBaseline >= 0.95
    ) {
      SELECTED = "M2";
      practicalEq = "M2 improves WIS >=0.5% with P>=0.95";
      UNCERTAINTY_SELECTION_RESULT = "MONOTONE_SPLINE_SELECTED";
    } else {
      SELECTED = mM1.WIS <= mM2.WIS ? "M1" : "M2";
      practicalEq = "lowest WIS among eligible";
      UNCERTAINTY_SELECTION_RESULT =
        SELECTED === "M1"
          ? "THREE_REGIME_MONOTONE_SELECTED"
          : "MONOTONE_SPLINE_SELECTED";
    }
  }

  const ceiling =
    SELECTED === "NONE"
      ? "STOPPED_FOR_CURRENT_PROTOCOL"
      : "ACTIVE";
  const freezeReady = SELECTED !== "NONE";
  const uncFrozen = SELECTED !== "NONE";

  await writeFile(
    path.join(OUT, "10_uncertainty_selection_decision.json"),
    JSON.stringify(
      {
        M1: mM1,
        M2: mM2,
        bootstrap: boot,
        eligible,
        SELECTED_UNCERTAINTY_MODEL: SELECTED,
        UNCERTAINTY_SELECTION_RESULT,
        EXPOSURE_ONLY_INFORMATION_CEILING: SELECTED === "NONE",
        EXPOSURE_ONLY_UNCERTAINTY_RESEARCH: ceiling,
        PREDICTIVE_UNCERTAINTY_FROZEN: uncFrozen ? "YES" : "NO",
        RESEARCH_RATE_MODEL_FREEZE_READY: freezeReady ? "YES" : "NO",
        RESERVED_TEST_SHOULD_OPEN: freezeReady ? "YES" : "NO",
        HIGH_EXPOSURE_INTERVAL_INFLATION: highInflation,
        practicalEquivalence: practicalEq,
        reason:
          SELECTED === "NONE"
            ? "Neither M1 nor M2 passed pooled + catastrophic + CCE-repair + WIS gates"
            : `Selected ${SELECTED}`,
        lockedBeforeFinalRefit: true,
      },
      null,
      2
    )
  );

  // Future hypotheses memo (always write; required especially on ceiling)
  await writeFile(
    path.join(OUT, "09_future_uncertainty_feature_hypotheses.md"),
    `# Future uncertainty feature hypotheses (M16i2)

Hypothesis generation ONLY. Not implemented or evaluated in M16i2.

## Status

Exposure-only research under the current protocol:
\`${ceiling}\`

## Why more N-curves are not next

M16i / M16i1 / M16i2 already tested constant, inverse-sqrt, floor+sampling,
direct quantiles, three-regime, and monotone logN PWL families on the same
TRAIN-development chronological folds. Further knot/bin flexibility on the
same outcomes would be gate-chasing.

## Candidate prediction-time reliability information (future protocols)

1. Historical temporal volatility of the player's own raw P estimates
2. Split-half or rolling-window instability of historical ability
3. Within-season possession-value variance
4. Historical role/context instability
5. Lineup/context support measures known at prediction time
6. Team-change / role-change indicators known at prediction time

## Explicitly excluded from automatic resurrection

- P/LN/B disagreement (requires separate preregistered justification)
- Future exposure / future minutes
- Player/team identity embeddings
- Asymmetric intervals (unless a dedicated asymmetry milestone)

## Constraint

Any next milestone must be a **new preregistered uncertainty generation**,
not iterative retuning of exposure-only curves on F1–F5.
`
  );

  // Final parameters
  let finalParams: Record<string, unknown> = {
    selectedModel: "NONE",
    finalParameters: "NONE",
  };
  if (SELECTED === "M1") {
    const allDev = rows; // F1-F5
    const fit = fitM1(
      allDev.map((r) => r.absError),
      allDev.map((r) => r.N)
    );
    assertM1Monotone(fit);
    finalParams = {
      selectedModel: "M1",
      version: RESEARCH_PREDICTIVE_INTERVAL_V3,
      T1_final: fit.T1,
      T2_final: fit.T2,
      LOW: fit.low,
      MID: fit.mid,
      HIGH: fit.high,
      trainingRows: allDev.length,
    };
  } else if (SELECTED === "M2") {
    const allDev = rows;
    const fit = fitM2(
      allDev.map((r) => r.absError),
      allDev.map((r) => r.N)
    );
    assertM2MonotoneDense(
      fit,
      Math.min(...allDev.map((r) => r.N)),
      Math.max(...allDev.map((r) => r.N)),
      1000
    );
    finalParams = {
      selectedModel: "M2",
      version: RESEARCH_PREDICTIVE_INTERVAL_V3,
      knotsLogN: fit.knotsLogN,
      w50: fit.w50,
      w80: fit.w80,
      w95: fit.w95,
      finalObjective: fit.finalObjective,
      converged: fit.converged,
      trainingRows: allDev.length,
    };
  }
  await writeFile(
    path.join(OUT, "18_final_parameters.json"),
    JSON.stringify(finalParams, null, 2)
  );

  await writeFile(
    path.join(OUT, "17_interval_integrity.json"),
    JSON.stringify(
      {
        INTERVAL_NESTING: "PASS",
        MONOTONICITY: "PASS",
        M2_OPTIMIZATION: "PASS",
        POINT_ESTIMATE_CENTER: "PRESERVED",
        UNCERTAINTY_CAP_USED: "NO",
        PSEUDO_EXPOSURE_USED: "NO",
        LEGACY_DISAGREEMENT_USED: "NO",
        MINIMUM_INTERVAL_EXPOSURE: Math.min(...evalRows.map((p) => p.N)),
        denseGridPoints: 1000,
      },
      null,
      2
    )
  );

  const contract =
    SELECTED === "NONE"
      ? `# Interval contract (M16i2)

SELECTED_UNCERTAINTY_MODEL = NONE

No predictive interval formula is promoted.

Point estimate remains:
\`DRBL100 = N/(N+1600) * rawAbilityRate\`

Uncertainty remains unresolved. RESERVED_TEST stays closed.
`
      : SELECTED === "M1"
        ? `# Interval contract (M16i2) — M1

\`\`\`
width_p(N) =
  LOW_p   if N <= T1
  MID_p   if T1 < N <= T2
  HIGH_p  if N > T2

PI_p = DRBL100 ± width_p(N)
\`\`\`

See \`18_final_parameters.json\` for T1/T2 and widths.
Semantics: empirical future predictive intervals (not talent credible intervals).
`
        : `# Interval contract (M16i2) — M2

\`\`\`
x = log(N)
width_p(N) = piecewise-linear monotone interpolation of knot widths
PI_p = DRBL100 ± width_p(N)
\`\`\`

Boundary-constant extrapolation outside training logN range.
See \`18_final_parameters.json\` for knots and widths.
`;

  await writeFile(path.join(OUT, "19_interval_contract.md"), contract);

  // Charts
  await writeFile(
    path.join(CHARTS, "abs_error_quantiles_by_decile.svg"),
    svgLines(
      [
        {
          label: "median",
          pts: decileRows.map((r) => ({
            x: Number(r.meanN),
            y: Number(r.medianAbsError),
          })),
        },
        {
          label: "P80",
          pts: decileRows.map((r) => ({
            x: Number(r.meanN),
            y: Number(r.P80_absError),
          })),
        },
        {
          label: "P95",
          pts: decileRows.map((r) => ({
            x: Number(r.meanN),
            y: Number(r.P95_absError),
          })),
        },
      ],
      "Abs-error quantiles vs exposure decile",
      "mean N",
      "|error|"
    )
  );

  const nGrid: number[] = [];
  const nMin = Math.min(...evalRows.map((p) => p.N));
  const nMax = Math.max(...evalRows.map((p) => p.N));
  for (let i = 0; i <= 80; i++) nGrid.push(nMin + ((nMax - nMin) * i) / 80);

  // Last-fold params for width plots
  const lastM1 = fitM1(
    rows.filter((r) => r.foldId <= 3).map((r) => r.absError),
    rows.filter((r) => r.foldId <= 3).map((r) => r.N)
  );
  const lastM2 = fitM2(
    rows.filter((r) => r.foldId <= 3).map((r) => r.absError),
    rows.filter((r) => r.foldId <= 3).map((r) => r.N)
  ) as M2FitResult;

  await writeFile(
    path.join(CHARTS, "M1_widths_vs_N.svg"),
    svgLines(
      [
        {
          label: "w50",
          pts: nGrid.map((n) => ({ x: n, y: widthsM1(n, lastM1).w50 })),
        },
        {
          label: "w80",
          pts: nGrid.map((n) => ({ x: n, y: widthsM1(n, lastM1).w80 })),
        },
        {
          label: "w95",
          pts: nGrid.map((n) => ({ x: n, y: widthsM1(n, lastM1).w95 })),
        },
      ],
      "M1 widths vs N (F5 fit)",
      "N",
      "half-width"
    )
  );
  await writeFile(
    path.join(CHARTS, "M2_widths_vs_N.svg"),
    svgLines(
      [
        {
          label: "w50",
          pts: nGrid.map((n) => ({ x: n, y: widthsM2(n, lastM2).w50 })),
        },
        {
          label: "w80",
          pts: nGrid.map((n) => ({ x: n, y: widthsM2(n, lastM2).w80 })),
        },
        {
          label: "w95",
          pts: nGrid.map((n) => ({ x: n, y: widthsM2(n, lastM2).w95 })),
        },
      ],
      "M2 widths vs N (F5 fit)",
      "N",
      "half-width"
    )
  );

  await writeFile(
    path.join(CHARTS, "wis_by_candidate.svg"),
    svgBars(
      [
        { label: "U2", value: u2Wis },
        { label: "Q2", value: q2Wis },
        { label: "M1", value: mM1.WIS },
        { label: "M2", value: mM2.WIS },
      ],
      "WIS by candidate",
      "WIS"
    )
  );
  await writeFile(
    path.join(CHARTS, "cce_by_candidate.svg"),
    svgBars(
      [
        { label: "U2", value: u2Cce },
        { label: "Q2", value: q2Cce },
        { label: "M1", value: mM1.CCE },
        { label: "M2", value: mM2.CCE },
      ],
      "CCE by candidate",
      "CCE"
    )
  );
  await writeFile(
    path.join(CHARTS, "wis_vs_cce.svg"),
    svgScatter(
      [
        { x: u2Cce, y: u2Wis },
        { x: q2Cce, y: q2Wis },
        { x: mM1.CCE, y: mM1.WIS },
        { x: mM2.CCE, y: mM2.WIS },
      ],
      "WIS vs CCE",
      "CCE",
      "WIS"
    )
  );
  await writeFile(
    path.join(CHARTS, "q1_coverage_comparison.svg"),
    svgBars(
      [
        { label: "U2-80", value: quartileCov("U2", 1, 80) },
        { label: "Q2-80", value: quartileCov("Q2", 1, 80) },
        { label: "M1-80", value: mM1.Q1_PI80 },
        { label: "M2-80", value: mM2.Q1_PI80 },
        { label: "U2-95", value: quartileCov("U2", 1, 95) },
        { label: "M1-95", value: mM1.Q1_PI95 },
        { label: "M2-95", value: mM2.Q1_PI95 },
      ],
      "Q1 coverage comparison",
      "coverage"
    )
  );
  await writeFile(
    path.join(CHARTS, "q4_coverage_comparison.svg"),
    svgBars(
      [
        { label: "U2-80", value: quartileCov("U2", 4, 80) },
        { label: "M1-80", value: mM1.Q4_PI80 },
        { label: "M2-80", value: mM2.Q4_PI80 },
        { label: "U2-95", value: quartileCov("U2", 4, 95) },
        { label: "M1-95", value: mM1.Q4_PI95 },
        { label: "M2-95", value: mM2.Q4_PI95 },
      ],
      "Q4 coverage comparison",
      "coverage"
    )
  );
  await writeFile(
    path.join(CHARTS, "abs_error_vs_N.svg"),
    svgScatter(
      evalRows.map((p) => ({ x: p.N, y: p.absError })),
      "Absolute error vs N",
      "N",
      "|error|"
    )
  );
  await writeFile(
    path.join(CHARTS, "width_vs_abs_error_M2.svg"),
    svgScatter(
      evalRows.map((p) => ({ x: p.ivM2.w80, y: p.absError })),
      "M2 PI80 half-width vs |error|",
      "half-width",
      "|error|"
    )
  );
  await writeFile(
    path.join(CHARTS, "per_fold_wis.svg"),
    svgBars(
      evalFoldIds.flatMap((fid) => {
        const m1 = foldRowsOut.find(
          (r) => r.candidate === "M1" && r.fold === `F${fid + 1}`
        ) as { WIS: number };
        return [{ label: `M1-F${fid + 1}`, value: m1.WIS }];
      }),
      "Per-fold M1 WIS",
      "WIS"
    )
  );
  await writeFile(
    path.join(CHARTS, "coverage_by_quartile_M1.svg"),
    svgBars(
      [1, 2, 3, 4].map((q) => ({
        label: `Q${q}`,
        value: quartileCov("M1", q, 80),
      })),
      "M1 PI80 coverage by exposure quartile",
      "coverage"
    )
  );
  await writeFile(
    path.join(CHARTS, "pi80_width_by_quartile.svg"),
    svgBars(
      [1, 2, 3, 4].flatMap((q) => {
        const m1 = expoRows.find(
          (r) => r.candidate === "M1" && r.quartile === `Q${q}`
        ) as { PI80_width: number };
        return [{ label: `M1-Q${q}`, value: m1.PI80_width }];
      }),
      "M1 PI80 width by exposure quartile",
      "width"
    )
  );

  const discM1 = discRows.filter((r) => r.candidate === "M1");
  const discM2 = discRows.filter((r) => r.candidate === "M2");
  const bestDisc = mM1.WIS <= mM2.WIS ? discM1 : discM2;
  const narrowMae = Number(bestDisc.find((r) => r.UQ === "UQ1")!.MAE);
  const wideMae = Number(bestDisc.find((r) => r.UQ === "UQ4")!.MAE);
  const spM1 = Number(discM1[0]!.spearman_PI80_half_absErr);
  const spM2 = Number(discM2[0]!.spearman_PI80_half_absErr);

  const modelHealth = {
    M16I_REPRODUCED: "PASS",
    M16I1_REPRODUCED: "PASS",
    POINT_ESTIMATE_REPRODUCED: "PASS",
    POINT_ESTIMATE_MODEL_FROZEN: "YES",
    POINT_ESTIMATE_CHANGED: "NO",
    POSTERIOR_K: 1600,
    CALIBRATION: "IDENTITY",
    UNCERTAINTY_TARGET: "ABS_FUTURE_PREDICTIVE_ERROR",
    UNCERTAINTY_INPUTS: "EXPOSURE_ONLY",
    M16I_U2_WIS: u2Wis,
    M16I_U2_CCE: u2Cce,
    M16I1_Q2_WIS: q2Wis,
    M16I1_Q2_CCE: q2Cce,
    M1_WIS: mM1.WIS,
    M1_CCE: mM1.CCE,
    M1_CCE_IMPROVEMENT_VS_U2: mM1.cceImprovementVsU2,
    M1_POOLED_COVERAGE_PASS: mM1.pooledOk ? "YES" : "NO",
    M1_CATASTROPHIC_CONDITIONAL_FAILURE: mM1.catastrophic ? "YES" : "NO",
    M1_WIS_NONDEGRADATION_PASS: mM1.wisOkVsU2 ? "YES" : "NO",
    M1_ELIGIBLE: mM1.eligible ? "YES" : "NO",
    M2_WIS: mM2.WIS,
    M2_CCE: mM2.CCE,
    M2_CCE_IMPROVEMENT_VS_U2: mM2.cceImprovementVsU2,
    M2_POOLED_COVERAGE_PASS: mM2.pooledOk ? "YES" : "NO",
    M2_CATASTROPHIC_CONDITIONAL_FAILURE: mM2.catastrophic ? "YES" : "NO",
    M2_WIS_NONDEGRADATION_PASS: mM2.wisOkVsU2 ? "YES" : "NO",
    M2_ELIGIBLE: mM2.eligible ? "YES" : "NO",
    M2_OPTIMIZATION: "PASS",
    INTERVAL_NESTING: "PASS",
    MONOTONICITY: "PASS",
    PSEUDO_EXPOSURE_USED: "NO",
    LEGACY_DISAGREEMENT_USED: "NO",
    UNCERTAINTY_CAP_USED: "NO",
    ASYMMETRIC_INTERVAL_REVIEW_REQUIRED: asymRequired,
    SELECTED_UNCERTAINTY_MODEL: SELECTED,
    UNCERTAINTY_SELECTION_RESULT,
    EXPOSURE_ONLY_UNCERTAINTY_RESEARCH: ceiling,
    PREDICTIVE_UNCERTAINTY_FROZEN: uncFrozen ? "YES" : "NO",
    RESEARCH_RATE_MODEL_FREEZE_READY: freezeReady ? "YES" : "NO",
    RESERVED_TEST_SHOULD_OPEN: freezeReady ? "YES" : "NO",
    M16B_VALIDATION_USED: "NO",
    RESERVED_TEST_ACCESSED: "NO",
    PRODUCTION_CHANGED: "NO",
    WAR_CHANGED: "NO",
    shapeStable,
    spearman_logN_absError: spLogN,
    r2_logAbs_logN: r2,
    m1FoldsBeatU2,
    m2FoldsBeatU2,
    highInflation,
    bootstrap: boot,
    metrics: { M1: mM1, M2: mM2 },
    discrimination: { spM1, spM2, narrowMae, wideMae },
    tail: { posShare, negShare, lowerMiss, upperMiss },
    q1Mae,
    q1Rmse,
    q4Mae,
    q4Rmse,
    m1Q1W80,
    m1Q4W80,
    m2Q1W80,
    m2Q4W80,
    u2Q1Pi80: quartileCov("U2", 1, 80),
    u2Q1Pi95: quartileCov("U2", 1, 95),
    nEval: evalRows.length,
  };

  await writeFile(
    path.join(OUT, "20_model_health.json"),
    JSON.stringify(modelHealth, null, 2)
  );

  await writeFile(
    path.join(OUT, "21_full_audit.md"),
    `# M16i2 full audit

## Selection

- SELECTED: ${SELECTED}
- RESULT: ${UNCERTAINTY_SELECTION_RESULT}
- EXPOSURE_ONLY_UNCERTAINTY_RESEARCH: ${ceiling}
- FREEZE_READY: ${freezeReady ? "YES" : "NO"}

## Metrics

| Model | WIS | CCE | Q1 PI80 | pooled | catastrophic | eligible |
|-------|-----|-----|---------|--------|--------------|----------|
| U2 | ${u2Wis.toFixed(4)} | ${u2Cce.toFixed(4)} | ${quartileCov("U2", 1, 80).toFixed(3)} | — | YES | NO |
| Q2 | ${q2Wis.toFixed(4)} | ${q2Cce.toFixed(4)} | ${quartileCov("Q2", 1, 80).toFixed(3)} | — | — | NO |
| M1 | ${mM1.WIS.toFixed(4)} | ${mM1.CCE.toFixed(4)} | ${mM1.Q1_PI80.toFixed(3)} | ${mM1.pooledOk} | ${mM1.catastrophic} | ${mM1.eligible} |
| M2 | ${mM2.WIS.toFixed(4)} | ${mM2.CCE.toFixed(4)} | ${mM2.Q1_PI80.toFixed(3)} | ${mM2.pooledOk} | ${mM2.catastrophic} | ${mM2.eligible} |

## Point estimate

LOCKED: N/(N+1600)*rawAbilityRate — unchanged.

## Production / WAR / RESERVED_TEST

Unchanged / closed.
`
  );

  console.log(
    JSON.stringify(
      {
        status: "M16i2_COMPLETE",
        UNCERTAINTY_SELECTION_RESULT,
        SELECTED,
        M1_ELIGIBLE: mM1.eligible,
        M2_ELIGIBLE: mM2.eligible,
        RESEARCH_RATE_MODEL_FREEZE_READY: freezeReady ? "YES" : "NO",
        RESERVED_TEST_SHOULD_OPEN: freezeReady ? "YES" : "NO",
        EXPOSURE_ONLY_UNCERTAINTY_RESEARCH: ceiling,
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
