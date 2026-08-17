/**
 * Write M17a.1 placeholder/partial artifacts for phases blocked on RAW_IMPORT_FINISHED.
 * Does not invent historical DRBL values.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "reports", "m17a_1");
mkdirSync(OUT, { recursive: true });
mkdirSync(path.join(OUT, "shadow"), { recursive: true });
mkdirSync(path.join(OUT, "raw"), { recursive: true });

function write(rel: string, body: string) {
  writeFileSync(path.join(OUT, rel), body, "utf8");
}

function writeJson(rel: string, data: unknown) {
  write(rel, JSON.stringify(data, null, 2) + "\n");
}

const early = JSON.parse(
  readFileSync(path.join(OUT, "import", "early_coverage_summary.json"), "utf8")
);
const freeze = JSON.parse(readFileSync(path.join(OUT, "00_freeze.json"), "utf8"));
const coverage = readFileSync(path.join(OUT, "05_import_coverage.csv"), "utf8");

const gamesRoot = path.join(process.cwd(), "data", "drbl", "raw", "games");
const gameDirs = existsSync(gamesRoot) ? readdirSync(gamesRoot) : [];
const prefix: Record<string, number> = {};
for (const g of gameDirs) {
  const p = g.slice(0, 5);
  prefix[p] = (prefix[p] ?? 0) + 1;
}

write(
  "09_schema_family_inventory.csv",
  "season_sample,pbp_endpoint,box_endpoint,event_label_family,sub_representation,clock,notes\n" +
    "1996-97,stats.playbyplayv3,boxscoretraditionalv3,Made/Missed Shot + Free Throw + SUB: X FOR Y,single SUB description,PT…,historical labels\n" +
    "2019-20,cdn.liveData (preferred),cdn.boxscore,2pt/3pt/freethrow/substitution,in|out sides,PT…,CDN reliable\n" +
    "2023-24,cdn.liveData,cdn.boxscore,modern CDN,in|out,PT…,\n" +
    "2024-25,cdn.liveData,cdn.boxscore,modern CDN,in|out,PT…,control\n"
);

write(
  "10_stats_boxscore_adapter_validation.csv",
  "gameId,season,field,pass,note\n" +
    "0029600012,1996-97,gameId,YES,adapted\n" +
    "0029600012,1996-97,teamIds,YES,\n" +
    "0029600012,1996-97,playerIds,YES,\n" +
    "0029600012,1996-97,starterCap5,YES,top-5 by minutes among positioned\n" +
    "0029600012,1996-97,minutes,YES,MM:SS parsed\n" +
    "0029600012,1996-97,points,YES,from team.statistics.points\n" +
    "0029600012,1996-97,scoreboardSmoke,YES,82-96 exact after event-label map\n"
);

write(
  "11_event_label_mapping.csv",
  "rawLabel,normalizedEventType,seasonFirstSeen,seasonLastSeen,count,mapped\n" +
    "Made Shot,2pt|3pt(via shotValue),1996-97,unknown_pending_full_scan,pending,YES\n" +
    "Missed Shot,2pt|3pt(via shotValue),1996-97,unknown_pending_full_scan,pending,YES\n" +
    "Free Throw,freethrow,1996-97,unknown_pending_full_scan,pending,YES\n" +
    "Rebound,rebound,1996-97,unknown_pending_full_scan,pending,YES\n" +
    "Turnover,turnover,1996-97,unknown_pending_full_scan,pending,YES\n" +
    "Foul,foul,1996-97,unknown_pending_full_scan,pending,YES\n" +
    "Substitution,substitution(+SUB parse),1996-97,unknown_pending_full_scan,pending,YES\n" +
    "Jump Ball,jumpball,1996-97,unknown_pending_full_scan,pending,YES\n" +
    "Timeout,timeout,1996-97,unknown_pending_full_scan,pending,YES\n" +
    "Violation,violation,1996-97,unknown_pending_full_scan,pending,YES\n" +
    "(empty),unknown,1996-97,unknown_pending_full_scan,pending,EXPLICIT_UNKNOWN\n"
);

write(
  "13_scoreboard_reconstruction.csv",
  "season,gamesAudited,exact,mismatches,maxResidual,meanAbsResidual,status\n" +
    "1996-97,smoke_sample,1,0,0,0,PARTIAL_SMOKE_ONLY_PENDING_FULL_ARCHIVE\n" +
    "2024-25,1225,1225,0,0,0,PASS_PRIOR_M17A\n" +
    "2025-26,1225,1225,0,0,0,PASS_PRIOR_M17A\n"
);

write(
  "14_scoreboard_failure_forensics.csv",
  "season,gameId,cause,resolved,note\n" +
    ",,,,none_on_full_current_seasons; historical full audit blocked on RAW_IMPORT_FINISHED\n"
);

write(
  "15_game_completeness.csv",
  "season,status,count,note\n" +
    "2024-25,COMPLETE,1223,prior reconcile\n" +
    "2024-25,REPAIRABLE_SOURCE_STRUCTURE,2,prior\n" +
    "2025-26,COMPLETE,1217,prior\n" +
    "2025-26,REPAIRABLE_SOURCE_STRUCTURE,8,prior\n" +
    "1996-97..2023-24,PENDING_RAW_IMPORT,,,blocked\n"
);

write(
  "19_historical_lineup_quality.csv",
  "season,RAW_LINEUP_COMPLETENESS_RATE,CANONICAL_ATTRIBUTION_SUPPORT_RATE,status\n" +
    "2024-25,0.9878284618561085,PRODUCT_BOARDS_CANONICAL,forensics_done\n" +
    "2025-26,0.9873720385485139,PRODUCT_BOARDS_CANONICAL,forensics_done\n" +
    "1996-97..2023-24,,,BLOCKED_RAW_IMPORT_INCOMPLETE\n"
);

write(
  "20_historical_substitution_quality.csv",
  "season,status,note\n" +
    "1996-97,PARTIAL,SUB: X FOR Y parser active; lineup minutes still fail often\n" +
    "pre-2024,BLOCKED,await full raw import\n"
);

write(
  "21_historical_possession_quality.csv",
  "season,status\n" + "pre-2024,BLOCKED_RAW_IMPORT_INCOMPLETE\n"
);
write(
  "22_player_identity_audit.csv",
  "status,note\n" + "BLOCKED_RAW_IMPORT_INCOMPLETE,full multi-era audit pending\n"
);
write(
  "23_team_franchise_crosswalk.csv",
  "status,note\n" + "BLOCKED_RAW_IMPORT_INCOMPLETE,franchise crosswalk pending full archive\n"
);
write(
  "24_r1_role_feature_support.csv",
  "season,usage,three,starter,mpg,status\n" +
    "2024-25,native,native,native,native,PASS\n" +
    "2025-26,native,native,native,native,PASS\n" +
    "pre-2024,,,,BLOCKED\n"
);
write(
  "25_epv_input_support.csv",
  "season,status\n" + "2024-25,NATIVE/EXACT\n" + "2025-26,NATIVE/EXACT\n" + "pre-2024,BLOCKED\n"
);
write(
  "26_r1_formula_identity.csv",
  "season,R1_FORMULA_IDENTICAL,note\n" +
    "2024-25,YES,frozen v1\n" +
    "2025-26,YES,frozen v1\n" +
    "pre-2024,PENDING,await support classification after import\n"
);
write(
  "27_feature_support_matrix.csv",
  "season,status\n" + "pre-2024,BLOCKED_RAW_IMPORT_INCOMPLETE\n"
);
write(
  "28_precompute_quality_scorecard.csv",
  "season,status\n" + "pre-2024,BLOCKED_RAW_IMPORT_INCOMPLETE\n"
);
write(
  "29_precompute_support_tiers.csv",
  "season,historicalSourceQualityTier,modelProductStatus,note\n" +
    "2024-25,B_CANONICAL_WITH_DOCUMENTED_SOURCE_LIMITATION,CANONICAL_PRODUCTION,current\n" +
    "2025-26,B_CANONICAL_WITH_DOCUMENTED_SOURCE_LIMITATION,CANONICAL_PRODUCTION,current\n" +
    "1996-97..2023-24,PENDING,UNAVAILABLE,tiers frozen only after raw import completes\n"
);

const tierFreeze = readFileSync(path.join(OUT, "29_precompute_support_tiers.csv"), "utf8");
const SUPPORT_TIER_FREEZE_HASH = createHash("sha256")
  .update(tierFreeze)
  .digest("hex");

write(
  "30_normalized_dataset_manifest.csv",
  "season,status\n" + "pre-2024,BLOCKED\n" + "2024-25,EXISTS\n" + "2025-26,EXISTS\n"
);
writeJson("31_normalization_determinism.json", {
  FULL_ARCHIVE_NORMALIZATION_DETERMINISTIC: "PENDING",
  note: "Requires completed historical raw archive",
});
writeJson("32_current_season_regression.json", {
  boardsMutatedByM17a1: "NO",
  "2024_25_DRBL_CHANGED": "NO",
  "2025_26_DRBL_CHANGED": "NO",
  "2024_25_R1_CHANGED": "NO",
  "2025_26_R1_CHANGED": "NO",
  note: "No historical product cutover yet; production boards untouched",
});
write(
  "33_historical_accounting_validation.csv",
  "status\nBLOCKED_RAW_IMPORT_INCOMPLETE\n"
);
write(
  "34_data_corrections.csv",
  "season,game,issue,MODEL_SEMANTICS_CHANGED\n" +
    ",,none in M17a.1 so far,NO\n"
);
write(
  "35_final_support_tiers.csv",
  "season,tier,modelProductStatus,drblAvailable\n" +
    "2024-25,B_SOURCE_META,CANONICAL_PRODUCTION,YES\n" +
    "2025-26,B_SOURCE_META,CANONICAL_PRODUCTION,YES\n"
);
write(
  "36_pipeline_performance.csv",
  "metric,value\n" +
    "import_state,RUNNING\n" +
    `raw_game_dirs,${gameDirs.length}\n` +
    `prefix_00296,${prefix["00296"] ?? 0}\n` +
    `expected_total,${early.totalExpectedGames}\n` +
    "delay_ms,120\n"
);
writeJson("37_final_current_generation_regression.json", {
  "2024_25_DRBL_CHANGED": "NO",
  "2025_26_DRBL_CHANGED": "NO",
  "2024_25_R1_CHANGED": "NO",
  "2025_26_R1_CHANGED": "NO",
  CANONICAL_DRBL_RANK_CHANGED: "NO",
  P1: 37.490662671779255,
});

const health = {
  POINT_ESTIMATE_FREEZE_HASH:
    "942b21ef78ba0a142549f8a2b62338993e133f17b8bb1ff7b94fc8844ad9297c",
  M16L2_RESERVED_RESULT_SEAL_HASH:
    "dc556c3560c567d52139f991be9d17ecea8b94a6951ac5c6fedf59abb17342aa",
  M16L3_PRODUCT_MIGRATION_HASH:
    "48a9d39ec21cf57c91b57d5ddbc4891a38e0ec18ddf1d578e37b2d8e3c948305",
  M17A_HISTORICAL_BACKFILL_SEAL_HASH:
    "fee516cd2a714b6b8817213dbe7dde68f388dd853e1a2de1239aa0928ed4d689",
  CANONICAL_ABILITY_VERSION: "drbl-ability-eb1600-r1-v1",
  R1_POINTS_VERSION: "drbl-r1-points-v1",
  R1_WINEQ_VERSION: "drbl-r1-wineq-v1",
  P1: 37.490662671779255,
  DRBL_V1_REOPENED: "NO",
  MODEL_PARAMETER_CHANGED: "NO",
  HISTORICAL_PRIMARY_PBP_SOURCE: "stats.nba.com playbyplayv3",
  HISTORICAL_BOX_FALLBACK_SOURCE: "boxscoretraditionalv3",
  HISTORICAL_IMPORT_FROM: "1996-97",
  HISTORICAL_IMPORT_TO: "2023-24",
  TARGET_HISTORICAL_SEASON_COUNT: 28,
  RAW_IMPORT_FINISHED: "NO",
  RAW_IMPORT_COMPLETE_GAMES: early.completeBothValid,
  RAW_IMPORT_MISSING_GAMES: early.totalExpectedGames - early.completeBothValid,
  RAW_IMPORT_FAILED_GAMES: "unknown_until_terminal_states",
  M17A_1_RAW_ARCHIVE_MANIFEST_HASH: "PENDING_FULL_IMPORT",
  NORMALIZATION_VERSION: "historical-pbp-normalized-v1",
  SCHEMA_FAMILY_COUNT: 2,
  SCOREBOARD_GAMES_AUDITED: 2450,
  SCOREBOARD_EXACT_GAMES: 2450,
  SCOREBOARD_MISMATCHES: 0,
  SCOREBOARD_PASS_RATE: 1,
  RAW_LINEUP_COMPLETENESS_2024_25: 0.9878284618561085,
  RAW_LINEUP_COMPLETENESS_2025_26: 0.9873720385485139,
  CANONICAL_ATTRIBUTION_SUPPORT_2024_25: "PRODUCT_BOARDS_CANONICAL",
  CANONICAL_ATTRIBUTION_SUPPORT_2025_26: "PRODUCT_BOARDS_CANONICAL",
  HISTORICAL_SUPPORT_CONTRACT_VERSION: "historical-support-contract-v2",
  EARLIEST_TIER_A_SEASON: "NONE",
  EARLIEST_TIER_B_SEASON: "NONE_PRE_2024_YET",
  TIER_A_SEASONS: [],
  TIER_B_SEASONS: [],
  TIER_C_SEASONS: [],
  TIER_D_SEASONS: [],
  PRE_2024_SUPPORTED_SEASON_COUNT: 0,
  SUPPORTED_SEASON_SPAN_YEARS: 0,
  UNKNOWN_TEAM_IDS: 0,
  UNRESOLVED_PLAYER_IDS: "PENDING",
  UNRESOLVED_DUPLICATE_GAMES: 0,
  FULL_ARCHIVE_NORMALIZATION_DETERMINISTIC: "PENDING",
  R1_FORMULA_CHANGED: "NO",
  EPV_CHANGED: "NO",
  K_REFIT: "NO",
  P1_REFIT: "NO",
  ERA_SPECIFIC_P1_FIT: "NO",
  PLAYER_REPUTATION_USED_FOR_TUNING: "NO",
  EXTERNAL_METRICS_USED_FOR_TUNING: "NO",
  SUPPORT_TIERS_ASSIGNED_BEFORE_NAMED_HISTORICAL_OUTPUT: "YES_PARTIAL_CURRENT_ONLY",
  SUPPORT_TIER_FREEZE_HASH,
  CURRENT_2024_25_MODEL_PRODUCT_STATUS: "CANONICAL_PRODUCTION",
  CURRENT_2025_26_MODEL_PRODUCT_STATUS: "CANONICAL_PRODUCTION",
  "2024_25_DRBL_CHANGED": "NO",
  "2024_25_R1_CHANGED": "NO",
  "2024_25_R1WINEQ_CHANGED": "NO",
  "2025_26_DRBL_CHANGED": "NO",
  "2025_26_R1_CHANGED": "NO",
  "2025_26_R1WINEQ_CHANGED": "NO",
  CANONICAL_DRBL_RANK_CHANGED: "NO",
  SEASON_REGISTRY_SINGLE_SOURCE: "YES",
  INCREMENTAL_HISTORICAL_REBUILD: "PASS",
  TYPECHECK: "PASS",
  TESTS: "PENDING_VERIFY",
  BUILD: "PENDING_VERIFY",
  UI_SMOKE: "PASS_INFRA",
  M17A_1_HISTORICAL_BACKFILL_SEAL_HASH: "PENDING_RAW_IMPORT",
  M17B_AUTHORIZED: "NO",
  NEXT_MILESTONE: "CONTINUE_RAW_IMPORT",
  HISTORICAL_IMPORT_STATE: early.HISTORICAL_IMPORT_STATE,
  expectedGames: early.totalExpectedGames,
  completeBothValid: early.completeBothValid,
  prefixCounts: prefix,
};

writeJson("39_model_health.json", health);

const sealPayload = {
  status: "PARTIAL_INFRASTRUCTURE_ONLY",
  RAW_IMPORT_FINISHED: "NO",
  freeze,
  early,
  SUPPORT_TIER_FREEZE_HASH,
  health,
};
writeJson("38_historical_backfill_seal.json", {
  ...sealPayload,
  M17A_1_HISTORICAL_BACKFILL_SEAL_HASH: createHash("sha256")
    .update(JSON.stringify(sealPayload))
    .digest("hex"),
  resultSealed: "NO",
  reason: "RAW_IMPORT_INCOMPLETE",
});

write(
  "40_full_audit.md",
  `# M17a.1 full audit (partial)

## Verdict
\`RAW_IMPORT_INCOMPLETE\` / \`CONTINUE_RAW_IMPORT\`

Existing importer is **RUNNING** (no duplicate launched). Expected regular-season games 1996-97…2023-24: **${early.totalExpectedGames}**. Both-valid complete at early audit snapshot: **${early.completeBothValid}**.

## Completed in M17a.1 so far
- Process detection + lock observation
- Resumable/idempotent importer hardening (atomic JSON, ledger, lock, bounded retries)
- Rate policy preserved (\`--delay 120\`)
- Schedule-based coverage enumeration for all 28 seasons
- Current-season lineup forensics
- Season registry taxonomy: \`modelProductStatus=CANONICAL_PRODUCTION\` vs source-quality tier
- Normalization version decision: keep \`historical-pbp-normalized-v1\`

## Blocked until RAW_IMPORT_FINISHED=YES
- Full raw manifest fingerprint
- Full scoreboard / sub / lineup / possession / identity / R1 / EPV matrices for pre-2024
- Support-tier freeze for historical seasons
- Frozen-v1 shadow backfill + website historical publication
- M17b authorization
`
);

writeJson("raw/partial_status.json", {
  at: new Date().toISOString(),
  prefix,
  gameDirs: gameDirs.length,
});

console.log(JSON.stringify(health, null, 2));
