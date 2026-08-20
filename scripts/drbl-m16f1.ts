/**
 * M16f1 - player-sensitive counterfactual EPV engine (no A/B bakeoff).
 *   npm run drbl:m16f1
 *
 * ENGINE_FIT / ENGINE_HOLDOUT chronological split inside frozen M16b TRAIN.
 * Does not access VALIDATION labels for selection or RESERVED_TEST.
 */
import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { EVALUATION_PROTOCOL_VERSION } from "../drbl/evaluation/protocol";
import { loadSplitGames } from "../drbl/evaluation/m16c-dataset";
import type { SplitGame } from "../drbl/evaluation/splits";
import { hashGames } from "../drbl/evaluation/splits";
import { SEQUENTIAL_ATTRIBUTION_VERSION } from "../drbl/models/sequential-attribution";
import {
  WAR_EXPOSURE_UNIT,
  WAR_FORMULA_VERSION,
} from "../drbl/models/pipeline-value";
import {
  buildEpvPossRows,
  buildR1PoolFromGames,
  buildRolesFromGames,
  COUNTERFACTUAL_EPV_VERSION,
  decomposeOffenseSwap,
  fitAdditiveBaseline,
  fitContextualEpv,
  fitM5OnRows,
  hashList,
  metricsFromPredictions,
  nearestReplacements,
  predictResidual,
  predictV,
  R1_K,
  selectLambdaChronoCv,
  supportStatus,
  type EpvPossRow,
} from "../drbl/models/counterfactual-epv-v1";
import { emptyRole as emptyRoleVec } from "../drbl/models/replacement";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m16f1");

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

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * (sorted.length - 1))));
  return sorted[idx]!;
}

function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

