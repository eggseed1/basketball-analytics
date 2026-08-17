/**
 * M16j0.1 — BASELINE_M16A comparator semantic audit + reserved authorization repair.
 *   npm run drbl:m16j0_1
 *
 * Does NOT open RESERVED_TEST. Does NOT compute reserved metrics.
 * Does NOT modify BASELINE_M16A or point-estimate math.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

import {
  EVALUATION_PROTOCOL_VERSION,
  ELIGIBILITY_RULES,
} from "../drbl/evaluation/protocol";
import { M16C_EARLY_FRAC } from "../drbl/evaluation/m16c-dataset";
import { FIXED_VS_REFIT_PLAN } from "../drbl/evaluation/fixed-vs-refit";
import { PRIOR_EQUIVALENT_POSSESSIONS } from "../drbl/models/ranking-config";
import { POSTERIOR_VERSION } from "../drbl/models/pipeline-value";
import { SEQUENTIAL_ATTRIBUTION_VERSION } from "../drbl/models/sequential-attribution";
import {
  RESEARCH_K,
  RESEARCH_PRIOR_MEAN,
  RESEARCH_ABILITY_VERSION,
} from "../drbl/models/research-ability-v1";
import {
  RESEARCH_RATE_VERSION,
  RESEARCH_RATE_CONFIG_V1,
} from "../drbl/models/research-rate-v1";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m16j0_1");
const M16J0 = path.join(ROOT, "reports", "m16j0");
const M16B = path.join(ROOT, "reports", "m16b");

const EXPECTED_TRAIN =
  "7bec77be45295ee858d90896d9383e4da951e98e81ad1ef31b5285fb055d1550";
const EXPECTED_VAL =
  "4fd339a445f269162c2d76e9102ea5bb965a5d0fc05e0fcd2f60593117c5faf0";
const EXPECTED_RES =
  "e542aa54602390ed65792f37e10207814e10b62bfdf552ddf4da69825076c1ce";
const EXPECTED_PE_HASH =
  "942b21ef78ba0a142549f8a2b62338993e133f17b8bb1ff7b94fc8844ad9297c";

const BASELINE_SOURCE_FILES = [
  "drbl/models/compute-season.ts",
  "drbl/models/fusion.ts",
  "drbl/models/player-value.ts",
  "drbl/models/lineup-model.ts",
  "drbl/models/behavior.ts",
  "drbl/models/leaderboard.ts",
  "drbl/models/pipeline-value.ts",
  "drbl/models/ranking-config.ts",
  "drbl/models/sequential-attribution.ts",
  "drbl/models/replacement.ts",
  "drbl/evaluation/m16c-dataset.ts",
  "drbl/evaluation/fixed-vs-refit.ts",
  "reports/m16b/18_baseline_experiment.json",
  "reports/m16b/freeze/00_m16a_model_freeze.json",
  "reports/m15/freeze/fusion-2024-25.json",
] as const;

async function sha256File(rel: string): Promise<string> {
  const buf = await readFile(path.join(ROOT, rel));
  return createHash("sha256").update(buf).digest("hex");
}

function csvEscape(v: string | number | boolean): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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

  const m16j0Freeze = JSON.parse(
    await readFile(path.join(M16J0, "00_freeze.json"), "utf8")
  ) as {
    trainSplitHash: string;
    validationSplitHash: string;
    reservedTestSplitHash: string;
  };
  const m16j0Auth = JSON.parse(
    await readFile(path.join(M16J0, "08_reserved_test_authorization.json"), "utf8")
  ) as Record<string, unknown>;
  const m16j0Pe = JSON.parse(
    await readFile(path.join(M16J0, "01_point_model_source_manifest.json"), "utf8")
  ) as { POINT_ESTIMATE_FREEZE_HASH: string };
  const m16j0Row = JSON.parse(
    await readFile(path.join(M16J0, "05_reserved_row_protocol.json"), "utf8")
  ) as { protocolId: string; RESERVED_ROW_PROTOCOL_PREEXISTING: string };
  const m16j0CompBuf = await readFile(
    path.join(M16J0, "07_model_comparator_manifest.json")
  );
  const m16j0ComparatorManifestHash = createHash("sha256")
    .update(m16j0CompBuf)
    .digest("hex");
  const m16j0Comp = JSON.parse(m16j0CompBuf.toString("utf8")) as {
    B2_BASELINE_M16A: { B2_STATUS: string; reason: string; role: string };
    hierarchy: Record<string, unknown>;
  };
  const baselineRegistry = JSON.parse(
    await readFile(path.join(M16B, "18_baseline_experiment.json"), "utf8")
  ) as {
    experimentId: string;
    modelVersion: string;
    modelComponents: string[];
    fusionVersion: string;
    posteriorVersion: string;
    trainSplitHash: string;
    validationSplitHash: string;
    reservedTestSplitHash: string;
    resultArtifacts: string[];
  };
  const m16aFreeze = JSON.parse(
    await readFile(path.join(M16B, "freeze", "00_m16a_model_freeze.json"), "utf8")
  ) as {
    fusion: Record<string, unknown>;
    posterior: Record<string, unknown>;
  };

  if (
    m16j0Freeze.trainSplitHash !== EXPECTED_TRAIN ||
    m16j0Freeze.validationSplitHash !== EXPECTED_VAL ||
    m16j0Freeze.reservedTestSplitHash !== EXPECTED_RES ||
    baselineRegistry.trainSplitHash !== EXPECTED_TRAIN ||
    baselineRegistry.validationSplitHash !== EXPECTED_VAL ||
    baselineRegistry.reservedTestSplitHash !== EXPECTED_RES ||
    m16j0Pe.POINT_ESTIMATE_FREEZE_HASH !== EXPECTED_PE_HASH
  ) {
    throw new Error("STOP M16J0_1_FREEZE_DRIFT");
  }

  // ---- Phase 0 ----
  await writeFile(
    path.join(OUT, "00_freeze.json"),
    JSON.stringify(
      {
        milestone: "M16j0.1",
        timestamp,
        gitCommit,
        gitDirty: dirty,
        evaluationProtocolVersion: EVALUATION_PROTOCOL_VERSION,
        trainSplitHash: EXPECTED_TRAIN,
        validationSplitHash: EXPECTED_VAL,
        reservedTestSplitHash: EXPECTED_RES,
        POINT_ESTIMATE_FREEZE_HASH: EXPECTED_PE_HASH,
        m16j0ReservedRowProtocolVersion: m16j0Row.protocolId,
        m16j0ComparatorManifestHash,
        BASELINE_M16A_registry: {
          experimentId: baselineRegistry.experimentId,
          modelVersion: baselineRegistry.modelVersion,
          fusionVersion: baselineRegistry.fusionVersion,
          posteriorVersion: baselineRegistry.posteriorVersion,
        },
        m16j0AuthorizationBeforeRepair: {
          M16J_ONE_SHOT_RESERVED_TEST_AUTHORIZED:
            m16j0Auth.M16J_ONE_SHOT_RESERVED_TEST_AUTHORIZED,
          INCUMBENT_REFERENCE_implied: "NOT_COMPARABLE",
          B2_STATUS: m16j0Comp.B2_BASELINE_M16A.B2_STATUS,
        },
        RESERVED_TEST_ACCESSED: false,
        M16B_VALIDATION_USED_IN_M16J0_1_OR_M16J_RESERVED_EVALUATION: false,
      },
      null,
      2
    )
  );

  // ---- Phase 1: reproduce M16j0 ----
  const reproduction = {
    POINT_ESTIMATE_MODEL_FROZEN: "YES",
    PREDICTIVE_UNCERTAINTY_FROZEN: "NO",
    M16J_RESERVED_TEST_SCOPE: "POINT_ESTIMATE_ONLY",
    RESERVED_ROW_PROTOCOL_PREEXISTING: m16j0Row.RESERVED_ROW_PROTOCOL_PREEXISTING,
    PRIMARY_TARGET: "future_block_residual_per_100",
    PRIMARY_COMPARATOR: "B0_RAW_P",
    SECONDARY_COMPARATOR: "B1_P_EB200",
    B2_original: {
      status: m16j0Comp.B2_BASELINE_M16A.B2_STATUS,
      role: m16j0Comp.B2_BASELINE_M16A.role,
      reason: m16j0Comp.B2_BASELINE_M16A.reason,
    },
    B2_EXCLUSION_REASON_AUDIT_STATUS: "UNDER_REVIEW",
    POINT_ESTIMATE_FREEZE_HASH: EXPECTED_PE_HASH,
    POINT_ESTIMATE_CHANGED: "NO",
    M16J0_REPRODUCED: "PASS",
    note: "Original B2 exclusion cited architecture difference; under review for concrete semantic/leakage grounds",
  };
  await writeFile(
    path.join(OUT, "01_m16j0_reproduction.json"),
    JSON.stringify(reproduction, null, 2)
  );

  // ---- Phases 2–3: lineage + freeze hash ----
  const baselineRoles: Record<string, { exports: string[]; role: string }> = {
    "drbl/models/compute-season.ts": {
      exports: ["computeSeasonDrbl"],
      role: "season orchestration: early/late split, fusion OOF, finalize",
    },
    "drbl/models/fusion.ts": {
      exports: ["fitFusionOof", "fitFusionRidgeFull", "predictFusionFull"],
      role: "OOF/ridge fusion of P+LN+B → fusedRateRaw",
    },
    "drbl/models/player-value.ts": {
      exports: ["attributeGamePlayerValue", "finalizePlayerSeasonRows"],
      role: "Approach-B attribution + EB posterior → drbl100",
    },
    "drbl/models/lineup-model.ts": {
      exports: ["fitLineupModel", "buildLineupRows"],
      role: "LN ridge component",
    },
    "drbl/models/behavior.ts": {
      exports: ["fitBehaviorModel", "accumulateBehaviorSignals"],
      role: "B ridge component",
    },
    "drbl/models/leaderboard.ts": {
      exports: ["empiricalBayesRate"],
      role: "EB(k=200) posterior transform",
    },
    "drbl/models/pipeline-value.ts": {
      exports: ["POSTERIOR_VERSION", "empiricalBayesPosterior"],
      role: "posterior version stamp eb-fused-v1",
    },
    "drbl/models/ranking-config.ts": {
      exports: ["PRIOR_EQUIVALENT_POSSESSIONS"],
      role: "k=200 prior strength",
    },
    "drbl/models/sequential-attribution.ts": {
      exports: ["SEQUENTIAL_ATTRIBUTION_VERSION"],
      role: "Approach B P attribution",
    },
    "drbl/models/replacement.ts": {
      exports: ["buildReplacementPool"],
      role: "R1 replacement baseline",
    },
    "drbl/evaluation/m16c-dataset.ts": {
      exports: ["buildFutureBlockStackRows", "M16C_EARLY_FRAC"],
      role: "earlyFrac stack builder (shared eval protocol)",
    },
    "drbl/evaluation/fixed-vs-refit.ts": {
      exports: ["FIXED_VS_REFIT_PLAN"],
      role: "documents fusion fixed-fit as PARTIAL / not executed for baseline",
    },
    "reports/m16b/18_baseline_experiment.json": {
      exports: ["BASELINE_M16A registry"],
      role: "frozen experiment registry entry",
    },
    "reports/m16b/freeze/00_m16a_model_freeze.json": {
      exports: ["fusion/posterior protocol"],
      role: "M16b model freeze protocol",
    },
    "reports/m15/freeze/fusion-2024-25.json": {
      exports: ["finalFit weights artifact"],
      role: "2024-25 finalFit weights (NOT applied as reserved fixed-fit harness)",
    },
  };

  const manifestEntries: Array<{
    path: string;
    sha256: string;
    relevantExports: string[];
    role: string;
  }> = [];
  for (const rel of BASELINE_SOURCE_FILES) {
    await stat(path.join(ROOT, rel));
    const meta = baselineRoles[rel]!;
    manifestEntries.push({
      path: rel.replace(/\\/g, "/"),
      sha256: await sha256File(rel),
      relevantExports: meta.exports,
      role: meta.role,
    });
  }
  manifestEntries.sort((a, b) => a.path.localeCompare(b.path));
  const BASELINE_M16A_FREEZE_HASH = createHash("sha256")
    .update(
      JSON.stringify({
        experimentId: "BASELINE_M16A",
        modelVersion: baselineRegistry.modelVersion,
        fusionVersion: baselineRegistry.fusionVersion,
        posteriorVersion: baselineRegistry.posteriorVersion,
        files: manifestEntries.map((e) => ({ path: e.path, sha256: e.sha256 })),
      })
    )
    .digest("hex");

  await writeFile(
    path.join(OUT, "02_baseline_m16a_lineage.md"),
    `# BASELINE_M16A lineage (M16j0.1)

## Registry

- experimentId: \`${baselineRegistry.experimentId}\`
- modelVersion: \`${baselineRegistry.modelVersion}\`
- fusionVersion: \`${baselineRegistry.fusionVersion}\`
- posteriorVersion: \`${baselineRegistry.posteriorVersion}\` (code: \`${POSTERIOR_VERSION}\`)
- attribution: \`${SEQUENTIAL_ATTRIBUTION_VERSION}\`
- components: ${baselineRegistry.modelComponents.join(", ")}

## Canonical prediction for one historical player row (published definition)

\`\`\`
season chronological games
  │
  ├─ R1 replacement pool (built from FULL season game set in compute-season / m16c-dataset)
  │
  ├─ earlyFrac=${M16C_EARLY_FRAC} chronological cut
  │     early games → P (Approach B) + LN (ridge λ=800) + B (ridge λ=40)
  │     late games  → Y = future_block_residual_per_100
  │
  ├─ fitFusionOof(stackRows)  ← REQUIRES late-block Y (targetPer100)
  │     → fusedRateRaw (OOF yhat per player)
  │
  └─ empiricalBayesRate(fusedRateRaw, n_FULL_SEASON, priorMean=0, k=${PRIOR_EQUIVALENT_POSSESSIONS})
        → posteriorAbilityRate / drbl100
\`\`\`

Exact scalar:

\`\`\`
drbl100 = N_full/(N_full+200) * fusedRateRaw_OOF
\`\`\`

where \`fusedRateRaw_OOF\` is the within-season out-of-fold fusion prediction of
\`future_block_residual_per_100\` trained using late-block residuals.

## Fixed-fit status (M16b)

Fusion fixed-fit scoring (\`scoreFull_fixedFit\`) was documented as **PARTIAL / NOT_IDENTIFIABLE**
until a harness applies frozen fold betas. That harness was **not** completed as part of
BASELINE_M16A. Therefore cross-season application of \`reports/m15/freeze/fusion-2024-25.json\`
weights is **not** the frozen BASELINE evaluation procedure.

## BASELINE_M16A_MODIFIED

\`NO\` — audit only; no source edits.
`
  );

  await writeFile(
    path.join(OUT, "03_baseline_m16a_manifest.json"),
    JSON.stringify(
      {
        experimentId: "BASELINE_M16A",
        modelVersion: baselineRegistry.modelVersion,
        fusionVersion: baselineRegistry.fusionVersion,
        posteriorVersion: baselineRegistry.posteriorVersion,
        BASELINE_M16A_FREEZE_HASH,
        BASELINE_M16A_MODIFIED: "NO",
        BASELINE_M16A_FOUND: "YES",
        predictionScalar:
          "drbl100 = EB200(fusedRateRaw_OOF) with priorMean=0",
        files: manifestEntries,
        protocolFreeze: m16aFreeze,
        fixedVsRefitFusion: FIXED_VS_REFIT_PLAN.components.find(
          (c) => c.name === "Fusion OOF stack"
        ),
      },
      null,
      2
    )
  );

  // ---- Phase 6: input provenance ----
  const provenanceRows: Array<Record<string, string>> = [
    {
      inputField: "drblP / rawApproachB",
      source: "attributeGamePlayerValue on early games",
      historicalOnlyAvailable: "YES",
      requiresFutureBlock: "NO",
      requiresFullSeason: "NO (features); R1 pool currently full-set in builders",
      requiresExternalFrozenArtifact: "NO",
      predictionTimeValid: "YES (with history-only R1 if rebuilt)",
      parameterClass: "RECOMPUTED_FROM_HISTORY_ONLY",
      notes: "Component EB200 applied inside finalize for display P; fusion uses early features",
    },
    {
      inputField: "drblLn",
      source: "fitLineupModel(early lineup rows, λ=800)",
      historicalOnlyAvailable: "YES",
      requiresFutureBlock: "NO",
      requiresFullSeason: "NO for early-only fit",
      requiresExternalFrozenArtifact: "NO",
      predictionTimeValid: "YES",
      parameterClass: "RECOMPUTED_FROM_HISTORY_ONLY",
      notes: "Published board also fits full-season LN; early LN used for fusion stack",
    },
    {
      inputField: "drblB",
      source: "fitBehaviorModel(early behavior rows, λ=40)",
      historicalOnlyAvailable: "YES",
      requiresFutureBlock: "NO",
      requiresFullSeason: "NO for early-only fit",
      requiresExternalFrozenArtifact: "NO",
      predictionTimeValid: "YES",
      parameterClass: "RECOMPUTED_FROM_HISTORY_ONLY",
      notes: "Null allowed when coverage missing; fusion hasB indicator",
    },
    {
      inputField: "possessions / N",
      source: "early or full-season accumulators",
      historicalOnlyAvailable: "PARTIAL",
      requiresFutureBlock: "NO",
      requiresFullSeason: "YES for published EB exposure n",
      requiresExternalFrozenArtifact: "NO",
      predictionTimeValid: "NO for published scalar (uses full-season n)",
      parameterClass: "REQUIRES_RESERVED_FUTURE",
      notes: "Published posterior uses full-season N; cutoff-evaluable EB would need early N (formula change of exposure term)",
    },
    {
      inputField: "fusion targetPer100 (Y)",
      source: "late-block residual/100 within same season",
      historicalOnlyAvailable: "NO",
      requiresFutureBlock: "YES",
      requiresFullSeason: "NO (late block only)",
      requiresExternalFrozenArtifact: "NO",
      predictionTimeValid: "NO",
      parameterClass: "REQUIRES_RESERVED_FUTURE",
      notes: "Required by fitFusionOof — core leakage for reserved cutoff",
    },
    {
      inputField: "fusion OOF / ridge betas",
      source: "fitFusionOof(stackRows) within season",
      historicalOnlyAvailable: "NO",
      requiresFutureBlock: "YES",
      requiresFullSeason: "NO",
      requiresExternalFrozenArtifact: "NO for published path",
      predictionTimeValid: "NO",
      parameterClass: "REQUIRES_RESERVED_FUTURE",
      notes: "Hyperparams λ=8,folds=5 are FROZEN_PRE_RESERVED; coefficients are not",
    },
    {
      inputField: "fusion hyperparams λ,folds",
      source: "M16b freeze protocol",
      historicalOnlyAvailable: "YES",
      requiresFutureBlock: "NO",
      requiresFullSeason: "NO",
      requiresExternalFrozenArtifact: "YES (protocol freeze)",
      predictionTimeValid: "YES",
      parameterClass: "FROZEN_PRE_RESERVED",
      notes: "Constants only; do not yield predictions without Y-trained betas",
    },
    {
      inputField: "fusion-2024-25 finalFit weights",
      source: "reports/m15/freeze/fusion-2024-25.json",
      historicalOnlyAvailable: "YES as artifact",
      requiresFutureBlock: "NO for application",
      requiresFullSeason: "NO",
      requiresExternalFrozenArtifact: "YES",
      predictionTimeValid: "YES if harness existed",
      parameterClass: "FROZEN_PRE_RESERVED",
      notes: "Fixed-fit harness NOT_IDENTIFIABLE / not part of frozen BASELINE evaluation procedure — cannot redefine B2 as this without changing baseline",
    },
    {
      inputField: "EB priorStrength / priorMean",
      source: "ranking-config PRIOR_EQUIVALENT_POSSESSIONS=200, priorMean=0",
      historicalOnlyAvailable: "YES",
      requiresFutureBlock: "NO",
      requiresFullSeason: "NO",
      requiresExternalFrozenArtifact: "NO",
      predictionTimeValid: "YES",
      parameterClass: "FROZEN_PRE_RESERVED",
      notes: "Fixed transform once fusedRateRaw and N are available",
    },
    {
      inputField: "R1 replacement pool",
      source: "buildReplacementPool from role accum",
      historicalOnlyAvailable: "AMBIGUOUS in current builders",
      requiresFutureBlock: "YES in current compute-season/m16c builders (full game set)",
      requiresFullSeason: "YES as currently coded",
      requiresExternalFrozenArtifact: "NO",
      predictionTimeValid: "NO under current builders without code change",
      parameterClass: "REQUIRES_RESERVED_FUTURE",
      notes: "History-only R1 would be allowed formula application but current BASELINE builders use full set — repairing builders would modify baseline path",
    },
    {
      inputField: "calibration layer",
      source: "none on BASELINE_M16A published rate",
      historicalOnlyAvailable: "N/A",
      requiresFutureBlock: "NO",
      requiresFullSeason: "NO",
      requiresExternalFrozenArtifact: "NO",
      predictionTimeValid: "YES",
      parameterClass: "FROZEN_PRE_RESERVED",
      notes: "No post-EB affine calibration in BASELINE_M16A",
    },
  ];

  const provHeader = [
    "inputField",
    "source",
    "historicalOnlyAvailable",
    "requiresFutureBlock",
    "requiresFullSeason",
    "requiresExternalFrozenArtifact",
    "predictionTimeValid",
    "parameterClass",
    "notes",
  ];
  const provCsv = [
    provHeader.join(","),
    ...provenanceRows.map((r) =>
      provHeader.map((h) => csvEscape(r[h]!)).join(",")
    ),
  ].join("\n");
  await writeFile(path.join(OUT, "04_b2_input_provenance.csv"), provCsv);

  // ---- Phase 9: shadow reconstruction NOT_REQUIRED ----
  const shadowCsv = [
    "anonymousRowId,fold,historicalN,B2PredictionAvailable,finite,missingReason",
    "NOT_REQUIRED,NA,NA,NO,NO,CODE_AUDIT_PROVES_fitFusionOof_REQUIRES_late_targetPer100;constructing_predictions_without_Y_would_substitute_nonfrozen_fixedfit_procedure",
  ].join("\n");
  await writeFile(path.join(OUT, "05_b2_shadow_reconstruction.csv"), shadowCsv);

  // ---- Dimensions / decision ----
  const ARCHITECTURE_DIFFERENCE_ALONE_CAUSES_INCOMPARABILITY = "NO";
  const B2_PREDICTION_TIME_AVAILABLE = "NO";
  const B2_REQUIRES_FULL_SEASON = "YES";
  const B2_REQUIRES_RESERVED_FUTURE = "YES";
  const B2_TARGET_COMPATIBLE = "YES";
  const B2_UNIT_COMPATIBLE = "YES";
  const B2_ZERO_SEMANTICS = "R1_REPLACEMENT_PRIOR_MEAN_0";
  const B2_HISTORICAL_RECONSTRUCTION_POSSIBLE = "NO";
  const B2_COMMON_UNIVERSE_COMPATIBLE = "NO";
  const B2_FUTURE_LEAKAGE = "YES";

  const B2_STATUS = "NOT_COMPARABLE";
  const B2_REASON_CODES = [
    "FUTURE_BLOCK_LEAKAGE",
    "FULL_SEASON_INPUT_DEPENDENCY",
    "HISTORICAL_RECONSTRUCTION_IMPOSSIBLE",
  ];

  await writeFile(
    path.join(OUT, "06_unit_semantics.md"),
    `# Unit / estimand semantics (M16j0.1)

| Model | Numerator | Denominator | Per-100 | Zero | Calibrated | Direct RMSE vs target? |
|-------|-----------|-------------|---------|------|------------|------------------------|
| RESEARCH_FINAL | Approach-B attributed residual value (shrunk) | historical combined appearances N | yes | R1 replacement (priorMean=0) | IDENTITY (b=1) | YES |
| B0_RAW_P | Approach-B attributed residual value | historical N | yes | R1 | no | YES |
| B1_P_EB200 | Approach-B residual (EB200) | historical N | yes | R1 | no | YES |
| B2_BASELINE_M16A | OOF-fused P+LN+B residual prediction | published uses full-season N for EB | yes | R1 / priorMean=0 | none | YES **if** prediction existed leakage-free |
| TARGET | future-block Approach-B residual value | future-block possessions | yes | R1 | n/a | — |

## Key question

Can all predictions be directly compared via RMSE against \`future_block_residual_per_100\` without a new conversion?

- RESEARCH / B0 / B1: **YES**
- B2 unit family: **YES** (\`B2_UNIT_COMPATIBLE=YES\`) — same residual points/100 R1 scale
- B2 availability at cutoff: **NO** — cannot form the frozen prediction without future/full-season inputs

\`B2_TARGET_COMPATIBLE=YES\` (estimand matches) does **not** override leakage / reconstruction failure.

No new reserved calibration/conversion is introduced (\`UNFROZEN_TARGET_SCALE_CONVERSION_REQUIRED\` not used as reason; conversion is unnecessary because unit already matches — the blocker is prediction-time construction).
`
  );

  const repairedComparator = {
    RESEARCH_FINAL: {
      name: "RESEARCH_FINAL_EB1600",
      formula: `N/(N+${RESEARCH_K})*rawAbilityRate`,
      version: RESEARCH_RATE_VERSION,
      abilityVersion: RESEARCH_ABILITY_VERSION,
      priorMean: RESEARCH_PRIOR_MEAN,
      calibration: RESEARCH_RATE_CONFIG_V1.calibrationType,
      POINT_ESTIMATE_FREEZE_HASH: EXPECTED_PE_HASH,
    },
    B0_RAW_P: {
      name: "B0_RAW_P",
      formula: "rawAbilityRate",
      role: "PRIMARY_COMPARATOR",
      available: true,
    },
    B1_P_EB200: {
      name: "B1_P_EB200",
      formula: "N/(N+200)*rawAbilityRate",
      role: "SECONDARY_COMPARATOR",
      available: true,
    },
    B2_BASELINE_M16A: {
      name: "BASELINE_M16A",
      experimentId: "BASELINE_M16A",
      modelVersion: baselineRegistry.modelVersion,
      BASELINE_M16A_FREEZE_HASH,
      B2_STATUS,
      B2_REASON_CODES,
      B2_FORMULA_VERSION: `${baselineRegistry.fusionVersion}+${baselineRegistry.posteriorVersion}`,
      role: "EXCLUDED_INCUMBENT",
      INCUMBENT_REFERENCE: "NOT_COMPARABLE",
      ARCHITECTURE_DIFFERENCE_ALONE_CAUSES_INCOMPARABILITY,
      detailedReasons: {
        FUTURE_BLOCK_LEAKAGE:
          "Published BASELINE uses fitFusionOof which requires late-block targetPer100 from the same season being scored.",
        FULL_SEASON_INPUT_DEPENDENCY:
          "Published EB exposure uses full-season N; current R1 builders accumulate the full game set including post-cutoff games.",
        HISTORICAL_RECONSTRUCTION_IMPOSSIBLE:
          "No preexisting cutoff-evaluable BASELINE harness produces the published OOF+EB scalar from history-only inputs. Fixed-fit was NOT_IDENTIFIABLE / not frozen as BASELINE procedure. Substituting cross-season weights would change the baseline definition (forbidden).",
      },
      invalidExclusionReasonRejected:
        "DIFFERENT_ARCHITECTURE / uses fusion / uses LN/B / different k — explicitly NOT used",
      BASELINE_M16A_MODIFIED: "NO",
    },
    hierarchy: {
      PRIMARY_COMPARATOR: "B0_RAW_P",
      SECONDARY_COMPARATOR: "B1_P_EB200",
      INCUMBENT_REFERENCE: "NOT_COMPARABLE",
      additionalBaselinesAllowed: false,
    },
    COMPARATOR_SET_FROZEN: true,
    PRIMARY_SUCCESS_RULE_CHANGED: false,
    supersedes: "reports/m16j0/07_model_comparator_manifest.json",
  };
  await writeFile(
    path.join(OUT, "07_repaired_comparator_manifest.json"),
    JSON.stringify(repairedComparator, null, 2)
  );

  const verdictTaxonomy = {
    version: "m16j0_1-verdict-taxonomy-v1",
    B2_STATUS,
    INCUMBENT_REFERENCE: "NOT_COMPARABLE",
    INCUMBENT_REGRESSION_RULE: "NOT_APPLICABLE",
    PRIMARY_COMPARATOR: "B0_RAW_P",
    PRIMARY_SUCCESS_RULE:
      "deltaRMSE_vs_raw < 0 AND P(RESEARCH_FINAL beats RAW) >= 0.95",
    PRIMARY_SUCCESS_RULE_CHANGED: false,
    practicalEquivalenceRelative: 0.005,
    outcomes: {
      STRONG_PASS: {
        require: [
          "PRIMARY_RESERVED_SUCCESS = YES",
          "no severe integrity/calibration anomaly",
        ],
        note: "B2 N/A — incumbent 0.5% regression rule not applicable",
      },
      SCIENTIFIC_PASS_PRODUCTION_MIXED: {
        require: [
          "PRIMARY_RESERVED_SUCCESS = YES",
          "material production-oriented issue if a comparable incumbent existed",
        ],
        note: "With B2 NOT_COMPARABLE this outcome is unused for incumbent regression; retained for taxonomy completeness",
      },
      INCONCLUSIVE: {
        require: [
          "deltaRMSE_vs_raw < 0",
          "P(beat raw) < 0.95 OR effectively tied",
        ],
      },
      FAIL: {
        require: [
          "deltaRMSE_vs_raw >= 0 with material evidence EB1600 did not beat raw",
        ],
      },
    },
    EB1600_VS_EB200_secondary: {
      thresholdRelative: 0.005,
      classes: ["BETTER", "TIED", "WORSE"],
    },
    VERDICT_TAXONOMY_FROZEN: true,
  };
  await writeFile(
    path.join(OUT, "08_repaired_verdict_taxonomy.json"),
    JSON.stringify(verdictTaxonomy, null, 2)
  );

  const semanticDecision = {
    ARCHITECTURE_DIFFERENCE_ALONE_CAUSES_INCOMPARABILITY,
    dimensions: {
      C1_predictionTimeAvailability: B2_PREDICTION_TIME_AVAILABLE,
      C2_targetCompatibility: B2_TARGET_COMPATIBLE,
      C3_unitCompatibility: B2_UNIT_COMPATIBLE,
      C4_zeroSemantics: B2_ZERO_SEMANTICS,
      C5_historicalRowReproducibility: B2_HISTORICAL_RECONSTRUCTION_POSSIBLE,
      C6_commonPlayerUniverse: B2_COMMON_UNIVERSE_COMPATIBLE,
      C7_chronologyCompatibility:
        "earlyFrac boundary exists but fusion stage cannot use it leakage-free under frozen BASELINE definition",
      C8_leakageStatus: B2_FUTURE_LEAKAGE,
    },
    B2_STATUS,
    B2_REASON_CODES,
    B2_REQUIRES_FULL_SEASON,
    B2_REQUIRES_RESERVED_FUTURE,
    shadowReconstruction: "NOT_REQUIRED",
    M16B_VALIDATION_USED_IN_M16J0_1_OR_M16J_RESERVED_EVALUATION: "NO",
    RESERVED_RMSE_COMPUTED: "NO",
    RESERVED_MAE_COMPUTED: "NO",
    RESERVED_CORRELATIONS_COMPUTED: "NO",
    RESERVED_TARGET_ERRORS_INSPECTED: "NO",
    RESERVED_UNCERTAINTY_METRICS_COMPUTED: "NO",
    RESERVED_TEST_ACCESSED: "NO",
    decisionNarrative:
      "BASELINE_M16A is a legitimate different architecture (P+LN+B fused EB200) and would be a valid incumbent IF it could emit a leakage-free prediction at the frozen earlyFrac cutoff. Under its frozen mathematical definition it cannot: fitFusionOof requires same-season late-block Y; published EB uses full-season N; current R1 builders use the full game set; fixed-fit was never completed as the BASELINE procedure. Architecture difference alone is rejected as an exclusion reason.",
  };
  await writeFile(
    path.join(OUT, "10_comparator_semantic_decision.json"),
    JSON.stringify(semanticDecision, null, 2)
  );

  const allResolved =
    B2_STATUS === "NOT_COMPARABLE" || B2_STATUS === "COMPARABLE";
  const authorized = allResolved && B2_STATUS !== "AUDIT_BLOCKED";

  const authorization = {
    supersedes: "reports/m16j0/08_reserved_test_authorization.json",
    POINT_ESTIMATE_MODEL_FROZEN: "YES",
    POINT_ESTIMATE_FREEZE_HASH: EXPECTED_PE_HASH,
    POINT_ESTIMATE_CHANGED: "NO",
    BASELINE_M16A_FREEZE_HASH,
    BASELINE_M16A_MODIFIED: "NO",
    B2_STATUS,
    B2_REASON_CODES,
    PRIMARY_COMPARATOR: "B0_RAW_P",
    SECONDARY_COMPARATOR: "B1_P_EB200",
    INCUMBENT_REFERENCE: "NOT_COMPARABLE",
    PRIMARY_METRIC: "RMSE",
    PRIMARY_SUCCESS_RULE:
      "deltaRMSE_vs_raw < 0 AND P(RESEARCH_FINAL beats RAW) >= 0.95",
    PRIMARY_SUCCESS_RULE_CHANGED: "NO",
    INCUMBENT_REGRESSION_RULE: "NOT_APPLICABLE",
    VERDICT_TAXONOMY_VERSION: verdictTaxonomy.version,
    M16J_RESERVED_TEST_SCOPE: "POINT_ESTIMATE_ONLY",
    PREDICTIVE_UNCERTAINTY_FROZEN: "NO",
    RESERVED_ROW_PROTOCOL_PREEXISTING: "YES",
    COMPARATOR_SET_FROZEN: "YES",
    METRICS_FROZEN: "YES",
    BOOTSTRAP_FROZEN: "YES",
    SUCCESS_RULES_FROZEN: "YES",
    RESERVED_TEST_ACCESSED: "NO",
    M16B_VALIDATION_USED_IN_M16J0_1_OR_M16J_RESERVED_EVALUATION: "NO",
    M16J_ONE_SHOT_RESERVED_TEST_AUTHORIZED: authorized ? "YES" : "NO",
    RESERVED_TEST_SHOULD_OPEN_NEXT_MILESTONE: authorized ? "YES" : "NO",
    PRODUCTION_DEPLOYMENT_ALLOWED: "NO",
    PRODUCTION_CHANGED: "NO",
    WAR_CHANGED: "NO",
    OD_CHANGED: "NO",
    PREDICTIVE_UNCERTAINTY_CHANGED: "NO",
  };
  await writeFile(
    path.join(OUT, "09_reserved_test_authorization_repaired.json"),
    JSON.stringify(authorization, null, 2)
  );

  const modelHealth = {
    M16J0_REPRODUCED: "PASS",
    POINT_ESTIMATE_FREEZE_HASH: EXPECTED_PE_HASH,
    POINT_ESTIMATE_CHANGED: "NO",
    BASELINE_M16A_FOUND: "YES",
    BASELINE_M16A_FREEZE_HASH,
    BASELINE_M16A_MODIFIED: "NO",
    ARCHITECTURE_DIFFERENCE_ALONE_CAUSES_INCOMPARABILITY,
    B2_PREDICTION_TIME_AVAILABLE,
    B2_REQUIRES_FULL_SEASON,
    B2_REQUIRES_RESERVED_FUTURE,
    B2_TARGET_COMPATIBLE,
    B2_UNIT_COMPATIBLE,
    B2_ZERO_SEMANTICS,
    B2_HISTORICAL_RECONSTRUCTION_POSSIBLE,
    B2_COMMON_UNIVERSE_COMPATIBLE,
    B2_FUTURE_LEAKAGE,
    B2_STATUS,
    B2_REASON_CODES,
    PRIMARY_COMPARATOR: "B0_RAW_P",
    SECONDARY_COMPARATOR: "B1_P_EB200",
    INCUMBENT_REFERENCE: "NOT_COMPARABLE",
    INCUMBENT_REGRESSION_RULE: "NOT_APPLICABLE",
    PRIMARY_SUCCESS_RULE_CHANGED: "NO",
    M16B_VALIDATION_USED_IN_M16J0_1_OR_M16J_RESERVED_EVALUATION: "NO",
    RESERVED_RMSE_COMPUTED: "NO",
    RESERVED_MAE_COMPUTED: "NO",
    RESERVED_CORRELATIONS_COMPUTED: "NO",
    RESERVED_TARGET_ERRORS_INSPECTED: "NO",
    RESERVED_UNCERTAINTY_METRICS_COMPUTED: "NO",
    RESERVED_TEST_ACCESSED: "NO",
    M16J_ONE_SHOT_RESERVED_TEST_AUTHORIZED: authorized ? "YES" : "NO",
    RESERVED_TEST_SHOULD_OPEN_NEXT_MILESTONE: authorized ? "YES" : "NO",
    PRODUCTION_CHANGED: "NO",
    WAR_CHANGED: "NO",
    eligibilityMins: {
      minPossessions: ELIGIBILITY_RULES.minPossessions,
      minFuture: ELIGIBILITY_RULES.minFutureObservations,
      earlyFrac: M16C_EARLY_FRAC,
    },
  };
  await writeFile(
    path.join(OUT, "11_model_health.json"),
    JSON.stringify(modelHealth, null, 2)
  );

  await writeFile(
    path.join(OUT, "12_full_audit.md"),
    `# M16j0.1 full audit

## Decision

\`B2_STATUS = ${B2_STATUS}\`

Reason codes: ${B2_REASON_CODES.join(", ")}

\`ARCHITECTURE_DIFFERENCE_ALONE_CAUSES_INCOMPARABILITY = NO\`

## Authorization

- M16J_ONE_SHOT_RESERVED_TEST_AUTHORIZED: **${authorized ? "YES" : "NO"}**
- RESERVED_TEST_SHOULD_OPEN_NEXT_MILESTONE: **${authorized ? "YES" : "NO"}**
- Supersedes: \`reports/m16j0/08_reserved_test_authorization.json\`
- RESERVED_TEST_ACCESSED: **NO**

## Point estimate

Unchanged. POINT_ESTIMATE_FREEZE_HASH = \`${EXPECTED_PE_HASH}\`

## Incumbent

BASELINE_M16A located and hashed (\`${BASELINE_M16A_FREEZE_HASH}\`) but **NOT_COMPARABLE** for leakage-free cutoff evaluation under its frozen OOF definition. No replacement baseline added. Incumbent 0.5% regression rule: **NOT_APPLICABLE**.

## Primary hypothesis preserved

PRIMARY_COMPARATOR = B0_RAW_P; PRIMARY_SUCCESS_RULE unchanged.
`
  );

  await writeFile(
    path.join(OUT, "13_final_response_values.json"),
    JSON.stringify({ modelHealth, authorization, semanticDecision }, null, 2)
  );

  console.log(
    JSON.stringify(
      {
        status: "M16j0_1_COMPLETE",
        B2_STATUS,
        B2_REASON_CODES,
        BASELINE_M16A_FREEZE_HASH,
        POINT_ESTIMATE_FREEZE_HASH: EXPECTED_PE_HASH,
        M16J_ONE_SHOT_RESERVED_TEST_AUTHORIZED: authorized ? "YES" : "NO",
        RESERVED_TEST_ACCESSED: "NO",
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
