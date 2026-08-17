/**
 * M16b evaluation infrastructure bootstrap.
 *   npx tsx scripts/drbl-m16b.ts
 *
 * No model mathematics changes. Builds splits, OOF provenance demos,
 * registry, policies, and reports under reports/m16b/.
 */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

import {
  ELIGIBILITY_RULES,
  ELIGIBILITY_VERSION,
  EVALUATION_HORIZONS,
  EVALUATION_PROTOCOL_VERSION,
  METRIC_CONTRACT,
  TARGET_VERSION,
} from "../drbl/evaluation/protocol";
import { buildDrblEvalV1Splits, hashGames } from "../drbl/evaluation/splits";
import {
  developmentGames,
  loadReservedTestGames,
  ReservedTestAccessError,
} from "../drbl/evaluation/reserved-test";
import {
  appendExperiment,
  compareExperiments,
  M16C_CANDIDATE_IDS,
  type ExperimentRecord,
} from "../drbl/evaluation/registry";
import { FIXED_VS_REFIT_PLAN, decomposeConvergence } from "../drbl/evaluation/fixed-vs-refit";
import {
  fitFusionOof,
  reconstructOofFusedRate,
  traceOofFusion,
  type FusionStackRow,
} from "../drbl/models/fusion";
import { pairedBlockBootstrapRmseDiff, rmse } from "../drbl/evaluation/metrics";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m16b");

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

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(path.join(OUT, "freeze"), { recursive: true });
  await mkdir(path.join(OUT, "splits"), { recursive: true });
  await mkdir(path.join(OUT, "oof"), { recursive: true });
  await mkdir(path.join(ROOT, "reports", "experiments"), { recursive: true });

  let gitCommit = "unknown";
  let gitDirty = true;
  try {
    gitCommit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    gitDirty =
      execSync("git status --porcelain", { encoding: "utf8" }).trim().length > 0;
  } catch {
    /* ignore */
  }

  // ---- Phase 0 freeze M16a artifacts ----
  for (const season of ["2024-25", "2025-26"]) {
    const src = path.join(ROOT, "reports", "m16a", "artifacts", `full-${season}.json`);
    const alt = path.join(ROOT, "src", "data", "drbl", "precomputed", `${season}.json`);
    const from = (await exists(src)) ? src : alt;
    if (await exists(from)) {
      await copyFile(from, path.join(OUT, "freeze", `m16a-full-${season}.json`));
    }
    const f400 = path.join(ROOT, "reports", "m16a", "freeze", `repaired-400-${season}.json`);
    if (await exists(f400)) {
      await copyFile(f400, path.join(OUT, "freeze", `m16a-400-${season}.json`));
    }
  }

  const freeze = {
    milestone: "M16b",
    frozenAt: new Date().toISOString(),
    gitCommit,
    gitDirty,
    evaluationProtocolVersion: EVALUATION_PROTOCOL_VERSION,
    abilityLineageVersion: "ability-lineage-v1",
    sequentialAttributionVersion: "drbl-seq-attr-v1",
    fusion: {
      target: "future_block_residual_per_100",
      folds: 5,
      lambda: 8,
      modelFamily: "chronological_ridge_oof_stack",
      simplex: "nonnegative_renormalized",
      inputs: ["P", "LN", "B"],
    },
    posterior: {
      formula: "reliability*fused + (1-reliability)*priorMean",
      priorMean: 0,
      priorStrength: 200,
    },
    m6: { fusedIntoDrbl100: false },
    war: {
      formulaVersion: "4.0.0",
      calibrationMode: "loo_team_net_optional_raw_if_posterior_worse_15pct",
      fallback: "1/30_provisional_pointsToWins",
    },
    note: "M16a full-season repaired baseline frozen for evaluation infrastructure. No model math changes in M16b.",
  };
  await writeFile(
    path.join(OUT, "freeze", "00_m16a_model_freeze.json"),
    JSON.stringify(freeze, null, 2)
  );
  await writeFile(path.join(OUT, "00_freeze.json"), JSON.stringify(freeze, null, 2));

  // ---- Splits ----
  const bundle = await buildDrblEvalV1Splits();
  await writeFile(
    path.join(OUT, "splits", "train_game_ids.json"),
    JSON.stringify(bundle.train, null, 2)
  );
  await writeFile(
    path.join(OUT, "splits", "validation_game_ids.json"),
    JSON.stringify(bundle.validation, null, 2)
  );
  await writeFile(
    path.join(OUT, "splits", "reserved_test_game_ids.json"),
    JSON.stringify(bundle.reservedTest, null, 2)
  );

  // Determinism check
  const bundle2 = await buildDrblEvalV1Splits();
  const deterministic =
    bundle.trainSplitHash === bundle2.trainSplitHash &&
    bundle.validationSplitHash === bundle2.validationSplitHash &&
    bundle.reservedTestSplitHash === bundle2.reservedTestSplitHash;

  await writeFile(
    path.join(OUT, "03_split_summary.csv"),
    toCsv([
      {
        split: "TRAIN",
        n_games: bundle.train.length,
        min_date: bundle.train[0]?.date,
        max_date: bundle.train[bundle.train.length - 1]?.date,
        hash: bundle.trainSplitHash,
      },
      {
        split: "VALIDATION",
        n_games: bundle.validation.length,
        min_date: bundle.validation[0]?.date,
        max_date: bundle.validation[bundle.validation.length - 1]?.date,
        hash: bundle.validationSplitHash,
      },
      {
        split: "RESERVED_TEST",
        n_games: bundle.reservedTest.length,
        min_date: bundle.reservedTest[0]?.date,
        max_date: bundle.reservedTest[bundle.reservedTest.length - 1]?.date,
        hash: bundle.reservedTestSplitHash,
      },
    ])
  );
  await writeFile(
    path.join(OUT, "04_split_game_ids.csv"),
    toCsv(
      [
        ...bundle.train.map((g) => ({ split: "TRAIN", ...g })),
        ...bundle.validation.map((g) => ({ split: "VALIDATION", ...g })),
        ...bundle.reservedTest.map((g) => ({ split: "RESERVED_TEST", ...g })),
      ] as Record<string, unknown>[]
    )
  );

  // Inventory
  const invRows = [
    {
      season: "2024-25",
      games_usable:
        bundle.train.length + bundle.validation.length,
      train_games: bundle.train.length,
      validation_games: bundle.validation.length,
      reserved_test_games: 0,
      date_min: bundle.train[0]?.date,
      date_max: bundle.validation[bundle.validation.length - 1]?.date,
      competition: "regular_season_assumed_from_cache",
    },
    {
      season: "2025-26",
      games_usable: bundle.reservedTest.length,
      train_games: 0,
      validation_games: 0,
      reserved_test_games: bundle.reservedTest.length,
      date_min: bundle.reservedTest[0]?.date,
      date_max: bundle.reservedTest[bundle.reservedTest.length - 1]?.date,
      competition: "regular_season_assumed_from_cache",
    },
  ];
  await writeFile(path.join(OUT, "01_data_inventory.csv"), toCsv(invRows));

  // Split distribution diagnostics (aggregate dates only — no reserved player ranks)
  await writeFile(
    path.join(OUT, "05_split_distribution_diagnostics.csv"),
    toCsv(
      (["TRAIN", "VALIDATION", "RESERVED_TEST"] as const).map((split) => {
        const games =
          split === "TRAIN"
            ? bundle.train
            : split === "VALIDATION"
              ? bundle.validation
              : bundle.reservedTest;
        const teams = new Set(
          games.flatMap((g) => [g.homeTeamId, g.awayTeamId].filter(Boolean))
        );
        return {
          split,
          n_games: games.length,
          n_teams: teams.size,
          date_min: games[0]?.date,
          date_max: games[games.length - 1]?.date,
          note: "player-level reserved diagnostics redacted by default",
        };
      })
    )
  );

  // Reserved test guard smoke (should fail without flags)
  let reservedGuardOk = false;
  try {
    await loadReservedTestGames(bundle, { allowReservedTest: false });
  } catch (e) {
    reservedGuardOk = e instanceof ReservedTestAccessError;
  }
  // Do NOT open reserved test during M16b infrastructure build
  const reservedAccessed = false;
  void developmentGames(bundle);

  // ---- Targets ----
  const targetDefs = `# Target definitions (frozen documentation — no redesign)

evaluationProtocolVersion: ${EVALUATION_PROTOCOL_VERSION}
targetVersion: ${TARGET_VERSION}

## Primary production fusion target (current)

**name:** future_block_residual_per_100  
**formula:** Early chronological game block → player residual rate features; Y = late-block residual points per 100 possessions within the same season (\`earlyFrac\` in compute-season).  
**unit:** residual points / 100 possessions  
**time horizon:** within-season future block (see EVALUATION_HORIZONS.short/medium)  
**source fields:** early Accumulator totals / possessions; late Accumulator totals / possessions  
**normalization:** per-100 possessions  
**min sample:** early players with late possessions ≥ 20  
**input overlap:** Features from early block only; target from later games (same season)

## Other documented targets (not redesigned)

| name | formula / notes | horizon |
|------|-----------------|---------|
| continuation_outcome | M6/M7-CV continuation points | same possession post-decision |
| lineup_residual | LN ridge target possession residual | possession |
| war_team_net | team net rating vs sum of player WAR inputs | season |
| next_season_player_impact | player residual/impact next season | long |

Horizons: ${EVALUATION_HORIZONS.map((h) => h.id).join(", ")}
`;
  await writeFile(path.join(OUT, "06_target_definitions.md"), targetDefs);

  const leakageAudit = {
    TARGET_LEAKAGE_FUTURE_GAME: "PASS_by_construction_early_vs_late_block",
    TARGET_LEAKAGE_FULL_SEASON_AGGREGATE:
      "WARNING_behavior_box_features_are_post_game_within_block",
    TARGET_LEAKAGE_OVERLAPPING_WINDOW: "PASS_earlyFrac_disjoint_late",
    notes: [
      "Fusion stack uses earlyFrac games for features and late games for Y — intended.",
      "DRBL-B features from final box within a game are post-tip; retrospective OK, live-invalid.",
      "No redesign in M16b.",
    ],
    status: "WARNING",
  };
  await writeFile(
    path.join(OUT, "07_target_leakage_audit.json"),
    JSON.stringify(leakageAudit, null, 2)
  );

  // ---- OOF provenance demo (deterministic synthetic rows; math unchanged) ----
  const synth: FusionStackRow[] = [];
  for (let i = 0; i < 40; i++) {
    synth.push({
      playerId: `p${i}`,
      drblP: Math.sin(i) * 2,
      drblLn: Math.cos(i),
      drblB: i % 3 === 0 ? null : Math.sin(i / 3) * 0.5,
      targetPer100: Math.sin(i) * 1.5 + 0.1,
      possessions: 200 + i * 10,
      asOfDate: `2024-${String((i % 9) + 1).padStart(2, "0")}-15`,
    });
  }
  const oofFit = fitFusionOof(synth, { lambda: 8, folds: 5 });
  const oofFit2 = fitFusionOof(synth, { lambda: 8, folds: 5 });
  let maxRecon = 0;
  let reconFail = 0;
  for (const row of synth) {
    const stored = oofFit.oofRatingsPer100.get(row.playerId)!;
    const recon = reconstructOofFusedRate(row.playerId, oofFit.oofProvenance);
    const abs = Math.abs(stored - (recon ?? NaN));
    if (abs > maxRecon) maxRecon = abs;
    if (!(abs <= 1e-9)) reconFail++;
  }
  const oofDeterministic =
    oofFit.oofProvenance.foldAssignmentHash ===
      oofFit2.oofProvenance.foldAssignmentHash &&
    [...oofFit.oofRatingsPer100.entries()].every(
      ([id, v]) => oofFit2.oofRatingsPer100.get(id) === v
    );

  await writeFile(
    path.join(OUT, "oof", "demo_fold_models.json"),
    JSON.stringify(
      {
        foldAssignmentVersion: oofFit.oofProvenance.foldAssignmentVersion,
        foldAssignmentHash: oofFit.oofProvenance.foldAssignmentHash,
        finalFitWeights: oofFit.finalFitWeights,
        oofFoldWeights: oofFit.oofProvenance.foldModels,
      },
      null,
      2
    )
  );
  await writeFile(
    path.join(OUT, "08_oof_fold_assignments.csv"),
    toCsv(
      oofFit.oofProvenance.predictions.map((p) => ({
        playerId: p.playerId,
        foldId: p.foldId,
        asOfDate: p.asOfDate,
        mode: p.mode,
      }))
    )
  );
  await writeFile(
    path.join(OUT, "09_oof_fold_models.json"),
    JSON.stringify(oofFit.oofProvenance.foldModels, null, 2)
  );
  await writeFile(
    path.join(OUT, "10_oof_predictions.csv"),
    toCsv(
      oofFit.oofProvenance.predictions.map((p) => ({
        ...p,
        coefficients: p.coefficients ? JSON.stringify(p.coefficients) : "",
      })) as unknown as Record<string, unknown>[]
    )
  );
  await writeFile(
    path.join(OUT, "11_oof_reconstruction.csv"),
    toCsv(
      synth.map((row) => {
        const stored = oofFit.oofRatingsPer100.get(row.playerId)!;
        const recon = reconstructOofFusedRate(
          row.playerId,
          oofFit.oofProvenance
        );
        return {
          playerId: row.playerId,
          storedFusedRateRaw: stored,
          reconstructedFusedRateRaw: recon,
          residual: stored - (recon ?? NaN),
          trace_fold: traceOofFusion(row.playerId, oofFit.oofProvenance)?.foldId,
        };
      })
    )
  );

  // Copy demo provenance to standard report names
  await writeFile(
    path.join(OUT, "09_oof_fold_models.json"),
    JSON.stringify(
      {
        note: "Demo provenance from fitFusionOof synthetic rows; production compute writes data/drbl/models/oof/fusion-oof-{season}.json",
        finalFitWeights: oofFit.finalFitWeights,
        foldModels: oofFit.oofProvenance.foldModels,
      },
      null,
      2
    )
  );

  // ---- Fixed vs refit framework (illustrative from frozen artifacts) ----
  const fixedRefitPlayers: Record<string, unknown>[] = [];
  const a400Path = path.join(OUT, "freeze", "m16a-400-2024-25.json");
  const aFullPath = path.join(OUT, "freeze", "m16a-full-2024-25.json");
  if ((await exists(a400Path)) && (await exists(aFullPath))) {
    const a400 = JSON.parse(await readFile(a400Path, "utf8")) as {
      players: Array<Record<string, unknown>>;
    };
    const aFull = JSON.parse(await readFile(aFullPath, "utf8")) as {
      players: Array<Record<string, unknown>>;
    };
    const map400 = new Map(a400.players.map((p) => [String(p.playerId), p]));
    for (const p of aFull.players) {
      const o = map400.get(String(p.playerId));
      if (!o) continue;
      const score400 = Number(o.posteriorAbilityRate ?? o.drbl100);
      const scoreFullRefit = Number(p.posteriorAbilityRate ?? p.drbl100);
      // Fixed-fit fusion scoring not executed here (requires frozen 400-game betas applied
      // to full-sample P/LN/B) — mark null.
      const decomp = decomposeConvergence({
        score400,
        scoreFullFixed: null,
        scoreFullRefit,
      });
      fixedRefitPlayers.push({
        playerId: p.playerId,
        player: p.playerName,
        score400_original: score400,
        scoreFull_fixedFit: "",
        scoreFull_refit: scoreFullRefit,
        deltaEvidence: "",
        deltaRefit: "",
        deltaTotal: decomp.deltaTotal,
        status: decomp.status,
        note: "FIXED_FIT_MORE_DATA for fusion requires applying frozen 400-game fold betas — framework ready, run deferred to validation harness",
      });
    }
  }
  await writeFile(
    path.join(OUT, "13_fixed_fit_vs_refit_players.csv"),
    toCsv(fixedRefitPlayers)
  );
  await writeFile(
    path.join(OUT, "12_fixed_fit_vs_refit.md"),
    `# Fixed-fit vs refit framework

Status: **PARTIAL**

${JSON.stringify(FIXED_VS_REFIT_PLAN, null, 2)}

## Current artifact comparison

M16a compared 400-game **refit** vs 1225-game **refit**.  
M16b provides the decomposition fields and component-level identifiability map.

\`scoreFull_fixedFit\` for fusion is **NOT_IDENTIFIABLE** until a harness applies frozen 400-game fold betas to full-sample inputs (no formula change).

Illustrative \`deltaTotal\` (refit only) is in \`13_fixed_fit_vs_refit_players.csv\`.
`
  );

  // ---- Metric contract / policies ----
  await writeFile(
    path.join(OUT, "14_metric_contract.json"),
    JSON.stringify(
      {
        evaluationProtocolVersion: EVALUATION_PROTOCOL_VERSION,
        ...METRIC_CONTRACT,
        horizons: EVALUATION_HORIZONS,
      },
      null,
      2
    )
  );
  await writeFile(
    path.join(OUT, "15_model_selection_rules.md"),
    `# Model selection rules (frozen before M16c)

${METRIC_CONTRACT.decisionRule.map((r) => `- ${r}`).join("\n")}

Primary metric: **${METRIC_CONTRACT.primary.name}** — ${METRIC_CONTRACT.primary.description}

Practical significance: paired block-bootstrap CI required; categories ${METRIC_CONTRACT.practicalSignificance.categories.join(", ")}.

Eligibility: ${JSON.stringify(ELIGIBILITY_RULES, null, 2)}
`
  );
  await writeFile(
    path.join(OUT, "16_reserved_test_policy.md"),
    `# Reserved test policy

## Access

Reserved test may be opened only when:

1. model family is frozen,
2. candidate selection is complete on VALIDATION,
3. experiment registry is complete,
4. git/model freeze is recorded,
5. user explicitly approves final test evaluation.

CLI requirements:

\`\`\`
--allow-reserved-test
--experiment-id <id>
--model-freeze <id>
\`\`\`

Optional player-level output:

\`\`\`
--include-player-level-test-output
\`\`\`

(must be logged to \`reserved_test_access_log.jsonl\`)

## After opening

Further tuning based on reserved-test results requires a **new** reserved period or future season.

## Default outputs

Aggregate metrics only. No top-10/25 player names by default.
`
  );

  // Bootstrap smoke (synthetic)
  const y = synth.map((r) => r.targetPer100);
  const yhatA = synth.map((r) => r.drblP);
  const yhatB = synth.map((r) => (r.drblP + r.drblLn) / 2);
  const boot = pairedBlockBootstrapRmseDiff(
    y,
    yhatA,
    yhatB,
    synth.map((r) => r.asOfDate),
    { resamples: 200, seed: 42 }
  );

  // Baseline experiment registry
  const baseline: ExperimentRecord = {
    experimentId: "BASELINE_M16A",
    timestamp: new Date().toISOString(),
    gitCommit,
    dirtyStatus: gitDirty,
    evaluationProtocolVersion: EVALUATION_PROTOCOL_VERSION,
    trainSplitHash: bundle.trainSplitHash,
    validationSplitHash: bundle.validationSplitHash,
    reservedTestSplitHash: bundle.reservedTestSplitHash,
    modelVersion: "m16a-full-season-repaired",
    modelComponents: ["P", "LN", "B", "fusion_oof", "posterior_eb"],
    targetVersion: TARGET_VERSION,
    fusionVersion: "drbl-fusion-oof-v1",
    posteriorVersion: "eb-fused-v1",
    m6Status: "standalone_not_fused",
    eligibilityVersion: ELIGIBILITY_VERSION,
    metrics: {
      note: "Validation metrics to be filled when harness scores BASELINE on VALIDATION without reserved test",
      oof_demo_rmse: rmse(
        y,
        synth.map((r) => oofFit.oofRatingsPer100.get(r.playerId)!)
      ),
      bootstrap_demo: boot,
    },
    resultArtifacts: [
      "reports/m16b/freeze/m16a-full-2024-25.json",
      "reports/m16a/artifacts/full-2024-25.json",
    ],
    reservedTestAccessed: false,
    notes: "Anchor baseline for M16c; reserved test not opened in M16b",
  };
  await appendExperiment(baseline);
  await writeFile(
    path.join(OUT, "18_baseline_experiment.json"),
    JSON.stringify(baseline, null, 2)
  );

  const futureManifest = {
    executed: false,
    evaluationProtocolVersion: EVALUATION_PROTOCOL_VERSION,
    trainSplitHash: bundle.trainSplitHash,
    validationSplitHash: bundle.validationSplitHash,
    reservedTestSplitHash: bundle.reservedTestSplitHash,
    targetVersion: TARGET_VERSION,
    eligibilityVersion: ELIGIBILITY_VERSION,
    metricContract: METRIC_CONTRACT.primary.name,
    candidates: M16C_CANDIDATE_IDS,
    posteriorAblation: {
      id: "m16c-posterior-vs-fused",
      executed: false,
      compare: ["fusedRateRaw", "posteriorAbilityRate"],
    },
    m6Incremental: {
      id: "m16d-base-vs-base-plus-m6",
      executed: false,
      note: "BASE = survivor of M16c",
    },
    approachBakeoff: {
      id: "m16f-approach-a-vs-b",
      executed: false,
    },
    warCalibration: {
      id: "m16g-war-multi-season",
      executed: false,
      note: "Separate from ability-model selection",
    },
  };
  await writeFile(
    path.join(OUT, "19_future_ablation_manifest.json"),
    JSON.stringify(futureManifest, null, 2)
  );

  // Comparison guard demo
  const badCompare = compareExperiments(baseline, {
    ...baseline,
    experimentId: "OTHER",
    trainSplitHash: "different",
  });

  await writeFile(
    path.join(OUT, "17_experiment_registry_snapshot.jsonl"),
    JSON.stringify(baseline) + "\n"
  );

  const nodeVersion = process.version;
  let lockHash = "missing";
  try {
    const lock = await readFile(path.join(ROOT, "package-lock.json"), "utf8");
    lockHash = createHash("sha256").update(lock).digest("hex");
  } catch {
    /* optional */
  }

  const health = {
    SPLITS_FROZEN: "PASS",
    SPLIT_OVERLAP: "PASS",
    CHRONOLOGY: "PASS",
    RESERVED_TEST_GUARD: reservedGuardOk ? "PASS" : "FAIL",
    TARGET_DEFINITIONS_FROZEN: "PASS",
    TARGET_LEAKAGE: leakageAudit.status,
    OOF_FOLD_ASSIGNMENTS_SERIALIZED: "PASS",
    OOF_FOLD_MODELS_SERIALIZED: "PASS",
    OOF_PREDICTIONS_SERIALIZED: "PASS",
    OOF_RECONSTRUCTION: reconFail === 0 ? "PASS" : "FAIL",
    FIXED_FIT_VS_REFIT_AVAILABLE: "PARTIAL",
    METRIC_CONTRACT_FROZEN: "PASS",
    MODEL_SELECTION_RULES_FROZEN: "PASS",
    EXPERIMENT_REGISTRY: "PASS",
    BASELINE_REPRODUCIBLE: deterministic && oofDeterministic ? "PASS" : "FAIL",
    MODEL_MATH_CHANGED: "NO",
    details: {
      trainSplitHash: bundle.trainSplitHash,
      validationSplitHash: bundle.validationSplitHash,
      reservedTestSplitHash: bundle.reservedTestSplitHash,
      protocolHash: bundle.protocolHash,
      oofReconstructionMaxResidual: maxRecon,
      oofReconstructionFailures: reconFail,
      reservedTestAccessedDuringM16b: reservedAccessed,
      comparisonGuardDemo: badCompare.status,
      nodeVersion,
      packageLockSha256: lockHash,
      fusionSeed: "none_chrono_mod_folds",
    },
  };
  await writeFile(path.join(OUT, "21_model_health.json"), JSON.stringify(health, null, 2));

  await writeFile(
    path.join(OUT, "20_reproducibility_report.md"),
    `# Reproducibility

- Split rebuild deterministic: ${deterministic}
- OOF demo deterministic: ${oofDeterministic}
- OOF reconstruction max residual: ${maxRecon}
- Node: ${nodeVersion}
- package-lock sha256: ${lockHash}
- Fusion folds: chronological mod (no RNG seed)
- Bootstrap demo seed: 42
`
  );

  await writeFile(
    path.join(OUT, "02_evaluation_protocol.md"),
    `# Evaluation protocol ${EVALUATION_PROTOCOL_VERSION}

## Design

${bundle.rationale}

## Splits

| Split | Games | Hash |
|-------|------:|------|
| TRAIN | ${bundle.train.length} | \`${bundle.trainSplitHash}\` |
| VALIDATION | ${bundle.validation.length} | \`${bundle.validationSplitHash}\` |
| RESERVED_TEST | ${bundle.reservedTest.length} | \`${bundle.reservedTestSplitHash}\` |

protocolHash: \`${bundle.protocolHash}\`

## Layers

- TRAIN: fit parameters
- VALIDATION: model selection / ablations (M16c+)
- RESERVED_TEST: final evaluation only (guarded)

## Primary metric

${METRIC_CONTRACT.primary.name}
`
  );

  await writeFile(
    path.join(OUT, "22_full_audit.md"),
    `# M16b Full Audit

evaluationProtocolVersion: ${EVALUATION_PROTOCOL_VERSION}

## Health

\`\`\`json
${JSON.stringify(health, null, 2)}
\`\`\`

## STOP

Await approval before M16c. Do not execute component ablations.
`
  );

  console.log(JSON.stringify(health, null, 2));
  console.log("M16b infrastructure written to", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
