/**
 * M18b.0 — Tracking acquisition + spatial identification readiness.
 * Inventory/contracts only. Does not download proprietary feeds or retune UIR/DRBL.
 *   npm run drbl:m18b_0
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdir, writeFile, access, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m18b_0");

const EXPECTED_M18A =
  "ba98a6529b18d63ab825eab92f1b606a974b4950b3d1c879eb5378054427391f";
const EXPECTED_M17B =
  "b606cf603c7f10acbad9ad6fd1b1869d2f12fcfa4bd461a1e689b82477fb238c";

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
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
  const gitCommit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const dirty =
    execSync("git status --porcelain", { encoding: "utf8" }).trim().length > 0;
  const timestamp = new Date().toISOString();

  const m18a = JSON.parse(
    await readFile(path.join(ROOT, "reports/m18a/27_model_health.json"), "utf8")
  );
  if (m18a.M18A_SEAL_HASH !== EXPECTED_M18A) {
    throw new Error("M18A_SEAL_HASH mismatch");
  }
  if (m18a.M18A_RESERVED_VERDICT !== "STRONG_PASS") {
    throw new Error("M18a reserved verdict mismatch");
  }
  if (m18a.UIR_STATUS !== "PERSISTENT_PLAYER_RESIDUAL_ESTABLISHED") {
    throw new Error("UIR status mismatch");
  }
  if (m18a.OFFBALL_VALUE_ESTABLISHED !== "NO") {
    throw new Error("OFFBALL_VALUE_ESTABLISHED must remain NO");
  }
  if (m18a.M17B_MULTI_SEASON_VALIDATION_SEAL_HASH !== EXPECTED_M17B) {
    throw new Error("M17b seal mismatch");
  }

  const localDirs = {
    tracking: await exists(path.join(ROOT, "data/tracking")),
    sportvu: await exists(path.join(ROOT, "data/sportvu")),
    secondSpectrum: await exists(path.join(ROOT, "data/second-spectrum")),
    hawkEye: await exists(path.join(ROOT, "data/hawk-eye")),
  };

  // Local inventory: shot x/y in PBP/normalized; public aggregate helpers only
  const localTier = "T3_SHOT_LOCATION_ONLY + T2_API_AGGREGATES_AVAILABLE";
  const TRACKING_LOCAL_TIER = "T3";

  const freeze = {
    milestone: "M18b.0",
    timestamp,
    gitCommit,
    dirty,
    M18A_SEAL_HASH: EXPECTED_M18A,
    M18A_RESERVED_VERDICT: "STRONG_PASS",
    UIR_STATUS: "PERSISTENT_PLAYER_RESIDUAL_ESTABLISHED",
    UIR_SELECTED: m18a.UIR_SELECTED,
    UIR_LAMBDA: m18a.SELECTED_LAMBDA,
    OFFBALL_VALUE_ESTABLISHED: "NO",
    UIR_RELABELED_AS_OFFBALL: "NO",
    UIR_REFIT_FOR_TRACKING: "NO",
    M18A_UIR_CHANGED: "NO",
    DRBL_V1_REOPENED: "NO",
    K: 1600,
    P1: 37.490662671779255,
    CANONICAL_ABILITY_VERSION: "drbl-ability-eb1600-r1-v1",
    M17B_MULTI_SEASON_VALIDATION_SEAL_HASH: EXPECTED_M17B,
    M17C_STATUS: "AUTHORIZED_INDEPENDENT_PARALLEL_BRANCH",
    note: "Readiness / contracts only — no proprietary download, no UIR retune",
  };
  await writeFile(
    path.join(OUT, "00_freeze.json"),
    JSON.stringify(freeze, null, 2) + "\n"
  );

  await writeFile(
    path.join(OUT, "01_local_tracking_inventory.md"),
    `# Local tracking inventory (M18b.0)

## Summary

TRACKING_LOCAL_TIER = **T3_SHOT_LOCATION_ONLY** (with T2 public aggregate *API helpers*, no local T0/T1 archives)

| Path check | Present |
|---|---|
| \`data/tracking\` | ${localDirs.tracking} |
| \`data/sportvu\` | ${localDirs.sportvu} |
| \`data/second-spectrum\` | ${localDirs.secondSpectrum} |
| \`data/hawk-eye\` | ${localDirs.hawkEye} |

## What exists in-repo

1. **Shot location x/y** in CDN/normalized PBP/events (not optical tracking).
2. **Public aggregate clients** in \`drbl/models/public-tracking.ts\` (\`leaguedashptstats\`, \`leaguehustlestatsplayer\`) — season totals, not frames.
3. **No** full-frame SportVU / Second Spectrum / Hawk-Eye raw files in this workspace.

## Classification

| Asset | Tier |
|---|---|
| Frame-level player+ball coordinates | T4 (absent locally) |
| Event-aligned spatial trajectories | T4 (absent) |
| Season tracking aggregates (API) | T2 (code only; not acquired as research corpus here) |
| Shot x/y | T3 |

Shot-location x/y is **not** classified as optical tracking.
`
  );

  await writeFile(
    path.join(OUT, "02_tracking_source_inventory.md"),
    `# Tracking source inventory (M18b.0)

Candidate sources evaluated without bypassing authentication or downloading proprietary feeds.

## 1. Public SportVU raw archives (2015-16)

| Field | Value |
|---|---|
| Provider/source | Historical SportVU logs mirrored on GitHub (e.g. linouk23/NBA-Player-Movements, neilmj/BasketballData, sealneaward/nba-movement-data) |
| Coverage seasons | Primarily **2015-16** (~636 games in common mirrors) |
| Resolution | ~25 Hz; player x/y; ball x/y/z typical |
| Access | Public GitHub mirrors of previously public NBA logs |
| License/redistribution | Research use of archived logs is common; respect mirror/repo licenses; do not treat as modern NBA commercial license |
| Overlap with M18a UIR seasons (2020-25) | **NONE** |
| Confidence | High that data exist; medium on perfect completeness |

**Role:** method prototype / alignment lab only — cannot mediate 2020–25 UIR.

## 2. stats.nba.com tracking aggregates (live)

| Field | Value |
|---|---|
| Provider | NBA Stats public API |
| Coverage | Multi-season through current |
| Resolution | **Season aggregates** (Drives, SpeedDistance, Hustle screen assists, defender-distance *buckets*) |
| Player/ball frame coordinates | NO |
| Access | Already used by repo helpers (\`public-tracking.ts\`) |
| Tier | **T2** |

**Role:** exploratory association features only — not counterfactual OBV / tracking EPV.

## 3. Second Spectrum / Sportradar optical (2017–~2023)

| Field | Value |
|---|---|
| Resolution | Full-frame optical (~25 Hz historically) |
| Public raw | **NO** (teams / licensees) |
| Academic/commercial access | Possible via institutional license (terms vary; not configured here) |
| Overlap with UIR seasons | Would cover 2020-21… if licensed |

## 4. Hawk-Eye Innovations pose tracking (2023-24+)

| Field | Value |
|---|---|
| Resolution | Multi-camera pose (vendor; ~60 Hz / keypoints reported publicly for teams) |
| Public raw | **NO** |
| Access | Team / licensed vendor only |
| Overlap with UIR reserved (2023-24→2024-25) | Ideal if licensed |

## 5. Broadcast-derived pseudo-tracking (SportsMOT / research video)

| Field | Value |
|---|---|
| Nature | Estimated trajectories from video; error vs optical must be quantified |
| Public research datasets | Partial / method samples |
| Sufficient for M18a UIR mediation | Unlikely without large labeled NBA coverage |

## Best candidate for UIR mediation

**Licensed modern optical (Second Spectrum archive and/or Hawk-Eye)** overlapping 2022-23…2024-25.

## Best candidate without credentials

**SportVU 2015-16 public archive** for \`M18b_1\` method prototype only.

TRACKING_SOURCE_CANDIDATE_COUNT = 5 (1 public T0 historical, 1 T2 live API, 2 commercial T0/T1, 1 pseudo)
FULL_FRAME_TRACKING_SOURCE_FOUND (local) = NO
FULL_FRAME_TRACKING_SOURCE_KNOWN (external) = YES (SportVU 15-16 public; modern commercial)
`
  );

  await writeFile(
    path.join(OUT, "03_tracking_data_contract.md"),
    `# Tracking data contract — target schema

Version: \`drbl-tracking-normalized-v1\` (design only; implement when T0/T1 acquired)

## Required fields

\`\`\`text
season
gameId
period
gameClock
frameTimestamp

playerId
teamId
x
y

ballX
ballY

homeAway
\`\`\`

After alignment (derived, not raw):

\`\`\`text
possessionId
offensePlayerIds[5]
defensePlayerIds[5]
\`\`\`

## Preferred

\`\`\`text
ballZ
shotClock
velocityX velocityY
acceleration
orientation
defensiveMatchupId
sourceEventId
\`\`\`

## Coordinate convention (freeze before features)

- Units: **feet**
- Court: 94 × 50
- Baskets at (±41.75, 0) in half-court transforms as documented per adapter
- Canonical orientation: **offense always attacks +X** after period/side flip normalization
- Origin: mid-court (0,0) or basket-relative — adapter must declare one and convert
- Period flips / side changes must be applied before feature generation

## PBP ↔ tracking alignment architecture (design)

\`\`\`text
tracking frame
        ↓
game / period / clock
        ↓
normalized PBP (canonical; never mutated)
        ↓
possession
        ↓
lineup state (DRBL reconstruction)
        ↓
Approach-B attribution (read-only)
        ↓
sealed UIR-C join (player-season)
\`\`\`

### Clock synchronization

- Estimate per-game constant offset from shared events (makes/misses/TOs/rebounds/fouls)
- Report median / P95 / max offset; reject games with unstable offsets
- No manual per-player alignment
- Period boundaries audited separately (clock resets)

### Possession coverage classes

\`\`\`text
FULL_TRACKING | PARTIAL_TRACKING | NO_TRACKING | CLOCK_AMBIGUOUS
\`\`\`

### Lineup agreement

Compare tracking-observed 10 players vs DRBL lineup; report 10/10, 9/10, … — do **not** silently replace canonical DRBL lineups.

### Candidate quality gates (freeze before player results)

\`\`\`text
>=99% game linkage
>=99% player ID resolution
>=98% possession alignment
>=95% full-frame coverage (among linked possessions)
\`\`\`

Final thresholds may be tightened from source characteristics; never lowered because star results look good.

### Missing-frame policy

- Small interpolatable gaps: duration cap frozen before features (candidate ≤ 0.2 s)
- Larger gaps → PARTIAL or unusable possession
- Do not interpolate large gaps into fake continuous trajectories

### Physics sanity (versioned cleaner)

Flag teleports, impossible speeds, out-of-court coords, frozen zero-length paths, impossible ball locations — without over-filtering genuine sprint speeds.

## Non-goals

- Do not treat shot x/y as satisfying this contract
- Do not implement adapters for hypothetical unknown schemas
`
  );

  await writeFile(
    path.join(OUT, "04_tracking_player_crosswalk.csv"),
    "status,trackingPlayerId,nbaPlayerId,drblPlayerId,note\nNOT_RUN_NO_TRACKING_DATA,,,,No T0/T1 frames in workspace; crosswalk deferred until acquisition\n"
  );

  await writeFile(
    path.join(OUT, "05_lineup_tracking_agreement.csv"),
    "status,gameId,possessionId,trackingPlayers,drblPlayers,agreement\nNOT_RUN_NO_TRACKING_DATA,,,,,\n"
  );

  await writeFile(
    path.join(OUT, "06_spatial_feature_contract.md"),
    `# Spatial feature contract (measurements only)

These are **observables**, not value. No points assigned in M18b.0.

## Offense primitives (feasibility if T0/T1)

| Feature | Needs | Feasible with SportVU frames | Feasible with T2 aggregates |
|---|---|---|---|
| nearest-defender distance | player+ball frames | YES | PARTIAL (shot buckets only) |
| defender displacement | trajectories | YES | NO |
| team spacing area | 5 offensive coords | YES | NO |
| pairwise teammate distance | coords | YES | NO |
| paint / corner occupancy | coords | YES | NO |
| cut velocity / direction | trajectories | YES | NO |
| relocation distance | trajectories | YES | NO |
| screen geometry | trajectories + events | PARTIAL | PARTIAL (screen assists count) |
| roll/pop trajectory | trajectories | YES | NO |
| gravity prerequisites | counterfactual-ready geometry | PARTIAL (measure only) | NO |

## Defense primitives

| Feature | Needs | T0/T1 | T2 |
|---|---|---|---|
| help distance | coords | YES | NO |
| rotation distance/time | trajectories | YES | NO |
| rim / drive deterrence proxies | ball path + defenders | PARTIAL | NO |
| denial / passing-lane geometry | coords | YES | NO |
| closeout distance/time | trajectories | YES | NO |
| screen navigation / recovery | trajectories | YES | NO |

## Firewalls

- gravity ≠ mean defender distance alone
- spacing value ≠ mean teammate distance alone
- No UIR relabel as off-ball
`
  );

  await writeFile(
    path.join(OUT, "07_identity_leakage_protocol.md"),
    `# Identity leakage protocol (future M18b)

## Risk

A tracking model that includes raw player identity can learn “Player X is good” and attribute it to movement features.

## Required audits (when modeling starts)

1. **Player-neutral spatial state:** features computed from coordinates/roles without player ID in the value function.
2. **Cross-fitted identity:** if player effects exist, estimate OOF (never score a player with identity fit on their own evaluation frames).
3. **Role controls:** usage / three-rate / starter / mpg / creation axes — not listed position alone.
4. **Ablation:** drop identity; require spatial features retain predictive content.

## Forbidden

- Training on reserved season
- Tuning features by inspecting named leaderboards before freeze
`
  );

  await writeFile(
    path.join(OUT, "08_counterfactual_identification_risks.md"),
    `# Counterfactual identification risks

## Invalid baselines (do not use)

- remove the player
- freeze player in place
- teleport player
- replace with league-average coordinate without behavioral model

## Multi-agent interference

Changing one player’s path changes defenders, teammates, and ball-handler decisions. Holding nine players fixed is usually **not** a valid causal counterfactual.

## M18b Stage 1 stance

Prefer **association** tests:

\`\`\`text
Does UIR correlate with spatial behavior features
after role/context controls?
\`\`\`

Causal OBV / counterfactual tracking-EPV is **NOT** justified in M18b.0.

COUNTERFACTUAL_OBV_FEASIBLE = NOT_YET (requires licensed continuous tracking + behavioral model + identification strategy)
`
  );

  await writeFile(
    path.join(OUT, "09_proposed_tracking_eval_protocol.md"),
    `# Proposed tracking evaluation protocol (not executed)

## Branch A — Licensed modern optical (preferred for UIR mediation)

Contingent on user/license access covering ≥ 2022-23…2024-25.

Proposed (finalize only after actual coverage known):

\`\`\`text
TRAIN: earliest licensed seasons with stable provider
VALIDATION: middle season
RESERVED: latest season never opened for tracking-model selection
\`\`\`

Note: 2024-25 was consumed for **UIR** reserved validation; it is **not** automatically a pristine tracking holdout. Prefer a later season or a pre-registered tracking-only reserved window.

## Branch B — SportVU 2015-16 method prototype

\`\`\`text
TRAIN/VAL within 2015-16 games only
No claim about 2020–25 UIR mediation
\`\`\`

Authorize: \`M18b_1_TRACKING_METHOD_PROTOTYPE\` only.

## Stage plan (future)

1. **Stage 1 (association):** Off-Ball Behavior Index / separate features vs sealed UIR-C after role/context controls. Not causal OBV.
2. **Stage 2:** Research spatial value candidate \`OBV_CANDIDATE\` / \`tracking-epv-research-v1\` (isolated; never mutates canonical EPV).
3. **Stage 3:** Future outcomes: P_RAW vs P_RAW + spatial candidate; test whether spatial features shrink UIR’s incremental effect (mediation-*like* pattern; not claimed causal mediation).

## UIR join contract (no refit)

\`\`\`text
playerId, season, UIR-C, P_RAW, N, team, role features, tracking coverage
\`\`\`

UIR_REFIT_FOR_TRACKING = NO

## Sample planning (association)

Frames are clustered within player / game / team. Effective N ≪ frame count. Plan power on player-possession and player-season units with clustered SEs — not millions of frames as independent samples.

## Coverage bias protocol

Before inference, audit whether tracked players differ by minutes, role, team, starter status, usage, ability. Incomplete coverage can induce selection bias.

## Camera / provider era

If provider changes across seasons, do not treat raw feature means as comparable until normalized.

## Team scheme / role

Pre-register controls for team, role axes (usage, three-rate, starter, mpg, creation), possession context. Do not use listed position alone. Do not blindly residualize team if scheme mediates behavior of interest.

## Rules

- Freeze tracking features/model before reserved opens
- UIR-C sealed (λ=3200) — no refit for tracking
- Source selection before named player inspection
- Any tracking EPV = \`tracking-epv-research-v1\` only
`
  );

  await writeFile(
    path.join(OUT, "10_tracking_coverage_plan.csv"),
    [
      "plan,seasons,games_est,tier,uir_overlap,purpose,status",
      "LOCAL_WORKSPACE,NONE,0,T3/T4,0,none,CURRENT",
      "SPORTVU_2015_16_PUBLIC,2015-16,~636,T0,0,method_prototype,AVAILABLE_PUBLIC",
      "STATS_AGGREGATES_T2,2013-14→current,N/A,T2,full_player_seasons_possible,association_only,API_READY",
      "SECOND_SPECTRUM_LICENSED,2017→~2023,unknown_until_license,T0/T1,HIGH_IF_LICENSED,uir_mediation,REQUIRES_USER_ACCESS",
      "HAWKEYE_LICENSED,2023-24→,unknown_until_license,T0/T1,HIGH_IF_LICENSED,uir_mediation,REQUIRES_USER_ACCESS",
      "",
    ].join("\n")
  );

  await writeFile(
    path.join(OUT, "11_storage_and_acquisition_plan.md"),
    `# Storage and acquisition plan

## Do not start large downloads in M18b.0

No commercial acquisition attempted. No SportVU bulk mirror download started (confirm disk first).

## Rough sizes (order-of-magnitude)

| Source | Est. raw |
|---|---|
| SportVU one game (~25 Hz) | ~5–15 MB compressed typical in public mirrors |
| ~636 games (2015-16 mirror) | ~4–10 GB compressed; larger uncompressed |
| Modern optical full season | tens–hundreds of GB (vendor-dependent) |

## Before any download

1. Confirm free disk ≥ 2× estimated raw + normalized
2. Confirm license/ToS
3. Checkpointed resume plan
4. Rate limits

## Credentials needed for UIR-overlap validation

- Institutional / commercial license for Second Spectrum archive and/or Hawk-Eye exports
- Explicit permission for research join to PBP/DRBL IDs
- Minimum fields per \`03_tracking_data_contract.md\`
- Prefer seasons overlapping 2022-23, 2023-24, 2024-25+ 
`
  );

  const firewall = {
    DRBL_V1_REOPENED: "NO",
    M18A_UIR_CHANGED: "NO",
    UIR_REFIT_FOR_TRACKING: "NO",
    UIR_RELABELED_AS_OFFBALL: "NO",
    K_REFIT: "NO",
    P1_REFIT: "NO",
    R1_CHANGED: "NO",
    EPV_CHANGED: "NO",
    EXTERNAL_METRICS_USED_AS_TARGET: "NO",
    PLAYER_REPUTATION_USED_FOR_SOURCE_SELECTION: "NO",
    CURRENT_PRODUCTION_CHANGED: "NO",
    PROPRIETARY_DOWNLOAD_STARTED: "NO",
    ACCESS_CONTROL_BYPASSED: "NO",
  };
  await writeFile(
    path.join(OUT, "12_model_firewall.json"),
    JSON.stringify(firewall, null, 2) + "\n"
  );

  // Engineering
  let testsPass = false;
  let testCount = "";
  try {
    const out = execSync("npm run drbl:test", {
      encoding: "utf8",
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 180000,
      shell: process.platform === "win32" ? "cmd.exe" : undefined,
    });
    const blob = `${out}`;
    const m = blob.match(/tests\s+(\d+)/);
    const p = blob.match(/pass\s+(\d+)/);
    const f = blob.match(/fail\s+(\d+)/);
    testCount = p && m ? `${p[1]}/${m[1]}` : "unknown";
    testsPass = Boolean(p && m && p[1] === m[1] && (!f || f[1] === "0"));
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    const blob = `${err.stdout ?? ""}\n${err.stderr ?? ""}`;
    const m = blob.match(/tests\s+(\d+)/);
    const p = blob.match(/pass\s+(\d+)/);
    const f = blob.match(/fail\s+(\d+)/);
    testCount = p && m ? `${p[1]}/${m[1]}` : "unknown";
    testsPass = Boolean(p && m && p[1] === m[1] && (!f || f[1] === "0"));
  }
  let typecheck: "PASS" | "FAIL" = "FAIL";
  try {
    execSync("npx tsc --noEmit", { cwd: ROOT, stdio: "pipe", timeout: 120000 });
    typecheck = "PASS";
  } catch {
    typecheck = "FAIL";
  }

  const health: Record<string, unknown> = {
    M18A_SEAL_HASH: EXPECTED_M18A,
    M18A_RESERVED_VERDICT: "STRONG_PASS",
    UIR_STATUS: "PERSISTENT_PLAYER_RESIDUAL_ESTABLISHED",
    UIR_VERSION: "UIR-C / m18-lineup-impact-v1 OD combined + P_RAW+logN residualizer",
    UIR_LAMBDA: 3200,
    UIR_REFIT_FOR_TRACKING: "NO",
    OFFBALL_VALUE_ESTABLISHED: "NO",
    UIR_RELABELED_AS_OFFBALL: "NO",
    DRBL_V1_REOPENED: "NO",
    K: 1600,
    P1: 37.490662671779255,
    TRACKING_LOCAL_TIER: TRACKING_LOCAL_TIER,
    TRACKING_SOURCE_CANDIDATE_COUNT: 5,
    FULL_FRAME_TRACKING_SOURCE_FOUND: "NO",
    TRACKING_ACQUISITION_STATUS: "POSSIBLE_REQUIRES_USER_ACCESS",
    TRACKING_ACQUISITION_STATUS_DETAIL:
      "Modern T0/T1 needs license; SportVU 2015-16 public for method prototype only; T2 aggregates API-ready",
    TRACKING_SEASONS_AVAILABLE: "NONE_LOCAL",
    TRACKING_SEASONS_PUBLIC_HISTORICAL: "2015-16",
    TRACKING_GAMES_AVAILABLE: 0,
    PLAYER_COORDINATES_AVAILABLE: "NO",
    BALL_COORDINATES_AVAILABLE: "NO",
    FRAME_RATE: "NONE",
    PBP_TRACKING_ALIGNMENT_POSSIBLE: "UNKNOWN",
    PLAYER_ID_CROSSWALK_POSSIBLE: "UNKNOWN",
    UIR_OVERLAP_PLAYER_SEASONS: 0,
    SPATIAL_OFFENSE_FEATURES_FEASIBLE: "PARTIAL",
    SPATIAL_DEFENSE_FEATURES_FEASIBLE: "PARTIAL",
    TRACKING_EPV_FEASIBLE: "NO",
    COUNTERFACTUAL_OBV_FEASIBLE: "NOT_YET",
    M18B_METHOD_PROTOTYPE_AUTHORIZED: "YES",
    M18B_PLAYER_VALUE_VALIDATION_AUTHORIZED: "NO",
    READINESS_VERDICT: "TRACKING_ACCESS_REQUIRED",
    M17C_STATUS: "AUTHORIZED_INDEPENDENT_PARALLEL_BRANCH",
    EXTERNAL_METRICS_USED_AS_TARGET: "NO",
    PLAYER_REPUTATION_USED_FOR_SOURCE_SELECTION: "NO",
    CURRENT_PRODUCTION_CHANGED: "NO",
    TESTS: testsPass ? "PASS" : "FAIL",
    TEST_COUNT: testCount,
    TYPECHECK: typecheck,
    BUILD: "SKIPPED_NO_PRODUCT_CHANGE",
    NEXT_MILESTONE: "USER_TRACKING_ACCESS_STEP",
    ALTERNATE_NEXT_IF_NO_LICENSE: "M18b_1_TRACKING_METHOD_PROTOTYPE",
    PARALLEL_IF_BLOCKED: "M17c_EXTERNAL_COMMON_TARGET_BENCHMARK",
  };

  const sealHash = sha256(JSON.stringify(health));
  health.M18B_0_READINESS_SEAL_HASH = sealHash;

  await writeFile(
    path.join(OUT, "13_model_health.json"),
    JSON.stringify(health, null, 2) + "\n"
  );
  await writeFile(
    path.join(OUT, "15_readiness_seal.json"),
    JSON.stringify(
      {
        milestone: "M18b.0",
        sealedAt: new Date().toISOString(),
        freeze,
        health,
        M18B_0_READINESS_SEAL_HASH: sealHash,
      },
      null,
      2
    ) + "\n"
  );
  await writeFile(
    path.join(OUT, "14_full_audit.md"),
    `# M18b.0 full audit

## Verdict

\`TRACKING_ACQUISITION_STATUS = POSSIBLE_REQUIRES_USER_ACCESS\`

\`READINESS_VERDICT = TRACKING_ACCESS_REQUIRED\`

## Why

- Local workspace: **T3** shot x/y only; no T0/T1 frames.
- Public SportVU **2015-16** can authorize a **method prototype** but has **zero overlap** with sealed UIR seasons (2020–25).
- Mediating UIR requires licensed modern optical (Second Spectrum / Hawk-Eye) overlapping validation/reserved eras.
- T2 aggregates are insufficient for tracking-EPV / counterfactual OBV.
- Ordinary PBP cannot identify gravity/spacing/deterrence; UIR must not be relabeled as off-ball.

## What M18a established vs what M18b.0 asks

- M18a: persistent player residual beyond DRBL-P / P_RAW (**YES**).
- M18b.0: do we possess independent spatial evidence capable of explaining that residual? **Not yet in this workspace** (access required).

## Authorizations

- M18B_METHOD_PROTOTYPE_AUTHORIZED = YES
- M18B_PLAYER_VALUE_VALIDATION_AUTHORIZED = NO
- OFFBALL_VALUE_ESTABLISHED = NO
- M17C_STATUS = AUTHORIZED_INDEPENDENT_PARALLEL_BRANCH

## Engineering

- TESTS: ${testsPass ? "PASS" : "FAIL"} (${testCount})
- TYPECHECK: ${typecheck}
- BUILD: SKIPPED_NO_PRODUCT_CHANGE
- CURRENT_PRODUCTION_CHANGED: NO

## Next

USER_TRACKING_ACCESS_STEP (preferred), or M18b_1 method prototype on SportVU while access is pending; M17c remains available as parallel branch.

Seal: \`${sealHash}\`
`
  );

  console.log(
    JSON.stringify(
      {
        TRACKING_ACQUISITION_STATUS: health.TRACKING_ACQUISITION_STATUS,
        READINESS_VERDICT: health.READINESS_VERDICT,
        NEXT_MILESTONE: health.NEXT_MILESTONE,
        sealHash,
        testsPass,
        typecheck,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