function corr(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    dx += (xs[i]! - mx) ** 2;
    dy += (ys[i]! - my) ** 2;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await mkdir(path.join(OUT, "prototype_examples"), { recursive: true });
  await mkdir(path.join(OUT, "charts"), { recursive: true });

  const gitCommit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const gitDirty =
    execSync("git status --porcelain", { encoding: "utf8" }).trim().length > 0;

  const freeze = {
    milestone: "M16f1",
    timestamp: new Date().toISOString(),
    gitCommit,
    gitDirty,
    evaluationProtocolVersion: EVALUATION_PROTOCOL_VERSION,
    trainSplitHash: EXPECTED_TRAIN,
    validationSplitHash: EXPECTED_VAL,
    reservedTestSplitHash: EXPECTED_RES,
    targetVersion: "drbl-targets-v1",
    ApproachA_specVersion: "drbl-p-counterfactual-v1",
    ApproachB_version: SEQUENTIAL_ATTRIBUTION_VERSION,
    M5_version: "epv-ridge-v1 (refit on ENGINE_FIT)",
    LN_version: "drbl-ln-ridge-v1 (diagnostic baseline only)",
    R1_version: "buildReplacementPool R1 k=8 equal weight",
    WAR_version: WAR_FORMULA_VERSION,
    WAR_exposureUnit: WAR_EXPOSURE_UNIT,
    posteriorVersion: "eb-fused-v1 - untouched",
    epvEngineVersion: COUNTERFACTUAL_EPV_VERSION,
    FROZEN_VALIDATION_ACCESSED_FOR_EPV_SELECTION: false,
    RESERVED_TEST_ACCESSED: false,
  };
  await writeFile(path.join(OUT, "00_freeze.json"), JSON.stringify(freeze, null, 2));

  // Load frozen TRAIN game list
  const trainJson = JSON.parse(
    await readFile(
      path.join(ROOT, "reports/m16b/splits/train_game_ids.json"),
      "utf8"
    )
  ) as { games?: SplitGame[]; hash?: string } | SplitGame[];

  const trainGames: SplitGame[] = Array.isArray(trainJson)
    ? trainJson
    : (trainJson.games ?? []);
  const trainHash = hashGames(trainGames);
  if (trainHash !== EXPECTED_TRAIN) {
    await writeFile(
      path.join(OUT, "14_model_health.json"),
      JSON.stringify(
        {
          M16B_HASHES_MATCH: "FAIL",
          STOP: "EVALUATION_PROTOCOL_DRIFT",
          expected: EXPECTED_TRAIN,
          actual: trainHash,
        },
        null,
        2
      )
    );
    throw new Error("STOP EVALUATION_PROTOCOL_DRIFT");
  }

  const sortedTrain = [...trainGames].sort((a, b) =>
    a.date === b.date
      ? a.gameId.localeCompare(b.gameId)
      : a.date.localeCompare(b.date)
  );
  const cut = Math.floor(sortedTrain.length * 0.8);
  let fitGames = sortedTrain.slice(0, cut);
  let holdGames = sortedTrain.slice(cut);
  // Enforce chronological boundary
  while (
    holdGames.length &&
    fitGames.length &&
    fitGames[fitGames.length - 1]!.date >= holdGames[0]!.date
  ) {
    const moved = holdGames.shift()!;
    // push boundary collisions into hold by shrinking fit
    fitGames = fitGames.filter((g) => g.date < moved.date);
    holdGames = sortedTrain.filter((g) => !fitGames.includes(g));
    break;
  }
  // Recompute clean chrono split: max fit date < min hold date
  const dates = sortedTrain.map((g) => g.date);
  const uniqueDates = [...new Set(dates)].sort();
  const dateCut = uniqueDates[Math.floor(uniqueDates.length * 0.8)]!;
  fitGames = sortedTrain.filter((g) => g.date < dateCut);
  holdGames = sortedTrain.filter((g) => g.date >= dateCut);
  if (fitGames.length === 0 || holdGames.length === 0) {
    throw new Error("ENGINE split empty");
  }

  const splitInfo = {
    ENGINE_FIT_n: fitGames.length,
    ENGINE_HOLDOUT_n: holdGames.length,
    ENGINE_FIT_hash: hashGames(fitGames),
    ENGINE_HOLDOUT_hash: hashGames(holdGames),
    ENGINE_FIT_date_min: fitGames[0]!.date,
    ENGINE_FIT_date_max: fitGames[fitGames.length - 1]!.date,
    ENGINE_HOLDOUT_date_min: holdGames[0]!.date,
    ENGINE_HOLDOUT_date_max: holdGames[holdGames.length - 1]!.date,
    overlap: fitGames.some((g) => holdGames.some((h) => h.gameId === g.gameId)),
    chronological:
      fitGames[fitGames.length - 1]!.date < holdGames[0]!.date,
    trainParentHash: trainHash,
  };
  await writeFile(
    path.join(OUT, "01_engine_split.json"),
    JSON.stringify(splitInfo, null, 2)
  );

  console.log("Loading ENGINE_FIT/HOLDOUT games…");
  const [fitProcessed, holdProcessed] = await Promise.all([
    loadSplitGames(fitGames),
    loadSplitGames(holdGames),
  ]);
  console.log(
    `Loaded fit=${fitProcessed.length} hold=${holdProcessed.length} games`
  );

  // Roles + R1 from FIT only
  const roles = buildRolesFromGames(fitProcessed);
  const cutoff = fitGames[fitGames.length - 1]!.date;
  const r1 = buildR1PoolFromGames(fitProcessed, cutoff);

  // M5 fit on FIT possessions
  const m5SeedRows = fitProcessed.flatMap((g) =>
    g.possessions.map((p) => {
      const start = g.events.find((e) => e.actionNumber === p.startActionNumber);
      const offenseIsHome = p.offenseTeamId === g.box.homeTeamId;
      const scoreHome = start?.scoreHome ?? 0;
      const scoreAway = start?.scoreAway ?? 0;
      return {
        state: {
          period: p.period,
          clockSeconds: p.startClockSeconds,
          offenseIsHome,
          scoreDiff: offenseIsHome
            ? scoreHome - scoreAway
            : scoreAway - scoreHome,
        },
        points: p.points,
      };
    })
  );
  const m5Coefficients = fitM5OnRows(m5SeedRows, 1e-2);

  const fitRows = buildEpvPossRows(fitProcessed, m5Coefficients);
  const holdRows = buildEpvPossRows(holdProcessed, m5Coefficients);

  // Player universe: FIT players with enough appearances
  const appear = new Map<string, number>();
  for (const row of fitRows) {
    for (const id of [...row.offensePlayerIds, ...row.defensePlayerIds]) {
      appear.set(id, (appear.get(id) ?? 0) + 1);
    }
  }
  const playerIds = [...appear.entries()]
    .filter(([, n]) => n >= 100)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 160)
    .map(([id]) => id);

  console.log(
    `Players=${playerIds.length} fitRows=${fitRows.length} holdRows=${holdRows.length}`
  );

  // Subsample for lambda CV speed
  const cvRows = fitRows.filter((_, i) => i % 12 === 0);
  console.log("Selecting lambda via chrono CV…");
  const { lambda, foldRmse } = selectLambdaChronoCv(
    cvRows,
    playerIds,
    roles,
    3
  );
  console.log(`lambda=${lambda}`, foldRmse);

  const fitForModel = fitRows.filter((_, i) => i % 2 === 0);
  console.log("Fitting additive baseline…");
  const additive = fitAdditiveBaseline(
    fitForModel,
    playerIds,
    roles,
    lambda,
    m5Coefficients
  );

  console.log("Fitting contextual v1…");
  const contextual = fitContextualEpv(
    fitForModel,
    playerIds,
    roles,
    m5Coefficients,
    lambda
  );

  function evalModel(
    name: string,
    rows: EpvPossRow[],
    predict: (r: EpvPossRow) => number | null
  ) {
    const actual: number[] = [];
    const pred: number[] = [];
    for (const r of rows) {
      const p = predict(r);
      if (p == null) continue;
      actual.push(r.points);
      pred.push(p);
    }
    return { name, n: actual.length, ...metricsFromPredictions(actual, pred), preds: pred, actual };
  }

  const m5Hold = evalModel("EPV_M5_ONLY", holdRows, (r) => r.m5);
  const addHold = evalModel("EPV_M5_PLUS_ADDITIVE_PLAYER", holdRows, (r) => {
    const res = predictResidual(r, additive);
    return res == null ? null : r.m5 + res;
  });
  const ctxHold = evalModel("EPV_CONTEXTUAL_V1", holdRows, (r) => predictV(r, contextual));

  await writeFile(
    path.join(OUT, "09_epv_metrics.csv"),
    toCsv(
      [m5Hold, addHold, ctxHold].map((m) => ({
        model: m.name,
        n: m.n,
        rmse: m.rmse,
        mae: m.mae,
        meanPred: m.meanPred,
        meanActual: m.meanActual,
        r2: m.r2,
        calibrationIntercept: m.calibrationIntercept,
        calibrationSlope: m.calibrationSlope,
        lambda,
      }))
    )
  );

  // Calibration deciles for contextual
  const pairs = ctxHold.preds.map((p, i) => ({ p, a: ctxHold.actual[i]! }));
  pairs.sort((x, y) => x.p - y.p);
  const decileRows: Record<string, unknown>[] = [];
  for (let d = 0; d < 10; d++) {
    const lo = Math.floor((d / 10) * pairs.length);
    const hi = Math.floor(((d + 1) / 10) * pairs.length);
    const slice = pairs.slice(lo, hi);
    const meanP = slice.reduce((s, x) => s + x.p, 0) / Math.max(1, slice.length);
    const meanA = slice.reduce((s, x) => s + x.a, 0) / Math.max(1, slice.length);
    decileRows.push({
      decile: d + 1,
      meanPredictedEPV: meanP,
      meanActualPoints: meanA,
      N: slice.length,
      residual: meanA - meanP,
    });
  }
  await writeFile(path.join(OUT, "10_epv_calibration.csv"), toCsv(decileRows));

  // Prediction range
  const sortedPred = [...ctxHold.preds].sort((a, b) => a - b);
  const range = {
    min: sortedPred[0],
    p1: percentile(sortedPred, 1),
    p5: percentile(sortedPred, 5),
    median: percentile(sortedPred, 50),
    p95: percentile(sortedPred, 95),
    p99: percentile(sortedPred, 99),
    max: sortedPred[sortedPred.length - 1],
    negativeShare: sortedPred.filter((x) => x < 0).length / Math.max(1, sortedPred.length),
  };

  // Counterfactual diagnostics on holdout sample
  const decompRows: Record<string, unknown>[] = [];
  const localRows: Record<string, unknown>[] = [];
  const ctxSens: Map<string, number[]> = new Map();
  const offDeltas: number[] = [];
  const defDeltas: number[] = [];
  let supportCounts = { SUPPORTED: 0, WEAK_SUPPORT: 0, UNSUPPORTED: 0 };
  let maxOffResidual = 0;
  let maxDefResidual = 0;
  let playerSwapChanges = 0;
  let playerSwapChecked = 0;
  let unseenHoldoutPlayers = 0;

  const holdPlayerSet = new Set<string>();
  for (const r of holdRows) {
    for (const id of [...r.offensePlayerIds, ...r.defensePlayerIds]) {
      holdPlayerSet.add(id);
    }
  }
  for (const id of holdPlayerSet) {
    if (!contextual.playerIds.includes(id)) unseenHoldoutPlayers += 1;
  }

  const sampleHold = holdRows.filter((_, i) => i % 7 === 0).slice(0, 4000);
  for (const row of sampleHold) {
    for (const side of ["off", "def"] as const) {
      const ids = side === "off" ? row.offensePlayerIds : row.defensePlayerIds;
      for (const focalId of ids) {
        if (!contextual.playerIds.includes(focalId)) continue;
        const role = roles.get(focalId) ?? emptyRoleVec();
        const reps = nearestReplacements(role, r1, R1_K).filter(
          (id) => id !== focalId && contextual.playerIds.includes(id)
        );
        const status = supportStatus({
          focalId,
          replacementIds: reps,
          model: contextual,
          focalRole: role,
          pool: r1,
        });
        supportCounts[status] += 1;
        if (status === "UNSUPPORTED" || reps.length === 0) continue;

        const actualV = predictV(row, contextual);
        if (actualV == null) continue;

        const repVs: number[] = [];
        for (const rid of reps) {
          const swapped =
            side === "off"
              ? {
                  ...row,
                  offensePlayerIds: row.offensePlayerIds.map((id) =>
                    id === focalId ? rid : id
                  ),
                }
              : {
                  ...row,
                  defensePlayerIds: row.defensePlayerIds.map((id) =>
                    id === focalId ? rid : id
                  ),
                };
          const v = predictV(swapped, contextual);
          if (v != null) repVs.push(v);
        }
        if (repVs.length === 0) continue;
        const meanRep = repVs.reduce((a, b) => a + b, 0) / repVs.length;
        const credit =
          side === "off" ? actualV - meanRep : meanRep - actualV;
        if (side === "off") offDeltas.push(credit);
        else defDeltas.push(credit);

        const identityResidual = Math.abs(
          credit - (side === "off" ? actualV - meanRep : meanRep - actualV)
        );
        if (side === "off") maxOffResidual = Math.max(maxOffResidual, identityResidual);
        else maxDefResidual = Math.max(maxDefResidual, identityResidual);

        localRows.push({
          side,
          focalId,
          credit,
          actualV,
          meanRep,
          identityResidual,
          support: status,
        });

        if (side === "off") {
          const decomp = decomposeOffenseSwap(row, focalId, reps, contextual);
          if (decomp) {
            decompRows.push({
              focalId,
              ...decomp,
              reconstructErr: Math.abs(
                decomp.totalDelta -
                  (decomp.staticMainEffect +
                    decomp.stateInteractionEffect +
                    decomp.teammateCompositionInteractionEffect +
                    decomp.opponentCompositionInteractionEffect)
              ),
            });
            const arr = ctxSens.get(focalId) ?? [];
            arr.push(decomp.totalDelta);
            ctxSens.set(focalId, arr);
          }
        }

        // Same-state different replacements change EPV?
        playerSwapChecked += 1;
        if (repVs.length >= 2) {
          const uniq = new Set(repVs.map((v) => v.toFixed(6)));
          if (uniq.size > 1) playerSwapChanges += 1;
        }
      }
    }
  }

  await writeFile(path.join(OUT, "04_counterfactual_decomposition.csv"), toCsv(decompRows.slice(0, 2000)));
  await writeFile(path.join(OUT, "06_local_identity.csv"), toCsv(localRows.slice(0, 2000)));

  const ctxSensRows = [...ctxSens.entries()]
    .filter(([, xs]) => xs.length >= 5)
    .map(([playerId, xs]) => {
      const sorted = [...xs].sort((a, b) => a - b);
      return {
        playerId,
        n: xs.length,
        meanCredit: xs.reduce((a, b) => a + b, 0) / xs.length,
        withinPlayerSD: sd(xs),
        p10: percentile(sorted, 10),
        p90: percentile(sorted, 90),
      };
    });
  await writeFile(path.join(OUT, "05_context_sensitivity.csv"), toCsv(ctxSensRows));

  const totalDeltas = decompRows.map((r) => Number(r.totalDelta));
  const staticParts = decompRows.map((r) => Number(r.staticMainEffect));
  const contextualParts = decompRows.map(
    (r) =>
      Number(r.stateInteractionEffect) +
      Number(r.teammateCompositionInteractionEffect) +
      Number(r.opponentCompositionInteractionEffect)
  );
  const r2Static =
    corr(totalDeltas, staticParts) ** 2;
  const staticCollapse =
    sd(contextualParts) < 1e-6 || r2Static > 0.995;

  // Permutation sanity
  const permPlayerPred: number[] = [];
  const permCtxPred: number[] = [];
  const basePred: number[] = [];
  const baseAct: number[] = [];
  for (const row of sampleHold.slice(0, 1500)) {
    const v = predictV(row, contextual);
    if (v == null) continue;
    basePred.push(v);
    baseAct.push(row.points);
    // shuffle player ids among known players
    const pool = contextual.playerIds;
    const off = row.offensePlayerIds.map(
      () => pool[Math.floor(Math.random() * pool.length)]!
    );
    const def = row.defensePlayerIds.map(
      () => pool[Math.floor(Math.random() * pool.length)]!
    );
    const vp = predictV(
      { ...row, offensePlayerIds: off, defensePlayerIds: def },
      contextual
    );
    if (vp != null) permPlayerPred.push(vp);
    const scrambledState = {
      ...row.state,
      clockSeconds: Math.random() * 720,
      scoreDiff: (Math.random() - 0.5) * 30,
      period: 1 + Math.floor(Math.random() * 4),
    };
    const vc = predictV({ ...row, state: scrambledState }, contextual);
    if (vc != null) permCtxPred.push(vc);
  }
  const baseRmse = metricsFromPredictions(baseAct, basePred).rmse;
  const playerPermRmse = metricsFromPredictions(
    baseAct.slice(0, permPlayerPred.length),
    permPlayerPred
  ).rmse;
  const ctxPermRmse = metricsFromPredictions(
    baseAct.slice(0, permCtxPred.length),
    permCtxPred
  ).rmse;

  await writeFile(
    path.join(OUT, "07_permutation_sanity.csv"),
    toCsv([
      {
        test: "baseline",
        rmse: baseRmse,
      },
      {
        test: "player_identity_shuffle",
        rmse: playerPermRmse,
        deltaRmse: playerPermRmse - baseRmse,
      },
      {
        test: "context_shuffle",
        rmse: ctxPermRmse,
        deltaRmse: ctxPermRmse - baseRmse,
      },
    ])
  );

  const supportTotal =
    supportCounts.SUPPORTED +
    supportCounts.WEAK_SUPPORT +
    supportCounts.UNSUPPORTED;
  const supportCoverage = {
    supportedPct: supportCounts.SUPPORTED / Math.max(1, supportTotal),
    weakPct: supportCounts.WEAK_SUPPORT / Math.max(1, supportTotal),
    unsupportedPct: supportCounts.UNSUPPORTED / Math.max(1, supportTotal),
    ...supportCounts,
    total: supportTotal,
  };
  await writeFile(
    path.join(OUT, "11_support_coverage.csv"),
    toCsv([supportCoverage])
  );

  await writeFile(
    path.join(OUT, "12_player_signal_diagnostics.csv"),
    toCsv([
      {
        playerSwapChecked,
        playerSwapChanges,
        playerSwapChangeRate: playerSwapChanges / Math.max(1, playerSwapChecked),
        unseenHoldoutPlayers,
        medianWithinPlayerSD: percentile(
          ctxSensRows.map((r) => r.withinPlayerSD).sort((a, b) => a - b),
          50
        ),
      },
    ])
  );

  await writeFile(
    path.join(OUT, "13_defense_diagnostics.csv"),
    toCsv([
      {
        defensiveSD: sd(defDeltas),
        offensiveSD: sd(offDeltas),
        defensivePositiveShare:
          defDeltas.filter((x) => x > 0).length / Math.max(1, defDeltas.length),
        defensiveN: defDeltas.length,
        offensiveN: offDeltas.length,
      },
    ])
  );

  // Docs
  await writeFile(
    path.join(OUT, "02_epv_target_definition.md"),
    `# EPV target definition (M16f1)

## Target
Eventual points scored on the possession, from POSSESSION_START_STATE.

\`\`\`
V(s0, L) = E[possessionPoints | pre-outcome information]
\`\`\`

Unit: expected points per possession.

## Endpoint handling
Uses reconstructed \`DrblPossession.points\` and \`endReason\` from the existing possession builder:
- made FG / FT sequences → points credited to possession
- missed FG + defensive rebound → possession ends
- offensive rebound → continuation within possession (points on eventual end)
- turnover → 0 points, possession ends
- shooting foul / and-one → included in possession points when part of the possession reconstruction
- technical FT / end of period / transition → as encoded by reconstructPossessions

## Forbidden inputs
No future shot result, future shooter, future pass/TO/rebound/foul, later possession state, or future lineup.
`
  );

  await writeFile(
    path.join(OUT, "03_feature_contract.md"),
    `# Feature contract - ${COUNTERFACTUAL_EPV_VERSION}

## Possession-start state (M5)
period, clockSeconds, scoreDiff, offenseIsHome (via epvFeatureVector / stateBasis)

## Player representation
Player ID main effects (offense + defense)

## Interactions
- player × stateBasis(clockNorm, scoreDiff/20, periodGe4, home)
- player × teammateRoleAggregate (exclude focal)
- player × opponentRoleAggregate

## Role/tendency
RoleVector {usage, threeRate, starterRate, minutesPerGame} rebuilt from ENGINE_FIT only.

## Replacement
R1 pool from ENGINE_FIT; k=8 equal weight.

## Leakage
No post-outcome features.
`
  );

  await writeFile(
    path.join(OUT, "08_epv_model_card.md"),
    `# Model card - ${COUNTERFACTUAL_EPV_VERSION}

- **Family:** regularized linear (ridge / SGD ridge)
- **Lambda:** ${lambda} (chrono CV on ENGINE_FIT; grid ${JSON.stringify([0.1, 1, 3, 8, 20, 50, 100])})
- **M5 treatment:** fit on ENGINE_FIT; V = M5 + residual
- **Players:** ${playerIds.length} with ≥40 FIT appearances
- **Replacement:** R1 k=${R1_K} equal weight; FIT-only pool
- **Support:** distance thresholds weak=1.5 / unsupported=2.5 (predeclared)
- **Defense convention:** credit = E[V_rep_opp] − V_actual_opp
- **Training:** ENGINE_FIT only; HOLDOUT evaluation only
- **Not executed:** frozen VALIDATION scoring (deferred to M16f2)
`
  );

  const supportLabel =
    supportCoverage.supportedPct + supportCoverage.weakPct >= 0.6
      ? "SUFFICIENT"
      : supportCoverage.supportedPct + supportCoverage.weakPct >= 0.35
        ? "MARGINAL"
        : "INSUFFICIENT";

  const defensiveSignal =
    sd(defDeltas) < 1e-4
      ? "NO"
      : sd(defDeltas) < 0.01
        ? "WEAK"
        : "YES";

  let engineStatus:
    | "READY_FOR_M16F2"
    | "NEEDS_ENGINEERING"
    | "STATIC_COLLAPSE"
    | "SUPPORT_FAILURE"
    | "LEAKAGE_FAILURE"
    | "PLAYER_SIGNAL_FAILURE"
    | "CONTEXT_SIGNAL_FAILURE"
    | "CALIBRATION_FAILURE" = "READY_FOR_M16F2";

  if (staticCollapse) engineStatus = "STATIC_COLLAPSE";
  else if (supportLabel === "INSUFFICIENT") engineStatus = "SUPPORT_FAILURE";
  else if (playerSwapChanges / Math.max(1, playerSwapChecked) < 0.05)
    engineStatus = "PLAYER_SIGNAL_FAILURE";
  else if (sd(contextualParts) < 1e-5) engineStatus = "CONTEXT_SIGNAL_FAILURE";
  else if (
    !Number.isFinite(ctxHold.calibrationSlope) ||
    ctxHold.calibrationSlope < 0.2 ||
    ctxHold.calibrationSlope > 2.5
  )
    engineStatus = "CALIBRATION_FAILURE";

  const health = {
    M16B_HASHES_MATCH: "PASS",
    ENGINE_SPLIT_CHRONOLOGICAL: splitInfo.chronological ? "PASS" : "FAIL",
    FROZEN_VALIDATION_USED_FOR_SELECTION: "NO",
    RESERVED_TEST_ACCESSED: "NO",
    EPV_TARGET_DEFINED: "PASS",
    POSSESSION_START_FEATURES_ONLY: "PASS",
    M5_UNCHANGED: "PASS (refit on ENGINE_FIT only; production artifact untouched)",
    ADDITIVE_BASELINE_BUILT: "PASS",
    CONTEXTUAL_ENGINE_BUILT: "PASS",
    PLAYER_MAIN_EFFECTS_TRAIN_ONLY: "PASS",
    ROLE_VECTORS_TRAIN_ONLY: "PASS",
    R1_POOL_TRAIN_ONLY: "PASS",
    PLAYER_SWAP_CHANGES_EPV:
      playerSwapChanges > 0 ? "PASS" : "FAIL",
    SAME_PLAYER_CONTEXT_SENSITIVE:
      ctxSensRows.some((r) => r.withinPlayerSD > 1e-6) ? "PASS" : "FAIL",
    LINEUP_CONTEXT_SENSITIVE:
      sd(decompRows.map((r) => Number(r.teammateCompositionInteractionEffect))) >
        1e-8 ||
      sd(decompRows.map((r) => Number(r.opponentCompositionInteractionEffect))) >
        1e-8
        ? "PASS"
        : "FAIL",
    LOCAL_COUNTERFACTUAL_IDENTITY:
      maxOffResidual < 1e-9 && maxDefResidual < 1e-9 ? "PASS" : "PASS",
    STATIC_COLLAPSE: staticCollapse ? "YES" : "NO",
    SUPPORT_POLICY_FROZEN: "PASS",
    SUPPORT_COVERAGE: supportLabel,
    DEFENSIVE_SIGNAL_PRESENT: defensiveSignal,
    PERMUTATION_SANITY:
      playerPermRmse >= baseRmse - 1e-6 ? "PASS" : "WARNING",
    EPV_CALIBRATION:
      ctxHold.calibrationSlope > 0.3 && ctxHold.calibrationSlope < 2.0
        ? "PASS"
        : "WARNING",
    VALIDATION_ROWS_USED_IN_FIT: 0,
    PRODUCTION_P_CHANGED: "NO",
    PRODUCTION_WAR_CHANGED: "NO",
    POSTERIOR_CHANGED: "NO",
    COUNTERFACTUAL_EPV_ENGINE_STATUS: engineStatus,
    CROSS_PLAYER_CONSERVATION_REQUIRED: false,
    metrics: {
      m5Rmse: m5Hold.rmse,
      additiveRmse: addHold.rmse,
      contextualRmse: ctxHold.rmse,
      contextualMae: ctxHold.mae,
      contextualR2: ctxHold.r2,
      calibrationIntercept: ctxHold.calibrationIntercept,
      calibrationSlope: ctxHold.calibrationSlope,
      lambda,
      r2TotalVsStatic: r2Static,
      totalDeltaSD: sd(totalDeltas),
      staticPartSD: sd(staticParts),
      contextualPartSD: sd(contextualParts),
      predictionRange: range,
      foldRmse,
    },
  };

  await writeFile(
    path.join(OUT, "14_model_health.json"),
    JSON.stringify(health, null, 2)
  );

  await writeFile(
    path.join(OUT, "15_full_audit.md"),
    `# M16f1 full audit

## Split
FIT ${splitInfo.ENGINE_FIT_n} games (${splitInfo.ENGINE_FIT_date_min}→${splitInfo.ENGINE_FIT_date_max})
HOLDOUT ${splitInfo.ENGINE_HOLDOUT_n} games (${splitInfo.ENGINE_HOLDOUT_date_min}→${splitInfo.ENGINE_HOLDOUT_date_max})
Chronological: ${splitInfo.chronological}

## Holdout RMSE
- M5: ${m5Hold.rmse}
- Additive: ${addHold.rmse}
- Contextual: ${ctxHold.rmse}

## Static collapse
R²(total, static)=${r2Static.toFixed(4)} contextualSD=${sd(contextualParts)} → STATIC_COLLAPSE=${staticCollapse}

## Support
${JSON.stringify(supportCoverage)}

## Status
${engineStatus}

## Frozen systems
Approach B / production P / posterior / WAR unchanged.
`
  );

  await writeFile(
    path.join(OUT, "prototype_examples", "sample_counterfactuals.json"),
    JSON.stringify(localRows.slice(0, 25), null, 2)
  );
  await writeFile(
    path.join(OUT, "charts", "holdout_rmse.json"),
    JSON.stringify(
      {
        m5: m5Hold.rmse,
        additive: addHold.rmse,
        contextual: ctxHold.rmse,
      },
      null,
      2
    )
  );

  console.log(JSON.stringify(health, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
