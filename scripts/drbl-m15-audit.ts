/**
 * M15 diagnostic audit - READ-ONLY analysis of frozen DRBL artifacts.
 * Does not modify model mathematics or rewrite site precomputed JSON.
 *
 *   npx tsx scripts/drbl-m15-audit.ts
 */

import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

import type { DrblSeasonArtifact } from "../drbl/models/compute-season";
import { calibrateWar } from "../drbl/models/war";
import { listSeasonGames, processGame } from "../drbl/index";
import { warmEpvModel } from "../drbl/models/expected-points";
import {
  accumulateReplacementSignals,
  buildReplacementPool,
  finalizeRoleAccum,
} from "../drbl/models/replacement";
import { PROVISIONAL_WIN_CONVERSION } from "../drbl/models/player-value";
import { DRBL_PARSER_VERSION, DRBL_RECONSTRUCTION_VERSION } from "../drbl/constants";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m15");

type PlayerRow = DrblSeasonArtifact["players"][number];

function corr(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return NaN;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
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
  return den > 1e-12 ? num / den : NaN;
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const keys = Object.keys(rows[0]!);
  const lines = [keys.join(",")];
  for (const row of rows) {
    lines.push(keys.map((k) => csvEscape(row[k])).join(","));
  }
  return lines.join("\n") + "\n";
}

async function loadArtifact(season: string): Promise<DrblSeasonArtifact> {
  const p = path.join(ROOT, "src", "data", "drbl", "precomputed", `${season}.json`);
  return JSON.parse(await readFile(p, "utf8")) as DrblSeasonArtifact;
}

function shrinkageWeight(possessions: number, k = 200): number {
  return possessions / (possessions + k);
}

async function writeFreezeManifest(artifacts: DrblSeasonArtifact[]) {
  let gitCommit = "unknown";
  let gitDirty = true;
  try {
    gitCommit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    gitDirty =
      execSync("git status --porcelain", { encoding: "utf8" }).trim().length > 0;
  } catch {
    // ignore
  }

  const fusion2025 = JSON.parse(
    await readFile(path.join(ROOT, "data", "drbl", "models", "fusion-2025-26.json"), "utf8")
  );
  const epv = JSON.parse(
    await readFile(path.join(ROOT, "data", "drbl", "models", "epv-coeffs.json"), "utf8")
  );

  const freeze = {
    frozenAt: new Date().toISOString(),
    gitCommit,
    gitDirty,
    note: "DRBL tree largely uncommitted relative to Initial commit; freeze copies of artifacts under reports/m15/freeze/",
    parserVersion: DRBL_PARSER_VERSION,
    reconstructionVersion: DRBL_RECONSTRUCTION_VERSION,
    artifactVersions: artifacts.map((a) => ({
      season: a.season,
      version: a.version,
      generatedAt: a.generatedAt,
      gamesProcessed: a.gamesProcessed,
      players: a.players.length,
      lineupModel: a.lineupModel,
      behaviorModel: a.behaviorModel,
      fusionModel: a.fusionModel,
      uncertaintyModel: a.uncertaintyModel,
      warModel: a.warModel,
      leverageModel: a.leverageModel,
    })),
    trainingSeasons: ["2024-25", "2025-26"],
    validationSeasons: "chrono within-sample holdout only (not separate seasons)",
    testSeasons: "none held out as true test",
    sampleNote: "Published site artifacts computed with --limit 50 games per season",
    hyperparameters: {
      epvLambda: "see epv fit",
      lineupLambda: 800,
      behaviorLambda: 40,
      fusionLambda: 8,
      fusionFolds: 5,
      uncertaintyTargetCoverage: 0.8,
      shrinkageK: 200,
      provisionalPointsToWins: PROVISIONAL_WIN_CONVERSION,
    },
    randomSeeds: "none (deterministic linear algebra)",
    fusionEquation2025_26: {
      description:
        "OOF ridge: yhat = intercept + wP*P + wLn*LN + wB*B + wHasB*hasB (hasB internalized in fit)",
      weights: fusion2025.weights,
      simplexWeights: fusion2025.simplexWeights,
      publishedField: "drbl100 = OOF stacked prediction (not simplex blend of components)",
    },
    epvCoefficients: epv,
    m13WarVersions: artifacts.map((a) => a.warModel),
    m14LeverageVersions: artifacts.map((a) => a.leverageModel),
    m6Status: "NOT IMPLEMENTED - no shot-decision/continuation module in codebase",
  };

  await writeFile(
    path.join(OUT, "freeze", "00_model_freeze.json"),
    JSON.stringify(freeze, null, 2),
    "utf8"
  );
  return freeze;
}

