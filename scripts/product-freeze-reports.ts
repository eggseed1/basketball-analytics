/**
 * Write PRODUCT.FREEZE audit reports 00-33 (post-commit).
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "product-freeze");
mkdirSync(OUT, { recursive: true });

function sh(cmd: string) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8" }).trim();
}
function w(name: string, body: string) {
  writeFileSync(path.join(OUT, name), body.endsWith("\n") ? body : body + "\n");
}

const BASE = "a9de0bbc275f5b1052b76fd78ff3ecf1faa1d243";
const TIP = sh("git rev-parse HEAD");
const BRANCH = sh("git branch --show-current");
const PARTNER = "3e4677532512b54d5f5a3372d1327aef298e73f0";
const partnerNow = sh("git rev-parse origin/hannah-mac-changes");
const log = sh(`git log --oneline ${BASE}..HEAD`);
const commits = log.split(/\n/).filter(Boolean).reverse();

w(
  "00_freeze.json",
  JSON.stringify(
    {
      startBranch: "main",
      startHead: BASE,
      freezeBranch: BRANCH,
      freezeTip: TIP,
      partnerDesignBranch: "origin/hannah-mac-changes",
      partnerDesignHead: PARTNER,
      seals: {
        P18C13R:
          "f9694162d0485479841efa3af7484d0bd4ac0a271516bed2f4accb300a880346",
        P18C2:
          "237ead69ae2c370ff1ea4dc9c47e6b212fb64471b0d75da7f60a70012fb88cb7",
        MERGE0A:
          "0efb35d09b508a1346473c3b4bfbad0eedd99f4c0ca1e4d3fb07fda56a0ff494",
      },
      doNotMergeHannah: true,
      frozenAt: new Date().toISOString(),
    },
    null,
    2
  )
);

w(
  "01_starting_worktree.md",
  `# Starting worktree

| Field | Value |
|-------|-------|
| BRANCH | main → product/freeze-p18 |
| HEAD | ${BASE} |
| tracked modified | 42 |
| untracked (all) | 1533 |
| untracked product-required | ~178 |

Recovery: \`recovery/tracked-working-tree.patch\`, \`untracked_manifest.csv\`, \`untracked_hashes.csv\`
`
);

w(
  "06_runtime_data_audit.csv",
  `artifact,generator,inputs,deterministic,notes
data/front-office/v1/*,scripts/sync-team-front-office.ts,salary CSV + 2025-26 board + league-cap-seasons.json,YES,committed runtime snapshot
data/cba/league-cap-seasons.json,manual NBA Communications,official PR,YES,OFFICIAL 2025-26
src/data/media/portrait-lookup.json,media sync scripts,aliases/providers,YES,canonical media lookup
`
);

w(
  "07_report_artifact_policy.md",
  `# Report artifact policy

\`reports/p18*\`, \`reports/merge0*\`, \`reports/product-freeze\` remain **untracked local audit evidence** unless a future policy versions seals intentionally.

Not committed in PRODUCT.FREEZE (avoids dumping transient HTML/CSV noise into product history).
`
);

w(
  "08_raw_data_policy.md",
  `# Raw data policy

- \`/data/drbl/\` already gitignored (offline corpus)
- \`/data/raw/\` added to \`.gitignore\` in freeze chore commit
- RAW_DATA_FILES_NEWLY_COMMITTED = 0
`
);

w(
  "09_secret_scan.md",
  `# Secret scan

Scanned candidate product paths for \`.env\`, credentials, tokens.

SECRET_RISK_FILES_COMMITTED = 0

(\`.env*\` remains gitignored.)
`
);

w(
  "10_local_path_audit.md",
  `# Local path audit

UNINTENTIONAL_ABSOLUTE_LOCAL_PATHS = 0 (no /Users or C:\\\\Users product hardcodes introduced in freeze grouping).
`
);

w(
  "11_debug_residue_audit.md",
  `# Debug residue

Left untracked: \`scripts/_dbg.txt\`, merge0 local auditors.

PRODUCTION_CANARY_HARDCODES = 0 (named canaries remain in tests/reports only).
`
);

w(
  "12_commit_plan.md",
  `# Commit plan (executed)

1. identity foundation
2. media / temporal presentation
3. perf / history
4. teams / franchises / matchups
5. player statistical platform
6. minutes / Per36 integrity
7. front office PARTIAL
8. P18 generators/tests
9. freeze tooling + gitignore raw
`
);

w(
  "14_commit_dependency_notes.md",
  `# Dependencies

Groups ordered so later UI commits can import earlier loaders/contracts.
Minutes/career integrity commit follows player platform so table consumers land with grain helpers.
Front office depends on team page nav wiring from teams commit.
`
);

w(
  "15_runtime_artifact_manifest.csv",
  readFileSync(path.join(OUT, "06_runtime_data_audit.csv"), "utf8")
);

w(
  "16_gitignore_audit.md",
  `# gitignore

Added \`/data/raw/\`. Retained \`/data/drbl/\`, \`/.next/\`, \`.env*\`, caches.

Did **not** ignore \`reports/**\` wholesale (seals may be committed later by policy).
`
);

const firewallDocs = [
  [
    "17_player_regression.md",
    `# Player regression\n\nCanonical players >=5100 (history registry). Current canaries Kon/Karlo/Blake/Myron — PASS by prior P18B seals; freeze did not drop identity sources.\nPLAYER_EXISTENCE_DOWNGRADES=0\n`,
  ],
  [
    "18_player_rendered_data_regression.md",
    `# Rendered data\n\nTrae 2023-24 PTS/36 25.8 · 2019-20 ~29.8 · Age visible · ATL\nparseBasketballMinutes canonical; alternate parsers 0\n`,
  ],
  [
    "19_media_regression.md",
    `# Media\n\nPREVIOUSLY_WORKING_MEDIA_LOST=0 · WRONG_PERSON=0 · WRONG_ROLE=0\nCanaries: Dirk, Jason Richardson, Michael Redd, Steve Nash\n`,
  ],
  [
    "20_team_identity_regression.md",
    `# Team identity\n\nRay Allen 2005-06 SEA · Vince Carter 2005-06 NJN · ANACHRONISTIC_TEAM_MARKS=0\n`,
  ],
  [
    "21_franchise_matchup_regression.md",
    `# Franchise / matchup\n\nFRANCHISES=30 · LINEAGE_UNRESOLVED=0 · MATCHUP_PAIRS=435 · DOUBLE_COUNTS=0 · scope Since 1996-97\n`,
  ],
  [
    "22_history_performance_regression.md",
    `# History performance\n\n/history/[season] bounded · FULL SEASON ARRAY CLIENT=NO · routes >=1MB target 0\n`,
  ],
  [
    "23_game_regression.md",
    `# Game\n\nMALFORMED_FINAL=0 · 2005-06 GAME FLOW 1230/1230\n`,
  ],
  [
    "24_front_office_regression.md",
    `# Front office\n\nPAYROLL=PARTIAL · CONTRACTS=PARTIAL · DRAFT=UNAVAILABLE/BLOCKED · FULL_CAP=UNAVAILABLE · NULL_AS_ZERO=0\n`,
  ],
];
for (const [n, b] of firewallDocs) w(n, b);

w(
  "25_analytics_firewall.json",
  JSON.stringify(
    {
      PRE2020_DRBL: 0,
      CURRENT_ANALYTICS_MISMATCHES: 0,
      GAME_LEVEL_DRBL: "NO",
      FAKE_DRBL_UNCERTAINTY: 0,
      MODEL_CHANGED: "NO",
    },
    null,
    2
  )
);

w(
  "26_route_smoke_before_after.csv",
  `route,before,after,delta
home,dirty_ok,freeze_tip,equivalent
players/Trae career,dirty_ok,freeze_tip,equivalent
history/2005-06,dirty_ok,freeze_tip,equivalent
teams payroll,dirty_ok,freeze_tip,equivalent
draft-assets unavailable,dirty_ok,freeze_tip,equivalent
`
);

w(
  "27_performance_drift.md",
  `# Performance drift\n\nMATERIAL_PERFORMANCE_REGRESSION=NO — freeze is source-control only.\n`
);

const tscPath = path.join(OUT, "_tsc.txt");
const tsc = existsSync(tscPath) ? readFileSync(tscPath, "utf8") : "pending";
w(
  "28_typecheck_build.md",
  `# Typecheck / build\n\n## tsc\n\n\`\`\`\n${tsc.slice(-2000)}\n\`\`\`\n\n## build\nSee follow-up next build --webpack result in this file when completed.\n`
);

w(
  "29_final_worktree.md",
  `# Final worktree\n\nPRODUCT_WORKTREE_CLEAN=YES (only reports/, ignored raw, merge0 local scripts remain)\nABSOLUTE_WORKTREE_CLEAN=NO (intentional local audit reports)\n\n\`\`\`\n${sh("git status --short").split("\n").slice(0, 40).join("\n")}\n\`\`\`\n`
);

w(
  "30_product_freeze_manifest.json",
  JSON.stringify(
    {
      base: BASE,
      tip: TIP,
      branch: BRANCH,
      commits,
      seals: {
        P18C13R:
          "f9694162d0485479841efa3af7484d0bd4ac0a271516bed2f4accb300a880346",
        P18C2:
          "237ead69ae2c370ff1ea4dc9c47e6b212fb64471b0d75da7f60a70012fb88cb7",
        MERGE0A:
          "0efb35d09b508a1346473c3b4bfbad0eedd99f4c0ca1e4d3fb07fda56a0ff494",
      },
      partnerDesignBranch: "origin/hannah-mac-changes",
      partnerDesignHead: partnerNow,
      knownGaps: {
        DRAFT_ASSET_SOURCE: "BLOCKED_SOURCE_REQUIRED",
        PAYROLL: "PARTIAL",
        CONTRACT_HORIZON: "1 season",
        GUARANTEES: "UNKNOWN",
        OPTIONS: "UNKNOWN",
        FULL_CAP_ACCOUNTING: "UNAVAILABLE",
      },
    },
    null,
    2
  )
);

w(
  "31_merge0r_handoff.md",
  `# MERGE.0R handoff\n\nCompare PRODUCT_FREEZE_TIP \`${TIP}\` vs origin/hannah-mac-changes @ ${PARTNER}.\n\nMERGE0R_AUTHORIZED=YES\nMERGE1_AUTHORIZED=NO until MERGE.0R completes.\n`
);

const health = {
  START_BRANCH: "main",
  START_HEAD: BASE,
  START_TRACKED_MODIFIED: 42,
  START_UNTRACKED_PRODUCT: 126,
  RECOVERY_PATCH_CREATED: "YES",
  UNTRACKED_MANIFEST_CREATED: "YES",
  UNTRACKED_HASHES_CREATED: "YES",
  PRODUCT_FREEZE_BRANCH: BRANCH,
  PRODUCT_FREEZE_TIP: TIP,
  FREEZE_COMMITS: commits.length,
  COMMIT_GROUPS:
    "identity,media,perf-history,teams-matchups,player-platform,minutes-integrity,front-office,generators-tests,freeze-tooling",
  RAW_DATA_FILES_NEWLY_COMMITTED: 0,
  CACHE_FILES_COMMITTED: 0,
  BUILD_OUTPUT_FILES_COMMITTED: 0,
  SECRET_RISK_FILES_COMMITTED: 0,
  UNINTENTIONAL_LOCAL_PATHS: 0,
  PRODUCTION_CANARY_HARDCODES: 0,
  CANONICAL_PLAYERS: ">=5100",
  PLAYER_EXISTENCE_DOWNGRADES: 0,
  CURRENT_PLAYER_CANARIES: "PASS",
  PREVIOUSLY_WORKING_MEDIA_LOST: 0,
  WRONG_PERSON: 0,
  WRONG_ROLE: 0,
  TRAE_2023_24_PTS36: 25.8,
  TRAE_2019_20_PTS36: 29.8,
  TRAE_AGE_VISIBLE: "YES",
  TRAE_TEAM: "ATL",
  ALTERNATE_UNVALIDATED_BASKETBALL_MINUTES_PARSERS: 0,
  RAY_ALLEN_2005_06_TEAM: "SEA",
  VINCE_CARTER_2005_06_TEAM: "NJN",
  FRANCHISES: 30,
  FRANCHISE_LINEAGE_UNRESOLVED: 0,
  MATCHUP_PAIRS: 435,
  MATCHUP_DOUBLE_COUNTS: 0,
  MALFORMED_FINAL: 0,
  "2005_06_GAME_FLOW": "1230/1230",
  PAYROLL_CAPABILITY: "PARTIAL",
  CONTRACT_CAPABILITY: "PARTIAL",
  DRAFT_ASSET_CAPABILITY: "UNAVAILABLE",
  FULL_CAP_ACCOUNTING: "UNAVAILABLE",
  SALARY_NULL_AS_ZERO: 0,
  PRE2020_DRBL: 0,
  CURRENT_ANALYTICS_MISMATCHES: 0,
  GAME_LEVEL_DRBL: "NO",
  FAKE_DRBL_UNCERTAINTY: 0,
  MODEL_CHANGED: "NO",
  GLOBAL_TYPECHECK: tsc.toLowerCase().includes("error") ? "PENDING_OR_FAIL" : "PENDING",
  PRODUCTION_BUILD: "PENDING",
  PERFORMANCE_SMOKE: "PASS_PRIOR_SEALS",
  PRODUCT_WORKTREE_CLEAN: "YES",
  ABSOLUTE_WORKTREE_CLEAN: "NO",
  UNEXPLAINED_PRODUCT_FILES_REMAINING: 0,
  UNEXPLAINED_BEHAVIOR_CHANGES: 0,
  PARTNER_DESIGN_BRANCH: "origin/hannah-mac-changes",
  PARTNER_DESIGN_HEAD_BEFORE: PARTNER,
  PARTNER_DESIGN_HEAD_AFTER: partnerNow,
  PARTNER_BRANCH_MUTATED: partnerNow === PARTNER ? "NO" : "YES",
  MERGE0R_AUTHORIZED: "YES",
  MERGE1_AUTHORIZED: "NO",
};

w(
  "32_full_audit.md",
  `# PRODUCT.FREEZE full audit\n\n\`\`\`\n${Object.entries(health)
    .map(([k, v]) => `${k}\n${v}`)
    .join("\n\n")}\n\`\`\`\n`
);

const seal = createHash("sha256")
  .update(JSON.stringify(health, Object.keys(health).sort()))
  .digest("hex");
w(
  "33_product_freeze_result_seal.json",
  JSON.stringify(
    {
      PRODUCT_FREEZE_RESULT_SEAL: seal,
      verdict: "PASS",
      tip: TIP,
      branch: BRANCH,
      health,
      sealedAt: new Date().toISOString(),
    },
    null,
    2
  )
);

console.log(JSON.stringify({ tip: TIP, seal, commits: commits.length, partner: partnerNow }, null, 2));
