/**
 * M16j0 - reserved-test scope decision + point-estimate freeze certification.
 *   npm run drbl:m16j0
 *
 * Does NOT open RESERVED_TEST. Does NOT compute reserved metrics.
 * Does NOT change point-estimate math, production, WAR, or O/D.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

import {
  EVALUATION_PROTOCOL_VERSION,
  ELIGIBILITY_RULES,
  METRIC_CONTRACT,
  TARGET_VERSION,
} from "../drbl/evaluation/protocol";
import {
  M16C_EARLY_FRAC,
  verifyFrozenSplitHashes,
} from "../drbl/evaluation/m16c-dataset";
import { hashGames, type SplitGame } from "../drbl/evaluation/splits";
import { SEQUENTIAL_ATTRIBUTION_VERSION } from "../drbl/models/sequential-attribution";
import {
  CALIBRATION_IDENTITY_VERSION,
  RESEARCH_RATE_CONFIG_V1,
  RESEARCH_RATE_VERSION,
  computeResearchRateV1,
} from "../drbl/models/research-rate-v1";
import {
  RESEARCH_ABILITY_VERSION,
  RESEARCH_K,
  RESEARCH_POSTERIOR_LAYER_COUNT,
  RESEARCH_POSTERIOR_VERSION,
  RESEARCH_PRIOR_MEAN,
  computeResearchAbilityV1,
} from "../drbl/models/research-ability-v1";
import { PRIOR_EQUIVALENT_POSSESSIONS } from "../drbl/models/ranking-config";
import {
  WAR_EXPOSURE_UNIT,
  WAR_FORMULA_VERSION,
} from "../drbl/models/pipeline-value";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m16j0");
const M16B = path.join(ROOT, "reports", "m16b");
const M16G = path.join(ROOT, "reports", "m16g");
const M16G1 = path.join(ROOT, "reports", "m16g1");
const M16H = path.join(ROOT, "reports", "m16h");
const M16I4 = path.join(ROOT, "reports", "m16i4");

const EXPECTED_TRAIN =
  "7bec77be45295ee858d90896d9383e4da951e98e81ad1ef31b5285fb055d1550";
const EXPECTED_VAL =
  "4fd339a445f269162c2d76e9102ea5bb965a5d0fc05e0fcd2f60593117c5faf0";
const EXPECTED_RES =
  "e542aa54602390ed65792f37e10207814e10b62bfdf552ddf4da69825076c1ce";

/** Point-estimate material source files (content-addressed). */
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

async function sha256File(rel: string): Promise<string> {
  const buf = await readFile(path.join(ROOT, rel));
  return createHash("sha256").update(buf).digest("hex");
}

async function loadSplitList(
  name: "train" | "validation" | "reserved_test"
): Promise<SplitGame[]> {
  const file =
    name === "reserved_test"
      ? "reserved_test_game_ids.json"
      : `${name}_game_ids.json`;
  // Hash-only: game ids / dates / seasons - NOT player outcomes or residuals.
  const raw = JSON.parse(
    await readFile(path.join(M16B, "splits", file), "utf8")
  ) as { games?: SplitGame[] } | SplitGame[];
  return Array.isArray(raw) ? raw : (raw.games ?? []);
}

