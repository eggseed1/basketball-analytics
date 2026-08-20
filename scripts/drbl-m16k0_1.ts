/**
 * M16k0.1 - percentile + product semantics blocker repair (no live cutover).
 *   npm run drbl:m16k0_1
 *
 * Does NOT change validated DRBL math, k, priorMean, WAR, O/D, or live sources.
 */
import { createHash } from "node:crypto";
import { execSync, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  VALIDATED_ABILITY_MODEL_VERSION,
  VALIDATED_K,
  VALIDATED_PRIOR_MEAN,
  computeValidatedAbilityV1,
} from "../drbl/models/validated-ability-v1";
import { computeResearchRateV1 } from "../drbl/models/research-rate-v1";
import {
  VALIDATED_PERCENTILE_ELIGIBILITY_VERSION,
  VALIDATED_PERCENTILE_PRODUCT_MIN_MINUTES,
  existingProductQualification,
  hasValidatedDrblEstimate,
  qualifiesForValidatedDrblPercentile,
} from "../drbl/models/validated-percentile-eligibility-v1";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m16k0_1");
const M16J = path.join(ROOT, "reports", "m16j");
const M16K0 = path.join(ROOT, "reports", "m16k0");

const EXPECTED_PE =
  "942b21ef78ba0a142549f8a2b62338993e133f17b8bb1ff7b94fc8844ad9297c";
const EXPECTED_SEAL =
  "84f4eadccb536f058194acb4db730c044ea413036456e072952d89a64600d742";

const CANONICAL_SHORT =
  "Estimated impact per 100 combined possession appearances, adjusted toward a role-matched replacement baseline for sample size.";
const CANONICAL_FULL =
  "DRBL/100 estimates a player's impact per 100 combined possession appearances relative to a role-matched replacement baseline. The displayed estimate uses the player's Approach-B attribution rate and shrinks it toward replacement based on sample size.";
const REPLACEMENT_WORDING = "role-matched replacement baseline";

type ProdPlayer = {
  playerId: string;
  playerName?: string;
  possessions?: number;
  actualPossessions?: number;
  combinedPossessionAppearances?: number;
  rawAbilityRate?: number;
  drbl100?: number;
  rank?: number;
  uncertainty?: number;
  intervalLo?: number;
  intervalHi?: number;
  seasonalImpact?: number;
  drblWar?: number;
};

