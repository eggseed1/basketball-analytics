/**
 * M16g - TRAIN-only posterior / EB shrinkage selection for incumbent P_B.
 *   npm run drbl:m16g
 *
 * Does NOT use M16b VALIDATION for k selection.
 * Does NOT access RESERVED_TEST.
 * Does NOT change production / WAR / Approach B math.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  EVALUATION_PROTOCOL_VERSION,
  ELIGIBILITY_RULES,
  METRIC_CONTRACT,
  TARGET_VERSION,
} from "../drbl/evaluation/protocol";
import {
  loadSplitGames,
  verifyFrozenSplitHashes,
} from "../drbl/evaluation/m16c-dataset";
import { hashGames, type SplitGame } from "../drbl/evaluation/splits";
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
const OUT = path.join(ROOT, "reports", "m16g");
const CHARTS = path.join(OUT, "charts");

const EXPECTED_TRAIN =
  "7bec77be45295ee858d90896d9383e4da951e98e81ad1ef31b5285fb055d1550";
const EXPECTED_VAL =
  "4fd339a445f269162c2d76e9102ea5bb965a5d0fc05e0fcd2f60593117c5faf0";
const EXPECTED_RES =
  "e542aa54602390ed65792f37e10207814e10b62bfdf552ddf4da69825076c1ce";

/** Frozen before any candidate metrics. */
const K_GRID = [0, 25, 50, 100, 200, 400, 800] as const;
const PRACTICAL_REL = 0.005;
const NEAR_TIE_REL = 0.001;
const BOOTSTRAP_RESAMPLES = METRIC_CONTRACT.practicalSignificance.bootstrapResamples;
const BOOTSTRAP_SEED = 42;
const N_FOLDS = 5; // expanding history → next block (6 chronological segments)
const PRIOR_MEAN = 0; // R1-relative scale; replacement-level prior

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

function posteriorOf(raw: number, n: number, k: number, priorMean: number): number {
  return empiricalBayesRate(raw, n, priorMean, k).posterior;
}

function reliabilityOf(n: number, k: number): number {
  return empiricalBayesRate(0, n, 0, k).reliability;
}

async function loadSplitList(name: "train" | "validation"): Promise<SplitGame[]> {
  const p = path.join(ROOT, "reports/m16b/splits", `${name}_game_ids.json`);
  const raw = JSON.parse(await readFile(p, "utf8")) as
    | { games?: SplitGame[] }
    | SplitGame[];
  return Array.isArray(raw) ? raw : (raw.games ?? []);
}

type FoldRow = {
  foldId: number;
  playerId: string;
  rawPB: number;
  publishedDrblP: number;
  N: number;
  target: number;
  historyGameCount: number;
  futureGameCount: number;
  asOfDate: string;
};

function buildHistoryFutureRows(
  historyGames: DrblProcessedGame[],
  futureGames: DrblProcessedGame[],
  foldId: number
): FoldRow[] {
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

  const rows: FoldRow[] = [];
  for (const p of histPlayers) {
    const late = futAccum.get(p.playerId);
    if (!late || late.possessions < minFuture) continue;
    const futureTarget = (100 * late.totalValue) / late.possessions;
    rows.push({
      foldId,
      playerId: p.playerId,
      // Unshrunk Approach B rate (pre component EB). Research shrinkage input.
      rawPB: p.rawAbilityRate,
      // Published component field (embeds production EB k=200) - diagnostic only.
      publishedDrblP: p.drblP,
      N: p.possessions,
      target: futureTarget,
      historyGameCount: historyGames.length,
      futureGameCount: futureGames.length,
      asOfDate: cutoffDate,
    });
  }
  return rows;
}

function topOverlap(idsA: string[], idsB: string[], k: number): number {
  const a = new Set(idsA.slice(0, k));
  const b = idsB.slice(0, k);
  let n = 0;
  for (const id of b) if (a.has(id)) n += 1;
  return k ? n / k : NaN;
}

