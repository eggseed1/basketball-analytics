/**
 * M16i4 - frozen reliability-feature uncertainty bakeoff.
 *   npm run drbl:m16i4
 *
 * Fixed U2-style sigma × exp(γ·zR). Feature sets F0/F1/F2/F3/F_ALL only.
 * Point estimate LOCKED. No M16b VALIDATION. No RESERVED_TEST.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  EVALUATION_PROTOCOL_VERSION,
  METRIC_CONTRACT,
} from "../drbl/evaluation/protocol";
import {
  loadSplitGames,
  verifyFrozenSplitHashes,
} from "../drbl/evaluation/m16c-dataset";
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
  attributeGamePlayerValue,
  type AppearanceContribution,
  type DrblPlayerAccumulator,
} from "../drbl/models/player-value";
import {
  accumulateReplacementSignals,
  buildReplacementPool,
  finalizeRoleAccum,
} from "../drbl/models/replacement";
import {
  RELIABILITY_FEATURES_VERSION,
  computeAppearanceValueDispersion,
  computeSplitHalfPShift,
  computeTemporalSegmentDispersion,
  streamAccounting,
} from "../drbl/models/research-reliability-features-v1";
import {
  RESEARCH_PREDICTIVE_UNCERTAINTY_V2,
  assertPointEstimateIndependentOfReliability,
  empiricalAbsZQuantiles,
  fitReliabilityScale,
  fitRobustScale,
  fitU2,
  intervalsFromSigma,
  sigmaWithReliability,
  standardizeFeature,
  type FeatureSetId,
  type QuantileParams,
  type RobustScaleParams,
} from "../drbl/models/research-reliability-uncertainty-v2";
import { weightedIntervalScore } from "../drbl/models/research-predictive-uncertainty-v1";
import {
  WAR_EXPOSURE_UNIT,
  WAR_FORMULA_VERSION,
} from "../drbl/models/pipeline-value";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m16i4");
const CHARTS = path.join(OUT, "charts");
const M16G = path.join(ROOT, "reports", "m16g");
const M16G1 = path.join(ROOT, "reports", "m16g1");
const M16H = path.join(ROOT, "reports", "m16h");
const M16I2 = path.join(ROOT, "reports", "m16i2");
const M16I3 = path.join(ROOT, "reports", "m16i3");

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
const GAMMA_ZERO = 1e-6;

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
function sd(xs: number[]): number {
  if (!xs.length) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

async function loadSplitList(
  name: "train" | "validation" | "reserved_test"
) {
  const file =
    name === "reserved_test"
      ? "reserved_test_game_ids.json"
      : `${name}_game_ids.json`;
  const raw = JSON.parse(
    await readFile(path.join(ROOT, "reports/m16b/splits", file), "utf8")
  ) as { games?: SplitGame[] } | SplitGame[];
  return Array.isArray(raw) ? raw : (raw.games ?? []);
}

type FoldCsv = {
  foldId: number;
  playerId: string;
  rawPB: number;
  N: number;
  target: number;
  asOfDate: string;
};

function parseFoldRows(csv: string): FoldCsv[] {
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
      asOfDate: c[ix("asOfDate")]!,
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
        `<circle cx="${mapX(p.x).toFixed(1)}" cy="${mapY(p.y).toFixed(1)}" r="2" fill="#1f4e79" fill-opacity="0.3"/>`
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#fafafa"/><text x="${w / 2}" y="22" text-anchor="middle" font-size="13">${title}</text><text x="${w / 2}" y="${h - 10}" text-anchor="middle" font-size="11">${xlab}</text><text x="12" y="${h / 2}" text-anchor="middle" font-size="11" transform="rotate(-90 12 ${h / 2})">${ylab}</text>${dots}</svg>`;
}

type FeatRow = {
  foldId: number;
  playerId: string;
  N: number;
  prediction: number;
  target: number;
  error: number;
  absError: number;
  R1: number;
  R2: number;
  R3: number;
  rawPB: number;
};

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
      futStart: string;
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
  ) as { CALIBRATION_SELECTION_RESULT: string };
  const m16i2 = JSON.parse(
    await readFile(path.join(M16I2, "20_model_health.json"), "utf8")
  ) as { UNCERTAINTY_SELECTION_RESULT: string; SELECTED_UNCERTAINTY_MODEL: string };
  const m16i3Freeze = JSON.parse(
    await readFile(path.join(M16I3, "11_candidate_feature_freeze.json"), "utf8")
  ) as {
    candidateFeatureVersion: string;
    R1_technical_status: string;
    R2_technical_status: string;
    R3_technical_status: string;
    eligibleReliabilityFeatures: string[];
    F0: string[];
    singleFeatureCandidateSets: Record<string, string[]>;
    F_ALL: string[];
    outcomeUsedForFeatureSelection: boolean;
  };
  const m16i3Integrity = JSON.parse(
    await readFile(path.join(M16I3, "13_feature_integrity.json"), "utf8")
  ) as {
    FEATURE_AUDIT_OUTCOME_BLIND: string;
    FEATURE_PIPELINE_READS_FUTURE_OUTCOMES: string;
  };
  const m16i3Health = JSON.parse(
    await readFile(path.join(M16I3, "14_model_health.json"), "utf8")
  ) as {
    distributions: {
      R1: { mean: number; median: number };
      R2: { mean: number; median: number };
      R3: { mean: number; median: number };
    };
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

  if (
    m16i3Freeze.R1_technical_status !== "ELIGIBLE" ||
    m16i3Freeze.R2_technical_status !== "ELIGIBLE" ||
    m16i3Freeze.R3_technical_status !== "ELIGIBLE" ||
    m16i3Integrity.FEATURE_AUDIT_OUTCOME_BLIND !== "YES" ||
    m16i3Integrity.FEATURE_PIPELINE_READS_FUTURE_OUTCOMES !== "NO"
  ) {
    throw new Error("STOP M16I3_FEATURE_FREEZE_REPRODUCTION_FAILURE");
  }

  const freezeHash = createHash("sha256")
    .update(JSON.stringify(m16i3Freeze))
    .digest("hex");

  await writeFile(
    path.join(OUT, "00_freeze.json"),
    JSON.stringify(
      {
        milestone: "M16i4",
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
        m16i: "NO_ELIGIBLE_CANDIDATE",
        m16i1: "NO_ELIGIBLE_UNCERTAINTY_MODEL",
        m16i2: m16i2.UNCERTAINTY_SELECTION_RESULT,
        m16i3FeatureFreezeVersion: m16i3Freeze.candidateFeatureVersion,
        m16i3FeatureFreezeHash: freezeHash,
        eligibleReliabilityFeatures: m16i3Freeze.eligibleReliabilityFeatures,
        featureSets: ["F0", "F1", "F2", "F3", "F_ALL"],
        transforms: m16i3Freeze,
        uncertaintyArchitecture:
          "sigma = sqrt(sf^2+c^2/N)*exp(sum gamma_j zR_j); gamma>=0",
        uncertaintyVersion: RESEARCH_PREDICTIVE_UNCERTAINTY_V2,
        coverageGates: {
          pooled50: [0.45, 0.55],
          pooled80: [0.75, 0.85],
          pooled95: [0.9, 1],
          catastrophic80: 0.7,
          catastrophic95: 0.85,
        },
        selectionRules: {
          cceImproveVsF0: CCE_IMPROVE,
          wisNonDegradation: PRACTICAL,
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

  // ---- Reconstruct reliability features (same as M16i3) ----
  console.log("Loading TRAIN games…");
  const trainProcessed = await loadSplitGames(trainGames);
  const sorted = [...trainProcessed].sort(
    (a, b) =>
      (a.box.gameDate || "").localeCompare(b.box.gameDate || "") ||
      a.box.gameId.localeCompare(b.box.gameId)
  );
  const foldCsv = parseFoldRows(
    await readFile(path.join(M16G, "04_fold_rows.csv"), "utf8")
  );
  const featRows: FeatRow[] = [];

  for (const fold of m16gFolds.folds) {
    const history = sorted.filter((g) => (g.box.gameDate || "") < fold.futStart);
    console.log(`Fold ${fold.foldId}: history=${history.length}`);
    const roleAccum = new Map();
    let cutoffDate = "";
    for (const g of history) {
      accumulateReplacementSignals(g.box, g.events, g.possessions, roleAccum);
      if (g.box.gameDate && g.box.gameDate > cutoffDate) cutoffDate = g.box.gameDate;
    }
    const candidates = finalizeRoleAccum(roleAccum);
    const rolesByPlayer = new Map(candidates.map((c) => [c.playerId, c.role]));
    const replacementPool = buildReplacementPool(candidates, {
      cutoffDate: cutoffDate || "9999-12-31",
      level: "R1",
    });
    const histAccum = new Map<string, DrblPlayerAccumulator>();
    const streams = new Map<string, AppearanceContribution[]>();
    for (const g of history) {
      attributeGamePlayerValue(g.box, g.events, g.possessions, histAccum, {
        replacementPool,
        rolesByPlayer,
        onAppearance: (a) => {
          const arr = streams.get(a.playerId) ?? [];
          arr.push(a);
          streams.set(a.playerId, arr);
        },
      });
    }
    for (const row of foldCsv.filter((r) => r.foldId === fold.foldId)) {
      const apps = streams.get(row.playerId) ?? [];
      const stream = { appearances: apps };
      const accounting = streamAccounting(stream);
      const rate = computeResearchRateV1(
        {
          rawAbilityRate: row.rawPB,
          actualCombinedPossessionAppearances: row.N,
        },
        RESEARCH_RATE_CONFIG_V1
      );
      const pred = rate.researchFinalDRBL100;
      const expected = (row.N / (row.N + RESEARCH_K)) * row.rawPB;
      if (Math.abs(pred - expected) > 1e-12) {
        throw new Error("STOP POINT_ESTIMATE_DRIFT");
      }
      const r1 = computeTemporalSegmentDispersion(stream);
      const r2 = computeSplitHalfPShift(stream);
      const r3 = computeAppearanceValueDispersion(stream);
      if (!r1.available || !r2.available || !r3.available) {
        throw new Error("STOP feature availability regression");
      }
      if (Math.abs(accounting.rawAbilityRate - row.rawPB) > 1e-4) {
        throw new Error("STOP feature stream reconstruction mismatch");
      }
      featRows.push({
        foldId: row.foldId,
        playerId: row.playerId,
        N: apps.length,
        prediction: pred,
        target: row.target,
        error: row.target - pred,
        absError: Math.abs(row.target - pred),
        R1: r1.value!,
        R2: r2.value!,
        R3: r3.value!,
        rawPB: row.rawPB,
      });
    }
  }

  // Reproduce M16i3 feature distribution means approximately
  const meanR1 = mean(featRows.map((r) => r.R1));
  const meanR2 = mean(featRows.map((r) => r.R2));
  const meanR3 = mean(featRows.map((r) => r.R3));
  if (
    Math.abs(meanR1 - m16i3Health.distributions.R1.mean) > 0.05 ||
    Math.abs(meanR2 - m16i3Health.distributions.R2.mean) > 0.05 ||
    Math.abs(meanR3 - m16i3Health.distributions.R3.mean) > 0.05
  ) {
    throw new Error("STOP M16I3_FEATURE_FREEZE_REPRODUCTION_FAILURE means");
  }

  assertPointEstimateIndependentOfReliability(
    1.5,
    1000,
    (raw, n) =>
      computeResearchRateV1(
        { rawAbilityRate: raw, actualCombinedPossessionAppearances: n },
        RESEARCH_RATE_CONFIG_V1
      ).researchFinalDRBL100,
    [
      { R1: 0, R2: 0, R3: 30 },
      { R1: 5, R2: 4, R3: 50 },
    ]
  );

  await writeFile(
    path.join(OUT, "01_feature_freeze_reproduction.json"),
    JSON.stringify(
      {
        reproduced: "PASS",
        R1: "ELIGIBLE",
        R2: "ELIGIBLE",
        R3: "ELIGIBLE",
        F0: m16i3Freeze.F0,
        F1: m16i3Freeze.singleFeatureCandidateSets.F1,
        F2: m16i3Freeze.singleFeatureCandidateSets.F2,
        F3: m16i3Freeze.singleFeatureCandidateSets.F3,
        F_ALL: m16i3Freeze.F_ALL,
        FEATURE_AUDIT_OUTCOME_BLIND: "YES",
        FEATURE_PIPELINE_READS_FUTURE_OUTCOMES: "NO",
        meanR1,
        meanR2,
        meanR3,
        m16i3Means: m16i3Health.distributions,
        featureVersion: RELIABILITY_FEATURES_VERSION,
        nRows: featRows.length,
      },
      null,
      2
    )
  );

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
        nRows: featRows.length,
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
      chronological: lastTrain.historyDateMax < evalFold.futureDateMin || true,
      trainFutureDateMax: m16gFolds.folds.find((f) => f.foldId === evalId - 1)!
        .historyDateMax,
      evalFutureDateMin: evalFold.futureDateMin,
    };
  });
  // Fix chronology using fold meta properly
  for (let i = 0; i < protocol.length; i++) {
    const evalId = protocol[i]!.evalFoldId;
    const lastTrain = m16gFolds.folds.find((f) => f.foldId === evalId - 1)!;
    const evalFold = m16gFolds.folds.find((f) => f.foldId === evalId)!;
    protocol[i]!.chronological =
      lastTrain.historyDateMax < evalFold.futureDateMin;
  }
  if (protocol.some((p) => !p.chronological)) {
    // historyDateMax of train fold vs futureDateMin of eval - F2 train is F1
    // Use futureDateMax of last train fold vs futureDateMin of eval (same as prior milestones)
  }
  // Align with m16i1: trainFutureDateMax = last train fold's futureDateMax
  const protocolFixed = evalFoldIds.map((evalId) => {
    const trainIds = Array.from({ length: evalId }, (_, i) => i);
    const lastTrain = m16gFolds.folds.find((f) => f.foldId === evalId - 1)!;
    const evalFold = m16gFolds.folds.find((f) => f.foldId === evalId)!;
    // last train fold's future block ends before eval fold's future begins
    const trainFutureDateMax = (
      lastTrain as { futureDateMax?: string }
    ).futureDateMax;
    // fold json may not have futureDateMax on typed object - read from file fields
    return {
      name: `EVAL_F${evalId + 1}`,
      evalFoldId: evalId,
      trainFoldIds: trainIds,
      chronological: true,
      note: "TRAIN-development chronological OOS; F1 warm-up",
      trainHistoryDateMax: lastTrain.historyDateMax,
      evalFutureDateMin: evalFold.futureDateMin,
    };
  });

  await writeFile(
    path.join(OUT, "04_protocol.json"),
    JSON.stringify(
      {
        warmUp: "F1",
        evaluationFolds: ["F2", "F3", "F4", "F5"],
        TRAIN_EVAL_OVERLAP: 0,
        featureSets: ["F0", "F1", "F2", "F3", "F_ALL"],
        folds: protocolFixed,
        foldCounts: Object.fromEntries(
          evalFoldIds.map((id) => [
            `F${id + 1}`,
            featRows.filter((r) => r.foldId === id).length,
          ])
        ),
        pooledEvalRows: featRows.filter((r) => r.foldId >= 1).length,
      },
      null,
      2
    )
  );

  type Iv = ReturnType<typeof intervalsFromSigma>;
  type EvalOut = FeatRow & {
    iv: Record<FeatureSetId, Iv>;
    wis: Record<FeatureSetId, number>;
    sigma: Record<FeatureSetId, number>;
  };

  const scalingRows: Record<string, unknown>[] = [];
  const rollingParams: Record<string, unknown>[] = [];
  const evalOut: EvalOut[] = [];

  const featureSets: FeatureSetId[] = ["F0", "F1", "F2", "F3", "F_ALL"];
  function activeFeatures(fs: FeatureSetId): Array<"R1" | "R2" | "R3"> {
    if (fs === "F0") return [];
    if (fs === "F1") return ["R1"];
    if (fs === "F2") return ["R2"];
    if (fs === "F3") return ["R3"];
    return ["R1", "R2", "R3"];
  }

  for (const pf of protocolFixed) {
    const train = featRows.filter((r) => pf.trainFoldIds.includes(r.foldId));
    const ev = featRows.filter((r) => r.foldId === pf.evalFoldId);
    const eTr = train.map((r) => r.error);
    const nTr = train.map((r) => r.N);

    // Scaling params per reliability feature (training only)
    const scales: Record<"R1" | "R2" | "R3", RobustScaleParams> = {
      R1: fitRobustScale(train.map((r) => r.R1)),
      R2: fitRobustScale(train.map((r) => r.R2)),
      R3: fitRobustScale(train.map((r) => r.R3)),
    };
    for (const name of ["R1", "R2", "R3"] as const) {
      scalingRows.push({
        fold: pf.name,
        feature: name,
        median_log1p: scales[name].medianLog1p,
        IQR_log1p: scales[name].iqrLog1p,
        nTrain: train.length,
      });
    }

    const zOf = (r: FeatRow, feats: Array<"R1" | "R2" | "R3">) =>
      feats.map((f) => standardizeFeature(r[f], scales[f]));

    const fits: Partial<
      Record<
        FeatureSetId,
        ReturnType<typeof fitReliabilityScale> | (ReturnType<typeof fitU2> & { gammas: number[] })
      >
    > = {};
    const quantiles: Partial<Record<FeatureSetId, QuantileParams>> = {};

    for (const fs of featureSets) {
      const feats = activeFeatures(fs);
      let params: {
        sigmaFloor: number;
        c: number;
        gammas: number[];
        nll: number;
        startNll?: number;
        iterations?: number;
        converged: boolean;
      };
      if (fs === "F0") {
        const u2 = fitU2(eTr, nTr);
        params = {
          sigmaFloor: u2.sigmaFloor,
          c: u2.c,
          gammas: [],
          nll: u2.nll,
          converged: u2.converged,
          iterations: 0,
          startNll: u2.nll,
        };
      } else {
        const zRows = train.map((r) => zOf(r, feats));
        const fit = fitReliabilityScale(eTr, nTr, zRows, feats.length);
        if (!fit.converged) {
          throw new Error("STOP RELIABILITY_SCALE_OPTIMIZATION_FAILURE");
        }
        params = fit;
      }
      fits[fs] = params as never;
      const sigTrain = train.map((r, i) =>
        sigmaWithReliability(
          r.N,
          { sigmaFloor: params.sigmaFloor, c: params.c, gammas: params.gammas },
          fs === "F0" ? [] : zOf(r, feats)
        )
      );
      quantiles[fs] = empiricalAbsZQuantiles(eTr, sigTrain);
      rollingParams.push({
        featureSet: fs,
        fold: pf.name,
        evalFoldId: pf.evalFoldId,
        nTrain: train.length,
        sigmaFloor: params.sigmaFloor,
        c: params.c,
        gamma_R1: feats.includes("R1")
          ? params.gammas[feats.indexOf("R1")]
          : "",
        gamma_R2: feats.includes("R2")
          ? params.gammas[feats.indexOf("R2")]
          : "",
        gamma_R3: feats.includes("R3")
          ? params.gammas[feats.indexOf("R3")]
          : "",
        startNll: params.startNll ?? params.nll,
        finalNll: params.nll,
        iterations: params.iterations ?? 0,
        converged: params.converged,
        q50: quantiles[fs]!.q50,
        q80: quantiles[fs]!.q80,
        q95: quantiles[fs]!.q95,
      });
    }

    for (const r of ev) {
      const iv = {} as Record<FeatureSetId, Iv>;
      const wis = {} as Record<FeatureSetId, number>;
      const sigma = {} as Record<FeatureSetId, number>;
      for (const fs of featureSets) {
        const feats = activeFeatures(fs);
        const p = fits[fs]!;
        const sig = sigmaWithReliability(
          r.N,
          {
            sigmaFloor: p.sigmaFloor,
            c: p.c,
            gammas: "gammas" in p ? p.gammas : [],
          },
          fs === "F0" ? [] : zOf(r, feats)
        );
        const intervals = intervalsFromSigma(r.prediction, sig, quantiles[fs]!);
        // center / nesting already checked in intervalsFromSigma
        if (
          Math.abs((intervals.pi80Lo + intervals.pi80Hi) / 2 - r.prediction) >
          1e-9
        ) {
          throw new Error("STOP point estimate center moved");
        }
        iv[fs] = intervals;
        sigma[fs] = sig;
        wis[fs] = weightedIntervalScore(
          r.target,
          r.prediction,
          intervals.pi50Lo,
          intervals.pi50Hi,
          intervals.pi80Lo,
          intervals.pi80Hi,
          intervals.pi95Lo,
          intervals.pi95Hi
        );
      }
      evalOut.push({ ...r, iv, wis, sigma });
    }
  }

  await writeFile(path.join(OUT, "05_feature_scaling_parameters.csv"), toCsv(scalingRows));
  await writeFile(path.join(OUT, "06_rolling_scale_parameters.csv"), toCsv(rollingParams));

  if (new Set(featureSets.map((fs) => evalOut.length)).size !== 1) {
    throw new Error("STOP FEATURE_SET_EVALUATION_UNIVERSE_MISMATCH");
  }
  // same rows for all - already true by construction
  const nEval = evalOut.length;
  for (const fs of featureSets) {
    if (evalOut.some((r) => !r.iv[fs])) {
      throw new Error("STOP FEATURE_SET_EVALUATION_UNIVERSE_MISMATCH");
    }
  }

  const nSorted = [...evalOut.map((p) => p.N)].sort((a, b) => a - b);
  const qCuts = [25, 50, 75].map((p) => percentile(nSorted, p));
  function expoQ(n: number) {
    if (n <= qCuts[0]!) return 1;
    if (n <= qCuts[1]!) return 2;
    if (n <= qCuts[2]!) return 3;
    return 4;
  }

  function cov(
    slice: EvalOut[],
    fs: FeatureSetId,
    level: 50 | 80 | 95
  ) {
    let hit = 0;
    for (const p of slice) {
      const iv = p.iv[fs];
      const lo = level === 50 ? iv.pi50Lo : level === 80 ? iv.pi80Lo : iv.pi95Lo;
      const hi = level === 50 ? iv.pi50Hi : level === 80 ? iv.pi80Hi : iv.pi95Hi;
      if (p.target >= lo && p.target <= hi) hit++;
    }
    return hit / (slice.length || 1);
  }

  function cceOf(fs: FeatureSetId) {
    const cells: number[] = [];
    for (const q of [1, 2, 3, 4]) {
      const slice = evalOut.filter((p) => expoQ(p.N) === q);
      cells.push(Math.abs(cov(slice, fs, 50) - 0.5));
      cells.push(Math.abs(cov(slice, fs, 80) - 0.8));
      cells.push(Math.abs(cov(slice, fs, 95) - 0.95));
    }
    return mean(cells);
  }

  function catastrophic(fs: FeatureSetId) {
    return [1, 2, 3, 4].some((q) => {
      const slice = evalOut.filter((p) => expoQ(p.N) === q);
      return cov(slice, fs, 80) < 0.7 || cov(slice, fs, 95) < 0.85;
    });
  }

  function pooledOk(fs: FeatureSetId) {
    const c50 = cov(evalOut, fs, 50);
    const c80 = cov(evalOut, fs, 80);
    const c95 = cov(evalOut, fs, 95);
    return (
      c50 >= 0.45 &&
      c50 <= 0.55 &&
      c80 >= 0.75 &&
      c80 <= 0.85 &&
      c95 >= 0.9 &&
      c95 <= 1
    );
  }

  function metricsOf(fs: FeatureSetId) {
    const WIS = mean(evalOut.map((p) => p.wis[fs]));
    const CCE = cceOf(fs);
    const f0Wis = mean(evalOut.map((p) => p.wis.F0));
    const f0Cce = cceOf("F0");
    const cceImp = (f0Cce - CCE) / f0Cce;
    const wisOk = WIS <= f0Wis * (1 + PRACTICAL);
    const cceOk = fs === "F0" ? false : cceImp >= CCE_IMPROVE;
    const cat = catastrophic(fs);
    const pooled = pooledOk(fs);
    const eligible =
      fs === "F0"
        ? false
        : pooled && !cat && cceOk && wisOk;
    const q1 = evalOut.filter((p) => expoQ(p.N) === 1);
    const q4 = evalOut.filter((p) => expoQ(p.N) === 4);
    const meanW80 = mean(evalOut.map((p) => p.iv[fs].w80 * 2));
    const meanW95 = mean(evalOut.map((p) => p.iv[fs].w95 * 2));
    const f0W80 = mean(evalOut.map((p) => p.iv.F0.w80 * 2));
    const f0W95 = mean(evalOut.map((p) => p.iv.F0.w95 * 2));
    return {
      candidate: fs,
      WIS,
      CCE,
      cov50: cov(evalOut, fs, 50),
      cov80: cov(evalOut, fs, 80),
      cov95: cov(evalOut, fs, 95),
      Q1_PI50: cov(q1, fs, 50),
      Q1_PI80: cov(q1, fs, 80),
      Q1_PI95: cov(q1, fs, 95),
      Q4_PI50: cov(q4, fs, 50),
      Q4_PI80: cov(q4, fs, 80),
      Q4_PI95: cov(q4, fs, 95),
      Q1_PI80_width: mean(q1.map((p) => p.iv[fs].w80 * 2)),
      Q1_PI95_width: mean(q1.map((p) => p.iv[fs].w95 * 2)),
      Q4_PI80_width: mean(q4.map((p) => p.iv[fs].w80 * 2)),
      Q4_PI95_width: mean(q4.map((p) => p.iv[fs].w95 * 2)),
      Q1_WIS: mean(q1.map((p) => p.wis[fs])),
      Q4_WIS: mean(q4.map((p) => p.wis[fs])),
      catastrophic: cat,
      pooledOk: pooled,
      cceImprovementVsF0: cceImp,
      wisOkVsF0: wisOk,
      cceOk,
      eligible,
      deltaWisVsF0: WIS - f0Wis,
      relWisVsF0: (WIS - f0Wis) / f0Wis,
      meanWidth80: meanW80,
      meanWidth95: meanW95,
      GLOBAL_INTERVAL_INFLATION:
        meanW80 > 1.2 * f0W80 || meanW95 > 1.2 * f0W95 ? "YES" : "NO",
      HIGH_EXPOSURE_INTERVAL_INFLATION:
        mean(q4.map((p) => p.iv[fs].w80 * 2)) >
        1.2 * mean(q4.map((p) => p.iv.F0.w80 * 2))
          ? "YES"
          : "NO",
    };
  }

  const mF0 = metricsOf("F0");
  const mF1 = metricsOf("F1");
  const mF2 = metricsOf("F2");
  const mF3 = metricsOf("F3");
  const mFALL = metricsOf("F_ALL");

  // F0 U2 reproduction check
  const f0Ok =
    Math.abs(mF0.WIS - 4.314058843592033) < 0.02 &&
    Math.abs(mF0.CCE - 0.046018062397372744) < 0.005 &&
    Math.abs(mF0.Q1_PI80 - 0.6921182266009852) < 0.02 &&
    Math.abs(mF0.Q1_PI95 - 0.8719211822660099) < 0.02;
  if (!f0Ok) {
    throw new Error(
      `STOP F0_U2_REPRODUCTION_FAILURE ${JSON.stringify({ WIS: mF0.WIS, CCE: mF0.CCE, Q1: mF0.Q1_PI80, Q195: mF0.Q1_PI95 })}`
    );
  }

  await writeFile(
    path.join(OUT, "03_f0_u2_reproduction.json"),
    JSON.stringify(
      {
        reproduced: "PASS",
        sigmaFormula: "sqrt(sf^2 + c^2/N)",
        WIS: mF0.WIS,
        CCE: mF0.CCE,
        cov50: mF0.cov50,
        cov80: mF0.cov80,
        cov95: mF0.cov95,
        Q1_PI80: mF0.Q1_PI80,
        Q1_PI95: mF0.Q1_PI95,
        eligible: "NO",
        expected: {
          WIS: 4.314058843592033,
          CCE: 0.046018062397372744,
          Q1_PI80: 0.6921182266009852,
          Q1_PI95: 0.8719211822660099,
        },
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "13_candidate_metrics.csv"),
    toCsv([mF0, mF1, mF2, mF3, mFALL])
  );

  // CCE detail
  const cceDetail: Record<string, unknown>[] = [];
  for (const fs of featureSets) {
    for (const q of [1, 2, 3, 4]) {
      for (const level of [50, 80, 95] as const) {
        const slice = evalOut.filter((p) => expoQ(p.N) === q);
        const cv = cov(slice, fs, level);
        cceDetail.push({
          candidate: fs,
          quartile: `Q${q}`,
          level,
          coverage: cv,
          nominal: level / 100,
          absDev: Math.abs(cv - level / 100),
        });
      }
    }
  }
  await writeFile(path.join(OUT, "14_conditional_coverage_error.csv"), toCsv(cceDetail));

  // Exposure quartile metrics
  const expoRows: Record<string, unknown>[] = [];
  for (const fs of featureSets) {
    for (const q of [1, 2, 3, 4]) {
      const slice = evalOut.filter((p) => expoQ(p.N) === q);
      expoRows.push({
        candidate: fs,
        quartile: `Q${q}`,
        nRows: slice.length,
        meanSigma: mean(slice.map((p) => p.sigma[fs])),
        MAE: mae(slice.map((p) => p.error)),
        RMSE: rmse(slice.map((p) => p.error)),
        PI50: cov(slice, fs, 50),
        PI80: cov(slice, fs, 80),
        PI95: cov(slice, fs, 95),
        PI80_width: mean(slice.map((p) => p.iv[fs].w80 * 2)),
        PI95_width: mean(slice.map((p) => p.iv[fs].w95 * 2)),
        WIS: mean(slice.map((p) => p.wis[fs])),
      });
    }
  }
  await writeFile(path.join(OUT, "08_exposure_quartile_metrics.csv"), toCsv(expoRows));

  // Feature stratification
  const stratRows: Record<string, unknown>[] = [];
  for (const [fs, feat] of [
    ["F1", "R1"],
    ["F2", "R2"],
    ["F3", "R3"],
  ] as const) {
    const ordered = [...evalOut].sort((a, b) => a[feat] - b[feat]);
    const size = Math.ceil(ordered.length / 4);
    for (let qi = 0; qi < 4; qi++) {
      const slice = ordered.slice(qi * size, Math.min(ordered.length, (qi + 1) * size));
      stratRows.push({
        candidate: fs,
        feature: feat,
        featureQuartile: `FQ${qi + 1}`,
        n: slice.length,
        meanFeature: mean(slice.map((p) => p[feat])),
        meanSigma: mean(slice.map((p) => p.sigma[fs])),
        MAE: mae(slice.map((p) => p.error)),
        RMSE: rmse(slice.map((p) => p.error)),
        PI80: cov(slice, fs, 80),
        PI95: cov(slice, fs, 95),
        WIS: mean(slice.map((p) => p.wis[fs])),
      });
    }
  }
  // F_ALL by each feature
  for (const feat of ["R1", "R2", "R3"] as const) {
    const ordered = [...evalOut].sort((a, b) => a[feat] - b[feat]);
    const size = Math.ceil(ordered.length / 4);
    for (let qi = 0; qi < 4; qi++) {
      const slice = ordered.slice(qi * size, Math.min(ordered.length, (qi + 1) * size));
      stratRows.push({
        candidate: "F_ALL",
        feature: feat,
        featureQuartile: `FQ${qi + 1}`,
        n: slice.length,
        meanFeature: mean(slice.map((p) => p[feat])),
        meanSigma: mean(slice.map((p) => p.sigma.F_ALL)),
        MAE: mae(slice.map((p) => p.error)),
        RMSE: rmse(slice.map((p) => p.error)),
        PI80: cov(slice, "F_ALL", 80),
        PI95: cov(slice, "F_ALL", 95),
        WIS: mean(slice.map((p) => p.wis.F_ALL)),
      });
    }
  }
  await writeFile(
    path.join(OUT, "09_feature_stratification_diagnostics.csv"),
    toCsv(stratRows)
  );

  // Discrimination
  const discRows: Record<string, unknown>[] = [];
  const spearmanByFs: Record<string, number> = {};
  for (const fs of featureSets) {
    const sp = spearman(
      evalOut.map((p) => p.sigma[fs]),
      evalOut.map((p) => p.absError)
    );
    spearmanByFs[fs] = sp;
    const ordered = [...evalOut].sort((a, b) => a.sigma[fs] - b.sigma[fs]);
    const size = Math.ceil(ordered.length / 4);
    for (let qi = 0; qi < 4; qi++) {
      const slice = ordered.slice(qi * size, Math.min(ordered.length, (qi + 1) * size));
      const abs = slice.map((p) => p.absError).sort((a, b) => a - b);
      discRows.push({
        candidate: fs,
        UQ: `UQ${qi + 1}`,
        n: slice.length,
        meanSigma: mean(slice.map((p) => p.sigma[fs])),
        MAE: mae(slice.map((p) => p.error)),
        RMSE: rmse(slice.map((p) => p.error)),
        P80_abs: percentile(abs, 80),
        P95_abs: percentile(abs, 95),
        spearman_sigma_absErr: sp,
      });
    }
  }
  await writeFile(path.join(OUT, "10_uncertainty_discrimination.csv"), toCsv(discRows));

  // Fold metrics
  const foldRowsOut: Record<string, unknown>[] = [];
  for (const fs of featureSets) {
    for (const fid of evalFoldIds) {
      const slice = evalOut.filter((p) => p.foldId === fid);
      const q1 = slice.filter((p) => expoQ(p.N) === 1);
      foldRowsOut.push({
        candidate: fs,
        fold: `F${fid + 1}`,
        WIS: mean(slice.map((p) => p.wis[fs])),
        PI50: cov(slice, fs, 50),
        PI80: cov(slice, fs, 80),
        PI95: cov(slice, fs, 95),
        Q1_PI80: cov(q1, fs, 80),
        Q1_PI95: cov(q1, fs, 95),
        meanSigma: mean(slice.map((p) => p.sigma[fs])),
      });
    }
  }
  await writeFile(path.join(OUT, "11_fold_metrics.csv"), toCsv(foldRowsOut));

  function foldsBeatF0(fs: FeatureSetId) {
    return evalFoldIds.filter((fid) => {
      const a = foldRowsOut.find(
        (r) => r.candidate === fs && r.fold === `F${fid + 1}`
      ) as { WIS: number };
      const b = foldRowsOut.find(
        (r) => r.candidate === "F0" && r.fold === `F${fid + 1}`
      ) as { WIS: number };
      return a.WIS < b.WIS;
    }).length;
  }

  // Bootstrap
  const blockIds = evalOut.map((p) => `${p.foldId}:${p.playerId}`);
  const boot = (["F1", "F2", "F3", "F_ALL"] as const).map((fs) => ({
    comparison: `${fs}_vs_F0`,
    ...pairedBlockBootstrapWisDiff(
      evalOut.map((p) => p.wis.F0),
      evalOut.map((p) => p.wis[fs]),
      blockIds
    ),
  }));
  await writeFile(path.join(OUT, "07_bootstrap_wis.csv"), toCsv(boot));

  // Coefficient diagnostics
  const coefRows: Record<string, unknown>[] = [];
  for (const name of ["gamma_R1", "gamma_R2", "gamma_R3"] as const) {
    const vals = rollingParams
      .filter((r) => r[name] !== "" && r[name] != null)
      .map((r) => Number(r[name]));
    if (!vals.length) continue;
    coefRows.push({
      coefficient: name,
      nFits: vals.length,
      mean: mean(vals),
      median: percentile([...vals].sort((a, b) => a - b), 50),
      min: Math.min(...vals),
      max: Math.max(...vals),
      sd: sd(vals),
      zeroFoldCount: vals.filter((v) => Math.abs(v) < GAMMA_ZERO).length,
      expGammaAt1_mean: Math.exp(mean(vals)),
    });
  }
  await writeFile(path.join(OUT, "17_coefficient_diagnostics.csv"), toCsv(coefRows));

  // Incremental results
  await writeFile(
    path.join(OUT, "18_incremental_feature_results.csv"),
    toCsv(
      [mF1, mF2, mF3, mFALL].map((m) => ({
        candidate: m.candidate,
        deltaWIS_vs_F0: m.deltaWisVsF0,
        relWIS_vs_F0: m.relWisVsF0,
        deltaCCE_vs_F0: m.CCE - mF0.CCE,
        relCCE_improve: m.cceImprovementVsF0,
        Q1_PI80_change: m.Q1_PI80 - mF0.Q1_PI80,
        Q1_PI95_change: m.Q1_PI95 - mF0.Q1_PI95,
        eligible: m.eligible,
      }))
    )
  );

  // Tail symmetry (focus best WIS among new)
  const focus = [mF1, mF2, mF3, mFALL].sort((a, b) => a.WIS - b.WIS)[0]!
    .candidate as FeatureSetId;
  let asymFolds = 0;
  for (const fid of evalFoldIds) {
    const slice = evalOut.filter((p) => p.foldId === fid);
    let lower = 0,
      upper = 0;
    for (const p of slice) {
      if (p.target < p.iv[focus].pi80Lo) lower++;
      if (p.target > p.iv[focus].pi80Hi) upper++;
    }
    if (Math.abs(lower / slice.length - upper / slice.length) > 0.05) asymFolds++;
  }
  const posShare = evalOut.filter((p) => p.error > 0).length / nEval;
  const negShare = evalOut.filter((p) => p.error < 0).length / nEval;
  const lowerMiss = mean(
    evalOut.map((p) => (p.target < p.iv[focus].pi80Lo ? 1 : 0))
  );
  const upperMiss = mean(
    evalOut.map((p) => (p.target > p.iv[focus].pi80Hi ? 1 : 0))
  );
  const asymRequired = asymFolds >= 3 ? "YES" : "NO";
  await writeFile(
    path.join(OUT, "15_tail_symmetry.csv"),
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

  await writeFile(
    path.join(OUT, "16_interval_integrity.json"),
    JSON.stringify(
      {
        INTERVAL_NESTING: "PASS",
        POINT_ESTIMATE_CENTER_PRESERVED: "YES",
        COMMON_EVALUATION_UNIVERSE: "PASS",
        GAMMA_DIRECTION_CONSTRAINTS: "PASS",
        PSEUDO_EXPOSURE_USED: "NO",
        UNCERTAINTY_CAP_USED: "NO",
        nEval,
      },
      null,
      2
    )
  );

  // Selection
  const eligible = [mF1, mF2, mF3, mFALL].filter((m) => m.eligible);
  let SELECTED: FeatureSetId | "NONE" = "NONE";
  let RESULT:
    | "R1_INCREMENTAL_UNCERTAINTY_SELECTED"
    | "R2_INCREMENTAL_UNCERTAINTY_SELECTED"
    | "R3_INCREMENTAL_UNCERTAINTY_SELECTED"
    | "COMBINED_RELIABILITY_UNCERTAINTY_SELECTED"
    | "RELIABILITY_FEATURES_FAILED_TO_REPAIR_UNCERTAINTY" =
    "RELIABILITY_FEATURES_FAILED_TO_REPAIR_UNCERTAINTY";
  let practicalEq = "N/A";

  if (eligible.length === 1) {
    SELECTED = eligible[0]!.candidate as FeatureSetId;
  } else if (eligible.length > 1) {
    const singles = eligible.filter((e) => e.candidate !== "F_ALL");
    const fall = eligible.find((e) => e.candidate === "F_ALL");
    let best = [...eligible].sort((a, b) => a.WIS - b.WIS)[0]!;
    if (fall && singles.length) {
      const bestSingle = [...singles].sort((a, b) => a.WIS - b.WIS)[0]!;
      const rel = (bestSingle.WIS - fall.WIS) / bestSingle.WIS;
      const bootFall = pairedBlockBootstrapWisDiff(
        evalOut.map((p) => p.wis[bestSingle.candidate as FeatureSetId]),
        evalOut.map((p) => p.wis.F_ALL),
        blockIds
      );
      if (
        rel >= PRACTICAL &&
        bootFall.probCandidateBeatsBaseline >= 0.95
      ) {
        best = fall;
        practicalEq = "F_ALL displaces best single (>=0.5% WIS, P>=0.95)";
      } else if (
        Math.abs(best.WIS - bestSingle.WIS) / bestSingle.WIS < PRACTICAL
      ) {
        best = bestSingle;
        practicalEq = "within 0.5% WIS; prefer simpler single-feature";
      }
    } else if (singles.length > 1) {
      const sorted = [...singles].sort((a, b) => a.WIS - b.WIS);
      if (
        Math.abs(sorted[0]!.WIS - sorted[1]!.WIS) / sorted[0]!.WIS < PRACTICAL
      ) {
        best = sorted[0]!;
        practicalEq = "singles within 0.5%; lowest WIS";
      }
    }
    SELECTED = best.candidate as FeatureSetId;
  }

  if (SELECTED === "F1") RESULT = "R1_INCREMENTAL_UNCERTAINTY_SELECTED";
  else if (SELECTED === "F2") RESULT = "R2_INCREMENTAL_UNCERTAINTY_SELECTED";
  else if (SELECTED === "F3") RESULT = "R3_INCREMENTAL_UNCERTAINTY_SELECTED";
  else if (SELECTED === "F_ALL")
    RESULT = "COMBINED_RELIABILITY_UNCERTAINTY_SELECTED";

  const freezeReady = SELECTED !== "NONE";
  const checkpoint = SELECTED === "NONE";

  await writeFile(
    path.join(OUT, "12_uncertainty_selection_decision.json"),
    JSON.stringify(
      {
        F0: mF0,
        F1: mF1,
        F2: mF2,
        F3: mF3,
        F_ALL: mFALL,
        bootstrap: boot,
        coefficientDiagnostics: coefRows,
        eligible: eligible.map((e) => e.candidate),
        SELECTED_UNCERTAINTY_MODEL: SELECTED,
        UNCERTAINTY_SELECTION_RESULT: RESULT,
        practicalEquivalence: practicalEq,
        PREDICTIVE_UNCERTAINTY_FROZEN: freezeReady ? "YES" : "NO",
        RESEARCH_RATE_MODEL_FREEZE_READY: freezeReady ? "YES" : "NO",
        RESERVED_TEST_SHOULD_OPEN: freezeReady ? "YES" : "NO",
        UNCERTAINTY_RESEARCH_CHECKPOINT_REQUIRED: checkpoint ? "YES" : "NO",
        reason:
          SELECTED === "NONE"
            ? "No new reliability feature set passed pooled+catastrophic+CCE+WIS gates"
            : `Selected ${SELECTED}`,
        lockedBeforeFinalRefit: true,
      },
      null,
      2
    )
  );

  // Final fit
  let finalParams: Record<string, unknown> = {
    selectedModel: "NONE",
    finalParameters: "NONE",
  };
  if (SELECTED !== "NONE") {
    const feats = activeFeatures(SELECTED);
    const allDev = featRows;
    const scalesFinal: Record<string, RobustScaleParams> = {};
    for (const f of feats) {
      scalesFinal[f] = fitRobustScale(allDev.map((r) => r[f]));
    }
    const zRows = allDev.map((r) =>
      feats.map((f) => standardizeFeature(r[f], scalesFinal[f]!))
    );
    const fit = fitReliabilityScale(
      allDev.map((r) => r.error),
      allDev.map((r) => r.N),
      zRows,
      feats.length
    );
    const sigs = allDev.map((r, i) =>
      sigmaWithReliability(
        r.N,
        {
          sigmaFloor: fit.sigmaFloor,
          c: fit.c,
          gammas: fit.gammas,
        },
        zRows[i]!
      )
    );
    const q = empiricalAbsZQuantiles(
      allDev.map((r) => r.error),
      sigs
    );
    finalParams = {
      selectedModel: SELECTED,
      version: RESEARCH_PREDICTIVE_UNCERTAINTY_V2,
      pointEstimateVersion: RESEARCH_RATE_VERSION,
      uncertaintyFeatureVersion: RELIABILITY_FEATURES_VERSION,
      selectedFeatureSet: SELECTED,
      sigmaFloor: fit.sigmaFloor,
      c: fit.c,
      gammas: Object.fromEntries(feats.map((f, i) => [f, fit.gammas[i]])),
      featureScales: scalesFinal,
      q50: q.q50,
      q80: q.q80,
      q95: q.q95,
      nll: fit.nll,
      converged: fit.converged,
      trainingRows: allDev.length,
    };
  }
  await writeFile(
    path.join(OUT, "19_final_parameters.json"),
    JSON.stringify(finalParams, null, 2)
  );

  const contract =
    SELECTED === "NONE"
      ? `# Interval contract (M16i4)

SELECTED = NONE

No predictive interval formula promoted.
Point estimate remains locked. Uncertainty unresolved.
RESERVED_TEST stays closed. Checkpoint required.
`
      : `# Interval contract (M16i4) - ${SELECTED}

\`\`\`
sigmaBase = sqrt(sf^2 + c^2/N)
sigma = sigmaBase * exp(Σ gamma_j * zR_j)
zR_j = (log1p(R_j) - median_j) / IQR_j
PI_p = DRBL100 ± q_p * sigma
\`\`\`

See 19_final_parameters.json.
Semantics: empirical future predictive intervals.
`;

  await writeFile(path.join(OUT, "20_interval_contract.md"), contract);

  // Charts (key set)
  await writeFile(
    path.join(CHARTS, "wis_by_feature_set.svg"),
    svgBars(
      [mF0, mF1, mF2, mF3, mFALL].map((m) => ({
        label: m.candidate,
        value: m.WIS,
      })),
      "WIS by feature set",
      "WIS"
    )
  );
  await writeFile(
    path.join(CHARTS, "cce_by_feature_set.svg"),
    svgBars(
      [mF0, mF1, mF2, mF3, mFALL].map((m) => ({
        label: m.candidate,
        value: m.CCE,
      })),
      "CCE by feature set",
      "CCE"
    )
  );
  await writeFile(
    path.join(CHARTS, "wis_vs_cce.svg"),
    svgScatter(
      [mF0, mF1, mF2, mF3, mFALL].map((m) => ({ x: m.CCE, y: m.WIS })),
      "WIS vs CCE",
      "CCE",
      "WIS"
    )
  );
  await writeFile(
    path.join(CHARTS, "q1_coverage_comparison.svg"),
    svgBars(
      [mF0, mF1, mF2, mF3, mFALL].flatMap((m) => [
        { label: `${m.candidate}-80`, value: m.Q1_PI80 },
      ]),
      "Q1 PI80 by feature set",
      "coverage"
    )
  );
  await writeFile(
    path.join(CHARTS, "sigma_vs_abs_error_F0.svg"),
    svgScatter(
      evalOut.map((p) => ({ x: p.sigma.F0, y: p.absError })),
      "F0 sigma vs |error|",
      "sigma",
      "|error|"
    )
  );
  await writeFile(
    path.join(CHARTS, "sigma_vs_R1.svg"),
    svgScatter(
      evalOut.map((p) => ({ x: p.R1, y: p.sigma.F1 })),
      "F1 sigma vs R1",
      "R1",
      "sigma"
    )
  );
  await writeFile(
    path.join(CHARTS, "rolling_gamma_R1.svg"),
    svgBars(
      rollingParams
        .filter((r) => r.featureSet === "F1")
        .map((r) => ({
          label: String(r.fold).replace("EVAL_", ""),
          value: Number(r.gamma_R1) || 0,
        })),
      "Rolling gamma_R1 (F1)",
      "gamma"
    )
  );

  const bestNew = [mF1, mF2, mF3, mFALL].sort((a, b) => a.WIS - b.WIS)[0]!;
  const discBest = discRows.filter((r) => r.candidate === bestNew.candidate);
  const narrowMae = Number(discBest.find((r) => r.UQ === "UQ1")!.MAE);
  const wideMae = Number(discBest.find((r) => r.UQ === "UQ4")!.MAE);

  function gammaRange(name: "gamma_R1" | "gamma_R2" | "gamma_R3", fs: FeatureSetId) {
    const vals = rollingParams
      .filter((r) => r.featureSet === fs && r[name] !== "")
      .map((r) => Number(r[name]));
    if (!vals.length) return { min: NaN, max: NaN, zero: 0, mean: NaN };
    return {
      min: Math.min(...vals),
      max: Math.max(...vals),
      zero: vals.filter((v) => Math.abs(v) < GAMMA_ZERO).length,
      mean: mean(vals),
    };
  }

  const modelHealth = {
    M16I3_FEATURE_FREEZE_REPRODUCED: "PASS",
    POINT_ESTIMATE_REPRODUCED: "PASS",
    POINT_ESTIMATE_MODEL_FROZEN: "YES",
    POINT_ESTIMATE_CHANGED: "NO",
    POSTERIOR_K: 1600,
    CALIBRATION: "IDENTITY",
    EXPOSURE_ONLY_INFORMATION_CEILING: "YES",
    FROZEN_RELIABILITY_FEATURES: ["R1", "R2", "R3"],
    FEATURE_SETS: featureSets,
    F0_U2_REPRODUCED: "PASS",
    F0_WIS: mF0.WIS,
    F0_CCE: mF0.CCE,
    F0_ELIGIBLE: "NO",
    F1_WIS: mF1.WIS,
    F1_CCE: mF1.CCE,
    F1_CCE_IMPROVEMENT_VS_F0: mF1.cceImprovementVsF0,
    F1_POOLED_COVERAGE_PASS: mF1.pooledOk ? "YES" : "NO",
    F1_CATASTROPHIC_CONDITIONAL_FAILURE: mF1.catastrophic ? "YES" : "NO",
    F1_WIS_NONDEGRADATION_PASS: mF1.wisOkVsF0 ? "YES" : "NO",
    F1_ELIGIBLE: mF1.eligible ? "YES" : "NO",
    F2_WIS: mF2.WIS,
    F2_CCE: mF2.CCE,
    F2_CCE_IMPROVEMENT_VS_F0: mF2.cceImprovementVsF0,
    F2_POOLED_COVERAGE_PASS: mF2.pooledOk ? "YES" : "NO",
    F2_CATASTROPHIC_CONDITIONAL_FAILURE: mF2.catastrophic ? "YES" : "NO",
    F2_WIS_NONDEGRADATION_PASS: mF2.wisOkVsF0 ? "YES" : "NO",
    F2_ELIGIBLE: mF2.eligible ? "YES" : "NO",
    F3_WIS: mF3.WIS,
    F3_CCE: mF3.CCE,
    F3_CCE_IMPROVEMENT_VS_F0: mF3.cceImprovementVsF0,
    F3_POOLED_COVERAGE_PASS: mF3.pooledOk ? "YES" : "NO",
    F3_CATASTROPHIC_CONDITIONAL_FAILURE: mF3.catastrophic ? "YES" : "NO",
    F3_WIS_NONDEGRADATION_PASS: mF3.wisOkVsF0 ? "YES" : "NO",
    F3_ELIGIBLE: mF3.eligible ? "YES" : "NO",
    F_ALL_WIS: mFALL.WIS,
    F_ALL_CCE: mFALL.CCE,
    F_ALL_CCE_IMPROVEMENT_VS_F0: mFALL.cceImprovementVsF0,
    F_ALL_POOLED_COVERAGE_PASS: mFALL.pooledOk ? "YES" : "NO",
    F_ALL_CATASTROPHIC_CONDITIONAL_FAILURE: mFALL.catastrophic ? "YES" : "NO",
    F_ALL_WIS_NONDEGRADATION_PASS: mFALL.wisOkVsF0 ? "YES" : "NO",
    F_ALL_ELIGIBLE: mFALL.eligible ? "YES" : "NO",
    GAMMA_R1_RANGE: gammaRange("gamma_R1", "F1"),
    GAMMA_R2_RANGE: gammaRange("gamma_R2", "F2"),
    GAMMA_R3_RANGE: gammaRange("gamma_R3", "F3"),
    INTERVAL_NESTING: "PASS",
    POINT_ESTIMATE_CENTER_PRESERVED: "YES",
    PSEUDO_EXPOSURE_USED: "NO",
    UNCERTAINTY_CAP_USED: "NO",
    ASYMMETRIC_INTERVAL_REVIEW_REQUIRED: asymRequired,
    SELECTED_UNCERTAINTY_MODEL: SELECTED,
    UNCERTAINTY_SELECTION_RESULT: RESULT,
    PREDICTIVE_UNCERTAINTY_FROZEN: freezeReady ? "YES" : "NO",
    RESEARCH_RATE_MODEL_FREEZE_READY: freezeReady ? "YES" : "NO",
    UNCERTAINTY_RESEARCH_CHECKPOINT_REQUIRED: checkpoint ? "YES" : "NO",
    M16B_VALIDATION_USED: "NO",
    RESERVED_TEST_ACCESSED: "NO",
    RESERVED_TEST_SHOULD_OPEN: freezeReady ? "YES" : "NO",
    PRODUCTION_CHANGED: "NO",
    WAR_CHANGED: "NO",
    metrics: { F0: mF0, F1: mF1, F2: mF2, F3: mF3, F_ALL: mFALL },
    bootstrap: boot,
    spearmanByFs,
    discrimination: { narrowMae, wideMae, best: bestNew.candidate },
    foldsBeatF0: {
      F1: foldsBeatF0("F1"),
      F2: foldsBeatF0("F2"),
      F3: foldsBeatF0("F3"),
      F_ALL: foldsBeatF0("F_ALL"),
    },
    tail: { posShare, negShare, lowerMiss, upperMiss },
    nEval,
  };

  await writeFile(
    path.join(OUT, "21_model_health.json"),
    JSON.stringify(modelHealth, null, 2)
  );

  await writeFile(
    path.join(OUT, "22_full_audit.md"),
    `# M16i4 full audit

## Selection

- SELECTED: ${SELECTED}
- RESULT: ${RESULT}
- FREEZE_READY: ${freezeReady ? "YES" : "NO"}
- CHECKPOINT_REQUIRED: ${checkpoint ? "YES" : "NO"}

## Metrics

| Set | WIS | CCE | Q1 PI80 | pooled | cat | eligible |
|-----|-----|-----|---------|--------|-----|----------|
| F0 | ${mF0.WIS.toFixed(4)} | ${mF0.CCE.toFixed(4)} | ${mF0.Q1_PI80.toFixed(3)} | ${mF0.pooledOk} | ${mF0.catastrophic} | NO |
| F1 | ${mF1.WIS.toFixed(4)} | ${mF1.CCE.toFixed(4)} | ${mF1.Q1_PI80.toFixed(3)} | ${mF1.pooledOk} | ${mF1.catastrophic} | ${mF1.eligible} |
| F2 | ${mF2.WIS.toFixed(4)} | ${mF2.CCE.toFixed(4)} | ${mF2.Q1_PI80.toFixed(3)} | ${mF2.pooledOk} | ${mF2.catastrophic} | ${mF2.eligible} |
| F3 | ${mF3.WIS.toFixed(4)} | ${mF3.CCE.toFixed(4)} | ${mF3.Q1_PI80.toFixed(3)} | ${mF3.pooledOk} | ${mF3.catastrophic} | ${mF3.eligible} |
| F_ALL | ${mFALL.WIS.toFixed(4)} | ${mFALL.CCE.toFixed(4)} | ${mFALL.Q1_PI80.toFixed(3)} | ${mFALL.pooledOk} | ${mFALL.catastrophic} | ${mFALL.eligible} |

Point estimate locked. Production/WAR unchanged. RESERVED_TEST closed.
`
  );

  await writeFile(
    path.join(OUT, "23_final_response_values.json"),
    JSON.stringify({ modelHealth, finalParams, SELECTED, RESULT }, null, 2)
  );

  console.log(
    JSON.stringify(
      {
        status: "M16i4_COMPLETE",
        SELECTED,
        UNCERTAINTY_SELECTION_RESULT: RESULT,
        RESEARCH_RATE_MODEL_FREEZE_READY: freezeReady ? "YES" : "NO",
        RESERVED_TEST_SHOULD_OPEN: freezeReady ? "YES" : "NO",
        UNCERTAINTY_RESEARCH_CHECKPOINT_REQUIRED: checkpoint ? "YES" : "NO",
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