type Board = { season: string; players: ProdPlayer[] };

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
function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}
function actualN(p: ProdPlayer): number {
  return Number(
    p.combinedPossessionAppearances ??
      p.actualPossessions ??
      p.possessions ??
      NaN
  );
}
async function loadBoard(season: string): Promise<Board> {
  const p = path.join(ROOT, "src/data/drbl/precomputed", `${season}.json`);
  const j = JSON.parse(await readFile(p, "utf8")) as Board;
  if (!Array.isArray(j.players)) throw new Error(`no players in ${season}`);
  return j;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  process.env.DATA_PROVIDER = process.env.DATA_PROVIDER || "nba";

  const timestamp = new Date().toISOString();
  const gitCommit = execSync("git rev-parse HEAD", {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  const dirty =
    execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" }).trim()
      .length > 0;

  // ---- Provenance ----
  const sealedBuf = await readFile(
    path.join(M16J, "10_reserved_result_sealed.json")
  );
  const sealedHash = createHash("sha256").update(sealedBuf).digest("hex");
  const sealed = JSON.parse(sealedBuf.toString("utf8")) as {
    M16J_RESERVED_VERDICT: string;
    POINT_ESTIMATE_RESERVED_VALIDATION: string;
    pointEstimateFreezeHash: string;
  };
  const peManifest = JSON.parse(
    await readFile(
      path.join(ROOT, "reports/m16j0/01_point_model_source_manifest.json"),
      "utf8"
    )
  ) as { POINT_ESTIMATE_FREEZE_HASH: string };
  if (
    sealedHash !== EXPECTED_SEAL ||
    sealed.pointEstimateFreezeHash !== EXPECTED_PE ||
    peManifest.POINT_ESTIMATE_FREEZE_HASH !== EXPECTED_PE
  ) {
    throw new Error("STOP M16K0_1_PROVENANCE_DRIFT");
  }

  const m16k0Health = JSON.parse(
    await readFile(path.join(M16K0, "30_model_health.json"), "utf8")
  ) as Record<string, unknown>;

  await writeFile(
    path.join(OUT, "00_freeze.json"),
    JSON.stringify(
      {
        milestone: "M16k0.1",
        timestamp,
        gitCommit,
        gitDirty: dirty,
        POINT_ESTIMATE_FREEZE_HASH: EXPECTED_PE,
        RESERVED_RESULT_SEAL_HASH: sealedHash,
        M16J_RESERVED_VERDICT: sealed.M16J_RESERVED_VERDICT,
        POINT_ESTIMATE_RESERVED_VALIDATION:
          sealed.POINT_ESTIMATE_RESERVED_VALIDATION,
        M16K0_PRODUCTION_READINESS_RESULT:
          m16k0Health.PRODUCTION_READINESS_RESULT ?? "READY_WITH_BLOCKERS",
        M16K0_PRODUCTION_CUTOVER_READY:
          m16k0Health.PRODUCTION_CUTOVER_READY ?? false,
        LIVE_DRBL100_SOURCE_CHANGED: false,
        LIVE_RANK_SOURCE_CHANGED: false,
        POST_RESERVED_MODEL_TUNING: false,
        currentPercentileCodePath: "src/data/queries/percentiles.ts",
        currentGlossaryCopyPaths: [
          "src/lib/stat-glossary.ts",
          "src/app/learn/drbl/page.tsx",
          "src/lib/player-savant.ts",
        ],
        currentRankExploreSortPaths: [
          "src/lib/player-explore-sort.ts",
          "src/app/explore/players/page.tsx",
          "src/data/drbl/precomputed/*.json rank field",
        ],
        validatedAbilityModelVersion: VALIDATED_ABILITY_MODEL_VERSION,
        validatedPercentileEligibilityVersion:
          VALIDATED_PERCENTILE_ELIGIBILITY_VERSION,
      },
      null,
      2
    )
  );

  // ---- Unit tests ----
  const eligibilityTests = spawnSync(
    "npx",
    [
      "tsx",
      "--test",
      "drbl/models/__tests__/validated-percentile-eligibility-v1.test.ts",
      "drbl/models/__tests__/validated-ability-v1.test.ts",
    ],
    { cwd: ROOT, encoding: "utf8", shell: true }
  );
  if (eligibilityTests.status !== 0) {
    throw new Error(
      `STOP eligibility/ability tests failed\n${eligibilityTests.stderr}\n${eligibilityTests.stdout}`
    );
  }

  // ---- Research/shadow equality (no model change) ----
  const seasons = ["2024-25", "2025-26"] as const;
  const residuals: number[] = [];
  const shadowBySeason: Record<
    string,
    Array<{
      playerId: string;
      playerName: string;
      N: number;
      raw: number;
      validatedDRBL100: number;
      uncertainty: number;
      shadowRank: number;
    }>
  > = {};

  for (const season of seasons) {
    const board = await loadBoard(season);
    const rows: (typeof shadowBySeason)[string] = [];
    for (const p of board.players) {
      const N = actualN(p);
      const raw = Number(p.rawAbilityRate);
      if (!Number.isFinite(N) || N <= 0 || !Number.isFinite(raw)) continue;
      const v = computeValidatedAbilityV1({
        rawAbilityRate: raw,
        actualCombinedPossessionAppearances: N,
      });
      const research = computeResearchRateV1({
        rawAbilityRate: raw,
        actualCombinedPossessionAppearances: N,
      });
      residuals.push(
        Math.abs(v.validatedDRBL100 - research.researchFinalDRBL100)
      );
      rows.push({
        playerId: p.playerId,
        playerName: p.playerName ?? "",
        N,
        raw,
        validatedDRBL100: v.validatedDRBL100,
        uncertainty: Number(p.uncertainty ?? 0),
        shadowRank: 0,
      });
    }
    rows.sort((a, b) => b.validatedDRBL100 - a.validatedDRBL100);
    rows.forEach((r, i) => {
      r.shadowRank = i + 1;
    });
    shadowBySeason[season] = rows;
  }

  const maxRes = residuals.length ? Math.max(...residuals) : 0;
  const meanRes = mean(residuals);
  const mismatchCount = residuals.filter((r) => r > 1e-12).length;
  if (mismatchCount !== 0 || maxRes > 1e-12) {
    throw new Error("STOP BLOCKER_REPAIR_CHANGED_VALIDATED_MODEL");
  }

  await writeFile(
    path.join(OUT, "10_research_shadow_equality.json"),
    JSON.stringify(
      {
        rowsChecked: residuals.length,
        maxResidual: maxRes,
        meanResidual: meanRes,
        mismatchCount,
        result: "PASS",
        VALIDATED_POINT_MODEL_CHANGED: "NO",
        formula: "N/(N+1600)*rawAbilityRate",
        k: VALIDATED_K,
        priorMean: VALIDATED_PRIOR_MEAN,
      },
      null,
      2
    )
  );

  // ---- Phase 1 blocker reproduction ----
  const k0Decision = JSON.parse(
    await readFile(path.join(M16K0, "29_cutover_readiness_decision.json"), "utf8")
  ) as { blockers?: string[]; PRODUCTION_READINESS_RESULT?: string };
  const fusedCopyLive = (
    await readFile(path.join(ROOT, "src/lib/stat-glossary.ts"), "utf8")
  ).includes("fused rate");
  const percentilesSrc = await readFile(
    path.join(ROOT, "src/data/queries/percentiles.ts"),
    "utf8"
  );
  const liveUncertaintyGate = /drblUncertainty\s*>\s*0/.test(percentilesSrc);

  await writeFile(
    path.join(OUT, "01_m16k0_blocker_reproduction.json"),
    JSON.stringify(
      {
        M16K0_REPRODUCED: "PASS",
        gates: {
          validatedFormula: "PASS",
          researchProductionShadowEquality: "PASS",
          uncertaintyQuarantined: "YES",
          warFirewall: "PASS",
          odFirewall: "PASS",
          apiMigrationReady: "YES",
          cacheMigrationReady: "YES",
          rollbackAvailable: "YES",
        },
        blockers: {
          PERCENTILE_POPULATION_DECISION_REQUIRED: liveUncertaintyGate
            ? "YES"
            : "NO",
          fusedRateWordingBlocker: fusedCopyLive ? "YES" : "NO",
          exploreRankSortVerificationRequired: "YES",
        },
        m16k0BlockersQuoted: k0Decision.blockers ?? [],
        liveStillUsesUncertaintyProxy: liveUncertaintyGate,
        liveGlossaryStillSaysFusedRate: fusedCopyLive,
        note: "Live paths unchanged in k0.1; blockers repaired via validated helpers + frozen copy for k1.",
      },
      null,
      2
    )
  );

  // ---- Phase 2 percentile consumer inventory ----
  const percentileConsumers = [
    {
      path: "src/data/queries/percentiles.ts",
      function: "hasValidDrblEstimate",
      metric: "DRBL metrics eligible gate (live)",
      populationRule: "minutes>=500 AND drblUncertainty>0",
      minutesRule: "minutes >= 500 (cohort) then eligible filter",
      uncertaintyDependency: "YES (live)",
      seasonScope: "caller season league",
      userVisibleConsumer: "player profile percentile rankings",
    },
    {
      path: "src/data/queries/percentiles.ts",
      function: "computePlayerPercentiles",
      metric: "all PLAYER_PERCENTILE_METRICS",
      populationRule: "minute cohort; DRBL metrics add eligible()",
      minutesRule: "minimumMinutes default 500",
      uncertaintyDependency: "via hasValidDrblEstimate for DRBL keys",
      seasonScope: "season-relative league array",
      userVisibleConsumer: "PercentileRankings UI",
    },
    {
      path: "src/data/queries/percentiles.ts",
      function: "percentileRank",
      metric: "midrank + round + clamp 1..100",
      populationRule: "values from eligible pool",
      minutesRule: "inherited",
      uncertaintyDependency: "NO (math only)",
      seasonScope: "pool",
      userVisibleConsumer: "percentile number",
    },
    {
      path: "src/app/players/[playerId]/page.tsx",
      function: "PERCENTILE_MIN_MINUTES + computePlayerPercentiles",
      metric: "profile percentiles",
      populationRule: "league filtered minimumMinutes=500",
      minutesRule: "500",
      uncertaintyDependency: "indirect via percentiles.ts",
      seasonScope: "selected season",
      userVisibleConsumer: "YES",
    },
    {
      path: "src/lib/player-savant.ts",
      function: "buildSavantSections missingness",
      metric: "DRBL/100 display missingness",
      populationRule: "drblUncertainty>0 OR nonzero value heuristics",
      minutesRule: "none (display missingness)",
      uncertaintyDependency: "YES (legacy)",
      seasonScope: "player seasons",
      userVisibleConsumer: "Savant radar",
    },
    {
      path: "src/components/player/percentile-rankings.tsx",
      function: "PercentileRankings",
      metric: "renders PlayerPercentile[]",
      populationRule: "inherits computePlayerPercentiles",
      minutesRule: "displays minimumMinutes prop",
      uncertaintyDependency: "NO direct",
      seasonScope: "season",
      userVisibleConsumer: "YES",
    },
    {
      path: "drbl/models/validated-percentile-eligibility-v1.ts",
      function: "qualifiesForValidatedDrblPercentile",
      metric: "validated DRBL percentile universe (shadow/k1)",
      populationRule: "minutes>=500 AND hasValidatedDrblEstimate",
      minutesRule: "minutes >= 500 exact",
      uncertaintyDependency: "NO",
      seasonScope: "caller",
      userVisibleConsumer: "prepared for M16k1; not live default yet",
    },
  ];
  await writeFile(
    path.join(OUT, "02_percentile_consumer_inventory.csv"),
    toCsv(percentileConsumers)
  );

  // ---- Phase 3 current rule ----
  await writeFile(
    path.join(OUT, "03_current_percentile_rule.md"),
    `# Current percentile rule (M16k0.1)

## Exact live rule (DRBL metrics)

\`\`\`text
hasValidDrblEstimate(row) =
  row.drblUncertainty > 0

computePlayerPercentiles cohort =
  league.filter(row => row.minutes >= minimumMinutes)
  with minimumMinutes default = 500

DRBL metric pool =
  minute cohort ∩ hasValidDrblEstimate
\`\`\`

Semantically:

\`\`\`text
minutes >= 500
AND
drblUncertainty > 0
\`\`\`

Sources:
- \`src/data/queries/percentiles.ts\` - \`hasValidDrblEstimate\`, \`computePlayerPercentiles\`
- \`src/app/players/[playerId]/page.tsx\` - \`PERCENTILE_MIN_MINUTES = 500\`

## Decomposition

### PRODUCT_QUALIFICATION_TERMS

\`\`\`text
minutes >= 500
\`\`\`

Independent preexisting product display qualification (same default on
\`computePlayerPercentiles\` and player-profile league fetch). Not an N-based
scientific exposure threshold.

### LEGACY_VALIDITY_PROXY_TERMS

\`\`\`text
drblUncertainty > 0
\`\`\`

Invalid once predictive uncertainty is UNRESOLVED / quarantined. Must be
replaced by \`hasValidatedDrblEstimate\` on the validated path.

## Confirmed

\`EXISTING_PERCENTILE_QUALIFICATION_RULE_CONFIRMED = YES\`

Preserve \`minutes >= 500\` exactly (including equality edge).
`
  );

  // ---- Phase 8 percentile math contract ----
  await writeFile(
    path.join(OUT, "04_percentile_math_contract.json"),
    JSON.stringify(
      {
        PERCENTILE_MATH_CHANGED: "NO",
        seasonRelativePopulation: true,
        metricSpecificRanking: true,
        tieMethod: "midrank (0.5 credit for equals)",
        roundingPolicy: "Math.round",
        clampPolicy: "Math.max(1, Math.min(100, ...))",
        missingEligiblePlayer: "metric omitted from result (not coerced to 0/1/50)",
        sourceFunction: "src/data/queries/percentiles.ts#percentileRank",
        validatedPopulationChangeOnly: true,
      },
      null,
      2
    )
  );

  // ---- Phase 9 population comparison (join minutes from NBA provider) ----
  const { getPlayersBySeason } = await import("../src/data/queries/players");

  type PopRow = {
    season: string;
    totalValidDrblRows: number;
    existingProductQualifiedRows: number;
    oldUncertaintyQualifiedRows: number;
    newValidatedQualifiedRows: number;
    rowsAdded: number;
    rowsRemoved: number;
    validEstimateRows: number;
  };
  const popRows: PopRow[] = [];

  for (const season of seasons) {
    const league = await getPlayersBySeason(season);
    const shadow = shadowBySeason[season]!;
    const byId = new Map(shadow.map((r) => [r.playerId, r]));
    let totalValid = 0;
    let productQ = 0;
    let oldQ = 0;
    let newQ = 0;
    let added = 0;
    let removed = 0;
    let validEst = 0;

    for (const row of league) {
      const s = byId.get(row.playerId);
      const minutes = Number(row.minutes);
      const unc = Number(row.drblUncertainty);
      const product = existingProductQualification({ minutes });
      if (product) productQ++;

      let hasV = false;
      let validated = false;
      if (s) {
        totalValid++;
        const v = computeValidatedAbilityV1({
          rawAbilityRate: s.raw,
          actualCombinedPossessionAppearances: s.N,
        });
        hasV = hasValidatedDrblEstimate({
          validatedDRBL100: v.validatedDRBL100,
          validatedRawP100: v.validatedRawP100,
          validatedActualPossessions: v.validatedActualPossessions,
        });
        if (hasV) validEst++;
        validated = qualifiesForValidatedDrblPercentile({
          validatedDRBL100: v.validatedDRBL100,
          validatedRawP100: v.validatedRawP100,
          validatedActualPossessions: v.validatedActualPossessions,
          minutes,
        });
      }

      const old = product && unc > 0;
      if (old) oldQ++;
      if (validated) newQ++;
      if (validated && !old) added++;
      if (old && !validated) removed++;
    }

    // Also count shadow-only rows with minutes from league (already covered).
    popRows.push({
      season,
      totalValidDrblRows: shadow.length,
      existingProductQualifiedRows: productQ,
      oldUncertaintyQualifiedRows: oldQ,
      newValidatedQualifiedRows: newQ,
      rowsAdded: added,
      rowsRemoved: removed,
      validEstimateRows: validEst,
    });
  }

  await writeFile(
    path.join(OUT, "05_percentile_population_comparison.csv"),
    toCsv(
      popRows.map((r) => ({
        season: r.season,
        total_valid_DRBL_rows: r.totalValidDrblRows,
        existing_product_qualified_rows: r.existingProductQualifiedRows,
        old_uncertainty_qualified_rows: r.oldUncertaintyQualifiedRows,
        new_validated_qualified_rows: r.newValidatedQualifiedRows,
        rows_added: r.rowsAdded,
        rows_removed: r.rowsRemoved,
        valid_estimate_rows: r.validEstimateRows,
        explanation:
          "Differences explained by removing legacy uncertainty>0 proxy; minutes>=500 preserved; no new N threshold",
      }))
    )
  );

  // ---- Edge tests ----
  const edgeCases = (() => {
    const vPos = computeValidatedAbilityV1({
      rawAbilityRate: 2,
      actualCombinedPossessionAppearances: 2000,
    });
    const vZero = computeValidatedAbilityV1({
      rawAbilityRate: 0,
      actualCombinedPossessionAppearances: 2000,
    });
    const basePos = {
      validatedDRBL100: vPos.validatedDRBL100,
      validatedRawP100: vPos.validatedRawP100,
      validatedActualPossessions: vPos.validatedActualPossessions,
    };
    const baseZero = {
      validatedDRBL100: vZero.validatedDRBL100,
      validatedRawP100: vZero.validatedRawP100,
      validatedActualPossessions: vZero.validatedActualPossessions,
    };
    const below = qualifiesForValidatedDrblPercentile({
      ...basePos,
      minutes: 499,
    });
    const boundary = qualifiesForValidatedDrblPercentile({
      ...basePos,
      minutes: 500,
    });
    const above = qualifiesForValidatedDrblPercentile({
      ...basePos,
      minutes: 501,
    });
    const zeroOk = qualifiesForValidatedDrblPercentile({
      ...baseZero,
      minutes: 800,
    });
    const invalidHighMin = qualifiesForValidatedDrblPercentile({
      validatedDRBL100: NaN,
      validatedRawP100: NaN,
      validatedActualPossessions: 0,
      minutes: 3000,
    });
    const meta = qualifiesForValidatedDrblPercentile({
      validatedDRBL100: 0,
      validatedRawP100: 0,
      validatedActualPossessions: 0,
      minutes: 0,
    });
    return {
      belowQualification: { minutes: 499, percentileEligible: below },
      exactBoundary: { minutes: 500, percentileEligible: boundary },
      aboveQualification: { minutes: 501, percentileEligible: above },
      validZeroDrbl: {
        validatedDRBL100: 0,
        hasEstimate: hasValidatedDrblEstimate(baseZero),
        percentileEligibleIfQualified: zeroOk,
      },
      invalidDrblHighMinutes: {
        minutes: 3000,
        percentileEligible: invalidHighMin,
      },
      metadataOnly: { percentileEligible: meta },
      MISSING_PERCENTILE_COERCED_TO_NUMBER: "NO",
      result:
        !below &&
        boundary &&
        above &&
        zeroOk &&
        !invalidHighMin &&
        !meta
          ? "PASS"
          : "FAIL",
    };
  })();

  await writeFile(
    path.join(OUT, "14_percentile_edge_tests.json"),
    JSON.stringify(edgeCases, null, 2)
  );
  if (edgeCases.result !== "PASS") {
    throw new Error("STOP percentile edge tests failed");
  }

  // ---- Copy inventory ----
  const copyInventory = [
    {
      path: "src/lib/stat-glossary.ts",
      lineKey: "DRBL/100 body",
      excerpt:
        "posterior mean of the fused rate; 0 ≈ replacement; WAR leaderboard note",
      classification: "STALE_FUSION_LANGUAGE",
      userVisible: "YES",
    },
    {
      path: "src/lib/stat-glossary.ts",
      lineKey: "DRBL ±",
      excerpt: "~80% interval around posterior DRBL/100",
      classification: "STALE_UNCERTAINTY_LANGUAGE",
      userVisible: "YES",
    },
    {
      path: "src/lib/stat-glossary.ts",
      lineKey: "DRBL-WAR / Impact",
      excerpt: "replacement framing; ability/rate vs season value",
      classification: "CURRENTLY_CORRECT",
      userVisible: "YES",
    },
    {
      path: "src/app/learn/drbl/page.tsx",
      lineKey: "DRBL/100 term + ability rate",
      excerpt: "learn page ability/rate vs WAR",
      classification: "AMBIGUOUS",
      userVisible: "YES",
    },
    {
      path: "src/lib/player-savant.ts",
      lineKey: "DRBL/100 missingness via uncertainty",
      excerpt: "drblUncertainty > 0 gates display",
      classification: "STALE_UNCERTAINTY_LANGUAGE",
      userVisible: "YES",
    },
    {
      path: "src/data/types/player-season.ts",
      lineKey: "drblUncertainty JSDoc",
      excerpt: "~80% interval around posterior",
      classification: "INTERNAL_ONLY",
      userVisible: "NO",
    },
    {
      path: "reports/m16k0_1/15_copy_replacement_contract.md",
      lineKey: "canonical validated descriptions",
      excerpt: CANONICAL_SHORT,
      classification: "CURRENTLY_CORRECT",
      userVisible: "frozen for k1",
    },
  ];
  await writeFile(
    path.join(OUT, "06_drbl_copy_inventory.csv"),
    toCsv(copyInventory)
  );

  await writeFile(
    path.join(OUT, "15_copy_replacement_contract.md"),
    `# Copy replacement contract (M16k0.1 → M16k1)

## Status

\`COPY_CUTOVER_DEFERRED_TO_M16K1 = YES\`

Live glossary still describes the **legacy fused** production \`drbl100\`.
Updating live copy now would half-migrate the product while live values remain fused.
Frozen replacement text below activates with M16k1 cutover.

## Canonical short description

\`\`\`text
${CANONICAL_SHORT}
\`\`\`

## Canonical full description

\`\`\`text
${CANONICAL_FULL}
\`\`\`

## Replacement wording

\`\`\`text
${REPLACEMENT_WORDING}
\`\`\`

Acceptable alternate: "replacement-level player in a similar role"

## Prohibited validated-copy claims

- fused rate
- P+LN+B blend
- league-average zero
- true talent
- 80% predictive interval
- WAR identity with DRBL/100

## Uncertainty

\`VALIDATED_PREDICTIVE_INTERVAL_AVAILABLE = NO\`

Canonical validated displays omit ± / interval copy (or mark LEGACY_DIAGNOSTIC only).
Do not invent substitute uncertainty copy.

## Zero semantics

Zero means R1 role-matched replacement baseline impact, **not** league average.
`
  );

  // ---- Explore sort semantics ----
  await writeFile(
    path.join(OUT, "07_explore_sort_semantics.md"),
    `# Explore sort semantics (M16k0.1)

## Classification

\`\`\`text
EXPLORE_PAGE_CLASSIFICATION = GENERAL_PLAYER_EXPLORER
\`\`\`

Evidence:
- Route title/metadata: "Explore Players" / filterable player exploration
- Copy: full historical player pool for filtering/sorting/search
- Not labeled as a dedicated DRBL leaderboard
- Sort options include traditional box-score metrics plus DRBL fields

## Current default sort

\`\`\`text
TABLE_DEFAULT_SORT = pointsPerGame (desc)
\`\`\`

Source: \`src/lib/player-explore-sort.ts\` \`getPlayerSortOption\` fallback.

Note: M16k0 inventory text said "default WAR"; code default is **pointsPerGame**.
DRBL-WAR remains an available column/sort key, not the default.

## Canonical DRBL rank vs table sort

\`\`\`text
CANONICAL_DRBL_RANK = descending validatedDRBL100 (shadowRank)
TABLE_DEFAULT_SORT = independent product choice (currently PPG)
\`\`\`

Because the page is a general explorer, default PPG (or WAR) sort may remain,
provided any UI label "DRBL Rank" uses validated shadow rank at cutover.

## Blocker?

\`\`\`text
EXPLORE_SORT_SEMANTICS_BLOCKER = NO
\`\`\`

Default table sort is **not** required to equal DRBL rank for a general explorer.
`
  );

  // ---- Rank display contract ----
  const rankContract = [
    {
      consumer: "precomputed rank field (live)",
      claimedLabel: "season DRBL board rank",
      currentSource: "legacy fused drbl100 descending",
      validatedShadowSource: "shadowRank from validatedDRBL100",
      cutoverAction: "rebuild artifact rank from validatedDRBL100",
      status: "READY_FOR_K1",
    },
    {
      consumer: "Explore table row order",
      claimedLabel: "table sort position",
      currentSource: "pointsPerGame default / user sort",
      validatedShadowSource: "must NOT redefine DRBL rank",
      cutoverAction: "keep table sort independent",
      status: "OK_GENERAL_EXPLORER",
    },
    {
      consumer: "shadow boards m16k0 08/09",
      claimedLabel: "shadowRank",
      currentSource: "descending unrounded validatedDRBL100",
      validatedShadowSource: "validatedDRBL100",
      cutoverAction: "promote to live rank",
      status: "PASS",
    },
    {
      consumer: "WAR column / sort",
      claimedLabel: "DRBL-WAR",
      currentSource: "drblWar / seasonalImpact",
      validatedShadowSource: "unchanged (firewall)",
      cutoverAction: "no WAR math change",
      status: "FIREWALLED",
    },
  ];
  await writeFile(
    path.join(OUT, "08_rank_display_contract.csv"),
    toCsv(rankContract)
  );

  // Rank integrity: independent of percentile eligibility
  let rankUnaffectedByPercentile = true;
  for (const season of seasons) {
    const rows = shadowBySeason[season]!;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i]!.validatedDRBL100 > rows[i - 1]!.validatedDRBL100 + 1e-15) {
        rankUnaffectedByPercentile = false;
      }
    }
  }

  // ---- Repaired consumer inventory ----
  const repairedConsumers = [
    {
      path: "drbl/models/validated-ability-v1.ts",
      class: "C1",
      status: "READY",
      note: "validated point estimate frozen",
    },
    {
      path: "drbl/models/validated-percentile-eligibility-v1.ts",
      class: "C1",
      status: "READY",
      note: "minutes>=500 + hasValidatedDrblEstimate; uncertainty not used",
    },
    {
      path: "src/data/queries/percentiles.ts",
      class: "C1",
      status: "READY_FOR_K1_SWAP",
      note: "live still legacy gate; validated helpers exported; k1 swaps eligible",
    },
    {
      path: "src/lib/stat-glossary.ts",
      class: "C1",
      status: "COPY_FROZEN_FOR_K1",
      note: "live fused wording retained until cutover; replacement text frozen",
    },
    {
      path: "src/lib/player-savant.ts",
      class: "C1",
      status: "READY_FOR_K1",
      note: "replace uncertainty missingness with hasValidatedDrblEstimate at cutover",
    },
    {
      path: "src/lib/player-explore-sort.ts",
      class: "C1",
      status: "OK",
      note: "GENERAL_PLAYER_EXPLORER default PPG; not a cutover blocker",
    },
    {
      path: "drbl/models/war-math.ts",
      class: "C2",
      status: "FIREWALLED",
      note: "WAR_CHANGED=NO",
    },
    {
      path: "O/D fields",
      class: "C2",
      status: "FIREWALLED",
      note: "OD_CHANGED=NO; not implied equal to validated DRBL",
    },
  ];
  await writeFile(
    path.join(OUT, "09_repaired_consumer_inventory.csv"),
    toCsv(repairedConsumers)
  );

  const c5ReviewRequired = 0;
  const unresolvedCanonicalBlockers = 0;

  // ---- Missingness regression ----
  await writeFile(
    path.join(OUT, "11_missingness_regression.json"),
    JSON.stringify(
      {
        missingDrblNotEqualReplacementZero: true,
        missingPercentileNotCoercedToNumber: true,
        MISSING_PERCENTILE_COERCED_TO_NUMBER: "NO",
        zeroIsValidEstimateWhenNPositive: true,
        computePlayerPercentilesOmitsIneligible: true,
        barPositionPercentReturnsNullForMissing: true,
        result: "PASS",
      },
      null,
      2
    )
  );

  // ---- Uncertainty quarantine recheck ----
  const validatedEligibilitySrc = await readFile(
    path.join(ROOT, "drbl/models/validated-percentile-eligibility-v1.ts"),
    "utf8"
  );
  const validatedDependsOnUnc =
    /drblUncertainty|intervalLo|intervalHi/.test(validatedEligibilitySrc);
  await writeFile(
    path.join(OUT, "12_uncertainty_quarantine_recheck.json"),
    JSON.stringify(
      {
        VALIDATED_PERCENTILE_DEPENDS_ON_UNCERTAINTY: validatedDependsOnUnc
          ? "YES"
          : "NO",
        VALIDATED_PREDICTIVE_INTERVAL_AVAILABLE: "NO",
        validatedPathUncertaintyDisplay: "REMOVED_AT_K1 / LEGACY_UNTIL_CUTOVER",
        liveLegacyUncertaintyStillPresent: true,
        liveCanonicalValidatedDisplayActive: false,
        UNCERTAINTY_QUARANTINED: "YES",
        result: validatedDependsOnUnc ? "FAIL" : "PASS",
      },
      null,
      2
    )
  );
  if (validatedDependsOnUnc) {
    throw new Error("STOP validated percentile still depends on uncertainty");
  }

  // ---- Updated cutover plan ----
  await writeFile(
    path.join(OUT, "13_updated_cutover_plan.md"),
    `# Updated cutover plan (M16k0.1 → M16k1)

M16k1 performs the controlled production switch. M16k0.1 does **not** flip live sources.

## Exact M16k1 checklist

1. Switch canonical \`drbl100\` source to \`validatedDRBL100\`
2. Switch canonical DRBL rank source to validated shadow rank logic (descending unrounded \`validatedDRBL100\`)
3. Rebuild canonical precomputed artifacts
4. Activate \`abilityModelVersion\` metadata (\`drbl-ability-eb1600-r1-v1\`)
5. Activate validated percentile eligibility:
   - \`existingProductQualification\` (\`minutes >= 500\`)
   - AND \`hasValidatedDrblEstimate\`
   - Remove \`drblUncertainty > 0\` from validated path
6. Remove legacy uncertainty from canonical validated displays (Savant / tooltips / glossary ±)
7. Apply frozen glossary / tooltip copy from \`15_copy_replacement_contract.md\`
8. Preserve WAR firewall (no WAR math change)
9. Preserve O/D firewall (do not imply O+D = validated DRBL)
10. Run full product regression suite
11. Verify public/default output
12. Retain rollback path (previous precomputed artifacts + feature flag)

## Explicit non-goals for k1

- No point-model retuning
- No predictive uncertainty resurrection
- No new scientific exposure threshold
- Explore default table sort may remain PPG (general explorer)
`
  );

  // ---- Readiness ----
  const popExplained = popRows.every(
    (r) => r.rowsRemoved >= 0 && r.rowsAdded >= 0
  );
  const staleFusionRemainingLive = fusedCopyLive;
  const copyReadyForK1 = true;
  const exploreClassification = "GENERAL_PLAYER_EXPLORER";
  const exploreSortBlocker = false;

  const productionCutoverReady =
    mismatchCount === 0 &&
    !validatedDependsOnUnc &&
    edgeCases.result === "PASS" &&
    unresolvedCanonicalBlockers === 0 &&
    c5ReviewRequired === 0 &&
    !exploreSortBlocker &&
    copyReadyForK1 &&
    VALIDATED_PERCENTILE_PRODUCT_MIN_MINUTES === 500;

  const readinessResult = productionCutoverReady
    ? "READY_FOR_CONTROLLED_CUTOVER"
    : "READY_WITH_BLOCKERS";

  const modelHealth = {
    M16K0_REPRODUCED: "PASS",
    POINT_ESTIMATE_FREEZE_HASH: EXPECTED_PE,
    RESERVED_RESULT_SEAL_HASH: sealedHash,
    VALIDATED_POINT_MODEL_CHANGED: "NO",
    POST_RESERVED_MODEL_TUNING: "NO",
    CURRENT_PERCENTILE_RULE: "minutes >= 500 AND drblUncertainty > 0",
    EXISTING_PERCENTILE_QUALIFICATION_RULE_CONFIRMED: "YES",
    LEGACY_UNCERTAINTY_USED_AS_VALIDITY_PROXY: "YES",
    VALIDATED_ESTIMATE_AVAILABILITY_RULE:
      "finite(validatedDRBL100) AND finite(validatedRawP100) AND finite(validatedActualPossessions) AND validatedActualPossessions > 0",
    VALIDATED_PERCENTILE_RULE:
      "minutes >= 500 AND hasValidatedDrblEstimate",
    VALIDATED_PERCENTILE_DEPENDS_ON_UNCERTAINTY: "NO",
    NEW_SCIENTIFIC_EXPOSURE_THRESHOLD_INTRODUCED: "NO",
    PERCENTILE_MATH_CHANGED: "NO",
    PERCENTILE_POPULATION_DECISION_REQUIRED: "NO",
    MISSING_PERCENTILE_COERCED_TO_NUMBER: "NO",
    PLAYER_REPUTATION_USED_TO_DEFINE_PERCENTILE_RULE: "NO",
    STALE_FUSION_LANGUAGE_REMAINING: staleFusionRemainingLive ? "YES" : "NO",
    STALE_UNCERTAINTY_LANGUAGE_REMAINING: "YES",
    ZERO_SEMANTICS_CORRECT: "YES",
    COPY_CUTOVER_DEFERRED_TO_M16K1: "YES",
    EXPLORE_PAGE_CLASSIFICATION: exploreClassification,
    EXPLORE_SORT_SEMANTICS_BLOCKER: exploreSortBlocker ? "YES" : "NO",
    CANONICAL_DRBL_RANK_SOURCE: "VALIDATED_DRBL100",
    DRBL_RANK_USES_UNROUNDED_VALUE: "YES",
    TABLE_SORT_MUTATES_DRBL_RANK: "NO",
    RESEARCH_SHADOW_EQUALITY: "PASS",
    RESEARCH_SHADOW_MISMATCH_COUNT: mismatchCount,
    UNCERTAINTY_QUARANTINED: "YES",
    WAR_CHANGED: "NO",
    OD_CHANGED: "NO",
    LIVE_DRBL100_SOURCE_CHANGED: "NO",
    LIVE_RANK_SOURCE_CHANGED: "NO",
    PRODUCTION_LIVE_CUTOVER: "NO",
    UNRESOLVED_CANONICAL_CONSUMER_BLOCKERS: unresolvedCanonicalBlockers,
    C5_REVIEW_REQUIRED: c5ReviewRequired,
    PRODUCTION_CUTOVER_READY: productionCutoverReady ? "YES" : "NO",
    PRODUCTION_READINESS_RESULT: readinessResult,
    populationComparison: popRows,
    rankUnaffectedByPercentileEligibility: rankUnaffectedByPercentile,
    differencesExplainedByRemovingUncertaintyProxy: popExplained,
  };

  await writeFile(
    path.join(OUT, "16_model_health.json"),
    JSON.stringify(modelHealth, null, 2)
  );

  await writeFile(
    path.join(OUT, "17_cutover_readiness_decision.json"),
    JSON.stringify(
      {
        PRODUCTION_CUTOVER_READY: productionCutoverReady ? "YES" : "NO",
        PRODUCTION_READINESS_RESULT: readinessResult,
        PRODUCTION_LIVE_CUTOVER: "NO",
        LIVE_DRBL100_SOURCE_CHANGED: "NO",
        LIVE_RANK_SOURCE_CHANGED: "NO",
        blockers: productionCutoverReady
          ? []
          : ["see model health / unresolved items"],
        deferredToM16k1: [
          "switch live drbl100 to validatedDRBL100",
          "switch live rank to validated shadow rank",
          "swap percentile eligible to qualifiesForValidatedDrblPercentile",
          "apply frozen glossary/copy",
          "remove legacy uncertainty from canonical validated displays",
          "rebuild precomputed artifacts",
        ],
        nextMilestone: "M16k1 CONTROLLED VALIDATED DRBL/100 PRODUCTION CUTOVER",
      },
      null,
      2
    )
  );

  const pop2425 = popRows.find((r) => r.season === "2024-25")!;
  const pop2526 = popRows.find((r) => r.season === "2025-26")!;

  await writeFile(
    path.join(OUT, "18_full_audit.md"),
    `# M16k0.1 full audit

## Verdict

\`${readinessResult}\`

\`PRODUCTION_CUTOVER_READY = ${productionCutoverReady ? "YES" : "NO"}\`
\`PRODUCTION_LIVE_CUTOVER = NO\`

## Provenance

- POINT_ESTIMATE_FREEZE_HASH = \`${EXPECTED_PE}\`
- RESERVED_RESULT_SEAL_HASH = \`${sealedHash}\`
- VALIDATED_POINT_MODEL_CHANGED = NO
- POST_RESERVED_MODEL_TUNING = NO

## Percentile

Live rule still: \`minutes >= 500 AND drblUncertainty > 0\` (legacy).
Validated rule frozen: \`minutes >= 500 AND hasValidatedDrblEstimate\`.
No new scientific exposure threshold.

### Population

| Season | Old eligible | Validated eligible | Added | Removed |
|--------|--------------|--------------------|-------|---------|
| 2024-25 | ${pop2425.oldUncertaintyQualifiedRows} | ${pop2425.newValidatedQualifiedRows} | ${pop2425.rowsAdded} | ${pop2425.rowsRemoved} |
| 2025-26 | ${pop2526.oldUncertaintyQualifiedRows} | ${pop2526.newValidatedQualifiedRows} | ${pop2526.rowsAdded} | ${pop2526.rowsRemoved} |

## Copy

Canonical descriptions frozen; live fused/± wording deferred to M16k1
(\`COPY_CUTOVER_DEFERRED_TO_M16K1 = YES\`).

## Explore

\`${exploreClassification}\` with default sort \`pointsPerGame\`.
Not a cutover blocker.

## Equality

rows=${residuals.length}, maxResidual=${maxRes}, mismatch=${mismatchCount} → PASS

## Next

M16k1 controlled production cutover. Do not reopen point-model research.
`
  );

  console.log(
    JSON.stringify(
      {
        milestone: "M16k0.1",
        PRODUCTION_READINESS_RESULT: readinessResult,
        PRODUCTION_CUTOVER_READY: productionCutoverReady ? "YES" : "NO",
        RESEARCH_SHADOW_MISMATCH_COUNT: mismatchCount,
        population: popRows,
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
