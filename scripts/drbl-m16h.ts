/**
 * M16h - post-posterior calibration selection.
 *   npm run drbl:m16h
 *
 * Candidates: identity | zero-preserving linear | affine diagnostic.
 * TRAIN chronological OOS only. No M16b VALIDATION selection. No RESERVED_TEST.
 * Production / WAR / uncertainty / O/D unchanged.
 */
import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";

import { EVALUATION_PROTOCOL_VERSION, METRIC_CONTRACT } from "../drbl/evaluation/protocol";
import { verifyFrozenSplitHashes } from "../drbl/evaluation/m16c-dataset";
import { hashGames, type SplitGame } from "../drbl/evaluation/splits";
import {
  mae,
  pearson,
  r2,
  rmse,
  spearman,
  pairedBlockBootstrapRmseDiff,
} from "../drbl/evaluation/metrics";
import { SEQUENTIAL_ATTRIBUTION_VERSION } from "../drbl/models/sequential-attribution";
import { ABILITY_LINEAGE_VERSION } from "../drbl/models/ability-lineage";
import {
  WAR_EXPOSURE_UNIT,
  WAR_FORMULA_VERSION,
} from "../drbl/models/pipeline-value";
import {
  RESEARCH_ABILITY_VERSION,
  RESEARCH_K,
  RESEARCH_POSTERIOR_LAYER_COUNT,
  RESEARCH_POSTERIOR_VERSION,
  RESEARCH_PRIOR_MEAN,
  computeResearchAbilityV1,
} from "../drbl/models/research-ability-v1";
import {
  CALIBRATION_IDENTITY_VERSION,
  CALIBRATION_ZERO_LINEAR_VERSION,
  RESEARCH_RATE_VERSION,
  computeResearchRateV1,
  fitAffineOLS,
  fitZeroLinearSlope,
} from "../drbl/models/research-rate-v1";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m16h");
const CHARTS = path.join(OUT, "charts");
const M16G = path.join(ROOT, "reports", "m16g");
const M16G1 = path.join(ROOT, "reports", "m16g1");

const EXPECTED_TRAIN =
  "7bec77be45295ee858d90896d9383e4da951e98e81ad1ef31b5285fb055d1550";
const EXPECTED_VAL =
  "4fd339a445f269162c2d76e9102ea5bb965a5d0fc05e0fcd2f60593117c5faf0";
const EXPECTED_RES =
  "e542aa54602390ed65792f37e10207814e10b62bfdf552ddf4da69825076c1ce";

const EXPECTED_K1600_RMSE = 2.6960956582451727;
const EXPECTED_REL_MED = 0.4557823129251701;
const EXPECTED_REL_Q1 = 0.15833771699105734;
const EXPECTED_REL_Q4 = 0.690761499806726;

const PRACTICAL_IMPROVEMENT = 0.005; // 0.5%
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
function calibSlopeIntercept(y: number[], yhat: number[]): { a: number; b: number } {
  return fitAffineOLS(yhat, y);
}

type FoldRow = {
  foldId: number;
  playerId: string;
  rawPB: number;
  publishedDrblP: number;
  N: number;
  target: number;
  asOfDate?: string;
};

function parseFoldRows(csv: string): FoldRow[] {
  const lines = csv.trim().split(/\r?\n/);
  const header = lines[0]!.split(",");
  const idx = (name: string) => header.indexOf(name);
  const iFold = idx("foldId");
  const iPid = idx("playerId");
  const iRaw = idx("rawPB");
  const iDrblP = idx("publishedDrblP");
  const iN = idx("N");
  const iT = idx("target");
  const iAsOf = idx("asOfDate");
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    return {
      foldId: Number(cols[iFold]),
      playerId: cols[iPid]!,
      rawPB: Number(cols[iRaw]),
      publishedDrblP: Number(cols[iDrblP]),
      N: Number(cols[iN]),
      target: Number(cols[iT]),
      asOfDate: iAsOf >= 0 ? cols[iAsOf] : undefined,
    };
  });
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

function metricBundle(y: number[], yhat: number[]) {
  const c = calibSlopeIntercept(y, yhat);
  return {
    n: Math.min(y.length, yhat.length),
    RMSE: rmse(y, yhat),
    MAE: mae(y, yhat),
    R2: r2(y, yhat),
    bias: mean(yhat.map((p, i) => p - y[i]!)),
    Pearson: pearson(y, yhat),
    Spearman: spearman(y, yhat),
    calibrationIntercept: c.a,
    calibrationSlope: c.b,
    predMean: mean(yhat),
    predSD: sd(yhat),
    targetMean: mean(y),
    targetSD: sd(y),
  };
}

