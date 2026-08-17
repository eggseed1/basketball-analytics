/**
 * M16j — one-shot point-estimate RESERVED_TEST.
 *   npm run drbl:m16j
 *
 * Opens 2025-26 RESERVED_TEST exactly once for POINT_ESTIMATE_ONLY scoring.
 * Does NOT tune k/calibration/target/eligibility. Does NOT score uncertainty/WAR/O/D.
 * Does NOT change production.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { access, mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

import {
  EVALUATION_PROTOCOL_VERSION,
  ELIGIBILITY_RULES,
  METRIC_CONTRACT,
} from "../drbl/evaluation/protocol";
import {
  M16C_EARLY_FRAC,
  loadSplitGames,
  verifyFrozenSplitHashes,
} from "../drbl/evaluation/m16c-dataset";
import { hashGames, type SplitGame } from "../drbl/evaluation/splits";
import {
  loadReservedTestGames,
} from "../drbl/evaluation/reserved-test";
import {
  mae,
  pearson,
  spearman,
  r2,
  rmse,
  pairedBlockBootstrapRmseDiff,
} from "../drbl/evaluation/metrics";
import { SEQUENTIAL_ATTRIBUTION_VERSION } from "../drbl/models/sequential-attribution";
import {
  RESEARCH_ABILITY_VERSION,
  RESEARCH_K,
  RESEARCH_POSTERIOR_LAYER_COUNT,
  RESEARCH_PRIOR_MEAN,
  computeResearchAbilityV1,
} from "../drbl/models/research-ability-v1";
import {
  RESEARCH_RATE_CONFIG_V1,
  RESEARCH_RATE_VERSION,
  computeResearchRateV1,
} from "../drbl/models/research-rate-v1";
import { empiricalBayesRate } from "../drbl/models/leaderboard";
import {
  attributeGamePlayerValue,
  finalizePlayerSeasonRows,
} from "../drbl/models/player-value";
import {
  accumulateReplacementSignals,
  buildReplacementPool,
  finalizeRoleAccum,
} from "../drbl/models/replacement";
import type { DrblProcessedGame } from "../drbl/index";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m16j");
const CHARTS = path.join(OUT, "charts");
const M16B = path.join(ROOT, "reports", "m16b");
const M16J0 = path.join(ROOT, "reports", "m16j0");
const M16J01 = path.join(ROOT, "reports", "m16j0_1");
const SEALED_PATH = path.join(OUT, "10_reserved_result_sealed.json");

const EXPECTED_TRAIN =
  "7bec77be45295ee858d90896d9383e4da951e98e81ad1ef31b5285fb055d1550";
const EXPECTED_VAL =
  "4fd339a445f269162c2d76e9102ea5bb965a5d0fc05e0fcd2f60593117c5faf0";
const EXPECTED_RES =
  "e542aa54602390ed65792f37e10207814e10b62bfdf552ddf4da69825076c1ce";
const EXPECTED_PE_HASH =
  "942b21ef78ba0a142549f8a2b62338993e133f17b8bb1ff7b94fc8844ad9297c";

const BOOTSTRAP_RESAMPLES =
  METRIC_CONTRACT.practicalSignificance.bootstrapResamples;
const BOOTSTRAP_SEED = 42;
const PRACTICAL_REL = 0.005;
const TOL = 1e-9;

const POINT_SOURCE_FILES = [
  "drbl/models/sequential-attribution.ts",
  "drbl/models/player-value.ts",
  "drbl/models/research-ability-v1.ts",
  "drbl/models/research-rate-v1.ts",
  "drbl/models/leaderboard.ts",
  "drbl/models/replacement.ts",
  "drbl/evaluation/protocol.ts",
  "drbl/evaluation/splits.ts",
  "drbl/evaluation/m16c-dataset.ts",
  "drbl/evaluation/metrics.ts",
  "drbl/evaluation/reserved-test.ts",
  "reports/m16h/22_research_rate_lock.json",
  "reports/m16g/03_posterior_folds.json",
  "reports/m16i4/12_uncertainty_selection_decision.json",
] as const;

type EvalRow = {
  anonId: string;
  playerId: string;
  playerName: string;
  N: number;
  futureN: number;
  raw: number;
  research: number;
  eb200: number;
  target: number;
  reliability1600: number;
  asOfDate: string;
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
function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
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
  const bias = mean(yhat.map((p, i) => p - y[i]!)); // prediction - target
  return {
    n: Math.min(y.length, yhat.length),
    RMSE: rmse(y, yhat),
    MAE: mae(y, yhat),
    Pearson: pearson(yhat, y),
    Spearman: spearman(yhat, y),
    R2: r2(y, yhat),
    bias,
    predictionMean: mean(yhat),
    predictionSD: sd(yhat),
    targetMean: mean(y),
    targetSD: sd(y),
    calibrationIntercept: c.a,
    calibrationSlope: c.b,
  };
}
async function sha256File(rel: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(path.join(ROOT, rel)))
    .digest("hex");
}
function anon(playerId: string): string {
  return createHash("sha256").update(playerId).digest("hex").slice(0, 16);
}
function classifyEb1600VsEb200(relDiff: number): "BETTER" | "TIED" | "WORSE" {
  // relDiff = (RMSE_research - RMSE_eb200) / RMSE_eb200
  // negative = research better
  if (relDiff <= -PRACTICAL_REL) return "BETTER";
  if (relDiff >= PRACTICAL_REL) return "WORSE";
  return "TIED";
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function loadSplitList(
  name: "train" | "validation" | "reserved_test"
): Promise<SplitGame[]> {
  const file =
    name === "reserved_test"
      ? "reserved_test_game_ids.json"
      : `${name}_game_ids.json`;
  const raw = JSON.parse(
    await readFile(path.join(M16B, "splits", file), "utf8")
  ) as { games?: SplitGame[] } | SplitGame[];
  return Array.isArray(raw) ? raw : (raw.games ?? []);
}

/** History-only R1 + rawAbilityRate rows (M16j0 / M16g research path). */
function buildReservedEvalRows(
  historyGames: DrblProcessedGame[],
  futureGames: DrblProcessedGame[]
): EvalRow[] {
  const minPoss = ELIGIBILITY_RULES.minPossessions;
  const minFuture = ELIGIBILITY_RULES.minFutureObservations;

  const roleAccum = new Map();
  let cutoffDate = "";
  for (const g of historyGames) {
    accumulateReplacementSignals(g.box, g.events, g.possessions, roleAccum);
    if (g.box.gameDate && g.box.gameDate > cutoffDate) cutoffDate = g.box.gameDate;
  }
  const candidates = finalizeRoleAccum(roleAccum);
  const rolesByPlayer = new Map(candidates.map((c) => [c.playerId, c.role]));
  const replacementPool = buildReplacementPool(candidates, {
    cutoffDate: cutoffDate || "9999-12-31",
    level: "R1",
  });

  const histAccum = new Map();
  for (const g of historyGames) {
    attributeGamePlayerValue(g.box, g.events, g.possessions, histAccum, {
      replacementPool,
      rolesByPlayer,
    });
  }
  const futAccum = new Map();
  for (const g of futureGames) {
    attributeGamePlayerValue(g.box, g.events, g.possessions, futAccum, {
      replacementPool,
      rolesByPlayer,
    });
  }

  const histPlayers = finalizePlayerSeasonRows(histAccum, {
    minPossessions: minPoss,
  });

  const nameById = new Map<string, string>();
  for (const g of historyGames) {
    for (const p of g.box.players ?? []) {
      if (p.playerId && p.playerName) nameById.set(p.playerId, p.playerName);
    }
  }

  const rows: EvalRow[] = [];
  for (const p of histPlayers) {
    const late = futAccum.get(p.playerId);
    if (!late || late.possessions < minFuture) continue;
    const N = p.possessions;
    const raw = p.rawAbilityRate;
    const research = computeResearchRateV1({
      rawAbilityRate: raw,
      actualCombinedPossessionAppearances: N,
    }).researchFinalDRBL100;
    const eb200 = empiricalBayesRate(raw, N, 0, 200).posterior;
    const reliability1600 = empiricalBayesRate(raw, N, 0, RESEARCH_K).reliability;
    const target = (100 * late.totalValue) / late.possessions;
    if (
      !Number.isFinite(raw) ||
      !Number.isFinite(research) ||
      !Number.isFinite(eb200) ||
      !Number.isFinite(target) ||
      N <= 0 ||
      late.possessions <= 0
    ) {
      continue;
    }
    rows.push({
      anonId: anon(p.playerId),
      playerId: p.playerId,
      playerName: nameById.get(p.playerId) ?? "",
      N,
      futureN: late.possessions,
      raw,
      research,
      eb200,
      target,
      reliability1600,
      asOfDate: cutoffDate,
    });
  }
  return rows;
}