function leaderboardRows(artifact: DrblSeasonArtifact, topN = 100) {
  const players = artifact.players.slice().sort((a, b) => b.drbl100 - a.drbl100);
  return players.slice(0, topN).map((p, i) => {
    const w = shrinkageWeight(p.possessions);
    // Approximate "raw" as unsrunken component from P: reverse EB is not exact;
    // report P as possession-model component and document.
    return {
      rank: i + 1,
      season: artifact.season,
      playerId: p.playerId,
      player: p.playerName,
      teamId: p.teamId,
      possessions: p.possessions,
      final_drbl_per100: p.drbl100,
      drbl_p: p.drblP,
      drbl_ln: p.drblLn,
      drbl_b: p.drblB,
      offensive_value_per100: p.drblO,
      defensive_value_per100: p.drblD,
      seasonal_impact: p.seasonalImpact,
      drbl_war: p.drblWar,
      drbl_leverage: p.drblL,
      mean_leverage: p.meanLeverage,
      model_disagreement: p.disagreement,
      uncertainty: p.uncertainty,
      interval_lo: p.intervalLo,
      interval_hi: p.intervalHi,
      shrinkage_weight_approx: Number(w.toFixed(3)),
      prior_value: 0,
      // Fields not separately modeled in current pipeline:
      passing_value: "N/A_not_modeled",
      shot_value: "N/A_not_modeled",
      shot_decision_value: "N/A_M6_missing",
      turnover_value: "N/A_not_modeled",
      rebounding_value: "N/A_not_modeled",
      lineup_value: p.drblLn,
      behavior_value: p.drblB,
      replacement_level: artifact.replacementLevel,
      games_in_artifact: artifact.gamesProcessed,
    };
  });
}

function sampleSizeAnalysis(players: PlayerRow[], season: string) {
  const xsPoss = players.map((p) => p.possessions);
  const ys = players.map((p) => p.drbl100);
  const absY = players.map((p) => Math.abs(p.drbl100));
  return {
    season,
    n: players.length,
    corr_drbl100_possessions: Number(corr(xsPoss, ys).toFixed(4)),
    corr_abs_drbl100_possessions: Number(corr(xsPoss, absY).toFixed(4)),
    mean_possessions_top20: Number(
      (
        players
          .slice()
          .sort((a, b) => b.drbl100 - a.drbl100)
          .slice(0, 20)
          .reduce((s, p) => s + p.possessions, 0) / 20
      ).toFixed(1)
    ),
    mean_possessions_all: Number(
      (xsPoss.reduce((a, b) => a + b, 0) / xsPoss.length).toFixed(1)
    ),
  };
}

function teamContamination(players: PlayerRow[], season: string) {
  const byTeam = new Map<string, PlayerRow[]>();
  for (const p of players) {
    const arr = byTeam.get(p.teamId) ?? [];
    arr.push(p);
    byTeam.set(p.teamId, arr);
  }
  const rows: Record<string, unknown>[] = [];
  for (const [teamId, list] of byTeam) {
    const mean = list.reduce((s, p) => s + p.drbl100, 0) / list.length;
    const top = list.slice().sort((a, b) => b.drbl100 - a.drbl100)[0]!;
    rows.push({
      season,
      teamId,
      n_players: list.length,
      mean_drbl100: Number(mean.toFixed(3)),
      max_drbl100: top.drbl100,
      top_player: top.playerName,
      sum_seasonal_impact: Number(
        list.reduce((s, p) => s + p.seasonalImpact, 0).toFixed(2)
      ),
    });
  }
  return rows.sort(
    (a, b) => Number(b.mean_drbl100) - Number(a.mean_drbl100)
  );
}

