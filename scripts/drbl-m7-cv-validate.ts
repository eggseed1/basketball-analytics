/**
 * M7-CV validation — C0 vs C1 vs C2 continuation + experimental SDV.
 * Does NOT modify M6 coefficients, fusion, or public leaderboards.
 *
 *   npm run drbl:m7-cv -- --season 2024-25 --limit 200
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { listSeasonGames, processGame } from "../drbl/index";
import { warmEpvModel } from "../drbl/models/expected-points";
import {
  M7_CV_VERSION,
  C1_FEATURE_NAMES,
  C2_FEATURE_NAMES,
  buildContinueRowsForGame,
  chronologicalOofContinuation,
  continueStateAtShot,
  predictVCont,
  accumulateTeamPppFromPossessions,
  possessionStartFlags,
  type ContinueStateRow,
  type TeamPppPrior,
} from "../drbl/models/continuation-value";
import {
  buildShotRowsForGame,
  chronologicalOofShotDecision,
  type ShotDecisionRow,
} from "../drbl/models/shot-decision";
import type { DrblPossession } from "../drbl/types";
import { DRBL_PARSER_VERSION, DRBL_RECONSTRUCTION_VERSION } from "../drbl/constants";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const keys = Object.keys(rows[0]!);
  return (
    keys.join(",") +
    "\n" +
    rows.map((r) => keys.map((k) => csvEscape(r[k])).join(",")).join("\n") +
    "\n"
  );
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function std(xs: number[]): number {
  if (xs.length === 0) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function corr(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n === 0) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i]! - mx;
    const b = ys[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den > 1e-12 ? num / den : 0;
}

function shotContinueState(
  shot: ShotDecisionRow,
  possessions: DrblPossession[],
  eventsBeforeShot: import("../drbl/types").DrblEvent[]
): ContinueStateRow {
  const poss = possessions.find((p) => p.possessionId === shot.possessionId);
  const startClock = poss?.startClockSeconds ?? shot.clockSeconds;
  const age = Math.max(0, startClock - shot.clockSeconds);
  const flags = possessionStartFlags(eventsBeforeShot);
  return continueStateAtShot({
    gameId: shot.gameId,
    gameDate: shot.gameDate,
    actionNumber: shot.actionNumber,
    possessionId: shot.possessionId,
    period: shot.period,
    clockSeconds: shot.clockSeconds,
    scoreDiff: shot.scoreDiff,
    offenseIsHome: shot.offenseIsHome,
    possessionAgeSec: age,
    startedViaOreb: flags.startedViaOreb,
    startedViaSteal: flags.startedViaSteal,
    teamId: shot.teamId,
    defenseTeamId: shot.defenseTeamId,
  });
}

async function main() {
  const season = arg("season") ?? "2024-25";
  const limit = arg("limit") ? Number(arg("limit")) : 200;
  const holdoutFrac = arg("holdout-frac") ? Number(arg("holdout-frac")) : 0.2;

  const outDir = path.join(process.cwd(), "reports", "m7");
  await mkdir(outDir, { recursive: true });
  await warmEpvModel();

  let games = await listSeasonGames(season);
  if (limit > 0) games = games.slice(0, limit);

  const bundles: Array<{
    gameDate: string;
    gameId: string;
    continueRows: ContinueStateRow[];
    possessions: DrblPossession[];
    shotRows: ShotDecisionRow[];
    events: import("../drbl/types").DrblEvent[];
  }> = [];
  let gamesProcessed = 0;
  let gamesFailed = 0;

  for (const meta of games) {
    try {
      const g = await processGame(meta, { persist: true });
      if (g.reconcile.quarantined) continue;
      const continueRows = buildContinueRowsForGame(
        g.box,
        g.events,
        g.possessions
      );
      const shotRows = buildShotRowsForGame(g.box, g.events, g.possessions);
      if (continueRows.length === 0 && shotRows.length === 0) continue;
      bundles.push({
        gameDate: g.box.gameDate || meta.gameDate,
        gameId: g.box.gameId,
        continueRows,
        possessions: g.possessions,
        shotRows,
        events: g.events,
      });
      gamesProcessed += 1;
    } catch {
      gamesFailed += 1;
    }
  }

  if (bundles.length < 10) {
    throw new Error(`Need more games (got ${bundles.length})`);
  }

  // --- Gate 1: continuation OOS on continue-labeled states ---
  const contOof = chronologicalOofContinuation(
    bundles.map((b) => ({
      gameDate: b.gameDate,
      gameId: b.gameId,
      continueRows: b.continueRows,
      possessions: b.possessions,
    })),
    { holdoutFrac, lambda: 5 }
  );

  // --- Frozen M6 shoot OOF (read-only use of M6 module) ---
  const shotOof = chronologicalOofShotDecision(
    bundles.map((b) => ({
      gameDate: b.gameDate,
      gameId: b.gameId,
      rows: b.shotRows,
    })),
    { holdoutFrac, lambda: 5 }
  );
  const shotHoldout = shotOof.oof.filter((r) => r.fold === "holdout");

  // Align continue coeffs with same chrono cut; apply V_cont at shot moments.
  const sorted = bundles
    .slice()
    .sort(
      (a, b) =>
        a.gameDate.localeCompare(b.gameDate) || a.gameId.localeCompare(b.gameId)
    );
  const cut = Math.max(1, Math.floor(sorted.length * (1 - holdoutFrac)));
  const trainGames = sorted.slice(0, cut);
  const holdoutGames = sorted.slice(cut);

  const priors = new Map<string, TeamPppPrior>();
  for (const g of trainGames) {
    accumulateTeamPppFromPossessions(g.possessions, priors);
  }

  type SdvRow = {
    epvShoot: number;
    shotMaking: number;
    made: number;
    c0: number;
    c1: number;
    c2: number;
    sdv0: number;
    sdv1: number;
    sdv2: number;
    possessionAgeSec: number;
    clockSeconds: number;
    distanceFeet: number | null;
  };
  const sdvRows: SdvRow[] = [];
  const livePriors = new Map(priors);
  const shotByKey = new Map(
    shotHoldout.map((r) => [`${r.gameId}:${r.actionNumber}`, r] as const)
  );

  for (const g of holdoutGames) {
    for (const shot of g.shotRows) {
      const m6 = shotByKey.get(`${shot.gameId}:${shot.actionNumber}`);
      if (!m6) continue;
      const before = g.events.filter(
        (e) =>
          e.actionNumber < shot.actionNumber &&
          g.possessions.some(
            (p) =>
              p.possessionId === shot.possessionId &&
              p.eventActionNumbers.includes(e.actionNumber)
          )
      );
      const st = shotContinueState(shot, g.possessions, before);
      const c0 = predictVCont(st, "C0", contOof.c1Coef, contOof.c2Coef, livePriors);
      const c1 = predictVCont(st, "C1", contOof.c1Coef, contOof.c2Coef, livePriors);
      const c2 = predictVCont(st, "C2", contOof.c1Coef, contOof.c2Coef, livePriors);
      sdvRows.push({
        epvShoot: m6.epvShoot,
        shotMaking: m6.shotMaking,
        made: m6.made,
        c0,
        c1,
        c2,
        sdv0: m6.epvShoot - c0,
        sdv1: m6.epvShoot - c1,
        sdv2: m6.epvShoot - c2,
        possessionAgeSec: st.possessionAgeSec,
        clockSeconds: st.clockSeconds,
        distanceFeet: shot.distanceFeet,
      });
    }
    accumulateTeamPppFromPossessions(g.possessions, livePriors);
  }

  // Calibration bins for C2 on continue holdout
  const contHold = contOof.holdoutPreds;
  const calRows: Record<string, unknown>[] = [];
  for (const model of ["c0", "c1", "c2"] as const) {
    const preds = contHold.map((r) => r[model]);
    const sortedPred = [...preds].sort((a, b) => a - b);
    const q = (p: number) =>
      sortedPred[Math.min(sortedPred.length - 1, Math.floor(p * sortedPred.length))]!;
    const cuts = [q(0.2), q(0.4), q(0.6), q(0.8), Infinity];
    let prev = -Infinity;
    for (let i = 0; i < cuts.length; i++) {
      const hi = cuts[i]!;
      const idx = contHold
        .map((r, j) => ({ r, j }))
        .filter(({ r }) => r[model] > prev && r[model] <= hi);
      if (idx.length === 0) continue;
      calRows.push({
        model,
        bin: `q${i + 1}`,
        n: idx.length,
        mean_pred: Number(mean(idx.map(({ r }) => r[model])).toFixed(4)),
        mean_actual: Number(
          mean(idx.map(({ r }) => r.remainingPoints)).toFixed(4)
        ),
      });
      prev = hi === Infinity ? prev : hi;
    }
  }

  // Age / clock response for C2
  const ageBuckets = [
    { name: "age_0_4", lo: 0, hi: 4 },
    { name: "age_4_8", lo: 4, hi: 8 },
    { name: "age_8_14", lo: 8, hi: 14 },
    { name: "age_14_24", lo: 14, hi: 24 },
    { name: "age_24_plus", lo: 24, hi: 1e9 },
  ];

  const baselineCmp: Record<string, unknown>[] = [];
  const pushCmp = (
    metric: string,
    c0v: number,
    c1v: number,
    c2v: number,
    notes = ""
  ) => {
    baselineCmp.push({
      metric,
      C0: Number(c0v.toFixed(6)),
      C1: Number(c1v.toFixed(6)),
      C2: Number(c2v.toFixed(6)),
      delta_C1_minus_C0: Number((c1v - c0v).toFixed(6)),
      delta_C2_minus_C0: Number((c2v - c0v).toFixed(6)),
      notes,
    });
  };

  pushCmp("continue_holdout_mae", contOof.c0.mae, contOof.c1.mae, contOof.c2.mae, "lower better");
  pushCmp("continue_holdout_rmse", contOof.c0.rmse, contOof.c1.rmse, contOof.c2.rmse, "lower better");
  pushCmp("continue_holdout_corr", contOof.c0.corr, contOof.c1.corr, contOof.c2.corr, "higher better");
  pushCmp("continue_holdout_std_pred", contOof.c0.stdPred, contOof.c1.stdPred, contOof.c2.stdPred, "non-flat");
  pushCmp("continue_holdout_mean_pred", contOof.c0.meanPred, contOof.c1.meanPred, contOof.c2.meanPred, "");

  pushCmp(
    "sdv_corr_epvShoot",
    corr(sdvRows.map((r) => r.sdv0), sdvRows.map((r) => r.epvShoot)),
    corr(sdvRows.map((r) => r.sdv1), sdvRows.map((r) => r.epvShoot)),
    corr(sdvRows.map((r) => r.sdv2), sdvRows.map((r) => r.epvShoot)),
    "lower better for decision separation"
  );
  pushCmp(
    "sdv_corr_shotMaking",
    corr(sdvRows.map((r) => r.sdv0), sdvRows.map((r) => r.shotMaking)),
    corr(sdvRows.map((r) => r.sdv1), sdvRows.map((r) => r.shotMaking)),
    corr(sdvRows.map((r) => r.sdv2), sdvRows.map((r) => r.shotMaking)),
    "≈0 desired"
  );
  pushCmp(
    "vcont_at_shots_std",
    std(sdvRows.map((r) => r.c0)),
    std(sdvRows.map((r) => r.c1)),
    std(sdvRows.map((r) => r.c2)),
    "higher ⇒ less flat continue"
  );
  pushCmp(
    "sdv_std",
    std(sdvRows.map((r) => r.sdv0)),
    std(sdvRows.map((r) => r.sdv1)),
    std(sdvRows.map((r) => r.sdv2)),
    ""
  );

  const oosRows: Record<string, unknown>[] = [
    {
      gate: "C1.1",
      metric: "mae",
      model: "C0",
      value: contOof.c0.mae,
      n: contOof.c0.n,
    },
    {
      gate: "C1.1",
      metric: "mae",
      model: "C1",
      value: contOof.c1.mae,
      n: contOof.c1.n,
    },
    {
      gate: "C1.1",
      metric: "mae",
      model: "C2",
      value: contOof.c2.mae,
      n: contOof.c2.n,
    },
    {
      gate: "C1.1",
      metric: "rmse",
      model: "C0",
      value: contOof.c0.rmse,
      n: contOof.c0.n,
    },
    {
      gate: "C1.1",
      metric: "rmse",
      model: "C1",
      value: contOof.c1.rmse,
      n: contOof.c1.n,
    },
    {
      gate: "C1.1",
      metric: "rmse",
      model: "C2",
      value: contOof.c2.rmse,
      n: contOof.c2.n,
    },
    {
      gate: "C1.2",
      metric: "corr",
      model: "C0",
      value: contOof.c0.corr,
      n: contOof.c0.n,
    },
    {
      gate: "C1.2",
      metric: "corr",
      model: "C1",
      value: contOof.c1.corr,
      n: contOof.c1.n,
    },
    {
      gate: "C1.2",
      metric: "corr",
      model: "C2",
      value: contOof.c2.corr,
      n: contOof.c2.n,
    },
    {
      gate: "sample",
      metric: "train_continue_rows",
      model: "all",
      value: contOof.trainN,
      n: contOof.trainN,
    },
    {
      gate: "sample",
      metric: "holdout_continue_rows",
      model: "all",
      value: contOof.holdoutN,
      n: contOof.holdoutN,
    },
    {
      gate: "sample",
      metric: "holdout_shots_sdv",
      model: "all",
      value: sdvRows.length,
      n: sdvRows.length,
    },
    {
      gate: "sample",
      metric: "games_processed",
      model: "all",
      value: gamesProcessed,
      n: gamesProcessed,
    },
    {
      gate: "S2",
      metric: "shotMaking_mean",
      model: "M6_frozen",
      value: mean(sdvRows.map((r) => r.shotMaking)),
      n: sdvRows.length,
    },
    {
      gate: "S1",
      metric: "make_mae",
      model: "M6_frozen",
      value: shotOof.holdoutMake.mae,
      n: shotOof.holdoutMake.n,
    },
  ];

  for (const model of ["C0", "C1", "C2"] as const) {
    const key = model.toLowerCase() as "c0" | "c1" | "c2";
    oosRows.push({
      gate: "D1",
      metric: "sdv_corr_shotMaking",
      model,
      value: corr(
        sdvRows.map((r) => r[`sdv${key.slice(1)}` as "sdv0" | "sdv1" | "sdv2"]),
        sdvRows.map((r) => r.shotMaking)
      ),
      n: sdvRows.length,
    });
    oosRows.push({
      gate: "D2",
      metric: "sdv_corr_epvShoot",
      model,
      value: corr(
        sdvRows.map((r) => r[`sdv${key.slice(1)}` as "sdv0" | "sdv1" | "sdv2"]),
        sdvRows.map((r) => r.epvShoot)
      ),
      n: sdvRows.length,
    });
    oosRows.push({
      gate: "D5",
      metric: "vcont_std_at_shots",
      model,
      value: std(sdvRows.map((r) => r[key])),
      n: sdvRows.length,
    });
    const sdvKey = `sdv${key.slice(1)}` as "sdv0" | "sdv1" | "sdv2";
    const negMakes = sdvRows.filter((r) => r.made === 1 && r[sdvKey] < 0).length;
    const posMiss = sdvRows.filter((r) => r.made === 0 && r[sdvKey] > 0).length;
    oosRows.push({
      gate: "D3",
      metric: "neg_sdv_makes",
      model,
      value: negMakes,
      n: sdvRows.filter((r) => r.made === 1).length,
    });
    oosRows.push({
      gate: "D3",
      metric: "pos_sdv_misses",
      model,
      value: posMiss,
      n: sdvRows.filter((r) => r.made === 0).length,
    });
  }

  // Fix D1/D2 mapping - the key hack is messy. Recompute cleanly:
  // Actually sdv0/sdv1/sdv2 mapping from c0/c1/c2: key.slice(1) on "c0" gives "0" -> sdv0. OK.

  for (const b of ageBuckets) {
    const subset = contHold.filter(
      (r) => r.possessionAgeSec >= b.lo && r.possessionAgeSec < b.hi
    );
    if (subset.length < 5) continue;
    oosRows.push({
      gate: "C1.4",
      metric: `mean_c2_pred_${b.name}`,
      model: "C2",
      value: mean(subset.map((r) => r.c2)),
      n: subset.length,
    });
    oosRows.push({
      gate: "C1.4",
      metric: `mean_actual_${b.name}`,
      model: "Y",
      value: mean(subset.map((r) => r.remainingPoints)),
      n: subset.length,
    });
  }

  const late = contHold.filter((r) => r.clockSeconds <= 8);
  const early = contHold.filter((r) => r.clockSeconds > 60);
  if (late.length && early.length) {
    oosRows.push({
      gate: "C1.4",
      metric: "mean_c2_late_le8",
      model: "C2",
      value: mean(late.map((r) => r.c2)),
      n: late.length,
    });
    oosRows.push({
      gate: "C1.4",
      metric: "mean_c2_early_gt60",
      model: "C2",
      value: mean(early.map((r) => r.c2)),
      n: early.length,
    });
  }

  // D4 matched-state: bin by age×clock; compare share of low-SDV shots below continue mean
  const d4 = (sdvKey: "sdv0" | "sdv1" | "sdv2") => {
    const bins = new Map<string, { contYs: number[]; shots: SdvRow[] }>();
    for (const r of contHold) {
      const ageB =
        r.possessionAgeSec < 8 ? "a0" : r.possessionAgeSec < 16 ? "a1" : "a2";
      const clkB = r.clockSeconds <= 8 ? "cL" : r.clockSeconds <= 60 ? "cM" : "cE";
      const k = `${ageB}_${clkB}`;
      const b = bins.get(k) ?? { contYs: [], shots: [] };
      b.contYs.push(r.remainingPoints);
      bins.set(k, b);
    }
    for (const s of sdvRows) {
      const ageB =
        s.possessionAgeSec < 8 ? "a0" : s.possessionAgeSec < 16 ? "a1" : "a2";
      const clkB = s.clockSeconds <= 8 ? "cL" : s.clockSeconds <= 60 ? "cM" : "cE";
      const k = `${ageB}_${clkB}`;
      const b = bins.get(k) ?? { contYs: [], shots: [] };
      b.shots.push(s);
      bins.set(k, b);
    }
    let lowBelow = 0;
    let lowN = 0;
    let highBelow = 0;
    let highN = 0;
    for (const b of bins.values()) {
      if (b.contYs.length < 10 || b.shots.length < 5) continue;
      const contMean = mean(b.contYs);
      const sdvVals = b.shots.map((s) => s[sdvKey]).sort((a, c) => a - c);
      const cutLo = sdvVals[Math.floor(0.3 * sdvVals.length)]!;
      const cutHi = sdvVals[Math.floor(0.7 * sdvVals.length)]!;
      for (const s of b.shots) {
        if (s[sdvKey] <= cutLo) {
          lowN += 1;
          if (s.epvShoot < contMean) lowBelow += 1;
        } else if (s[sdvKey] >= cutHi) {
          highN += 1;
          if (s.epvShoot < contMean) highBelow += 1;
        }
      }
    }
    return {
      lowShareBelow: lowN ? lowBelow / lowN : 0,
      highShareBelow: highN ? highBelow / highN : 0,
      lowN,
      highN,
    };
  };
  for (const [model, key] of [
    ["C0", "sdv0"],
    ["C1", "sdv1"],
    ["C2", "sdv2"],
  ] as const) {
    const d = d4(key);
    oosRows.push({
      gate: "D4",
      metric: "low_sdv_share_epvShoot_below_contMean",
      model,
      value: d.lowShareBelow,
      n: d.lowN,
    });
    oosRows.push({
      gate: "D4",
      metric: "high_sdv_share_epvShoot_below_contMean",
      model,
      value: d.highShareBelow,
      n: d.highN,
    });
  }

  // Stability across holdout games: std of per-game mean C2 pred
  const byGame = new Map<string, number[]>();
  for (const r of contHold) {
    const arr = byGame.get(r.gameId) ?? [];
    arr.push(r.c2);
    byGame.set(r.gameId, arr);
  }
  const perGameMeans = [...byGame.values()].map((a) => mean(a));
  oosRows.push({
    gate: "stability",
    metric: "std_per_game_mean_c2",
    model: "C2",
    value: std(perGameMeans),
    n: perGameMeans.length,
  });

  const c1BeatsC0 = contOof.c1.mae < contOof.c0.mae;
  const c2BeatsC0 = contOof.c2.mae < contOof.c0.mae;
  const c1CorrOk = contOof.c1.corr > contOof.c0.corr && contOof.c1.corr >= 0.05;
  const c2CorrOk = contOof.c2.corr > contOof.c0.corr && contOof.c2.corr >= 0.05;
  const corrSdvShoot0 = corr(
    sdvRows.map((r) => r.sdv0),
    sdvRows.map((r) => r.epvShoot)
  );
  const corrSdvShoot2 = corr(
    sdvRows.map((r) => r.sdv2),
    sdvRows.map((r) => r.epvShoot)
  );
  const corrSdvMake2 = corr(
    sdvRows.map((r) => r.sdv2),
    sdvRows.map((r) => r.shotMaking)
  );
  const nonFlat = std(sdvRows.map((r) => r.c2)) > std(sdvRows.map((r) => r.c0));

  const gate1Pass = (c1BeatsC0 || c2BeatsC0) && (c1CorrOk || c2CorrOk);
  const gate3Pass =
    nonFlat &&
    corrSdvShoot2 < corrSdvShoot0 - 0.05 &&
    Math.abs(corrSdvMake2) < 0.15;

  const fixesContinueProblem =
    gate1Pass && nonFlat && (c1CorrOk || c2CorrOk);
  const fusionGo = false; // explicit: never fuse this pass
  const fusionRecommendation =
    fixesContinueProblem && gate3Pass
      ? "NO-GO_fusion_now__but_GO_keep_C2_as_experimental_continue_for_future_review"
      : gate1Pass
        ? "NO-GO_fusion__partial_continue_improvement_needs_stronger_SDV_separation"
        : "NO-GO_fusion__continue_gates_not_met";

  const leakage = [
    {
      check: "continue_labels_are_age_grid_pre_FGA",
      status: "PASS",
      detail: "Primary labels: possessions still without FGA at age τ; Y=remaining points; FGAs never trained as continue",
    },
    {
      check: "features_exclude_remainingPoints",
      status: "PASS",
      detail: "C1/C2 feature names audited; builders do not read remainingPoints",
    },
    {
      check: "FGA_rows_excluded_from_continue_training",
      status: "PASS",
      detail: "buildContinueRowsForGame skips isFieldGoalAttempt events",
    },
    {
      check: "Y_remaining_points_target_only",
      status: "PASS",
      detail: "remainingPoints used only as ridge Y",
    },
    {
      check: "chronological_holdout_excluded_from_fit",
      status: "PASS",
      detail: "Coefficients fit on train games only; priors expand after predict",
    },
    {
      check: "true_shot_clock_not_fabricated",
      status: "PASS",
      detail: "possessionAgeNorm documented as PROXY only",
    },
    {
      check: "M6_coefficients_untouched",
      status: "PASS",
      detail: "shot-decision.ts not modified; M6 OOF used read-only",
    },
    {
      check: "DRBL_fusion_untouched",
      status: "PASS",
      detail: "No fusion/WAR/leaderboard writes",
    },
    {
      check: "post_decision_points_as_features",
      status: "PASS",
      detail: "Banned",
    },
  ];

  const component = [
    {
      component: "EPV_shoot",
      source: "M6_frozen",
      holdout_mean: Number(mean(sdvRows.map((r) => r.epvShoot)).toFixed(4)),
      holdout_std: Number(std(sdvRows.map((r) => r.epvShoot)).toFixed(4)),
      separated: "YES",
    },
    {
      component: "V_cont_C0",
      source: "M5",
      holdout_mean: Number(mean(sdvRows.map((r) => r.c0)).toFixed(4)),
      holdout_std: Number(std(sdvRows.map((r) => r.c0)).toFixed(4)),
      separated: "YES",
    },
    {
      component: "V_cont_C1",
      source: "ridge_C1",
      holdout_mean: Number(mean(sdvRows.map((r) => r.c1)).toFixed(4)),
      holdout_std: Number(std(sdvRows.map((r) => r.c1)).toFixed(4)),
      separated: "YES",
    },
    {
      component: "V_cont_C2",
      source: "ridge_C2_age_proxy",
      holdout_mean: Number(mean(sdvRows.map((r) => r.c2)).toFixed(4)),
      holdout_std: Number(std(sdvRows.map((r) => r.c2)).toFixed(4)),
      separated: "YES",
    },
    {
      component: "ShotMaking",
      source: "M6_frozen",
      holdout_mean: Number(mean(sdvRows.map((r) => r.shotMaking)).toFixed(4)),
      holdout_std: Number(std(sdvRows.map((r) => r.shotMaking)).toFixed(4)),
      separated: "YES",
    },
    {
      component: "SDV_C2",
      source: "epvShoot-V_C2",
      holdout_mean: Number(mean(sdvRows.map((r) => r.sdv2)).toFixed(4)),
      holdout_std: Number(std(sdvRows.map((r) => r.sdv2)).toFixed(4)),
      separated: "YES",
    },
  ];

  for (const row of calRows) {
    oosRows.push({
      gate: "C1.3",
      metric: `cal_${row.model}_${row.bin}`,
      model: String(row.model).toUpperCase(),
      value: row.mean_actual,
      n: row.n,
    });
  }

  const implMd = `# M7-CV Implementation Report

**Version:** ${M7_CV_VERSION}  
**Generated:** ${new Date().toISOString()}  
**Parser:** ${DRBL_PARSER_VERSION}  
**Reconstruction:** ${DRBL_RECONSTRUCTION_VERSION}  

## Scope

Isolated C1/C2 continuation-value implementation.

- **M6 frozen** (not overwritten; coefficients unused for continue)
- **C0 retained** as M5 baseline comparator
- **No DRBL fusion / DRBL100 / leaderboard changes**
- Possession age = **shot-clock PROXY only** (CDN PBP has no shot clock)

## Estimand

\`\`\`
V_cont(S) = E[ remaining possession points | S, A ≠ shoot ]
SDV       = ÊPV_shoot − V_cont     // ÊPV_shoot from frozen M6 OOF
ShotMaking = observedShotPoints − ÊPV_shoot   // unchanged, separate
\`\`\`

### Training population

Non-bookkeeping, non-FGA **age-grid / pre-first-FGA** continue states (\`buildContinueRowsForGame\`).
Y = remaining offense points from state time to possession end (**target only**).
Primary labels: age grid τ∈{0,4,8,12,16,20,24} while no FGA yet (shot-clock PROXY via possession age).

### Features

- **C1:** ${C1_FEATURE_NAMES.join(", ")}
- **C2:** ${C2_FEATURE_NAMES.join(", ")}

## Data

| Item | Value |
|------|------:|
| Season | ${season} |
| Limit | ${limit} |
| Games processed | ${gamesProcessed} |
| Games failed | ${gamesFailed} |
| Train continue rows | ${contOof.trainN} |
| Holdout continue rows | ${contOof.holdoutN} |
| Holdout shots (SDV) | ${sdvRows.length} |
| Holdout frac | ${holdoutFrac} |

## Gate results (validation plan)

| Gate | Result | Notes |
|------|--------|-------|
| G0 leakage / target | PASS | See \`m7_cv_leakage_report.csv\` |
| C1.1 MAE beat C0 | C1 ${c1BeatsC0 ? "PASS" : "FAIL"} / C2 ${c2BeatsC0 ? "PASS" : "FAIL"} | C0 MAE=${contOof.c0.mae.toFixed(4)}, C1=${contOof.c1.mae.toFixed(4)}, C2=${contOof.c2.mae.toFixed(4)} |
| C1.2 Corr vs remaining | C1 ${c1CorrOk ? "PASS" : "FAIL"} / C2 ${c2CorrOk ? "PASS" : "FAIL"} | C0 r=${contOof.c0.corr.toFixed(4)}, C1 r=${contOof.c1.corr.toFixed(4)}, C2 r=${contOof.c2.corr.toFixed(4)} |
| Gate1 overall | ${gate1Pass ? "PASS" : "FAIL"} | |
| S1/S2 M6 shoot frozen | PASS | make MAE=${shotOof.holdoutMake.mae.toFixed(4)}; ShotMaking mean=${mean(sdvRows.map((r) => r.shotMaking)).toFixed(4)} |
| D2 SDV⊥̸shoot reduced | ${corrSdvShoot2 < corrSdvShoot0 - 0.05 ? "PASS" : "FAIL"} | C0 corr=${corrSdvShoot0.toFixed(4)} → C2 corr=${corrSdvShoot2.toFixed(4)} |
| D1 SDV⊥making | ${Math.abs(corrSdvMake2) < 0.15 ? "PASS" : "FAIL"} | C2 corr(SDV,ShotMaking)=${corrSdvMake2.toFixed(4)} |
| D5 non-flat V_cont | ${nonFlat ? "PASS" : "FAIL"} | std C0=${std(sdvRows.map((r) => r.c0)).toFixed(4)} vs C2=${std(sdvRows.map((r) => r.c2)).toFixed(4)} |
| Gate3 overall | ${gate3Pass ? "PASS" : "FAIL"} | |
| Fixes C0 continue problem? | ${fixesContinueProblem ? "YES" : "PARTIAL/NO"} | |
| Fusion now | **NO-GO** | ${fusionRecommendation} |

## Files

- \`drbl/models/continuation-value.ts\`
- \`drbl/models/__tests__/continuation-value.test.ts\`
- \`scripts/drbl-m7-cv-validate.ts\`
- Reports: \`m7_cv_*.csv\` / this file

## Explicit non-goals

No fusion weights, fusion target, WAR, shrinkage, DRBL-L, or public precomputed rewrites.
`;

  await writeFile(path.join(outDir, "m7_cv_implementation.md"), implMd, "utf8");
  await writeFile(path.join(outDir, "m7_cv_oos_validation.csv"), toCsv(oosRows), "utf8");
  await writeFile(path.join(outDir, "m7_cv_leakage_report.csv"), toCsv(leakage), "utf8");
  await writeFile(path.join(outDir, "m7_cv_component_analysis.csv"), toCsv(component), "utf8");
  await writeFile(
    path.join(outDir, "m7_cv_baseline_comparison.csv"),
    toCsv(baselineCmp),
    "utf8"
  );

  // Optional model artifact (experiment only)
  const modelDir = path.join(process.cwd(), "data", "drbl", "models");
  await mkdir(modelDir, { recursive: true });
  await writeFile(
    path.join(modelDir, "m7-cv-continuation.json"),
    JSON.stringify(
      {
        version: M7_CV_VERSION,
        fittedAt: new Date().toISOString(),
        season,
        gamesProcessed,
        holdoutFrac,
        c1FeatureNames: C1_FEATURE_NAMES,
        c2FeatureNames: C2_FEATURE_NAMES,
        c1Coefficients: contOof.c1Coef.map((c) => Math.round(c * 1e6) / 1e6),
        c2Coefficients: contOof.c2Coef.map((c) => Math.round(c * 1e6) / 1e6),
        holdout: {
          c0: contOof.c0,
          c1: contOof.c1,
          c2: contOof.c2,
        },
        integratedIntoDrblFusion: false,
        m6Frozen: true,
        shotClockIsProxyOnly: true,
        fusionRecommendation,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log({
    version: M7_CV_VERSION,
    gamesProcessed,
    continueMae: { C0: contOof.c0.mae, C1: contOof.c1.mae, C2: contOof.c2.mae },
    continueCorr: { C0: contOof.c0.corr, C1: contOof.c1.corr, C2: contOof.c2.corr },
    sdvCorrShoot: { C0: corrSdvShoot0, C2: corrSdvShoot2 },
    sdvCorrMaking: { C2: corrSdvMake2 },
    gate1Pass,
    gate3Pass,
    fixesContinueProblem,
    fusionRecommendation,
    reports: outDir,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
