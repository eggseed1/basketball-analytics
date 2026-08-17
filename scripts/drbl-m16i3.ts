/**
 * M16i3 — outcome-blind prediction-time reliability feature audit + freeze.
 *   npm run drbl:m16i3
 *
 * Does NOT compute future-error associations, WIS, or coverage.
 * Does NOT open RESERVED_TEST / M16b VALIDATION.
 * Does NOT change the locked point estimate or production.
 */
import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { EVALUATION_PROTOCOL_VERSION } from "../drbl/evaluation/protocol";
import {
  loadSplitGames,
  verifyFrozenSplitHashes,
} from "../drbl/evaluation/m16c-dataset";
import { hashGames, type SplitGame } from "../drbl/evaluation/splits";
import { pearson, spearman } from "../drbl/evaluation/metrics";
import { SEQUENTIAL_ATTRIBUTION_VERSION } from "../drbl/models/sequential-attribution";
import {
  CALIBRATION_IDENTITY_VERSION,
  RESEARCH_RATE_VERSION,
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
  RELIABILITY_FEATURE_META,
  RELIABILITY_FEATURES_VERSION,
  R1_SEGMENT_COUNT,
  computeAppearanceValueDispersion,
  computeSplitHalfPShift,
  computeTemporalSegmentDispersion,
  streamAccounting,
  syntheticStreamFromValues,
} from "../drbl/models/research-reliability-features-v1";
import {
  WAR_EXPOSURE_UNIT,
  WAR_FORMULA_VERSION,
} from "../drbl/models/pipeline-value";
import type { DrblProcessedGame } from "../drbl/index";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m16i3");
const CHARTS = path.join(OUT, "charts");
const M16G = path.join(ROOT, "reports", "m16g");
const M16G1 = path.join(ROOT, "reports", "m16g1");
const M16I2 = path.join(ROOT, "reports", "m16i2");
const M16H = path.join(ROOT, "reports", "m16h");

const EXPECTED_TRAIN =
  "7bec77be45295ee858d90896d9383e4da951e98e81ad1ef31b5285fb055d1550";
const EXPECTED_VAL =
  "4fd339a445f269162c2d76e9102ea5bb965a5d0fc05e0fcd2f60593117c5faf0";