function componentRanks(players: PlayerRow[], season: string) {
  const mk = (key: keyof PlayerRow, label: string) => {
    const ranked = players
      .slice()
      .sort((a, b) => Number(b[key]) - Number(a[key]))
      .slice(0, 25);
    return ranked.map((p, i) => ({
      season,
      component: label,
      rank: i + 1,
      player: p.playerName,
      teamId: p.teamId,
      value: p[key],
      possessions: p.possessions,
      drbl100: p.drbl100,
    }));
  };
  return [
    ...mk("drblP", "DRBL-P"),
    ...mk("drblLn", "DRBL-LN"),
    ...mk("drblB", "DRBL-B"),
    ...mk("drblO", "DRBL-O"),
    ...mk("drblD", "DRBL-D"),
    ...mk("drbl100", "DRBL/100"),
    ...mk("seasonalImpact", "seasonal_impact"),
    ...mk("drblL", "DRBL-L"),
  ];
}

function shrinkageRows(players: PlayerRow[], season: string) {
  return players
    .slice()
    .sort((a, b) => b.drbl100 - a.drbl100)
    .slice(0, 100)
    .map((p) => {
      const w = shrinkageWeight(p.possessions);
      return {
        season,
        player: p.playerName,
        possessions: p.possessions,
        shrinkage_weight: Number(w.toFixed(3)),
        prior: 0,
        // Component rates already EB-shrunk in pipeline; report P as shrunk component.
        shrunk_drbl_p: p.drblP,
        final_drbl100: p.drbl100,
        uncertainty: p.uncertainty,
        low_sample_flag: p.possessions < 150 ? 1 : 0,
      };
    });
}

function suspiciousPlayerFocus(
  players: PlayerRow[],
  season: string,
  names: string[]
) {
  const lower = names.map((n) => n.toLowerCase());
  return players
    .filter((p) =>
      lower.some((n) => p.playerName.toLowerCase().includes(n.split(" ")[0]!.toLowerCase()) &&
        p.playerName.toLowerCase().includes(n.split(" ").slice(-1)[0]!.toLowerCase()))
    )
    .map((p) => {
      const rank =
        players.slice().sort((a, b) => b.drbl100 - a.drbl100).findIndex(
          (x) => x.playerId === p.playerId
        ) + 1;
      return {
        season,
        player: p.playerName,
        teamId: p.teamId,
        rank_drbl100: rank,
        possessions: p.possessions,
        drbl100: p.drbl100,
        drblP: p.drblP,
        drblLn: p.drblLn,
        drblB: p.drblB,
        drblO: p.drblO,
        drblD: p.drblD,
        seasonalImpact: p.seasonalImpact,
        drblWar: p.drblWar,
        drblL: p.drblL,
        disagreement: p.disagreement,
        dominant_component:
          Math.abs(p.drblP) >= Math.abs(p.drblLn) &&
          Math.abs(p.drblP) >= Math.abs(p.drblB)
            ? "P"
            : Math.abs(p.drblLn) >= Math.abs(p.drblB)
              ? "LN"
              : "B",
        note:
          p.possessions < 250
            ? "thin_sample_in_50game_artifact"
            : "adequate_within_artifact",
      };
    });
}