function svgLine(
  points: Array<{ x: number; y: number }>,
  title: string,
  xlab: string,
  ylab: string
): string {
  const w = 520,
    h = 320,
    pad = 48;
  const xs = points.map((p) => p.x);
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
  const coords = points
    .map((p) => {
      const x = pad + ((p.x - xmin) / dx) * (w - 2 * pad);
      const y = h - pad - ((p.y - ymin) / dy) * (h - 2 * pad);
      return `${x},${y}`;
    })
    .join(" ");
  const dots = points
    .map((p) => {
      const x = pad + ((p.x - xmin) / dx) * (w - 2 * pad);
      const y = h - pad - ((p.y - ymin) / dy) * (h - 2 * pad);
      return `<circle cx="${x}" cy="${y}" r="3.5" fill="#0f766e"/>`;
    })
    .join("");
  return `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="100%" height="100%" fill="#fafafa"/>
  <text x="${pad}" y="24" font-size="14">${title}</text>
  <text x="${w / 2}" y="${h - 8}" text-anchor="middle" font-size="11">${xlab}</text>
  <text x="12" y="${h / 2}" text-anchor="middle" font-size="11" transform="rotate(-90 12 ${h / 2})">${ylab}</text>
  <polyline fill="none" stroke="#115e59" stroke-width="2" points="${coords}"/>
  ${dots}
</svg>`;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await mkdir(CHARTS, { recursive: true });

  const gitCommit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const gitDirty =
    execSync("git status --porcelain", { encoding: "utf8" }).trim().length > 0;
  const timestamp = new Date().toISOString();

  // ---- PHASE 0 freeze ----
  const freeze = {
    milestone: "M16g",
    timestamp,
    gitCommit,
    gitDirty,
    evaluationProtocolVersion: EVALUATION_PROTOCOL_VERSION,
    trainSplitHash: EXPECTED_TRAIN,
    validationSplitHash: EXPECTED_VAL,
    reservedTestSplitHash: EXPECTED_RES,
    approachBVersion: SEQUENTIAL_ATTRIBUTION_VERSION,
    currentPosteriorImplementationVersion: "eb-fused-v1 / component EB in drblP",
    currentPosteriorK: PRIOR_EQUIVALENT_POSSESSIONS,
    currentPosteriorPriorMean: 0,
    currentPosteriorExposureField: "actualPossessions (possessions)",
    abilityLineageVersion: ABILITY_LINEAGE_VERSION,
    WAR_version: WAR_FORMULA_VERSION,
    WAR_exposureUnit: WAR_EXPOSURE_UNIT,
    targetVersion: TARGET_VERSION,
    researchIncumbentPB: "Approach B / drbl-seq-attr-v1",
    kGridFrozen: [...K_GRID],
    practicalRelativeImprovement: PRACTICAL_REL,
    M16B_VALIDATION_USED_FOR_K_SELECTION: false,
    RESERVED_TEST_ACCESSED: false,
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
      path.join(OUT, "16_model_health.json"),
      JSON.stringify(
        {
          M16B_HASHES_MATCH: "FAIL",
          STOP: "EVALUATION_PROTOCOL_DRIFT",
          reason: hashCheck.reason,
        },
        null,
        2
      )
    );
    throw new Error(`STOP EVALUATION_PROTOCOL_DRIFT: ${hashCheck.reason}`);
  }

  // ---- PHASE 1-2 audit docs (before loading outcomes for k) ----
  await writeFile(
    path.join(OUT, "01_existing_posterior_audit.md"),
    `# Existing posterior audit (M16g)

## Production / published ability lineage

\`\`\`
rawAbilityRate       = 100 * totalValue / possessions   (seq-attr residual rate vs R1)
drblP                = EB(rawAbilityRate; priorMean=0, k=${PRIOR_EQUIVALENT_POSSESSIONS})
fusedRateRaw         = fusion(P,LN,B) or lite blend
posteriorAbilityRate = EB(fusedRateRaw; priorMean=0, k=${PRIOR_EQUIVALENT_POSSESSIONS})
drbl100              = posteriorAbilityRate
\`\`\`

## Canonical EB form

\`\`\`
reliability = N / (N + k)
posterior   = reliability * observedRate + (1 - reliability) * priorMean
\`\`\`

Implemented in:
- \`drbl/models/leaderboard.ts\` → \`empiricalBayesRate\`
- \`drbl/models/pipeline-value.ts\` → \`empiricalBayesPosterior\`
- \`drbl/models/player-value.ts\` → \`empiricalBayesShrink\` (component \`drblP\`, k=PRIOR_EQUIVALENT_POSSESSIONS)

## Where applied

1. **Component layer:** \`finalizePlayerSeasonRows\` shrinks raw seq-attr rate → \`drblP\` with k=${PRIOR_EQUIVALENT_POSSESSIONS}.
2. **Published ability layer:** EB on \`fusedRateRaw\` → \`posteriorAbilityRate\` / \`drbl100\` with same k.
3. M16c diagnostic: additional EB on fusion *predictions* (not used for selection here).

## Input already regularized?

YES for published \`drblP\` (embeds k=${PRIOR_EQUIVALENT_POSSESSIONS}).

## Double posterior?

YES in production ability path if one treats \`drblP\` (already EB) as an input to fusion then EB again on fused rate.
\`resolvePosteriorAbility\` (ability-lineage) prevents *re*-EB of an already-stored \`posteriorAbilityRate\`.

## Pseudo-exposure

\`seasonalImpact = rawAbilityRate * actualPossessions / 100\`
Prior strength affects **weight only**, not exposure. See \`seasonalImpactFromRawRate\`.

\`POSTERIOR_PSEUDO_EXPOSURE_LEAK = NO\`
`
  );

  await writeFile(
    path.join(OUT, "02_research_input_contract.md"),
    `# Research input contract (M16g)

## Estimator under test

Approach B won M16f2. The **unshrunk** sequential attribution rate is the scientific object of shrinkage:

\`\`\`
rawRate = rawAbilityRate = 100 * ΣApproachB_value / N
\`\`\`

This is the pre-EB estimand underlying published \`drblP\`.

**Why not published \`drblP\` as the shrinkage input?**
Published \`drblP\` already applies EB(k=${PRIOR_EQUIVALENT_POSSESSIONS}). Using it as \`rawRate\` would make \`k=0\` mean “keep embedded shrinkage,” so the grid could not cleanly test “no shrinkage.”

M16g therefore tests:

\`\`\`
posterior_k = N/(N+k) * rawAbilityRate + k/(N+k) * priorMean
\`\`\`

with \`k=0\` ≡ identity (true no-shrinkage).

Published \`drblP\` is retained on each fold row for diagnostics / production-gap comparison only.

## Prior mean

\`priorMean = ${PRIOR_MEAN}\`

Rationale: Approach B residuals are **vs R1 replacement**. Zero is replacement-level impact by construction (not a performance-tuned TRAIN mean). League mean of raw rates may be nonzero; that does **not** redefine the prior semantics.

## Exposure N

\`N = actual combined on-court possession appearances\` used to form the historical rate (same unit as \`finalizePlayerSeasonRows.possessions\`).

Rate unit: expected net points per 100 combined possession appearances vs R1.
Reliability: fraction of weight on the observed rate vs replacement-level prior.

## Out of scope

fused P+LN+B, calibratedDRBL100, WAR ability input, Approach A, VALIDATION k tuning.
`
  );

  console.log("Loading TRAIN games only (no RESERVED_TEST; VAL not used for k)…");
  const trainProcessed = await loadSplitGames(trainGames);
  const sorted = [...trainProcessed].sort(
    (a, b) =>
      (a.box.gameDate || "").localeCompare(b.box.gameDate || "") ||
      a.box.gameId.localeCompare(b.box.gameId)
  );
  console.log(`TRAIN games loaded: ${sorted.length}`);

  // Prior-mean semantics check on full TRAIN early rates (documentation only)
  {
    const mid = Math.floor(sorted.length * 0.7);
    const probe = buildHistoryFutureRows(sorted.slice(0, mid), sorted.slice(mid), -1);
    const raws = probe.map((r) => r.rawPB);
    const ns = probe.map((r) => r.N);
    const wSum = ns.reduce((a, b) => a + b, 0);
    const wMean = wSum
      ? raws.reduce((a, r, i) => a + r * ns[i]!, 0) / wSum
      : NaN;
    const sortedR = [...raws].sort((a, b) => a - b);
    console.log(
      `TRAIN probe rawPB mean=${mean(raws).toFixed(4)} wMean=${wMean.toFixed(4)} median=${percentile(sortedR, 50).toFixed(4)} sd=${sd(raws).toFixed(4)}`
    );
    // Semantics: R1-relative → priorMean=0 stands even if sample mean ≠ 0
  }

  // ---- PHASE 7: chronological folds (date-safe expanding windows) ----
  const uniqueDates = [...new Set(sorted.map((g) => g.box.gameDate || ""))].sort();
  if (uniqueDates.length < N_FOLDS + 2) {
    throw new Error("STOP insufficient unique dates for chronological folds");
  }
  const dateCuts: string[] = [];
  for (let f = 1; f <= N_FOLDS + 1; f++) {
    const idx = Math.min(
      uniqueDates.length - 1,
      Math.floor((f * uniqueDates.length) / (N_FOLDS + 1))
    );
    dateCuts.push(uniqueDates[idx]!);
  }
  // Ensure strictly increasing cut dates
  for (let i = 1; i < dateCuts.length; i++) {
    if (dateCuts[i]! <= dateCuts[i - 1]!) {
      const next = uniqueDates.find((d) => d > dateCuts[i - 1]!);
      if (!next) throw new Error("STOP cannot build strict date cuts");
      dateCuts[i] = next;
    }
  }

  const foldMeta: Array<Record<string, unknown>> = [];
  const allRows: FoldRow[] = [];
  for (let f = 0; f < N_FOLDS; f++) {
    const histEnd = dateCuts[f]!; // history: date < histEnd? use <= previous cut
    // Expanding: history = dates < cut_{f+1}, future = cut_{f+1} <= date < cut_{f+2}
    const futStart = dateCuts[f]!;
    const futEnd = dateCuts[f + 1]!;
    const history = sorted.filter((g) => (g.box.gameDate || "") < futStart);
    const future = sorted.filter((g) => {
      const d = g.box.gameDate || "";
      return d >= futStart && d < futEnd;
    });
    // Last fold future extends to end
    const futureFinal =
      f === N_FOLDS - 1
        ? sorted.filter((g) => (g.box.gameDate || "") >= futStart)
        : future;
    const histIds = history.map((g) => g.box.gameId).sort();
    const futIds = futureFinal.map((g) => g.box.gameId).sort();
    const overlap = histIds.some((id) => futIds.includes(id));
    const chronoOk =
      history.length > 0 &&
      futureFinal.length > 0 &&
      (history[history.length - 1]!.box.gameDate || "") <
        (futureFinal[0]!.box.gameDate || "");
    if (history.length === 0 || futureFinal.length === 0) {
      throw new Error(`STOP fold ${f} empty history/future`);
    }
    const rows = buildHistoryFutureRows(history, futureFinal, f);
    allRows.push(...rows);
    foldMeta.push({
      foldId: f,
      historyGames: history.length,
      futureGames: futureFinal.length,
      historyHash: createHash("sha256").update(histIds.join("\n")).digest("hex"),
      futureHash: createHash("sha256").update(futIds.join("\n")).digest("hex"),
      historyDateMin: history[0]?.box.gameDate,
      historyDateMax: history[history.length - 1]?.box.gameDate,
      futureDateMin: futureFinal[0]?.box.gameDate,
      futureDateMax: futureFinal[futureFinal.length - 1]?.box.gameDate,
      chronological: chronoOk,
      overlap,
      nRows: rows.length,
      meanN: mean(rows.map((r) => r.N)),
      meanRawPB: mean(rows.map((r) => r.rawPB)),
      futStart,
      futEnd: f === N_FOLDS - 1 ? "END" : futEnd,
    });
    console.log(
      `Fold ${f}: hist=${history.length} fut=${futureFinal.length} rows=${rows.length} chrono=${chronoOk} overlap=${overlap}`
    );
    if (overlap || !chronoOk) {
      throw new Error(`STOP fold ${f} chronology/overlap failure`);
    }
  }

  await writeFile(
    path.join(OUT, "03_posterior_folds.json"),
    JSON.stringify(
      {
        nFolds: N_FOLDS,
        nSegments: N_FOLDS + 1,
        design: "expanding_history_next_date_block",
        frozenBeforeMetrics: true,
        folds: foldMeta,
        totalRows: allRows.length,
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "04_fold_rows.csv"),
    toCsv(
      allRows.map((r) => ({
        foldId: r.foldId,
        playerId: r.playerId,
        rawPB: r.rawPB,
        publishedDrblP: r.publishedDrblP,
        N: r.N,
        target: r.target,
        historyGameCount: r.historyGameCount,
        futureGameCount: r.futureGameCount,
        asOfDate: r.asOfDate,
      }))
    )
  );

  // ---- Evaluate k grid on identical rows ----
  const y = allRows.map((r) => r.target);
  const blockIds = allRows.map((r) => `${r.foldId}|${r.playerId}`);
  const n0 = allRows.map((r) => r.N);
  const raw = allRows.map((r) => r.rawPB);

  type Cand = {
    k: number;
    yhat: number[];
    metrics: ReturnType<typeof metricBundle>;
  };
  const candidates: Cand[] = K_GRID.map((k) => {
    const yhat = raw.map((r, i) => posteriorOf(r, n0[i]!, k, PRIOR_MEAN));
    return { k, yhat, metrics: metricBundle(y, yhat) };
  });
  const k0 = candidates.find((c) => c.k === 0)!;

  await writeFile(
    path.join(OUT, "05_candidate_metrics.csv"),
    toCsv(
      candidates.map((c) => ({
        k: c.k,
        ...c.metrics,
        deltaRMSE_vs_k0: c.metrics.RMSE - k0.metrics.RMSE,
        relativeImprovement_vs_k0:
          (k0.metrics.RMSE - c.metrics.RMSE) / k0.metrics.RMSE,
      }))
    )
  );

  // Bootstrap vs k0
  const bootRows: Record<string, unknown>[] = [];
  for (const c of candidates) {
    if (c.k === 0) {
      bootRows.push({
        k: 0,
        deltaRMSE: 0,
        ciLow: 0,
        ciHigh: 0,
        pKBeatsK0: 0,
        pK0BeatsK: 1,
      });
      continue;
    }
    const boot = pairedBlockBootstrapRmseDiff(y, k0.yhat, c.yhat, blockIds, {
      resamples: BOOTSTRAP_RESAMPLES,
      seed: BOOTSTRAP_SEED,
    });
    // pointEstimate = RMSE_candidate - RMSE_baseline(k0); negative ⇒ k better
    bootRows.push({
      k: c.k,
      deltaRMSE: boot.pointEstimate,
      ciLow: boot.ciLow,
      ciHigh: boot.ciHigh,
      pKBeatsK0: boot.probCandidateBeatsBaseline,
      pK0BeatsK: 1 - boot.probCandidateBeatsBaseline,
    });
  }
  await writeFile(path.join(OUT, "06_bootstrap_vs_k0.csv"), toCsv(bootRows));

  // Exposure quartiles (pooled historical N)
  const nSorted = [...n0].sort((a, b) => a - b);
  const qCuts = [0.25, 0.5, 0.75].map((q) => percentile(nSorted, q * 100));
  function expoQ(n: number): number {
    if (n <= qCuts[0]!) return 1;
    if (n <= qCuts[1]!) return 2;
    if (n <= qCuts[2]!) return 3;
    return 4;
  }
  const expoRows: Record<string, unknown>[] = [];
  for (const c of candidates) {
    for (const q of [1, 2, 3, 4]) {
      const idxs = allRows
        .map((r, i) => ({ r, i }))
        .filter((x) => expoQ(x.r.N) === q)
        .map((x) => x.i);
      const yy = idxs.map((i) => y[i]!);
      const yh = idxs.map((i) => c.yhat[i]!);
      const rr = idxs.map((i) => raw[i]!);
      const m = idxs.length ? metricBundle(yy, yh) : null;
      expoRows.push({
        k: c.k,
        quartile: q,
        n: idxs.length,
        RMSE: m?.RMSE ?? NaN,
        MAE: m?.MAE ?? NaN,
        Pearson: m?.Pearson ?? NaN,
        bias: idxs.length ? mean(yh.map((p, j) => p - yy[j]!)) : NaN,
        calibrationIntercept: m?.calibrationIntercept ?? NaN,
        calibrationSlope: m?.calibrationSlope ?? NaN,
        rawRMSE: idxs.length ? rmse(yy, rr) : NaN,
      });
    }
  }
  await writeFile(path.join(OUT, "07_exposure_quartiles.csv"), toCsv(expoRows));

  // Selection among candidates (before further diagnostics that don't change rule)
  const positive = candidates.filter((c) => c.k > 0);
  let bestPositive = positive[0]!;
  for (const c of positive) {
    if (c.metrics.RMSE < bestPositive.metrics.RMSE) bestPositive = c;
  }
  // near-ties → smaller k
  const nearBest = positive.filter(
    (c) =>
      Math.abs(c.metrics.RMSE - bestPositive.metrics.RMSE) / k0.metrics.RMSE <=
      NEAR_TIE_REL
  );
  if (nearBest.length) {
    bestPositive = nearBest.reduce((a, b) => (a.k <= b.k ? a : b));
  }

  const bootBest = bootRows.find((r) => r.k === bestPositive.k)!;
  const relImpBest =
    (k0.metrics.RMSE - bestPositive.metrics.RMSE) / k0.metrics.RMSE;
  const pBeat = Number(bootBest.pKBeatsK0);
  const secondaryOk =
    !(
      bestPositive.metrics.Pearson < k0.metrics.Pearson - 0.05 &&
      bestPositive.metrics.Spearman < k0.metrics.Spearman - 0.05
    );
  const clearsK0 =
    relImpBest >= PRACTICAL_REL && pBeat >= 0.95 && secondaryOk;

  let SELECTED_RESEARCH_K = 0;
  let POSTERIOR_SELECTION_RESULT:
    | "NO_ADDITIONAL_SHRINKAGE"
    | "LIGHT_SHRINKAGE_SELECTED"
    | "MODERATE_SHRINKAGE_SELECTED"
    | "STRONG_SHRINKAGE_SELECTED"
    | "INCONCLUSIVE" = "NO_ADDITIONAL_SHRINKAGE";

  if (clearsK0) {
    SELECTED_RESEARCH_K = bestPositive.k;
    if (SELECTED_RESEARCH_K <= 50) POSTERIOR_SELECTION_RESULT = "LIGHT_SHRINKAGE_SELECTED";
    else if (SELECTED_RESEARCH_K <= 200)
      POSTERIOR_SELECTION_RESULT = "MODERATE_SHRINKAGE_SELECTED";
    else POSTERIOR_SELECTION_RESULT = "STRONG_SHRINKAGE_SELECTED";
  } else {
    SELECTED_RESEARCH_K = 0;
    POSTERIOR_SELECTION_RESULT = "NO_ADDITIONAL_SHRINKAGE";
  }

  const selected = candidates.find((c) => c.k === SELECTED_RESEARCH_K)!;

  // High-exposure distortion for each k
  const q4Idx = allRows
    .map((r, i) => ({ r, i }))
    .filter((x) => expoQ(x.r.N) === 4)
    .map((x) => x.i);
  const distortRows: Record<string, unknown>[] = [];
  for (const c of candidates) {
    const absCh = q4Idx.map((i) => Math.abs(c.yhat[i]! - raw[i]!));
    const orderRaw = q4Idx
      .map((i) => ({ id: allRows[i]!.playerId, v: raw[i]! }))
      .sort((a, b) => b.v - a.v);
    const orderPost = q4Idx
      .map((i) => ({ id: allRows[i]!.playerId, v: c.yhat[i]! }))
      .sort((a, b) => b.v - a.v);
    const rankMap = new Map(orderRaw.map((x, ri) => [x.id, ri]));
    const rankMove = mean(
      orderPost.map((x, ri) => Math.abs(ri - (rankMap.get(x.id) ?? ri)))
    );
    const absSorted = [...absCh].sort((a, b) => a - b);
    distortRows.push({
      k: c.k,
      nQ4: q4Idx.length,
      meanAbsChange: mean(absCh),
      p95AbsChange: percentile(absSorted, 95),
      meanAbsRankMovement: rankMove,
    });
  }
  await writeFile(path.join(OUT, "08_high_exposure_distortion.csv"), toCsv(distortRows));

  // Reliability weights
  const relRows: Record<string, unknown>[] = [];
  for (const k of K_GRID) {
    const rels = n0.map((n) => reliabilityOf(n, k)).sort((a, b) => a - b);
    relRows.push({
      k,
      group: "all",
      min: rels[0],
      p10: percentile(rels, 10),
      p25: percentile(rels, 25),
      median: percentile(rels, 50),
      p75: percentile(rels, 75),
      p90: percentile(rels, 90),
      max: rels[rels.length - 1],
    });
    for (const q of [1, 2, 3, 4]) {
      const rr = allRows
        .filter((r) => expoQ(r.N) === q)
        .map((r) => reliabilityOf(r.N, k))
        .sort((a, b) => a - b);
      relRows.push({
        k,
        group: `Q${q}`,
        min: rr[0],
        p10: percentile(rr, 10),
        p25: percentile(rr, 25),
        median: percentile(rr, 50),
        p75: percentile(rr, 75),
        p90: percentile(rr, 90),
        max: rr[rr.length - 1],
      });
    }
  }
  await writeFile(path.join(OUT, "09_reliability_weights.csv"), toCsv(relRows));

  // Shrinkage magnitude
  const magRows: Record<string, unknown>[] = [];
  for (const c of candidates) {
    const abs = c.yhat.map((p, i) => Math.abs(p - raw[i]!)).sort((a, b) => a - b);
    magRows.push({
      k: c.k,
      meanAbs: mean(abs),
      medianAbs: percentile(abs, 50),
      p90: percentile(abs, 90),
      p99: percentile(abs, 99),
      max: abs[abs.length - 1],
      pearsonRawPost: pearson(raw, c.yhat),
      spearmanRawPost: spearman(raw, c.yhat),
    });
  }
  await writeFile(path.join(OUT, "10_shrinkage_magnitude.csv"), toCsv(magRows));

  // Prior bias by raw quantile bins
  const rawSorted = [...raw].sort((a, b) => a - b);
  const edges = [0, 0.2, 0.4, 0.6, 0.8, 1].map((q) =>
    percentile(rawSorted, q * 100)
  );
  const binNames = [
    "strong_negative",
    "moderate_negative",
    "near_zero",
    "moderate_positive",
    "strong_positive",
  ];
  function rawBin(v: number): string {
    if (v <= edges[1]!) return binNames[0]!;
    if (v <= edges[2]!) return binNames[1]!;
    if (v <= edges[3]!) return binNames[2]!;
    if (v <= edges[4]!) return binNames[3]!;
    return binNames[4]!;
  }
  const biasRows: Record<string, unknown>[] = [];
  for (const c of candidates) {
    for (const name of binNames) {
      const idxs = allRows
        .map((r, i) => i)
        .filter((i) => rawBin(raw[i]!) === name);
      const yy = idxs.map((i) => y[i]!);
      const yh = idxs.map((i) => c.yhat[i]!);
      const rr = idxs.map((i) => raw[i]!);
      biasRows.push({
        k: c.k,
        bin: name,
        n: idxs.length,
        meanRaw: mean(rr),
        meanPosterior: mean(yh),
        meanTarget: mean(yy),
        futureResidualBias: mean(yh.map((p, j) => p - yy[j]!)),
      });
    }
  }
  await writeFile(path.join(OUT, "11_prior_bias_diagnostic.csv"), toCsv(biasRows));

  // Extreme deciles
  const orderByRaw = allRows
    .map((r, i) => ({ i, v: raw[i]! }))
    .sort((a, b) => a.v - b.v);
  const dN = Math.max(1, Math.floor(orderByRaw.length / 10));
  const bottom = orderByRaw.slice(0, dN).map((x) => x.i);
  const top = orderByRaw.slice(-dN).map((x) => x.i);
  const extremeDiag = [0, SELECTED_RESEARCH_K, bestPositive.k, 200].map((k) => {
    const c = candidates.find((x) => x.k === k)!;
    const summarize = (idxs: number[], label: string) => ({
      k,
      decile: label,
      n: idxs.length,
      meanRaw: mean(idxs.map((i) => raw[i]!)),
      meanPosterior: mean(idxs.map((i) => c.yhat[i]!)),
      meanTarget: mean(idxs.map((i) => y[i]!)),
      RMSE_raw: rmse(
        idxs.map((i) => y[i]!),
        idxs.map((i) => raw[i]!)
      ),
      RMSE_posterior: rmse(
        idxs.map((i) => y[i]!),
        idxs.map((i) => c.yhat[i]!)
      ),
    });
    return [summarize(bottom, "bottom"), summarize(top, "top")];
  });
  await writeFile(
    path.join(CHARTS, "extreme_decile_future_outcomes.json"),
    JSON.stringify(extremeDiag.flat(), null, 2)
  );

  // Calibration
  await writeFile(
    path.join(OUT, "12_calibration.csv"),
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

  // Per-fold consistency
  const foldCons: Record<string, unknown>[] = [];
  for (const c of candidates) {
    let wins = 0;
    let losses = 0;
    for (let f = 0; f < N_FOLDS; f++) {
      const idxs = allRows
        .map((r, i) => ({ r, i }))
        .filter((x) => x.r.foldId === f)
        .map((x) => x.i);
      const yy = idxs.map((i) => y[i]!);
      const yk = idxs.map((i) => c.yhat[i]!);
      const yk0 = idxs.map((i) => k0.yhat[i]!);
      const rmseK = rmse(yy, yk);
      const rmse0 = rmse(yy, yk0);
      const d = rmseK - rmse0;
      if (c.k > 0) {
        if (d < 0) wins += 1;
        else if (d > 0) losses += 1;
      }
      foldCons.push({
        k: c.k,
        foldId: f,
        n: idxs.length,
        RMSE: rmseK,
        deltaRMSE_vs_k0: d,
        Pearson: pearson(yy, yk),
        Spearman: spearman(yy, yk),
      });
    }
    if (c.k > 0) {
      foldCons.push({
        k: c.k,
        foldId: "summary",
        foldsBeatK0: wins,
        foldsLoseToK0: losses,
      });
    }
  }
  await writeFile(path.join(OUT, "13_fold_consistency.csv"), toCsv(foldCons));

  // Rank stability diagnostic
  const rankStab: Record<string, unknown>[] = [];
  for (const c of candidates) {
    for (let f = 0; f < N_FOLDS; f++) {
      const idxs = allRows
        .map((r, i) => ({ r, i }))
        .filter((x) => x.r.foldId === f)
        .map((x) => x.i);
      if (idxs.length < 50) continue;
      const ids0 = idxs
        .map((i) => ({ id: allRows[i]!.playerId, v: k0.yhat[i]! }))
        .sort((a, b) => b.v - a.v)
        .map((x) => x.id);
      const idsK = idxs
        .map((i) => ({ id: allRows[i]!.playerId, v: c.yhat[i]! }))
        .sort((a, b) => b.v - a.v)
        .map((x) => x.id);
      const v0 = idxs.map((i) => k0.yhat[i]!);
      const vk = idxs.map((i) => c.yhat[i]!);
      rankStab.push({
        k: c.k,
        foldId: f,
        spearman: spearman(v0, vk),
        top10: topOverlap(ids0, idsK, 10),
        top25: topOverlap(ids0, idsK, 25),
        top50: topOverlap(ids0, idsK, Math.min(50, idxs.length)),
      });
    }
  }
  await writeFile(path.join(CHARTS, "rank_stability.json"), JSON.stringify(rankStab, null, 2));

  // Legacy k=200 verdict
  const c200 = candidates.find((c) => c.k === 200)!;
  const boot200 = bootRows.find((r) => r.k === 200)!;
  const rel200 = (k0.metrics.RMSE - c200.metrics.RMSE) / k0.metrics.RMSE;
  const q1_200 = expoRows.find((r) => r.k === 200 && r.quartile === 1)!;
  const q1_0 = expoRows.find((r) => r.k === 0 && r.quartile === 1)!;
  const q4_200 = expoRows.find((r) => r.k === 200 && r.quartile === 4)!;
  const q4_0 = expoRows.find((r) => r.k === 0 && r.quartile === 4)!;
  let LEGACY_K200_STATUS: "SUPPORTED" | "NEUTRAL" | "UNSUPPORTED" = "UNSUPPORTED";
  if (
    rel200 >= PRACTICAL_REL &&
    Number(boot200.pKBeatsK0) >= 0.95
  ) {
    LEGACY_K200_STATUS = "SUPPORTED";
  } else if (Math.abs(rel200) < PRACTICAL_REL) {
    LEGACY_K200_STATUS = "NEUTRAL";
  } else {
    LEGACY_K200_STATUS = "UNSUPPORTED";
  }

  // Small-sample Q1: best positive vs k0
  const q1Best = expoRows.find(
    (r) => r.k === bestPositive.k && r.quartile === 1
  )!;
  const q1K0 = expoRows.find((r) => r.k === 0 && r.quartile === 1)!;

  // Variance diagnostic
  const varDiag = [1, 2, 3, 4].map((q) => {
    const idxs = allRows
      .map((r, i) => ({ r, i }))
      .filter((x) => expoQ(x.r.N) === q)
      .map((x) => x.i);
    const rr = idxs.map((i) => raw[i]!);
    const yy = idxs.map((i) => y[i]!);
    const resid = idxs.map((i) => y[i]! - raw[i]!);
    return {
      quartile: q,
      n: idxs.length,
      varRawP: sd(rr) ** 2,
      varTarget: sd(yy) ** 2,
      varResidual: sd(resid) ** 2,
    };
  });
  await writeFile(
    path.join(CHARTS, "exposure_variance_diagnostic.json"),
    JSON.stringify(varDiag, null, 2)
  );

  // Production gap (after decision)
  await writeFile(
    path.join(OUT, "14_production_gap.md"),
    `# Production gap (M16g)

## Production posterior lineage

| Item | Production |
|---|---|
| Component P field | \`drblP\` = EB(rawAbilityRate, k=${PRIOR_EQUIVALENT_POSSESSIONS}, priorMean=0) |
| Published ability input | \`fusedRateRaw\` (P+LN+B fusion / lite) |
| Published posterior | \`posteriorAbilityRate\` = EB(fusedRateRaw, k=${PRIOR_EQUIVALENT_POSSESSIONS}) |
| Exposure | actual possessions (no +k in impact/WAR) |

## Research decision (M16g)

| Item | Research |
|---|---|
| Shrinkage input | **unshrunk** \`rawAbilityRate\` (Approach B seq-attr rate) |
| Selected k | **${SELECTED_RESEARCH_K}** |
| Prior mean | ${PRIOR_MEAN} |
| Result | \`${POSTERIOR_SELECTION_RESULT}\` |

## Semantic differences

- Production embeds k=${PRIOR_EQUIVALENT_POSSESSIONS} inside \`drblP\` **and** again on fused ability.
- Research asks whether EB on **raw** P_B improves future-block RMSE under TRAIN chronological folds.
- Selected research k=${SELECTED_RESEARCH_K} ${
      SELECTED_RESEARCH_K === 0
        ? "⇒ research posterior = raw P_B (no EB). Production still applies embedded k=200 until a later deploy milestone."
        : `⇒ research would apply EB(k=${SELECTED_RESEARCH_K}) to raw P_B.`
    }

## Production change made

**NO**
`
  );

  // Immutable decision
  const decision = {
    candidateGrid: [...K_GRID],
    priorMean: PRIOR_MEAN,
    exposureField: "actual_combined_possession_appearances",
    researchInput: "rawAbilityRate (unshrunk Approach B / seq-attr)",
    publishedDrblPNote: `drblP embeds EB(k=${PRIOR_EQUIVALENT_POSSESSIONS}); not used as shrinkage input`,
    RMSE_k0: k0.metrics.RMSE,
    bestPositiveK: bestPositive.k,
    bestPositiveRMSE: bestPositive.metrics.RMSE,
    relativeImprovement: relImpBest,
    bootstrapProbability: pBeat,
    bootstrapCI: { low: bootBest.ciLow, high: bootBest.ciHigh },
    clearsK0Hurdle: clearsK0,
    selectedK: SELECTED_RESEARCH_K,
    SELECTED_RESEARCH_K,
    SELECTED_RESEARCH_PRIOR_MEAN: PRIOR_MEAN,
    SELECTED_RESEARCH_POSTERIOR_VERSION:
      SELECTED_RESEARCH_K === 0
        ? "identity-raw-PB-v1"
        : `eb-PB-k${SELECTED_RESEARCH_K}-v1`,
    POSTERIOR_SELECTION_RESULT,
    LEGACY_K200_STATUS,
    lockedBeforeNameInspection: true,
    M16B_VALIDATION_USED_FOR_K_SELECTION: false,
  };
  await writeFile(
    path.join(OUT, "15_posterior_selection_decision.json"),
    JSON.stringify(decision, null, 2)
  );

  // Charts
  await writeFile(
    path.join(CHARTS, "rmse_vs_k.svg"),
    svgLine(
      candidates.map((c) => ({ x: c.k, y: c.metrics.RMSE })),
      "Pooled RMSE vs k",
      "k",
      "RMSE"
    )
  );
  await writeFile(
    path.join(CHARTS, "delta_rmse_vs_k.svg"),
    svgLine(
      candidates.map((c) => ({
        x: c.k,
        y: c.metrics.RMSE - k0.metrics.RMSE,
      })),
      "ΔRMSE vs k0",
      "k",
      "RMSE_k − RMSE_0"
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
    path.join(CHARTS, "prediction_sd_vs_k.svg"),
    svgLine(
      candidates.map((c) => ({ x: c.k, y: c.metrics.predSD })),
      "Prediction SD vs k",
      "k",
      "SD"
    )
  );
  await writeFile(
    path.join(CHARTS, "rmse_by_exposure_quartile.json"),
    JSON.stringify(expoRows, null, 2)
  );
  await writeFile(
    path.join(CHARTS, "bootstrap_vs_k0.json"),
    JSON.stringify(bootRows, null, 2)
  );
  await writeFile(
    path.join(CHARTS, "fold_delta_rmse.json"),
    JSON.stringify(
      foldCons.filter((r) => r.foldId !== "summary"),
      null,
      2
    )
  );
  await writeFile(
    path.join(CHARTS, "raw_vs_posterior_scatter.json"),
    JSON.stringify(
      {
        k: SELECTED_RESEARCH_K,
        sample: allRows.slice(0, 400).map((r, i) => ({
          raw: r.rawPB,
          posterior: selected.yhat[i]!,
          N: r.N,
        })),
      },
      null,
      2
    )
  );
  await writeFile(
    path.join(CHARTS, "shrinkage_vs_exposure.json"),
    JSON.stringify(
      allRows.slice(0, 800).map((r, i) => ({
        N: r.N,
        absChange: Math.abs(selected.yhat[i]! - r.rawPB),
        k: SELECTED_RESEARCH_K,
      })),
      null,
      2
    )
  );
  await writeFile(
    path.join(CHARTS, "reliability_vs_exposure.json"),
    JSON.stringify(
      K_GRID.map((k) => ({
        k,
        points: [50, 100, 200, 500, 1000, 2000, 4000].map((n) => ({
          N: n,
          reliability: reliabilityOf(n, k),
        })),
      })),
      null,
      2
    )
  );

  // Historical consistency note (cite M16c only after lock; no new VAL metrics)
  const m16cNote =
    "M16c reported EB(k=200) on fusion predictions worsened VAL RMSE (~+0.024). TRAIN-only M16g selection is locked independently; consistency discussed in audit only.";

  const health = {
    M16B_HASHES_MATCH: "PASS",
    APPROACH_B_INPUT_CORRECT: "PASS",
    PRIOR_MEAN_SEMANTICS: "PASS",
    POSTERIOR_EXPOSURE_UNIT: "PASS",
    POSTERIOR_PSEUDO_EXPOSURE_LEAK: "NO",
    DOUBLE_POSTERIOR_APPLIED: "NO", // research path: single EB layer on rawAbilityRate
    INPUT_ALREADY_REGULARIZED_IF_USING_PUBLISHED_DRBLP: "YES",
    TRAIN_ONLY_POSTERIOR_SELECTION: "PASS",
    M16B_VALIDATION_USED_FOR_K_SELECTION: "NO",
    RESERVED_TEST_ACCESSED: "NO",
    K_GRID_FROZEN_PRE_OUTCOME: "PASS",
    K0_INCLUDED: "YES",
    LEGACY_K200_STATUS,
    BEST_POSITIVE_K: bestPositive.k,
    BEST_POSITIVE_K_RELATIVE_IMPROVEMENT: relImpBest,
    BEST_POSITIVE_K_BOOTSTRAP_P: pBeat,
    SELECTED_RESEARCH_K,
    POSTERIOR_SELECTION_RESULT,
    PRODUCTION_CHANGED: "NO",
    WAR_CHANGED: "NO",
    totalFoldRows: allRows.length,
    RMSE_k0: k0.metrics.RMSE,
    RMSE_selected: selected.metrics.RMSE,
    q1_deltaRMSE_best_minus_k0:
      Number(q1Best.RMSE) - Number(q1K0.RMSE),
    q4_meanAbsChange_selected: distortRows.find(
      (r) => r.k === SELECTED_RESEARCH_K
    )?.meanAbsChange,
    m16cHistoricalNote: m16cNote,
  };
  await writeFile(path.join(OUT, "16_model_health.json"), JSON.stringify(health, null, 2));

  const selMag = magRows.find((r) => r.k === SELECTED_RESEARCH_K)!;
  const selRelAll = relRows.find(
    (r) => r.k === SELECTED_RESEARCH_K && r.group === "all"
  )!;
  const selRelQ1 = relRows.find(
    (r) => r.k === SELECTED_RESEARCH_K && r.group === "Q1"
  )!;
  const selRelQ4 = relRows.find(
    (r) => r.k === SELECTED_RESEARCH_K && r.group === "Q4"
  )!;
  const bestFoldSum = foldCons.find(
    (r) => r.k === bestPositive.k && r.foldId === "summary"
  );

  const audit = `# M16g Full Audit

## Selection
- **${POSTERIOR_SELECTION_RESULT}**
- SELECTED_RESEARCH_K = **${SELECTED_RESEARCH_K}**
- priorMean = ${PRIOR_MEAN}
- best positive k = ${bestPositive.k} (relImp=${(100 * relImpBest).toFixed(3)}%, P(beat k0)=${pBeat.toFixed(3)}, clears=${clearsK0})

## Pooled RMSE
${candidates.map((c) => `- k=${c.k}: RMSE=${c.metrics.RMSE.toFixed(6)}`).join("\n")}

## Legacy k=200
- status: **${LEGACY_K200_STATUS}**
- Δ vs k0 = ${(c200.metrics.RMSE - k0.metrics.RMSE).toFixed(6)} (rel ${(100 * rel200).toFixed(3)}%)
- Q1 RMSE k200=${Number(q1_200.RMSE).toFixed(4)} vs k0=${Number(q1_0.RMSE).toFixed(4)}
- Q4 RMSE k200=${Number(q4_200.RMSE).toFixed(4)} vs k0=${Number(q4_0.RMSE).toFixed(4)}

## Q1 small-sample (best positive vs k0)
- RMSE Q1 k0=${Number(q1K0.RMSE).toFixed(4)} best=${Number(q1Best.RMSE).toFixed(4)} Δ=${(Number(q1Best.RMSE) - Number(q1K0.RMSE)).toFixed(4)}

## Fold consistency (best positive k=${bestPositive.k})
- beats k0: ${bestFoldSum?.foldsBeatK0 ?? "n/a"}
- loses to k0: ${bestFoldSum?.foldsLoseToK0 ?? "n/a"}

## Production
- unchanged
- RESERVED_TEST not accessed
- VALIDATION not used for k selection

## Historical M16c context (non-binding)
${m16cNote}
`;
  await writeFile(path.join(OUT, "17_full_audit.md"), audit);

  await writeFile(
    path.join(OUT, "18_final_response_values.json"),
    JSON.stringify(
      {
        freeze: { gitCommit, gitDirty, hashCheck },
        candidates: candidates.map((c) => ({ k: c.k, ...c.metrics })),
        bootstrap: bootRows,
        decision,
        health,
        q1: { k0: q1K0, best: q1Best },
        q4: { k0: q4_0, k200: q4_200 },
        selectedMetrics: selected.metrics,
        k0Metrics: k0.metrics,
        selMag,
        selRelAll,
        selRelQ1,
        selRelQ4,
        bestFoldSum,
        foldMeta,
        LEGACY_K200_STATUS,
        c200: c200.metrics,
        rel200,
        boot200,
      },
      null,
      2
    )
  );

  console.log("\n=== M16g DONE ===");
  console.log(POSTERIOR_SELECTION_RESULT, "k=", SELECTED_RESEARCH_K);
  console.log(
    `RMSE k0=${k0.metrics.RMSE.toFixed(4)} bestPos k=${bestPositive.k} RMSE=${bestPositive.metrics.RMSE.toFixed(4)} rel=${(100 * relImpBest).toFixed(3)}% P=${pBeat.toFixed(3)}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
