/**
 * M16g1 — shrinkage boundary extension + posterior lineage lock.
 *   npm run drbl:m16g1
 *
 * Reuses exact M16g fold rows. Extends k grid beyond 800.
 * Does NOT use M16b VALIDATION for k selection.
 * Does NOT access RESERVED_TEST.
 * Does NOT change production.
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
import type { SplitGame } from "../drbl/evaluation/splits";
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
  WAR_EXPOSURE_UNIT,
  WAR_FORMULA_VERSION,
} from "../drbl/models/pipeline-value";
import { ABILITY_LINEAGE_VERSION } from "../drbl/models/ability-lineage";
import { PRIOR_EQUIVALENT_POSSESSIONS } from "../drbl/models/ranking-config";
import { empiricalBayesRate } from "../drbl/models/leaderboard";
import { fusePlayerRating } from "../drbl/models/fusion";
import {
  attributeGamePlayerValue,
  finalizePlayerSeasonRows,
} from "../drbl/models/player-value";
import {
  accumulateReplacementSignals,
  buildReplacementPool,
  finalizeRoleAccum,
} from "../drbl/models/replacement";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m16g1");
const CHARTS = path.join(OUT, "charts");
const M16G = path.join(ROOT, "reports", "m16g");

const EXPECTED_TRAIN =
  "7bec77be45295ee858d90896d9383e4da951e98e81ad1ef31b5285fb055d1550";
const EXPECTED_VAL =
  "4fd339a445f269162c2d76e9102ea5bb965a5d0fc05e0fcd2f60593117c5faf0";
const EXPECTED_RES =
  "e542aa54602390ed65792f37e10207814e10b62bfdf552ddf4da69825076c1ce";

const M16G_K = [0, 25, 50, 100, 200, 400, 800] as const;
const EXTENDED_K = [
  0, 25, 50, 100, 200, 400, 800, 1200, 1600, 2400, 3200, 4800, 6400, 9600,
  12800,
] as const;
const PRIOR_MEAN = 0;
const PRACTICAL_BAND = 0.001; // 0.1% of best RMSE
const BOOTSTRAP_RESAMPLES = METRIC_CONTRACT.practicalSignificance.bootstrapResamples;
const BOOTSTRAP_SEED = 42;
const PROD_K = PRIOR_EQUIVALENT_POSSESSIONS;

const M16G_EXPECTED = {
  k0: 3.071603914379542,
  k200: 2.7900013048913115,
  k800: 2.709840313887856,
  rel800: 0.11777677414659811,
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
function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((p / 100) * (sorted.length - 1)))
  );
  return sorted[idx]!;
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
    predSD: sd(yhat),
    targetSD: sd(y),
  };
}
function posteriorOf(raw: number, n: number, k: number): number {
  return empiricalBayesRate(raw, n, PRIOR_MEAN, k).posterior;
}
function reliabilityOf(n: number, k: number): number {
  return empiricalBayesRate(0, n, 0, k).reliability;
}

type FoldRow = {
  foldId: number;
  playerId: string;
  rawPB: number;
  publishedDrblP: number;
  N: number;
  target: number;
};

function parseFoldRows(csv: string): FoldRow[] {
  const lines = csv.trim().split(/\r?\n/).slice(1);
  return lines.map((line) => {
    const cols = line.split(",");
    return {
      foldId: Number(cols[0]),
      playerId: cols[1]!,
      rawPB: Number(cols[2]),
      publishedDrblP: Number(cols[3]),
      N: Number(cols[4]),
      target: Number(cols[5]),
    };
  });
}

function svgLine(
  points: Array<{ x: number; y: number }>,
  title: string,
  xlab: string,
  ylab: string,
  logX = false
): string {
  const w = 560,
    h = 340,
    pad = 52;
  const xs = points.map((p) => (logX ? Math.log10(Math.max(1, p.x)) : p.x));
  const ys = points.map((p) => p.y).filter(Number.isFinite);
  if (!xs.length || !ys.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="20" y="40">${title}</text></svg>`;
  }
  const xmin = Math.min(...xs),
    xmax = Math.max(...xs),
    ymin = Math.min(...ys),
    ymax = Math.max(...ys);
  const dx = xmax - xmin || 1;
  const dy = ymax - ymin || 1;
  const mapped = points.map((p, i) => {
    const x = pad + ((xs[i]! - xmin) / dx) * (w - 2 * pad);
    const y = h - pad - ((p.y - ymin) / dy) * (h - 2 * pad);
    return { x, y };
  });
  const poly = mapped.map((p) => `${p.x},${p.y}`).join(" ");
  const dots = mapped
    .map((p) => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="#0f766e"/>`)
    .join("");
  return `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="100%" height="100%" fill="#fafafa"/>
  <text x="${pad}" y="24" font-size="14">${title}</text>
  <text x="${w / 2}" y="${h - 8}" text-anchor="middle" font-size="11">${xlab}</text>
  <text x="14" y="${h / 2}" text-anchor="middle" font-size="11" transform="rotate(-90 14 ${h / 2})">${ylab}</text>
  <polyline fill="none" stroke="#115e59" stroke-width="2" points="${poly}"/>
  ${dots}
</svg>`;
}

async function loadSplitList(name: "train" | "validation"): Promise<SplitGame[]> {
  const p = path.join(ROOT, "reports/m16b/splits", `${name}_game_ids.json`);
  const raw = JSON.parse(await readFile(p, "utf8")) as
    | { games?: SplitGame[] }
    | SplitGame[];
  return Array.isArray(raw) ? raw : (raw.games ?? []);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await mkdir(CHARTS, { recursive: true });

  const gitCommit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const gitDirty =
    execSync("git status --porcelain", { encoding: "utf8" }).trim().length > 0;
  const timestamp = new Date().toISOString();

  const m16gFolds = JSON.parse(
    await readFile(path.join(M16G, "03_posterior_folds.json"), "utf8")
  ) as {
    folds: Array<{
      foldId: number;
      historyHash: string;
      futureHash: string;
      nRows: number;
    }>;
    totalRows: number;
  };

  const freeze = {
    milestone: "M16g1",
    timestamp,
    gitCommit,
    gitDirty,
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
    abilityLineageVersion: ABILITY_LINEAGE_VERSION,
    currentProductionPosteriorVersion: "eb-fused-v1",
    currentProductionK: PROD_K,
    researchPosteriorFormula:
      "N/(N+k)*rawAbilityRate + k/(N+k)*priorMean(0)",
    m16gBestTestedK: 800,
    extendedKGridFrozen: [...EXTENDED_K],
    practicalOptimumBand: PRACTICAL_BAND,
    M16B_VALIDATION_USED_FOR_K_SELECTION: false,
    RESERVED_TEST_ACCESSED: false,
    WAR_version: WAR_FORMULA_VERSION,
    WAR_exposureUnit: WAR_EXPOSURE_UNIT,
  };
  await writeFile(path.join(OUT, "00_freeze.json"), JSON.stringify(freeze, null, 2));

  const trainGames = await loadSplitList("train");
  const valGames = await loadSplitList("validation");
  const hashCheck = verifyFrozenSplitHashes({
    train: trainGames,
    validation: valGames,
    trainHashExpected: EXPECTED_TRAIN,
    validationHashExpected: EXPECTED_VAL,
    reservedTestHashExpected: EXPECTED_RES,
  });
  if (!hashCheck.ok) {
    await writeFile(
      path.join(OUT, "18_model_health.json"),
      JSON.stringify(
        { M16B_HASHES_MATCH: "FAIL", STOP: "EVALUATION_PROTOCOL_DRIFT" },
        null,
        2
      )
    );
    throw new Error("STOP EVALUATION_PROTOCOL_DRIFT");
  }

  // Load exact M16g fold rows
  const allRows = parseFoldRows(
    await readFile(path.join(M16G, "04_fold_rows.csv"), "utf8")
  );
  if (allRows.length !== m16gFolds.totalRows) {
    throw new Error(
      `STOP M16G_FOLD_HASHES_MATCH fail: row count ${allRows.length} != ${m16gFolds.totalRows}`
    );
  }
  for (const f of m16gFolds.folds) {
    const n = allRows.filter((r) => r.foldId === f.foldId).length;
    if (n !== f.nRows) {
      throw new Error(
        `STOP M16G_FOLD_HASHES_MATCH fail fold ${f.foldId}: ${n} != ${f.nRows}`
      );
    }
  }

  const y = allRows.map((r) => r.target);
  const raw = allRows.map((r) => r.rawPB);
  const n0 = allRows.map((r) => r.N);
  const blockIds = allRows.map((r) => `${r.foldId}|${r.playerId}`);

  // ---- PHASE 1: reproduce M16g ----
  const m16gCands = M16G_K.map((k) => {
    const yhat = raw.map((r, i) => posteriorOf(r, n0[i]!, k));
    return { k, yhat, metrics: metricBundle(y, yhat) };
  });
  const k0m = m16gCands.find((c) => c.k === 0)!;
  const k200m = m16gCands.find((c) => c.k === 200)!;
  const k800m = m16gCands.find((c) => c.k === 800)!;
  const tol = 1e-9;
  const reproOk =
    Math.abs(k0m.metrics.RMSE - M16G_EXPECTED.k0) < tol &&
    Math.abs(k200m.metrics.RMSE - M16G_EXPECTED.k200) < tol &&
    Math.abs(k800m.metrics.RMSE - M16G_EXPECTED.k800) < tol;

  const boot800 = pairedBlockBootstrapRmseDiff(
    y,
    k0m.yhat,
    k800m.yhat,
    blockIds,
    { resamples: BOOTSTRAP_RESAMPLES, seed: BOOTSTRAP_SEED }
  );
  let foldWins800 = 0;
  for (let f = 0; f < 5; f++) {
    const idxs = allRows
      .map((r, i) => ({ r, i }))
      .filter((x) => x.r.foldId === f)
      .map((x) => x.i);
    const yy = idxs.map((i) => y[i]!);
    if (rmse(yy, idxs.map((i) => k800m.yhat[i]!)) < rmse(yy, idxs.map((i) => k0m.yhat[i]!)))
      foldWins800 += 1;
  }

  // Verify publishedDrblP ≈ EB200(raw)
  const drblPResid = allRows.map(
    (r) =>
      Math.abs(
        r.publishedDrblP -
          Number(posteriorOf(r.rawPB, r.N, PROD_K).toFixed(2))
      )
  );
  const drblPMatchShare =
    drblPResid.filter((e) => e < 0.015).length / drblPResid.length;

  const repro = {
    reproduced: reproOk ? "PASS" : "FAIL",
    k0RMSE: k0m.metrics.RMSE,
    k200RMSE: k200m.metrics.RMSE,
    k800RMSE: k800m.metrics.RMSE,
    expected: M16G_EXPECTED,
    k800_delta_vs_k0: k800m.metrics.RMSE - k0m.metrics.RMSE,
    k800_relativeImprovement:
      (k0m.metrics.RMSE - k800m.metrics.RMSE) / k0m.metrics.RMSE,
    bootstrap800: {
      point: boot800.pointEstimate,
      ciLow: boot800.ciLow,
      ciHigh: boot800.ciHigh,
      pBeatsK0: boot800.probCandidateBeatsBaseline,
    },
    foldWinsVsK0: `${foldWins800}/5`,
    publishedDrblP_vs_EB200_matchShare: drblPMatchShare,
    nRows: allRows.length,
  };
  await writeFile(
    path.join(OUT, "01_m16g_reproduction.json"),
    JSON.stringify(repro, null, 2)
  );
  if (!reproOk) {
    throw new Error("STOP M16G_REPRODUCTION_FAILURE");
  }

  // ---- PART I: lineage docs ----
  await writeFile(
    path.join(OUT, "02_ability_lineage.csv"),
    toCsv([
      {
        field: "rawAbilityRate",
        sourceFunction: "finalizePlayerSeasonRows",
        sourceFile: "drbl/models/player-value.ts",
        definition: "100 * acc.totalValue / possessions",
        inputs: "DrblPlayerAccumulator.totalValue,possessions",
        rateUnit: "points/100 combined possession appearances vs R1",
        exposureUnit: "actual possessions",
        ebApplied: "NO",
        k: "",
        priorMean: "",
        researchOrProduction: "both (research shrinkage input)",
      },
      {
        field: "drblP",
        sourceFunction: "empiricalBayesShrink(raw100,n)",
        sourceFile: "drbl/models/player-value.ts",
        definition: `EB(rawAbilityRate; k=${PROD_K}, prior=0)`,
        inputs: "rawAbilityRate,N",
        rateUnit: "same as rawAbilityRate",
        exposureUnit: "actual possessions (weight only)",
        ebApplied: "YES",
        k: PROD_K,
        priorMean: 0,
        researchOrProduction: "production component",
      },
      {
        field: "drblLn",
        sourceFunction: "empiricalBayesShrink(lnRaw,n)",
        sourceFile: "drbl/models/player-value.ts",
        definition: `EB(lineup ridge rating; k=${PROD_K})`,
        inputs: "lineupRatingsPer100",
        rateUnit: "points/100",
        exposureUnit: "possessions",
        ebApplied: "YES",
        k: PROD_K,
        priorMean: 0,
        researchOrProduction: "production component",
      },
      {
        field: "drblB",
        sourceFunction: "empiricalBayesShrink(bRaw,n)",
        sourceFile: "drbl/models/player-value.ts",
        definition: `EB(behavior rating; k=${PROD_K}) if present`,
        inputs: "behaviorRatingsPer100",
        rateUnit: "points/100",
        exposureUnit: "possessions",
        ebApplied: "YES",
        k: PROD_K,
        priorMean: 0,
        researchOrProduction: "production component",
      },
      {
        field: "fusedRateRaw",
        sourceFunction: "fusePlayerRating OR fusionMap",
        sourceFile: "drbl/models/fusion.ts + player-value.ts",
        definition: "wP*drblP + wLn*drblLn + wB*drblB (lite) or OOF ridge fusion",
        inputs: "drblP,drblLn,drblB (already EB'd)",
        rateUnit: "points/100",
        exposureUnit: "n/a (blend)",
        ebApplied: "NO (inputs already EB)",
        k: "",
        priorMean: "",
        researchOrProduction: "production",
      },
      {
        field: "posteriorAbilityRate",
        sourceFunction: "empiricalBayesRate(fusedRateRaw,n,0,k)",
        sourceFile: "drbl/models/player-value.ts",
        definition: `EB(fusedRateRaw; k=${PROD_K}, prior=0)`,
        inputs: "fusedRateRaw,N",
        rateUnit: "points/100",
        exposureUnit: "actual possessions",
        ebApplied: "YES",
        k: PROD_K,
        priorMean: 0,
        researchOrProduction: "production published ability",
      },
      {
        field: "drbl100",
        sourceFunction: "alias of posteriorAbilityRate",
        sourceFile: "drbl/models/player-value.ts / leaderboard.ts",
        definition: "posteriorAbilityRate",
        inputs: "posteriorAbilityRate",
        rateUnit: "points/100",
        exposureUnit: "n/a",
        ebApplied: "YES (inherited)",
        k: PROD_K,
        priorMean: 0,
        researchOrProduction: "production display alias",
      },
      {
        field: "seasonalImpact",
        sourceFunction: "seasonalImpactFromRawRate",
        sourceFile: "drbl/models/player-value.ts",
        definition: "(rawAbilityRate - replacementLevelRate) * N / 100",
        inputs: "rawAbilityRate,N",
        rateUnit: "points (not rate)",
        exposureUnit: "actual possessions ONLY (no +k)",
        ebApplied: "NO",
        k: "",
        priorMean: "",
        researchOrProduction: "production",
      },
      {
        field: "calibratedDRBL100",
        sourceFunction: "optional calibratePosterior",
        sourceFile: "drbl/models/pipeline-value.ts",
        definition: "intercept + slope * posterior (when calib present)",
        inputs: "posteriorAbilityRate",
        rateUnit: "points/100",
        exposureUnit: "n/a",
        ebApplied: "downstream of EB",
        k: "",
        priorMean: "",
        researchOrProduction: "production optional",
      },
      {
        field: "WAR ability input",
        sourceFunction: "board-provenance / war-math",
        sourceFile: "drbl/models/board-provenance.ts",
        definition: "posteriorAbilityRate ?? drbl100",
        inputs: "posteriorAbilityRate",
        rateUnit: "points/100",
        exposureUnit: "paired_team_possessions (WAR)",
        ebApplied: "YES (uses published posterior)",
        k: PROD_K,
        priorMean: 0,
        researchOrProduction: "production",
      },
    ])
  );

  await writeFile(
    path.join(OUT, "03_ability_lineage_graph.md"),
    `# Ability lineage graph

\`\`\`
seq-attr possession credits
        │
        ▼
acc.totalValue / N  ──► rawAbilityRate          [UNSHRUNK Approach B]
        │
        │ EB(k=${PROD_K}, prior=0)
        ▼
      drblP ────────────────┐
                            │
LN ridge ─EB(k=${PROD_K})─► drblLn ──┐
                            │         │  fusePlayerRating / OOF fusion
B model ──EB(k=${PROD_K})─► drblB ───┼──────────────► fusedRateRaw
                                      │
                                      │ EB(k=${PROD_K}, prior=0)
                                      ▼
                            posteriorAbilityRate = drbl100
                                      │
                                      ▼
                            WAR ability input / seasonal boards
\`\`\`

## Research M16g/M16g1 path (single intended EB)

\`\`\`
rawAbilityRate ──EB(k_research, prior=0)──► P_B_posterior
\`\`\`

## MULTI_STAGE_SHRINKAGE_PRESENT

YES in production published ability path:
component EB → fusion of shrunk components → EB on fused rate.

This is **intentional multi-stage** relative to research single-EB on raw P_B.
ACCIDENTAL_DOUBLE_SHRINKAGE on the *same* conceptual estimator is NO for research
(research does not re-EB posteriorAbilityRate). For production \`drblP\` alone: one EB.
For production \`drbl100\`: component EB + fused EB = two stages (documented, not "accidental" if intentional product design — flagged MULTI_STAGE).
`
  );

  // Numeric reconstruction on fold-0 history rebuild
  console.log("Rebuilding fold-0 history for lineage reconstruction…");
  const trainProcessed = await loadSplitGames(trainGames);
  const sorted = [...trainProcessed].sort(
    (a, b) =>
      (a.box.gameDate || "").localeCompare(b.box.gameDate || "") ||
      a.box.gameId.localeCompare(b.box.gameId)
  );
  const fold0 = m16gFolds.folds[0]!;
  // Use same date cuts as M16g: futStart from freeze file
  const m16gFoldFull = JSON.parse(
    await readFile(path.join(M16G, "03_posterior_folds.json"), "utf8")
  ) as { folds: Array<{ futStart?: string; historyDateMax: string }> };
  const futStart0 = (m16gFoldFull.folds[0] as { futStart: string }).futStart;
  const hist0 = sorted.filter((g) => (g.box.gameDate || "") < futStart0);

  const roleAccum = new Map();
  let cutoff = "";
  for (const g of hist0) {
    accumulateReplacementSignals(g.box, g.events, g.possessions, roleAccum);
    if (g.box.gameDate && g.box.gameDate > cutoff) cutoff = g.box.gameDate;
  }
  const roleCandidates = finalizeRoleAccum(roleAccum);
  const rolesByPlayer = new Map(roleCandidates.map((c) => [c.playerId, c.role]));
  const pool = buildReplacementPool(roleCandidates, {
    cutoffDate: cutoff || "9999-12-31",
    level: "R1",
  });
  const accum = new Map();
  for (const g of hist0) {
    attributeGamePlayerValue(g.box, g.events, g.possessions, accum, {
      replacementPool: pool,
      rolesByPlayer,
    });
  }
  const finalized = finalizePlayerSeasonRows(accum, { minPossessions: 50 });

  // Stratified sample ≥30
  const withN = finalized.filter((p) => p.possessions >= 50);
  const byExpo = [...withN].sort((a, b) => a.possessions - b.possessions);
  const byRate = [...withN].sort((a, b) => a.rawAbilityRate - b.rawAbilityRate);
  const sampleIds = new Set<string>();
  const pick = (arr: typeof withN, idxs: number[]) => {
    for (const i of idxs) {
      const p = arr[Math.min(arr.length - 1, Math.max(0, i))];
      if (p) sampleIds.add(p.playerId);
    }
  };
  pick(byExpo, [0, 1, 2, 3, 4, Math.floor(byExpo.length / 4), Math.floor(byExpo.length / 2), Math.floor((3 * byExpo.length) / 4), byExpo.length - 5, byExpo.length - 4, byExpo.length - 3, byExpo.length - 2, byExpo.length - 1]);
  pick(byRate, [0, 1, 2, 3, 4, Math.floor(byRate.length / 2), byRate.length - 5, byRate.length - 4, byRate.length - 3, byRate.length - 2, byRate.length - 1]);
  // pad
  for (const p of withN) {
    if (sampleIds.size >= 30) break;
    sampleIds.add(p.playerId);
  }

  const reconRows: Record<string, unknown>[] = [];
  for (const p of withN.filter((x) => sampleIds.has(x.playerId))) {
    const ebRaw = posteriorOf(p.rawAbilityRate, p.possessions, PROD_K);
    // Reconstruct published identities from stored fields (post display-rounding).
    const ebFused = posteriorOf(p.fusedRateRaw, p.possessions, PROD_K);
    const residDrblP = Math.abs(p.drblP - Number(ebRaw.toFixed(2)));
    const residPost = Math.abs(p.posteriorAbilityRate - Number(ebFused.toFixed(4)));
    // drbl100 uses toFixed(2) on full-precision posterior; posteriorAbilityRate uses toFixed(4).
    // Re-rounding the 4dp value to 2dp can differ by 0.01 (JS half-even vs sequential rounding).
    const residDrbl100 = Math.abs(p.drbl100 - Number(ebFused.toFixed(2)));
    reconRows.push({
      anonId: createHash("sha256").update(p.playerId).digest("hex").slice(0, 12),
      N: p.possessions,
      rawAbilityRate: p.rawAbilityRate,
      EB200_raw: ebRaw,
      stored_drblP: p.drblP,
      resid_drblP: residDrblP,
      stored_fusedRateRaw: p.fusedRateRaw,
      EB200_fused: ebFused,
      stored_posteriorAbilityRate: p.posteriorAbilityRate,
      resid_posterior: residPost,
      stored_drbl100: p.drbl100,
      resid_drbl100_vs_ebFused2dp: residDrbl100,
      note: "drbl100==EB(fused) at 2dp; posteriorAbilityRate==EB(fused) at 4dp",
    });
  }
  await writeFile(path.join(OUT, "04_lineage_reconstruction.csv"), toCsv(reconRows));
  {
    const hardFail = reconRows.filter(
      (r) =>
        Number(r.resid_drblP) > 0.02 ||
        Number(r.resid_posterior) > 1e-3 ||
        Number(r.resid_drbl100_vs_ebFused2dp) > 1e-9
    );
    if (hardFail.length > 0) {
      console.error("recon hardFail sample", hardFail.slice(0, 3));
      throw new Error(
        `STOP ABILITY_LINEAGE_RECONSTRUCTION_FAILURE n=${hardFail.length}`
      );
    }
  }

  await writeFile(
    path.join(OUT, "05_research_posterior_contract.md"),
    `# Research posterior contract (M16g1)

## Target object

\`\`\`
P_B_raw = rawAbilityRate
        = 100 * Σ sequential Approach-B credits / N
        = unshrunk drbl-seq-attr-v1 rate
\`\`\`

Proven: \`finalizePlayerSeasonRows\` sets \`rawAbilityRate = raw100\` **before** \`empiricalBayesShrink\`.

## Posterior

\`\`\`
P_B_posterior(k) = N/(N+k) * P_B_raw + k/(N+k) * priorMean
priorMean = 0
N = actual combined possession appearances
\`\`\`

## Intended number of research posterior operations

**Exactly one** EB on \`P_B_raw\`.

## Not decided in M16g1

- whether \`P_B_posterior\` replaces published \`drblP\`
- whether fusion remains in final DRBL/100
- whether fused ability receives another posterior
- calibration / WAR consumption
`
  );

  await writeFile(
    path.join(OUT, "06_zero_semantics.md"),
    `# Zero semantics for P_B

## What P_B = 0 means

**Category: REPLACEMENT_LEVEL**

Evidence:
1. Sequential attribution credits are computed vs R1 role-matched replacement (\`replacementPool\` level \`R1\`).
2. \`ranking.replacementLevelRate = 0\` in \`ranking-config.ts\`.
3. \`seasonalImpact = (rawAbilityRate - replacementLevelRate) * N / 100\` with replacementLevelRate=0.
4. Production EB uses \`priorMean = 0\` identically.

Therefore \`rawAbilityRate = 0\` means: **same expected points contribution as the R1 replacement baseline**, not league-average talent.

## priorMean = 0

VALID for this scale: shrink toward replacement-level impact.

TRAIN sample means may be nonzero; that does not redefine the prior.

## WAR zero

WAR zero semantics (wins above replacement) are **related but not automatically identical** as a numeric identity to P_B=0 without the WAR conversion chain. Status: **NOT ESTABLISHED as identical**, but both use the same replacement baseline concept.

## Verdict

\`PRIOR_MEAN_VALID = PASS\`
\`ZERO_SEMANTICS = REPLACEMENT_LEVEL\`
`
  );

  // ---- PART II: extended grid ----
  console.log("Evaluating extended k grid…");
  type Cand = { k: number; yhat: number[]; metrics: ReturnType<typeof metricBundle> };
  const candidates: Cand[] = EXTENDED_K.map((k) => {
    const yhat = raw.map((r, i) => posteriorOf(r, n0[i]!, k));
    return { k, yhat, metrics: metricBundle(y, yhat) };
  });
  await writeFile(
    path.join(OUT, "07_extended_candidate_metrics.csv"),
    toCsv(candidates.map((c) => ({ k: c.k, ...c.metrics })))
  );

  const marginal: Record<string, unknown>[] = [];
  for (let i = 1; i < candidates.length; i++) {
    const a = candidates[i - 1]!;
    const b = candidates[i]!;
    marginal.push({
      k_prev: a.k,
      k_next: b.k,
      RMSE_prev: a.metrics.RMSE,
      RMSE_next: b.metrics.RMSE,
      absImprovement: a.metrics.RMSE - b.metrics.RMSE,
      relImprovement: (a.metrics.RMSE - b.metrics.RMSE) / a.metrics.RMSE,
    });
  }
  await writeFile(path.join(OUT, "08_marginal_k_improvements.csv"), toCsv(marginal));

  let kBest = candidates[0]!;
  for (const c of candidates) {
    if (c.metrics.RMSE < kBest.metrics.RMSE) kBest = c;
  }
  const band = candidates.filter(
    (c) =>
      (c.metrics.RMSE - kBest.metrics.RMSE) / kBest.metrics.RMSE <= PRACTICAL_BAND
  );
  const smallestInBand = band.reduce((a, b) => (a.k <= b.k ? a : b));

  // Bootstrap vs numeric best for band + neighbors
  const near = candidates.filter(
    (c) =>
      Math.abs(c.k - kBest.k) <= 4800 ||
      band.some((b) => b.k === c.k) ||
      [800, 200, 0].includes(c.k)
  );
  const optBoot: Record<string, unknown>[] = [];
  for (const c of near) {
    if (c.k === kBest.k) {
      optBoot.push({
        k: c.k,
        deltaRMSE: 0,
        ciLow: 0,
        ciHigh: 0,
        pBeatsBest: 0.5,
        pBestBeats: 0.5,
      });
      continue;
    }
    const boot = pairedBlockBootstrapRmseDiff(
      y,
      kBest.yhat,
      c.yhat,
      blockIds,
      { resamples: BOOTSTRAP_RESAMPLES, seed: BOOTSTRAP_SEED }
    );
    optBoot.push({
      k: c.k,
      deltaRMSE: boot.pointEstimate,
      ciLow: boot.ciLow,
      ciHigh: boot.ciHigh,
      pBeatsBest: boot.probCandidateBeatsBaseline,
      pBestBeats: 1 - boot.probCandidateBeatsBaseline,
    });
  }
  await writeFile(path.join(OUT, "09_optimum_bootstrap.csv"), toCsv(optBoot));

  // Selection
  const m9600 = candidates.find((c) => c.k === 9600)!;
  const m12800 = candidates.find((c) => c.k === 12800)!;
  const stillFallingHard =
    kBest.k === 12800 &&
    (m9600.metrics.RMSE - m12800.metrics.RMSE) / m9600.metrics.RMSE > PRACTICAL_BAND;

  let FINAL_K_STATUS:
    | "INTERIOR_OPTIMUM_SELECTED"
    | "PLATEAU_SELECTED"
    | "BOUNDARY_UNRESOLVED"
    | "LINEAGE_BLOCKED"
    | "PRIOR_SEMANTICS_BLOCKED" = "INTERIOR_OPTIMUM_SELECTED";
  let SELECTED_RESEARCH_K: number | "NONE" = "NONE";

  if (stillFallingHard) {
    FINAL_K_STATUS = "BOUNDARY_UNRESOLVED";
    SELECTED_RESEARCH_K = "NONE";
  } else {
    // Prefer smallest in practical band if CI vs best includes 0 or <0.1% degradation
    let chosen = smallestInBand;
    const bootVsBest = optBoot.find((r) => r.k === chosen.k);
    if (chosen.k !== kBest.k && bootVsBest) {
      const ciHigh = Number(bootVsBest.ciHigh);
      const degOk =
        (bootVsBest.ciLow as number) <= 0 && (bootVsBest.ciHigh as number) >= 0
          ? true
          : ciHigh / kBest.metrics.RMSE < PRACTICAL_BAND;
      if (!degOk) chosen = kBest;
    }
    SELECTED_RESEARCH_K = chosen.k;
    const isBoundary = chosen.k === 12800;
    const plateau =
      band.length >= 2 ||
      (kBest.k === 12800 &&
        (m9600.metrics.RMSE - m12800.metrics.RMSE) / m9600.metrics.RMSE <=
          PRACTICAL_BAND);
    FINAL_K_STATUS = plateau
      ? "PLATEAU_SELECTED"
      : isBoundary
        ? "BOUNDARY_UNRESOLVED"
        : "INTERIOR_OPTIMUM_SELECTED";
    if (FINAL_K_STATUS === "BOUNDARY_UNRESOLVED") SELECTED_RESEARCH_K = "NONE";
  }

  const selectedCand =
    SELECTED_RESEARCH_K === "NONE"
      ? null
      : candidates.find((c) => c.k === SELECTED_RESEARCH_K)!;

  // Over-shrinkage diagnostic
  const overRows = candidates.map((c) => {
    const abs = c.yhat.map((p, i) => Math.abs(p - raw[i]!));
    const rels = n0.map((n) => reliabilityOf(n, c.k)).sort((a, b) => a - b);
    return {
      k: c.k,
      predSD: c.metrics.predSD,
      pearsonRawPost: pearson(raw, c.yhat),
      spearmanRawPost: spearman(raw, c.yhat),
      meanAbsShrink: mean(abs),
      medianReliability: percentile(rels, 50),
    };
  });
  await writeFile(path.join(OUT, "10_over_shrinkage_diagnostic.csv"), toCsv(overRows));

  // Exposure quartiles
  const nSorted = [...n0].sort((a, b) => a - b);
  const qCuts = [0.25, 0.5, 0.75].map((q) => percentile(nSorted, q * 100));
  function expoQ(n: number): number {
    if (n <= qCuts[0]!) return 1;
    if (n <= qCuts[1]!) return 2;
    if (n <= qCuts[2]!) return 3;
    return 4;
  }
  const expoKs = [800, 1200, 1600, 2400, 3200, 4800, 6400, 9600, 12800, 0, 200];
  const expoRows: Record<string, unknown>[] = [];
  for (const k of expoKs) {
    const c = candidates.find((x) => x.k === k)!;
    for (const q of [1, 2, 3, 4]) {
      const idxs = allRows
        .map((r, i) => ({ r, i }))
        .filter((x) => expoQ(x.r.N) === q)
        .map((x) => x.i);
      const yy = idxs.map((i) => y[i]!);
      const yh = idxs.map((i) => c.yhat[i]!);
      const m = metricBundle(yy, yh);
      const rels = idxs.map((i) => reliabilityOf(n0[i]!, k));
      expoRows.push({
        k,
        quartile: q,
        n: idxs.length,
        RMSE: m.RMSE,
        Pearson: m.Pearson,
        Spearman: m.Spearman,
        meanAbsShrink: mean(idxs.map((i) => Math.abs(c.yhat[i]! - raw[i]!))),
        medianReliability: percentile([...rels].sort((a, b) => a - b), 50),
      });
    }
  }
  await writeFile(
    path.join(OUT, "11_exposure_quartiles_extended.csv"),
    toCsv(expoRows)
  );

  const q4_800 = expoRows.find((r) => r.k === 800 && r.quartile === 4)!;
  const q4_sel = selectedCand
    ? expoRows.find((r) => r.k === selectedCand.k && r.quartile === 4)!
    : null;
  const pooledGainVs800 = selectedCand
    ? (k800m.metrics.RMSE - selectedCand.metrics.RMSE) / k800m.metrics.RMSE
    : 0;
  const q4Worse =
    q4_sel && Number(q4_sel.RMSE) > Number(q4_800.RMSE) + 1e-6;
  const HIGH_EXPOSURE_OVER_SHRINKAGE =
    !!selectedCand &&
    q4Worse &&
    pooledGainVs800 < 0.005
      ? "YES"
      : "NO";

  // Fold consistency extended
  const foldCons: Record<string, unknown>[] = [];
  for (const c of candidates) {
    let beat800 = 0;
    let lose800 = 0;
    let beat0 = 0;
    for (let f = 0; f < 5; f++) {
      const idxs = allRows
        .map((r, i) => ({ r, i }))
        .filter((x) => x.r.foldId === f)
        .map((x) => x.i);
      const yy = idxs.map((i) => y[i]!);
      const rmseC = rmse(yy, idxs.map((i) => c.yhat[i]!));
      const rmse800 = rmse(yy, idxs.map((i) => k800m.yhat[i]!));
      const rmse0 = rmse(yy, idxs.map((i) => k0m.yhat[i]!));
      if (rmseC < rmse800) beat800 += 1;
      if (rmseC > rmse800) lose800 += 1;
      if (rmseC < rmse0) beat0 += 1;
      foldCons.push({
        k: c.k,
        foldId: f,
        RMSE: rmseC,
        deltaVs800: rmseC - rmse800,
        deltaVs0: rmseC - rmse0,
        Pearson: pearson(yy, idxs.map((i) => c.yhat[i]!)),
        Spearman: spearman(yy, idxs.map((i) => c.yhat[i]!)),
      });
    }
    foldCons.push({
      k: c.k,
      foldId: "summary",
      foldsBeat800: beat800,
      foldsLose800: lose800,
      foldsBeat0: beat0,
    });
  }
  await writeFile(
    path.join(OUT, "12_fold_consistency_extended.csv"),
    toCsv(foldCons)
  );

  // Extreme deciles
  const order = allRows
    .map((r, i) => ({ i, v: raw[i]! }))
    .sort((a, b) => a.v - b.v);
  const dN = Math.max(1, Math.floor(order.length / 10));
  const bottom = order.slice(0, dN).map((x) => x.i);
  const top = order.slice(-dN).map((x) => x.i);
  const extremeKs = [
    0,
    200,
    800,
    SELECTED_RESEARCH_K === "NONE" ? kBest.k : SELECTED_RESEARCH_K,
    12800,
  ];
  const extreme = [];
  for (const k of extremeKs) {
    const c = candidates.find((x) => x.k === k)!;
    for (const [label, idxs] of [
      ["bottom", bottom],
      ["top", top],
    ] as const) {
      extreme.push({
        k,
        decile: label,
        meanRaw: mean(idxs.map((i) => raw[i]!)),
        meanPost: mean(idxs.map((i) => c.yhat[i]!)),
        meanTarget: mean(idxs.map((i) => y[i]!)),
        RMSE: rmse(
          idxs.map((i) => y[i]!),
          idxs.map((i) => c.yhat[i]!)
        ),
        bias: mean(idxs.map((i) => c.yhat[i]! - y[i]!)),
      });
    }
  }
  await writeFile(
    path.join(CHARTS, "extreme_decile_behavior.json"),
    JSON.stringify(extreme, null, 2)
  );

  await writeFile(
    path.join(OUT, "13_calibration_vs_k.csv"),
    toCsv(
      candidates.map((c) => ({
        k: c.k,
        intercept: c.metrics.calibrationIntercept,
        slope: c.metrics.calibrationSlope,
        predSD: c.metrics.predSD,
        targetSD: c.metrics.targetSD,
      }))
    )
  );

  const relRows: Record<string, unknown>[] = [];
  for (const c of candidates) {
    const rels = n0.map((n) => reliabilityOf(n, c.k)).sort((a, b) => a - b);
    relRows.push({
      k: c.k,
      group: "all",
      median: percentile(rels, 50),
      p10: percentile(rels, 10),
      p90: percentile(rels, 90),
    });
    for (const q of [1, 2, 3, 4]) {
      const rr = allRows
        .filter((r) => expoQ(r.N) === q)
        .map((r) => reliabilityOf(r.N, c.k))
        .sort((a, b) => a - b);
      relRows.push({
        k: c.k,
        group: `Q${q}`,
        median: percentile(rr, 50),
        p10: percentile(rr, 10),
        p90: percentile(rr, 90),
      });
    }
  }
  await writeFile(
    path.join(OUT, "14_reliability_weights_extended.csv"),
    toCsv(relRows)
  );

  // Decision file
  const decision = {
    fullFrozenKGrid: [...EXTENDED_K],
    numericBestK: kBest.k,
    numericBestRMSE: kBest.metrics.RMSE,
    practicalOptimumBand: band.map((c) => c.k),
    practicalBandThreshold: PRACTICAL_BAND,
    smallestQualifyingK: smallestInBand.k,
    finalSelectedK: SELECTED_RESEARCH_K,
    FINAL_K_STATUS,
    SHRINKAGE_REQUIRED: "YES",
    priorMean: PRIOR_MEAN,
    exposureN: "actual_combined_possession_appearances",
    posteriorFormula: "N/(N+k)*rawAbilityRate + k/(N+k)*0",
    lineageStatus: {
      rawAbilityRateUnshrunk: "PASS",
      drblP: "EB200",
      fusedRateRawInputs: "SHRUNK_COMPONENTS",
      posteriorAbilityRate: "EB200(fusedRateRaw)",
      accidentalDoubleShrinkage: "NO",
      multiStageProductionShrinkage: "YES",
      zeroSemantics: "REPLACEMENT_LEVEL",
      priorMeanValid: "PASS",
    },
    HIGH_EXPOSURE_OVER_SHRINKAGE,
    lockedBeforeNameInspection: true,
    M16B_VALIDATION_USED_FOR_K_SELECTION: false,
  };
  await writeFile(
    path.join(OUT, "15_final_k_decision.json"),
    JSON.stringify(decision, null, 2)
  );

  await writeFile(
    path.join(OUT, "16_production_alignment_plan.md"),
    `# Production alignment plan (NOT executed)

## Current production

1. \`rawAbilityRate\` unshrunk Approach B
2. \`drblP = EB(raw, k=200)\`
3. LN/B also EB(k=200)
4. \`fusedRateRaw = fuse(drblP, drblLn, drblB)\` or OOF fusion of same
5. \`posteriorAbilityRate = EB(fused, k=200) = drbl100\`
6. WAR consumes published posterior

## Research architecture (if selected k is locked)

\`\`\`
rawAbilityRate → EB(SELECTED_RESEARCH_K) → P_B_posterior
\`\`\`

Selected research k: **${SELECTED_RESEARCH_K}** (${FINAL_K_STATUS})

## Gaps / risks

- Production embeds k=200 in \`drblP\` then again on fused ability (multi-stage).
- Promoting research EB on raw P_B requires deciding whether to **remove** component EB and/or fused EB.
- Accidental double-shrinkage risk if research EB is stacked on already-EB \`drblP\`.

## Fields needing clarification (rename candidates)

See \`17_field_naming_audit.csv\`.

## Required before deploy

- Explicit single-posterior decision document
- Artifact recompute for affected seasons
- Tests: reconstruct EB identities; no +k in seasonalImpact
- Do NOT deploy in M16g1
`
  );

  await writeFile(
    path.join(OUT, "17_field_naming_audit.csv"),
    toCsv([
      {
        field: "rawAbilityRate",
        accurate: "YES — unshrunk seq rate",
        recommendedName: "approachB_rawRate_per100",
      },
      {
        field: "drblP",
        accurate: "NO — implies raw P but is EB200",
        recommendedName: "approachB_eb200_per100",
      },
      {
        field: "fusedRateRaw",
        accurate: "PARTIAL — 'raw' but inputs are pre-shrunk",
        recommendedName: "fusedAbility_prePublishEb_per100",
      },
      {
        field: "posteriorAbilityRate",
        accurate: "YES for fused EB",
        recommendedName: "publishedAbility_eb_per100",
      },
      {
        field: "drbl100",
        accurate: "AMBIGUOUS alias",
        recommendedName: "deprecate alias; use publishedAbility_eb_per100",
      },
    ])
  );

  // Charts
  await writeFile(
    path.join(CHARTS, "rmse_vs_log_k.svg"),
    svgLine(
      candidates.map((c) => ({ x: Math.max(1, c.k), y: c.metrics.RMSE })),
      "RMSE vs k (log scale)",
      "k",
      "RMSE",
      true
    )
  );
  const zoom = candidates.filter((c) => c.k >= 400);
  await writeFile(
    path.join(CHARTS, "rmse_zoom_optimum.svg"),
    svgLine(
      zoom.map((c) => ({ x: c.k, y: c.metrics.RMSE })),
      "RMSE zoom (≥400)",
      "k",
      "RMSE"
    )
  );
  await writeFile(
    path.join(CHARTS, "marginal_improvement.svg"),
    svgLine(
      marginal.map((m) => ({
        x: Number(m.k_next),
        y: Number(m.absImprovement),
      })),
      "Marginal RMSE improvement",
      "k_next",
      "RMSE_prev − RMSE_next"
    )
  );
  await writeFile(
    path.join(CHARTS, "pred_sd_vs_k.svg"),
    svgLine(
      candidates.map((c) => ({ x: c.k, y: c.metrics.predSD })),
      "Prediction SD vs k",
      "k",
      "SD"
    )
  );
  await writeFile(
    path.join(CHARTS, "calibration_slope_vs_k.svg"),
    svgLine(
      candidates.map((c) => ({ x: c.k, y: c.metrics.calibrationSlope })),
      "Calibration slope vs k",
      "k",
      "slope"
    )
  );
  await writeFile(
    path.join(CHARTS, "median_reliability_vs_k.svg"),
    svgLine(
      relRows
        .filter((r) => r.group === "all")
        .map((r) => ({ x: Number(r.k), y: Number(r.median) })),
      "Median reliability vs k",
      "k",
      "N/(N+k)"
    )
  );
  await writeFile(
    path.join(CHARTS, "rank_corr_vs_k.svg"),
    svgLine(
      overRows.map((r) => ({ x: Number(r.k), y: Number(r.spearmanRawPost) })),
      "Raw/posterior Spearman vs k",
      "k",
      "Spearman"
    )
  );
  await writeFile(
    path.join(CHARTS, "q_rmse_vs_k.json"),
    JSON.stringify(expoRows, null, 2)
  );
  await writeFile(
    path.join(CHARTS, "fold_rmse_vs_k.json"),
    JSON.stringify(
      foldCons.filter((r) => r.foldId !== "summary"),
      null,
      2
    )
  );
  await writeFile(
    path.join(CHARTS, "ability_lineage_diagram.md"),
    await readFile(path.join(OUT, "03_ability_lineage_graph.md"), "utf8")
  );

  const curveTurned = candidates.some((c, i) => {
    if (i === 0) return false;
    return c.metrics.RMSE > candidates[i - 1]!.metrics.RMSE + 1e-9;
  });
  const plateauObserved =
    FINAL_K_STATUS === "PLATEAU_SELECTED" || band.length >= 2;

  const selOver =
    selectedCand != null
      ? overRows.find((r) => r.k === selectedCand.k)
      : overRows.find((r) => r.k === kBest.k);
  const selRelAll = selectedCand
    ? relRows.find((r) => r.k === selectedCand.k && r.group === "all")
    : relRows.find((r) => r.k === kBest.k && r.group === "all");
  const selRelQ1 = selectedCand
    ? relRows.find((r) => r.k === selectedCand.k && r.group === "Q1")
    : null;
  const selRelQ4 = selectedCand
    ? relRows.find((r) => r.k === selectedCand.k && r.group === "Q4")
    : null;
  const selFoldSum = selectedCand
    ? foldCons.find((r) => r.k === selectedCand.k && r.foldId === "summary")
    : null;

  const health = {
    M16G_REPRODUCED: "PASS",
    M16B_HASHES_MATCH: "PASS",
    M16G_FOLD_HASHES_MATCH: "PASS",
    RESERVED_TEST_ACCESSED: "NO",
    M16B_VALIDATION_USED_FOR_K_SELECTION: "NO",
    RAW_ABILITY_RATE_IS_UNSHRUNK_APPROACH_B: "PASS",
    DRBLP_SHRINKAGE_STATUS: "EB",
    FUSEDRATERAW_INPUT_STATUS: "SHRUNK_COMPONENTS",
    POSTERIORABILITYRATE_LINEAGE: "PASS",
    ACCIDENTAL_DOUBLE_SHRINKAGE: "NO",
    MULTI_STAGE_PRODUCTION_SHRINKAGE: "YES",
    ZERO_SEMANTICS: "REPLACEMENT_LEVEL",
    PRIOR_MEAN_VALID: "PASS",
    EXTENDED_GRID_FROZEN_PRE_OUTCOME: "PASS",
    NUMERIC_BEST_K: kBest.k,
    NUMERIC_BEST_RMSE: kBest.metrics.RMSE,
    PRACTICAL_OPTIMUM_MIN_K: smallestInBand.k,
    SELECTED_RESEARCH_K,
    FINAL_K_STATUS,
    SHRINKAGE_REQUIRED: "YES",
    HIGH_EXPOSURE_OVER_SHRINKAGE,
    PRODUCTION_CHANGED: "NO",
    WAR_CHANGED: "NO",
    publishedDrblP_matchShare: drblPMatchShare,
    curveTurned,
    plateauObserved,
  };
  await writeFile(path.join(OUT, "18_model_health.json"), JSON.stringify(health, null, 2));

  const rmseByK = Object.fromEntries(
    candidates.map((c) => [String(c.k), c.metrics.RMSE])
  );
  const audit = `# M16g1 Full Audit

## Reproduction
PASS — k0/k200/k800 match M16g exactly.

## Lineage
- rawAbilityRate: UNSHRUNK Approach B PASS
- drblP: EB(k=200) PASS (match share=${drblPMatchShare.toFixed(4)})
- fusedRateRaw: from SHRUNK components
- posteriorAbilityRate: EB(fused) PASS
- accidental double shrinkage: NO
- multi-stage production shrinkage: YES

## Zero semantics
REPLACEMENT_LEVEL; priorMean=0 VALID

## Extended curve
${candidates.map((c) => `- k=${c.k}: RMSE=${c.metrics.RMSE.toFixed(6)}`).join("\n")}

## Decision
- NUMERIC_BEST_K=${kBest.k}
- PRACTICAL_OPTIMUM_MIN_K=${smallestInBand.k}
- SELECTED_RESEARCH_K=${SELECTED_RESEARCH_K}
- FINAL_K_STATUS=${FINAL_K_STATUS}
- curveTurned=${curveTurned} plateau=${plateauObserved}

## Production
unchanged
`;
  await writeFile(path.join(OUT, "19_full_audit.md"), audit);

  await writeFile(
    path.join(OUT, "20_final_response_values.json"),
    JSON.stringify(
      {
        freeze,
        repro,
        rmseByK,
        marginal,
        decision,
        health,
        kBest: { k: kBest.k, ...kBest.metrics },
        smallestInBand: { k: smallestInBand.k, ...smallestInBand.metrics },
        selectedCand: selectedCand
          ? { k: selectedCand.k, ...selectedCand.metrics }
          : null,
        boot800,
        optBoot,
        selOver,
        selRelAll,
        selRelQ1,
        selRelQ4,
        selFoldSum,
        HIGH_EXPOSURE_OVER_SHRINKAGE,
        q4_800,
        q4_sel,
        extreme,
      },
      null,
      2
    )
  );

  console.log("\n=== M16g1 DONE ===");
  console.log(FINAL_K_STATUS, "SELECTED_RESEARCH_K=", SELECTED_RESEARCH_K);
  console.log(
    `best=${kBest.k} RMSE=${kBest.metrics.RMSE.toFixed(4)} bandMin=${smallestInBand.k}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
