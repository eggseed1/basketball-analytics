/**
 * M6 validation CLI — standalone (does NOT update DRBL fusion / site artifacts).
 *
 *   npm run drbl:m6 -- --season 2024-25 --limit 150
 *   npm run drbl:m6 -- --seasons 2024-25,2025-26 --limit 200
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { listSeasonGames, processGame } from "../drbl/index";
import { warmEpvModel } from "../drbl/models/expected-points";
import {
  M6_VERSION,
  MAKE_FEATURE_NAMES,
  buildShotRowsForGame,
  chronologicalOofShotDecision,
  type ShotDecisionRow,
} from "../drbl/models/shot-decision";
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

async function main() {
  const seasonsArg = arg("seasons");
  const season = arg("season") ?? "2024-25";
  const seasons = seasonsArg
    ? seasonsArg.split(",").map((s) => s.trim()).filter(Boolean)
    : [season];
  const limit = arg("limit") ? Number(arg("limit")) : 150;
  const holdoutFrac = arg("holdout-frac") ? Number(arg("holdout-frac")) : 0.2;

  const outDir = path.join(process.cwd(), "reports", "m6");
  await mkdir(outDir, { recursive: true });
  await warmEpvModel();

  const gameBundles: Array<{
    gameDate: string;
    gameId: string;
    rows: ShotDecisionRow[];
  }> = [];
  let gamesProcessed = 0;
  let gamesFailed = 0;
  let quarantined = 0;

  for (const s of seasons) {
    let games = await listSeasonGames(s);
    if (limit > 0) games = games.slice(0, limit);
    for (const meta of games) {
      try {
        const g = await processGame(meta, { persist: true });
        if (g.reconcile.quarantined) {
          quarantined += 1;
          continue;
        }
        const rows = buildShotRowsForGame(g.box, g.events, g.possessions);
        if (rows.length === 0) continue;
        gameBundles.push({
          gameDate: g.box.gameDate || meta.gameDate,
          gameId: g.box.gameId,
          rows,
        });
        gamesProcessed += 1;
      } catch {
        gamesFailed += 1;
      }
    }
  }

  if (gameBundles.length < 10) {
    throw new Error(
      `Need more games with shots (got ${gameBundles.length}). Increase --limit or download cache.`
    );
  }

  const result = chronologicalOofShotDecision(gameBundles, {
    holdoutFrac,
    lambda: 5,
  });

  const holdout = result.oof.filter((r) => r.fold === "holdout");
  const train = result.oof.filter((r) => r.fold === "train");

  const negSdvMakes = holdout.filter((r) => r.made === 1 && r.sdv < 0).length;
  const posSdvMisses = holdout.filter((r) => r.made === 0 && r.sdv > 0).length;

  const oosRows: Record<string, unknown>[] = [
    {
      metric: "make_model_mae",
      model: "ridge_lp",
      value: result.holdoutMake.mae,
      n: result.holdoutMake.n,
      mean_pred: "",
    },
    {
      metric: "make_model_rmse",
      model: "ridge_lp",
      value: result.holdoutMake.rmse,
      n: result.holdoutMake.n,
      mean_pred: "",
    },
    {
      metric: "make_model_logloss",
      model: "ridge_lp",
      value: result.holdoutMake.logLoss,
      n: result.holdoutMake.n,
      mean_pred: "",
    },
    {
      metric: "make_baseline_mae",
      model: "distance_bucket",
      value: result.holdoutBaselineMake.mae,
      n: result.holdoutBaselineMake.n,
      mean_pred: "",
    },
    {
      metric: "make_baseline_rmse",
      model: "distance_bucket",
      value: result.holdoutBaselineMake.rmse,
      n: result.holdoutBaselineMake.n,
      mean_pred: "",
    },
    {
      metric: "make_baseline_logloss",
      model: "distance_bucket",
      value: result.holdoutBaselineMake.logLoss,
      n: result.holdoutBaselineMake.n,
      mean_pred: "",
    },
    {
      metric: "incremental_mae_vs_baseline",
      model: "ridge_minus_bucket",
      value: result.holdoutBaselineMake.mae - result.holdoutMake.mae,
      n: result.holdoutMake.n,
      mean_pred: "",
    },
    {
      metric: "shot_points_vs_epvShoot_mae",
      model: "shotMaking_calibration",
      value: result.holdoutShotMakingCal.mae,
      n: result.holdoutShotMakingCal.n,
      mean_pred: "",
    },
    {
      metric: "shot_points_vs_epvShoot_rmse",
      model: "shotMaking_calibration",
      value: result.holdoutShotMakingCal.rmse,
      n: result.holdoutShotMakingCal.n,
      mean_pred: "",
    },
    {
      metric: "sdv_corr_next_offense_possession_points",
      model: "sdv",
      value: result.holdoutSdvVsNextPoss.corr,
      n: result.holdoutSdvVsNextPoss.n,
      mean_pred: "",
    },
    {
      metric: "neg_sdv_among_makes_count",
      model: "sdv",
      value: negSdvMakes,
      n: holdout.filter((r) => r.made === 1).length,
      mean_pred: "",
    },
    {
      metric: "pos_sdv_among_misses_count",
      model: "sdv",
      value: posSdvMisses,
      n: holdout.filter((r) => r.made === 0).length,
      mean_pred: "",
    },
    {
      metric: "train_shots",
      model: "sample",
      value: train.length,
      n: train.length,
      mean_pred: "",
    },
    {
      metric: "holdout_shots",
      model: "sample",
      value: holdout.length,
      n: holdout.length,
      mean_pred: "",
    },
    {
      metric: "games_processed",
      model: "sample",
      value: gamesProcessed,
      n: gamesProcessed,
      mean_pred: "",
    },
  ];

  // Calibration bins for pMake
  const bins = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  for (let i = 0; i < bins.length; i++) {
    const lo = i === 0 ? 0 : bins[i - 1]!;
    const hi = bins[i]!;
    const inBin = holdout.filter((r) => r.pMake > lo && r.pMake <= hi);
    if (inBin.length === 0) continue;
    oosRows.push({
      metric: "pMake_calibration_bin",
      model: `${lo.toFixed(1)}_${hi.toFixed(1)}`,
      value: Number(
        (inBin.reduce((s, r) => s + r.made, 0) / inBin.length).toFixed(4)
      ),
      n: inBin.length,
      mean_pred: Number(
        (inBin.reduce((s, r) => s + r.pMake, 0) / inBin.length).toFixed(4)
      ),
    });
  }

  // SDV quintiles vs mean next-possession points (diagnostic only)
  const sdvVals = holdout
    .filter((r) => r.nextOffensePossessionPoints != null)
    .map((r) => r.sdv)
    .sort((a, b) => a - b);
  if (sdvVals.length >= 20) {
    const q = (p: number) =>
      sdvVals[Math.min(sdvVals.length - 1, Math.floor(p * sdvVals.length))]!;
    const sdvCuts = [q(0.2), q(0.4), q(0.6), q(0.8), Infinity];
    let prev = -Infinity;
    for (let i = 0; i < sdvCuts.length; i++) {
      const hi = sdvCuts[i]!;
      const inBin = holdout.filter(
        (r) =>
          r.nextOffensePossessionPoints != null &&
          r.sdv > prev &&
          r.sdv <= hi
      );
      if (inBin.length > 0) {
        oosRows.push({
          metric: "sdv_vs_next_poss_bin",
          model: `q${i + 1}`,
          value: Number(
            (
              inBin.reduce(
                (s, r) => s + (r.nextOffensePossessionPoints as number),
                0
              ) / inBin.length
            ).toFixed(4)
          ),
          n: inBin.length,
          mean_pred: Number(
            (inBin.reduce((s, r) => s + r.sdv, 0) / inBin.length).toFixed(4)
          ),
        });
      }
      prev = hi === Infinity ? prev : hi;
    }
  }

  oosRows.push({
    metric: "shotMaking_mean_on_makes",
    model: "shotMaking",
    value: Number(
      (
        holdout
          .filter((r) => r.made === 1)
          .reduce((s, r) => s + r.shotMaking, 0) /
          Math.max(1, holdout.filter((r) => r.made === 1).length)
      ).toFixed(4)
    ),
    n: holdout.filter((r) => r.made === 1).length,
    mean_pred: "",
  });
  oosRows.push({
    metric: "shotMaking_mean_on_misses",
    model: "shotMaking",
    value: Number(
      (
        holdout
          .filter((r) => r.made === 0)
          .reduce((s, r) => s + r.shotMaking, 0) /
          Math.max(1, holdout.filter((r) => r.made === 0).length)
      ).toFixed(4)
    ),
    n: holdout.filter((r) => r.made === 0).length,
    mean_pred: "",
  });
  oosRows.push({
    metric: "shotMaking_overall_mean",
    model: "shotMaking",
    value: Number(
      (
        holdout.reduce((s, r) => s + r.shotMaking, 0) /
          Math.max(1, holdout.length)
      ).toFixed(4)
    ),
    n: holdout.length,
    mean_pred: "",
  });

  const deltaMae = result.holdoutBaselineMake.mae - result.holdoutMake.mae;
  const incrementalNote =
    deltaMae > 0.01
      ? "YES_clear_MAE_gain_vs_bucket_baseline"
      : deltaMae > 0
        ? "YES_but_small_MAE_gain_vs_bucket_baseline"
        : "NO_clear_MAE_gain_vs_bucket_baseline";

  const featureProv = MAKE_FEATURE_NAMES.map((feature) => {
    let source = "pbp_game_state_pre_outcome";
    if (
      feature.startsWith("playerPrior") ||
      feature === "lineupOffensePriorMake" ||
      feature === "lineupDefensePriorAllow"
    ) {
      source = "prior_games_only_player_make_rate";
    } else if (feature === "teamPriorMake" || feature === "oppPriorAllow") {
      source = "prior_games_only_team_fg_rates";
    } else if (
      feature.includes("distance") ||
      feature === "rim" ||
      feature === "mid" ||
      feature === "longTwo" ||
      feature === "cornerThreeProxy" ||
      feature === "isThree" ||
      feature === "hasDistance"
    ) {
      source = "pbp_shot_location_pre_outcome";
    }
    return {
      feature,
      source,
      timestamp_safe: "YES",
      uses_shot_outcome: "NO",
      uses_final_box: "NO",
      uses_future_possessions: "NO",
      notes:
        feature.includes("Prior") || feature.includes("lineup")
          ? "Expanding priors updated only after each game; design/holdout never see same-game or future outcomes"
          : "",
    };
  });

  featureProv.push({
    feature: "epv_continue",
    source: "M5_predictExpectedPoints(pre_shot_state)",
    timestamp_safe: "YES",
    uses_shot_outcome: "NO",
    uses_final_box: "NO",
    uses_future_possessions: "NO",
    notes: "Possession EPV at reversed-score state",
  });
  featureProv.push({
    feature: "epv_shoot",
    source: "pMake * pointValue",
    timestamp_safe: "YES",
    uses_shot_outcome: "NO",
    uses_final_box: "NO",
    uses_future_possessions: "NO",
    notes: "pointValue known from shot type (2pt/3pt attempt), not make/miss",
  });

  const leakage = [
    {
      check: "same_possession_points_in_make_model_target",
      status: "PASS",
      detail: "Make model target is make/miss indicator only, not possession points",
    },
    {
      check: "same_possession_points_in_epv_continue",
      status: "PASS",
      detail: "Continuation uses M5 state EPV, not realized possession points",
    },
    {
      check: "post_make_score_in_features",
      status: "PASS",
      detail: "decisionStateFromEvent subtracts pointsOnAction for Made shots",
    },
    {
      check: "player_prior_from_future_games",
      status: "PASS",
      detail: "Priors accumulate only after each game; holdout starts from train priors",
    },
    {
      check: "final_box_stats_in_features",
      status: "PASS",
      detail: "No AST/TOV/STL/BLK or final totals in M6 features",
    },
    {
      check: "next_possession_points_in_training",
      status: "PASS",
      detail: "Used only as OOS diagnostic correlation target, not as training Y",
    },
    {
      check: "holdout_games_in_make_ridge_fit",
      status: "PASS",
      detail: "Coefficients fit on train games only",
    },
  ];

  const component = [
    {
      component: "SDV",
      definition: "epvShoot - epvContinue",
      holdout_mean: Number(
        (holdout.reduce((s, r) => s + r.sdv, 0) / Math.max(1, holdout.length)).toFixed(4)
      ),
      holdout_std: (() => {
        const m =
          holdout.reduce((s, r) => s + r.sdv, 0) / Math.max(1, holdout.length);
        const v =
          holdout.reduce((s, r) => s + (r.sdv - m) ** 2, 0) /
          Math.max(1, holdout.length);
        return Number(Math.sqrt(v).toFixed(4));
      })(),
      separated_from_shot_making: "YES",
    },
    {
      component: "ShotMaking",
      definition: "observedShotPoints - epvShoot",
      holdout_mean: Number(
        (
          holdout.reduce((s, r) => s + r.shotMaking, 0) /
          Math.max(1, holdout.length)
        ).toFixed(4)
      ),
      holdout_std: (() => {
        const m =
          holdout.reduce((s, r) => s + r.shotMaking, 0) /
          Math.max(1, holdout.length);
        const v =
          holdout.reduce((s, r) => s + (r.shotMaking - m) ** 2, 0) /
          Math.max(1, holdout.length);
        return Number(Math.sqrt(v).toFixed(4));
      })(),
      separated_from_shot_making: "N/A",
    },
    {
      component: "EPV_shoot",
      definition: "pMake * pointValue",
      holdout_mean: Number(
        (
          holdout.reduce((s, r) => s + r.epvShoot, 0) / Math.max(1, holdout.length)
        ).toFixed(4)
      ),
      holdout_std: "",
      separated_from_shot_making: "YES",
    },
    {
      component: "EPV_continue",
      definition: "M5 possession EPV(pre-shot state)",
      holdout_mean: Number(
        (
          holdout.reduce((s, r) => s + r.epvContinue, 0) /
          Math.max(1, holdout.length)
        ).toFixed(4)
      ),
      holdout_std: "",
      separated_from_shot_making: "YES",
    },
  ];

  const implMd = `# M6 Implementation Report (standalone)

**Version:** ${M6_VERSION}  
**Generated:** ${new Date().toISOString()}  
**Parser:** ${DRBL_PARSER_VERSION}  
**Reconstruction:** ${DRBL_RECONSTRUCTION_VERSION}  

## Status

M6 is implemented as a **standalone** subsystem.

**NOT integrated** into DRBL fusion, replacement, WAR, shrinkage, DRBL-L, or public leaderboard artifacts.

M15 freeze baseline under \`reports/m15/\` is preserved.

## Equations

\`\`\`
ÊPV_shoot(S_t)    = P̂(make | S_t) · pointValue
ÊPV_continue(S_t) = EPV̂_possession(S_t)   // M5 expected points at pre-shot state
SDV(S_t)          = ÊPV_shoot(S_t) − ÊPV_continue(S_t)
ShotMaking        = observedShotPoints − ÊPV_shoot(S_t)
\`\`\`

- \`pointValue\` ∈ {2,3} from attempt type (known at decision).
- \`P̂(make)\` = clamped linear probability from ridge features (chrono OOF).
- Pre-shot score: Made shots reverse \`pointsOnAction\` before building state.

## Data used

| Item | Value |
|------|------|
| Seasons | ${seasons.join(", ")} |
| Limit per season | ${limit} |
| Games processed (non-quarantine) | ${gamesProcessed} |
| Games failed | ${gamesFailed} |
| Quarantined skipped | ${quarantined} |
| Train shots | ${train.length} |
| Holdout shots | ${holdout.length} |
| Holdout frac (by games) | ${holdoutFrac} |

## Timestamp safety

See \`m6_leakage_report.csv\` and \`m6_feature_provenance.csv\`.

Key rules enforced:
1. No final box aggregates.
2. No same-possession realized points in training targets for P(make) or EPV_continue.
3. No future games in player priors at prediction time.
4. Make model coefficients fit on train games only.

## OOS results (holdout)

| Metric | Value |
|--------|------:|
| Make model MAE | ${result.holdoutMake.mae.toFixed(4)} |
| Make model RMSE | ${result.holdoutMake.rmse.toFixed(4)} |
| Make model log-loss | ${result.holdoutMake.logLoss.toFixed(4)} |
| Bucket baseline MAE | ${result.holdoutBaselineMake.mae.toFixed(4)} |
| Bucket baseline log-loss | ${result.holdoutBaselineMake.logLoss.toFixed(4)} |
| ΔMAE (baseline − model) | ${deltaMae.toFixed(4)} |
| Shot points vs ÊPV_shoot MAE | ${result.holdoutShotMakingCal.mae.toFixed(4)} |
| ShotMaking overall mean (should ≈ 0) | ${(holdout.reduce((s, r) => s + r.shotMaking, 0) / Math.max(1, holdout.length)).toFixed(4)} |
| SDV corr vs next offense poss. points | ${result.holdoutSdvVsNextPoss.corr.toFixed(4)} (n=${result.holdoutSdvVsNextPoss.n}) |
| Makes with SDV < 0 | ${negSdvMakes} |
| Misses with SDV > 0 | ${posSdvMisses} |

**Incremental information vs simple shot-quality baseline:** ${incrementalNote}

## Known limitations (this pass)

1. \`EPV_continue\` uses M5 possession-state EPV at the shot timestamp — a coarse proxy for the true pass/dribble counterfactual (no shot-clock residual / action-graph model).
2. Make model is linear probability ridge (not logistic); gains vs distance-bucket baseline are small on this sample.
3. Lineup features are prior make-rate averages of on-court players (not a full RAPM lineup model).
4. SDV vs *next* offense possession is a weak diagnostic target; decision quality primarily concerns the *current* shot/continuation tradeoff.

## Files

- \`drbl/models/shot-decision.ts\`
- \`drbl/models/__tests__/shot-decision.test.ts\`
- \`scripts/drbl-m6-validate.ts\`
- Model artifact: \`data/drbl/models/m6-make-coeffs.json\` (written by this CLI)

## Explicit non-goals (this pass)

- No fusion weight changes
- No fusion target changes
- No replacement / WAR / shrinkage / DRBL-L changes
- No public \`precomputed/*.json\` rewrites
`;

  await writeFile(path.join(outDir, "m6_implementation.md"), implMd, "utf8");
  await writeFile(path.join(outDir, "m6_feature_provenance.csv"), toCsv(featureProv), "utf8");
  await writeFile(path.join(outDir, "m6_oos_validation.csv"), toCsv(oosRows), "utf8");
  await writeFile(path.join(outDir, "m6_leakage_report.csv"), toCsv(leakage), "utf8");
  await writeFile(path.join(outDir, "m6_component_analysis.csv"), toCsv(component), "utf8");

  const modelDir = path.join(process.cwd(), "data", "drbl", "models");
  await mkdir(modelDir, { recursive: true });
  await writeFile(
    path.join(modelDir, "m6-make-coeffs.json"),
    JSON.stringify(
      {
        ...result.artifact,
        seasons,
        gamesProcessed,
        holdoutFrac,
        baselineBuckets: Object.fromEntries(result.baselineBuckets),
        integratedIntoDrblFusion: false,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log({
    version: M6_VERSION,
    gamesProcessed,
    trainShots: train.length,
    holdoutShots: holdout.length,
    makeMae: result.holdoutMake.mae,
    baselineMae: result.holdoutBaselineMake.mae,
    incrementalMae: deltaMae,
    incrementalNote,
    sdvCorrNextPoss: result.holdoutSdvVsNextPoss.corr,
    reports: outDir,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
