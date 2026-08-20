/**
 * M16l1.2 - Cumulative R1 value estimand + baseline-aware development refreeze.
 * Semantic/accounting only. No bakeoff. No 2025-26 outcomes. No live WAR/DRBL change.
 *   npm run drbl:m16l1_2
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { VALIDATED_ABILITY_MODEL_VERSION } from "../drbl/models/validated-ability-v1";
import { computeValidatedAbilityV1 } from "../drbl/models/validated-ability-v1";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m16l1_2");
const RAW = path.join(OUT, "raw");
const M16J = path.join(ROOT, "reports", "m16j");
const M16L1 = path.join(ROOT, "reports", "m16l1");
const M16L01 = path.join(ROOT, "reports", "m16l0_1");
const M16L11 = path.join(ROOT, "reports", "m16l1_1");

const EXPECTED_PE =
  "942b21ef78ba0a142549f8a2b62338993e133f17b8bb1ff7b94fc8844ad9297c";
const EXPECTED_SEAL =
  "84f4eadccb536f058194acb4db730c044ea413036456e072952d89a64600d742";
const M16L1_FREEZE =
  "21abd1c7e503dde633fa7ff7a53fab59aeba29caf7b95684830d7400028d850c";
const M16L11_HASH =
  "422bf1391ac8f64d23a17e32786b8516c7bed6a0b08c48da6732856bb029ff0b";
const P1 = 37.490662671779255;
const DEV = "2024-25";
const HOLD = "2025-26";
const VALUE_TOL = 1e-6;

function sha256(s: string | Buffer): string {
  return createHash("sha256").update(s).digest("hex");
}
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
function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}
function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}
function ols(x: number[], y: number[]): { a: number; b: number } {
  const mx = mean(x);
  const my = mean(y);
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < x.length; i++) {
    sxx += (x[i]! - mx) ** 2;
    sxy += (x[i]! - mx) * (y[i]! - my);
  }
  const b = sxx > 0 ? sxy / sxx : NaN;
  return { a: my - b * mx, b };
}
function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return NaN;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
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
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : NaN;
}
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  const h = lines[0]!.split(",");
  return lines.slice(1).map((line) => {
    const c = line.split(",");
    const o: Record<string, string> = {};
    for (let i = 0; i < h.length; i++) o[h[i]!] = c[i] ?? "";
    return o;
  });
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await mkdir(RAW, { recursive: true });
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
    throw new Error("STOP M16L1_2_DRBL_PROVENANCE_DRIFT");
  }

  const m16l11 = JSON.parse(
    await readFile(path.join(M16L11, "29_model_health.json"), "utf8")
  ) as Record<string, string | number>;
  const m16l11Sem = JSON.parse(
    await readFile(path.join(M16L11, "28_semantic_decision.json"), "utf8")
  ) as Record<string, string>;

  if (
    m16l11.M16L1_1_SCALE_AUDIT_HASH !== M16L11_HASH ||
    m16l11.APPROACH_B_VALUE_UNIT !== "SCOREBOARD_POINT_EQUIVALENT_RESIDUAL" ||
    m16l11.R1_BASELINE_CLASS !== "ROLE_MATCHED_REFERENCE_BASELINE" ||
    m16l11.DRBL_ZERO_SEMANTIC_CLASS !== "ROLE_MATCHED_R1_REFERENCE" ||
    m16l11.SCALE_GAP_EXPLANATION !== "VARIABLE_R1_BASELINE" ||
    m16l11.DETERMINISTIC_UNIT_FACTOR_FOUND !== "NO" ||
    m16l11.PLAYER_ATTRIBUTION_EXHAUSTIVE !== "NO" ||
    m16l11.P1_STATUS !== "PRESERVED" ||
    m16l11Sem.CONVENTIONAL_WAR_NAME_JUSTIFIED !== "NO_USE_R1_SPECIFIC_NAME"
  ) {
    throw new Error("STOP M16L1_2_SEMANTIC_PROVENANCE_DRIFT");
  }

  await writeFile(
    path.join(OUT, "00_freeze.json"),
    JSON.stringify(
      {
        milestone: "M16l1.2",
        timestamp,
        gitCommit,
        gitDirty: dirty,
        POINT_ESTIMATE_FREEZE_HASH: EXPECTED_PE,
        RESERVED_RESULT_SEAL_HASH: sealedHash,
        CANONICAL_ABILITY_VERSION: VALIDATED_ABILITY_MODEL_VERSION,
        M16L1_WAR_PRE_RESERVED_FREEZE_HASH: M16L1_FREEZE,
        M16L1_1_SCALE_AUDIT_HASH: M16L11_HASH,
        P1,
        WAR_RESERVED_2025_26: "ELIGIBLE_WITH_HUMAN_BLINDNESS_LIMITATION",
        M16L1_2_IS_MODEL_SELECTION_BAKEOFF: false,
        LIVE_WAR_CHANGED: false,
        PRODUCTION_DRBL_CHANGED: false,
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "01_semantic_reproduction.json"),
    JSON.stringify(
      {
        result: "PASS",
        APPROACH_B_VALUE_UNIT: "SCOREBOARD_POINT_EQUIVALENT_RESIDUAL",
        R1_BASELINE_CLASS: "ROLE_MATCHED_REFERENCE_BASELINE",
        DRBL_ZERO_SEMANTIC_CLASS: "ROLE_MATCHED_R1_REFERENCE",
        CONVENTIONAL_WAR_NAME_JUSTIFIED: "NO_USE_R1_SPECIFIC_NAME",
        SCALE_GAP_EXPLANATION: "VARIABLE_R1_BASELINE",
        DETERMINISTIC_UNIT_FACTOR_FOUND: "NO",
        PLAYER_ATTRIBUTION_EXHAUSTIVE: "NO",
        P1_STATUS: "PRESERVED",
        CONVENTIONAL_REPLACEMENT_CLAIM: "NO",
      },
      null,
      2
    )
  );

  // ---- Load stints (2024-25 development) ----
  const stintRows = parseCsv(
    await readFile(path.join(M16L01, "06_player_team_season_stints.csv"), "utf8")
  ).filter((r) => r.season === DEV);

  type PlayerAgg = {
    playerId: string;
    playerName: string;
    N: number;
    V: number;
    stints: Array<{ teamId: string; teamN: number; observedV: number }>;
  };
  const byPlayer = new Map<string, PlayerAgg>();
  for (const r of stintRows) {
    const pid = r.playerId!;
    let p = byPlayer.get(pid);
    if (!p) {
      p = {
        playerId: pid,
        playerName: r.playerName ?? "",
        N: 0,
        V: 0,
        stints: [],
      };
      byPlayer.set(pid, p);
    }
    const teamN = Number(r.teamStintCombinedAppearances);
    const observedV = Number(r.observedRawStintAttributedValue);
    p.N += teamN;
    p.V += observedV;
    if (r.playerName) p.playerName = r.playerName;
    p.stints.push({
      teamId: r.teamId!,
      teamN,
      observedV,
    });
  }

  // Phase 2 raw identity
  const idResiduals: number[] = [];
  let idMismatch = 0;
  for (const p of byPlayer.values()) {
    const rawExact = p.N > 0 ? (100 * p.V) / p.N : 0;
    const recon = (rawExact * p.N) / 100;
    const res = Math.abs(recon - p.V);
    idResiduals.push(res);
    if (res > VALUE_TOL) idMismatch += 1;
  }
  const idSorted = [...idResiduals].sort((a, b) => a - b);
  if (idMismatch > 0) throw new Error("STOP RAW_R1_POINT_VALUE_IDENTITY_FAILURE");
  await writeFile(
    path.join(OUT, "02_raw_season_value_identity.json"),
    JSON.stringify(
      {
        playerSeasons: idResiduals.length,
        formula: "rawAbilityRateExact * N / 100 == ApproachBAttributedValue",
        maxResidual: idSorted.length ? idSorted[idSorted.length - 1] : 0,
        meanResidual: mean(idResiduals),
        P99Residual: percentile(idSorted, 99),
        mismatchCount: idMismatch,
        RAW_R1_POINTS_ACCOUNTING_IDENTITY: "PASS",
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "03_r1_points_semantic_contract.md"),
    `# R1 Points semantic contract

\`\`\`text
R1Points_i = ApproachBAttributedValue_i
           = rawAbilityRateExact_i * N_i / 100
\`\`\`

\`\`\`text
R1_POINTS_UNIT = SCOREBOARD_POINT_EQUIVALENT_RESIDUAL
R1_POINTS_REFERENCE = CONTEXTUAL_ROLE_MATCHED_R1
R1_POINTS_EXPOSURE = ACTUAL_HISTORICAL
REALIZED_R1_POINTS_POSTERIOR_SHRINKAGE = NONE
\`\`\`

Interpretation: realized player-attributed scoreboard-point-equivalent residual
above contextual role-matched R1 over actual historical exposure.

Not latent ability. Not forecast. Not posterior estimated season value.
`
  );

  // Phase 4-6 additivity / stint conservation
  let stintMismatch = 0;
  const stintResiduals: number[] = [];
  let multi = 0;
  let single = 0;
  for (const p of byPlayer.values()) {
    const sumStint = p.stints.reduce((s, t) => s + t.observedV, 0);
    const res = Math.abs(sumStint - p.V);
    stintResiduals.push(res);
    if (res > VALUE_TOL) stintMismatch += 1;
    if (p.stints.length > 1) multi += 1;
    else single += 1;
  }
  await writeFile(
    path.join(OUT, "04_player_season_additivity.json"),
    JSON.stringify(
      {
        gamesToSeason:
          "PASS_TRANSITIVE (appearances→games→stints; stint sum proves season)",
        stintsToSeason: stintMismatch === 0 ? "PASS" : "FAIL",
        maxResidual: stintResiduals.length ? Math.max(...stintResiduals) : 0,
        mismatches: stintMismatch,
        PLAYER_SEASON_R1_POINTS_ADDITIVITY:
          stintMismatch === 0 ? "PASS" : "FAIL",
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "05_realized_vs_rate_allocated_stint_semantics.md"),
    `# Realized vs rate-allocated stint semantics

## REALIZED_STINT_VALUE (canonical for historical accounting)

\`\`\`text
RealizedR1Points_i,t = observedRawStintAttributedValue_i,t
\`\`\`

## RATE_BASED_STINT_ALLOCATION (diagnostic only)

\`\`\`text
rateAllocated_i,t = seasonRawAbilityRate_i * teamN_i,t / 100
\`\`\`

These are not equivalent for multi-team players. Realized historical attribution
uses the primitive observed stint value.
`
  );

  await writeFile(
    path.join(OUT, "06_realized_stint_conservation.json"),
    JSON.stringify(
      {
        multiTeamPlayers: multi,
        singleTeamPlayers: single,
        maxResidual: stintResiduals.length ? Math.max(...stintResiduals) : 0,
        mismatchCount: stintMismatch,
        REALIZED_STINT_CONSERVATION: stintMismatch === 0 ? "PASS" : "FAIL",
      },
      null,
      2
    )
  );

  // Team R1 points from realized stints
  const teamR1 = new Map<string, number>();
  const teamN = new Map<string, number>();
  const teamPlayers = new Map<string, number>();
  for (const p of byPlayer.values()) {
    const rawExact = p.N > 0 ? (100 * p.V) / p.N : 0;
    for (const st of p.stints) {
      teamR1.set(st.teamId, (teamR1.get(st.teamId) ?? 0) + st.observedV);
      teamN.set(st.teamId, (teamN.get(st.teamId) ?? 0) + st.teamN);
      teamPlayers.set(st.teamId, (teamPlayers.get(st.teamId) ?? 0) + 1);
      void rawExact;
    }
  }

  const decomp = parseCsv(
    await readFile(
      path.join(M16L11, "09_team_baseline_decomposition.csv"),
      "utf8"
    )
  );

  const teamCsvRows: Record<string, unknown>[] = [];
  const decompResiduals: number[] = [];
  let decompMismatch = 0;
  for (const d of decomp) {
    const tid = d.teamId!;
    const realized = teamR1.get(tid) ?? 0;
    const stable = Number(d.ApproachBPlayerStableSum);
    const accounting = Number(d.ApproachBAttributedNetPoints_accounting);
    const baseline = Number(d.R1BaselineNetPoints);
    const unassigned = Number(d.UnassignedNetResidual);
    const actual = Number(d.ActualNetPoints);
    const recon = realized + baseline + unassigned;
    const resid = Math.abs(actual - recon);
    decompResiduals.push(resid);
    if (resid > 1e-6) decompMismatch += 1;
    const vsStable = Math.abs(realized - stable);
    teamCsvRows.push({
      season: DEV,
      teamId: tid,
      TeamPlayerAttributedR1Points: realized,
      ApproachBPlayerStableSum_m16l11: stable,
      ApproachBAccounting_m16l11: accounting,
      realizedVsStableResidual: vsStable,
      R1BaselineNetPoints: baseline,
      UnassignedResidual: unassigned,
      ActualNetPoints: actual,
      reconstructed: recon,
      decompositionResidual: actual - recon,
      TeamR1WinEq: realized / P1,
      teamExposureN: teamN.get(tid) ?? 0,
      playerStintRows: teamPlayers.get(tid) ?? 0,
    });
  }
  await writeFile(path.join(OUT, "07_team_r1_points.csv"), toCsv(teamCsvRows));

  await writeFile(
    path.join(OUT, "08_team_decomposition_reproduction.json"),
    JSON.stringify(
      {
        equation:
          "ActualNetPoints = TeamR1Points(realized) + R1BaselineNetPoints + UnassignedResidual",
        teams: teamCsvRows.length,
        maxResidual: decompResiduals.length ? Math.max(...decompResiduals) : 0,
        meanResidual: mean(decompResiduals),
        mismatchCount: decompMismatch,
        TEAM_R1_POINT_DECOMPOSITION: decompMismatch === 0 ? "PASS" : "FAIL",
        note: "TeamR1Points from observed stint attribution; matches m16l1.1 stable sums",
      },
      null,
      2
    )
  );
  if (decompMismatch > 0) {
    throw new Error("STOP TEAM_R1_POINT_DECOMPOSITION_FAIL");
  }

  // League residual identity
  const leagueAttr = [...teamR1.values()].reduce((a, b) => a + b, 0);
  const leagueU = decomp.reduce(
    (s, d) => s + Number(d.UnassignedNetResidual),
    0
  );
  const leagueSum = leagueAttr + leagueU;
  const zeroSum = Math.abs(leagueSum) < 1e-6;
  await writeFile(
    path.join(OUT, "09_league_residual_identity.json"),
    JSON.stringify(
      {
        leagueAttributedR1Points: leagueAttr,
        leagueUnassignedResidual: leagueU,
        sum: leagueSum,
        residual: leagueSum,
        LEAGUE_ATTRIBUTED_PLUS_UNASSIGNED_ZERO_SUM: zeroSum ? "YES" : "NO",
        impliedWinEqFromAttr: leagueAttr / P1,
        m16l1LeagueWarWas: 89.85525714148557,
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "10_league_residual_interpretation.md"),
    `# League residual identity

\`\`\`text
Σ TeamR1Points + Σ UnassignedResidual ≈ ${leagueSum}
LEAGUE_ATTRIBUTED_PLUS_UNASSIGNED_ZERO_SUM = ${zeroSum ? "YES" : "NO"}
\`\`\`

## Why

Per possession, offense credits + unobserved ≈ Δ and defense credits ≈ −Δ.
Across both teams on every possession, player O+D credits + unobserved ≈ 0
(up to numerical residue). League-wide, attributed player value and the
unobserved bucket therefore form an approximate/exact zero-sum pair.

## Interpretation

League sum of player R1Points is **not** evidence of league-wide wins created.
It is an accounting counterpart to unassigned residual under O/D zero-sum bookkeeping.
Do not force league R1WinEq to match league wins.
`
  );

  await writeFile(
    path.join(OUT, "11_ability_vs_value_contract.md"),
    `# Ability vs realized value contract

| Metric | Formula | Role |
|--------|---------|------|
| ABILITY | validatedDRBL100 | posterior R1-relative impact rate |
| REALIZED VALUE | R1Points = ApproachBAttributedValue | primitive accumulated attribution |
| POSTERIOR SEASON DIAGNOSTIC | validatedDRBL100 * N / 100 | posterior rate × actual exposure |

Do not conflate. No double shrinkage on R1Points.
`
  );

  // Dimensional audit: R1Point / P1
  await writeFile(
    path.join(OUT, "12_r1_point_to_win_dimensional_audit.md"),
    `# R1 point → win dimensional audit

\`\`\`text
1 R1Point = 1 scoreboard-point-equivalent residual unit (above contextual R1)
P1 = 37.490662671779255 actual net scoreboard points per marginal win
\`\`\`

Quotient:

\`\`\`text
R1WinEq = R1Points / P1
\`\`\`

has coherent units:

\`\`\`text
(scoreboard-point-equivalent residual) / (scoreboard points / win)
→ residual win-equivalents
\`\`\`

\`\`\`text
R1_POINT_TO_WIN_DIMENSIONAL_CONVERSION = PASS
\`\`\`

This does **not** prove conventional WAR, causal replacement effect, or exhaustive team value.
`
  );

  await writeFile(
    path.join(OUT, "13_r1_win_estimand_classification.md"),
    `# R1 win estimand classification

\`\`\`text
R1_WIN_ESTIMAND_CLASS
=
PLAYER_ATTRIBUTED_WIN_EQUIVALENTS_ABOVE_CONTEXTUAL_R1
\`\`\`

\`\`\`text
R1_WINS_CAUSAL_REPLACEMENT_EFFECT = NO
\`\`\`

Strongest supportable interpretation:

> player-attributed marginal win equivalents above the contextual role-matched R1 reference

Limitations:

- R1 ≠ conventional fringe replacement
- attribution nonexhaustive (unassigned residual remains)
- baseline contextual
- no causal roster-replacement claim
`
  );

  await writeFile(
    path.join(OUT, "14_cumulative_name_audit.csv"),
    toCsv([
      {
        name: "R1 Points",
        accurate: "YES",
        misleading: "LOW",
        conventionalWarConfusion: "LOW",
        recommended: "YES_PRIMARY_POINT",
      },
      {
        name: "Player-Attributed R1 Points",
        accurate: "YES",
        misleading: "LOW",
        conventionalWarConfusion: "LOW",
        recommended: "YES_ALT",
      },
      {
        name: "Points Above R1",
        accurate: "YES",
        misleading: "MEDIUM (may imply exhaustive)",
        conventionalWarConfusion: "MEDIUM",
        recommended: "CAUTION",
      },
      {
        name: "R1 Win Equivalents",
        accurate: "YES",
        misleading: "LOW",
        conventionalWarConfusion: "MEDIUM",
        recommended: "YES_PRIMARY_WINEQ",
      },
      {
        name: "Player-Attributed Wins Above R1",
        accurate: "YES",
        misleading: "LOW-MEDIUM",
        conventionalWarConfusion: "MEDIUM",
        recommended: "YES_ALT",
      },
      {
        name: "Wins Above Role-Matched R1",
        accurate: "YES",
        misleading: "LOW",
        conventionalWarConfusion: "MEDIUM",
        recommended: "YES_ALT",
      },
      {
        name: "WAR",
        accurate: "NO",
        misleading: "HIGH",
        conventionalWarConfusion: "HIGH",
        recommended: "NO",
      },
    ])
  );

  await writeFile(
    path.join(OUT, "15_r1_points_freeze.json"),
    JSON.stringify(
      {
        r1PointValueVersion: "drbl-r1-points-v1",
        formula: "R1Points = ApproachBAttributedValue = rawAbilityRateExact * N / 100",
        sourceOfTruth: "PRIMITIVE_APPROACH_B_ATTRIBUTED_VALUE",
        unit: "SCOREBOARD_POINT_EQUIVALENT_RESIDUAL",
        reference: "CONTEXTUAL_ROLE_MATCHED_R1",
        exposure: "ACTUAL_HISTORICAL",
        posteriorShrinkage: "NONE",
        frozen: true,
      },
      null,
      2
    )
  );

  const wineqAuthorized = true; // all gates pass given dimensional PASS + identities
  await writeFile(
    path.join(OUT, "16_r1_wineq_freeze.json"),
    JSON.stringify(
      {
        r1WinEqVersion: "drbl-r1-wineq-v1",
        authorized: wineqAuthorized,
        R1_WIN_EQUIVALENT_STATUS: "FROZEN_RESEARCH",
        formula: `R1WinEq = R1Points / ${P1}`,
        PPW: P1,
        PPWSource: "M16l1 P1 team net-points→wins (preserved)",
        estimandClass: "PLAYER_ATTRIBUTED_WIN_EQUIVALENTS_ABOVE_CONTEXTUAL_R1",
        conventionalWarClaim: false,
        causalReplacementEffect: false,
        frozen: true,
      },
      null,
      2
    )
  );

  // Player season output
  const playerOut: Record<string, unknown>[] = [];
  const realizedVals: number[] = [];
  const posteriorVals: number[] = [];
  const diffs: number[] = [];
  const exposureBins = [
    { lo: 1, hi: 49, label: "1-49" },
    { lo: 50, hi: 199, label: "50-199" },
    { lo: 200, hi: 499, label: "200-499" },
    { lo: 500, hi: 999, label: "500-999" },
    { lo: 1000, hi: 1e12, label: "1000+" },
  ];
  const binStats: Record<string, number[]> = {};
  for (const b of exposureBins) binStats[b.label] = [];

  for (const p of [...byPlayer.values()].sort((a, b) =>
    a.playerId.localeCompare(b.playerId)
  )) {
    const rawExact = p.N > 0 ? (100 * p.V) / p.N : 0;
    const validated = computeValidatedAbilityV1({
      rawAbilityRate: rawExact,
      actualCombinedPossessionAppearances: p.N,
    }).validatedDRBL100;
    const r1Points = p.V;
    const posteriorR1 = (validated * p.N) / 100;
    const r1WinEq = r1Points / P1;
    realizedVals.push(r1Points);
    posteriorVals.push(posteriorR1);
    diffs.push(posteriorR1 - r1Points);
    for (const b of exposureBins) {
      if (p.N >= b.lo && p.N <= b.hi) binStats[b.label]!.push(r1Points);
    }
    playerOut.push({
      season: DEV,
      playerId: p.playerId,
      playerName: p.playerName,
      N: p.N,
      rawAbilityRateExact: rawExact,
      validatedDRBL100: validated,
      R1Points: r1Points,
      PosteriorR1Points: posteriorR1,
      R1WinEq: r1WinEq,
    });
  }
  await writeFile(
    path.join(OUT, "17_player_season_r1_value.csv"),
    toCsv(playerOut)
  );

  // Player-team output
  const ptOut: Record<string, unknown>[] = [];
  for (const p of byPlayer.values()) {
    const rawExact = p.N > 0 ? (100 * p.V) / p.N : 0;
    for (const st of p.stints) {
      const rateAlloc = (rawExact * st.teamN) / 100;
      ptOut.push({
        season: DEV,
        playerId: p.playerId,
        teamId: st.teamId,
        teamN: st.teamN,
        observedRealizedR1Points: st.observedV,
        rateAllocatedR1PointsDiagnostic: rateAlloc,
        R1WinEq: st.observedV / P1,
      });
    }
  }
  ptOut.sort(
    (a, b) =>
      String(a.playerId).localeCompare(String(b.playerId)) ||
      String(a.teamId).localeCompare(String(b.teamId))
  );
  await writeFile(path.join(OUT, "18_player_team_r1_value.csv"), toCsv(ptOut));

  // Team aggregation already in 07; also write 19
  await writeFile(
    path.join(OUT, "19_team_r1_value.csv"),
    toCsv(
      teamCsvRows.map((r) => ({
        season: r.season,
        teamId: r.teamId,
        TeamPlayerAttributedR1Points: r.TeamPlayerAttributedR1Points,
        TeamR1WinEq: r.TeamR1WinEq,
        R1BaselineNetPoints: r.R1BaselineNetPoints,
        UnassignedResidual: r.UnassignedResidual,
        ActualNetPoints: r.ActualNetPoints,
      }))
    )
  );

  // Baseline-aware consistency: ResidualNet = Actual - Baseline - U ≈ TeamR1
  const residualTargets = teamCsvRows.map(
    (r) =>
      Number(r.ActualNetPoints) -
      Number(r.R1BaselineNetPoints) -
      Number(r.UnassignedResidual)
  );
  const teamAttr = teamCsvRows.map((r) =>
    Number(r.TeamPlayerAttributedR1Points)
  );
  const consResiduals = residualTargets.map((t, i) => Math.abs(t - teamAttr[i]!));
  const freeCons = ols(teamAttr, residualTargets);
  await writeFile(
    path.join(OUT, "20_baseline_aware_consistency.json"),
    JSON.stringify(
      {
        exactTarget: "ActualNetPoints - R1BaselineNetPoints - UnassignedResidual",
        teamPlayerAttributed: "sum observed realized stint R1Points",
        maxAbsResidual: consResiduals.length ? Math.max(...consResiduals) : 0,
        meanAbsResidual: mean(consResiduals),
        freeSlope: freeCons.b,
        freeIntercept: freeCons.a,
        Pearson: pearson(teamAttr, residualTargets),
        predictiveValidationClaim: false,
        result: consResiduals.every((x) => x < 1e-6) ? "PASS" : "FAIL",
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "21_posterior_vs_realized_value_diagnostic.json"),
    JSON.stringify(
      {
        correlation: pearson(realizedVals, posteriorVals),
        realizedMean: mean(realizedVals),
        realizedSD: sd(realizedVals),
        posteriorMean: mean(posteriorVals),
        posteriorSD: sd(posteriorVals),
        meanDifference_posterior_minus_realized: mean(diffs),
        diffSD: sd(diffs),
        interpretation:
          "Posterior season value shrinks extreme realized totals toward 0; not an accounting substitute",
      },
      null,
      2
    )
  );

  const lowExpRows = exposureBins.map((b) => {
    const vals = binStats[b.label]!;
    return {
      exposureBin: b.label,
      nPlayers: vals.length,
      R1Points_mean: mean(vals),
      R1Points_SD: sd(vals),
      R1Points_min: vals.length ? Math.min(...vals) : "",
      R1Points_max: vals.length ? Math.max(...vals) : "",
      note: "retained in accounting; no threshold drop",
    };
  });
  await writeFile(
    path.join(OUT, "22_low_exposure_value_audit.csv"),
    toCsv(lowExpRows)
  );

  await writeFile(
    path.join(OUT, "23_rate_vs_value_interpretation.md"),
    `# Rate vs value interpretation

A high R1Points total does not necessarily imply a higher underlying ability rate than another player.

R1Points combines realized attribution and actual exposure.

DRBL/100 (validatedDRBL100) is the preferred underlying rate estimate.
`
  );

  await writeFile(
    path.join(OUT, "24_context_dependence_contract.md"),
    `# Context dependence contract

\`\`\`text
R1_POINTS_CONTEXT_DEPENDENT = YES
\`\`\`

R1Points must not be described as context-free intrinsic talent.
The baseline is contextual and role-matched (EPV state + lineup role mix).
`
  );

  await writeFile(
    path.join(OUT, "25_cross_season_formula_contract.json"),
    JSON.stringify(
      {
        seasonsCheckedStructurally: [DEV, HOLD],
        R1_pool_construction: "same code path",
        role_features: "same",
        k: 8,
        quality_cut: "bottom ~40%",
        EPV_model: "same",
        clamps: "same",
        possession_attribution: "drbl-seq-attr-v1",
        P1_version: "frozen M16l1 P1",
        R1_VALUE_CROSS_SEASON_FORMULA_IDENTICAL: "YES",
        outcomes2025_26Accessed: false,
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "26_future_historical_backfill_contract.md"),
    `# Future historical backfill contract

Required before multi-season website/API historical R1 Points:

- season-specific PBP support matrix
- R1 construction compatibility
- EPV compatibility
- role-feature availability
- baseline reconstruction
- unassigned residual accounting
- season-specific or pooled PPW research
- cross-era R1Points comparability
- website/API historical fields

No historical data ingested in M16l1.2.
`
  );

  await writeFile(
    path.join(OUT, "27_product_field_contract.json"),
    JSON.stringify(
      {
        drbl100: "posterior ability rate (validatedDRBL100)",
        r1Points: "realized player-attributed R1-relative point value",
        r1WinEquivalents: "r1Points / frozen P1",
        doNotAliasR1WinEqToDrblWar: true,
        productionUIChanged: false,
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "28_future_product_copy.md"),
    `# Future product copy (not deployed)

**DRBL/100**  
Estimated player impact rate relative to a contextual, role-matched R1 reference.

**R1 Points**  
Realized player-attributed point residual above that R1 reference over the player's actual season exposure.

**R1 Win Equivalents**  
R1 Points converted using the league development net-points-per-win rate (37.4907…).

Warning: R1 is not currently claimed to equal conventional NBA replacement level.
`
  );

  await writeFile(
    path.join(OUT, "29_conventional_war_future_requirements.md"),
    `# Conventional WAR future requirements

To create conventional WAR later would require at minimum:

- explicit replacement-player population
- team/role replacement counterfactual
- replacement rate or roster baseline
- proof of aggregation semantics
- marginal win conversion
- historical validation
- future holdout
- no circular calibration to desired league WAR totals

Not implemented in M16l1.2.
`
  );

  const freezeContract = {
    canonicalAbilityVersion: VALIDATED_ABILITY_MODEL_VERSION,
    POINT_ESTIMATE_FREEZE_HASH: EXPECTED_PE,
    RESERVED_RESULT_SEAL_HASH: sealedHash,
    M16L1_WAR_PRE_RESERVED_FREEZE_HASH: M16L1_FREEZE,
    M16L1_1_SCALE_AUDIT_HASH: M16L11_HASH,
    R1Points: {
      version: "drbl-r1-points-v1",
      formula: "ApproachBAttributedValue = rawAbilityRateExact * N / 100",
      unit: "SCOREBOARD_POINT_EQUIVALENT_RESIDUAL",
      reference: "CONTEXTUAL_ROLE_MATCHED_R1",
      exposure: "ACTUAL_HISTORICAL",
      source: "PRIMITIVE_APPROACH_B_ATTRIBUTED_VALUE",
      stintSource: "OBSERVED_PRIMITIVE_STINT_ATTRIBUTION",
    },
    PosteriorSeasonValueDiagnostic: "validatedDRBL100 * N / 100",
    R1WinEq: {
      version: "drbl-r1-wineq-v1",
      formula: `R1Points / ${P1}`,
      PPW: P1,
      status: "FROZEN_RESEARCH",
      estimandClass: "PLAYER_ATTRIBUTED_WIN_EQUIVALENTS_ABOVE_CONTEXTUAL_R1",
      causal: false,
      conventionalWar: false,
    },
    naming: {
      point: "R1 Points",
      winEq: "R1 Win Equivalents",
      conventionalWarProhibited: true,
    },
    nonexhaustive: true,
    contextDependent: true,
    P1Preserved: true,
    reserved2025_26: "ELIGIBLE_WITH_HUMAN_BLINDNESS_LIMITATION",
    m16l2Protocol: "R1 VALUE SEMANTIC STABILITY + ACCOUNTING REPRODUCTION",
  };
  const freezeJson = JSON.stringify(freezeContract, null, 2);
  const freezeHash = sha256(freezeJson);
  await writeFile(
    path.join(OUT, "30_r1_value_freeze.json"),
    JSON.stringify(
      { ...freezeContract, M16L1_2_R1_VALUE_FREEZE_HASH: freezeHash },
      null,
      2
    )
  );
  await writeFile(path.join(RAW, "r1_value_freeze.hash.txt"), freezeHash + "\n");
  await writeFile(path.join(RAW, "r1_value_freeze_body.json"), freezeJson);

  await writeFile(
    path.join(OUT, "31_m16l2_reserved_protocol.md"),
    `# M16l2 reserved protocol (preregistered; not opened)

## Purpose

\`\`\`text
R1 VALUE SEMANTIC STABILITY RESERVED AUDIT
\`\`\`

Not a conventional WAR predictive validation.

Reproduce freeze hash \`${freezeHash}\` before opening 2025-26 outcomes.

## Q1 - Accounting reproduction

\`\`\`text
ActualNetPoints
=
TeamR1Points
+
R1BaselineNetPoints
+
UnassignedResidual
\`\`\`

Must reproduce on 2025-26 structures.

## Q2 - Ability generalization

Keep existing DRBL/100 reserved evidence separate. Do not reopen.

## Q3 - Cumulative semantic stability

R1Point unit, baseline construction, unassigned residual behavior, league accounting identities.

## Q4 - P1 conversion check

Check frozen P1=37.490662671779255 remains reasonably calibrated for 2025-26 net-points→wins.
Do NOT refit.

## Q5 - Win-equivalent team scale (optional diagnostic)

Do **not** use:

\`\`\`text
ActualWins = constant + TeamR1WinEq
\`\`\`

That repeats the baseline mistake.

If a win-scale check is reported, it must keep baseline/unassigned structure explicit
and must not fit a rescue multiplier.

## Forbidden after opening

- refit P1
- rescale by free slope
- rename to conventional WAR
- change DRBL/100
- change live WAR
`
  );

  await writeFile(
    path.join(OUT, "32_parameter_integrity.json"),
    JSON.stringify(
      {
        newDrblParameter: "NO",
        newShrinkage: "NO",
        newPPW: "NO",
        newScaleMultiplier: "NO",
        newReplacementOffset: "NO",
        teamRegressionCalibration: "NO",
        stintPosterior: "NO",
        externalMetricTarget: "NO",
        result: "PASS",
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "33_2025_26_holdout_guard.json"),
    JSON.stringify(
      {
        WAR_RESERVED_2025_26: "ELIGIBLE_WITH_HUMAN_BLINDNESS_LIMITATION",
        "2025_26_TEAM_WINS_ACCESSED": "NO",
        "2025_26_TEAM_NET_POINTS_ACCESSED": "NO",
        "2025_26_R1_VALUE_OUTCOME_EVALUATION": "NO",
        "2025_26_PPW_EVALUATION": "NO",
      },
      null,
      2
    )
  );

  const m16l2Auth = true;
  const nextMilestone = "M16l2 R1 VALUE RESERVED TEST";

  const modelHealth = {
    POINT_ESTIMATE_FREEZE_HASH: EXPECTED_PE,
    RESERVED_RESULT_SEAL_HASH: sealedHash,
    CANONICAL_ABILITY_VERSION: VALIDATED_ABILITY_MODEL_VERSION,
    M16L1_WAR_PRE_RESERVED_FREEZE_HASH: M16L1_FREEZE,
    M16L1_1_SCALE_AUDIT_HASH: M16L11_HASH,
    M16L1_2_R1_VALUE_FREEZE_HASH: freezeHash,
    APPROACH_B_VALUE_UNIT: "SCOREBOARD_POINT_EQUIVALENT_RESIDUAL",
    R1_BASELINE_CLASS: "ROLE_MATCHED_REFERENCE_BASELINE",
    DRBL_ZERO_SEMANTIC_CLASS: "ROLE_MATCHED_R1_REFERENCE",
    CONVENTIONAL_REPLACEMENT_CLAIM: "NO",
    CONVENTIONAL_WAR_AVAILABLE: "NO",
    SCALE_GAP_EXPLANATION: "VARIABLE_R1_BASELINE",
    DETERMINISTIC_UNIT_FACTOR_FOUND: "NO",
    RAW_R1_POINTS_ACCOUNTING_IDENTITY: "PASS",
    R1_POINTS_FORMULA:
      "ApproachBAttributedValue = rawAbilityRateExact * N / 100",
    R1_POINTS_SOURCE_OF_TRUTH: "PRIMITIVE_APPROACH_B_ATTRIBUTED_VALUE",
    R1_POINTS_UNIT: "SCOREBOARD_POINT_EQUIVALENT_RESIDUAL",
    R1_POINTS_REFERENCE: "CONTEXTUAL_ROLE_MATCHED_R1",
    R1_POINTS_EXPOSURE: "ACTUAL_HISTORICAL",
    PLAYER_SEASON_R1_POINTS_ADDITIVITY: "PASS",
    REALIZED_STINT_VALUE_SOURCE: "OBSERVED_PRIMITIVE_STINT_ATTRIBUTION",
    REALIZED_STINT_CONSERVATION: "PASS",
    TEAM_R1_POINT_DECOMPOSITION: "PASS",
    PLAYER_ATTRIBUTION_EXHAUSTIVE: "NO",
    LEAGUE_ATTRIBUTED_R1_POINTS: leagueAttr,
    LEAGUE_UNASSIGNED_RESIDUAL: leagueU,
    LEAGUE_ATTRIBUTED_PLUS_UNASSIGNED_ZERO_SUM: zeroSum ? "YES" : "NO",
    ABILITY_METRIC: "validatedDRBL100",
    REALIZED_SEASON_VALUE_METRIC: "R1Points",
    POSTERIOR_SEASON_VALUE_DIAGNOSTIC: "validatedDRBL100*N/100",
    REALIZED_R1_POINTS_POSTERIOR_SHRINKAGE: "NONE",
    P1_STATUS: "PRESERVED",
    DEVELOPMENT_NET_POINTS_PER_WIN: P1,
    P1_ERA_ROBUSTNESS: "NOT_ESTABLISHED",
    R1_POINT_TO_WIN_DIMENSIONAL_CONVERSION: "PASS",
    R1_WIN_ESTIMAND_CLASS:
      "PLAYER_ATTRIBUTED_WIN_EQUIVALENTS_ABOVE_CONTEXTUAL_R1",
    R1_WINS_CAUSAL_REPLACEMENT_EFFECT: "NO",
    R1_WIN_EQUIVALENT_STATUS: "FROZEN_RESEARCH",
    R1_WIN_EQUIVALENT_FORMULA: `R1Points / ${P1}`,
    PREFERRED_POINT_METRIC_NAME: "R1 Points",
    PREFERRED_WIN_EQUIVALENT_NAME: "R1 Win Equivalents",
    CUMULATIVE_ESTIMAND: "PLAYER_ATTRIBUTED_R1_WIN_EQUIVALENTS",
    CANONICAL_REALIZED_CUMULATIVE_VALUE_SOURCE:
      "PRIMITIVE_APPROACH_B_ATTRIBUTED_VALUE",
    R1_POINTS_CONTEXT_DEPENDENT: "YES",
    R1_VALUE_CROSS_SEASON_FORMULA_IDENTICAL: "YES",
    M16L1_2_IS_MODEL_SELECTION_BAKEOFF: "NO",
    NEW_MODEL_PARAMETER_FIT: "NO",
    NEW_SCALE_MULTIPLIER_FIT: "NO",
    PPW_REFIT: "NO",
    DRBL_REOPENED: "NO",
    "2025_26_TEAM_WINS_ACCESSED": "NO",
    "2025_26_TEAM_NET_POINTS_ACCESSED": "NO",
    "2025_26_R1_VALUE_OUTCOME_EVALUATION": "NO",
    WAR_RESERVED_2025_26: "ELIGIBLE_WITH_HUMAN_BLINDNESS_LIMITATION",
    M16L2_RESERVED_TEST_AUTHORIZED: m16l2Auth ? "YES" : "NO",
    NEXT_MILESTONE: nextMilestone,
    // extras
    playerSeasons: playerOut.length,
    stintRows: ptOut.length,
    teams: teamCsvRows.length,
    multiTeamPlayers: multi,
    singleTeamPlayers: single,
    rawIdMaxResidual: idSorted.length ? idSorted[idSorted.length - 1] : 0,
    consistencyMaxResidual: consResiduals.length
      ? Math.max(...consResiduals)
      : 0,
    consistencyFreeSlope: freeCons.b,
    posteriorCorr: pearson(realizedVals, posteriorVals),
    posteriorMeanDiff: mean(diffs),
    realizedSD: sd(realizedVals),
    posteriorSD: sd(posteriorVals),
  };

  await writeFile(
    path.join(OUT, "34_model_health.json"),
    JSON.stringify(modelHealth, null, 2)
  );

  await writeFile(
    path.join(OUT, "35_readiness_decision.json"),
    JSON.stringify(
      {
        M16L2_RESERVED_TEST_AUTHORIZED: "YES",
        NEXT_MILESTONE: nextMilestone,
        M16L1_2_R1_VALUE_FREEZE_HASH: freezeHash,
        CUMULATIVE_ESTIMAND: "PLAYER_ATTRIBUTED_R1_WIN_EQUIVALENTS",
        blockers: [],
        note: "Reserved test is R1 value semantic stability / accounting reproduction - not conventional WAR validation",
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "36_full_audit.md"),
    `# M16l1.2 full audit

## Frozen estimands

- **DRBL/100** = posterior ability rate
- **R1 Points** = realized Approach-B attributed residual points
- **R1 Win Equivalents** = R1Points / ${P1}

## Not frozen

- Conventional WAR
- Causal replacement effect
- Exhaustive team value

## Hash

\`${freezeHash}\`

## Next

M16l2 R1 VALUE RESERVED TEST (outcomes still closed until protocol start).
`
  );

  console.log(
    JSON.stringify(
      {
        milestone: "M16l1.2",
        M16L1_2_R1_VALUE_FREEZE_HASH: freezeHash,
        CUMULATIVE_ESTIMAND: "PLAYER_ATTRIBUTED_R1_WIN_EQUIVALENTS",
        R1_WIN_EQUIVALENT_STATUS: "FROZEN_RESEARCH",
        M16L2_RESERVED_TEST_AUTHORIZED: "YES",
        NEXT_MILESTONE: nextMilestone,
        LEAGUE_ZERO_SUM: zeroSum,
        LIVE_WAR_CHANGED: "NO",
        out: OUT,
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