function svgScatter(
  pts: Array<{ x: number; y: number }>,
  title: string,
  xlab: string,
  ylab: string,
  diagonal = false
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
    .slice(0, 2500)
    .map(
      (p) =>
        `<circle cx="${mapX(p.x).toFixed(1)}" cy="${mapY(p.y).toFixed(1)}" r="2" fill="#1f4e79" fill-opacity="0.4"/>`
    )
    .join("");
  let diag = "";
  if (diagonal) {
    const lo = Math.max(xmin, ymin);
    const hi = Math.min(xmax, ymax);
    diag = `<line x1="${mapX(lo)}" y1="${mapY(lo)}" x2="${mapX(hi)}" y2="${mapY(hi)}" stroke="#c0392b" stroke-dasharray="4 3"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="100%" height="100%" fill="#fafafa"/>
  <text x="${w / 2}" y="24" text-anchor="middle" font-size="13">${title}</text>
  <text x="${w / 2}" y="${h - 12}" text-anchor="middle" font-size="11">${xlab}</text>
  <text x="14" y="${h / 2}" text-anchor="middle" font-size="11" transform="rotate(-90 14 ${h / 2})">${ylab}</text>
  ${diag}${dots}
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
  const vmax = Math.max(0, ...vals);
  const dy = vmax - vmin || 1;
  const barW = (w - 2 * pad) / Math.max(1, items.length);
  const zeroY = h - pad - ((0 - vmin) / dy) * (h - 2 * pad);
  const bars = items
    .map((it, i) => {
      const y = h - pad - ((it.value - vmin) / dy) * (h - 2 * pad);
      const top = Math.min(y, zeroY);
      const bh = Math.abs(y - zeroY);
      return `<rect x="${(pad + i * barW + 4).toFixed(1)}" y="${top.toFixed(1)}" width="${(barW - 8).toFixed(1)}" height="${bh.toFixed(1)}" fill="#1f4e79"/><text x="${(pad + i * barW + barW / 2).toFixed(1)}" y="${h - 18}" text-anchor="middle" font-size="10">${it.label}</text>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="100%" height="100%" fill="#fafafa"/>
  <text x="${w / 2}" y="24" text-anchor="middle" font-size="13">${title}</text>
  <text x="14" y="${h / 2}" text-anchor="middle" font-size="11" transform="rotate(-90 14 ${h / 2})">${ylab}</text>
  <line x1="${pad}" y1="${zeroY}" x2="${w - pad}" y2="${zeroY}" stroke="#999"/>
  ${bars}
</svg>`;
}

function svgHist(values: number[], title: string, xlab: string, bins = 30): string {
  const w = 560,
    h = 340,
    pad = 52;
  const finite = values.filter(Number.isFinite);
  if (!finite.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="20" y="40">${title}</text></svg>`;
  }
  const xmin = Math.min(...finite);
  const xmax = Math.max(...finite);
  const dx = (xmax - xmin) / bins || 1;
  const counts = new Array(bins).fill(0) as number[];
  for (const v of finite) {
    const i = Math.min(bins - 1, Math.floor((v - xmin) / dx));
    counts[i]!++;
  }
  const ymax = Math.max(...counts) || 1;
  const barW = (w - 2 * pad) / bins;
  const bars = counts
    .map((c, i) => {
      const bh = (c / ymax) * (h - 2 * pad);
      const x = pad + i * barW;
      const y = h - pad - bh;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(barW - 1).toFixed(1)}" height="${bh.toFixed(1)}" fill="#1f4e79" fill-opacity="0.75"/>`;
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
    await writeFile(
      path.join(OUT, "00_freeze.json"),
      JSON.stringify({ status: "EVALUATION_PROTOCOL_DRIFT", hashCheck }, null, 2)
    );
    throw new Error("STOP EVALUATION_PROTOCOL_DRIFT");
  }

  const expectedFoldHashes = JSON.parse(
    await readFile(path.join(M16G1, "00_freeze.json"), "utf8")
  ) as {
    m16gFoldHashes: Array<{
      foldId: number;
      historyHash: string;
      futureHash: string;
      nRows: number;
    }>;
  };
  const foldHashOk = expectedFoldHashes.m16gFoldHashes.every((ef) => {
    const f = m16gFolds.folds.find((x) => x.foldId === ef.foldId);
    return (
      f &&
      f.historyHash === ef.historyHash &&
      f.futureHash === ef.futureHash &&
      f.nRows === ef.nRows
    );
  });
  if (!foldHashOk) {
    throw new Error("STOP EVALUATION_PROTOCOL_DRIFT (M16g fold hashes)");
  }

  const freeze = {
    milestone: "M16h",
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
    approachBVersion: SEQUENTIAL_ATTRIBUTION_VERSION,
    researchAbilityVersion: RESEARCH_ABILITY_VERSION,
    researchPosteriorVersion: RESEARCH_POSTERIOR_VERSION,
    k: RESEARCH_K,
    priorMean: RESEARCH_PRIOR_MEAN,
    exposureDefinition: "actual_combined_possession_appearances",
    abilityLineageVersion: ABILITY_LINEAGE_VERSION,
    currentProductionCalibration: "legacy fused EB200 path (unchanged)",
    WAR_versions: {
      "2024-25": WAR_FORMULA_VERSION,
      "2025-26": "provisional (unchanged)",
    },
    WAR_exposureUnit: WAR_EXPOSURE_UNIT,
    M16B_VALIDATION_USED_FOR_SELECTION: false,
    RESERVED_TEST_ACCESSED: false,
    practicalImprovementThreshold: PRACTICAL_IMPROVEMENT,
  };
  await writeFile(path.join(OUT, "00_freeze.json"), JSON.stringify(freeze, null, 2));

  // --- Phase 1: reproduce posterior ---
  const foldCsv = await readFile(path.join(M16G, "04_fold_rows.csv"), "utf8");
  const allRows = parseFoldRows(foldCsv);
  const posts = allRows.map((r) =>
    computeResearchAbilityV1({
      rawAbilityRate: r.rawPB,
      actualCombinedPossessionAppearances: r.N,
    })
  );
  const yAll = allRows.map((r) => r.target);
  const yhat1600 = posts.map((p) => p.researchPosteriorP100);
  const yhat0 = allRows.map((r) => r.rawPB);
  const k1600Rmse = rmse(yAll, yhat1600);
  const k0Rmse = rmse(yAll, yhat0);
  let foldWinsVsK0 = 0;
  for (let f = 0; f < 5; f++) {
    const idxs = allRows
      .map((r, i) => ({ r, i }))
      .filter((x) => x.r.foldId === f)
      .map((x) => x.i);
    const yy = idxs.map((i) => yAll[i]!);
    if (
      rmse(
        yy,
        idxs.map((i) => yhat1600[i]!)
      ) <
      rmse(
        yy,
        idxs.map((i) => yhat0[i]!)
      )
    )
      foldWinsVsK0 += 1;
  }
  const rels = posts.map((p) => p.researchReliability);
  const nSorted = [...allRows.map((r) => r.N)].sort((a, b) => a - b);
  const qCuts = [25, 50, 75].map((p) => percentile(nSorted, p));
  function expoQ(n: number): number {
    if (n <= qCuts[0]!) return 1;
    if (n <= qCuts[1]!) return 2;
    if (n <= qCuts[2]!) return 3;
    return 4;
  }
  const relSorted = [...rels].sort((a, b) => a - b);
  const relQ1 = posts
    .filter((_, i) => expoQ(allRows[i]!.N) === 1)
    .map((p) => p.researchReliability)
    .sort((a, b) => a - b);
  const relQ4 = posts
    .filter((_, i) => expoQ(allRows[i]!.N) === 4)
    .map((p) => p.researchReliability)
    .sort((a, b) => a - b);
  const layerOk = posts.every((p) => p.posteriorOperationsApplied === 1);
  const fusionInfluence = 0; // API cannot accept fusion
  const eb200Influence = 0;

  const reproOk =
    Math.abs(k1600Rmse - EXPECTED_K1600_RMSE) < 1e-9 &&
    foldWinsVsK0 === 5 &&
    Math.abs(percentile(relSorted, 50) - EXPECTED_REL_MED) < 1e-9 &&
    Math.abs(percentile(relQ1, 50) - EXPECTED_REL_Q1) < 1e-9 &&
    Math.abs(percentile(relQ4, 50) - EXPECTED_REL_Q4) < 1e-9 &&
    layerOk;

  const repro = {
    reproduced: reproOk ? "PASS" : "FAIL",
    k1600RMSE: k1600Rmse,
    expectedK1600RMSE: EXPECTED_K1600_RMSE,
    k0RMSE: k0Rmse,
    foldWinsVsK0: `${foldWinsVsK0}/5`,
    medianReliability: percentile(relSorted, 50),
    Q1_medianReliability: percentile(relQ1, 50),
    Q4_medianReliability: percentile(relQ4, 50),
    expected: {
      median: EXPECTED_REL_MED,
      Q1: EXPECTED_REL_Q1,
      Q4: EXPECTED_REL_Q4,
    },
    posteriorLayerCount: RESEARCH_POSTERIOR_LAYER_COUNT,
    legacyFusionInfluence: fusionInfluence,
    legacyEB200Influence: eb200Influence,
    nRows: allRows.length,
  };
  await writeFile(
    path.join(OUT, "01_posterior_reproduction.json"),
    JSON.stringify(repro, null, 2)
  );
  if (!reproOk) {
    throw new Error("STOP M16G2_RESEARCH_POSTERIOR_REPRODUCTION_FAILURE");
  }

  // --- Phase 2: target zero semantics ---
  await writeFile(
    path.join(OUT, "02_target_zero_semantics.md"),
    `# Target zero semantics (M16h)

## Future target
\`future_block_residual_per_100\` as constructed in M16g fold rows:

\`\`\`text
futureTarget = 100 * late.totalValue / late.possessions
\`\`\`

where \`totalValue\` is accumulated by \`attributeGamePlayerValue\` against an
**R1 replacement pool** built from history (same fold's past games).

## What does future_block_residual_per_100 = 0 mean?

\`\`\`text
TARGET_ZERO_SEMANTICS = R1_REPLACEMENT_BASELINE
\`\`\`

Zero means the player's future-block Approach-B residual rate equals the
role-matched R1 replacement expectation (no above/below-replacement residual).

Not league average. Not an arbitrary centering after the fact.

## Construction trace
- target construction: future-block player residual rate from seq-attr vs R1
- replacement subtraction: inside attribution via R1 replacement EP
- residual definition: value relative to replacement context EP
- centering: none beyond R1 residual construction
- rate denominator: future combined possession appearances

## P_B_POSTERIOR zero
\`\`\`text
P_B_POSTERIOR = 0  ⇒  R1 replacement baseline
\`\`\`
(priorMean=0 on the same R1-centered rawAbilityRate scale)

## Alignment
\`\`\`text
TARGET_ZERO_ALIGNED_WITH_P = YES
\`\`\`

Both predictor and target are R1-centered Approach-B residual rates
(history estimate vs future realized residual).
`
  );

  // Enrich rows with posterior
  type CalRow = FoldRow & {
    P_post: number;
    reliability: number;
    foldLabel: string;
    historyDateMax: string;
    futureDateMin: string;
    futureDateMax: string;
  };
  const calRows: CalRow[] = allRows.map((r, i) => {
    const f = m16gFolds.folds.find((x) => x.foldId === r.foldId)!;
    return {
      ...r,
      P_post: posts[i]!.researchPosteriorP100,
      reliability: posts[i]!.researchReliability,
      foldLabel: `F${r.foldId + 1}`,
      historyDateMax: f.historyDateMax,
      futureDateMin: f.futureDateMin,
      futureDateMax: f.futureDateMax,
    };
  });

  // --- Phase 4 protocol ---
  // F1=foldId0 warm-up; CAL_EVAL_k uses train folds 0..k-2, eval fold k-1
  const evalFoldIds = [1, 2, 3, 4]; // F2..F5
  const protocolFolds = evalFoldIds.map((evalId) => {
    const trainIds = Array.from({ length: evalId }, (_, i) => i); // 0..evalId-1
    const trainMax = Math.max(
      ...trainIds.map(
        (id) =>
          m16gFolds.folds.find((f) => f.foldId === id)!.historyDateMax
      )
    );
    // Use futureDateMin of eval fold vs max history of train folds' asOf / historyDateMax
    // Chronology: max(train future? No - max calibration training *date* should be
    // the max asOf / history end of train folds, which is historyDateMax of last train fold.
    const lastTrain = m16gFolds.folds.find((f) => f.foldId === evalId - 1)!;
    const evalFold = m16gFolds.folds.find((f) => f.foldId === evalId)!;
    const chronoOk = lastTrain.historyDateMax < evalFold.futureDateMin;
    // Stronger: last train fold's futureDateMax < eval futureDateMin? Training uses
    // historical P and future targets from train folds - those future blocks end
    // before next fold's future starts by construction.
    const trainFutureMax = lastTrain.futureDateMax;
    const strictOk = trainFutureMax < evalFold.futureDateMin;
    return {
      name: `CAL_EVAL_${evalId + 1}`,
      evalFoldId: evalId,
      trainFoldIds: trainIds,
      trainHistoryDateMax: lastTrain.historyDateMax,
      trainFutureDateMax: trainFutureMax,
      evalFutureDateMin: evalFold.futureDateMin,
      chronological: chronoOk && strictOk,
    };
  });
  if (protocolFolds.some((p) => !p.chronological)) {
    throw new Error("STOP calibration chronology failure");
  }

  await writeFile(
    path.join(OUT, "03_calibration_protocol.json"),
    JSON.stringify(
      {
        design: "expanding_past_folds_fit_next_fold_eval",
        warmUpFold: "F1 (foldId=0)",
        evaluationFolds: ["F2", "F3", "F4", "F5"],
        weightConvention: "w=1 (unweighted; matches M16g)",
        candidates: ["CAL_IDENTITY", "CAL_ZERO_LINEAR", "CAL_AFFINE_DIAGNOSTIC"],
        folds: protocolFolds,
        CALIBRATION_TRAIN_EVAL_OVERLAP: 0,
        M16B_VALIDATION_USED_FOR_SELECTION: false,
        RESERVED_TEST_ACCESSED: false,
      },
      null,
      2
    )
  );

  // Rolling fits
  type EvalPack = {
    evalFoldId: number;
    trainFoldIds: number[];
    bZero: number;
    aAff: number;
    bAff: number;
    trainN: number;
    evalIdxs: number[];
    trainIdxs: number[];
    directionOk: boolean;
  };
  const packs: EvalPack[] = [];
  for (const pf of protocolFolds) {
    const trainIdxs = calRows
      .map((r, i) => ({ r, i }))
      .filter((x) => pf.trainFoldIds.includes(x.r.foldId))
      .map((x) => x.i);
    const evalIdxs = calRows
      .map((r, i) => ({ r, i }))
      .filter((x) => x.r.foldId === pf.evalFoldId)
      .map((x) => x.i);
    const xTr = trainIdxs.map((i) => calRows[i]!.P_post);
    const yTr = trainIdxs.map((i) => calRows[i]!.target);
    const bZero = fitZeroLinearSlope(xTr, yTr);
    const aff = fitAffineOLS(xTr, yTr);
    const directionOk = bZero > 0;
    if (!directionOk) {
      console.warn("CALIBRATION_DIRECTION_FAILURE", pf.name, bZero);
    }
    packs.push({
      evalFoldId: pf.evalFoldId,
      trainFoldIds: pf.trainFoldIds,
      bZero,
      aAff: aff.a,
      bAff: aff.b,
      trainN: trainIdxs.length,
      evalIdxs,
      trainIdxs,
      directionOk,
    });
  }

  // Build OOS predictions on F2-F5
  const evalUniverseIdxs = packs.flatMap((p) => p.evalIdxs);
  const evalRows = evalUniverseIdxs.map((i) => calRows[i]!);
  const yEval = evalUniverseIdxs.map((i) => calRows[i]!.target);
  const idPred = evalUniverseIdxs.map((i) => calRows[i]!.P_post);
  const zeroPred: number[] = [];
  const affPred: number[] = [];
  const blockIds: string[] = [];
  const rowExport: Record<string, unknown>[] = [];

  for (const pack of packs) {
    for (const i of pack.evalIdxs) {
      const r = calRows[i]!;
      const zp = pack.bZero * r.P_post;
      const ap = pack.aAff + pack.bAff * r.P_post;
      zeroPred.push(zp);
      affPred.push(ap);
      blockIds.push(`fold${r.foldId}`);
      rowExport.push({
        foldId: r.foldId,
        foldLabel: r.foldLabel,
        playerId: r.playerId,
        N: r.N,
        rawAbilityRate: r.rawPB,
        P_post: r.P_post,
        target: r.target,
        yhat_identity: r.P_post,
        yhat_zero_linear: zp,
        yhat_affine: ap,
        b_zero_fit: pack.bZero,
        a_affine_fit: pack.aAff,
        b_affine_fit: pack.bAff,
        historyDateMax: r.historyDateMax,
        futureDateMin: r.futureDateMin,
        futureDateMax: r.futureDateMax,
      });
    }
  }
  await writeFile(path.join(OUT, "04_calibration_rows.csv"), toCsv(rowExport));

  // Rank invariance
  const spearmanIdZero = spearman(idPred, zeroPred);
  if (!(spearmanIdZero > 1 - 1e-12) && packs.every((p) => p.bZero > 0)) {
    // With all positive b, within each fold order preserved; across folds different b
    // can change cross-fold ranking slightly. Spec says Spearman(identity, zero-linear)=1
    // for zero-preserving calibration. Different rolling b per fold CAN change global ranks!
    // 
    // Important: within each evaluation fold, b is constant so ranks within fold unchanged.
    // Globally across folds with different b, ranks CAN change.
    // The requirement: "player ordering unchanged on unrounded values" for b>0 -
    // this applies when a SINGLE b is applied. For rolling evaluation with different b,
    // we must check within-fold rank invariance, and for final rate with single b_final.
  }
  let withinFoldRankChanges = 0;
  for (const pack of packs) {
    if (!(pack.bZero > 0)) continue;
    const idLocal = pack.evalIdxs.map((i) => calRows[i]!.P_post);
    const zLocal = idLocal.map((x) => pack.bZero * x);
    const orderId = idLocal
      .map((v, i) => ({ v, i }))
      .sort((a, b) => b.v - a.v || a.i - b.i)
      .map((x) => x.i);
    const orderZ = zLocal
      .map((v, i) => ({ v, i }))
      .sort((a, b) => b.v - a.v || a.i - b.i)
      .map((x) => x.i);
    for (let k = 0; k < orderId.length; k++) {
      if (orderId[k] !== orderZ[k]) withinFoldRankChanges += 1;
    }
  }
  if (withinFoldRankChanges !== 0) {
    throw new Error("STOP ZERO_LINEAR_RANK_INVARIANCE_FAILURE");
  }

  // Pearson/Spearman identity vs zero should be ~1 within folds; pooled with varying b
  // may be slightly < 1. Spec: "essentially unchanged" for Pearson/Spearman of predictions
  // vs target - for b>0 scalar, corr(y, b*x) = corr(y,x) when b constant.
  // With rolling different b, pooled Pearson vs target can change slightly.
  // Check per-fold Pearson unchanged:
  for (const pack of packs) {
    if (!(pack.bZero > 0)) continue;
    const yy = pack.evalIdxs.map((i) => calRows[i]!.target);
    const xx = pack.evalIdxs.map((i) => calRows[i]!.P_post);
    const zz = xx.map((x) => pack.bZero * x);
    const p1 = pearson(yy, xx);
    const p2 = pearson(yy, zz);
    const s1 = spearman(yy, xx);
    const s2 = spearman(yy, zz);
    if (Math.abs(p1 - p2) > 1e-9 || Math.abs(s1 - s2) > 1e-9) {
      throw new Error("STOP CALIBRATION_IMPLEMENTATION_ERROR");
    }
  }

  // Phase 7 zero-linear fits
  const zeroFitRows = packs.map((p) => {
    const yy = p.evalIdxs.map((i) => calRows[i]!.target);
    const id = p.evalIdxs.map((i) => calRows[i]!.P_post);
    const zl = id.map((x) => p.bZero * x);
    return {
      evaluation_fold: `F${p.evalFoldId + 1}`,
      training_folds: p.trainFoldIds.map((id) => `F${id + 1}`).join("+"),
      b: p.bZero,
      training_N: p.trainN,
      evaluation_N: p.evalIdxs.length,
      identity_RMSE: rmse(yy, id),
      zero_linear_RMSE: rmse(yy, zl),
      delta_RMSE: rmse(yy, zl) - rmse(yy, id),
      direction_ok: p.directionOk,
    };
  });
  await writeFile(path.join(OUT, "05_zero_linear_fits.csv"), toCsv(zeroFitRows));

  const affineRows = packs.map((p) => {
    const yy = p.evalIdxs.map((i) => calRows[i]!.target);
    const id = p.evalIdxs.map((i) => calRows[i]!.P_post);
    const ap = id.map((x) => p.aAff + p.bAff * x);
    return {
      evaluation_fold: `F${p.evalFoldId + 1}`,
      a: p.aAff,
      b: p.bAff,
      training_N: p.trainN,
      evaluation_N: p.evalIdxs.length,
      evaluation_RMSE: rmse(yy, ap),
      evaluation_MAE: mae(yy, ap),
      bias: mean(ap.map((x, j) => x - yy[j]!)),
    };
  });
  await writeFile(path.join(OUT, "06_affine_diagnostic.csv"), toCsv(affineRows));

  const idM = metricBundle(yEval, idPred);
  const zlM = metricBundle(yEval, zeroPred);
  const afM = metricBundle(yEval, affPred);
  const deltaRmse = zlM.RMSE - idM.RMSE;
  const relImp = (idM.RMSE - zlM.RMSE) / idM.RMSE;

  await writeFile(
    path.join(OUT, "07_primary_calibration_metrics.csv"),
    toCsv([
      {
        candidate: "IDENTITY",
        RMSE: idM.RMSE,
        MAE: idM.MAE,
        R2: idM.R2,
        bias: idM.bias,
        Pearson: idM.Pearson,
        Spearman: idM.Spearman,
        calibIntercept: idM.calibrationIntercept,
        calibSlope: idM.calibrationSlope,
      },
      {
        candidate: "ZERO_LINEAR",
        RMSE: zlM.RMSE,
        MAE: zlM.MAE,
        R2: zlM.R2,
        bias: zlM.bias,
        Pearson: zlM.Pearson,
        Spearman: zlM.Spearman,
        calibIntercept: zlM.calibrationIntercept,
        calibSlope: zlM.calibrationSlope,
        deltaRMSE_vs_identity: deltaRmse,
        relativeImprovement: relImp,
      },
      {
        candidate: "AFFINE_DIAGNOSTIC",
        RMSE: afM.RMSE,
        MAE: afM.MAE,
        R2: afM.R2,
        bias: afM.bias,
        Pearson: afM.Pearson,
        Spearman: afM.Spearman,
        calibIntercept: afM.calibrationIntercept,
        calibSlope: afM.calibrationSlope,
      },
    ])
  );

  const bootZL = pairedBlockBootstrapRmseDiff(
    yEval,
    idPred,
    zeroPred,
    blockIds,
    { resamples: BOOTSTRAP_RESAMPLES, seed: BOOTSTRAP_SEED }
  );
  await writeFile(
    path.join(OUT, "08_bootstrap_zero_vs_identity.csv"),
    toCsv([
      {
        comparison: "ZERO_LINEAR_vs_IDENTITY",
        deltaRMSE_mean: bootZL.pointEstimate,
        ciLow: bootZL.ciLow,
        ciHigh: bootZL.ciHigh,
        P_zero_beats_identity: bootZL.probCandidateBeatsBaseline,
        P_identity_beats_zero: 1 - bootZL.probCandidateBeatsBaseline,
        resamples: bootZL.resamples,
        seed: bootZL.seed,
      },
    ])
  );

  // Fold consistency
  const foldCons = zeroFitRows.map((r) => ({
    fold: r.evaluation_fold,
    delta_RMSE: r.delta_RMSE,
    zero_wins: Number(r.delta_RMSE) < 0,
  }));
  const zeroFoldWins = foldCons.filter((f) => f.zero_wins).length;
  const idFoldWins = 4 - zeroFoldWins;
  await writeFile(
    path.join(OUT, "09_fold_consistency.csv"),
    toCsv([
      ...foldCons,
      {
        fold: "summary",
        delta_RMSE: "",
        zero_wins: `${zeroFoldWins}/4`,
        identity_wins: `${idFoldWins}/4`,
      },
    ])
  );

  // Affine vs zero bootstrap
  const bootAF = pairedBlockBootstrapRmseDiff(
    yEval,
    zeroPred,
    affPred,
    blockIds,
    { resamples: BOOTSTRAP_RESAMPLES, seed: BOOTSTRAP_SEED }
  );
  const deltaAffVsZero = afM.RMSE - zlM.RMSE;
  const relAffVsZero = (zlM.RMSE - afM.RMSE) / zlM.RMSE;
  let affFoldWins = 0;
  for (const pack of packs) {
    const yy = pack.evalIdxs.map((i) => calRows[i]!.target);
    const xx = pack.evalIdxs.map((i) => calRows[i]!.P_post);
    const zl = xx.map((x) => pack.bZero * x);
    const af = xx.map((x) => pack.aAff + pack.bAff * x);
    if (rmse(yy, af) < rmse(yy, zl)) affFoldWins += 1;
  }
  await writeFile(
    path.join(OUT, "10_affine_baseline_shift.csv"),
    toCsv([
      {
        RMSE_affine: afM.RMSE,
        RMSE_zero: zlM.RMSE,
        deltaRMSE_affine_vs_zero: deltaAffVsZero,
        relativeImprovement: relAffVsZero,
        bootstrap_delta_mean: bootAF.pointEstimate,
        ciLow: bootAF.ciLow,
        ciHigh: bootAF.ciHigh,
        P_affine_beats_zero: bootAF.probCandidateBeatsBaseline,
        a_F2: packs[0]!.aAff,
        a_F3: packs[1]!.aAff,
        a_F4: packs[2]!.aAff,
        a_F5: packs[3]!.aAff,
        aff_fold_wins: `${affFoldWins}/4`,
      },
    ])
  );

  const BASELINE_SHIFT_SIGNAL =
    relAffVsZero >= PRACTICAL_IMPROVEMENT &&
    bootAF.probCandidateBeatsBaseline >= 0.95 &&
    affFoldWins >= 3
      ? "YES"
      : "NO";

  // Coefficient stability
  const bs = packs.map((p) => p.bZero);
  const bMin = Math.min(...bs);
  const bMax = Math.max(...bs);
  const allPositive = bs.every((b) => b > 0);
  let CALIBRATION_COEFFICIENT_STABILITY: "STABLE" | "MODERATE_VARIATION" | "UNSTABLE";
  if (!allPositive) CALIBRATION_COEFFICIENT_STABILITY = "UNSTABLE";
  else if (bMax / bMin <= 1.25) CALIBRATION_COEFFICIENT_STABILITY = "STABLE";
  else if (bMax / bMin <= 1.5) CALIBRATION_COEFFICIENT_STABILITY = "MODERATE_VARIATION";
  else CALIBRATION_COEFFICIENT_STABILITY = "UNSTABLE";

  const practicalPassed =
    zlM.RMSE < idM.RMSE &&
    relImp >= PRACTICAL_IMPROVEMENT &&
    bootZL.probCandidateBeatsBaseline >= 0.95 &&
    zeroFoldWins >= 3 &&
    allPositive &&
    CALIBRATION_COEFFICIENT_STABILITY !== "UNSTABLE";

  // Secondary contradiction check: if MAE and R2 both worsen materially while RMSE improves - flag
  const secondaryOk =
    !(zlM.MAE > idM.MAE * 1.05 && zlM.R2 < idM.R2 - 0.05);

  let CALIBRATION_SELECTION_RESULT:
    | "IDENTITY_SELECTED"
    | "ZERO_PRESERVING_LINEAR_SELECTED"
    | "BASELINE_SEMANTICS_REVIEW_REQUIRED"
    | "CALIBRATION_BLOCKED";

  if (BASELINE_SHIFT_SIGNAL === "YES") {
    CALIBRATION_SELECTION_RESULT = "BASELINE_SEMANTICS_REVIEW_REQUIRED";
  } else if (practicalPassed && secondaryOk) {
    CALIBRATION_SELECTION_RESULT = "ZERO_PRESERVING_LINEAR_SELECTED";
  } else {
    CALIBRATION_SELECTION_RESULT = "IDENTITY_SELECTED";
  }

  let b_final: number | null = null;
  let calibrationVersion = CALIBRATION_IDENTITY_VERSION;
  if (CALIBRATION_SELECTION_RESULT === "ZERO_PRESERVING_LINEAR_SELECTED") {
    const xAll = calRows.map((r) => r.P_post);
    const yAllT = calRows.map((r) => r.target);
    b_final = fitZeroLinearSlope(xAll, yAllT);
    if (!(b_final > 0)) {
      CALIBRATION_SELECTION_RESULT = "CALIBRATION_BLOCKED";
      b_final = null;
    } else {
      calibrationVersion = CALIBRATION_ZERO_LINEAR_VERSION;
    }
  } else if (CALIBRATION_SELECTION_RESULT === "IDENTITY_SELECTED") {
    b_final = 1;
    calibrationVersion = CALIBRATION_IDENTITY_VERSION;
  }

  // Exposure stratified
  const evalN = evalRows.map((r) => r.N);
  const nSortEval = [...evalN].sort((a, b) => a - b);
  const eq = [25, 50, 75].map((p) => percentile(nSortEval, p));
  function eqQ(n: number) {
    if (n <= eq[0]!) return 1;
    if (n <= eq[1]!) return 2;
    if (n <= eq[2]!) return 3;
    return 4;
  }
  const expoRows = [1, 2, 3, 4].map((q) => {
    const idxs = evalUniverseIdxs
      .map((gi, j) => ({ gi, j }))
      .filter((x) => eqQ(calRows[x.gi]!.N) === q)
      .map((x) => x.j);
    const yy = idxs.map((j) => yEval[j]!);
    const id = idxs.map((j) => idPred[j]!);
    const zl = idxs.map((j) => zeroPred[j]!);
    return {
      quartile: `Q${q}`,
      n: idxs.length,
      identity_RMSE: rmse(yy, id),
      zero_linear_RMSE: rmse(yy, zl),
      delta_RMSE: rmse(yy, zl) - rmse(yy, id),
      identity_bias: mean(id.map((p, k) => p - yy[k]!)),
      zero_linear_bias: mean(zl.map((p, k) => p - yy[k]!)),
    };
  });
  await writeFile(path.join(OUT, "11_exposure_calibration.csv"), toCsv(expoRows));

  // Sign range
  const pSorted = [...idPred].sort((a, b) => a - b);
  const cuts = [20, 40, 60, 80].map((p) => percentile(pSorted, p));
  function signBin(p: number): string {
    if (p <= cuts[0]!) return "strong_negative";
    if (p <= cuts[1]!) return "moderate_negative";
    if (p <= cuts[2]!) return "near_zero";
    if (p <= cuts[3]!) return "moderate_positive";
    return "strong_positive";
  }
  const signRows = [
    "strong_negative",
    "moderate_negative",
    "near_zero",
    "moderate_positive",
    "strong_positive",
  ].map((bin) => {
    const idxs = idPred
      .map((p, j) => ({ p, j }))
      .filter((x) => signBin(x.p) === bin)
      .map((x) => x.j);
    const yy = idxs.map((j) => yEval[j]!);
    const id = idxs.map((j) => idPred[j]!);
    const zl = idxs.map((j) => zeroPred[j]!);
    return {
      bin,
      n: idxs.length,
      mean_posterior_P: mean(id),
      mean_calibrated_P: mean(zl),
      mean_future_target: mean(yy),
      identity_bias: mean(id.map((p, k) => p - yy[k]!)),
      zero_linear_bias: mean(zl.map((p, k) => p - yy[k]!)),
    };
  });
  await writeFile(path.join(OUT, "12_sign_range_diagnostic.csv"), toCsv(signRows));

  // Extreme deciles
  const orderByP = idPred
    .map((p, j) => ({ p, j }))
    .sort((a, b) => a.p - b.p);
  const dN = Math.max(1, Math.floor(orderByP.length / 10));
  const bottom = orderByP.slice(0, dN);
  const top = orderByP.slice(-dN);
  function extremeBlock(label: string, idxs: number[]) {
    const yy = idxs.map((j) => yEval[j]!);
    const id = idxs.map((j) => idPred[j]!);
    const zl = idxs.map((j) => zeroPred[j]!);
    return {
      decile: label,
      n: idxs.length,
      identity_mean_pred: mean(id),
      zero_linear_mean_pred: mean(zl),
      future_target_mean: mean(yy),
      identity_RMSE: rmse(yy, id),
      zero_linear_RMSE: rmse(yy, zl),
      identity_bias: mean(id.map((p, k) => p - yy[k]!)),
      zero_linear_bias: mean(zl.map((p, k) => p - yy[k]!)),
    };
  }
  const extremeRows = [
    extremeBlock(
      "bottom_decile",
      bottom.map((x) => x.j)
    ),
    extremeBlock(
      "top_decile",
      top.map((x) => x.j)
    ),
  ];
  await writeFile(
    path.join(OUT, "12b_extreme_decile_diagnostic.csv"),
    toCsv(extremeRows)
  );

  // Calibration bins
  function calBins(pred: number[], name: string) {
    const order = pred
      .map((p, j) => ({ p, j }))
      .sort((a, b) => a.p - b.p);
    const size = Math.ceil(order.length / 10);
    const rows: Record<string, unknown>[] = [];
    for (let d = 0; d < 10; d++) {
      const slice = order.slice(d * size, Math.min(order.length, (d + 1) * size));
      const idxs = slice.map((x) => x.j);
      const pp = idxs.map((j) => pred[j]!);
      const yy = idxs.map((j) => yEval[j]!);
      rows.push({
        candidate: name,
        decile: d + 1,
        n: idxs.length,
        mean_prediction: mean(pp),
        mean_target: mean(yy),
        residual: mean(pp.map((p, k) => p - yy[k]!)),
      });
    }
    return rows;
  }
  await writeFile(
    path.join(OUT, "13_calibration_bins.csv"),
    toCsv([...calBins(idPred, "IDENTITY"), ...calBins(zeroPred, "ZERO_LINEAR")])
  );

  const distAudit = [
    {
      candidate: "IDENTITY",
      mean_prediction: mean(idPred),
      SD: sd(idPred),
      P5: percentile([...idPred].sort((a, b) => a - b), 5),
      median: percentile([...idPred].sort((a, b) => a - b), 50),
      P95: percentile([...idPred].sort((a, b) => a - b), 95),
      target_mean: mean(yEval),
      target_SD: sd(yEval),
    },
    {
      candidate: "ZERO_LINEAR",
      mean_prediction: mean(zeroPred),
      SD: sd(zeroPred),
      P5: percentile([...zeroPred].sort((a, b) => a - b), 5),
      median: percentile([...zeroPred].sort((a, b) => a - b), 50),
      P95: percentile([...zeroPred].sort((a, b) => a - b), 95),
      target_mean: mean(yEval),
      target_SD: sd(yEval),
    },
    {
      candidate: "AFFINE_DIAGNOSTIC",
      mean_prediction: mean(affPred),
      SD: sd(affPred),
      P5: percentile([...affPred].sort((a, b) => a - b), 5),
      median: percentile([...affPred].sort((a, b) => a - b), 50),
      P95: percentile([...affPred].sort((a, b) => a - b), 95),
      target_mean: mean(yEval),
      target_SD: sd(yEval),
    },
  ];
  await writeFile(path.join(OUT, "14_distribution_audit.csv"), toCsv(distAudit));

  // Final rate identity tests
  const identityCases = [
    { raw: 4, n: 500 },
    { raw: -2, n: 2000 },
    { raw: 0, n: 800 },
    { raw: 1.5, n: 10000 },
  ];
  const finalB =
    CALIBRATION_SELECTION_RESULT === "ZERO_PRESERVING_LINEAR_SELECTED"
      ? b_final!
      : CALIBRATION_SELECTION_RESULT === "IDENTITY_SELECTED"
        ? 1
        : null;
  const finalRateRows = identityCases.map((c) => {
    if (finalB == null) {
      return {
        rawAbilityRate: c.raw,
        N: c.n,
        researchFinalDRBL100: "NOT_LOCKED",
        expected: "NOT_LOCKED",
        residual: "",
      };
    }
    const r = computeResearchRateV1(
      {
        rawAbilityRate: c.raw,
        actualCombinedPossessionAppearances: c.n,
      },
      {
        calibrationType: finalB === 1 ? "identity" : "zero_linear",
        b: finalB,
        calibrationVersion,
      }
    );
    const expected =
      finalB * (c.n / (c.n + RESEARCH_K)) * c.raw;
    return {
      rawAbilityRate: c.raw,
      N: c.n,
      researchFinalDRBL100: r.researchFinalDRBL100,
      expected,
      residual: r.researchFinalDRBL100 - expected,
      zeroPreserved:
        c.raw === 0 ? r.researchFinalDRBL100 === 0 : true,
    };
  });
  await writeFile(path.join(OUT, "15_final_rate_identity.csv"), toCsv(finalRateRows));

  // Write decision BEFORE any name inspection (already no names used for selection)
  const decision = {
    candidateFamily: [
      "CAL_IDENTITY",
      "CAL_ZERO_LINEAR",
      "CAL_AFFINE_DIAGNOSTIC",
    ],
    targetZeroSemantics: "R1_REPLACEMENT_BASELINE",
    TARGET_ZERO_ALIGNED_WITH_P: "YES",
    identityRMSE: idM.RMSE,
    zeroLinearRMSE: zlM.RMSE,
    relativeImprovement: relImp,
    zeroLinearBootstrapCI: [bootZL.ciLow, bootZL.ciHigh],
    P_zero_beats_identity: bootZL.probCandidateBeatsBaseline,
    foldWins: `${zeroFoldWins}/4`,
    rollingBValues: bs,
    coefficientStability: CALIBRATION_COEFFICIENT_STABILITY,
    affineRMSE: afM.RMSE,
    affineVsZeroImprovement: relAffVsZero,
    BASELINE_SHIFT_SIGNAL,
    CALIBRATION_SELECTION_RESULT,
    b_final:
      CALIBRATION_SELECTION_RESULT === "BASELINE_SEMANTICS_REVIEW_REQUIRED"
        ? null
        : b_final,
    practicalThreshold: PRACTICAL_IMPROVEMENT,
    practicalPassed,
    secondaryOk,
    researchRateVersion: RESEARCH_RATE_VERSION,
    calibrationVersion:
      CALIBRATION_SELECTION_RESULT === "BASELINE_SEMANTICS_REVIEW_REQUIRED"
        ? "NOT_LOCKED"
        : calibrationVersion,
    lockedBeforeNameInspection: true,
  };
  await writeFile(
    path.join(OUT, "16_calibration_selection_decision.json"),
    JSON.stringify(decision, null, 2)
  );

  await writeFile(
    path.join(OUT, "17_posterior_vs_calibration_contract.md"),
    `# Posterior vs calibration contract (M16h)

## Posterior
\`\`\`text
reliability adjustment based on sample information
P_post = N/(N+1600) * rawAbilityRate
\`\`\`
Version: \`${RESEARCH_POSTERIOR_VERSION}\`

## Calibration
\`\`\`text
global mapping of the posterior rate onto a better predictive scale
\`\`\`
Selected: **${CALIBRATION_SELECTION_RESULT}**
${
  finalB == null
    ? "Final coefficient: NOT_LOCKED"
    : `Final coefficient b_final = ${finalB} (${calibrationVersion})`
}

These are **separate layers**. Do not collapse k and b into one coefficient.

## Final research point-estimate lineage
${
  CALIBRATION_SELECTION_RESULT === "IDENTITY_SELECTED"
    ? `rawAbilityRate → EB1600 → FINAL_RESEARCH_DRBL100`
    : CALIBRATION_SELECTION_RESULT === "ZERO_PRESERVING_LINEAR_SELECTED"
      ? `rawAbilityRate → EB1600 → b_final×posterior → FINAL_RESEARCH_DRBL100`
      : `FINAL_RESEARCH_DRBL100 = NOT YET LOCKED (baseline semantics review)`
}

- fusion = NONE
- LN/B/M6 = DIAGNOSTIC
- posterior count = 1
- calibration layer count = ${
      CALIBRATION_SELECTION_RESULT === "ZERO_PRESERVING_LINEAR_SELECTED" ? 1 : CALIBRATION_SELECTION_RESULT === "IDENTITY_SELECTED" ? 0 : "NOT_LOCKED"
    }
`
  );

  await writeFile(
    path.join(OUT, "18_production_alignment_update.md"),
    `# Production alignment update (M16h) - conceptual only

## Legacy production
\`\`\`text
rawP → EB200 component → fusion → EB200 → drbl100
\`\`\`

## Research (after M16h)
\`\`\`text
rawP → EB1600 → ${
      CALIBRATION_SELECTION_RESULT === "IDENTITY_SELECTED"
        ? "(identity calibration)"
        : CALIBRATION_SELECTION_RESULT === "ZERO_PRESERVING_LINEAR_SELECTED"
          ? `b_final=${b_final}`
          : "CALIBRATION NOT LOCKED"
    } → final research rate
\`\`\`

Do **not** deploy. Production remains legacy until uncertainty redesign + cutover audit.
`
  );

  // Charts
  await writeFile(
    path.join(CHARTS, "identity_calibration.svg"),
    svgScatter(
      idPred.map((x, i) => ({ x, y: yEval[i]! })),
      "Identity: P_post vs target",
      "P_post",
      "future target",
      true
    )
  );
  await writeFile(
    path.join(CHARTS, "zero_linear_calibration.svg"),
    svgScatter(
      zeroPred.map((x, i) => ({ x, y: yEval[i]! })),
      "Zero-linear: calibrated vs target",
      "b * P_post",
      "future target",
      true
    )
  );
  await writeFile(
    path.join(CHARTS, "affine_diagnostic_calibration.svg"),
    svgScatter(
      affPred.map((x, i) => ({ x, y: yEval[i]! })),
      "Affine diagnostic vs target",
      "a + b*P_post",
      "future target",
      true
    )
  );
  await writeFile(
    path.join(CHARTS, "rolling_b_by_fold.svg"),
    svgBars(
      packs.map((p) => ({
        label: `F${p.evalFoldId + 1}`,
        value: p.bZero,
      })),
      "Rolling zero-linear b by eval fold",
      "b"
    )
  );
  await writeFile(
    path.join(CHARTS, "identity_vs_zero_residuals.svg"),
    svgScatter(
      idPred.map((x, i) => ({
        x: idPred[i]! - yEval[i]!,
        y: zeroPred[i]! - yEval[i]!,
      })),
      "Residuals: identity vs zero-linear",
      "identity residual",
      "zero-linear residual",
      true
    )
  );
  // bootstrap distribution approximation: resample again for chart
  const bootDiffs: number[] = [];
  {
    const rng = (() => {
      let t = BOOTSTRAP_SEED >>> 0;
      return () => {
        t += 0x6d2b79f5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
      };
    })();
    const blocks = new Map<string, number[]>();
    for (let i = 0; i < blockIds.length; i++) {
      const id = blockIds[i]!;
      const arr = blocks.get(id) ?? [];
      arr.push(i);
      blocks.set(id, arr);
    }
    const keys = [...blocks.keys()];
    for (let r = 0; r < 500; r++) {
      const sampled: number[] = [];
      for (let b = 0; b < keys.length; b++) {
        const key = keys[Math.floor(rng() * keys.length)]!;
        sampled.push(...(blocks.get(key) ?? []));
      }
      let sA = 0,
        sB = 0;
      for (const i of sampled) {
        sA += (idPred[i]! - yEval[i]!) ** 2;
        sB += (zeroPred[i]! - yEval[i]!) ** 2;
      }
      const m = sampled.length || 1;
      bootDiffs.push(Math.sqrt(sB / m) - Math.sqrt(sA / m));
    }
  }
  await writeFile(
    path.join(CHARTS, "bootstrap_delta_rmse.svg"),
    svgHist(bootDiffs, "Bootstrap ΔRMSE (zero − identity)", "ΔRMSE")
  );
  await writeFile(
    path.join(CHARTS, "rmse_by_exposure_quartile.svg"),
    svgBars(
      expoRows.map((r) => ({
        label: String(r.quartile),
        value: Number(r.delta_RMSE),
      })),
      "ΔRMSE (zero − identity) by exposure Q",
      "ΔRMSE"
    )
  );
  await writeFile(
    path.join(CHARTS, "bias_by_sign_bin.svg"),
    svgBars(
      signRows.map((r) => ({
        label: String(r.bin).slice(0, 8),
        value: Number(r.zero_linear_bias),
      })),
      "Zero-linear bias by sign/rate bin",
      "bias"
    )
  );
  await writeFile(
    path.join(CHARTS, "pred_vs_target_distributions.svg"),
    svgHist(
      [...yEval, ...idPred, ...zeroPred],
      "Combined values (descriptive overlay file)",
      "value"
    )
  );
  await writeFile(
    path.join(CHARTS, "calibration_residual_by_decile.svg"),
    svgBars(
      calBins(idPred, "IDENTITY").map((r) => ({
        label: `D${r.decile}`,
        value: Number(r.residual),
      })),
      "Identity calibration residual by pred decile",
      "residual"
    )
  );
  await writeFile(
    path.join(CHARTS, "identity_vs_calibrated_scatter.svg"),
    svgScatter(
      idPred.map((x, i) => ({ x, y: zeroPred[i]! })),
      "Identity vs zero-linear predictions",
      "identity",
      "zero-linear",
      true
    )
  );

  const FINAL_RESEARCH_ZERO_PRESERVED =
    CALIBRATION_SELECTION_RESULT === "BASELINE_SEMANTICS_REVIEW_REQUIRED"
      ? "NOT_LOCKED"
      : "YES";

  const modelHealth = {
    M16G2_REPRODUCED: repro.reproduced,
    M16B_HASHES_MATCH: "PASS",
    M16G_FOLD_HASHES_MATCH: foldHashOk ? "PASS" : "FAIL",
    RESEARCH_POSTERIOR_K: 1600,
    RESEARCH_POSTERIOR_LAYER_COUNT: 1,
    TARGET_ZERO_SEMANTICS: "R1_REPLACEMENT_BASELINE",
    TARGET_ZERO_ALIGNED_WITH_P: "YES",
    CALIBRATION_PROTOCOL_CHRONOLOGICAL: "PASS",
    CALIBRATION_TRAIN_EVAL_OVERLAP: 0,
    M16B_VALIDATION_USED_FOR_SELECTION: "NO",
    RESERVED_TEST_ACCESSED: "NO",
    IDENTITY_RMSE: idM.RMSE,
    ZERO_LINEAR_RMSE: zlM.RMSE,
    ZERO_LINEAR_RELATIVE_IMPROVEMENT: relImp,
    ZERO_LINEAR_BOOTSTRAP_P: bootZL.probCandidateBeatsBaseline,
    ZERO_LINEAR_FOLD_WINS: `${zeroFoldWins}/4`,
    ZERO_LINEAR_SLOPES: bs,
    CALIBRATION_COEFFICIENT_STABILITY,
    AFFINE_DIAGNOSTIC_RMSE: afM.RMSE,
    BASELINE_SHIFT_SIGNAL,
    CALIBRATION_SELECTION_RESULT,
    FINAL_CALIBRATION_COEFFICIENT: b_final,
    FINAL_RESEARCH_ZERO_PRESERVED,
    UNCERTAINTY_CHANGED: "NO",
    OD_CHANGED: "NO",
    WAR_CHANGED: "NO",
    PRODUCTION_CHANGED: "NO",
    identityMetrics: idM,
    zeroLinearMetrics: zlM,
    affineMetrics: afM,
    bootstrapZL: bootZL,
    bootstrapAF: bootAF,
    expoRows,
    extremeRows,
    withinFoldRankChanges,
    pooledEvalN: yEval.length,
  };
  await writeFile(
    path.join(OUT, "19_model_health.json"),
    JSON.stringify(modelHealth, null, 2)
  );

  const charts = (await readdir(CHARTS)).sort();
  await writeFile(
    path.join(OUT, "20_full_audit.md"),
    `# M16h full audit

## Decision
**${CALIBRATION_SELECTION_RESULT}** (b_final=${b_final ?? "NONE"})

## Key numbers
- Identity RMSE: ${idM.RMSE}
- Zero-linear RMSE: ${zlM.RMSE}
- Relative improvement: ${(relImp * 100).toFixed(3)}%
- Bootstrap P(zero beats id): ${bootZL.probCandidateBeatsBaseline}
- Fold wins: ${zeroFoldWins}/4
- Rolling b: ${bs.map((b) => b.toFixed(4)).join(", ")}
- Stability: ${CALIBRATION_COEFFICIENT_STABILITY}
- Affine RMSE: ${afM.RMSE}
- BASELINE_SHIFT_SIGNAL: ${BASELINE_SHIFT_SIGNAL}

## Charts
${charts.map((c) => `- charts/${c}`).join("\n")}

## Frozen
Production / WAR / uncertainty / O/D unchanged. RESERVED_TEST closed. VALIDATION unused for selection.
`
  );

  await writeFile(
    path.join(OUT, "21_final_response_values.json"),
    JSON.stringify(
      {
        freeze,
        repro,
        decision,
        modelHealth,
        idM,
        zlM,
        afM,
        packs: packs.map((p) => ({
          evalFoldId: p.evalFoldId,
          bZero: p.bZero,
          aAff: p.aAff,
          bAff: p.bAff,
        })),
      },
      null,
      2
    )
  );

  console.log(
    JSON.stringify(
      {
        status: "M16h_COMPLETE",
        CALIBRATION_SELECTION_RESULT,
        b_final,
        BASELINE_SHIFT_SIGNAL,
        IDENTITY_RMSE: idM.RMSE,
        ZERO_LINEAR_RMSE: zlM.RMSE,
        relativeImprovement: relImp,
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