async function extendedWarValidation() {
  // Attempt larger within-cache WAR calibration WITHOUT writing site artifacts.
  const results: Record<string, unknown>[] = [];
  for (const season of ["2024-25", "2025-26"] as const) {
    let games = await listSeasonGames(season);
    const limits = [50, 150, 400].filter((n) => n <= games.length || n === 50);
    // Always try up to available
    const tryLimits = [...new Set([50, Math.min(150, games.length), Math.min(400, games.length), games.length])].sort((a,b)=>a-b);

    await warmEpvModel();
    for (const limit of tryLimits) {
      const slice = games.slice(0, limit);
      const processed = [];
      let failed = 0;
      for (const meta of slice) {
        try {
          const g = await processGame(meta, { persist: true });
          if (!g.reconcile.quarantined) processed.push(g);
          else failed += 1;
        } catch {
          failed += 1;
        }
      }
      if (processed.length < 20) {
        results.push({
          season,
          limit,
          gamesAttempted: slice.length,
          gamesProcessed: processed.length,
          failed,
          status: "insufficient",
        });
        continue;
      }

      const roleAccum = new Map();
      for (const g of processed) {
        accumulateReplacementSignals(g.box, g.events, g.possessions, roleAccum);
      }
      const candidates = finalizeRoleAccum(roleAccum);
      const rolesByPlayer = new Map(candidates.map((c) => [c.playerId, c.role]));
      let cutoff = "";
      for (const g of processed) {
        if (g.box.gameDate > cutoff) cutoff = g.box.gameDate;
      }
      const pool = buildReplacementPool(candidates, {
        cutoffDate: cutoff || "9999-12-31",
      });
      const war = calibrateWar(processed, {
        replacementPool: pool,
        rolesByPlayer,
        holdoutFrac: 0.25,
        minTeams: 8,
      });
      results.push({
        season,
        limit,
        gamesAttempted: slice.length,
        gamesProcessed: processed.length,
        failed,
        teamsApprox: "see war fit",
        pointsToWins: war.pointsToWins,
        throughOriginSlope: war.throughOriginSlope,
        provisional: war.provisionalPointsToWins,
        calibrated: war.calibrated,
        reason: war.reason,
        train_n: war.train.n,
        train_mae: war.train.mae,
        train_corr: war.train.corr,
        holdout_n: war.holdout?.n ?? "",
        holdout_mae: war.holdout?.mae ?? "",
        holdout_corr: war.holdout?.corr ?? "",
        status: "ok",
      });
    }
  }
  return results;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await mkdir(path.join(OUT, "freeze"), { recursive: true });

  const a24 = await loadArtifact("2024-25");
  const a25 = await loadArtifact("2025-26");
  const freeze = await writeFreezeManifest([a24, a25]);

  // 02 leaderboard
  const lb = [...leaderboardRows(a24), ...leaderboardRows(a25)];
  await writeFile(path.join(OUT, "02_leaderboard_diagnostics.csv"), toCsv(lb), "utf8");

  // 03 components
  await writeFile(
    path.join(OUT, "03_component_decomposition.csv"),
    toCsv([...componentRanks(a24.players, "2024-25"), ...componentRanks(a25.players, "2025-26")]),
    "utf8"
  );

  // 04 sample size
  await writeFile(
    path.join(OUT, "04_sample_size_analysis.csv"),
    toCsv([
      sampleSizeAnalysis(a24.players, "2024-25"),
      sampleSizeAnalysis(a25.players, "2025-26"),
      ...lb.map((r) => ({
        season: r.season,
        player: r.player,
        possessions: r.possessions,
        drbl100: r.final_drbl_per100,
        abs_drbl100: Math.abs(Number(r.final_drbl_per100)),
      })),
    ]),
    "utf8"
  );

  // 05 shrinkage
  await writeFile(
    path.join(OUT, "05_shrinkage_analysis.csv"),
    toCsv([...shrinkageRows(a24.players, "2024-25"), ...shrinkageRows(a25.players, "2025-26")]),
    "utf8"
  );

  // 06 team contamination
  await writeFile(
    path.join(OUT, "06_team_contamination.csv"),
    toCsv([...teamContamination(a24.players, "2024-25"), ...teamContamination(a25.players, "2025-26")]),
    "utf8"
  );

  // 07 replacement - document Approach B limitations
  await writeFile(
    path.join(OUT, "07_replacement_analysis.csv"),
    toCsv([
      {
        method: "Approach_B_role_matched_residual",
        simulates_lineup_swap: "NO",
        formula: "replacementEP = EPV(state) + clamp(roleMatchedR1Residual)",
        clamp: "[-0.08, +0.04]",
        cutoff_frozen: "YES",
        counterfactual_rule_satisfied: "NO_full_Approach_A_missing",
        classification: "B_or_D_modeling_limitation",
      },
    ]),
    "utf8"
  );

  // 08 defensive ablation - cannot run full OOS without redesign; report availability
  await writeFile(
    path.join(OUT, "08_defensive_ablation.csv"),
    toCsv([
      {
        component: "drblD",
        independent_module: "NO_equal_share_of_residual",
        optical_rim_suppression: "NOT_MODELED",
        gravity_proxy: "IN_DRBL_B_only",
        double_count_risk_with_LN: "YES_possible_association",
        oos_ablation_status: "NOT_RUN_requires_refit_pipeline",
      },
    ]),
    "utf8"
  );

  // 09 lineup audit
  await writeFile(
    path.join(OUT, "09_lineup_audit.csv"),
    toCsv([
      {
        season: "2024-25",
        ...(a24.lineupModel ?? {}),
        identification: "RAPM_style_association",
        causal_claim: "NO",
        leave_one_out: "NOT_RUN",
      },
      {
        season: "2025-26",
        ...(a25.lineupModel ?? {}),
        identification: "RAPM_style_association",
        causal_claim: "NO",
        leave_one_out: "NOT_RUN",
      },
    ]),
    "utf8"
  );

  // 10 behavior features
  await writeFile(
    path.join(OUT, "10_behavior_feature_audit.csv"),
    toCsv(
      [
        "usage",
        "threeRate",
        "assistPer100",
        "tovPer100",
        "stlPer100",
        "blkPer100",
        "ftRate",
        "rimRate",
        "gravityProxy",
      ].map((feature) => ({
        feature,
        endpoint: "cdn+stats.nba.com box/pbp",
        post_game_only: "YES",
        as_of: "game_final",
        leakage_into_same_season_fit: "YES_in_sample_target_is_same_season_residual",
        predictive_real_time_eligible: "NO",
        definition_ok: feature === "gravityProxy" ? "PROXY_not_optical" : "YES",
      }))
    ),
    "utf8"
  );

  // 11 leakage
  await writeFile(
    path.join(OUT, "11_leakage_report.csv"),
    toCsv([
      {
        risk: "same_season_residual_as_B_and_fusion_target",
        severity: "HIGH",
        status: "PRESENT",
        notes: "DRBL-B and fusion stack target mean residual/100 from same season possessions",
      },
      {
        risk: "in_sample_component_predictions_entering_fusion_features",
        severity: "MEDIUM",
        status: "MITIGATED_OOF_for_meta",
        notes: "Fusion ratings are OOF; P/LN/B features themselves may be fit on overlapping data",
      },
      {
        risk: "post_game_box_features_in_DRBL_B",
        severity: "HIGH_for_realtime",
        status: "PRESENT",
        notes: "AST/TOV/STL/BLK from final box - fine for retrospective, invalid for live",
      },
      {
        risk: "future_replacement_performance",
        severity: "LOW",
        status: "MITIGATED",
        notes: "R1 pool cutoff-frozen by asOfDate",
      },
      {
        risk: "test_season_never_held_out",
        severity: "HIGH",
        status: "PRESENT",
        notes: "No true reserved test season; only chrono within 50-game samples",
      },
      {
        risk: "M6_same_possession_outcome",
        severity: "N/A",
        status: "M6_NOT_IMPLEMENTED",
      },
    ]),
    "utf8"
  );

  // 12 fusion
  await writeFile(
    path.join(OUT, "12_fusion_validation.csv"),
    toCsv([
      {
        season: "2024-25",
        ...(a24.fusionModel ?? {}),
        equation: "OOF ridge stack; published drbl100=oof pred",
      },
      {
        season: "2025-26",
        ...(a25.fusionModel ?? {}),
        equation: JSON.stringify(freeze.fusionEquation2025_26),
      },
    ]),
    "utf8"
  );

  // 13/14 WAR - published + extended
  console.log("Running extended WAR validation on cached games (read-only for site)…");
  const warExt = await extendedWarValidation();
  await writeFile(path.join(OUT, "13_war_validation.csv"), toCsv([
    { season: "2024-25", source: "published_artifact", ...(a24.warModel ?? {}) },
    { season: "2025-26", source: "published_artifact", ...(a25.warModel ?? {}) },
  ]), "utf8");
  await writeFile(path.join(OUT, "14_war_multi_season_calibration.csv"), toCsv(warExt), "utf8");

  // 15 leverage
  await writeFile(
    path.join(OUT, "15_leverage_validation.csv"),
    toCsv([
      {
        season: "2024-25",
        ...(a24.leverageModel ?? {}),
        changes_drbl100: "NO",
        changes_war: "NO",
        formula: "drblL = sum(value*lambda_raw)/mean_lambda_raw",
      },
      {
        season: "2025-26",
        ...(a25.leverageModel ?? {}),
        changes_drbl100: "NO",
        changes_war: "NO",
        formula: "drblL = sum(value*lambda_raw)/mean_lambda_raw",
      },
      ...suspiciousPlayerFocus(a25.players, "2025-26", [
        "Cedric Coward",
        "Matisse Thybulle",
        "Tidjane Salaun",
        "Tidjane Salaün",
        "Dylan Harper",
        "Marcus Smart",
        "Devin Vassell",
        "Jalen Suggs",
        "Nikola Jovic",
        "Nikola Jović",
        "Chaz Lanier",
        "Dru Smith",
        "Shai Gilgeous-Alexander",
        "Nikola Jokic",
        "Nikola Jokić",
        "Luka Doncic",
        "Luka Dončić",
        "Giannis",
        "Jayson Tatum",
        "Stephen Curry",
        "Anthony Edwards",
        "Victor Wembanyama",
        "LaMelo Ball",
      ]).map((r) => ({ ...r, section: "player_focus" })),
    ]),
    "utf8"
  );

  // 16/17 benchmarks - not runnable without external baselines wired; stub honesty
  await writeFile(
    path.join(OUT, "16_full_benchmark.csv"),
    toCsv([
      {
        baseline: "DARKO/LEBRON/EPM",
        status: "NOT_COMPARED_IN_THIS_PASS",
        reason: "no identical-period OOS harness wired; requires multi-season reserved test",
      },
      {
        baseline: "provisional_1_30_WAR",
        status: "COMPARED_within_war_holdout",
        see: "14_war_multi_season_calibration.csv",
      },
    ]),
    "utf8"
  );
  await writeFile(
    path.join(OUT, "17_ablation_results.csv"),
    toCsv([
      {
        ablation: "P_only_vs_equal_vs_lite_vs_OOF_stack",
        evidence: "fusionModel.oofMae vs equalMae/liteMae on stacking target",
        season_2025_26_oofMae: a25.fusionModel?.oofMae,
        equalMae: a25.fusionModel?.equalMae,
        liteMae: a25.fusionModel?.liteMae,
        note: "Target is same-season residual/100 - not external next-game margin",
      },
      {
        ablation: "full_without_M6",
        status: "CURRENT_DEFAULT",
        note: "M6 absent; cannot ablate shot-decision",
      },
      {
        ablation: "P_plus_LN_plus_B_vs_subsets_on_next_game_margin",
        status: "NOT_RUN",
      },
    ]),
    "utf8"
  );

  // 18 M6
  await writeFile(
    path.join(OUT, "18_m6_validation.csv"),
    toCsv([
      {
        milestone: "M6",
        status: "NOT_IMPLEMENTED",
        files: "NONE",
        sdv_formula: "EPV(shoot)-EPV(continuation) - not coded",
        integrated_into_drbl100: "NO",
        oos_validation: "N/A",
        blocker_for_finalization: "YES",
      },
    ]),
    "utf8"
  );

  // Suspicious focus CSV
  await writeFile(
    path.join(OUT, "19_suspicious_and_star_focus.csv"),
    toCsv([
      ...suspiciousPlayerFocus(a24.players, "2024-25", [
        "Royce O'Neale",
        "Shai Gilgeous-Alexander",
        "Buddy Hield",
        "Lonzo Ball",
        "Matisse Thybulle",
        "Marcus Smart",
        "Nikola Jokic",
        "Luka",
        "Giannis",
        "Tatum",
        "Curry",
        "Edwards",
        "Wembanyama",
        "LaMelo",
      ]),
      ...suspiciousPlayerFocus(a25.players, "2025-26", [
        "Cedric Coward",
        "Matisse Thybulle",
        "Tidjane",
        "Dylan Harper",
        "Marcus Smart",
        "Devin Vassell",
        "Jalen Suggs",
        "Nikola Jovic",
        "Chaz Lanier",
        "Dru Smith",
        "LaMelo Ball",
        "Shai",
        "Jokic",
        "Luka",
        "Giannis",
        "Tatum",
        "Curry",
        "Edwards",
        "Wembanyama",
      ]),
    ]),
    "utf8"
  );

  console.log("Wrote M15 diagnostic CSVs to", OUT);
  console.log("Freeze:", freeze.gitCommit, "dirty=", freeze.gitDirty);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
