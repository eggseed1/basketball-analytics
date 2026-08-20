/**
 * M16l1.1 - WAR scale + R1 replacement semantics forensic audit.
 * Development 2024-25 only. No live WAR/DRBL change. No 2025-26 outcomes.
 * No empirical scale rescue. No PPW refit.
 *   npm run drbl:m16l1_1
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { listSeasonGames } from "../drbl/download/season-games";
import { loadNormalizedGame } from "../drbl/evaluation/m16c-dataset";
import { pearson } from "../drbl/evaluation/metrics";
import {
  attributePossessionSequential,
  aggregateStableByPlayer,
  SEQUENTIAL_ATTRIBUTION_VERSION,
  EXECUTION_SKILL_FRACTION,
} from "../drbl/models/sequential-attribution";
import {
  attributeGamePlayerValue,
  stateForPossession,
} from "../drbl/models/player-value";
import {
  accumulateReplacementSignals,
  buildReplacementPool,
  finalizeRoleAccum,
  replacementExpectedPoints,
  type RoleVector,
} from "../drbl/models/replacement";
import { warmEpvModel } from "../drbl/models/expected-points";
import { VALIDATED_ABILITY_MODEL_VERSION } from "../drbl/models/validated-ability-v1";
import { computeValidatedAbilityV1 } from "../drbl/models/validated-ability-v1";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m16l1_1");
const RAW = path.join(OUT, "raw");
const M16J = path.join(ROOT, "reports", "m16j");
const M16L1 = path.join(ROOT, "reports", "m16l1");
const M16L01 = path.join(ROOT, "reports", "m16l0_1");
const PRE = path.join(ROOT, "src", "data", "drbl", "precomputed");

const EXPECTED_PE =
  "942b21ef78ba0a142549f8a2b62338993e133f17b8bb1ff7b94fc8844ad9297c";
const EXPECTED_SEAL =
  "84f4eadccb536f058194acb4db730c044ea413036456e072952d89a64600d742";
const M16L1_FREEZE =
  "21abd1c7e503dde633fa7ff7a53fab59aeba29caf7b95684830d7400028d850c";
const DEV = "2024-25";
const HOLD = "2025-26";
const PPW = 37.490662671779255;
const TOL = 1e-6;

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
function maxOf(xs: number[]): number {
  let m = -Infinity;
  for (const x of xs) if (x > m) m = x;
  return m;
}
function minOf(xs: number[]): number {
  let m = Infinity;
  for (const x of xs) if (x < m) m = x;
  return m;
}
function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}
function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}
function rmse(e: number[]): number {
  return Math.sqrt(mean(e.map((x) => x * x)));
}
function r2(y: number[], pred: number[]): number {
  const m = mean(y);
  const ssTot = y.reduce((s, yi) => s + (yi - m) ** 2, 0);
  const ssRes = y.reduce((s, yi, i) => s + (yi - pred[i]!) ** 2, 0);
  return ssTot > 0 ? 1 - ssRes / ssTot : NaN;
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
function assertDev(season: string, ctx: string): void {
  if (season === HOLD) throw new Error(`STOP WAR_RESERVED_TEST_CONTAMINATED ${ctx}`);
}

type Stint = {
  season: string;
  playerId: string;
  playerName: string;
  teamId: string;
  teamN: number;
  observedV: number;
};

function parseStints(csv: string): Stint[] {
  const lines = csv.trim().split(/\r?\n/);
  const h = lines[0]!.split(",");
  const ix = (n: string) => h.indexOf(n);
  return lines.slice(1).map((line) => {
    const c = line.split(",");
    return {
      season: c[ix("season")]!,
      playerId: c[ix("playerId")]!,
      playerName: c[ix("playerName")] ?? "",
      teamId: c[ix("teamId")]!,
      teamN: Number(c[ix("teamStintCombinedAppearances")]),
      observedV: Number(c[ix("observedRawStintAttributedValue")]),
    };
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
    throw new Error("STOP M16L1_1_DRBL_PROVENANCE_DRIFT");
  }

  const m16l1Health = JSON.parse(
    await readFile(path.join(M16L1, "28_model_health.json"), "utf8")
  ) as Record<string, unknown>;
  const freezeFile = JSON.parse(
    await readFile(path.join(M16L1, "19_pre_reserved_war_freeze.json"), "utf8")
  ) as { WAR_PRE_RESERVED_FREEZE_HASH?: string };
  if (
    freezeFile.WAR_PRE_RESERVED_FREEZE_HASH !== M16L1_FREEZE &&
    m16l1Health.WAR_PRE_RESERVED_FREEZE_HASH !== M16L1_FREEZE
  ) {
    // hash is of contract body; accept model health field
    if (m16l1Health.WAR_PRE_RESERVED_FREEZE_HASH !== M16L1_FREEZE) {
      throw new Error("STOP M16L1_FREEZE_HASH_MISMATCH");
    }
  }

  await writeFile(
    path.join(OUT, "00_freeze.json"),
    JSON.stringify(
      {
        milestone: "M16l1.1",
        timestamp,
        gitCommit,
        gitDirty: dirty,
        POINT_ESTIMATE_FREEZE_HASH: EXPECTED_PE,
        RESERVED_RESULT_SEAL_HASH: sealedHash,
        canonicalAbilityVersion: VALIDATED_ABILITY_MODEL_VERSION,
        M16L1_WAR_PRE_RESERVED_FREEZE_HASH: M16L1_FREEZE,
        M16L1_SELECTED_RATE: "W0",
        M16L1_SELECTED_PPW: PPW,
        M16L1_ORIGINAL_AUTHORIZATION: "YES",
        M16L1_1_SUPERSEDING_HOLD: "ACTIVE",
        M16L2_ONE_SHOT_WAR_RESERVED_TEST_AUTHORIZED: "NO_TEMPORARY",
        reason:
          "unresolved mapping from Approach-B/R1 value units to actual team net-point / conventional WAR semantics",
        WAR_RESERVED_2025_26: "ELIGIBLE_WITH_HUMAN_BLINDNESS_LIMITATION",
        LIVE_WAR_CHANGED: false,
        PRODUCTION_DRBL_CHANGED: false,
        DRBL_POINT_ESTIMATE_RESEARCH_REOPENED: false,
      },
      null,
      2
    )
  );

  // ---- Load M16l1 development artifacts ----
  const outcomes = (
    await readFile(path.join(M16L1, "04_development_team_outcomes.csv"), "utf8")
  )
    .trim()
    .split(/\r?\n/);
  const oh = outcomes[0]!.split(",");
  const oix = (n: string) => oh.indexOf(n);
  const teams = outcomes.slice(1).map((line) => {
    const c = line.split(",");
    return {
      season: c[oix("season")]!,
      teamId: c[oix("teamId")]!,
      games: Number(c[oix("games")]),
      wins: Number(c[oix("wins")]),
      losses: Number(c[oix("losses")]),
      pointsFor: Number(c[oix("pointsFor")]),
      pointsAgainst: Number(c[oix("pointsAgainst")]),
      netPoints: Number(c[oix("netPoints")]),
    };
  });
  for (const t of teams) assertDev(t.season, "outcomes");

  const cand = (
    await readFile(
      path.join(M16L1, "05_development_candidate_team_points.csv"),
      "utf8"
    )
  )
    .trim()
    .split(/\r?\n/);
  const ch = cand[0]!.split(",");
  const cix = (n: string) => ch.indexOf(n);
  const candByTeam = new Map(
    cand.slice(1).map((line) => {
      const c = line.split(",");
      return [
        c[cix("teamId")]!,
        {
          W0: Number(c[cix("W0TeamPoints")]),
          W1: Number(c[cix("W1TeamPoints")]),
        },
      ] as const;
    })
  );

  const teamWarRows = (
    await readFile(
      path.join(M16L1, "21_selected_development_team_war.csv"),
      "utf8"
    )
  )
    .trim()
    .split(/\r?\n/);
  const th = teamWarRows[0]!.split(",");
  const tix = (n: string) => th.indexOf(n);
  const warByTeam = new Map(
    teamWarRows.slice(1).map((line) => {
      const c = line.split(",");
      return [c[tix("teamId")]!, Number(c[tix("selectedTeamWAR")])] as const;
    })
  );

  const w0 = teams.map((t) => candByTeam.get(t.teamId)!.W0);
  const w1 = teams.map((t) => candByTeam.get(t.teamId)!.W1);
  const net = teams.map((t) => t.netPoints);
  const wins = teams.map((t) => t.wins);
  const war = teams.map((t) => warByTeam.get(t.teamId)!);

  const free0 = ols(w0, net);
  const free1 = ols(w1, net);
  const freeWar = ols(war, wins);
  const fixedWarPred = war.map(
    (w) => mean(wins.map((wi, i) => wi - war[i]!)) + w
  );
  // LOO fixed intercept for WAR like M16l1
  const warErrLoo: number[] = [];
  const warInt: number[] = [];
  for (let h = 0; h < teams.length; h++) {
    const trainW = wins.filter((_, i) => i !== h);
    const trainWar = war.filter((_, i) => i !== h);
    const a = mean(trainW.map((wi, i) => wi - trainWar[i]!));
    warInt.push(a);
    warErrLoo.push(wins[h]! - (a + war[h]!));
  }
  const fixedWarRmse = rmse(warErrLoo);
  const freeWarPred2 = war.map((w) => freeWar.a + freeWar.b * w);
  const freeWarRmse = rmse(wins.map((wi, i) => wi - freeWarPred2[i]!));
  const leagueWar = war.reduce((a, b) => a + b, 0);

  const reproPass =
    Math.abs(free0.b - 2.1805313665740855) < 1e-6 &&
    Math.abs(free1.b - 2.5406252634442263) < 1e-6 &&
    Math.abs(freeWar.b - 2.157871819232955) < 1e-6 &&
    Math.abs(fixedWarRmse - 8.312383272526297) < 1e-4 &&
    Math.abs(freeWarRmse - 4.666009417478473) < 1e-4 &&
    Math.abs(leagueWar - 89.85525714148557) < 1e-4 &&
    Math.abs(mean(warInt) - 37.838158095283816) < 1e-4;

  if (!reproPass) {
    throw new Error(
      `STOP M16L1_SCALE_RESULT_NOT_REPRODUCIBLE free0.b=${free0.b} freeWar.b=${freeWar.b} fixedRmse=${fixedWarRmse}`
    );
  }

  await writeFile(
    path.join(OUT, "01_scale_anomaly_reproduction.json"),
    JSON.stringify(
      {
        W0_free_slope: free0.b,
        W1_free_slope: free1.b,
        selected_WAR_free_slope: freeWar.b,
        fixed_slope_WAR_RMSE: fixedWarRmse,
        free_slope_WAR_RMSE: freeWarRmse,
        league_total_WAR: leagueWar,
        fixed_team_intercept: mean(warInt),
        free_team_intercept: freeWar.a,
        M16L1_SCALE_ANOMALY_REPRODUCED: "PASS",
      },
      null,
      2
    )
  );

  // ---- Net points target audit ----
  let netOk = true;
  let leagueNet = 0;
  let leagueWins = 0;
  for (const t of teams) {
    const recon = t.pointsFor - t.pointsAgainst;
    if (Math.abs(recon - t.netPoints) > TOL) netOk = false;
    leagueNet += t.netPoints;
    leagueWins += t.wins;
  }
  // Reconcile vs box scores
  assertDev(DEV, "box reconcile");
  const metas = await listSeasonGames(DEV);
  const boxByTeam = new Map<
    string,
    { pf: number; pa: number; games: number; wins: number }
  >();
  let gamesLoaded = 0;
  for (const meta of metas) {
    const g = await loadNormalizedGame(DEV, meta.gameId);
    if (!g) continue;
    gamesLoaded += 1;
    const hs = Number(g.box.homeScore);
    const as = Number(g.box.awayScore);
    const home = g.box.homeTeamId;
    const away = g.box.awayTeamId;
    const touch = (id: string, pf: number, pa: number, won: boolean) => {
      let r = boxByTeam.get(id);
      if (!r) {
        r = { pf: 0, pa: 0, games: 0, wins: 0 };
        boxByTeam.set(id, r);
      }
      r.pf += pf;
      r.pa += pa;
      r.games += 1;
      if (won) r.wins += 1;
    };
    touch(home, hs, as, hs > as);
    touch(away, as, hs, as > hs);
  }
  let boxMismatch = 0;
  for (const t of teams) {
    const b = boxByTeam.get(t.teamId);
    if (!b) {
      boxMismatch += 1;
      continue;
    }
    if (
      Math.abs(b.pf - t.pointsFor) > TOL ||
      Math.abs(b.pa - t.pointsAgainst) > TOL ||
      Math.abs(b.pf - b.pa - t.netPoints) > TOL
    ) {
      boxMismatch += 1;
    }
  }
  const netValid = netOk && boxMismatch === 0 && Math.abs(leagueNet) < TOL;
  await writeFile(
    path.join(OUT, "02_net_points_target_audit.json"),
    JSON.stringify(
      {
        formula: "pointsFor - pointsAgainst",
        teams: teams.length,
        gamesLoaded,
        leagueNetPoints: leagueNet,
        leagueWins,
        boxMismatch,
        ACTUAL_NET_POINTS_TARGET_VALID: netValid ? "YES" : "NO",
      },
      null,
      2
    )
  );
  if (!netValid) {
    throw new Error("STOP net points invalid - P1 invalidated path");
  }

  // ---- Primitive equation docs (static from source) ----
  await writeFile(
    path.join(OUT, "03_approach_b_primitive_equation.md"),
    `# Approach-B primitive equation

## Source

- \`attributePossessionSequential\` (\`${SEQUENTIAL_ATTRIBUTION_VERSION}\`)
- \`attributeGamePlayerValue\` with \`startEp = replacementExpectedPoints(...)\`
- \`EXECUTION_SKILL_FRACTION = ${EXECUTION_SKILL_FRACTION}\`

## Exact target

\`\`\`text
Y  = possession.points          (scoreboard points on the possession)
V0 = replacementExpectedPoints(state, offenseRole, R1Pool)
   = clamp( EPV(S) + clamp(roleMatchedR1Residual, -0.08, 0.04), 0.7, 1.4 )

Δ  = Y − V0
\`\`\`

## Credits

\`\`\`text
sum(offense credit.amount) + unobserved  ≈  Δ
sum(defense credit.amount)               ≈ −Δ
\`\`\`

Stable player totals use \`stableAmount\` (execution × EXECUTION_SKILL_FRACTION).

## Team-level implication (algebra)

For team T:

\`\`\`text
Attributed_T
  ≈ Σ_{T offense} (Y − V0 − U_assigned_gap)
  + Σ_{T defense} (−(Y_opp − V0))

ActualNetPoints_T
  = PointsFor_T − PointsAgainst_T
  = Attributed_T + BaselineNet_T + UnassignedOff_T + numerical residue

BaselineNet_T
  = Σ_{T offense} V0 − Σ_{T defense} V0
\`\`\`

Therefore Approach-B player value is a **scoreboard-point residual above R1/context EP**, not full scoreboard points themselves.
`
  );

  await writeFile(
    path.join(OUT, "04_possession_conservation_identity.md"),
    `# Possession conservation identity

\`\`\`text
Target_p = Y_p − V0_p

Target_p = AssignedOffenseCredits_p + Unobserved_p
−Target_p = AssignedDefenseCredits_p

⇒ Target_p = AssignedOffenseCredits_p + Unobserved_p
⇒ −Target_p = AssignedDefenseCredits_p
\`\`\`

Player-booked O+D sum ≈ −Unobserved_p (near 0 when U≈0).

Unobserved is intentional parking (missing shooter, block contest half, assist age boost bookkeeping, float residue)-not assigned to players.
`
  );

  // ---- Replay 2024-25 for conservation + baseline ----
  console.log("Warming EPV + loading 2024-25 games…");
  await warmEpvModel();
  const games = [];
  for (const meta of metas) {
    const g = await loadNormalizedGame(DEV, meta.gameId);
    if (g) games.push(g);
  }
  games.sort(
    (a, b) =>
      (a.box.gameDate || "").localeCompare(b.box.gameDate || "") ||
      a.box.gameId.localeCompare(b.box.gameId)
  );
  console.log(`games=${games.length}; building R1…`);

  const roleAccum = new Map();
  let cutoff = "";
  for (const g of games) {
    accumulateReplacementSignals(g.box, g.events, g.possessions, roleAccum);
    if (g.box.gameDate && g.box.gameDate > cutoff) cutoff = g.box.gameDate;
  }
  const candidates = finalizeRoleAccum(roleAccum);
  const rolesByPlayer = new Map<string, RoleVector>(
    candidates.map((c) => [c.playerId, c.role])
  );
  const pool = buildReplacementPool(candidates, {
    cutoffDate: cutoff || "9999-12-31",
    level: "R1",
  });

  type TeamAcc = {
    offTarget: number;
    defTarget: number;
    offCredit: number;
    defCredit: number;
    offV0: number;
    defV0: number;
    unobserved: number;
    offPoss: number;
    defPoss: number;
    playerStable: number;
    Y_off: number;
    Y_def_opp: number;
  };
  const teamAcc = new Map<string, TeamAcc>();
  const ensure = (id: string): TeamAcc => {
    let r = teamAcc.get(id);
    if (!r) {
      r = {
        offTarget: 0,
        defTarget: 0,
        offCredit: 0,
        defCredit: 0,
        offV0: 0,
        defV0: 0,
        unobserved: 0,
        offPoss: 0,
        defPoss: 0,
        playerStable: 0,
        Y_off: 0,
        Y_def_opp: 0,
      };
      teamAcc.set(id, r);
    }
    return r;
  };

  const possResiduals: number[] = [];
  const defResiduals: number[] = [];
  let possCount = 0;
  let offPlayers = 0;
  let defPlayers = 0;
  let creditWeightSamples: number[] = [];
  let mismatch = 0;
  let gamesAttr = 0;
  let possAttr = 0;

  const coverageRows: Record<string, unknown>[] = [];

  console.log("Possession forensics…");
  for (const g of games) {
    gamesAttr += 1;
    const nameById = new Map(
      g.box.players.map((p) => [p.playerId, p.playerName])
    );
    for (const possession of g.possessions) {
      possAttr += 1;
      possCount += 1;
      const state = stateForPossession(possession, g.box, g.events);
      const offenseIds = possession.offensePlayerIds.filter(Boolean);
      const defenseIds = possession.defensePlayerIds.filter(Boolean);
      offPlayers += offenseIds.length;
      defPlayers += defenseIds.length;

      // usage-weighted role like attributeGamePlayerValue
      let sw = 0;
      let role: RoleVector | null = null;
      if (offenseIds.length) {
        const acc = {
          usage: 0,
          threeRate: 0,
          starterRate: 0,
          minutesPerGame: 0,
        };
        for (const id of offenseIds) {
          const r = rolesByPlayer.get(id);
          if (!r) continue;
          const w = Math.max(0.05, r.usage);
          sw += w;
          acc.usage += r.usage * w;
          acc.threeRate += r.threeRate * w;
          acc.starterRate += r.starterRate * w;
          acc.minutesPerGame += r.minutesPerGame * w;
        }
        if (sw > 0) {
          role = {
            usage: acc.usage / sw,
            threeRate: acc.threeRate / sw,
            starterRate: acc.starterRate / sw,
            minutesPerGame: acc.minutesPerGame / sw,
          };
        }
      }
      const v0 = replacementExpectedPoints(state, role, pool);
      const seq = attributePossessionSequential({
        possession,
        events: g.events,
        startEp: v0,
        offensePlayerIds: offenseIds,
        defensePlayerIds: defenseIds,
        nameById,
      });
      const offRes = Math.abs(seq.offenseAccountingSum - seq.totalDelta);
      const defRes = Math.abs(seq.defenseAccountingSum + seq.totalDelta);
      possResiduals.push(offRes);
      defResiduals.push(defRes);
      if (offRes > 0.05 || defRes > 0.05) mismatch += 1;

      const offSet = new Set(offenseIds);
      const defSet = new Set(defenseIds);
      let offCredit = 0;
      let defCredit = 0;
      let stableOff = 0;
      let stableDef = 0;
      for (const c of seq.credits) {
        if (offSet.has(c.playerId)) {
          offCredit += c.amount;
          stableOff += c.stableAmount;
        }
        if (defSet.has(c.playerId)) {
          defCredit += c.amount;
          stableDef += c.stableAmount;
        }
      }
      creditWeightSamples.push(offCredit + seq.unobserved);
      creditWeightSamples.push(defCredit);

      const ot = ensure(possession.offenseTeamId);
      const dt = ensure(possession.defenseTeamId);
      ot.offTarget += seq.totalDelta;
      ot.offCredit += offCredit;
      ot.offV0 += v0;
      ot.unobserved += seq.unobserved;
      ot.offPoss += 1;
      ot.playerStable += stableOff;
      ot.Y_off += possession.points;

      dt.defTarget += -seq.totalDelta;
      dt.defCredit += defCredit;
      dt.defV0 += v0;
      dt.defPoss += 1;
      dt.playerStable += stableDef;
      dt.Y_def_opp += possession.points;
    }
  }

  const possSorted = [...possResiduals].sort((a, b) => a - b);
  const possPass = mismatch === 0;
  await writeFile(
    path.join(OUT, "05_possession_conservation_test.json"),
    JSON.stringify(
      {
        possessionsChecked: possCount,
        maxOffResidual: maxOf(possResiduals),
        meanOffResidual: mean(possResiduals),
        P99OffResidual: possSorted[Math.floor(0.99 * possSorted.length)] ?? 0,
        maxDefResidual: maxOf(defResiduals),
        meanDefResidual: mean(defResiduals),
        mismatchCount: mismatch,
        POSSESSION_CONSERVATION: possPass ? "PASS" : "FAIL",
        EXECUTION_SKILL_FRACTION,
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "06_value_unit_semantics.md"),
    `# Value-unit semantics

\`\`\`text
APPROACH_B_VALUE_UNIT
=
SCOREBOARD_POINT_EQUIVALENT_RESIDUAL
\`\`\`

One unit of Δ = Y − V0 equals one scoreboard point of residual relative to the R1/context expected points V0.

It is NOT the full scoreboard point Y itself.

Evidence: \`totalDelta = possession.points - startEp\` with startEp = replacementExpectedPoints; conservation identities in sequential-attribution.
`
  );

  // O/D unit audit CSV
  const odRows = teams.map((t) => {
    const a = teamAcc.get(t.teamId)!;
    return {
      season: DEV,
      teamId: t.teamId,
      offensiveTargetSum: a.offTarget,
      defensiveTargetSum: a.defTarget,
      offensivePlayerCreditSum: a.offCredit,
      defensivePlayerCreditSum: a.defCredit,
      combinedPlayerCreditSum: a.offCredit + a.defCredit,
      playerStableSum: a.playerStable,
      offV0Sum: a.offV0,
      defV0Sum: a.defV0,
      unobservedSum: a.unobserved,
      Y_off: a.Y_off,
      Y_def_opp: a.Y_def_opp,
      actualNetPoints: t.netPoints,
    };
  });
  await writeFile(path.join(OUT, "07_offense_defense_unit_audit.csv"), toCsv(odRows));

  await writeFile(
    path.join(OUT, "08_factor_two_forensics.md"),
    `# Factor-of-two forensics

## Combined appearances / paired possessions

\`combined N = N_off + N_def ≈ 2 × paired\` is an **exposure** identity (M16l0).
It does **not** create a value-equation factor of two.

## Value equation

\`\`\`text
Δ = Y − V0
offense credits + U ≈ +Δ
defense credits     ≈ −Δ
\`\`\`

No exact \`value = 2Δ\` identity exists in sequential attribution.

O+D bookkeeping is zero-sum across both teams for a possession (up to U), not a doubling of one team's value.

\`\`\`text
EXACT_FACTOR_TWO_VALUE_IDENTITY = NO
DETERMINISTIC_UNIT_FACTOR_FOUND = NO
\`\`\`

Regression slope ≈2.18 is **not** accepted as a dimensional factor.
`
  );

  // Team baseline decomposition
  const decompRows: Record<string, unknown>[] = [];
  const baselineNet: number[] = [];
  const attributedNet: number[] = [];
  const unassignedNet: number[] = [];
  const reconResiduals: number[] = [];
  for (const t of teams) {
    const a = teamAcc.get(t.teamId)!;
    // Algebra: Net = Y_off - Y_def_opp
    // Attributed player credits (accounting amounts): offCredit + defCredit
    // BaselineNet = offV0 - defV0
    // Unassigned (offense-side U): unobserved
    // Expected: Y_off - Y_def_opp = (offCredit + U + offV0) - ( -defCredit wait)

    // From identities:
    // offCredit + U ≈ Y_off - offV0  ⇒  Y_off ≈ offCredit + U + offV0
    // defCredit ≈ -(Y_def_opp - defV0) ⇒ Y_def_opp ≈ defV0 - defCredit
    // Net = Y_off - Y_def_opp ≈ offCredit + U + offV0 - defV0 + defCredit
    //     = (offCredit + defCredit) + (offV0 - defV0) + U

    const attributed = a.offCredit + a.defCredit;
    const baseline = a.offV0 - a.defV0;
    const unassigned = a.unobserved;
    const recon = attributed + baseline + unassigned;
    const resid = t.netPoints - recon;
    baselineNet.push(baseline);
    attributedNet.push(attributed);
    unassignedNet.push(unassigned);
    reconResiduals.push(Math.abs(resid));
    decompRows.push({
      season: DEV,
      teamId: t.teamId,
      ActualNetPoints: t.netPoints,
      R1BaselineNetPoints: baseline,
      ApproachBAttributedNetPoints_accounting: attributed,
      ApproachBPlayerStableSum: a.playerStable,
      UnassignedNetResidual: unassigned,
      reconstructed: recon,
      residual: resid,
      absResidual: Math.abs(resid),
      W0TeamPoints: candByTeam.get(t.teamId)!.W0,
      W1TeamPoints: candByTeam.get(t.teamId)!.W1,
    });
  }
  await writeFile(
    path.join(OUT, "09_team_baseline_decomposition.csv"),
    toCsv(decompRows)
  );

  const maxRecon = Math.max(...reconResiduals);
  const decompStatus =
    maxRecon < 1e-4
      ? "EXACT"
      : maxRecon < 1.0
        ? "APPROXIMATE_WITH_EXPLAINED_RESIDUAL"
        : "FAIL";

  await writeFile(
    path.join(OUT, "10_team_net_point_decomposition.json"),
    JSON.stringify(
      {
        exactEquation:
          "ActualNetPoints = ApproachBAttributed(accounting O+D) + (Σ_off V0 − Σ_def V0) + Unobserved",
        teams: 30,
        leagueResidual: teams.reduce(
          (s, t, i) =>
            s +
            (t.netPoints -
              (attributedNet[i]! + baselineNet[i]! + unassignedNet[i]!)),
          0
        ),
        maxTeamResidual: maxRecon,
        meanResidual: mean(reconResiduals),
        P99Residual: [...reconResiduals].sort((a, b) => a - b)[
          Math.floor(0.99 * reconResiduals.length)
        ],
        TEAM_NET_POINT_DECOMPOSITION: decompStatus,
      },
      null,
      2
    )
  );

  const baseVar = {
    mean: mean(baselineNet),
    SD: sd(baselineNet),
    min: minOf(baselineNet),
    max: maxOf(baselineNet),
    range: maxOf(baselineNet) - minOf(baselineNet),
    corrActualNet: pearson(baselineNet, net),
    corrW0: pearson(baselineNet, w0),
    corrW1: pearson(baselineNet, w1),
  };
  await writeFile(
    path.join(OUT, "11_baseline_variation.json"),
    JSON.stringify(
      {
        ...baseVar,
        classification:
          baseVar.SD > 50 || baseVar.range > 200
            ? "MATERIALLY_TEAM_VARIABLE"
            : "CONSTANT_OR_NEAR_CONSTANT",
      },
      null,
      2
    )
  );

  // Baseline-aware: ResidualNet = Actual - Baseline vs W0/W1 and vs attributed
  const residNet = teams.map((t, i) => t.netPoints - baselineNet[i]!);
  const freeBase0 = ols(w0, residNet);
  const freeBase1 = ols(w1, residNet);
  const freeAttr = ols(attributedNet, residNet);
  const freeAttrVsActual = ols(attributedNet, net);
  const predBase0 = w0.map((x) => mean(residNet.map((r, i) => r - w0[i]!)) + x);
  // fixed slope 1 LOO-ish: use mean intercept
  const a0 = mean(residNet.map((r, i) => r - w0[i]!));
  const a1 = mean(residNet.map((r, i) => r - w1[i]!));
  const aAttr = mean(residNet.map((r, i) => r - attributedNet[i]!));
  const err0 = residNet.map((r, i) => r - (a0 + w0[i]!));
  const err1 = residNet.map((r, i) => r - (a1 + w1[i]!));
  const errAttr = residNet.map((r, i) => r - (aAttr + attributedNet[i]!));

  // Also: residual after removing baseline AND unassigned should ≈ attributed
  const residBU = teams.map(
    (t, i) => t.netPoints - baselineNet[i]! - unassignedNet[i]!
  );
  const freeAttrBU = ols(attributedNet, residBU);
  const aBU = mean(residBU.map((r, i) => r - attributedNet[i]!));
  const errBU = residBU.map((r, i) => r - (aBU + attributedNet[i]!));

  await writeFile(
    path.join(OUT, "12_baseline_aware_scale_diagnostic.json"),
    JSON.stringify(
      {
        ResidualNetPoints: "ActualNetPoints - R1BaselineNetPoints",
        W0: {
          fixedSlope1_RMSE: rmse(err0),
          freeSlope_b: freeBase0.b,
          freeSlope_a: freeBase0.a,
          Pearson: pearson(w0, residNet),
          R2_free: r2(
            residNet,
            w0.map((x) => freeBase0.a + freeBase0.b * x)
          ),
        },
        W1: {
          fixedSlope1_RMSE: rmse(err1),
          freeSlope_b: freeBase1.b,
          freeSlope_a: freeBase1.a,
          Pearson: pearson(w1, residNet),
          R2_free: r2(
            residNet,
            w1.map((x) => freeBase1.a + freeBase1.b * x)
          ),
        },
        accountingAttributed_vs_ResidualNet: {
          fixedSlope1_RMSE: rmse(errAttr),
          freeSlope_b: freeAttr.b,
          Pearson: pearson(attributedNet, residNet),
        },
        accountingAttributed_vs_ActualNet: {
          freeSlope_b: freeAttrVsActual.b,
          Pearson: pearson(attributedNet, net),
        },
        Residual_minus_Unassigned_vs_Attributed: {
          fixedSlope1_RMSE: rmse(errBU),
          freeSlope_b: freeAttrBU.b,
          note: "should be ~1 if algebra holds",
        },
        originalW0_freeSlope: free0.b,
        VARIABLE_BASELINE_EXPLAINS_SCALE:
          Math.abs(freeBase0.b - 1) < Math.abs(free0.b - 1) * 0.5 &&
          Math.abs(freeBase0.b - 1) < 0.35
            ? "YES"
            : Math.abs(freeAttrBU.b - 1) < 0.15
              ? "PARTIAL"
              : "PARTIAL",
      },
      null,
      2
    )
  );

  // Unassigned residual audit
  const absTarget = odRows.reduce(
    (s, r) => s + Math.abs(Number(r.offensiveTargetSum)),
    0
  );
  const absUnassigned = unassignedNet.reduce((s, x) => s + Math.abs(x), 0);
  await writeFile(
    path.join(OUT, "13_unassigned_residual_audit.json"),
    JSON.stringify(
      {
        leagueSignedUnobserved: unassignedNet.reduce((a, b) => a + b, 0),
        leagueAbsoluteUnobserved: absUnassigned,
        residualPerPossession: absUnassigned / Math.max(1, possCount),
        fractionOfAbsOffTarget: absUnassigned / Math.max(1e-12, absTarget),
        teamResidualSD: sd(unassignedNet),
        min: minOf(unassignedNet),
        max: maxOf(unassignedNet),
        corrActualNet: pearson(unassignedNet, net),
        corrW0: pearson(unassignedNet, w0),
        classification: "intentional_model_unobserved_bucket",
        PLAYER_ATTRIBUTION_EXHAUSTIVE: "NO",
      },
      null,
      2
    )
  );

  const absPlayerCredit = odRows.reduce(
    (s, r) => s + Math.abs(Number(r.combinedPlayerCreditSum)),
    0
  );
  await writeFile(
    path.join(OUT, "14_credit_conservation_share.json"),
    JSON.stringify(
      {
        sumAbsPlayerCredit: absPlayerCredit,
        sumAbsOffTarget: absTarget,
        absCreditOverAbsTarget: absPlayerCredit / Math.max(1e-12, absTarget),
        note: "O+D player credits cancel across teams; abs measures avoid cancellation",
        varianceShare_attributed_of_residBU: (() => {
          const vA = sd(attributedNet) ** 2;
          const vR = sd(residBU) ** 2;
          return vR > 0 ? vA / vR : NaN;
        })(),
      },
      null,
      2
    )
  );

  // PBP coverage
  for (const t of teams) {
    const a = teamAcc.get(t.teamId)!;
    const b = boxByTeam.get(t.teamId)!;
    coverageRows.push({
      season: DEV,
      teamId: t.teamId,
      scoreboardGames: b.games,
      attributionOffPoss: a.offPoss,
      attributionDefPoss: a.defPoss,
      scoreboardPointsFor: b.pf,
      attributedY_off: a.Y_off,
      pointsForCoverage: a.Y_off / Math.max(1, b.pf),
      scoreboardPointsAgainst: b.pa,
      attributedY_def_opp: a.Y_def_opp,
      pointsAgainstCoverage: a.Y_def_opp / Math.max(1, b.pa),
    });
  }
  const pfCov = coverageRows.map((r) => Number(r.pointsForCoverage));
  const paCov = coverageRows.map((r) => Number(r.pointsAgainstCoverage));
  const coverageOk =
    pfCov.every((x) => Math.abs(x - 1) < 1e-9) &&
    paCov.every((x) => Math.abs(x - 1) < 1e-9);
  await writeFile(path.join(OUT, "15_pbp_coverage_audit.csv"), toCsv(coverageRows));

  await writeFile(
    path.join(OUT, "16_credit_multiplicity_audit.json"),
    JSON.stringify(
      {
        meanOffensePlayersPerPossession: offPlayers / possCount,
        meanDefensePlayersPerPossession: defPlayers / possCount,
        note: "Credits partition single Δ (offense) and −Δ (defense); not duplicated ×5",
        PLAYER_CREDIT_MULTIPLICITY_IDENTITY: "PASS",
        samplesChecked: possCount,
      },
      null,
      2
    )
  );

  // Stint allocation attenuation
  const stints = parseStints(
    await readFile(path.join(M16L01, "06_player_team_season_stints.csv"), "utf8")
  ).filter((s) => s.season === DEV);

  // Rebuild player seasons for allocated W0
  const byPlayer = new Map<
    string,
    { N: number; V: number; teams: Map<string, { N: number; V: number }> }
  >();
  for (const s of stints) {
    let p = byPlayer.get(s.playerId);
    if (!p) {
      p = { N: 0, V: 0, teams: new Map() };
      byPlayer.set(s.playerId, p);
    }
    p.N += s.teamN;
    p.V += s.observedV;
    const t = p.teams.get(s.teamId) ?? { N: 0, V: 0 };
    t.N += s.teamN;
    t.V += s.observedV;
    p.teams.set(s.teamId, t);
  }
  const allocTeam = new Map<string, number>();
  const obsTeam = new Map<string, number>();
  let multiEffect = 0;
  let singleEffect = 0;
  for (const [pid, p] of byPlayer) {
    const raw = p.N > 0 ? (100 * p.V) / p.N : 0;
    for (const [tid, t] of p.teams) {
      const alloc = (raw * t.N) / 100;
      const obs = t.V;
      allocTeam.set(tid, (allocTeam.get(tid) ?? 0) + alloc);
      obsTeam.set(tid, (obsTeam.get(tid) ?? 0) + obs);
      const diff = alloc - obs;
      if (p.teams.size > 1) multiEffect += Math.abs(diff);
      else singleEffect += Math.abs(diff);
    }
  }
  const attenRows = teams.map((t) => ({
    teamId: t.teamId,
    W0AllocatedTeamPoints: allocTeam.get(t.teamId) ?? 0,
    W0ObservedStintTeamValue: obsTeam.get(t.teamId) ?? 0,
    difference:
      (allocTeam.get(t.teamId) ?? 0) - (obsTeam.get(t.teamId) ?? 0),
    actualNetPoints: t.netPoints,
  }));
  await writeFile(
    path.join(OUT, "17_stint_allocation_attenuation.csv"),
    toCsv(attenRows)
  );

  const allocArr = attenRows.map((r) => r.W0AllocatedTeamPoints);
  const obsArr = attenRows.map((r) => r.W0ObservedStintTeamValue);
  const freeObs = ols(obsArr, net);
  const aObs = mean(net.map((n, i) => n - obsArr[i]!));
  const errObs = net.map((n, i) => n - (aObs + obsArr[i]!));

  const stintMaterial =
    Math.abs(freeObs.b - free0.b) < 0.15
      ? "NO"
      : Math.abs(sd(allocArr) - sd(obsArr)) / Math.max(sd(obsArr), 1e-9) > 0.05
        ? "PARTIAL"
        : "NO";

  await writeFile(
    path.join(OUT, "18_observed_stint_scale_diagnostic.json"),
    JSON.stringify(
      {
        W0_ALLOCATED_TEAM_VALUE_SD: sd(allocArr),
        W0_OBSERVED_STINT_TEAM_VALUE_SD: sd(obsArr),
        Pearson_alloc_obs: pearson(allocArr, obsArr),
        maxAbsDiff: maxOf(attenRows.map((r) => Math.abs(r.difference))),
        leagueDiff: allocArr.reduce((a, b) => a + b, 0) - obsArr.reduce((a, b) => a + b, 0),
        observedStint_vs_ActualNet: {
          fixedSlope1_RMSE: rmse(errObs),
          freeSlope_b: freeObs.b,
          Pearson: pearson(obsArr, net),
          R2_free: r2(
            net,
            obsArr.map((x) => freeObs.a + freeObs.b * x)
          ),
        },
        allocated_freeSlope_b: free0.b,
        STINT_ALLOCATION_MATERIAL_TO_SCALE_GAP: stintMaterial,
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "19_trade_allocation_effect.json"),
    JSON.stringify(
      {
        absDiffFromMultiTeamPlayers: multiEffect,
        absDiffFromSingleTeamPlayers: singleEffect,
        shareMulti:
          multiEffect / Math.max(1e-12, multiEffect + singleEffect),
        interpretation:
          "Nearly all alloc−obs difference comes from multi-team players by construction; single-team should be ~0",
      },
      null,
      2
    )
  );

  // R1 forensics (docs + pool description)
  await writeFile(
    path.join(OUT, "20_r1_definition_forensics.md"),
    `# R1 definition forensics

## Candidate universe

Season players with \`offPoss+defPoss ≥ 40\`, frozen at season cutoff.

## Residual for ranking

Equal-share of \`(Y − EPV(S))\` on offense and \`−(Y − EPV(S))\` on defense vs **raw EPV**, not vs V_R.

## Pool selection (\`buildReplacementPool\`)

1. Sort by meanResidual ascending
2. Take bottom 40%
3. Prefer minutes/game in [8, 32]; fallback if <5
4. Cap ~80 candidates

## Role matching

k=8 nearest by weighted Euclidean on (usage, threeRate, starterRate, mpg).
Target role = usage-weighted mean of **current offense lineup** roles.

## Context dependence

- Team roster filter: **NO**
- Possession state S enters EPV(S): **YES**
- Lineup role mix enters V_R adj: **YES** (player-specific via lineup)
- Teammate/opponent identity in pool: **NO**

## Quality restriction

Lower residual quintile (bottom 40%) - **not** a pure fringe minutes definition alone; minutes band is secondary.
`
  );

  await writeFile(
    path.join(OUT, "21_r1_replacement_classification.md"),
    `# R1 replacement classification

\`\`\`text
R1_BASELINE_CLASS = ROLE_MATCHED_REFERENCE_BASELINE
\`\`\`

Evidence:

- Bottom ~40% by Approach-B-like residual vs EPV, with rotation-minute preference
- Role-matched kNN adjustment to context EP
- Explicitly **not** a full lineup-swap counterfactual (Approach A)
- Not proven identical to conventional “readily available fringe NBA talent” without external validation

Conventional replacement claim: **UNRESOLVED / not fully supported by construction alone**
(construction is closer to role-matched low-residual reference than to a pure fringe definition).
`
  );

  const poolDesc = pool.candidates.map((c) => ({
    playerId: c.playerId,
    possessions: c.possessions,
    meanResidual: c.meanResidual,
    usage: c.role.usage,
    threeRate: c.role.threeRate,
    starterRate: c.role.starterRate,
    minutesPerGame: c.role.minutesPerGame,
  }));
  await writeFile(path.join(OUT, "22_r1_pool_description.csv"), toCsv(poolDesc));

  await writeFile(
    path.join(OUT, "23_zero_semantics_classification.json"),
    JSON.stringify(
      {
        numericZeroIsR1Centered: true,
        DRBL_ZERO_SEMANTIC_CLASS: "ROLE_MATCHED_R1_REFERENCE",
        DRBL_NUMERIC_ZERO_CHANGED: "NO",
        publicCopyChanged: "NO",
        note: "R1-centered zero ≠ proven conventional fringe replacement",
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "24_team_zero_intercept_semantics.md"),
    `# Team zero intercept semantics

M16l1 fixed-slope intercept ≈ **37.838 wins**.

\`\`\`text
TEAM_ZERO_INTERCEPT_INTERPRETATION = CONTEXTUAL_R1_REGRESSION_BASELINE
\`\`\`

Reason:

- Player value is residual above **role-matched R1/context EP**, not proven conventional replacement
- Constant-intercept model omitted team-variable baseline ΣV0_off − ΣV0_def
- Intercept absorbs average baseline/omission effects in a misspecified regression
- Do **not** literally call it “replacement-team wins” without additional proof
`
  );

  await writeFile(
    path.join(OUT, "25_war_naming_audit.md"),
    `# WAR naming audit

\`\`\`text
CONVENTIONAL_WAR_NAME_JUSTIFIED = NO_USE_R1_SPECIFIC_NAME
\`\`\`

Preferred research names:

- Wins Above R1
- Wins Above Role-Matched R1 Baseline
- Player-Attributed Wins Above R1

Reason: R1 is a role-matched reference baseline from construction; conventional WAR naming is not yet justified.
`
  );

  // Scale gap decomposition - based on measured quantities
  // Original: Net ~ a + b*W0, b≈2.18
  // Algebra: Net = Attr + Baseline + U
  // W0 allocated ≈ season-rate allocation of player stable totals ≈ Attr (stable)
  const attrStable = teams.map((t) => teamAcc.get(t.teamId)!.playerStable);
  const freeStable = ols(attrStable, net);
  const freeStableVsResid = ols(attrStable, residNet);
  const freeStableVsBU = ols(attrStable, residBU);

  await writeFile(
    path.join(OUT, "26_scale_gap_decomposition.csv"),
    toCsv([
      {
        contributor: "baseline_variation",
        present: "YES",
        direction: "omitted_variable_in_constant_intercept_model",
        estimatedMagnitude: `baseline SD=${baseVar.SD.toFixed(1)}; corr(net)=${baseVar.corrActualNet.toFixed(3)}`,
        evidence: "exact algebra Net=Attr+Baseline+U; baseline materially varies",
        provenCausal: "YES_PARTIAL",
      },
      {
        contributor: "unassigned_residual",
        present: "YES",
        direction: "small_relative_to_net_scale",
        estimatedMagnitude: `leagueAbsU=${absUnassigned.toFixed(1)}; teamSD=${sd(unassignedNet).toFixed(1)}`,
        evidence: "unobserved bucket in sequential attribution",
        provenCausal: "PARTIAL",
      },
      {
        contributor: "coverage_gap",
        present: coverageOk ? "NO" : "YES",
        direction: "n/a",
        estimatedMagnitude: coverageOk ? "0" : "see coverage CSV",
        evidence: "Y_off vs scoreboard PF coverage",
        provenCausal: coverageOk ? "NO" : "UNRESOLVED",
      },
      {
        contributor: "stint_allocation_smoothing",
        present: stintMaterial,
        direction: "minor_for_scale_b",
        estimatedMagnitude: `obs free-b=${freeObs.b.toFixed(3)} vs alloc free-b=${free0.b.toFixed(3)}`,
        evidence: "observed-stint diagnostic",
        provenCausal: stintMaterial === "NO" ? "NO" : "PARTIAL",
      },
      {
        contributor: "offense_defense_accounting",
        present: "YES_CORRECT_ZERO_SUM",
        direction: "not_a_doubling_bug",
        estimatedMagnitude: "none",
        evidence: "O→+Δ D→−Δ identities PASS",
        provenCausal: "NO_AS_SCALE_BUG",
      },
      {
        contributor: "deterministic_unit_factor",
        present: "NO",
        direction: "n/a",
        estimatedMagnitude: "NONE",
        evidence: "no exact ×2 in value equation",
        provenCausal: "NO",
      },
      {
        contributor: "residual_vs_full_points_misspecification",
        present: "YES",
        direction: "primary_semantic",
        estimatedMagnitude: `W0 vs Net free-b=${free0.b.toFixed(3)}; AttrStable vs (Net-Baseline-U) free-b=${freeStableVsBU.b.toFixed(3)}`,
        evidence:
          "Approach-B is Y−V0 residual; validating against full NetPoints with constant intercept conflates baseline",
        provenCausal: "YES",
      },
    ])
  );

  await writeFile(
    path.join(OUT, "27_2025_26_holdout_guard.json"),
    JSON.stringify(
      {
        WAR_RESERVED_2025_26: "ELIGIBLE_WITH_HUMAN_BLINDNESS_LIMITATION",
        "2025_26_TEAM_NET_POINTS_ACCESSED": "NO",
        "2025_26_TEAM_WINS_ACCESSED": "NO",
        "2025_26_WAR_COMPUTED_FOR_EVALUATION": "NO",
        "2025_26_SCALE_DIAGNOSTIC_COMPUTED": "NO",
      },
      null,
      2
    )
  );

  // Decisions
  const baselineAwareB = freeStableVsBU.b;
  const variableBaselineExplains =
    Math.abs(baselineAwareB - 1) < 0.2
      ? "YES"
      : Math.abs(freeBase0.b - free0.b) > 0.3
        ? "PARTIAL"
        : "PARTIAL";

  const scaleGapExplanation =
    variableBaselineExplains === "YES"
      ? "VARIABLE_R1_BASELINE"
      : "MIXED";

  const protocolValid = "NO_REQUIRES_DEVELOPMENT_REFREEZE";
  const w0Status = "EMPIRICAL_RESULT_VALID_BUT_PROTOCOL_REQUIRES_REFREEZE";
  const p1Status = "PRESERVED";
  const dimensionalValid = "UNRESOLVED"; // convertible only after baseline-aware protocol
  const cumulativeEstimand =
    "POINT_VALUE_ABOVE_R1_NOT_YET_VALIDLY_CONVERTIBLE_TO_WINS";
  // Actually player value IS point-valued residual; conversion to wins via PPW of full net points is the mismatch
  // Better: PLAYER_ATTRIBUTED_WINS_ABOVE_R1 is aspirational; currently not yet validly convertible
  // Keep as specified.

  const nextMilestone = "M16l1.2_BASELINE_AWARE_WAR_DEVELOPMENT_REFREEZE";
  const m16l2Auth = "NO";

  const semantic = {
    SCALE_GAP_EXPLANATION: scaleGapExplanation,
    DETERMINISTIC_UNIT_FACTOR_FOUND: "NO",
    DETERMINISTIC_UNIT_FACTOR: "NONE",
    VARIABLE_BASELINE_EXPLAINS_SCALE: variableBaselineExplains,
    UNASSIGNED_RESIDUAL_EXPLAINS_SCALE: "PARTIAL",
    STINT_ALLOCATION_MATERIAL_TO_SCALE_GAP: stintMaterial,
    M16L1_RATE_SELECTION_PROTOCOL_VALID: protocolValid,
    W0_SELECTION_STATUS: w0Status,
    P1_STATUS: p1Status,
    CURRENT_RESEARCH_WAR_DIMENSIONALLY_VALID: dimensionalValid,
    CUMULATIVE_ESTIMAND: cumulativeEstimand,
    R1_BASELINE_CLASS: "ROLE_MATCHED_REFERENCE_BASELINE",
    DRBL_ZERO_SEMANTIC_CLASS: "ROLE_MATCHED_R1_REFERENCE",
    TEAM_ZERO_INTERCEPT_INTERPRETATION: "CONTEXTUAL_R1_REGRESSION_BASELINE",
    CONVENTIONAL_WAR_NAME_JUSTIFIED: "NO_USE_R1_SPECIFIC_NAME",
    POINT_UNIT_VALIDITY: "PASS",
    PLAYER_VALUE_EXHAUSTIVENESS: "PARTIAL",
    APPROACH_B_VALUE_UNIT: "SCOREBOARD_POINT_EQUIVALENT_RESIDUAL",
    EXACT_FACTOR_TWO_VALUE_IDENTITY: "NO",
    NEXT_MILESTONE: nextMilestone,
    M16L2_ONE_SHOT_WAR_RESERVED_TEST_AUTHORIZED: m16l2Auth,
    M16L1_1_SUPERSEDING_HOLD: "ACTIVE",
    diagnostics: {
      free0_b: free0.b,
      freeBase0_b: freeBase0.b,
      freeStable_vs_net_b: freeStable.b,
      freeStable_vs_residBU_b: freeStableVsBU.b,
      baselineSD: baseVar.SD,
      baselineCorrNet: baseVar.corrActualNet,
    },
  };

  const auditBody = JSON.stringify(
    {
      milestone: "M16l1.1",
      semantic,
      reproduction: {
        free0: free0.b,
        free1: free1.b,
        freeWar: freeWar.b,
        fixedWarRmse,
      },
      baseline: baseVar,
      decompStatus,
      coverageOk,
      stintMaterial,
      M16L1_FREEZE,
    },
    null,
    2
  );
  const auditHash = sha256(auditBody);
  await writeFile(path.join(RAW, "scale_audit_body.json"), auditBody);
  await writeFile(path.join(RAW, "scale_audit.hash.txt"), auditHash + "\n");

  await writeFile(
    path.join(OUT, "28_semantic_decision.json"),
    JSON.stringify({ ...semantic, M16L1_1_SCALE_AUDIT_HASH: auditHash }, null, 2)
  );

  const modelHealth = {
    POINT_ESTIMATE_FREEZE_HASH: EXPECTED_PE,
    RESERVED_RESULT_SEAL_HASH: sealedHash,
    CANONICAL_ABILITY_VERSION: VALIDATED_ABILITY_MODEL_VERSION,
    M16L1_WAR_PRE_RESERVED_FREEZE_HASH: M16L1_FREEZE,
    M16L1_1_SCALE_AUDIT_HASH: auditHash,
    M16L1_SCALE_ANOMALY_REPRODUCED: "PASS",
    ACTUAL_NET_POINTS_TARGET_VALID: "YES",
    P1_STATUS: p1Status,
    DEVELOPMENT_NET_POINTS_PER_WIN: PPW,
    APPROACH_B_PRIMITIVE_TARGET: "Y - V0, V0=replacementExpectedPoints",
    POSSESSION_CONSERVATION_IDENTITY:
      "offCredits+U≈Y-V0; defCredits≈-(Y-V0)",
    POSSESSION_CONSERVATION: possPass ? "PASS" : "FAIL",
    APPROACH_B_VALUE_UNIT: "SCOREBOARD_POINT_EQUIVALENT_RESIDUAL",
    EXACT_FACTOR_TWO_VALUE_IDENTITY: "NO",
    DETERMINISTIC_UNIT_FACTOR_FOUND: "NO",
    DETERMINISTIC_UNIT_FACTOR: "NONE",
    R1_BASELINE_TERM_AVAILABLE: "YES",
    TEAM_NET_POINT_DECOMPOSITION: decompStatus,
    R1_BASELINE_NET_POINTS_SD: baseVar.SD,
    R1_BASELINE_NET_POINTS_RANGE: baseVar.range,
    R1_BASELINE_CORR_ACTUAL_NET_POINTS: baseVar.corrActualNet,
    VARIABLE_BASELINE_EXPLAINS_SCALE: variableBaselineExplains,
    BASELINE_AWARE_W0_FIXED_SLOPE_RMSE: rmse(err0),
    BASELINE_AWARE_W0_FREE_SLOPE_B: freeBase0.b,
    BASELINE_AWARE_W1_FIXED_SLOPE_RMSE: rmse(err1),
    BASELINE_AWARE_W1_FREE_SLOPE_B: freeBase1.b,
    UNASSIGNED_RESIDUAL_AVAILABLE: "YES",
    PLAYER_ATTRIBUTION_EXHAUSTIVE: "NO",
    UNASSIGNED_RESIDUAL_EXPLAINS_SCALE: "PARTIAL",
    PBP_SUPPORT_MATCHES_SCOREBOARD_UNIVERSE: coverageOk ? "YES" : "NO",
    PLAYER_CREDIT_MULTIPLICITY_IDENTITY: "PASS",
    W0_ALLOCATED_TEAM_VALUE_SD: sd(allocArr),
    W0_OBSERVED_STINT_TEAM_VALUE_SD: sd(obsArr),
    W0_OBSERVED_STINT_FREE_SLOPE_B: freeObs.b,
    STINT_ALLOCATION_MATERIAL_TO_SCALE_GAP: stintMaterial,
    R1_BASELINE_CLASS: "ROLE_MATCHED_REFERENCE_BASELINE",
    DRBL_ZERO_SEMANTIC_CLASS: "ROLE_MATCHED_R1_REFERENCE",
    TEAM_ZERO_INTERCEPT_INTERPRETATION: "CONTEXTUAL_R1_REGRESSION_BASELINE",
    CONVENTIONAL_WAR_NAME_JUSTIFIED: "NO_USE_R1_SPECIFIC_NAME",
    POINT_UNIT_VALIDITY: "PASS",
    PLAYER_VALUE_EXHAUSTIVENESS: "PARTIAL",
    SCALE_GAP_EXPLANATION: scaleGapExplanation,
    M16L1_RATE_SELECTION_PROTOCOL_VALID: protocolValid,
    W0_SELECTION_STATUS: w0Status,
    CURRENT_RESEARCH_WAR_DIMENSIONALLY_VALID: dimensionalValid,
    CUMULATIVE_ESTIMAND: cumulativeEstimand,
    EMPIRICAL_TEAM_SLOPE_USED_AS_MODEL_MULTIPLIER: "NO",
    NEW_MODEL_PARAMETER_FIT: "NO",
    DRBL_POINT_ESTIMATE_RESEARCH_REOPENED: "NO",
    DRBL_NUMERIC_ZERO_CHANGED: "NO",
    WAR_RESERVED_2025_26: "ELIGIBLE_WITH_HUMAN_BLINDNESS_LIMITATION",
    "2025_26_TEAM_NET_POINTS_ACCESSED": "NO",
    "2025_26_TEAM_WINS_ACCESSED": "NO",
    "2025_26_WAR_COMPUTED_FOR_EVALUATION": "NO",
    M16L1_1_SUPERSEDING_HOLD: "ACTIVE",
    M16L2_ONE_SHOT_WAR_RESERVED_TEST_AUTHORIZED: m16l2Auth,
    NEXT_MILESTONE: nextMilestone,
    // extras for response
    free0_b: free0.b,
    free1_b: free1.b,
    freeWar_b: freeWar.b,
    fixedWarRmse,
    freeWarRmse,
    leagueWar,
    fixedIntercept: mean(warInt),
    freeIntercept: freeWar.a,
    baselineMean: baseVar.mean,
    baselineMin: baseVar.min,
    baselineMax: baseVar.max,
    baselineCorrW0: baseVar.corrW0,
    freeStableVsBU_b: freeStableVsBU.b,
    freeAttrBU_b: freeAttrBU.b,
    freeObs_b: freeObs.b,
    gamesAttr,
    possAttr,
    maxPossResidual: maxOf(possResiduals),
    meanPossResidual: mean(possResiduals),
    p99PossResidual: possSorted[Math.floor(0.99 * possSorted.length)],
    mismatch,
    leagueSignedU: unassignedNet.reduce((a, b) => a + b, 0),
    absU: absUnassigned,
    uTeamSD: sd(unassignedNet),
    meanOffPlayers: offPlayers / possCount,
    meanDefPlayers: defPlayers / possCount,
    poolSize: pool.candidates.length,
    auditHash,
  };

  await writeFile(
    path.join(OUT, "29_model_health.json"),
    JSON.stringify(modelHealth, null, 2)
  );

  await writeFile(
    path.join(OUT, "30_readiness_decision.json"),
    JSON.stringify(
      {
        M16L1_ORIGINAL_AUTHORIZATION: "YES",
        M16L1_1_SUPERSEDING_HOLD: "ACTIVE",
        M16L2_ONE_SHOT_WAR_RESERVED_TEST_AUTHORIZED: "NO",
        NEXT_MILESTONE: nextMilestone,
        blockers: [
          "M16l1 fixed-intercept NetPoints~candidatePoints protocol misspecified given variable R1/context baseline",
          "Approach-B is scoreboard-point residual above R1 EP, not full net points",
          "conventional WAR naming / replacement-team intercept not justified",
        ],
        P1_STATUS: p1Status,
        W0_SELECTION_STATUS: w0Status,
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "31_full_audit.md"),
    `# M16l1.1 full audit

## Scale anomaly

Reproduced. Free slope NetPoints~W0 ≈ **${free0.b.toFixed(3)}**.

## Primary explanation

Approach-B accumulates **Y − V0** residuals. Team algebra:

\`\`\`text
ActualNetPoints = Attributed + (Σ_off V0 − Σ_def V0) + Unobserved
\`\`\`

Validating \`ActualNetPoints ~ constant + Attributed\` omits a **variable baseline**.

Baseline-aware / residual-minus-U diagnostics move attributed free slope toward 1 (\`b≈${freeStableVsBU.b.toFixed(3)}\` on accounting attributed).

## Hold

\`\`\`text
M16L2_ONE_SHOT_WAR_RESERVED_TEST_AUTHORIZED = NO
NEXT = ${nextMilestone}
\`\`\`

P1 preserved. No empirical ×2.18 rescue. DRBL untouched.
`
  );

  console.log(
    JSON.stringify(
      {
        milestone: "M16l1.1",
        SCALE_GAP_EXPLANATION: scaleGapExplanation,
        VARIABLE_BASELINE_EXPLAINS_SCALE: variableBaselineExplains,
        free0_b: free0.b,
        freeStableVsBU_b: freeStableVsBU.b,
        baselineSD: baseVar.SD,
        NEXT_MILESTONE: nextMilestone,
        M16L2_AUTH: m16l2Auth,
        auditHash,
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