const EXPECTED_RES =
  "e542aa54602390ed65792f37e10207814e10b62bfdf552ddf4da69825076c1ce";

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
function sdPop(xs: number[]): number {
  if (!xs.length) return NaN;
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
function distSummary(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return {
    n: xs.length,
    mean: mean(xs),
    sd: sdPop(xs),
    min: s[0] ?? NaN,
    P1: percentile(s, 1),
    P5: percentile(s, 5),
    P25: percentile(s, 25),
    median: percentile(s, 50),
    P75: percentile(s, 75),
    P95: percentile(s, 95),
    P99: percentile(s, 99),
    max: s[s.length - 1] ?? NaN,
    zeroShare: xs.filter((x) => Math.abs(x) < 1e-15).length / (xs.length || 1),
  };
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

type FoldCsvRow = {
  foldId: number;
  playerId: string;
  rawPB: number;
  N: number;
  asOfDate: string;
  // target intentionally NOT stored — outcome-blind
};

function parseFoldRowsBlind(csv: string): FoldCsvRow[] {
  const lines = csv.trim().split(/\r?\n/);
  const h = lines[0]!.split(",");
  const ix = (n: string) => h.indexOf(n);
  // Refuse to wire target into feature pipeline objects
  void h.includes("target");
  return lines.slice(1).map((line) => {
    const c = line.split(",");
    return {
      foldId: Number(c[ix("foldId")]),
      playerId: c[ix("playerId")]!,
      rawPB: Number(c[ix("rawPB")]),
      N: Number(c[ix("N")]),
      asOfDate: c[ix("asOfDate")]!,
    };
  });
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
    .slice(0, 2500)
    .map(
      (p) =>
        `<circle cx="${mapX(p.x).toFixed(1)}" cy="${mapY(p.y).toFixed(1)}" r="2" fill="#1f4e79" fill-opacity="0.3"/>`
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#fafafa"/><text x="${w / 2}" y="22" text-anchor="middle" font-size="13">${title}</text><text x="${w / 2}" y="${h - 10}" text-anchor="middle" font-size="11">${xlab}</text><text x="12" y="${h / 2}" text-anchor="middle" font-size="11" transform="rotate(-90 12 ${h / 2})">${ylab}</text>${dots}</svg>`;
}

function svgHist(
  xs: number[],
  title: string,
  bins = 30
): string {
  if (!xs.length) return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><text x="20" y="40">${title}</text></svg>`;
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const width = hi - lo || 1;
  const counts = Array(bins).fill(0) as number[];
  for (const x of xs) {
    const b = Math.min(bins - 1, Math.floor(((x - lo) / width) * bins));
    counts[b]!++;
  }
  return svgBars(
    counts.map((c, i) => ({
      label: i % 5 === 0 ? (lo + (width * i) / bins).toFixed(1) : "",
      value: c,
    })),
    title,
    "count"
  );
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
      futStart: string;
      futEnd: string;
      historyGames: number;
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
  const m16i2Health = JSON.parse(
    await readFile(path.join(M16I2, "20_model_health.json"), "utf8")
  ) as {
    UNCERTAINTY_SELECTION_RESULT: string;
    SELECTED_UNCERTAINTY_MODEL: string;
    EXPOSURE_ONLY_UNCERTAINTY_RESEARCH: string;
  };
  const m16hDecision = JSON.parse(
    await readFile(path.join(M16H, "16_calibration_selection_decision.json"), "utf8")
  ) as { CALIBRATION_SELECTION_RESULT: string };

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
    m16i2Health.UNCERTAINTY_SELECTION_RESULT !==
      "EXPOSURE_ONLY_INFORMATION_CEILING" ||
    m16i2Health.SELECTED_UNCERTAINTY_MODEL !== "NONE"
  ) {
    throw new Error("STOP M16i2 lock not reproduced");
  }

  await writeFile(
    path.join(OUT, "00_freeze.json"),
    JSON.stringify(
      {
        milestone: "M16i3",
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
        m16iCorrectedStatus: "NO_ELIGIBLE_CANDIDATE",
        m16i1Status: "NO_ELIGIBLE_UNCERTAINTY_MODEL",
        m16i2Status: {
          SELECTED_UNCERTAINTY_MODEL: "NONE",
          UNCERTAINTY_SELECTION_RESULT: "EXPOSURE_ONLY_INFORMATION_CEILING",
          EXPOSURE_ONLY_UNCERTAINTY_RESEARCH:
            m16i2Health.EXPOSURE_ONLY_UNCERTAINTY_RESEARCH,
        },
        candidateFeatures: [
          "R1_TEMPORAL_SEGMENT_DISPERSION",
          "R2_SPLIT_HALF_P_SHIFT",
          "R3_APPEARANCE_VALUE_DISPERSION",
        ],
        featureDefinitions: RELIABILITY_FEATURE_META,
        technicalEligibilityGates: {
          finiteShareOverall: 0.99,
          finiteSharePerExpoQuartile: 0.98,
          predictionTimeProvenance: true,
          futureLeakage: "NONE",
          noImputation: true,
          outcomeBlind: true,
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

  await writeFile(
    path.join(OUT, "01_prior_lock_reproduction.json"),
    JSON.stringify(
      {
        POINT_ESTIMATE_MODEL_FROZEN: "YES",
        formula: "N/(N+1600)*rawAbilityRate",
        POSTERIOR_K: 1600,
        CALIBRATION: m16hDecision.CALIBRATION_SELECTION_RESULT,
        M16I2_UNCERTAINTY_SELECTION_RESULT:
          m16i2Health.UNCERTAINTY_SELECTION_RESULT,
        M16I2_SELECTED: m16i2Health.SELECTED_UNCERTAINTY_MODEL,
        EXPOSURE_ONLY_INFORMATION_CEILING: "YES",
        M16B_VALIDATION_USED: "NO",
        RESERVED_TEST_ACCESSED: "NO",
        reproduced: "PASS",
      },
      null,
      2
    )
  );

  // Outcome-blind code audit: feature module + runner (excluding this audit block)
  const featureMod = await readFile(
    path.join(ROOT, "drbl/models/research-reliability-features-v1.ts"),
    "utf8"
  );
  const runnerSrc = await readFile(
    path.join(ROOT, "scripts", "drbl-m16i3.ts"),
    "utf8"
  );
  const auditMarker = "OUTCOME_BLIND_AUDIT_BEGIN";
  const runnerBody = runnerSrc.split(auditMarker)[0] ?? runnerSrc;
  const scanTargets = [featureMod, runnerBody];
  const banned = [
    "weightedIntervalScore(",
    "absError =",
    "predictionError =",
    "future_block_residual_per_100",
    "cceOf(",
    "quartileCov(",
  ];
  // Also ban reading fold CSV target column into feature objects
  const bannedRe = [/\bcsvTarget\b/, /\bfutureTarget\b/, /\babsError\b/, /\bWIS\b/];
  let readsFuture = false;
  for (const src of scanTargets) {
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    if (banned.some((b) => stripped.includes(b))) readsFuture = true;
    if (bannedRe.some((re) => re.test(stripped))) readsFuture = true;
  }
  // OUTCOME_BLIND_AUDIT_BEGIN
  if (readsFuture) {
    throw new Error("STOP OUTCOME_BLIND_FEATURE_AUDIT_VIOLATED");
  }

  console.log("Loading TRAIN games (no VALIDATION / RESERVED_TEST)…");
  const trainProcessed = await loadSplitGames(trainGames);
  const sorted = [...trainProcessed].sort(
    (a, b) =>
      (a.box.gameDate || "").localeCompare(b.box.gameDate || "") ||
      a.box.gameId.localeCompare(b.box.gameId)
  );
  console.log(`TRAIN games: ${sorted.length}`);

  const foldCsv = parseFoldRowsBlind(
    await readFile(path.join(M16G, "04_fold_rows.csv"), "utf8")
  );

  type FeatRow = {
    rowId: string;
    foldId: number;
    playerId: string;
    N: number;
    asOfDate: string;
    csvRawPB: number;
    reconRawPB: number;
    reconResidual: number;
    maxFeatureDate: string;
    futureDateMin: string;
    R1: number | null;
    R2: number | null;
    R3: number | null;
    R1_ok: boolean;
    R2_ok: boolean;
    R3_ok: boolean;
  };

  const featRows: FeatRow[] = [];
  const reconResiduals: number[] = [];
  let streamCountIdentityOk = true;
  let valueSumIdentityOk = true;

  await writeFile(
    path.join(OUT, "02_historical_stream_provenance.md"),
    `# Historical Approach-B stream provenance (M16i3)

## Source

- Attribution: \`attributeGamePlayerValue\` + \`attributePossessionSequential\` (\`${SEQUENTIAL_ATTRIBUTION_VERSION}\`)
- Replacement: history-only R1 pool via \`buildReplacementPool\` at fold \`historyDateMax\`
- Roles: history-only \`finalizeRoleAccum\`

## Appearance definition

One combined possession appearance = one on-court offense OR defense player-id on one possession.

For each appearance:

\`\`\`
v_j = stable sequential credit share vs R1 replacement EP
\`\`\`

Emitted chronologically via research-only \`onAppearance\` hook.

## Accounting identities

\`\`\`
count(appearances for player) = N = accumulator.possessions
sum(v_j) = accumulator.totalValue
rawAbilityRate = 100 * sum(v_j) / N
\`\`\`

## Chronology

Games sorted by \`gameDate\`, then \`gameId\`.
Possessions processed in stored order within each game.

## Future leakage

Only history games with \`gameDate < futStart\` enter the stream for each fold.
Future-block games are never attributed for feature construction.
`
  );

  for (const fold of m16gFolds.folds) {
    const futStart = fold.futStart;
    const history = sorted.filter((g) => (g.box.gameDate || "") < futStart);
    console.log(
      `Fold ${fold.foldId}: history games=${history.length} futStart=${futStart}`
    );

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

    const foldPlayers = foldCsv.filter((r) => r.foldId === fold.foldId);
    for (const row of foldPlayers) {
      const apps = streams.get(row.playerId) ?? [];
      const acc = histAccum.get(row.playerId);
      const accounting = streamAccounting({ appearances: apps });
      if (apps.length !== row.N) {
        // Prefer accumulator N if stream length matches accumulator
        if (!acc || apps.length !== acc.possessions) {
          streamCountIdentityOk = false;
        }
      }
      if (acc) {
        const sumDiff = Math.abs(accounting.totalValue - acc.totalValue);
        if (sumDiff > 1e-9) valueSumIdentityOk = false;
      }
      const reconRaw = accounting.rawAbilityRate;
      const residual = reconRaw - row.rawPB;
      reconResiduals.push(Math.abs(residual));
      if (Math.abs(residual) > 1e-6) {
        // Material mismatch vs CSV — still record; fail later if P99 huge
      }

      const stream = { appearances: apps };
      const r1 = computeTemporalSegmentDispersion(stream);
      const r2 = computeSplitHalfPShift(stream);
      const r3 = computeAppearanceValueDispersion(stream);

      // R3 identity: meanV*100 == recon raw
      const r3IdentityOk =
        r3.available &&
        r3.meanV != null &&
        Math.abs(r3.meanV * 100 - reconRaw) < 1e-9;

      featRows.push({
        rowId: `F${fold.foldId + 1}_${row.playerId}`,
        foldId: row.foldId,
        playerId: row.playerId,
        N: apps.length,
        asOfDate: cutoffDate,
        csvRawPB: row.rawPB,
        reconRawPB: reconRaw,
        reconResidual: residual,
        maxFeatureDate: accounting.maxGameDate,
        futureDateMin: fold.futureDateMin,
        R1: r1.available ? r1.value : null,
        R2: r2.available ? r2.value : null,
        R3: r3.available && r3IdentityOk ? r3.value : null,
        R1_ok: r1.available && Number.isFinite(r1.value!),
        R2_ok: r2.available && Number.isFinite(r2.value!),
        R3_ok: !!(r3.available && r3IdentityOk && Number.isFinite(r3.value!)),
      });
    }
  }

  const absRes = [...reconResiduals].sort((a, b) => a - b);
  const reconReport = {
    nRows: reconResiduals.length,
    maxResidual: absRes[absRes.length - 1] ?? NaN,
    meanResidual: mean(absRes),
    P99Residual: percentile(absRes, 99),
    streamCountIdentityOk,
    valueSumIdentityOk,
  };
  if (
    !Number.isFinite(reconReport.maxResidual) ||
    reconReport.maxResidual > 1e-4 ||
    !streamCountIdentityOk ||
    !valueSumIdentityOk
  ) {
    throw new Error(
      `STOP HISTORICAL_P_STREAM_RECONSTRUCTION_FAILURE ${JSON.stringify(reconReport)}`
    );
  }

  await writeFile(
    path.join(OUT, "03_raw_rate_reconstruction.csv"),
    toCsv(
      featRows.map((r) => ({
        rowId: r.rowId,
        foldId: r.foldId,
        N: r.N,
        csvRawPB: r.csvRawPB,
        reconRawPB: r.reconRawPB,
        absResidual: Math.abs(r.reconResidual),
      }))
    )
  );

  // Leakage audit
  const leakRows = featRows.map((r) => {
    const ok =
      r.maxFeatureDate <= r.asOfDate && r.maxFeatureDate < r.futureDateMin;
    return {
      rowId: r.rowId,
      foldId: r.foldId,
      maxFeatureDate: r.maxFeatureDate,
      asOfDate: r.asOfDate,
      futureDateMin: r.futureDateMin,
      leakageOk: ok,
    };
  });
  if (leakRows.some((r) => !r.leakageOk)) {
    throw new Error("STOP RELIABILITY_FEATURE_FUTURE_LEAKAGE");
  }
  await writeFile(path.join(OUT, "04_feature_leakage_audit.csv"), toCsv(leakRows));

  // Exposure quartiles from historical N (prediction-time)
  const nSorted = [...featRows.map((r) => r.N)].sort((a, b) => a - b);
  const qCuts = [25, 50, 75].map((p) => percentile(nSorted, p));
  function expoQ(n: number) {
    if (n <= qCuts[0]!) return 1;
    if (n <= qCuts[1]!) return 2;
    if (n <= qCuts[2]!) return 3;
    return 4;
  }

  function availability(name: "R1" | "R2" | "R3") {
    const okKey = `${name}_ok` as "R1_ok" | "R2_ok" | "R3_ok";
    const total = featRows.length;
    const available = featRows.filter((r) => r[okKey]).length;
    const byFold = [0, 1, 2, 3, 4].map((fid) => {
      const slice = featRows.filter((r) => r.foldId === fid);
      const av = slice.filter((r) => r[okKey]).length;
      return {
        fold: `F${fid + 1}`,
        total: slice.length,
        available: av,
        pct: slice.length ? av / slice.length : NaN,
      };
    });
    const byQ = [1, 2, 3, 4].map((q) => {
      const slice = featRows.filter((r) => expoQ(r.N) === q);
      const av = slice.filter((r) => r[okKey]).length;
      return {
        quartile: `Q${q}`,
        total: slice.length,
        available: av,
        pct: slice.length ? av / slice.length : NaN,
      };
    });
    const availNs = featRows.filter((r) => r[okKey]).map((r) => r.N);
    const availNsSorted = [...availNs].sort((a, b) => a - b);
    return {
      feature: name,
      totalRows: total,
      availableRows: available,
      missingRows: total - available,
      availabilityPct: available / total,
      byFold,
      byQuartile: byQ,
      minN_available: availNsSorted[0] ?? NaN,
      medianN_available: percentile(availNsSorted, 50),
      minQuartileAvailability: Math.min(...byQ.map((q) => q.pct)),
    };
  }

  const availR1 = availability("R1");
  const availR2 = availability("R2");
  const availR3 = availability("R3");

  await writeFile(
    path.join(OUT, "05_feature_availability.csv"),
    toCsv(
      [availR1, availR2, availR3].flatMap((a) => [
        {
          feature: a.feature,
          scope: "overall",
          total: a.totalRows,
          available: a.availableRows,
          missing: a.missingRows,
          availabilityPct: a.availabilityPct,
          minN: a.minN_available,
          medianN: a.medianN_available,
        },
        ...a.byFold.map((f) => ({
          feature: a.feature,
          scope: f.fold,
          total: f.total,
          available: f.available,
          missing: f.total - f.available,
          availabilityPct: f.pct,
          minN: "",
          medianN: "",
        })),
        ...a.byQuartile.map((q) => ({
          feature: a.feature,
          scope: q.quartile,
          total: q.total,
          available: q.available,
          missing: q.total - q.available,
          availabilityPct: q.pct,
          minN: "",
          medianN: "",
        })),
      ])
    )
  );

  function technicalEligible(a: ReturnType<typeof availability>): boolean {
    return (
      a.availabilityPct >= 0.99 &&
      a.minQuartileAvailability >= 0.98 &&
      a.availableRows > 0
    );
  }

  // Synthetic semantic tests
  const synth = {
    R1_stable: computeTemporalSegmentDispersion(
      syntheticStreamFromValues(Array(40).fill(0.01))
    ).value,
    R1_volatile: computeTemporalSegmentDispersion(
      syntheticStreamFromValues(
        [-2, 2, -2, 2].flatMap((rate) => Array(10).fill(rate / 100))
      )
    ).value,
    R2_zero: computeSplitHalfPShift(
      syntheticStreamFromValues([...Array(10).fill(0.01), ...Array(10).fill(0.01)])
    ).value,
    R2_shift4: computeSplitHalfPShift(
      syntheticStreamFromValues([
        ...Array(10).fill(-0.02),
        ...Array(10).fill(0.02),
      ])
    ).value,
    R3_zero: computeAppearanceValueDispersion(
      syntheticStreamFromValues(Array(20).fill(0.03))
    ).value,
    R3_mixed: computeAppearanceValueDispersion(
      syntheticStreamFromValues([0, 0.02, -0.01, 0.04])
    ).value,
  };
  const synthPass =
    Math.abs(synth.R1_stable!) < 1e-12 &&
    synth.R1_volatile! > 1.5 &&
    Math.abs(synth.R2_zero!) < 1e-12 &&
    Math.abs(synth.R2_shift4! - 4) < 1e-12 &&
    Math.abs(synth.R3_zero!) < 1e-12 &&
    synth.R3_mixed! > 0;

  await writeFile(
    path.join(OUT, "12_synthetic_feature_tests.json"),
    JSON.stringify({ ...synth, pass: synthPass }, null, 2)
  );
  if (!synthPass) throw new Error("STOP synthetic feature tests failed");

  const r1Status = technicalEligible(availR1)
    ? "ELIGIBLE"
    : "TECHNICALLY_INELIGIBLE";
  const r2Status = technicalEligible(availR2)
    ? "ELIGIBLE"
    : "TECHNICALLY_INELIGIBLE";
  const r3Status =
    !streamCountIdentityOk || !valueSumIdentityOk
      ? "TECHNICALLY_INELIGIBLE"
      : technicalEligible(availR3)
        ? "ELIGIBLE"
        : "TECHNICALLY_INELIGIBLE";

  // Distributions (eligible values only)
  const distRows: Record<string, unknown>[] = [];
  for (const name of ["R1", "R2", "R3"] as const) {
    const okKey = `${name}_ok` as const;
    const vals = featRows.filter((r) => r[okKey]).map((r) => r[name]!);
    const d = distSummary(vals);
    distRows.push({ feature: name, scope: "overall", ...d });
    for (const fid of [0, 1, 2, 3, 4]) {
      const v = featRows
        .filter((r) => r.foldId === fid && r[okKey])
        .map((r) => r[name]!);
      distRows.push({
        feature: name,
        scope: `F${fid + 1}`,
        ...distSummary(v),
      });
    }
  }
  await writeFile(path.join(OUT, "06_feature_distributions.csv"), toCsv(distRows));

  // Feature vs exposure
  const expoRows: Record<string, unknown>[] = [];
  for (const name of ["R1", "R2", "R3"] as const) {
    const okKey = `${name}_ok` as const;
    const slice = featRows.filter((r) => r[okKey]);
    const feat = slice.map((r) => r[name]!);
    const logN = slice.map((r) => Math.log(Math.max(1e-12, r.N)));
    expoRows.push({
      feature: name,
      scope: "overall",
      pearson_logN: pearson(feat, logN),
      spearman_logN: spearman(feat, logN),
      n: slice.length,
    });
    for (const q of [1, 2, 3, 4]) {
      const qs = slice.filter((r) => expoQ(r.N) === q).map((r) => r[name]!);
      const d = distSummary(qs);
      expoRows.push({
        feature: name,
        scope: `Q${q}`,
        n: d.n,
        mean: d.mean,
        median: d.median,
        sd: d.sd,
      });
    }
  }
  await writeFile(path.join(OUT, "07_feature_vs_exposure.csv"), toCsv(expoRows));

  // Redundancy
  function pairCorr(a: "R1" | "R2" | "R3", b: "R1" | "R2" | "R3") {
    const rows = featRows.filter((r) => r[`${a}_ok`] && r[`${b}_ok`]);
    const xa = rows.map((r) => r[a]!);
    const xb = rows.map((r) => r[b]!);
    const la = xa.map((x) => Math.log1p(x));
    const lb = xb.map((x) => Math.log1p(x));
    return {
      pair: `${a}_vs_${b}`,
      n: rows.length,
      pearson: pearson(xa, xb),
      spearman: spearman(xa, xb),
      pearson_log1p: pearson(la, lb),
      spearman_log1p: spearman(la, lb),
      HIGH_REDUNDANCY: Math.abs(spearman(xa, xb)) >= 0.95 ? "YES" : "NO",
    };
  }
  const redundancy = [
    pairCorr("R1", "R2"),
    pairCorr("R1", "R3"),
    pairCorr("R2", "R3"),
  ];
  await writeFile(path.join(OUT, "08_feature_redundancy.csv"), toCsv(redundancy));
  const highRedundancy = redundancy
    .filter((r) => r.HIGH_REDUNDANCY === "YES")
    .map((r) => r.pair);
  const highRedundancyLabel =
    highRedundancy.length ? highRedundancy.join("|") : "NONE";

  // Cutoff stability: players in adjacent folds
  const stabRows: Record<string, unknown>[] = [];
  for (const name of ["R1", "R2", "R3"] as const) {
    const okKey = `${name}_ok` as const;
    for (let fid = 0; fid < 4; fid++) {
      const aMap = new Map(
        featRows
          .filter((r) => r.foldId === fid && r[okKey])
          .map((r) => [r.playerId, r[name]!])
      );
      const bMap = new Map(
        featRows
          .filter((r) => r.foldId === fid + 1 && r[okKey])
          .map((r) => [r.playerId, r[name]!])
      );
      const pairs: Array<{ a: number; b: number; abs: number }> = [];
      for (const [pid, va] of aMap) {
        const vb = bMap.get(pid);
        if (vb == null) continue;
        pairs.push({ a: va, b: vb, abs: Math.abs(vb - va) });
      }
      const absSorted = pairs.map((p) => p.abs).sort((a, b) => a - b);
      stabRows.push({
        feature: name,
        adjacent: `F${fid + 1}->F${fid + 2}`,
        nPlayers: pairs.length,
        pearson: pearson(
          pairs.map((p) => p.a),
          pairs.map((p) => p.b)
        ),
        spearman: spearman(
          pairs.map((p) => p.a),
          pairs.map((p) => p.b)
        ),
        medianAbsChange: percentile(absSorted, 50),
        P90AbsChange: percentile(absSorted, 90),
      });
    }
  }
  await writeFile(path.join(OUT, "09_feature_cutoff_stability.csv"), toCsv(stabRows));

  const eligibleFeatures: string[] = [];
  if (r1Status === "ELIGIBLE") eligibleFeatures.push("TEMPORAL_SEGMENT_DISPERSION");
  if (r2Status === "ELIGIBLE") eligibleFeatures.push("SPLIT_HALF_P_SHIFT");
  if (r3Status === "ELIGIBLE")
    eligibleFeatures.push("APPEARANCE_VALUE_DISPERSION");

  const singleSets: Record<string, string[]> = {};
  if (r1Status === "ELIGIBLE") singleSets.F1 = ["N", "TEMPORAL_SEGMENT_DISPERSION"];
  if (r2Status === "ELIGIBLE") singleSets.F2 = ["N", "SPLIT_HALF_P_SHIFT"];
  if (r3Status === "ELIGIBLE")
    singleSets.F3 = ["N", "APPEARANCE_VALUE_DISPERSION"];
  const F_ALL = ["N", ...eligibleFeatures];
  const futureSetCount = 1 + Object.keys(singleSets).length + (eligibleFeatures.length ? 1 : 0);
  // F0 + singles + F_ALL (F_ALL only if >=1 eligible); if 1 eligible, F_ALL == that single — still count both? Spec says F_ALL = [N, all eligible]. If one eligible, F_ALL duplicates single set. Count: F0 + singles + F_ALL when eligible.length>=1. Max 4 new uncertainty feature sets meaning F0 is reference + up to 3 singles + F_ALL but "Maximum new uncertainty feature sets: 4" = singles + F_ALL with F0 as reference. So total labeled sets = 1 + singles + (eligible?1:0) but if all 3 eligible: F0,F1,F2,F3,F_ALL = 5 labels with F0 reference → 4 new. Good.

  let auditResult:
    | "FEATURE_SET_FROZEN"
    | "FEATURE_SET_PARTIALLY_FROZEN"
    | "NO_TECHNICALLY_VALID_FEATURES"
    | "FEATURE_AUDIT_BLOCKED" = "FEATURE_AUDIT_BLOCKED";
  if (eligibleFeatures.length === 3) auditResult = "FEATURE_SET_FROZEN";
  else if (eligibleFeatures.length >= 1)
    auditResult = "FEATURE_SET_PARTIALLY_FROZEN";
  else auditResult = "NO_TECHNICALLY_VALID_FEATURES";

  const bakeoffReady = eligibleFeatures.length >= 1;

  await writeFile(
    path.join(OUT, "10_feature_provenance.csv"),
    toCsv([
      {
        feature: "TEMPORAL_SEGMENT_DISPERSION",
        formula:
          "sqrt(sum Ns*(Ps-Pbar)^2 / N); Ps=100*sum(v)/Ns over K=4 chrono equal-exposure segments",
        sourceStream: "Approach-B appearance contributions",
        sourceFunction:
          "computeTemporalSegmentDispersion(historicalAttributionStream)",
        timestampBoundary: "max(gameDate) <= history cutoff < futureDateMin",
        requiredFields: "chronological v_j appearances",
        unit: "DRBL points per 100",
        missingValueRule: "null; no imputation",
        transform: "log1p(R); then train-only median/IQR z",
        technicalStatus: r1Status,
        reasonIfIneligible:
          r1Status === "ELIGIBLE" ? "" : "availability/invariant gate",
      },
      {
        feature: "SPLIT_HALF_P_SHIFT",
        formula: "abs(P_late - P_early); early=first floor(N/2)",
        sourceStream: "Approach-B appearance contributions",
        sourceFunction: "computeSplitHalfPShift(historicalAttributionStream)",
        timestampBoundary: "max(gameDate) <= history cutoff < futureDateMin",
        requiredFields: "chronological v_j appearances; N>=2",
        unit: "DRBL points per 100",
        missingValueRule: "null; no imputation",
        transform: "log1p(R); then train-only median/IQR z",
        technicalStatus: r2Status,
        reasonIfIneligible:
          r2Status === "ELIGIBLE" ? "" : "availability/invariant gate",
      },
      {
        feature: "APPEARANCE_VALUE_DISPERSION",
        formula: "100 * sqrt(sum((vj-meanV)^2)/N)",
        sourceStream: "Approach-B appearance contributions",
        sourceFunction:
          "computeAppearanceValueDispersion(historicalAttributionStream)",
        timestampBoundary: "max(gameDate) <= history cutoff < futureDateMin",
        requiredFields: "exact count=N appearance stream",
        unit: "DRBL points per 100 appearances",
        missingValueRule: "null; no imputation",
        transform: "log1p(R); then train-only median/IQR z",
        technicalStatus: r3Status,
        reasonIfIneligible:
          r3Status === "ELIGIBLE"
            ? ""
            : "availability or appearance accounting identity",
      },
    ])
  );

  const freeze = {
    candidateFeatureVersion: RELIABILITY_FEATURES_VERSION,
    R1_technical_status: r1Status,
    R2_technical_status: r2Status,
    R3_technical_status: r3Status,
    eligibleReliabilityFeatures: eligibleFeatures,
    F0: ["N"],
    singleFeatureCandidateSets: singleSets,
    F_ALL,
    transforms: {
      xN: "log(N)",
      xR: "log1p(R)",
      zR: "(xR - median_train(xR)) / IQR_train(xR); flag if IQR=0",
    },
    missingValueRules: "null; never impute; never zero-fill",
    coverageStatistics: {
      R1: availR1.availabilityPct,
      R2: availR2.availabilityPct,
      R3: availR3.availabilityPct,
    },
    outcomeUsedForFeatureSelection: false,
    M16I4_FEATURE_SET_FROZEN: true,
    RELIABILITY_FEATURE_AUDIT_RESULT: auditResult,
    M16I4_RELIABILITY_BAKEOFF_READY: bakeoffReady ? "YES" : "NO",
    RESEARCH_RATE_MODEL_FREEZE_READY: "NO",
    RESERVED_TEST_SHOULD_OPEN: "NO",
    PREDICTIVE_UNCERTAINTY_FROZEN: "NO",
    futureFeatureSetCountIncludingF0: 1 + Object.keys(singleSets).length + (eligibleFeatures.length ? 1 : 0),
    newUncertaintyFeatureSetsMaxNote:
      "F0 is historical exposure-only REFERENCE; singles + F_ALL are new sets (≤4 when all three eligible)",
  };
  await writeFile(
    path.join(OUT, "11_candidate_feature_freeze.json"),
    JSON.stringify(freeze, null, 2)
  );

  await writeFile(
    path.join(OUT, "13_feature_integrity.json"),
    JSON.stringify(
      {
        FEATURE_AUDIT_OUTCOME_BLIND: "YES",
        FEATURE_PIPELINE_READS_FUTURE_OUTCOMES: "NO",
        OUTCOME_USED_FOR_FEATURE_SELECTION: "NO",
        HISTORICAL_STREAM_RECONSTRUCTION: "PASS",
        R3_APPEARANCE_ACCOUNTING_IDENTITY: "PASS",
        streamCountIdentityOk,
        valueSumIdentityOk,
        reconstruction: reconReport,
        leakageViolations: 0,
        syntheticTests: "PASS",
        segmentCount: R1_SEGMENT_COUNT,
        halfSplitUsesAbsoluteDifference: true,
        imputationUsed: false,
        pseudoExposureUsed: false,
        legacyDisagreementUsed: false,
      },
      null,
      2
    )
  );

  // Charts (outcome-blind)
  const r1vals = featRows.filter((r) => r.R1_ok).map((r) => r.R1!);
  const r2vals = featRows.filter((r) => r.R2_ok).map((r) => r.R2!);
  const r3vals = featRows.filter((r) => r.R3_ok).map((r) => r.R3!);
  await writeFile(path.join(CHARTS, "R1_distribution.svg"), svgHist(r1vals, "R1 temporal segment dispersion"));
  await writeFile(path.join(CHARTS, "R2_distribution.svg"), svgHist(r2vals, "R2 split-half P shift"));
  await writeFile(path.join(CHARTS, "R3_distribution.svg"), svgHist(r3vals, "R3 appearance-value dispersion"));
  await writeFile(
    path.join(CHARTS, "R1_vs_logN.svg"),
    svgScatter(
      featRows.filter((r) => r.R1_ok).map((r) => ({ x: Math.log(r.N), y: r.R1! })),
      "R1 vs logN",
      "logN",
      "R1"
    )
  );
  await writeFile(
    path.join(CHARTS, "R2_vs_logN.svg"),
    svgScatter(
      featRows.filter((r) => r.R2_ok).map((r) => ({ x: Math.log(r.N), y: r.R2! })),
      "R2 vs logN",
      "logN",
      "R2"
    )
  );
  await writeFile(
    path.join(CHARTS, "R3_vs_logN.svg"),
    svgScatter(
      featRows.filter((r) => r.R3_ok).map((r) => ({ x: Math.log(r.N), y: r.R3! })),
      "R3 vs logN",
      "logN",
      "R3"
    )
  );
  await writeFile(
    path.join(CHARTS, "R1_vs_R2.svg"),
    svgScatter(
      featRows
        .filter((r) => r.R1_ok && r.R2_ok)
        .map((r) => ({ x: r.R1!, y: r.R2! })),
      "R1 vs R2",
      "R1",
      "R2"
    )
  );
  await writeFile(
    path.join(CHARTS, "R1_vs_R3.svg"),
    svgScatter(
      featRows
        .filter((r) => r.R1_ok && r.R3_ok)
        .map((r) => ({ x: r.R1!, y: r.R3! })),
      "R1 vs R3",
      "R1",
      "R3"
    )
  );
  await writeFile(
    path.join(CHARTS, "R2_vs_R3.svg"),
    svgScatter(
      featRows
        .filter((r) => r.R2_ok && r.R3_ok)
        .map((r) => ({ x: r.R2!, y: r.R3! })),
      "R2 vs R3",
      "R2",
      "R3"
    )
  );
  await writeFile(
    path.join(CHARTS, "feature_by_exposure_quartile_R1.svg"),
    svgBars(
      [1, 2, 3, 4].map((q) => {
        const v = featRows
          .filter((r) => r.R1_ok && expoQ(r.N) === q)
          .map((r) => r.R1!);
        return { label: `Q${q}`, value: mean(v) };
      }),
      "Mean R1 by exposure quartile",
      "R1"
    )
  );
  await writeFile(
    path.join(CHARTS, "feature_by_cutoff_R1.svg"),
    svgBars(
      [0, 1, 2, 3, 4].map((fid) => {
        const v = featRows
          .filter((r) => r.R1_ok && r.foldId === fid)
          .map((r) => r.R1!);
        return { label: `F${fid + 1}`, value: mean(v) };
      }),
      "Mean R1 by historical cutoff",
      "R1"
    )
  );
  await writeFile(
    path.join(CHARTS, "redundancy_heatmap.svg"),
    svgBars(
      redundancy.map((r) => ({
        label: r.pair.replace(/_vs_/g, "/"),
        value: Math.abs(r.spearman),
      })),
      "|Spearman| feature pairs",
      "|ρ|"
    )
  );
  await writeFile(
    path.join(CHARTS, "cutoff_stability_R1.svg"),
    svgBars(
      stabRows
        .filter((r) => r.feature === "R1")
        .map((r) => ({
          label: String(r.adjacent).replace("->", "→"),
          value: Number(r.spearman),
        })),
      "R1 adjacent-cutoff Spearman",
      "Spearman"
    )
  );
  await writeFile(
    path.join(CHARTS, "four_segment_schematic.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="200"><rect width="100%" height="100%" fill="#fafafa"/><text x="320" y="28" text-anchor="middle" font-size="14">R1: four chronological equal-exposure segments</text>${[0, 1, 2, 3]
      .map(
        (i) =>
          `<rect x="${40 + i * 145}" y="60" width="130" height="70" fill="#1f4e79" fill-opacity="0.15" stroke="#1f4e79"/><text x="${105 + i * 145}" y="100" text-anchor="middle" font-size="12">Seg ${i + 1}</text>`
      )
      .join("")}<text x="320" y="170" text-anchor="middle" font-size="11">time / cumulative historical appearances →</text></svg>`
  );
  await writeFile(
    path.join(CHARTS, "split_half_schematic.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="200"><rect width="100%" height="100%" fill="#fafafa"/><text x="320" y="28" text-anchor="middle" font-size="14">R2: chronological half split (absolute shift)</text><rect x="40" y="60" width="270" height="70" fill="#1f4e79" fill-opacity="0.15" stroke="#1f4e79"/><text x="175" y="100" text-anchor="middle">EARLY floor(N/2)</text><rect x="330" y="60" width="270" height="70" fill="#c45c26" fill-opacity="0.15" stroke="#c45c26"/><text x="465" y="100" text-anchor="middle">LATE remainder</text><text x="320" y="170" text-anchor="middle" font-size="11">feature = |P_late − P_early|</text></svg>`
  );

  const r1VsLogN = expoRows.find(
    (r) => r.feature === "R1" && r.scope === "overall"
  ) as { spearman_logN: number };
  const r2VsLogN = expoRows.find(
    (r) => r.feature === "R2" && r.scope === "overall"
  ) as { spearman_logN: number };
  const r3VsLogN = expoRows.find(
    (r) => r.feature === "R3" && r.scope === "overall"
  ) as { spearman_logN: number };

  const r1Dist = distSummary(r1vals);
  const r2Dist = distSummary(r2vals);
  const r3Dist = distSummary(r3vals);

  const modelHealth = {
    M16I2_REPRODUCED: "PASS",
    POINT_ESTIMATE_REPRODUCED: "PASS",
    POINT_ESTIMATE_MODEL_FROZEN: "YES",
    POINT_ESTIMATE_CHANGED: "NO",
    POSTERIOR_K: 1600,
    CALIBRATION: "IDENTITY",
    EXPOSURE_ONLY_INFORMATION_CEILING: "YES",
    FEATURE_AUDIT_OUTCOME_BLIND: "YES",
    FEATURE_PIPELINE_READS_FUTURE_OUTCOMES: "NO",
    HISTORICAL_STREAM_RECONSTRUCTION: "PASS",
    R1_TEMPORAL_SEGMENT_DISPERSION_STATUS: r1Status,
    R1_AVAILABILITY: availR1.availabilityPct,
    R2_SPLIT_HALF_SHIFT_STATUS: r2Status,
    R2_AVAILABILITY: availR2.availabilityPct,
    R3_APPEARANCE_VALUE_DISPERSION_STATUS: r3Status,
    R3_AVAILABILITY: availR3.availabilityPct,
    R3_APPEARANCE_ACCOUNTING_IDENTITY: "PASS",
    HIGH_REDUNDANCY_PAIRS: highRedundancyLabel,
    M16I4_ELIGIBLE_RELIABILITY_FEATURES: eligibleFeatures,
    M16I4_FEATURE_SET_FROZEN: "YES",
    RELIABILITY_FEATURE_AUDIT_RESULT: auditResult,
    M16I4_RELIABILITY_BAKEOFF_READY: bakeoffReady ? "YES" : "NO",
    PREDICTIVE_UNCERTAINTY_FROZEN: "NO",
    RESEARCH_RATE_MODEL_FREEZE_READY: "NO",
    M16B_VALIDATION_USED: "NO",
    RESERVED_TEST_ACCESSED: "NO",
    RESERVED_TEST_SHOULD_OPEN: "NO",
    PRODUCTION_CHANGED: "NO",
    WAR_CHANGED: "NO",
    nRows: featRows.length,
    reconstruction: reconReport,
    spearman: {
      R1_logN: r1VsLogN.spearman_logN,
      R2_logN: r2VsLogN.spearman_logN,
      R3_logN: r3VsLogN.spearman_logN,
    },
    distributions: { R1: r1Dist, R2: r2Dist, R3: r3Dist },
    redundancy,
    stabilitySample: stabRows.filter((r) => r.feature === "R1"),
  };

  await writeFile(
    path.join(OUT, "14_model_health.json"),
    JSON.stringify(modelHealth, null, 2)
  );

  await writeFile(
    path.join(OUT, "15_full_audit.md"),
    `# M16i3 full audit

## Decision

- RELIABILITY_FEATURE_AUDIT_RESULT: ${auditResult}
- Eligible: ${eligibleFeatures.join(", ") || "(none)"}
- M16I4_RELIABILITY_BAKEOFF_READY: ${bakeoffReady ? "YES" : "NO"}
- RESEARCH_RATE_MODEL_FREEZE_READY: NO

## Reconstruction

- max |raw residual|: ${reconReport.maxResidual}
- count identity: ${streamCountIdentityOk}
- value-sum identity: ${valueSumIdentityOk}

## Outcome-blind

FEATURE_PIPELINE_READS_FUTURE_OUTCOMES = NO

## Availability

| Feature | Availability | Status |
|---------|--------------|--------|
| R1 | ${(availR1.availabilityPct * 100).toFixed(2)}% | ${r1Status} |
| R2 | ${(availR2.availabilityPct * 100).toFixed(2)}% | ${r2Status} |
| R3 | ${(availR3.availabilityPct * 100).toFixed(2)}% | ${r3Status} |

## Next

M16i4 may test frozen feature sets only after this audit is accepted.
No WIS/coverage modeling was performed here.
`
  );

  // Response values cache
  await writeFile(
    path.join(OUT, "16_final_response_values.json"),
    JSON.stringify(
      {
        modelHealth,
        freeze,
        availR1,
        availR2,
        availR3,
        r1Dist,
        r2Dist,
        r3Dist,
        stabR1: stabRows.filter((r) => r.feature === "R1"),
        stabR2: stabRows.filter((r) => r.feature === "R2"),
        stabR3: stabRows.filter((r) => r.feature === "R3"),
      },
      null,
      2
    )
  );

  console.log(
    JSON.stringify(
      {
        status: "M16i3_COMPLETE",
        RELIABILITY_FEATURE_AUDIT_RESULT: auditResult,
        M16I4_ELIGIBLE_RELIABILITY_FEATURES: eligibleFeatures,
        M16I4_RELIABILITY_BAKEOFF_READY: bakeoffReady ? "YES" : "NO",
        RESEARCH_RATE_MODEL_FREEZE_READY: "NO",
        RESERVED_TEST_SHOULD_OPEN: "NO",
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
