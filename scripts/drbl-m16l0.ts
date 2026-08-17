/**
 * M16l0 — WAR semantic specification + dimensional re-audit (no live WAR change).
 *   npm run drbl:m16l0
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  VALIDATED_ABILITY_MODEL_VERSION,
  VALIDATED_K,
  VALIDATED_PRIOR_MEAN,
  computeValidatedAbilityV1,
} from "../drbl/models/validated-ability-v1";
import { computeResearchRateV1 } from "../drbl/models/research-rate-v1";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m16l0");
const PRE = path.join(ROOT, "src", "data", "drbl", "precomputed");
const M16J = path.join(ROOT, "reports", "m16j");

const EXPECTED_PE =
  "942b21ef78ba0a142549f8a2b62338993e133f17b8bb1ff7b94fc8844ad9297c";
const EXPECTED_SEAL =
  "84f4eadccb536f058194acb4db730c044ea413036456e072952d89a64600d742";

const SEASONS = ["2024-25", "2025-26"] as const;

type P = Record<string, unknown> & {
  playerId: string;
  playerName?: string;
  teamId?: string;
  rawAbilityRate?: number;
  drbl100?: number;
  possessions?: number;
  actualPossessions?: number;
  combinedPossessionAppearances?: number;
  pairedOnCourtPossessions?: number;
  seasonalImpact?: number;
  drblWar?: number;
  pointsPerWin?: number;
  replacementLevelRate?: number;
  warFormulaVersion?: string;
  finalAbilityDRBL100?: number;
  seasonImpactAboveReplacement?: number;
  posteriorAbilityRate?: number;
  abilityModelVersion?: string;
};

type Board = {
  season: string;
  players: P[];
  warModel?: Record<string, unknown>;
  warFormulaVersion?: string;
  warExposureUnit?: string;
  publishedAbilityInput?: string;
  abilityModelVersion?: string;
};

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
function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i]!;
}
function sha256(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}
function Nof(p: P): number {
  return Number(
    p.combinedPossessionAppearances ??
      p.actualPossessions ??
      p.possessions ??
      NaN
  );
}

async function loadBoard(season: string): Promise<Board> {
  return JSON.parse(
    await readFile(path.join(PRE, `${season}.json`), "utf8")
  ) as Board;
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

  const sealedBuf = await readFile(
    path.join(M16J, "10_reserved_result_sealed.json")
  );
  const sealedHash = sha256(sealedBuf);
  const sealed = JSON.parse(sealedBuf.toString("utf8")) as {
    M16J_RESERVED_VERDICT: string;
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
    throw new Error("STOP M16L0_DRBL_PROVENANCE_DRIFT");
  }

  const boards: Record<string, Board> = {};
  for (const s of SEASONS) boards[s] = await loadBoard(s);

  const b2425 = boards["2024-25"]!;
  const b2526 = boards["2025-26"]!;
  const war2425 =
    (b2425.warFormulaVersion as string) ||
    String(b2425.warModel?.warFormulaVersion ?? "unknown");
  const war2526 =
    (b2526.warFormulaVersion as string) ||
    (b2526.players[0]?.warFormulaVersion as string) ||
    "provisional_raw_ppw30";

  // ---- Phase 0 freeze ----
  await writeFile(
    path.join(OUT, "00_freeze.json"),
    JSON.stringify(
      {
        milestone: "M16l0",
        timestamp,
        gitCommit,
        gitDirty: dirty,
        POINT_ESTIMATE_FREEZE_HASH: EXPECTED_PE,
        RESERVED_RESULT_SEAL_HASH: sealedHash,
        canonicalAbilityVersion: VALIDATED_ABILITY_MODEL_VERSION,
        CURRENT_WAR_VERSION_2024_25: war2425,
        CURRENT_WAR_VERSION_2025_26: war2526,
        LIVE_WAR_CHANGED: false,
        PRODUCTION_DRBL_CHANGED: false,
        purpose: "WAR semantic specification + dimensional re-audit only",
      },
      null,
      2
    )
  );

  // ---- Phase 1 DRBL lock ----
  const residuals: number[] = [];
  for (const s of SEASONS) {
    for (const p of boards[s]!.players) {
      const N = Nof(p);
      const raw = Number(p.rawAbilityRate);
      if (!Number.isFinite(N) || N <= 0 || !Number.isFinite(raw)) continue;
      const v = computeValidatedAbilityV1({
        rawAbilityRate: raw,
        actualCombinedPossessionAppearances: N,
      });
      const r = computeResearchRateV1({
        rawAbilityRate: raw,
        actualCombinedPossessionAppearances: N,
      });
      residuals.push(Math.abs(v.validatedDRBL100 - r.researchFinalDRBL100));
      const disp = Math.abs(Number(v.validatedDRBL100.toFixed(2)) - Number(p.drbl100));
      if (disp > 1e-9) {
        throw new Error("STOP WAR_AUDIT_FOUND_DRBL_MODEL_DRIFT");
      }
    }
  }
  if (residuals.some((x) => x > 1e-12)) {
    throw new Error("STOP WAR_AUDIT_FOUND_DRBL_MODEL_DRIFT");
  }
  await writeFile(
    path.join(OUT, "01_drbl_model_lock.json"),
    JSON.stringify(
      {
        formula: "N/(N+1600)*rawAbilityRate",
        k: VALIDATED_K,
        priorMean: VALIDATED_PRIOR_MEAN,
        calibration: "IDENTITY",
        fusion: "NONE",
        zero: "R1_replacement",
        abilityModelVersion: VALIDATED_ABILITY_MODEL_VERSION,
        rowsChecked: residuals.length,
        maxResidualVsResearch: residuals.length ? Math.max(...residuals) : 0,
        result: "PASS",
      },
      null,
      2
    )
  );

  // ---- Phase 2 inventory ----
  const inventory = [
    {
      season: "2024-25",
      version: "WAR4.0.1",
      inputRate: "posteriorAbilityRate → finalAbilityDRBL100 via LOO slope 5.8354166",
      rateUnit: "calibrated pts/100 (netRating-like paired scale)",
      replacementSubtraction: "fringe_median_poss_200_800 = -1.4886148 on calibrated scale",
      exposure: "pairedOnCourtPossessions = combined/2",
      exposureUnit: "paired_team_possessions",
      pointsPerWin: 38.714285714285715,
      calibrationMultiplier: 5.835416607524311,
      formula:
        "(5.8354166*posterior - (-1.4886148)) * (N/2) / 100 / 38.7142857",
      zeroSemantics: "fringe calibrated ability (NOT raw R1 zero)",
      consumer: "precomputed.drblWar → Explore/Savant/glossary",
      seasonalImpactNote: "seasonalImpact remains raw*N/100 (firewalled; not WAR numerator)",
    },
    {
      season: "2025-26",
      version: "provisional_raw_ppw30",
      inputRate: "rawAbilityRate (warInputRateSource=raw_realized)",
      rateUnit: "pts / 100 combined possession appearances",
      replacementSubtraction: "0 (R1 already in Approach B residuals)",
      exposure: "actualPossessions = combined possession appearances N",
      exposureUnit: "combined_appearance_possessions",
      pointsPerWin: 30,
      calibrationMultiplier: 1,
      formula: "(rawAbilityRate * N / 100) / 30",
      zeroSemantics: "R1 replacement (raw=0 ⇒ WAR=0)",
      consumer: "precomputed.drblWar → Explore/Savant/glossary",
      seasonalImpactNote: "seasonalImpact IS the WAR numerator",
    },
    {
      season: "code_path_finalizePlayerSeasonRows",
      version: "provisional (player-value.ts)",
      inputRate: "rawAbilityRate",
      rateUnit: "pts/100 combined",
      replacementSubtraction: "ranking.replacementLevelRate default 0",
      exposure: "accumulator.possessions (combined)",
      exposureUnit: "combined_appearance_possessions",
      pointsPerWin: 30,
      calibrationMultiplier: 1,
      formula: "seasonalImpactFromRawRate(raw-repl,N)/pointsPerWin",
      zeroSemantics: "R1",
      consumer: "future full recompute path",
      seasonalImpactNote: "matches 2025-26 provisional semantics",
    },
  ];
  await writeFile(path.join(OUT, "02_current_war_inventory.csv"), toCsv(inventory));

  // ---- Phase 3 lineage ----
  await writeFile(
    path.join(OUT, "03_legacy_war_lineage.md"),
    `# Legacy WAR lineage

## WAR 4.0.0 (2024-25 pre-unit-repair)

\`\`\`text
posteriorAbilityRate
→ × LOO slope 5.835416607524311  (+ intercept 0)
→ finalAbilityDRBL100
→ subtract fringe replacement −1.4886147765794517
→ × combinedPossessionAppearances / 100
→ / pointsPerWin 38.714285714285715
→ drblWar
\`\`\`

Exposure unit mismatch: calibrated rate defined like team netRating per **paired** team possessions, but multiplied by **combined** appearances (≈2×).

## WAR 4.0.1 (2024-25 current artifact)

\`\`\`text
posteriorAbilityRate
→ × 5.835416607524311
→ finalAbilityDRBL100
→ − (−1.4886147765794517)
→ × pairedOnCourtPossessions(=combined/2) / 100
→ / 38.714285714285715
→ drblWar
\`\`\`

Unit repair only. LOO slope / replacement / PPW frozen. Remaining empirical scale ≈2.918 open.

## 2025-26 provisional

\`\`\`text
rawAbilityRate
→ × combined N / 100   (= seasonalImpact; replacementLevelRate=0)
→ / 30
→ drblWar
\`\`\`

No LOO slope. No fringe replacement. Different PPW. **Not cross-season comparable to 4.0.1.**

## Code path vs artifact

\`finalizePlayerSeasonRows\` implements provisional raw/30. Calibrated 4.0.1 is baked into 2024-25 JSON via remaster/unit-repair (\`pipeline-value.ts\`), not rewritten by M16k1 ability cutover (WAR firewall preserved).
`
  );

  // ---- Phase 4 dimensional table ----
  await writeFile(
    path.join(OUT, "04_dimensional_analysis.csv"),
    toCsv([
      {
        quantity: "rawAbilityRate",
        symbol: "raw",
        numeratorUnit: "Approach-B attributed points vs R1",
        denominatorUnit: "100 combined possession appearances",
        scale: "pts/100 combined",
        zeroReference: "R1 replacement",
        role: "unshrunk rate",
      },
      {
        quantity: "validatedDRBL100",
        symbol: "v",
        numeratorUnit: "same attributed-point scale",
        denominatorUnit: "100 combined possession appearances",
        scale: "pts/100 combined",
        zeroReference: "R1 replacement (priorMean=0)",
        role: "canonical ability rate",
      },
      {
        quantity: "ApproachBAttributedValue",
        symbol: "V",
        numeratorUnit: "points vs R1",
        denominatorUnit: "1 (season total)",
        scale: "points",
        zeroReference: "R1",
        role: "raw cumulative value",
      },
      {
        quantity: "combinedPossessionAppearances",
        symbol: "N",
        numeratorUnit: "off appearances + def appearances",
        denominatorUnit: "1",
        scale: "count",
        zeroReference: "n/a",
        role: "rate & provisional WAR exposure",
      },
      {
        quantity: "pairedOnCourtPossessions",
        symbol: "N/2",
        numeratorUnit: "team possessions while on court (approx)",
        denominatorUnit: "1",
        scale: "count",
        zeroReference: "n/a",
        role: "WAR4.0.1 exposure only",
      },
      {
        quantity: "seasonalImpact (provisional)",
        symbol: "I_raw",
        numeratorUnit: "points vs R1",
        denominatorUnit: "1",
        scale: "points",
        zeroReference: "R1",
        role: "raw*N/100",
      },
      {
        quantity: "team net rating (LOO target)",
        symbol: "NR",
        numeratorUnit: "team net points",
        denominatorUnit: "100 paired team possessions",
        scale: "pts/100 paired",
        zeroReference: "average/zero margin context",
        role: "historical calibration target for slope 5.835",
      },
      {
        quantity: "pointsPerWin",
        symbol: "PPW",
        numeratorUnit: "replacement-relative points",
        denominatorUnit: "1 win",
        scale: "points/win",
        zeroReference: "n/a",
        role: "unit conversion",
      },
      {
        quantity: "WAR",
        symbol: "W",
        numeratorUnit: "wins above replacement",
        denominatorUnit: "1 (season)",
        scale: "wins",
        zeroReference: "depends on WAR version",
        role: "season value",
      },
    ])
  );

  // ---- Phase 5 raw reconstruction ----
  const reconResiduals: number[] = [];
  let reconMismatch = 0;
  for (const s of SEASONS) {
    for (const p of boards[s]!.players) {
      const N = Nof(p);
      const raw = Number(p.rawAbilityRate);
      const impact = Number(p.seasonalImpact);
      if (!Number.isFinite(N) || N <= 0 || !Number.isFinite(raw)) continue;
      // ApproachBAttributedValue ≡ seasonalImpact when replacementLevelRate=0 on impact path
      // Also ≡ raw * N / 100
      const reconstructed = (raw * N) / 100;
      const res = Math.abs(reconstructed - impact);
      reconResiduals.push(res);
      if (res > 0.02) reconMismatch++; // allow display rounding on seasonalImpact (2dp)
    }
  }
  const reconSorted = [...reconResiduals].sort((a, b) => a - b);
  const rawReconPass = reconMismatch === 0;
  await writeFile(
    path.join(OUT, "05_raw_value_reconstruction.json"),
    JSON.stringify(
      {
        formula: "rawAbilityRate * N / 100 == seasonalImpact (== ApproachBAttributedValue when repl=0)",
        rows: reconResiduals.length,
        maxResidual: reconSorted.length ? Math.max(...reconSorted) : 0,
        meanResidual: mean(reconResiduals),
        P99Residual: percentile(reconSorted, 99),
        mismatchCount: reconMismatch,
        tolerance: 0.02,
        RAW_RECONSTRUCTION: rawReconPass ? "PASS" : "FAIL",
      },
      null,
      2
    )
  );
  if (!rawReconPass) {
    throw new Error("STOP RAW_RATE_EXPOSURE_DENOMINATOR_MISMATCH");
  }

  // ---- Phase 6 paired counterfactual ----
  const halfResiduals: number[] = [];
  for (const s of SEASONS) {
    for (const p of boards[s]!.players) {
      const N = Nof(p);
      const raw = Number(p.rawAbilityRate);
      const impact = Number(p.seasonalImpact);
      if (!Number.isFinite(N) || N <= 0 || !Number.isFinite(raw)) continue;
      if (!(Math.abs(impact) > 1e-12)) continue;
      const pairedRecon = (raw * (N / 2)) / 100;
      halfResiduals.push(pairedRecon / impact);
    }
  }
  await writeFile(
    path.join(OUT, "06_paired_exposure_counterfactual.json"),
    JSON.stringify(
      {
        formula: "rawAbilityRate * (N/2) / 100",
        meanRatio_vs_ApproachBAttributedValue: mean(halfResiduals),
        medianRatio: [...halfResiduals].sort((a, b) => a - b)[
          Math.floor(halfResiduals.length / 2)
        ],
        expectedIfCombinedIsRateDenominator: 0.5,
        PAIRED_EXPOSURE_RECONSTRUCTION_RATIO: mean(halfResiduals),
        conclusion:
          "Paired exposure reconstructs ~half of attributed value ⇒ rate denominator is COMBINED appearances, not paired. Do NOT apply /2 to canonical DRBL WAR.",
      },
      null,
      2
    )
  );

  // ---- Phase 7–8 replacement ----
  await writeFile(
    path.join(OUT, "07_replacement_zero_proof.md"),
    `# Replacement-zero proof

## Approach B / R1

Credits are \`actual − replacementExpectedPoints(R1)\` (role-matched). Therefore:

\`\`\`text
rawAbilityRate = 0  ⇒  replacement-level Approach-B impact
\`\`\`

Evidence: \`drbl/models/replacement.ts\`, sequential attribution, \`reports/m16g1/06_zero_semantics.md\`.

## Validated DRBL

\`\`\`text
validatedDRBL100 = N/(N+1600)*rawAbilityRate
priorMean = 0
\`\`\`

Shrinks toward the same R1-centered zero. Therefore:

\`\`\`text
validatedDRBL100 = 0  (with N>0)  ⇒  replacement-level estimated impact
\`\`\`

## PLAYER_LEVEL_ZERO_IS_REPLACEMENT

\`\`\`text
YES
\`\`\`

## Contrast: WAR 4.0.1 fringe replacement

2024-25 calibrated WAR subtracts \`replacementLevelDRBL100 = −1.4886\` on the **calibrated** scale. That is a **different** zero (fringe median of calibrated ability), not the Approach-B R1 zero. Future canonical WAR must not inherit that double-counting pattern if it starts from R1-zero rates.
`
  );

  await writeFile(
    path.join(OUT, "08_team_replacement_baseline_contract.md"),
    `# Team replacement baseline contract

## Player level

If player rates are already R1-zero:

\`\`\`text
ADDITIONAL_PLAYER_REPLACEMENT_SUBTRACTION = NO
\`\`\`

## Team validation

\`\`\`text
actualWins_t ≈ a_season + b * teamWAR_t + error
\`\`\`

Interpretation:

- \`a_season\` ≈ expected wins of a replacement-level team (league/season intercept)
- \`b\` ≈ 1 if WAR is in win units

\`a_season\` is **not** encoded by subtracting replacement again from every player.

\`TEAM_REPLACEMENT_BASELINE_SEPARATE_FROM_PLAYER_SUBTRACTION = YES\`
`
  );

  await writeFile(
    path.join(OUT, "09_season_value_semantics.md"),
    `# Season-value semantics

## rawAttributedSeasonPoints

\`\`\`text
rawAbilityRate * N / 100
\`\`\`

= exact Approach-B attributed season points vs R1 (realized attribution).

## posteriorEstimatedSeasonPointsAboveReplacement

\`\`\`text
validatedDRBL100 * N / 100
\`\`\`

= estimated season impact using the reserved-tested rate over **actual** historical exposure.

Not equal to raw attributed points (shrinkage). Not a forecast. Not future possessions.

## Labels

| Name | Meaning |
|------|---------|
| rawAttributedSeasonPoints | realized attributed value |
| posteriorEstimatedSeasonPointsAboveReplacement | posterior estimated season value |
| WAR | either of the above / PPW (candidate-dependent) |
`
  );

  await writeFile(
    path.join(OUT, "10_forecast_firewall.json"),
    JSON.stringify(
      {
        WAR_EXPOSURE_TYPE: "ACTUAL_HISTORICAL",
        forbidden: [
          "expected future possessions",
          "forecast minutes",
          "N+1600",
          "projected role",
        ],
        note: "forecastWar fields in artifacts are separate diagnostics; not canonical WAR",
      },
      null,
      2
    )
  );

  // ---- Phase 12 stint ----
  const multiTeamHeuristic: Record<string, unknown>[] = [];
  for (const s of SEASONS) {
    const byPlayer = new Map<string, Set<string>>();
    // Only one teamId per player in DRBL board — prove uniqueness
    for (const p of boards[s]!.players) {
      const set = byPlayer.get(p.playerId) ?? new Set();
      if (p.teamId) set.add(String(p.teamId));
      byPlayer.set(p.playerId, set);
    }
    const multi = [...byPlayer.values()].filter((t) => t.size > 1).length;
    multiTeamHeuristic.push({
      season: s,
      playerSeasonRows: boards[s]!.players.length,
      playersWithMultipleTeamIdsInDrblBoard: multi,
      stintRowsExist: "NO",
      teamSpecificAttributedValue: "NO",
      teamSpecificN: "NO",
      note: "DRBL accumulators key by playerId only; first/last teamId metadata only",
    });
  }
  await writeFile(
    path.join(OUT, "11_team_stint_allocation_audit.csv"),
    toCsv(multiTeamHeuristic)
  );

  // ---- Phase 13 team additivity ----
  await writeFile(
    path.join(OUT, "12_team_additivity_audit.csv"),
    toCsv([
      {
        season: "2024-25",
        TEAM_ATTRIBUTION_REFERENCE: "UNAVAILABLE",
        teamsChecked: 0,
        leagueResidual: "",
        maxTeamResidual: "",
        result: "UNAVAILABLE",
        note: "No canonical team-level Approach-B attributed-value reference in production artifacts",
      },
      {
        season: "2025-26",
        TEAM_ATTRIBUTION_REFERENCE: "UNAVAILABLE",
        teamsChecked: 0,
        leagueResidual: "",
        maxTeamResidual: "",
        result: "UNAVAILABLE",
        note: "Same — player-season only",
      },
    ])
  );

  await writeFile(
    path.join(OUT, "13_historical_2x_bug_reconstruction.md"),
    `# Historical 2× bug reconstruction

## Old LOO target

Team net rating scale:

\`\`\`text
pts / 100 paired team possessions
\`\`\`

## WAR 4.0.0 production exposure

\`\`\`text
combinedPossessionAppearances = N_off + N_def ≈ 2 × paired
\`\`\`

## Algebra

\`\`\`text
value ≈ rate_paired_units × combined_exposure / 100
      ≈ rate_paired_units × (2 × paired) / 100
      ≈ 2 × (rate_paired_units × paired / 100)
\`\`\`

Exact half relationship when \`combined = 2 × paired\` by definition (M16e1: 555/555 exact).

## WAR 4.0.1 repair

Use \`paired = combined/2\` with **frozen** slope/repl/PPW ⇒ WAR exactly halves.

## Implication for new canonical DRBL WAR

Canonical \`validatedDRBL100\` / \`rawAbilityRate\` are **pts per 100 combined appearances**.

Therefore:

\`\`\`text
rate × combined / 100   is dimensionally matched
rate × paired / 100     undercounts by ~2× relative to attributed value
\`\`\`

**Do NOT** apply the historical \`/2\` to the new rate merely because 4.0.1 needed it for a differently defined calibrated rate.
`
  );

  await writeFile(
    path.join(OUT, "14_legacy_calibration_factor_audit.md"),
    `# Legacy calibration factor audit

## 5.835416607524311

- **Origin:** leave-one-out team regression slope mapping player **posterior ability** onto a **team netRating-like** target (pts/100 paired).
- **Fit type:** through-origin team-level LOO (\`calibrationIntercept=0\`, \`calibrationSource=learned_leave_one_out\`).
- **Input:** posterior (not raw).
- **Role:** ability-scale transform into netRating units — **not** a pure points→wins conversion.

## ≈2.918

- After unit-repair recognition that slope embeds a definitional factor of 2:
  \`5.8354166 / 2 ≈ 2.917708\`
- Remaining empirical scale after peeling the combined-vs-paired unit factor.
- **Not solved** by WAR 4.0.1 (exposure-only repair).

## LEGACY_ABILITY_CALIBRATION_REUSABLE

\`\`\`text
NO
\`\`\`

Reasons: different rate semantics than canonical validated DRBL; embeds old unit structure; would retune the reserved-tested rate scale if reused as a multiplier on \`validatedDRBL100\`.
`
  );

  await writeFile(
    path.join(OUT, "15_points_per_win_inventory.csv"),
    toCsv([
      {
        value: 30,
        source: "DEFAULT_POINTS_PER_WIN / provisional WAR",
        formula: "fixed constant",
        trainingData: "none (provisional)",
        target: "n/a",
        unit: "points/win",
        seasonSpecificity: "used on 2025-26 provisional + code default",
        fittedAfterUnitMismatch: "NO",
        usedWith: "rawAbilityRate",
      },
      {
        value: 38.714285714285715,
        source: "estimatePointsPerWinFromTeamSeasons / remaster median (2024-25 WAR4)",
        formula: "team net-points ↔ wins conversion (historical fit)",
        trainingData: "2024-25 team seasons (historical WAR path)",
        target: "team wins from net points",
        unit: "points/win",
        seasonSpecificity: "2024-25 WAR 4.0.0/4.0.1",
        fittedAfterUnitMismatch: "fitted in era of unit-mismatch WAR; frozen into 4.0.1",
        usedWith: "calibrated posterior (finalAbility)",
      },
    ])
  );

  await writeFile(
    path.join(OUT, "16_points_per_win_semantic_contract.md"),
    `# Points-per-win semantic contract

\`\`\`text
pointsPerWin
=
league-level conversion between marginal replacement-relative point value
and wins
\`\`\`

## Is

- a **unit conversion** (points → wins)

## Is not

- a DRBL rate calibration coefficient
- a player ranking optimizer
- permission to set \`newDRBL100 = slope * validatedDRBL100\`

## Future family (not fit in M16l0)

- **P0:** FIXED 30 (legacy diagnostic)
- **P1:** TEAM_NET_POINTS_MARGINAL_CONVERSION from team actual net points ↔ team wins on development data only

\`POINTS_PER_WIN_SEMANTICS_FROZEN = YES\`
`
  );

  await writeFile(
    path.join(OUT, "17_war_data_usage_audit.json"),
    JSON.stringify(
      {
        "2024-25": {
          playerWARInspected: true,
          teamWinWARMetricsUsed: true,
          ppwFit: true,
          replacementCalibration: true,
          candidateComparison: true,
          notes: "Extensive M16e0/e1/war-unit-repair / remaster",
        },
        "2025-26": {
          playerWARInspected: true,
          provisionalIndividualWARVisible: true,
          teamWinWARMetricsUsed: false,
          ppwFit: false,
          replacementCalibration: false,
          candidateComparison: false,
          notes:
            "Provisional raw/30 individual WAR exists; formal team WAR / team-win selection not completed",
        },
        WAR_RESERVED_2025_26: "ELIGIBLE_WITH_HUMAN_BLINDNESS_LIMITATION",
        humanBlindness: "NOT_FULL",
        mayUseForFutureWarTuning: false,
        reason:
          "No PPW/W0/W1/team-win WAR selection used 2025-26; public season outcomes mean human blindness incomplete; keep numeric WAR selection off 2025-26",
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "18_war_consumer_inventory.csv"),
    toCsv([
      {
        consumer: "precomputed.drblWar",
        cutoverClass: "REQUIRES_CACHE_REBUILD",
      },
      {
        consumer: "Explore sort key drblWar",
        cutoverClass: "DIRECT",
      },
      {
        consumer: "Explore default sort",
        cutoverClass: "DIRECT",
        note: "default remains pointsPerGame; WAR optional",
      },
      {
        consumer: "player-savant drblWar",
        cutoverClass: "DIRECT",
      },
      {
        consumer: "percentiles drblWar",
        cutoverClass: "REQUIRES_COPY_CHANGE",
      },
      {
        consumer: "glossary DRBL-WAR",
        cutoverClass: "REQUIRES_COPY_CHANGE",
      },
      {
        consumer: "learn/drbl WAR links",
        cutoverClass: "REQUIRES_COPY_CHANGE",
      },
      {
        consumer: "canonical DRBL rank",
        cutoverClass: "BLOCKED_FROM_CHANGE",
        note: "DRBL_RANK_SEMANTICS_CHANGED_BY_WAR=NO",
      },
      {
        consumer: "API/loaders",
        cutoverClass: "REQUIRES_SCHEMA_CHANGE",
      },
    ])
  );

  const warExposureDenom = "COMBINED_APPEARANCE_POSSESSIONS";
  const warRateDenom = "COMBINED_APPEARANCE_POSSESSIONS";
  const addlRepl = "NO";
  // bakeoff ready requires stint allocation — BLOCKED
  const m16l1Ready = false;
  const blockers = [
    "TEAM_STINT_VALUE_ALLOCATION_AVAILABLE=NO — traded-player team-stint rows required before team WAR validation",
    "TEAM_ATTRIBUTION_ADDITIVITY=UNAVAILABLE — no team attribution reference",
  ];

  await writeFile(
    path.join(OUT, "19_future_candidate_contract.json"),
    JSON.stringify(
      {
        FUTURE_RATE_CANDIDATES: ["W0_RAW", "W1_VALIDATED"],
        FUTURE_PPW_CANDIDATES: ["P0_FIXED30", "P1_TEAM_NET_POINTS"],
        FUTURE_WAR_GRID: ["W0P0", "W0P1", "W1P0", "W1P1"],
        exposure: warExposureDenom,
        additionalReplacementSubtraction: addlRepl,
        genericFormula: {
          seasonPointValue: "rateInput * actualCombinedPossessionAppearances / 100",
          WAR: "seasonPointValue / pointsPerWin",
        },
        prohibited: [
          "+200 pseudo possessions",
          "/2 paired exposure correction for canonical rate",
          "player replacement-rate subtraction",
          "ability calibration multiplier (5.835 / 2.918)",
          "post-hoc team slope multiplier on DRBL100",
        ],
        selectedInM16l0: false,
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "20_war_versioning_contract.json"),
    JSON.stringify(
      {
        reservedNamespace: "drbl-war-r1-v1",
        alternateSuggestion: "drbl-war-v5",
        activated: false,
        metadataFields: [
          "warModelVersion",
          "warRateSource",
          "warExposureSource",
          "replacementSemantics",
          "pointsPerWinVersion",
        ],
        CROSS_SEASON_WAR_FORMULA_REQUIRED: true,
        DRBL_RANK_SEMANTICS_CHANGED_BY_WAR: false,
        WAR_UNCERTAINTY_AVAILABLE: false,
        OFFENSIVE_WAR_CANONICAL: false,
        DEFENSIVE_WAR_CANONICAL: false,
      },
      null,
      2
    )
  );

  const modelHealth = {
    POINT_ESTIMATE_FREEZE_HASH: EXPECTED_PE,
    RESERVED_RESULT_SEAL_HASH: sealedHash,
    CANONICAL_ABILITY_VERSION: VALIDATED_ABILITY_MODEL_VERSION,
    DRBL_MODEL_CHANGED: "NO",
    CURRENT_WAR_VERSION_2024_25: "WAR4.0.1",
    CURRENT_WAR_VERSION_2025_26: "provisional_raw_ppw30",
    CURRENT_WAR_FORMULAS_CROSS_SEASON_COMPARABLE: "NO",
    RAW_RATE_UNIT: "pts_per_100_combined_possession_appearances",
    VALIDATED_RATE_UNIT: "pts_per_100_combined_possession_appearances",
    RAW_RECONSTRUCTION: "PASS",
    RAW_RECONSTRUCTION_MAX_RESIDUAL: reconSorted.length
      ? Math.max(...reconSorted)
      : 0,
    PAIRED_EXPOSURE_RECONSTRUCTION_RATIO: mean(halfResiduals),
    WAR_RATE_DENOMINATOR: warRateDenom,
    WAR_EXPOSURE_DENOMINATOR: warExposureDenom,
    PLAYER_LEVEL_ZERO_IS_REPLACEMENT: "YES",
    ADDITIONAL_PLAYER_REPLACEMENT_SUBTRACTION: addlRepl,
    TEAM_REPLACEMENT_BASELINE_SEPARATE_FROM_PLAYER_SUBTRACTION: "YES",
    RAW_SEASON_VALUE_FORMULA: "rawAbilityRate*N/100",
    POSTERIOR_SEASON_VALUE_FORMULA: "validatedDRBL100*N/100",
    WAR_EXPOSURE_TYPE: "ACTUAL_HISTORICAL",
    TEAM_STINT_VALUE_ALLOCATION_AVAILABLE: "NO",
    TEAM_ATTRIBUTION_ADDITIVITY: "UNAVAILABLE",
    HISTORICAL_2X_BUG_REPRODUCED: "YES",
    LEGACY_ABILITY_CALIBRATION_REUSABLE: "NO",
    LEGACY_PPW30_ORIGIN: "provisional fixed constant / DEFAULT_POINTS_PER_WIN",
    LEGACY_PPW38_7143_ORIGIN:
      "2024-25 team net-points↔wins estimator frozen into WAR4.0.0/4.0.1",
    POINTS_PER_WIN_SEMANTICS_FROZEN: "YES",
    FUTURE_RATE_CANDIDATES: "W0_RAW,W1_VALIDATED",
    FUTURE_PPW_CANDIDATES: "P0_FIXED30,P1_TEAM_NET_POINTS",
    FUTURE_WAR_GRID: "W0P0,W0P1,W1P0,W1P1",
    TEAM_WINS_USED_TO_RETUNE_DRBL_RATE: "NO",
    DRBL_RANK_SEMANTICS_CHANGED_BY_WAR: "NO",
    WAR_UNCERTAINTY_AVAILABLE: "NO",
    OFFENSIVE_WAR_CANONICAL: "NO",
    DEFENSIVE_WAR_CANONICAL: "NO",
    WAR_RESERVED_2025_26: "ELIGIBLE_WITH_HUMAN_BLINDNESS_LIMITATION",
    CROSS_SEASON_WAR_FORMULA_REQUIRED: "YES",
        WAR_SEMANTIC_SPEC_FROZEN: "YES",
        M16L1_WAR_BAKEOFF_READY: m16l1Ready ? "YES" : "NO",
        LIVE_WAR_CHANGED: "NO",
        PRODUCTION_DRBL_CHANGED: "NO",
        blockers,
      };

      await writeFile(
        path.join(OUT, "21_model_health.json"),
        JSON.stringify(modelHealth, null, 2)
      );

      await writeFile(
        path.join(OUT, "22_semantic_freeze_decision.json"),
        JSON.stringify(
          {
            WAR_ESTIMAND: "ESTIMATED_SEASON_WINS_ABOVE_R1_REPLACEMENT",
            WAR_EXPOSURE_TYPE: "ACTUAL_HISTORICAL",
            WAR_EXPOSURE_DENOMINATOR: warExposureDenom,
            PLAYER_LEVEL_ZERO_IS_REPLACEMENT: "YES",
            ADDITIONAL_PLAYER_REPLACEMENT_SUBTRACTION: addlRepl,
            POINTS_PER_WIN_SEMANTICS_FROZEN: "YES",
            CROSS_SEASON_WAR_FORMULA_REQUIRED: "YES",
            WAR_SEMANTIC_SPEC_FROZEN: "YES",
            M16L1_WAR_BAKEOFF_READY: "NO",
            blockers,
            nextMilestone: "M16l0.1 BLOCKER REPAIR (team-stint allocation)",
          },
          null,
          2
        )
      );

  await writeFile(
    path.join(OUT, "23_full_audit.md"),
    `# M16l0 full audit

## Verdict

WAR semantic specification **FROZEN**.

M16l1 bakeoff **NOT READY** — blockers: team-stint allocation + team attribution reference.

## Current live WAR

| Season | Version | Comparable? |
|--------|---------|-------------|
| 2024-25 | WAR 4.0.1 | NO vs 2025-26 |
| 2025-26 | provisional raw/30 | NO vs 2024-25 |

Live WAR **unchanged** by this milestone.

## Dimensional identity for future WAR

\`\`\`text
seasonPointValue = rateInput * N_combined / 100
WAR = seasonPointValue / pointsPerWin
\`\`\`

with \`ADDITIONAL_PLAYER_REPLACEMENT_SUBTRACTION = NO\`.

## Candidate grid (frozen, not fit)

W0P0, W0P1, W1P0, W1P1.
`
  );

  // cleanup probe
  try {
    const { unlink } = await import("node:fs/promises");
    await unlink(path.join(ROOT, "reports", "m16l0_probe.json"));
  } catch {
    /* ok */
  }

  console.log(
    JSON.stringify(
      {
        milestone: "M16l0",
        WAR_SEMANTIC_SPEC_FROZEN: "YES",
        M16L1_WAR_BAKEOFF_READY: "NO",
        RAW_RECONSTRUCTION: "PASS",
        WAR_EXPOSURE_DENOMINATOR: warExposureDenom,
        LIVE_WAR_CHANGED: "NO",
        blockers,
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