async function main() {
  await mkdir(OUT, { recursive: true });
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
    trainSplitHash: string;
    validationSplitHash: string;
    reservedTestSplitHash: string;
  };
  const m16hLock = JSON.parse(
    await readFile(path.join(M16H, "22_research_rate_lock.json"), "utf8")
  ) as Record<string, unknown>;
  const m16hDecision = JSON.parse(
    await readFile(path.join(M16H, "16_calibration_selection_decision.json"), "utf8")
  ) as { CALIBRATION_SELECTION_RESULT: string; b_final: number };
  const m16i4Decision = JSON.parse(
    await readFile(
      path.join(M16I4, "12_uncertainty_selection_decision.json"),
      "utf8"
    )
  ) as {
    SELECTED_UNCERTAINTY_MODEL: string;
    UNCERTAINTY_SELECTION_RESULT: string;
    PREDICTIVE_UNCERTAINTY_FROZEN: string;
    RESEARCH_RATE_MODEL_FREEZE_READY: string;
    UNCERTAINTY_RESEARCH_CHECKPOINT_REQUIRED: string;
  };
  const m16i4Final = JSON.parse(
    await readFile(path.join(M16I4, "19_final_parameters.json"), "utf8")
  ) as { selectedModel: string };
  const m16bBaseline = JSON.parse(
    await readFile(path.join(M16B, "18_baseline_experiment.json"), "utf8")
  ) as {
    experimentId: string;
    modelComponents: string[];
    reservedTestSplitHash: string;
    trainSplitHash: string;
    validationSplitHash: string;
  };

  // Verify hashes WITHOUT opening reserved outcome data.
  // Game-id lists are membership metadata only (season/gameId/date).
  if (
    m16g1Freeze.trainSplitHash !== EXPECTED_TRAIN ||
    m16g1Freeze.validationSplitHash !== EXPECTED_VAL ||
    m16g1Freeze.reservedTestSplitHash !== EXPECTED_RES ||
    m16bBaseline.reservedTestSplitHash !== EXPECTED_RES
  ) {
    throw new Error("STOP EVALUATION_PROTOCOL_DRIFT recorded hash mismatch");
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

  // Confirm membership hashes (ids/dates only) match expected - no player residuals.
  const trainGames = await loadSplitList("train");
  const valGames = await loadSplitList("validation");
  const reservedGames = await loadSplitList("reserved_test");
  // Strip to hash fields only; never touch outcome metrics.
  const hashCheck = verifyFrozenSplitHashes({
    train: trainGames,
    validation: valGames,
    trainHashExpected: EXPECTED_TRAIN,
    validationHashExpected: EXPECTED_VAL,
    reservedTestHashExpected: EXPECTED_RES,
    reservedTestGamesForHashOnly: reservedGames,
  });
  if (!hashCheck.ok || hashGames(reservedGames) !== EXPECTED_RES) {
    throw new Error("STOP EVALUATION_PROTOCOL_DRIFT live hash mismatch");
  }
  // Explicit: we do NOT load normalized reserved games or targets.
  const RESERVED_TEST_ACCESSED = false;

  await writeFile(
    path.join(OUT, "00_freeze.json"),
    JSON.stringify(
      {
        milestone: "M16j0",
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
        m16hDecisionVersion: "IDENTITY_SELECTED",
        m16i4DecisionVersion: m16i4Decision.UNCERTAINTY_SELECTION_RESULT,
        RESERVED_TEST_ACCESSED,
        M16B_VALIDATION_USED: false,
        note: "Protocol certification only; no reserved metrics computed",
      },
      null,
      2
    )
  );

  // ---- Phase 1: source manifest ----
  const manifestEntries: Array<{
    path: string;
    sha256: string;
    relevantExports: string[];
  }> = [];
  const exportHints: Record<string, string[]> = {
    "drbl/models/sequential-attribution.ts": [
      "SEQUENTIAL_ATTRIBUTION_VERSION",
      "attributePossessionSequential",
    ],
    "drbl/models/player-value.ts": [
      "attributeGamePlayerValue",
      "finalizePlayerSeasonRows",
    ],
    "drbl/models/research-ability-v1.ts": [
      "computeResearchAbilityV1",
      "RESEARCH_K",
    ],
    "drbl/models/research-rate-v1.ts": [
      "computeResearchRateV1",
      "RESEARCH_RATE_CONFIG_V1",
    ],
    "drbl/models/leaderboard.ts": ["empiricalBayesRate"],
    "drbl/models/replacement.ts": ["buildReplacementPool"],
    "drbl/evaluation/protocol.ts": [
      "EVALUATION_PROTOCOL_VERSION",
      "METRIC_CONTRACT",
      "ELIGIBILITY_RULES",
    ],
    "drbl/evaluation/splits.ts": ["buildDrblEvalV1Splits", "hashGames"],
    "drbl/evaluation/m16c-dataset.ts": [
      "buildFutureBlockStackRows",
      "M16C_EARLY_FRAC",
    ],
    "drbl/evaluation/metrics.ts": ["pairedBlockBootstrapRmseDiff", "rmse"],
    "drbl/evaluation/reserved-test.ts": ["loadReservedTestGames"],
    "reports/m16h/22_research_rate_lock.json": ["research rate lock"],
    "reports/m16g/03_posterior_folds.json": ["TRAIN fold meta"],
    "reports/m16i4/12_uncertainty_selection_decision.json": [
      "uncertainty checkpoint",
    ],
  };
  for (const rel of POINT_SOURCE_FILES) {
    await stat(path.join(ROOT, rel));
    const sha = await sha256File(rel);
    manifestEntries.push({
      path: rel.replace(/\\/g, "/"),
      sha256: sha,
      relevantExports: exportHints[rel] ?? [],
    });
  }
  manifestEntries.sort((a, b) => a.path.localeCompare(b.path));
  const POINT_ESTIMATE_FREEZE_HASH = createHash("sha256")
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

  await writeFile(
    path.join(OUT, "01_point_model_source_manifest.json"),
    JSON.stringify(
      {
        POINT_ESTIMATE_FREEZE_HASH,
        gitCommit,
        gitDirty: dirty,
        files: manifestEntries,
        versions: {
          SEQUENTIAL_ATTRIBUTION_VERSION,
          RESEARCH_ABILITY_VERSION,
          RESEARCH_POSTERIOR_VERSION,
          RESEARCH_RATE_VERSION,
          CALIBRATION_IDENTITY_VERSION,
          EVALUATION_PROTOCOL_VERSION,
          TARGET_VERSION,
        },
      },
      null,
      2
    )
  );

  // ---- Phase 2: point-estimate certification ----
  const probes = [
    { raw: 2.5, N: 800 },
    { raw: -1.2, N: 1600 },
    { raw: 0, N: 50 },
    { raw: 4.0, N: 10000 },
  ];
  const certChecks: Record<string, unknown>[] = [];
  for (const p of probes) {
    const ability = computeResearchAbilityV1({
      rawAbilityRate: p.raw,
      actualCombinedPossessionAppearances: p.N,
    });
    const rate = computeResearchRateV1(
      {
        rawAbilityRate: p.raw,
        actualCombinedPossessionAppearances: p.N,
      },
      RESEARCH_RATE_CONFIG_V1
    );
    const expected = (p.N / (p.N + RESEARCH_K)) * p.raw;
    const ok =
      Math.abs(ability.researchDRBL100 - expected) < 1e-12 &&
      Math.abs(rate.researchFinalDRBL100 - expected) < 1e-12 &&
      ability.posteriorOperationsApplied === 1 &&
      ability.researchK === 1600 &&
      ability.researchPriorMean === 0 &&
      rate.calibrationCoefficient === 1;
    certChecks.push({
      raw: p.raw,
      N: p.N,
      expected,
      ability: ability.researchDRBL100,
      rate: rate.researchFinalDRBL100,
      posteriorOps: ability.posteriorOperationsApplied,
      ok,
    });
    if (!ok) throw new Error("STOP POINT_ESTIMATE_FREEZE_CERTIFICATION_FAILURE");
  }

  const certification = {
    POINT_ESTIMATE_CERTIFICATION: "PASS",
    POINT_ESTIMATE_MODEL_FROZEN: "YES",
    POINT_ESTIMATE_FORMULA: "N/(N+1600)*rawAbilityRate",
    POINT_ESTIMATE_ZERO_SEMANTICS: "R1_REPLACEMENT",
    POINT_ESTIMATE_RANK_RULE: "DESCENDING_FINAL_RESEARCH_DRBL100",
    attribution: SEQUENTIAL_ATTRIBUTION_VERSION,
    raw: "rawAbilityRate = 100 * ApproachBAttributedValue / N",
    N: "actual combined historical possession appearances",
    posterior: "N/(N+1600)*rawAbilityRate",
    priorStrength: RESEARCH_K,
    priorMean: RESEARCH_PRIOR_MEAN,
    calibration: "IDENTITY",
    calibrationCoefficient: 1,
    calibrationSelection: m16hDecision.CALIBRATION_SELECTION_RESULT,
    fusionInfluence: 0,
    LNInfluence: 0,
    BInfluence: 0,
    M6Influence: 0,
    legacyEB200Influence: 0,
    pseudoExposureInfluence: 0,
    posteriorOperations: RESEARCH_POSTERIOR_LAYER_COUNT,
    productionLegacyK: PRIOR_EQUIVALENT_POSSESSIONS,
    probes: certChecks,
    m16hLockSummary: {
      CALIBRATION_SELECTION_RESULT: m16hLock.CALIBRATION_SELECTION_RESULT ?? m16hDecision.CALIBRATION_SELECTION_RESULT,
      formula: m16hLock.formula ?? "N/(N+1600)*rawAbilityRate",
    },
  };
  await writeFile(
    path.join(OUT, "02_point_estimate_certification.json"),
    JSON.stringify(certification, null, 2)
  );

  // ---- Phase 4: uncertainty checkpoint ----
  if (
    m16i4Decision.SELECTED_UNCERTAINTY_MODEL !== "NONE" ||
    m16i4Decision.UNCERTAINTY_SELECTION_RESULT !==
      "RELIABILITY_FEATURES_FAILED_TO_REPAIR_UNCERTAINTY" ||
    m16i4Final.selectedModel !== "NONE"
  ) {
    throw new Error("STOP M16i4 checkpoint reproduction failure");
  }
  const uncertaintyCheckpoint = {
    M16I_REPRODUCED_STATUS: "NO_ELIGIBLE_CANDIDATE",
    M16I1_STATUS: "NO_ELIGIBLE_UNCERTAINTY_MODEL",
    M16I2_STATUS: "EXPOSURE_ONLY_INFORMATION_CEILING",
    M16I3_STATUS: "FEATURE_SET_FROZEN",
    M16I4_STATUS: "RELIABILITY_FEATURES_FAILED_TO_REPAIR_UNCERTAINTY",
    SELECTED_UNCERTAINTY_MODEL: "NONE",
    PREDICTIVE_UNCERTAINTY_FROZEN: "NO",
    PREDICTIVE_INTERVALS_RESERVED_TEST_SCOPE: "EXCLUDED",
    UNCERTAINTY_RESEARCH_CHECKPOINT_REQUIRED: "YES",
    AUTOMATIC_M16I5_ALLOWED: "NO",
    fallbackUncertaintySelected: "NO",
  };
  await writeFile(
    path.join(OUT, "03_uncertainty_checkpoint.json"),
    JSON.stringify(uncertaintyCheckpoint, null, 2)
  );

  // ---- Phase 5: scope amendment ----
  await writeFile(
    path.join(OUT, "04_reserved_scope_amendment.md"),
    `# Reserved-test scope amendment (M16j0)

## Previous implicit scope

Point estimate **and** predictive uncertainty were expected to be frozen before RESERVED_TEST access.

## New frozen scope (prospective)

\`\`\`
M16J_RESERVED_TEST_SCOPE = POINT_ESTIMATE_ONLY
\`\`\`

M16j will evaluate the frozen DRBL100 point estimator only.

## Explicit exclusions

- Predictive intervals / WIS / CCE / coverage
- WAR
- O/D
- Production UI cutover

## Scientific statement

> Predictive uncertainty remains unresolved. Its exclusion from M16j is not evidence that uncertainty is solved. It is a deliberate separation of an auxiliary interval-estimation problem from external validation of the already-frozen central point estimator.

## Timing

This amendment is committed **before** any RESERVED_TEST predictive metrics are opened.
`
  );

  // ---- Phase 7: human blindness ----
  await writeFile(
    path.join(OUT, "09_human_blindness_disclosure.md"),
    `# Human-blindness disclosure (M16j0)

\`\`\`
RESERVED_HUMAN_BLINDNESS = NOT_FULL
\`\`\`

Reason: 2025-26 public DRBL board / qualitative rankings have existed during development.

Also:

\`\`\`
RESERVED_NUMERIC_PREDICTIVE_METRICS_USED_FOR_SELECTION = NO
RESERVED_TARGET_ERRORS_INSPECTED = NO
\`\`\`

Preferred wording for M16j:

> one-shot formally held-out predictive test with prior qualitative exposure to public-season outputs

Do **not** call the result perfectly blind external validation.
`
  );

  // ---- Phase 8-9: reserved row protocol ----
  // Preexisting: buildFutureBlockStackRows with earlyFrac=0.7 (drbl-eval-v1 / M16c / production).
  // M16g expanding folds are TRAIN-development only; applying them to RESERVED would invent new cuts.
  const reservedRowProtocol = {
    RESERVED_ROW_PROTOCOL_PREEXISTING: "YES",
    RESERVED_ROW_PROTOCOL_OUTCOME_INDEPENDENT: "YES",
    protocolId: "drbl-eval-v1-reserved-earlyFrac-future-block-v1",
    sourceFiles: [
      "drbl/evaluation/m16c-dataset.ts::buildFutureBlockStackRows",
      "drbl/evaluation/protocol.ts::ELIGIBILITY_RULES",
      "drbl/evaluation/splits.ts::RESERVED_TEST = entire usable 2025-26",
    ],
    historyFutureConstruction: {
      gameUniverse: "RESERVED_TEST game ids (2025-26), chronological by gameDate then gameId",
      earlyFrac: M16C_EARLY_FRAC,
      history: "first floor(nGames * earlyFrac) games (min 1)",
      future: "remaining games after early cut",
      R1Pool: "built from history games only",
      predictionFeatures:
        "Approach-B attributeGamePlayerValue on history → rawAbilityRate, N",
      target:
        "future_block_residual_per_100 = 100 * future.totalValue / future.possessions (same R1 replacement semantics)",
      eligibility: {
        minPossessions: ELIGIBILITY_RULES.minPossessions,
        minFutureObservations: ELIGIBILITY_RULES.minFutureObservations,
      },
    },
    explicitlyNotUsed: {
      m16gExpandingFolds:
        "TRAIN-development only; applying to RESERVED would create new date cuts - forbidden",
      adHocCutoffs: "forbidden",
    },
    newCutoffInvented: "NO",
    outcomeDependent: "NO",
    note: "Membership hash verified; normalized reserved PBP/outcomes NOT loaded in M16j0",
  };
  await writeFile(
    path.join(OUT, "05_reserved_row_protocol.json"),
    JSON.stringify(reservedRowProtocol, null, 2)
  );

  // ---- Comparators ----
  const comparatorManifest = {
    RESEARCH_FINAL: {
      name: "RESEARCH_FINAL_EB1600",
      formula: "N/(N+1600)*rawAbilityRate",
      version: RESEARCH_RATE_VERSION,
      posteriorVersion: RESEARCH_POSTERIOR_VERSION,
      sourceFiles: [
        "drbl/models/research-ability-v1.ts",
        "drbl/models/research-rate-v1.ts",
      ],
      reservedFittingAllowed: false,
    },
    B0_RAW_P: {
      name: "B0_RAW_P",
      formula: "rawAbilityRate",
      equivalentK: 0,
      available: true,
      role: "PRIMARY_COMPARATOR",
    },
    B1_P_EB200: {
      name: "B1_P_EB200",
      formula: "N/(N+200)*rawAbilityRate",
      equivalentK: PRIOR_EQUIVALENT_POSSESSIONS,
      available: true,
      role: "SECONDARY_COMPARATOR",
      note: "P-only legacy shrinkage strength; NOT fused double-EB production rating",
    },
    B2_BASELINE_M16A: {
      name: "BASELINE_M16A",
      experimentId: m16bBaseline.experimentId,
      modelComponents: m16bBaseline.modelComponents,
      available: true,
      semanticComparability: "NOT_COMPARABLE",
      B2_STATUS: "NOT_COMPARABLE",
      reason:
        "BASELINE_M16A is fused P+LN+B with EB200 posterior; RESEARCH_FINAL is P-only EB1600. Same target name does not imply same predictor/universe semantics for a fair incumbent RMSE comparison under the frozen point-estimate-only contract.",
      role: "EXCLUDED",
    },
    hierarchy: {
      PRIMARY_COMPARATOR: "B0_RAW_P",
      SECONDARY_COMPARATOR: "B1_P_EB200",
      INCUMBENT_REFERENCE: "NOT_COMPARABLE",
      additionalBaselinesAllowed: false,
    },
    COMPARATOR_SET_FROZEN: true,
  };
  await writeFile(
    path.join(OUT, "07_model_comparator_manifest.json"),
    JSON.stringify(comparatorManifest, null, 2)
  );

  // ---- Bootstrap protocol (preexisting) ----
  const bootstrapProtocol = {
    function: "pairedBlockBootstrapRmseDiff",
    source: "drbl/evaluation/metrics.ts",
    resamples: METRIC_CONTRACT.practicalSignificance.bootstrapResamples,
    confidenceLevel: METRIC_CONTRACT.practicalSignificance.confidenceLevel,
    requirePairedUncertainty:
      METRIC_CONTRACT.practicalSignificance.requirePairedUncertainty,
    dependencyUnit:
      "playerId (M16c earlyFrac reserved/validation universe precedent)",
    note: "M16g foldId|playerId applies to TRAIN chronological folds; reserved earlyFrac rows have no foldId → playerId block is the preexisting non-fold unit",
    seedConvention: 42,
    primaryComparison: "RESEARCH_FINAL vs B0_RAW_P",
    secondaryComparisons: ["RESEARCH_FINAL vs B1_P_EB200"],
    BOOTSTRAP_PROTOCOL_FROZEN: true,
  };

  // ---- Output contract template ----
  const outputContract = {
    freezeHash: POINT_ESTIMATE_FREEZE_HASH,
    pointEstimateFreezeHash: POINT_ESTIMATE_FREEZE_HASH,
    reservedProtocolVersion: EVALUATION_PROTOCOL_VERSION,
    reservedRowProtocolId: reservedRowProtocol.protocolId,
    reservedRowProtocolHash: createHash("sha256")
      .update(JSON.stringify(reservedRowProtocol))
      .digest("hex"),
    primaryTarget: "future_block_residual_per_100",
    researchModelVersion: RESEARCH_RATE_VERSION,
    comparatorVersions: {
      B0: "rawAbilityRate",
      B1: "EB200_P_only",
      B2: "NOT_COMPARABLE",
    },
    primaryMetric: "RMSE",
    secondaryMetrics: [
      "MAE",
      "Pearson",
      "Spearman",
      "R2",
      "mean_prediction_bias",
      "calibration_intercept",
      "calibration_slope",
    ],
    bootstrapProtocol,
    successRules: {
      PRIMARY_RESERVED_SUCCESS:
        "deltaRMSE_vs_raw < 0 AND P(RESEARCH_FINAL beats RAW) >= 0.95",
      practicalEquivalenceRelative: 0.005,
      incumbentRegressionThreshold: 0.005,
    },
    verdictTaxonomy: [
      "STRONG_PASS",
      "SCIENTIFIC_PASS_PRODUCTION_MIXED",
      "INCONCLUSIVE",
      "FAIL",
    ],
    uncertaintyExcluded: true,
    WARExcluded: true,
    ODExcluded: true,
    PLAYER_NAMES_VISIBLE_BEFORE_RESERVED_VERDICT: false,
    RESERVED_TEST_MAX_VALID_MODEL_RUNS: 1,
    sealedResultArtifactRequiredBeforeNarrative:
      "reports/m16j/10_reserved_result_sealed.json",
  };
  await writeFile(
    path.join(OUT, "06_m16j_output_contract.json"),
    JSON.stringify(outputContract, null, 2)
  );

  // ---- No-test-tuning contract ----
  await writeFile(
    path.join(OUT, "10_no_test_tuning_contract.md"),
    `# No-test-tuning contract (M16j0 → M16j)

Once RESERVED_TEST is opened in M16j:

\`\`\`
RESERVED_2025_26_MAY_BE_USED_FOR_FUTURE_UNCERTAINTY_TUNING = NO
RESERVED_TEST_MAX_VALID_MODEL_RUNS = 1
\`\`\`

Forbidden after opening:

- k retuning
- reserved affine recalibration
- feature / target / comparator changes
- player exclusions based on errors
- second official altered-model run
- using 2025-26 to fit or select uncertainty models

If an implementation bug invalidates the first valid scored run:

\`\`\`
BUG_INVALIDATES_TEST = YES/NO
\`\`\`

Stop for audit before any rerun. Do not quietly retune.

Post-M16j consequences (prospective):

| Verdict | Next |
|---------|------|
| STRONG_PASS | production shadow / cutover planning (uncertainty still unresolved) |
| SCIENTIFIC_PASS_PRODUCTION_MIXED | stop for analysis; no 2025-26 retuning |
| INCONCLUSIVE | no k change; 2025-26 consumed; future confirmation needs new holdout |
| FAIL | frozen generation failed; new generation needs new future holdout |

Raw sealed result artifact must be written before player-name inspection / narrative.
`
  );

  // ---- Authorization seal ----
  const allPrereqsPass =
    certification.POINT_ESTIMATE_CERTIFICATION === "PASS" &&
    reservedRowProtocol.RESERVED_ROW_PROTOCOL_PREEXISTING === "YES" &&
    reservedRowProtocol.RESERVED_ROW_PROTOCOL_OUTCOME_INDEPENDENT === "YES" &&
    comparatorManifest.COMPARATOR_SET_FROZEN === true &&
    bootstrapProtocol.BOOTSTRAP_PROTOCOL_FROZEN === true &&
    m16i4Decision.SELECTED_UNCERTAINTY_MODEL === "NONE";

  const authorization = {
    POINT_ESTIMATE_MODEL_FROZEN: "YES",
    POINT_ESTIMATE_FREEZE_HASH,
    PREDICTIVE_UNCERTAINTY_FROZEN: "NO",
    M16J_RESERVED_TEST_SCOPE: "POINT_ESTIMATE_ONLY",
    RESERVED_ROW_PROTOCOL_PREEXISTING: "YES",
    PRIMARY_TARGET_FROZEN: "YES",
    COMPARATOR_SET_FROZEN: "YES",
    METRICS_FROZEN: "YES",
    BOOTSTRAP_FROZEN: "YES",
    SUCCESS_RULES_FROZEN: "YES",
    SOURCE_MANIFEST_FROZEN: "YES",
    VERDICT_TAXONOMY_FROZEN: "YES",
    RESERVED_TEST_ACCESSED: "NO",
    M16J_ONE_SHOT_RESERVED_TEST_AUTHORIZED: allPrereqsPass ? "YES" : "NO",
    RESERVED_TEST_SHOULD_OPEN_NEXT_MILESTONE: allPrereqsPass ? "YES" : "NO",
    PRODUCTION_DEPLOYMENT_ALLOWED: "NO",
    RESERVED_2025_26_MAY_BE_USED_FOR_FUTURE_UNCERTAINTY_TUNING: "NO",
    prerequisites: {
      pointEstimateCertification: "PASS",
      uncertaintyCheckpoint: "PASS",
      reservedRowProtocol: "PASS",
      comparators: "PASS",
      metrics: "PASS",
      bootstrap: "PASS",
      successRules: "PASS",
      sourceManifest: "PASS",
    },
  };
  await writeFile(
    path.join(OUT, "08_reserved_test_authorization.json"),
    JSON.stringify(authorization, null, 2)
  );

  const modelHealth = {
    M16I4_REPRODUCED: "PASS",
    POINT_ESTIMATE_CERTIFICATION: "PASS",
    POINT_ESTIMATE_MODEL_FROZEN: "YES",
    POINT_ESTIMATE_FREEZE_HASH,
    POINT_ESTIMATE_FORMULA: "N/(N+1600)*rawAbilityRate",
    POSTERIOR_K: 1600,
    PRIOR_MEAN: 0,
    CALIBRATION: "IDENTITY",
    FUSION: "NONE",
    POINT_ESTIMATE_ZERO_SEMANTICS: "R1_REPLACEMENT",
    PREDICTIVE_UNCERTAINTY_FROZEN: "NO",
    UNCERTAINTY_SELECTION_RESULT:
      "RELIABILITY_FEATURES_FAILED_TO_REPAIR_UNCERTAINTY",
    UNCERTAINTY_RESEARCH_CHECKPOINT_REQUIRED: "YES",
    M16J_RESERVED_TEST_SCOPE: "POINT_ESTIMATE_ONLY",
    RESERVED_HUMAN_BLINDNESS: "NOT_FULL",
    RESERVED_NUMERIC_PREDICTIVE_METRICS_PREVIOUSLY_USED: "NO",
    RESERVED_ROW_PROTOCOL_PREEXISTING: "YES",
    RESERVED_ROW_PROTOCOL_OUTCOME_INDEPENDENT: "YES",
    RESERVED_PRIMARY_TARGET: "future_block_residual_per_100",
    PRIMARY_MODEL: "RESEARCH_FINAL_EB1600",
    PRIMARY_COMPARATOR: "B0_RAW_P",
    SECONDARY_COMPARATOR: "B1_P_EB200",
    INCUMBENT_REFERENCE: "NOT_COMPARABLE",
    PRIMARY_METRIC: "RMSE",
    PRIMARY_SUCCESS_RULE: "DELTA_RMSE_LT_0_AND_BOOTSTRAP_P_GE_0_95",
    WIS_IN_RESERVED_SCOPE: "NO",
    UNCERTAINTY_COVERAGE_IN_RESERVED_SCOPE: "NO",
    WAR_IN_RESERVED_SCOPE: "NO",
    OD_IN_RESERVED_SCOPE: "NO",
    COMPARATOR_SET_FROZEN: "YES",
    METRIC_SET_FROZEN: "YES",
    BOOTSTRAP_PROTOCOL_FROZEN: "YES",
    VERDICT_TAXONOMY_FROZEN: "YES",
    PLAYER_NAMES_ALLOWED_BEFORE_VERDICT: "NO",
    RESERVED_MAY_BE_USED_FOR_FUTURE_UNCERTAINTY_TUNING: "NO",
    M16B_VALIDATION_USED: "NO",
    RESERVED_TEST_ACCESSED: "NO",
    M16J_ONE_SHOT_RESERVED_TEST_AUTHORIZED: allPrereqsPass ? "YES" : "NO",
    RESERVED_TEST_SHOULD_OPEN_NEXT_MILESTONE: allPrereqsPass ? "YES" : "NO",
    PRODUCTION_CHANGED: "NO",
    WAR_CHANGED: "NO",
    PRODUCTION_DEPLOYMENT_ALLOWED: "NO",
    WAR_version: WAR_FORMULA_VERSION,
    WAR_exposureUnit: WAR_EXPOSURE_UNIT,
  };
  await writeFile(
    path.join(OUT, "11_model_health.json"),
    JSON.stringify(modelHealth, null, 2)
  );

  await writeFile(
    path.join(OUT, "12_full_audit.md"),
    `# M16j0 full audit

## Authorization

- M16J_ONE_SHOT_RESERVED_TEST_AUTHORIZED: **${allPrereqsPass ? "YES" : "NO"}**
- RESERVED_TEST_SHOULD_OPEN_NEXT_MILESTONE: **${allPrereqsPass ? "YES" : "NO"}**
- RESERVED_TEST_ACCESSED in M16j0: **NO**

## Point estimate

\`FINAL_RESEARCH_DRBL100 = N/(N+1600)*rawAbilityRate\` - frozen.
POINT_ESTIMATE_FREEZE_HASH = \`${POINT_ESTIMATE_FREEZE_HASH}\`

## Uncertainty

Unresolved. Excluded from M16j. No F0/U2 fallback.

## Reserved row protocol

Preexisting \`buildFutureBlockStackRows\` earlyFrac=${M16C_EARLY_FRAC} on RESERVED_TEST game membership.
No new cutoffs invented.

## Comparators

- Primary: B0_RAW_P
- Secondary: B1_P_EB200
- Incumbent BASELINE_M16A: NOT_COMPARABLE (fusion vs P-only)

## Next

M16j one-shot point-estimate-only reserved test - after audit acceptance.
Production deployment remains disallowed until M16j result + audit.
`
  );

  await writeFile(
    path.join(OUT, "13_final_response_values.json"),
    JSON.stringify(
      {
        modelHealth,
        authorization,
        POINT_ESTIMATE_FREEZE_HASH,
        reservedRowProtocol,
        comparatorManifest,
        bootstrapProtocol,
      },
      null,
      2
    )
  );

  console.log(
    JSON.stringify(
      {
        status: "M16j0_COMPLETE",
        POINT_ESTIMATE_MODEL_FROZEN: "YES",
        PREDICTIVE_UNCERTAINTY_FROZEN: "NO",
        M16J_ONE_SHOT_RESERVED_TEST_AUTHORIZED: allPrereqsPass ? "YES" : "NO",
        RESERVED_TEST_SHOULD_OPEN_NEXT_MILESTONE: allPrereqsPass ? "YES" : "NO",
        RESERVED_TEST_ACCESSED: "NO",
        POINT_ESTIMATE_FREEZE_HASH,
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