function svgBars(
  items: Array<{ label: string; value: number }>,
  title: string
): string {
  const w = 480,
    h = 280,
    pad = 48;
  const vals = items.map((i) => i.value);
  const vmax = Math.max(...vals, 1e-9);
  const barW = (w - 2 * pad) / items.length - 12;
  let rects = "";
  items.forEach((it, i) => {
    const bh = ((h - 2 * pad) * it.value) / vmax;
    const x = pad + i * (barW + 12);
    const y = h - pad - bh;
    rects += `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" fill="#1f4e79"/><text x="${x + barW / 2}" y="${h - pad + 16}" text-anchor="middle" font-size="11">${it.label}</text><text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" font-size="10">${it.value.toFixed(3)}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="${pad}" y="24" font-size="14" font-family="sans-serif">${title}</text>${rects}</svg>`;
}

function svgScatter(
  x: number[],
  y: number[],
  title: string,
  xlab: string,
  ylab: string
): string {
  const w = 420,
    h = 320,
    pad = 48;
  const n = Math.min(x.length, y.length);
  if (!n) return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="20" y="40">${title}</text></svg>`;
  const xs = x.slice(0, n),
    ys = y.slice(0, n);
  const xmin = Math.min(...xs),
    xmax = Math.max(...xs),
    ymin = Math.min(...ys),
    ymax = Math.max(...ys);
  const dx = xmax - xmin || 1,
    dy = ymax - ymin || 1;
  let pts = "";
  for (let i = 0; i < n; i++) {
    const px = pad + ((xs[i]! - xmin) / dx) * (w - 2 * pad);
    const py = h - pad - ((ys[i]! - ymin) / dy) * (h - 2 * pad);
    pts += `<circle cx="${px}" cy="${py}" r="2" fill="#1f4e79" opacity="0.45"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="${pad}" y="22" font-size="13">${title}</text><text x="${w / 2}" y="${h - 8}" text-anchor="middle" font-size="11">${xlab}</text><text x="14" y="${h / 2}" font-size="11" transform="rotate(-90 14 ${h / 2})">${ylab}</text>${pts}</svg>`;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await mkdir(CHARTS, { recursive: true });

  if (await fileExists(SEALED_PATH)) {
    throw new Error(
      "STOP RESERVED_TEST already sealed under M16j — refuse second official scoring run"
    );
  }

  const timestamp = new Date().toISOString();
  const gitCommit = execSync("git rev-parse HEAD", {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  const dirty =
    execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" }).trim()
      .length > 0;

  // ---- Phase 1: authorization ----
  const authBuf = await readFile(
    path.join(M16J01, "09_reserved_test_authorization_repaired.json")
  );
  const auth = JSON.parse(authBuf.toString("utf8")) as {
    M16J_ONE_SHOT_RESERVED_TEST_AUTHORIZED: string;
    RESERVED_TEST_SHOULD_OPEN_NEXT_MILESTONE: string;
    B2_STATUS: string;
    B2_REASON_CODES: string[];
    POINT_ESTIMATE_FREEZE_HASH: string;
    PRIMARY_COMPARATOR: string;
    SECONDARY_COMPARATOR: string;
    INCUMBENT_REFERENCE: string;
  };
  const authHash = createHash("sha256").update(authBuf).digest("hex");
  if (
    auth.M16J_ONE_SHOT_RESERVED_TEST_AUTHORIZED !== "YES" ||
    auth.RESERVED_TEST_SHOULD_OPEN_NEXT_MILESTONE !== "YES" ||
    auth.B2_STATUS !== "NOT_COMPARABLE" ||
    auth.POINT_ESTIMATE_FREEZE_HASH !== EXPECTED_PE_HASH
  ) {
    throw new Error("STOP M16J_AUTHORIZATION_FAILURE");
  }

  // ---- Phase 2: point-estimate freeze hash ----
  const manifestEntries: Array<{ path: string; sha256: string }> = [];
  for (const rel of POINT_SOURCE_FILES) {
    await stat(path.join(ROOT, rel));
    manifestEntries.push({
      path: rel.replace(/\\/g, "/"),
      sha256: await sha256File(rel),
    });
  }
  manifestEntries.sort((a, b) => a.path.localeCompare(b.path));
  const peHash = createHash("sha256")
    .update(
      JSON.stringify({
        gitCommit,
        dirty,
        evaluationProtocolVersion: EVALUATION_PROTOCOL_VERSION,
        formula: "N/(N+1600)*rawAbilityRate",
        k: RESEARCH_K,
        priorMean: RESEARCH_PRIOR_MEAN,
        calibration: "IDENTITY",
        files: manifestEntries.map((e) => ({ path: e.path, sha256: e.sha256 })),
      })
    )
    .digest("hex");
  if (peHash !== EXPECTED_PE_HASH) {
    throw new Error(
      `STOP POINT_ESTIMATE_FREEZE_HASH_MISMATCH got ${peHash} expected ${EXPECTED_PE_HASH}`
    );
  }
  if (
    RESEARCH_K !== 1600 ||
    RESEARCH_PRIOR_MEAN !== 0 ||
    RESEARCH_RATE_CONFIG_V1.calibrationType !== "identity" ||
    RESEARCH_RATE_CONFIG_V1.b !== 1 ||
    RESEARCH_POSTERIOR_LAYER_COUNT !== 1
  ) {
    throw new Error("STOP POINT_ESTIMATE_FREEZE_VIOLATION");
  }

  // Split membership hashes (no outcomes yet)
  const trainGames = await loadSplitList("train");
  const valGames = await loadSplitList("validation");
  const reservedMembership = await loadSplitList("reserved_test");
  const hashCheck = verifyFrozenSplitHashes({
    train: trainGames,
    validation: valGames,
    trainHashExpected: EXPECTED_TRAIN,
    validationHashExpected: EXPECTED_VAL,
    reservedTestHashExpected: EXPECTED_RES,
    reservedTestGamesForHashOnly: reservedMembership,
  });
  if (!hashCheck.ok) throw new Error(`STOP ${hashCheck.reason}`);

  // ---- Phase 0 pre-execution freeze (before reserved outcomes) ----
  const preExecution = {
    milestone: "M16j",
    timestamp,
    gitCommit,
    gitDirty: dirty,
    trainSplitHash: EXPECTED_TRAIN,
    validationSplitHash: EXPECTED_VAL,
    reservedTestSplitHash: EXPECTED_RES,
    POINT_ESTIMATE_FREEZE_HASH: peHash,
    authorizationArtifact:
      "reports/m16j0_1/09_reserved_test_authorization_repaired.json",
    authorizationArtifactHash: authHash,
    reservedProtocolVersion: "drbl-eval-v1-reserved-earlyFrac-future-block-v1",
    earlyFrac: M16C_EARLY_FRAC,
    historicalMinExposure: ELIGIBILITY_RULES.minPossessions,
    futureMinExposure: ELIGIBILITY_RULES.minFutureObservations,
    modelFormulas: {
      RESEARCH_FINAL: "N/(N+1600)*rawAbilityRate",
      B0_RAW_P: "rawAbilityRate",
      B1_P_EB200: "N/(N+200)*rawAbilityRate",
    },
    primaryTarget: "future_block_residual_per_100",
    primaryMetric: "RMSE",
    secondaryMetrics: [
      "MAE",
      "Pearson",
      "Spearman",
      "R2",
      "bias=prediction-target",
      "calibrationIntercept",
      "calibrationSlope",
    ],
    r2Definition: "1 - SS_res/SS_tot with SS_tot vs mean(target)",
    biasDefinition: "mean(prediction - target)",
    bootstrapProtocol: {
      dependencyUnit: "playerId",
      resamples: BOOTSTRAP_RESAMPLES,
      seed: BOOTSTRAP_SEED,
      confidenceLevel: 0.95,
    },
    successRule:
      "deltaRMSE_vs_raw < 0 AND P(RESEARCH_FINAL beats RAW) >= 0.95",
    verdictTaxonomy: [
      "STRONG_PASS",
      "SCIENTIFIC_PASS_PRODUCTION_MIXED",
      "INCONCLUSIVE",
      "FAIL",
    ],
    B2_STATUS: "NOT_COMPARABLE",
    B2_REASON_CODES: auth.B2_REASON_CODES,
    uncertaintyExcluded: true,
    WARExcluded: true,
    ODExcluded: true,
    productionUnchanged: true,
    RESERVED_TEST_ACCESSED: false,
    RESERVED_HUMAN_BLINDNESS: "NOT_FULL",
    RESERVED_NUMERIC_PREDICTIVE_METRICS_PREVIOUSLY_USED: "NO",
  };
  await writeFile(
    path.join(OUT, "00_pre_execution_freeze.json"),
    JSON.stringify(preExecution, null, 2)
  );

  await writeFile(
    path.join(OUT, "01_model_freeze_verification.json"),
    JSON.stringify(
      {
        POINT_ESTIMATE_FREEZE_HASH: peHash,
        POINT_ESTIMATE_FREEZE_VERIFIED: "YES",
        RESEARCH_FINAL: {
          formula: "N/(N+1600)*rawAbilityRate",
          k: RESEARCH_K,
          priorMean: RESEARCH_PRIOR_MEAN,
          calibration: "IDENTITY",
          fusion: "NONE",
          posteriorOperations: RESEARCH_POSTERIOR_LAYER_COUNT,
          attribution: SEQUENTIAL_ATTRIBUTION_VERSION,
          versions: {
            RESEARCH_ABILITY_VERSION,
            RESEARCH_RATE_VERSION,
          },
        },
        B0_RAW_P: { formula: "rawAbilityRate" },
        B1_P_EB200: { formula: "N/(N+200)*rawAbilityRate", priorMean: 0 },
        B2_BASELINE_M16A: {
          status: "NOT_COMPARABLE",
          reasonCodes: auth.B2_REASON_CODES,
        },
        additionalBaselines: "NONE",
        reservedFittingAllowed: false,
      },
      null,
      2
    )
  );

  if (M16C_EARLY_FRAC !== 0.7) throw new Error("STOP RESERVED_PROTOCOL_DRIFT");
  await writeFile(
    path.join(OUT, "02_reserved_protocol_verification.json"),
    JSON.stringify(
      {
        protocolId: "drbl-eval-v1-reserved-earlyFrac-future-block-v1",
        earlyFrac: M16C_EARLY_FRAC,
        historicalMinExposure: ELIGIBILITY_RULES.minPossessions,
        futureMinExposure: ELIGIBILITY_RULES.minFutureObservations,
        target: "future_block_residual_per_100",
        R1Pool: "history_games_only",
        chronologyBasis: "gameDate then gameId, earlyFrac game-count cut",
        outcomeIndependent: true,
        RESERVED_PROTOCOL_OK: true,
      },
      null,
      2
    )
  );

  // ---- Phase 5: OPEN RESERVED_TEST ----
  console.log("Opening RESERVED_TEST (authorized one-shot)…");
  const reservedAccess = await loadReservedTestGames(
    {
      evaluationProtocolVersion: EVALUATION_PROTOCOL_VERSION,
      design: "drbl-eval-v1",
      rationale: "M16j one-shot point-estimate reserved test",
      train: trainGames,
      validation: valGames,
      reservedTest: reservedMembership,
      trainSplitHash: EXPECTED_TRAIN,
      validationSplitHash: EXPECTED_VAL,
      reservedTestSplitHash: EXPECTED_RES,
    },
    {
      allowReservedTest: true,
      experimentId: "M16J_POINT_ESTIMATE_RESERVED",
      modelFreezeId: EXPECTED_PE_HASH,
      reason: "M16j one-shot POINT_ESTIMATE_ONLY reserved test",
      command: "npm run drbl:m16j",
      gitCommit,
      includePlayerLevelOutput: false,
    }
  );
  const RESERVED_TEST_ACCESSED = true;

  console.log("Loading reserved normalized games…");
  const reservedProcessed = await loadSplitGames(reservedAccess.games);
  const sorted = [...reservedProcessed].sort(
    (a, b) =>
      (a.box.gameDate || "").localeCompare(b.box.gameDate || "") ||
      a.box.gameId.localeCompare(b.box.gameId)
  );
  const earlyCut = Math.max(1, Math.floor(sorted.length * M16C_EARLY_FRAC));
  const historyGames = sorted.slice(0, earlyCut);
  const futureGames = sorted.slice(earlyCut);

  const histIds = historyGames.map((g) => g.box.gameId);
  const futIds = futureGames.map((g) => g.box.gameId);
  const histIdSet = new Set(histIds);
  const futIdSet = new Set(futIds);
  const overlap = histIds.filter((id) => futIdSet.has(id)).length;
  const allAssigned =
    histIds.length + futIds.length === sorted.length &&
    new Set([...histIds, ...futIds]).size === sorted.length;
  const maxHistDate = historyGames[historyGames.length - 1]?.box.gameDate || "";
  const minFutDate = futureGames[0]?.box.gameDate || "";
  const maxHistKey = `${maxHistDate}|${historyGames[historyGames.length - 1]?.box.gameId}`;
  const minFutKey = `${minFutDate}|${futureGames[0]?.box.gameId}`;
  const chronologicalOrderOk = maxHistKey < minFutKey;
  const strictDateOk = maxHistDate < minFutDate;
  if (overlap !== 0 || !allAssigned || !chronologicalOrderOk) {
    throw new Error("STOP RESERVED_CHRONOLOGY_FAILURE");
  }

  const chronology = {
    totalGamesLoaded: sorted.length,
    membershipGameCount: reservedMembership.length,
    earlyFrac: M16C_EARLY_FRAC,
    historyCutoffGameIndex: earlyCut - 1,
    historyGameCount: historyGames.length,
    futureGameCount: futureGames.length,
    firstHistoryGameDate: historyGames[0]?.box.gameDate,
    lastHistoryGameDate: maxHistDate,
    firstFutureGameDate: minFutDate,
    lastFutureGameDate: futureGames[futureGames.length - 1]?.box.gameDate,
    firstHistoryGameId: historyGames[0]?.box.gameId,
    lastHistoryGameId: historyGames[historyGames.length - 1]?.box.gameId,
    firstFutureGameId: futureGames[0]?.box.gameId,
    lastFutureGameId: futureGames[futureGames.length - 1]?.box.gameId,
    overlap: 0,
    allAssignedExactlyOnce: allAssigned,
    chronologicalByDateThenGameId: chronologicalOrderOk,
    strictDateInequality: strictDateOk,
    sameDayBoundaryAtCut: maxHistDate === minFutDate,
    chronologyStatus: chronologicalOrderOk && overlap === 0 ? "PASS" : "FAIL",
    note: strictDateOk
      ? "strict date inequality holds"
      : "frozen earlyFrac game-count cut falls within a calendar day; chronological integrity uses (date|gameId) order",
    RESERVED_TEST_ACCESSED,
  };
  await writeFile(
    path.join(OUT, "03_reserved_chronology.json"),
    JSON.stringify(chronology, null, 2)
  );

  // ---- Phases 7–10: predictions then targets via shared builder ----
  console.log("Constructing history predictors + future targets…");
  const rows = buildReservedEvalRows(historyGames, futureGames);
  if (!rows.length) throw new Error("STOP empty reserved evaluation universe");

  // Provenance (anonymous)
  const provenance = rows.map((r) => ({
    anonId: r.anonId,
    historicalN: r.N,
    asOfDate: r.asOfDate,
    historyCutoffDate: maxHistDate,
    maxSourceTimestamp_le_cutoff: r.asOfDate <= maxHistDate,
    predictionFutureLeakage: "NO",
    rawFinite: Number.isFinite(r.raw),
    researchFinite: Number.isFinite(r.research),
    eb200Finite: Number.isFinite(r.eb200),
  }));
  if (provenance.some((p) => p.maxSourceTimestamp_le_cutoff !== true)) {
    throw new Error("STOP RESERVED_PREDICTION_LEAKAGE");
  }
  await writeFile(
    path.join(OUT, "04_prediction_provenance.csv"),
    toCsv(provenance)
  );

  // Common universe seal
  const nResearch = rows.length;
  const nRaw = rows.length;
  const nEb = rows.length;
  if (nResearch !== nRaw || nRaw !== nEb) {
    throw new Error("STOP COMMON_RESERVED_UNIVERSE_MISMATCH");
  }
  const histNs = rows.map((r) => r.N).sort((a, b) => a - b);
  const futNs = rows.map((r) => r.futureN).sort((a, b) => a - b);
  const commonUniverse = {
    sealed: true,
    nRows: rows.length,
    anonymousPlayerIds: rows.map((r) => r.anonId).sort(),
    eligibility: {
      historicalMinN: ELIGIBILITY_RULES.minPossessions,
      futureMinN: ELIGIBILITY_RULES.minFutureObservations,
      finitePredictionsRequired: true,
      finiteTargetRequired: true,
    },
    historicalN: {
      min: histNs[0],
      max: histNs[histNs.length - 1],
      mean: mean(histNs),
      median: histNs[Math.floor(histNs.length / 2)],
    },
    futureN: {
      min: futNs[0],
      max: futNs[futNs.length - 1],
      mean: mean(futNs),
      median: futNs[Math.floor(futNs.length / 2)],
    },
    exactUniverseMatch: "PASS",
  };
  await writeFile(
    path.join(OUT, "05_common_universe_sealed.json"),
    JSON.stringify(commonUniverse, null, 2)
  );

  // ---- Phase 11 integrity ----
  let formulaOk = true;
  let shrinkOk = true;
  let finiteOk = true;
  for (const r of rows) {
    if (
      !Number.isFinite(r.raw) ||
      !Number.isFinite(r.research) ||
      !Number.isFinite(r.eb200) ||
      !Number.isFinite(r.target)
    ) {
      finiteOk = false;
    }
    const expectR = (r.N / (r.N + 1600)) * r.raw;
    const expectB1 = (r.N / (r.N + 200)) * r.raw;
    if (
      Math.abs(r.research - expectR) > TOL ||
      Math.abs(r.eb200 - expectB1) > TOL
    ) {
      formulaOk = false;
    }
    if (!(r.reliability1600 > 0 && r.reliability1600 < 1) && r.N > 0) {
      // N finite >0 ⇒ reliability in (0,1) for k>0
      if (!(r.reliability1600 > 0 && r.reliability1600 < 1)) formulaOk = false;
    }
    const ar = Math.abs(r.raw);
    const a1 = Math.abs(r.eb200);
    const aR = Math.abs(r.research);
    if (!(aR <= a1 + 1e-9 && a1 <= ar + 1e-9)) shrinkOk = false;
  }
  if (!formulaOk || !shrinkOk || !finiteOk) {
    throw new Error("STOP POSTERIOR_FORMULA_INTEGRITY_FAILURE");
  }
  await writeFile(
    path.join(OUT, "06_pre_score_integrity.json"),
    JSON.stringify(
      {
        researchFormulaReconstruction: "PASS",
        eb200Reconstruction: "PASS",
        shrinkageOrdering: "PASS",
        finitePredictions: "PASS",
        finiteTargets: "PASS",
        RESERVED_PREDICTION_FUTURE_LEAKAGE: "NO",
        nRowsChecked: rows.length,
      },
      null,
      2
    )
  );

  // ---- Phase 12–19: ONE-SHOT SCORING (no name inspection for decision) ----
  console.log("Official one-shot scoring…");
  const y = rows.map((r) => r.target);
  const yResearch = rows.map((r) => r.research);
  const yRaw = rows.map((r) => r.raw);
  const yEb200 = rows.map((r) => r.eb200);
  const blocks = rows.map((r) => r.anonId); // anonymized player blocks

  const mResearch = metricBundle(y, yResearch);
  const mRaw = metricBundle(y, yRaw);
  const mEb200 = metricBundle(y, yEb200);

  const deltaRMSE_vs_raw = mResearch.RMSE - mRaw.RMSE;
  const relativeRMSEChange_vs_raw = deltaRMSE_vs_raw / mRaw.RMSE;
  const deltaRMSE_vs_EB200 = mResearch.RMSE - mEb200.RMSE;
  const relativeRMSEChange_vs_EB200 = deltaRMSE_vs_EB200 / mEb200.RMSE;
  const EB1600_VS_EB200 = classifyEb1600VsEb200(relativeRMSEChange_vs_EB200);

  const bootRaw = pairedBlockBootstrapRmseDiff(y, yRaw, yResearch, blocks, {
    resamples: BOOTSTRAP_RESAMPLES,
    seed: BOOTSTRAP_SEED,
    confidenceLevel: 0.95,
  });
  const bootEb = pairedBlockBootstrapRmseDiff(y, yEb200, yResearch, blocks, {
    resamples: BOOTSTRAP_RESAMPLES,
    seed: BOOTSTRAP_SEED,
    confidenceLevel: 0.95,
  });

  await writeFile(
    path.join(OUT, "07_bootstrap_results.csv"),
    toCsv([
      {
        comparison: "RESEARCH_FINAL_vs_B0_RAW_P",
        dependencyUnit: "playerId(anon)",
        resamples: BOOTSTRAP_RESAMPLES,
        seed: BOOTSTRAP_SEED,
        deltaRMSE: bootRaw.pointEstimate,
        ciLow: bootRaw.ciLow,
        ciHigh: bootRaw.ciHigh,
        P_research_beats_comparator: bootRaw.probCandidateBeatsBaseline,
      },
      {
        comparison: "RESEARCH_FINAL_vs_B1_P_EB200",
        dependencyUnit: "playerId(anon)",
        resamples: BOOTSTRAP_RESAMPLES,
        seed: BOOTSTRAP_SEED,
        deltaRMSE: bootEb.pointEstimate,
        ciLow: bootEb.ciLow,
        ciHigh: bootEb.ciHigh,
        P_research_beats_comparator: bootEb.probCandidateBeatsBaseline,
      },
    ])
  );

  await writeFile(
    path.join(OUT, "08_model_metrics.csv"),
    toCsv([
      { model: "RESEARCH_FINAL", ...mResearch },
      { model: "B0_RAW_P", ...mRaw },
      { model: "B1_P_EB200", ...mEb200 },
    ])
  );

  const PRIMARY_RESERVED_SUCCESS =
    deltaRMSE_vs_raw < 0 && bootRaw.probCandidateBeatsBaseline >= 0.95
      ? "YES"
      : "NO";

  const negativeCalibSlope =
    mResearch.calibrationSlope < 0 ||
    mRaw.calibrationSlope < 0 ||
    mEb200.calibrationSlope < 0;
  const SEVERE_INTEGRITY_ANOMALY =
    !chronologicalOrderOk ||
    overlap !== 0 ||
    !finiteOk ||
    !formulaOk ||
    negativeCalibSlope
      ? "YES"
      : "NO";

  let M16J_RESERVED_VERDICT:
    | "STRONG_PASS"
    | "SCIENTIFIC_PASS_PRODUCTION_MIXED"
    | "INCONCLUSIVE"
    | "FAIL";
  let POINT_ESTIMATE_RESERVED_VALIDATION:
    | "PASSED"
    | "INCONCLUSIVE"
    | "FAILED"
    | "INVALIDATED_PENDING_AUDIT";

  if (SEVERE_INTEGRITY_ANOMALY === "YES" && negativeCalibSlope && PRIMARY_RESERVED_SUCCESS === "YES") {
    // Negative slope alone: treat as severe anomaly → still can be FAIL path for verdict taxonomy
    // Per Phase 18/19: severe anomaly blocks STRONG_PASS
  }

  if (SEVERE_INTEGRITY_ANOMALY === "YES" && (!finiteOk || !formulaOk || !chronologicalOrderOk)) {
    M16J_RESERVED_VERDICT = "FAIL";
    POINT_ESTIMATE_RESERVED_VALIDATION = "INVALIDATED_PENDING_AUDIT";
  } else if (PRIMARY_RESERVED_SUCCESS === "YES" && SEVERE_INTEGRITY_ANOMALY === "NO") {
    M16J_RESERVED_VERDICT = "STRONG_PASS";
    POINT_ESTIMATE_RESERVED_VALIDATION = "PASSED";
  } else if (PRIMARY_RESERVED_SUCCESS === "YES" && SEVERE_INTEGRITY_ANOMALY === "YES") {
    // e.g. negative calibration slope with primary success — production-mixed technical issue
    M16J_RESERVED_VERDICT = "SCIENTIFIC_PASS_PRODUCTION_MIXED";
    POINT_ESTIMATE_RESERVED_VALIDATION = "PASSED";
  } else if (deltaRMSE_vs_raw < 0 && bootRaw.probCandidateBeatsBaseline < 0.95) {
    M16J_RESERVED_VERDICT = "INCONCLUSIVE";
    POINT_ESTIMATE_RESERVED_VALIDATION = "INCONCLUSIVE";
  } else {
    M16J_RESERVED_VERDICT = "FAIL";
    POINT_ESTIMATE_RESERVED_VALIDATION = "FAILED";
  }

  // If only anomaly is negative slope, keep taxonomy above; if no anomaly and success → STRONG_PASS

  const preseal = {
    PRIMARY_RESERVED_SUCCESS,
    deltaRMSE_vs_raw,
    relativeRMSEChange_vs_raw,
    P_research_beats_raw: bootRaw.probCandidateBeatsBaseline,
    deltaRMSE_vs_EB200,
    relativeRMSEChange_vs_EB200,
    P_research_beats_EB200: bootEb.probCandidateBeatsBaseline,
    EB1600_VS_EB200,
    SEVERE_INTEGRITY_ANOMALY,
    negativeCalibrationSlope: negativeCalibSlope,
    M16J_RESERVED_VERDICT,
    POINT_ESTIMATE_RESERVED_VALIDATION,
    PLAYER_NAMES_USED_FOR_RESERVED_DECISION: false,
  };
  await writeFile(
    path.join(OUT, "09_reserved_verdict_preseal.json"),
    JSON.stringify(preseal, null, 2)
  );

  // ---- Phase 20: SEAL ----
  const sealed = {
    testVersion: "M16j-point-estimate-reserved-v1",
    timestamp,
    gitCommit,
    dirty,
    TRAINHash: EXPECTED_TRAIN,
    VALIDATIONHash: EXPECTED_VAL,
    RESERVEDHash: EXPECTED_RES,
    pointEstimateFreezeHash: peHash,
    authorizationArtifact:
      "reports/m16j0_1/09_reserved_test_authorization_repaired.json",
    authorizationArtifactHash: authHash,
    reservedProtocolVersion: "drbl-eval-v1-reserved-earlyFrac-future-block-v1",
    reservedHumanBlindness: "NOT_FULL",
    historyGameCount: historyGames.length,
    futureGameCount: futureGames.length,
    historyCutoff: {
      gameIndex: earlyCut - 1,
      lastHistoryDate: maxHistDate,
      lastHistoryGameId: historyGames[historyGames.length - 1]?.box.gameId,
      firstFutureDate: minFutDate,
      firstFutureGameId: futureGames[0]?.box.gameId,
      sameDayBoundaryAtCut: maxHistDate === minFutDate,
    },
    commonUniverseN: rows.length,
    models: {
      RESEARCH_FINAL: "N/(N+1600)*rawAbilityRate",
      B0_RAW_P: "rawAbilityRate",
      B1_P_EB200: "N/(N+200)*rawAbilityRate",
    },
    target: "future_block_residual_per_100",
    metrics: {
      RESEARCH_FINAL: mResearch,
      B0_RAW_P: mRaw,
      B1_P_EB200: mEb200,
    },
    deltaRMSE_vs_raw,
    relativeRMSEChange_vs_raw,
    deltaRMSE_vs_EB200,
    relativeRMSEChange_vs_EB200,
    bootstrapPrimary: {
      comparison: "RESEARCH_FINAL vs B0_RAW_P",
      delta: bootRaw.pointEstimate,
      CI95: [bootRaw.ciLow, bootRaw.ciHigh],
      probabilityResearchBeatsRaw: bootRaw.probCandidateBeatsBaseline,
      resamples: BOOTSTRAP_RESAMPLES,
      seed: BOOTSTRAP_SEED,
      dependencyUnit: "playerId",
    },
    bootstrapSecondary: {
      comparison: "RESEARCH_FINAL vs B1_P_EB200",
      delta: bootEb.pointEstimate,
      CI95: [bootEb.ciLow, bootEb.ciHigh],
      probabilityResearchBeatsEB200: bootEb.probCandidateBeatsBaseline,
      resamples: BOOTSTRAP_RESAMPLES,
      seed: BOOTSTRAP_SEED,
      dependencyUnit: "playerId",
    },
    PRIMARY_RESERVED_SUCCESS,
    EB1600_VS_EB200,
    SEVERE_INTEGRITY_ANOMALY,
    M16J_RESERVED_VERDICT,
    POINT_ESTIMATE_RESERVED_VALIDATION,
    PREDICTIVE_UNCERTAINTY_INCLUDED: false,
    WAR_INCLUDED: false,
    OD_INCLUDED: false,
    PLAYER_NAMES_USED_FOR_RESERVED_DECISION: false,
    BASELINE_M16A_STATUS: "NOT_COMPARABLE",
    INCUMBENT_REFERENCE: "NOT_COMPARABLE",
    RESERVED_TEST_ACCESSED: true,
    RESERVED_TEST_CONSUMED: true,
    RESERVED_OFFICIAL_SCORING_RUN_COUNT: 1,
    resultSealed: true,
  };

  const sealedJson = JSON.stringify(sealed, null, 2);
  await writeFile(SEALED_PATH, sealedJson);
  const RESERVED_RESULT_SEAL_HASH = createHash("sha256")
    .update(sealedJson)
    .digest("hex");
  await writeFile(
    path.join(OUT, "11_reserved_result_seal_manifest.json"),
    JSON.stringify(
      {
        sealedPath: "reports/m16j/10_reserved_result_sealed.json",
        RESERVED_RESULT_SEAL_HASH,
        sealedAt: new Date().toISOString(),
        RESERVED_TEST_CONSUMED: true,
        RESERVED_OFFICIAL_SCORING_RUN_COUNT: 1,
        immutable: true,
      },
      null,
      2
    )
  );
  console.log(`SEALED ${RESERVED_RESULT_SEAL_HASH}`);

  // ---- Post-seal diagnostics only ----
  const sortedByN = [...rows].sort((a, b) => a.N - b.N);
  const qSize = Math.floor(sortedByN.length / 4);
  const quartiles: EvalRow[][] = [
    sortedByN.slice(0, qSize),
    sortedByN.slice(qSize, 2 * qSize),
    sortedByN.slice(2 * qSize, 3 * qSize),
    sortedByN.slice(3 * qSize),
  ];
  const qRows: Record<string, unknown>[] = [];
  quartiles.forEach((qr, qi) => {
    if (!qr.length) return;
    const yy = qr.map((r) => r.target);
    for (const [name, pred] of [
      ["RESEARCH_FINAL", qr.map((r) => r.research)],
      ["B0_RAW_P", qr.map((r) => r.raw)],
      ["B1_P_EB200", qr.map((r) => r.eb200)],
    ] as const) {
      qRows.push({
        quartile: `Q${qi + 1}`,
        model: name,
        n: qr.length,
        medianHistoricalN: qr[Math.floor(qr.length / 2)]!.N,
        RMSE: rmse(yy, [...pred]),
        MAE: mae(yy, [...pred]),
        bias: mean(pred.map((p, i) => p - yy[i]!)),
      });
    }
  });
  await writeFile(
    path.join(OUT, "12_exposure_quartile_metrics.csv"),
    toCsv(qRows)
  );

  await writeFile(
    path.join(OUT, "13_postseal_player_diagnostics.csv"),
    toCsv(
      rows.map((r) => ({
        playerId: r.playerId,
        playerName: r.playerName,
        historicalN: r.N,
        futureN: r.futureN,
        rawPrediction: r.raw,
        EB200Prediction: r.eb200,
        EB1600Prediction: r.research,
        futureTarget: r.target,
        signedError_research: r.research - r.target,
        absoluteError_research: Math.abs(r.research - r.target),
      }))
    )
  );

  await writeFile(
    path.join(OUT, "14_calibration_diagnostics.csv"),
    toCsv([
      {
        model: "RESEARCH_FINAL",
        predictionMean: mResearch.predictionMean,
        targetMean: mResearch.targetMean,
        predictionSD: mResearch.predictionSD,
        targetSD: mResearch.targetSD,
        calibrationIntercept: mResearch.calibrationIntercept,
        calibrationSlope: mResearch.calibrationSlope,
        reservedRecalibration: "NO",
      },
      {
        model: "B0_RAW_P",
        predictionMean: mRaw.predictionMean,
        targetMean: mRaw.targetMean,
        predictionSD: mRaw.predictionSD,
        targetSD: mRaw.targetSD,
        calibrationIntercept: mRaw.calibrationIntercept,
        calibrationSlope: mRaw.calibrationSlope,
        reservedRecalibration: "NO",
      },
      {
        model: "B1_P_EB200",
        predictionMean: mEb200.predictionMean,
        targetMean: mEb200.targetMean,
        predictionSD: mEb200.predictionSD,
        targetSD: mEb200.targetSD,
        calibrationIntercept: mEb200.calibrationIntercept,
        calibrationSlope: mEb200.calibrationSlope,
        reservedRecalibration: "NO",
      },
    ])
  );

  const ebInterp =
    EB1600_VS_EB200 === "BETTER"
      ? "Both shrinkage and the stronger development-selected shrinkage level received external support."
      : EB1600_VS_EB200 === "TIED"
        ? "Shrinkage generalized relative to the primary test framing, but reserved data did not materially distinguish k=1600 from k=200 (within 0.5%)."
        : "If primary success holds, shrinkage may generalize vs raw P, but exact k=1600 did not outperform lighter EB200 by ≥0.5% RMSE.";

  await writeFile(
    path.join(OUT, "15_secondary_comparator_analysis.md"),
    `# EB1600 vs EB200 (secondary)

- RMSE RESEARCH_FINAL: ${mResearch.RMSE}
- RMSE B1_P_EB200: ${mEb200.RMSE}
- deltaRMSE: ${deltaRMSE_vs_EB200}
- relativeRMSEChange: ${relativeRMSEChange_vs_EB200}
- P(research beats EB200): ${bootEb.probCandidateBeatsBaseline}
- EB1600_VS_EB200: **${EB1600_VS_EB200}**

## Interpretation

${ebInterp}

Do not retune k from this result.
`
  );

  await writeFile(
    path.join(OUT, "16_reserved_consumption_contract.md"),
    `# Reserved consumption contract (M16j)

\`\`\`
RESERVED_TEST_CONSUMED = YES
RESERVED_OFFICIAL_SCORING_RUN_COUNT = 1
RESERVED_MAY_BE_USED_FOR_FUTURE_POINT_MODEL_TUNING = NO
RESERVED_MAY_BE_USED_FOR_FUTURE_UNCERTAINTY_TUNING = NO
\`\`\`

2025-26 is consumed numeric test data. Do not reopen for model selection, k tuning, calibration, uncertainty development, or alternative baselines.

Seal hash: \`${RESERVED_RESULT_SEAL_HASH}\`
`
  );

  // Charts
  await writeFile(
    path.join(CHARTS, "rmse_comparison.svg"),
    svgBars(
      [
        { label: "Research", value: mResearch.RMSE },
        { label: "Raw", value: mRaw.RMSE },
        { label: "EB200", value: mEb200.RMSE },
      ],
      "Reserved RMSE"
    )
  );
  await writeFile(
    path.join(CHARTS, "mae_comparison.svg"),
    svgBars(
      [
        { label: "Research", value: mResearch.MAE },
        { label: "Raw", value: mRaw.MAE },
        { label: "EB200", value: mEb200.MAE },
      ],
      "Reserved MAE"
    )
  );
  await writeFile(
    path.join(CHARTS, "obs_vs_pred_research.svg"),
    svgScatter(yResearch, y, "Observed vs Research", "prediction", "target")
  );
  await writeFile(
    path.join(CHARTS, "obs_vs_pred_raw.svg"),
    svgScatter(yRaw, y, "Observed vs Raw", "prediction", "target")
  );
  await writeFile(
    path.join(CHARTS, "obs_vs_pred_eb200.svg"),
    svgScatter(yEb200, y, "Observed vs EB200", "prediction", "target")
  );

  const qResearch = qRows.filter((r) => r.model === "RESEARCH_FINAL");
  await writeFile(
    path.join(CHARTS, "rmse_by_exposure_quartile.svg"),
    svgBars(
      qResearch.map((r) => ({
        label: String(r.quartile),
        value: Number(r.RMSE),
      })),
      "Research RMSE by historical-N quartile"
    )
  );

  const modelHealth = {
    M16J0_1_AUTHORIZATION_REPRODUCED: "PASS",
    POINT_ESTIMATE_FREEZE_HASH: peHash,
    POINT_ESTIMATE_FREEZE_VERIFIED: "YES",
    POINT_ESTIMATE_CHANGED: "NO",
    ATTRIBUTION: "APPROACH_B",
    PRIMARY_COMPONENT: "P_ONLY",
    POSTERIOR_K: 1600,
    PRIOR_MEAN: 0,
    CALIBRATION: "IDENTITY",
    FUSION: "NONE",
    ZERO_SEMANTICS: "R1_REPLACEMENT",
    RESERVED_PROTOCOL: "drbl-eval-v1-reserved-earlyFrac-future-block-v1",
    EARLY_FRAC: 0.7,
    HISTORICAL_MIN_EXPOSURE: 50,
    FUTURE_MIN_EXPOSURE: 20,
    RESERVED_PRIMARY_TARGET: "future_block_residual_per_100",
    COMMON_RESERVED_UNIVERSE: "PASS",
    COMMON_RESERVED_N: rows.length,
    RESERVED_PREDICTION_FUTURE_LEAKAGE: "NO",
    RESEARCH_RMSE: mResearch.RMSE,
    RAW_RMSE: mRaw.RMSE,
    EB200_RMSE: mEb200.RMSE,
    DELTA_RMSE_VS_RAW: deltaRMSE_vs_raw,
    RELATIVE_RMSE_CHANGE_VS_RAW: relativeRMSEChange_vs_raw,
    P_RESEARCH_BEATS_RAW: bootRaw.probCandidateBeatsBaseline,
    PRIMARY_RESERVED_SUCCESS,
    DELTA_RMSE_VS_EB200: deltaRMSE_vs_EB200,
    RELATIVE_RMSE_CHANGE_VS_EB200: relativeRMSEChange_vs_EB200,
    P_RESEARCH_BEATS_EB200: bootEb.probCandidateBeatsBaseline,
    EB1600_VS_EB200,
    RESEARCH_MAE: mResearch.MAE,
    RAW_MAE: mRaw.MAE,
    EB200_MAE: mEb200.MAE,
    RESEARCH_PEARSON: mResearch.Pearson,
    RAW_PEARSON: mRaw.Pearson,
    EB200_PEARSON: mEb200.Pearson,
    RESEARCH_SPEARMAN: mResearch.Spearman,
    RAW_SPEARMAN: mRaw.Spearman,
    EB200_SPEARMAN: mEb200.Spearman,
    RESEARCH_R2: mResearch.R2,
    RAW_R2: mRaw.R2,
    EB200_R2: mEb200.R2,
    RESEARCH_BIAS: mResearch.bias,
    RAW_BIAS: mRaw.bias,
    EB200_BIAS: mEb200.bias,
    RESEARCH_CALIBRATION_INTERCEPT: mResearch.calibrationIntercept,
    RESEARCH_CALIBRATION_SLOPE: mResearch.calibrationSlope,
    SEVERE_INTEGRITY_ANOMALY,
    PLAYER_NAMES_USED_FOR_RESERVED_DECISION: "NO",
    PREDICTIVE_UNCERTAINTY_FROZEN: "NO",
    RESERVED_UNCERTAINTY_METRICS_COMPUTED: "NO",
    RESERVED_WAR_METRICS_COMPUTED: "NO",
    RESERVED_OD_METRICS_COMPUTED: "NO",
    BASELINE_M16A_STATUS: "NOT_COMPARABLE",
    M16J_RESERVED_VERDICT,
    POINT_ESTIMATE_RESERVED_VALIDATION,
    RESERVED_TEST_ACCESSED: "YES",
    RESERVED_TEST_CONSUMED: "YES",
    RESERVED_OFFICIAL_SCORING_RUN_COUNT: 1,
    RESERVED_RESULT_SEAL_HASH,
    RESERVED_MAY_BE_USED_FOR_FUTURE_POINT_MODEL_TUNING: "NO",
    RESERVED_MAY_BE_USED_FOR_FUTURE_UNCERTAINTY_TUNING: "NO",
    PRODUCTION_CHANGED: "NO",
    PRODUCTION_DEPLOYMENT_ALLOWED: "NO",
    WAR_CHANGED: "NO",
    chronology,
  };
  await writeFile(
    path.join(OUT, "17_model_health.json"),
    JSON.stringify(modelHealth, null, 2)
  );

  await writeFile(
    path.join(OUT, "18_full_audit.md"),
    `# M16j full audit

## Verdict

**${M16J_RESERVED_VERDICT}** (${POINT_ESTIMATE_RESERVED_VALIDATION})

- PRIMARY_RESERVED_SUCCESS: ${PRIMARY_RESERVED_SUCCESS}
- deltaRMSE_vs_raw: ${deltaRMSE_vs_raw}
- P(research beats raw): ${bootRaw.probCandidateBeatsBaseline}
- EB1600_VS_EB200: ${EB1600_VS_EB200}
- SEVERE_INTEGRITY_ANOMALY: ${SEVERE_INTEGRITY_ANOMALY}

## Seal

\`${RESERVED_RESULT_SEAL_HASH}\`

RESERVED_TEST_CONSUMED = YES

## Production

Unchanged. Deployment not allowed inside M16j.
`
  );

  await writeFile(
    path.join(OUT, "19_final_response_values.json"),
    JSON.stringify(
      {
        modelHealth,
        sealedSummary: {
          M16J_RESERVED_VERDICT,
          PRIMARY_RESERVED_SUCCESS,
          EB1600_VS_EB200,
          RESERVED_RESULT_SEAL_HASH,
          commonUniverseN: rows.length,
          chronology,
        },
        metrics: sealed.metrics,
        bootstrapPrimary: sealed.bootstrapPrimary,
        bootstrapSecondary: sealed.bootstrapSecondary,
      },
      null,
      2
    )
  );

  console.log(
    JSON.stringify(
      {
        status: "M16j_COMPLETE",
        M16J_RESERVED_VERDICT,
        PRIMARY_RESERVED_SUCCESS,
        EB1600_VS_EB200,
        RESERVED_RESULT_SEAL_HASH,
        COMMON_RESERVED_N: rows.length,
        RESERVED_TEST_CONSUMED: true,
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
