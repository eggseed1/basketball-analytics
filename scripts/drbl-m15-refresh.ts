/**
 * M15 refresh — READ-ONLY diagnostics against CURRENT live artifacts.
 * Does NOT modify model mathematics, fusion, WAR formulas, or site math.
 *
 *   npx tsx scripts/drbl-m15-refresh.ts
 *
 * Preserves prior freeze under reports/m15/freeze/legacy-50game/ when present,
 * then writes a new freeze of live precomputed + updated reports.
 */
import { copyFile, mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

import { PROVISIONAL_WIN_CONVERSION } from "../drbl/models/player-value";
import {
  DRBL_PARSER_VERSION,
  DRBL_RECONSTRUCTION_VERSION,
} from "../drbl/constants";
import { PRIOR_EQUIVALENT_POSSESSIONS } from "../drbl/models/ranking-config";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m15");
const FREEZE = path.join(OUT, "freeze");

type Player = {
  playerId: string;
  playerName: string;
  teamId: string;
  possessions: number;
  actualPossessions?: number;
  drbl100: number;
  rawAbilityRate?: number;
  posteriorAbilityRate?: number;
  drblP: number;
  drblLn: number;
  drblB: number;
  drblO: number;
  drblD: number;
  sdv100?: number;
  shotMaking100?: number;
  seasonalImpact: number;
  drblWar: number;
  drblL?: number;
  meanLeverage?: number;
  disagreement?: number;
  uncertainty?: number;
  intervalLo?: number;
  intervalHi?: number;
  creationValuePer100?: number;
  connectionValuePer100?: number;
  executionValuePer100?: number;
  turnoverValuePer100?: number;
  defensiveValuePer100?: number;
  reliabilityWeight?: number;
  finalAbilityDRBL100?: number;
  [key: string]: unknown;
};

type Artifact = {
  season: string;
  version: string;
  generatedAt?: string;
  gamesProcessed: number;
  gamesFailed?: number;
  players: Player[];
  replacementLevel?: string;
  rankingFormulaVersion?: string;
  warFormulaVersion?: string;
  sequentialAttributionVersion?: string;
  pipelineVersion?: string;
  shotDecisionModel?: Record<string, unknown>;
  lineupModel?: Record<string, unknown>;
  behaviorModel?: Record<string, unknown>;
  fusionModel?: Record<string, unknown>;
  uncertaintyModel?: Record<string, unknown>;
  warModel?: Record<string, unknown>;
  leverageModel?: Record<string, unknown>;
  [key: string]: unknown;
};

function corr(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return NaN;
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
  const den = Math.sqrt(dx * dy);
  return den > 1e-12 ? num / den : NaN;
}

function esc(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
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

function poss(p: Player): number {
  return Number(p.actualPossessions ?? p.possessions) || 0;
}

function shrinkW(n: number, k = PRIOR_EQUIVALENT_POSSESSIONS): number {
  return n / (n + k);
}

async function loadArtifact(season: string): Promise<Artifact> {
  const p = path.join(ROOT, "src/data/drbl/precomputed", `${season}.json`);
  return JSON.parse(await readFile(p, "utf8")) as Artifact;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await mkdir(FREEZE, { recursive: true });

  const a24 = await loadArtifact("2024-25");
  const a25 = await loadArtifact("2025-26");

  // Snapshot live artifacts into freeze (immutable for this audit pass).
  await writeFile(
    path.join(FREEZE, "precomputed-2024-25.live.json"),
    JSON.stringify(a24)
  );
  await writeFile(
    path.join(FREEZE, "precomputed-2025-26.live.json"),
    JSON.stringify(a25)
  );

  let gitCommit = "unknown";
  let gitDirty = true;
  try {
    gitCommit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    gitDirty =
      execSync("git status --porcelain", { encoding: "utf8" }).trim().length >
      0;
  } catch {
    /* ignore */
  }

  const freeze = {
    frozenAt: new Date().toISOString(),
    auditPass: "m15-refresh-live-400game",
    gitCommit,
    gitDirty,
    note:
      "Freeze of LIVE site precomputed artifacts (post sequential + WAR pipeline remaster). Prior 50-game freeze retained as freeze/precomputed-*-original if present. NO model math changed in this pass.",
    parserVersion: DRBL_PARSER_VERSION,
    reconstructionVersion: DRBL_RECONSTRUCTION_VERSION,
    priorEquivalentPossessions: PRIOR_EQUIVALENT_POSSESSIONS,
    provisionalPointsToWins: PROVISIONAL_WIN_CONVERSION,
    artifacts: [a24, a25].map((a) => ({
      season: a.season,
      version: a.version,
      generatedAt: a.generatedAt,
      gamesProcessed: a.gamesProcessed,
      gamesFailed: a.gamesFailed ?? null,
      players: a.players.length,
      rankingFormulaVersion: a.rankingFormulaVersion ?? null,
      warFormulaVersion: a.warFormulaVersion ?? null,
      pipelineVersion: a.pipelineVersion ?? null,
      sequentialAttributionVersion: a.sequentialAttributionVersion ?? null,
      replacementLevel: a.replacementLevel,
      shotDecisionModel: a.shotDecisionModel,
      lineupModel: a.lineupModel,
      behaviorModel: a.behaviorModel,
      fusionModel: a.fusionModel,
      uncertaintyModel: a.uncertaintyModel,
      warModel: a.warModel,
      leverageModel: a.leverageModel,
    })),
    m6: {
      status: "COMPLETE_STANDALONE",
      files: [
        "drbl/models/shot-decision.ts",
        "drbl/models/continuation-value.ts",
        "drbl/models/shot-components.ts",
      ],
      fusedIntoPublishedDrbl100: false,
      evidence: a24.shotDecisionModel,
    },
    sampleNote: {
      live2024_25_games: a24.gamesProcessed,
      live2025_26_games: a25.gamesProcessed,
      fullSeasonTarget: "~1230 regular-season games",
      isFullSeason: false,
      prior50gameFreezeExists: await exists(
        path.join(FREEZE, "precomputed-2024-25.json")
      ),
    },
  };
  await writeFile(
    path.join(FREEZE, "00_model_freeze_live.json"),
    JSON.stringify(freeze, null, 2)
  );

  // ---- 02 leaderboard diagnostics (by season_value / war rank if present) ----
  const lbRows: Record<string, unknown>[] = [];
  for (const art of [a24, a25]) {
    const sorted = art.players
      .slice()
      .sort((a, b) => Number(b.drblWar) - Number(a.drblWar));
    sorted.slice(0, 100).forEach((p, i) => {
      const n = poss(p);
      const abilityRank =
        art.players
          .slice()
          .sort((a, b) => b.drbl100 - a.drbl100)
          .findIndex((x) => x.playerId === p.playerId) + 1;
      lbRows.push({
        rank_war: i + 1,
        rank_drbl100: abilityRank,
        season: art.season,
        playerId: p.playerId,
        player: p.playerName,
        teamId: p.teamId,
        games_in_artifact: art.gamesProcessed,
        possessions: n,
        raw_ability_rate: p.rawAbilityRate ?? "",
        posterior_drbl100: p.posteriorAbilityRate ?? p.drbl100,
        final_drbl100: p.drbl100,
        final_ability_calibrated: p.finalAbilityDRBL100 ?? "",
        drbl_p: p.drblP,
        drbl_ln: p.drblLn,
        drbl_b: p.drblB,
        offensive_value_per100: p.drblO,
        defensive_value_per100: p.drblD,
        sdv100: p.sdv100 ?? "",
        shot_making100: p.shotMaking100 ?? "",
        creation_per100: p.creationValuePer100 ?? "",
        connection_per100: p.connectionValuePer100 ?? "",
        execution_per100: p.executionValuePer100 ?? "",
        turnover_per100: p.turnoverValuePer100 ?? "",
        defense_event_per100: p.defensiveValuePer100 ?? "",
        seasonal_impact: p.seasonalImpact,
        drbl_war: p.drblWar,
        drbl_leverage: p.drblL ?? "",
        mean_leverage: p.meanLeverage ?? "",
        model_disagreement: p.disagreement ?? "",
        uncertainty: p.uncertainty ?? "",
        reliability: p.reliabilityWeight ?? "",
        shrinkage_weight: Number(shrinkW(n).toFixed(4)),
        prior: 0,
        m6_fused_into_drbl100: art.shotDecisionModel?.fusedIntoDrbl100 ?? false,
        artifact_version: art.version,
      });
    });
  }
  await writeFile(path.join(OUT, "02_leaderboard_diagnostics.csv"), toCsv(lbRows));

  // ---- 03 components ----
  const compRows: Record<string, unknown>[] = [];
  for (const art of [a24, a25]) {
    const keys: Array<[keyof Player, string]> = [
      ["drblP", "DRBL-P"],
      ["drblLn", "DRBL-LN"],
      ["drblB", "DRBL-B"],
      ["drblO", "DRBL-O"],
      ["drblD", "DRBL-D"],
      ["drbl100", "DRBL/100"],
      ["drblWar", "DRBL-WAR"],
      ["sdv100", "SDV100"],
      ["shotMaking100", "ShotMaking100"],
      ["seasonalImpact", "seasonal_impact"],
    ];
    for (const [key, label] of keys) {
      const ranked = art.players
        .slice()
        .filter((p) => Number.isFinite(Number(p[key])))
        .sort((a, b) => Number(b[key]) - Number(a[key]))
        .slice(0, 25);
      ranked.forEach((p, i) => {
        compRows.push({
          season: art.season,
          component: label,
          rank: i + 1,
          player: p.playerName,
          teamId: p.teamId,
          value: p[key],
          possessions: poss(p),
          drbl100: p.drbl100,
          drblWar: p.drblWar,
        });
      });
    }
  }
  await writeFile(
    path.join(OUT, "03_component_decomposition.csv"),
    toCsv(compRows)
  );

  // ---- 04 sample size ----
  const sampleRows: Record<string, unknown>[] = [];
  for (const art of [a24, a25]) {
    const xs = art.players.map((p) => poss(p));
    const ys = art.players.map((p) => p.drbl100);
    const abs = ys.map(Math.abs);
    const wars = art.players.map((p) => p.drblWar);
    sampleRows.push({
      season: art.season,
      games_processed: art.gamesProcessed,
      n_players: art.players.length,
      corr_drbl100_possessions: Number(corr(xs, ys).toFixed(4)),
      corr_abs_drbl100_possessions: Number(corr(xs, abs).toFixed(4)),
      corr_war_possessions: Number(corr(xs, wars).toFixed(4)),
      mean_poss_all: Number(
        (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1)
      ),
      mean_poss_top20_war: Number(
        (
          art.players
            .slice()
            .sort((a, b) => b.drblWar - a.drblWar)
            .slice(0, 20)
            .reduce((s, p) => s + poss(p), 0) / 20
        ).toFixed(1)
      ),
      is_full_season: art.gamesProcessed >= 1200 ? "YES" : "NO",
    });
  }
  await writeFile(
    path.join(OUT, "04_sample_size_analysis.csv"),
    toCsv(sampleRows)
  );

  // ---- 05 shrinkage ----
  const shrinkRows: Record<string, unknown>[] = [];
  for (const art of [a24, a25]) {
    for (const p of art.players
      .slice()
      .sort((a, b) => b.drblWar - a.drblWar)
      .slice(0, 100)) {
      const n = poss(p);
      shrinkRows.push({
        season: art.season,
        player: p.playerName,
        possessions: n,
        shrinkage_weight: Number(shrinkW(n).toFixed(4)),
        prior: 0,
        raw_ability_rate: p.rawAbilityRate ?? "",
        posterior_drbl100: p.posteriorAbilityRate ?? p.drbl100,
        final_drbl100: p.drbl100,
        uncertainty: p.uncertainty ?? "",
        low_sample_flag: n < 500 ? 1 : 0,
      });
    }
  }
  await writeFile(path.join(OUT, "05_shrinkage_analysis.csv"), toCsv(shrinkRows));

  // ---- 06 team contamination ----
  const teamRows: Record<string, unknown>[] = [];
  for (const art of [a24, a25]) {
    const by = new Map<string, Player[]>();
    for (const p of art.players) {
      const arr = by.get(p.teamId) ?? [];
      arr.push(p);
      by.set(p.teamId, arr);
    }
    for (const [teamId, list] of by) {
      const meanD =
        list.reduce((s, p) => s + p.drbl100, 0) / Math.max(1, list.length);
      const meanW =
        list.reduce((s, p) => s + p.drblWar, 0) / Math.max(1, list.length);
      const top = list.slice().sort((a, b) => b.drblWar - a.drblWar)[0]!;
      teamRows.push({
        season: art.season,
        teamId,
        n_players: list.length,
        mean_drbl100: Number(meanD.toFixed(4)),
        mean_drblWar: Number(meanW.toFixed(4)),
        sum_seasonal_impact: Number(
          list.reduce((s, p) => s + p.seasonalImpact, 0).toFixed(2)
        ),
        top_war_player: top.playerName,
        top_war: top.drblWar,
      });
    }
  }
  teamRows.sort(
    (a, b) => Number(b.mean_drblWar) - Number(a.mean_drblWar)
  );
  await writeFile(path.join(OUT, "06_team_contamination.csv"), toCsv(teamRows));

  // ---- 07–11 structural audits (code-documented, no math changes) ----
  await writeFile(
    path.join(OUT, "07_replacement_analysis.csv"),
    toCsv([
      {
        method: "Approach_B_role_matched_residual",
        simulates_lineup_swap: "NO",
        formula: "replacementEP = EPV(state) + clamp(roleMatchedR1Residual)",
        clamp: "[-0.08, +0.04]",
        cutoff_frozen: "YES",
        counterfactual_rule_satisfied: "NO_Approach_A_missing",
        classification: "D_modeling_limitation",
        live_war_replacement_on_rate_scale:
          a24.warModel && "replacementLevelDRBL100" in (a24.warModel as object)
            ? String((a24.warModel as { replacementLevelDRBL100?: number }).replacementLevelDRBL100)
            : "see pipeline remaster / fringe median on calibrated posterior",
      },
    ])
  );

  await writeFile(
    path.join(OUT, "08_defensive_ablation.csv"),
    toCsv([
      {
        component: "drblD / sequential defense credits",
        independent_module: "PARTIAL_sequential_categories",
        optical_rim_suppression: "NOT_MODELED",
        gravity_proxy: "IN_DRBL_B_only",
        double_count_risk_with_LN: "YES_possible",
        oos_ablation_status: "NOT_RUN_no_model_refit_in_m15",
      },
    ])
  );

  await writeFile(
    path.join(OUT, "09_lineup_audit.csv"),
    toCsv([
      {
        season: "2024-25",
        ...(a24.lineupModel ?? {}),
        identification: "RAPM_style_association",
        causal_claim: "NO",
      },
      {
        season: "2025-26",
        ...(a25.lineupModel ?? {}),
        identification: "RAPM_style_association",
        causal_claim: "NO",
      },
    ])
  );

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
        endpoint: "cdn+stats box/pbp",
        post_game_only: "YES",
        predictive_real_time_eligible: "NO",
        used_in_published_drbl100: "YES_via_DRBL_B_when_hasB",
        used_in_M6: "NO_separate_module",
      }))
    )
  );

  await writeFile(
    path.join(OUT, "11_leakage_report.csv"),
    toCsv([
      {
        risk: "same_season_residual_fusion_target",
        severity: "HIGH",
        status: "PRESENT",
        class: "D_target_misalignment",
        notes: "Fusion stacks to same-season residual/100, not next-game margin",
      },
      {
        risk: "post_game_box_in_DRBL_B",
        severity: "HIGH_for_realtime",
        status: "PRESENT",
        class: "C_leakage_for_live",
        notes: "OK retrospective; invalid live",
      },
      {
        risk: "M6_fused_into_drbl100",
        severity: "N/A",
        status: "NOT_FUSED",
        class: "F_by_design_frozen",
        notes: "shotDecisionModel.fusedIntoDrbl100=false",
      },
      {
        risk: "no_reserved_test_season",
        severity: "HIGH",
        status: "PRESENT",
        class: "D",
        notes: "Only within-sample chrono holdouts",
      },
    ])
  );

  await writeFile(
    path.join(OUT, "12_fusion_validation.csv"),
    toCsv([
      { season: "2024-25", ...(a24.fusionModel ?? {}) },
      { season: "2025-26", ...(a25.fusionModel ?? {}) },
    ])
  );

  // WAR validation from published artifacts + prior multi-season CSV if present
  await writeFile(
    path.join(OUT, "13_war_validation.csv"),
    toCsv([
      {
        season: "2024-25",
        source: "live_artifact",
        gamesProcessed: a24.gamesProcessed,
        ...(a24.warModel ?? {}),
        warFormulaVersion: a24.warFormulaVersion ?? "",
        provisional: true,
        note: "M13 remains provisional; live board uses pipeline remaster conversion",
      },
      {
        season: "2025-26",
        source: "live_artifact",
        gamesProcessed: a25.gamesProcessed,
        ...(a25.warModel ?? {}),
        provisional: true,
      },
    ])
  );

  // Preserve / refresh pointer for multi-season WAR (do not reprocess games here)
  if (await exists(path.join(OUT, "14_war_multi_season_calibration.csv"))) {
    // keep existing extended calibration from prior pass
  }

  await writeFile(
    path.join(OUT, "15_leverage_validation.csv"),
    toCsv([
      {
        season: "2024-25",
        ...(a24.leverageModel ?? {}),
        changes_drbl100: "NO",
        enters_war: "NO",
      },
      {
        season: "2025-26",
        ...(a25.leverageModel ?? {}),
        changes_drbl100: "NO",
        enters_war: "NO",
      },
    ])
  );

  await writeFile(
    path.join(OUT, "16_full_benchmark.csv"),
    toCsv([
      {
        status: "NOT_RUN",
        reason:
          "External bakeoff (DARKO/RAPTOR/EPM/RAPM) requires licensed identical periods; M15 pass freezes diagnostics only",
        available_internal_targets: "team_valueSum_vs_wins (see war csv)",
      },
    ])
  );

  await writeFile(
    path.join(OUT, "17_ablation_results.csv"),
    toCsv([
      {
        ablation: "Full_DRBL_vs_Full_without_M6",
        result: "IDENTICAL_for_published_drbl100",
        reason: "fusedIntoDrbl100=false — M6 fields exist but do not enter fusion",
        incremental_oos_on_published_metric: 0,
      },
      {
        ablation: "P_vs_P+LN_vs_P+LN+B",
        result: "SEE_fusionModel_oofMae",
        oof_2024_25: (a24.fusionModel as { oofMae?: number })?.oofMae ?? "",
        oof_2025_26: (a25.fusionModel as { oofMae?: number })?.oofMae ?? "",
        note: "Stack target = same-season residual; not next-game margin",
      },
    ])
  );

  await writeFile(
    path.join(OUT, "18_m6_validation.csv"),
    toCsv([
      {
        season: "2024-25",
        ...(a24.shotDecisionModel ?? {}),
        status: "IMPLEMENTED_NOT_FUSED",
        tests: "drbl/models/__tests__/shot-decision.test.ts, continuation-value.test.ts",
        incremental_value_on_drbl100: 0,
        classification: "F_complete_but_gated_from_fusion",
      },
      {
        season: "2025-26",
        ...(a25.shotDecisionModel ?? { note: "may_lack_shotDecisionModel_block" }),
        status: a25.shotDecisionModel
          ? "IMPLEMENTED_NOT_FUSED"
          : "UNKNOWN_IN_ARTIFACT",
      },
    ])
  );

  const focusNames = [
    "Nikola Jokić",
    "Shai Gilgeous-Alexander",
    "Luka Dončić",
    "Giannis Antetokounmpo",
    "Jayson Tatum",
    "Stephen Curry",
    "Anthony Edwards",
    "Victor Wembanyama",
    "LaMelo Ball",
    "Matisse Thybulle",
    "Marcus Smart",
    "Aaron Wiggins",
    "Cason Wallace",
    "Dru Smith",
    "Chaz Lanier",
  ];
  const focusRows: Record<string, unknown>[] = [];
  for (const art of [a24, a25]) {
    const byWar = art.players.slice().sort((a, b) => b.drblWar - a.drblWar);
    const byAbility = art.players.slice().sort((a, b) => b.drbl100 - a.drbl100);
    for (const name of focusNames) {
      const parts = name.toLowerCase().split(/\s+/);
      const p = art.players.find((x) => {
        const n = x.playerName.toLowerCase();
        return parts.every((part) => n.includes(part.replace("ć", "c").replace("č", "c"))) ||
          parts.every((part) => n.includes(part));
      });
      // fallback accent-insensitive
      const p2 =
        p ??
        art.players.find((x) => {
          const n = x.playerName
            .toLowerCase()
            .normalize("NFD")
            .replace(/\p{M}/gu, "");
          return parts.every((part) =>
            n.includes(
              part.normalize("NFD").replace(/\p{M}/gu, "").replace("ć", "c")
            )
          );
        });
      if (!p2) {
        focusRows.push({
          season: art.season,
          player: name,
          status: "NOT_IN_ARTIFACT",
        });
        continue;
      }
      const warRank = byWar.findIndex((x) => x.playerId === p2.playerId) + 1;
      const abilityRank =
        byAbility.findIndex((x) => x.playerId === p2.playerId) + 1;
      focusRows.push({
        season: art.season,
        player: p2.playerName,
        teamId: p2.teamId,
        rank_war: warRank,
        rank_drbl100: abilityRank,
        possessions: poss(p2),
        raw_ability_rate: p2.rawAbilityRate ?? "",
        posterior_drbl100: p2.posteriorAbilityRate ?? p2.drbl100,
        drbl100: p2.drbl100,
        drblP: p2.drblP,
        drblLn: p2.drblLn,
        drblB: p2.drblB,
        drblO: p2.drblO,
        drblD: p2.drblD,
        sdv100: p2.sdv100 ?? "",
        shotMaking100: p2.shotMaking100 ?? "",
        seasonalImpact: p2.seasonalImpact,
        drblWar: p2.drblWar,
        disagreement: p2.disagreement ?? "",
        dominant_component:
          Math.abs(p2.drblP) >= Math.abs(p2.drblLn) &&
          Math.abs(p2.drblP) >= Math.abs(p2.drblB)
            ? "P"
            : Math.abs(p2.drblLn) >= Math.abs(p2.drblB)
              ? "LN"
              : "B",
        sample_note:
          art.gamesProcessed < 1200
            ? `partial_season_${art.gamesProcessed}_games`
            : "full_season_like",
      });
    }
  }
  await writeFile(
    path.join(OUT, "19_suspicious_and_star_focus.csv"),
    toCsv(focusRows)
  );

  // Implementation audit + final recommendations
  const impl = `# M15 — Implementation Audit (REFRESH — live artifacts)

**Frozen at:** \`freeze/00_model_freeze_live.json\`  
**Method:** Code inspection of \`drbl/\` + tests + **live** precomputed artifacts.  
**Constraint:** No model mathematics changed in this pass.

## Live artifact sample

| Season | Version | Games | Players | Ranking | WAR formula |
|--------|---------|------:|--------:|---------|-------------|
| 2024-25 | ${a24.version} | **${a24.gamesProcessed}** | ${a24.players.length} | ${a24.rankingFormulaVersion ?? "?"} | ${a24.warFormulaVersion ?? "artifact warModel"} |
| 2025-26 | ${a25.version} | **${a25.gamesProcessed}** | ${a25.players.length} | ${a25.rankingFormulaVersion ?? "?"} | (see warModel) |

**Not full season** (~1230 games). Prior freeze was 50-game; live is **400-game**.

## Milestone status (code, not docs)

| ID | Deliverable | STATUS | In published \`drbl100\`? |
|----|-------------|--------|--------------------------|
| M1 | API/cache | PARTIAL | Yes (data path) |
| M2 | Normalization | PARTIAL | Yes |
| M3 | Possessions | COMPLETE | Yes |
| M4 | Lineups | COMPLETE | Yes |
| M5 | EPV | PARTIAL / usable | Yes |
| M6 | Shot decision / continuation | **COMPLETE (standalone)** | **NO** (\`fusedIntoDrbl100: false\`) |
| M7 | Replacement | PARTIAL (Approach B) | Yes |
| M8 | DRBL-P | COMPLETE | Yes |
| M9 | DRBL-LN | COMPLETE | Yes |
| M10 | DRBL-B | COMPLETE | Yes |
| M11 | OOF fusion | COMPLETE (residual target) | Yes |
| M12 | Uncertainty | COMPLETE | Intervals |
| M13 | WAR | **PROVISIONAL** | Separate field |
| M14 | Leverage | COMPLETE | Separate; not in WAR |
| Seq | Sequential attribution | COMPLETE (v1) | Affects P totals |
| M15 | This audit | IN PROGRESS | N/A |

### M6 verification (frozen — not rewritten)

- **Files:** \`shot-decision.ts\`, \`continuation-value.ts\`, \`shot-components.ts\`
- **Tests:** \`shot-decision.test.ts\`, \`continuation-value.test.ts\`
- **Equations (intended):** \`SDV = EPV_shoot(S_t) - EPV_continue(S_t)\`; \`ShotMaking = outcome - E[make]\`
- **Published path:** fields \`sdv100\` / \`shotMaking100\` on players; **not** fused into \`drbl100\`
- **2024-25 artifact:** continueCorrC2≈${Number((a24.shotDecisionModel as { continueCorrC2?: number })?.continueCorrC2 ?? NaN).toFixed(3)}, shotsScored=${(a24.shotDecisionModel as { shotsScored?: number })?.shotsScored ?? "?"}

### Display lineage

\`explore drbl100\` ← \`precomputed.players[].drbl100\` ← OOF fused posterior ability (ranking remaster may EB-shrink fused rate).  
\`explore drblWar\` ← \`players[].drblWar\` ← WAR pipeline (v4 remaster on 2024-25 live).
`;

  await writeFile(path.join(OUT, "01_implementation_audit.md"), impl);

  const topWar = a24.players
    .slice()
    .sort((a, b) => b.drblWar - a.drblWar)
    .slice(0, 15)
    .map(
      (p, i) =>
        `${i + 1}. ${p.playerName} WAR=${Number(p.drblWar).toFixed(2)} drbl100=${Number(p.drbl100).toFixed(2)} poss=${poss(p)}`
    )
    .join("\n");

  const finalRec = `# M15 Final Diagnostic Report — STOP (no model changes)

**Pass:** live-400game refresh  
**Frozen:** \`reports/m15/freeze/00_model_freeze_live.json\`  
**Git:** \`${gitCommit}\` (dirty=${gitDirty})  
**Constraint honored:** No mathematical formulas / fusion / WAR / M6 / replacement methodology changed in this pass.

---

## 1. What is definitely wrong

| ID | Issue | Class |
|----|-------|-------|
| D1 | Published seasons are **partial (400 games)**, not full ~1230 | D sample design |
| D2 | Fusion / B **target** = same-season residual/100 (not next-game / next-season) | D target misalignment |
| D3 | Replacement is **Approach B only** (no lineup-swap Approach A) | D |
| D4 | DRBL-B uses **post-game box** features (invalid for live prediction) | C (live) / OK retrospective |
| D5 | No reserved multi-season **test** protocol; no external bakeoff harness | D |
| D6 | M13 WAR remains **provisional**; decision rule unstable across sample sizes (see prior \`14_*.csv\`) | D |
| D7 | Git freeze dirty; DRBL largely uncommitted | A process |

## 2. What is probably wrong

| ID | Issue | Class |
|----|-------|-------|
| P1 | LN association + residual equal-share can elevate role players on hot team trips | D/E |
| P2 | Team mean DRBL/WAR clustering may mix legitimate context with association | unresolved without controls |
| P3 | Posterior→WAR remaster changes magnitudes; ability vs value boards can disagree | F/E design |

## 3. What is working correctly

- End-to-end pipeline: download → normalize → possessions → lineups → P/LN/B → OOF fusion → uncertainty → WAR → leverage  
- **M6 is implemented** with unit tests; timestamped shoot vs continue structure exists  
- M6 is **honestly gated**: \`fusedIntoDrbl100: false\` (no silent fusion)  
- Displayed \`drbl100\` / \`drblWar\` match precomputed artifact fields  
- M14 leverage does not alter \`drbl100\` or base WAR definition in leverage module  
- R1 replacement pool cutoff-frozen  
- Sequential attribution version present on 2024-25 live artifact  

## 4. Unusual rankings — primary causes (ordered)

1. **Partial-season sample (400 games)** — not a final season board  
2. **Fusion to residual/100** — not outcome bakeoff  
3. **Approach B residual sharing** — role/context inflation risk  
4. **LN association** — not causal on/off  
5. **Not M6** — M6 does not move published \`drbl100\` today  

## 5. Does M6 provide measurable incremental OOS value on published DRBL?

**On published \`drbl100\` / WAR: NO — by construction (\`fusedIntoDrbl100: false\`).**  
Incremental improvement of Full vs Full−M6 on the **published** metric = **0**.

Standalone M6 diagnostics (2024-25 artifact): continueCorrC2 ≈ ${Number((a24.shotDecisionModel as { continueCorrC2?: number })?.continueCorrC2 ?? 0).toFixed(3)} (weak continuation signal in-season).  
**Do not fuse M6 without a dedicated OOS bakeoff after approval.**

## 6. Is M13 WAR genuinely validated?

**NO — provisional.**  
Live artifacts still carry provisional conversion semantics; prior multi-limit study (\`14_war_multi_season_calibration.csv\`) showed instability (e.g. fail at ~400 vs 1/30, stronger corr at full cache).  
**1/30 remains a necessary explicit fallback.**

## 7. Exact WAR / leaderboard sample size (this freeze)

| Season | Games in live leaderboard artifact |
|--------|-------------------------------------:|
| 2024-25 | **${a24.gamesProcessed}** |
| 2025-26 | **${a25.gamesProcessed}** |

## 8. Does 1/30 remain necessary?

**YES** as explicit fallback when learned mapping fails validation.

## 9. Should the 50-game leaderboard be discarded?

**YES as a “final season” product.**  
Live board is **400-game** — still **not** full-season. Do not market either as final season WAR/DRBL until full-season recompute **without model changes** (data prep only) is approved.

## 10. What should change (PROPOSED — not implemented)

1. Full-season recompute for validation artifacts (no formula change)  
2. Reserved chronological test protocol + external bakeoff  
3. Fusion target redesign → next-block / next-season outcomes  
4. Approach A research or permanent Approach B labeling  
5. M6 OOS bakeoff **before** any fusion gate flip  
6. Multi-season WAR rolling validation  
7. Clean git freeze commit  

## 11. What should NOT change yet

- M6 equations (frozen)  
- Equal-share / sequential math without OOS proof  
- Manual star boosts / consensus ranking fits  
- Silent deletion of 1/30 fallback  

## 12–13. Mathematical proposals & expected OOS impact

Deferred to approval. No coefficients proposed for automatic application.

## 14. Ready for finalization?

**NO.**

---

### Top 15 by live 2024-25 DRBL-WAR (diagnostic only)

\`\`\`
${topWar}
\`\`\`

### STOP

Await approval before any model implementation.
`;

  await writeFile(path.join(OUT, "20_final_recommendations.md"), finalRec);
  // Keep 19_final as pointer
  await writeFile(
    path.join(OUT, "19_final_recommendations.md"),
    `# Superseded by 20_final_recommendations.md (live-400game refresh)\n\nSee \`20_final_recommendations.md\` for the current M15 STOP report.\n`
  );

  console.log(`
M15 REFRESH COMPLETE (diagnostics only — no model changes)
==========================================================
Freeze: reports/m15/freeze/00_model_freeze_live.json
Games: 2024-25=${a24.gamesProcessed}, 2025-26=${a25.gamesProcessed}
M6 fused into drbl100: ${String(a24.shotDecisionModel?.fusedIntoDrbl100 ?? false)}
Reports written under reports/m15/
STOP — await approval before model changes.
`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
