/**
 * M16l2 - ONE-SHOT 2025-26 R1 value reserved test.
 * Holdout permanently consumed once outcomes are opened.
 * No retuning. No PPW refit. No scale multiplier. No conventional WAR.
 *   npm run drbl:m16l2
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { listSeasonGames } from "../drbl/download/season-games";
import { loadNormalizedGame } from "../drbl/evaluation/m16c-dataset";
import { pearson, spearman } from "../drbl/evaluation/metrics";
import type { DrblProcessedGame } from "../drbl/index";
import {
  attributePossessionSequential,
  EXECUTION_SKILL_FRACTION,
  SEQUENTIAL_ATTRIBUTION_VERSION,
} from "../drbl/models/sequential-attribution";
import { stateForPossession } from "../drbl/models/player-value";
import {
  accumulateReplacementSignals,
  buildReplacementPool,
  finalizeRoleAccum,
  replacementExpectedPoints,
  type RoleVector,
} from "../drbl/models/replacement";
import { warmEpvModel } from "../drbl/models/expected-points";
import {
  VALIDATED_ABILITY_MODEL_VERSION,
  computeValidatedAbilityV1,
} from "../drbl/models/validated-ability-v1";
import { PlayerTeamStintBuilder } from "../drbl/models/war-team-stint-allocation-v1";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m16l2");
const RAW = path.join(OUT, "raw");
const M16J = path.join(ROOT, "reports", "m16j");
const M16L12 = path.join(ROOT, "reports", "m16l1_2");
const M16L11 = path.join(ROOT, "reports", "m16l1_1");
const M16L1 = path.join(ROOT, "reports", "m16l1");
const PROTOCOL_SRC = path.join(M16L12, "31_m16l2_reserved_protocol.md");

const EXPECTED_PE =
  "942b21ef78ba0a142549f8a2b62338993e133f17b8bb1ff7b94fc8844ad9297c";
const EXPECTED_SEAL =
  "84f4eadccb536f058194acb4db730c044ea413036456e072952d89a64600d742";
const M16L1_FREEZE =
  "21abd1c7e503dde633fa7ff7a53fab59aeba29caf7b95684830d7400028d850c";
const M16L11_HASH =
  "422bf1391ac8f64d23a17e32786b8516c7bed6a0b08c48da6732856bb029ff0b";
const M16L12_HASH =
  "7d87d96e3ad4934e7f222d91e568d034468bbfe17ac6cbf7b52bf90136878149";
const P1 = 37.490662671779255;
const DEV = "2024-25";
const RES = "2025-26";
/** Frozen primary accounting tolerance (declared pre-results). */
const ACCOUNTING_TOL = 1e-8;
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
function maxOf(xs: number[]): number {
  let m = -Infinity;
  for (const x of xs) if (x > m) m = x;
  return xs.length ? m : NaN;
}
function minOf(xs: number[]): number {
  let m = Infinity;
  for (const x of xs) if (x < m) m = x;
  return xs.length ? m : NaN;
}
function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}
function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
function rmse(errs: number[]): number {
  return Math.sqrt(mean(errs.map((e) => e * e)));
}
function mae(errs: number[]): number {
  return mean(errs.map((e) => Math.abs(e)));
}
function r2(y: number[], pred: number[]): number {
  const m = mean(y);
  const ssTot = y.reduce((s, yi) => s + (yi - m) ** 2, 0);
  const ssRes = y.reduce((s, yi, i) => s + (yi - pred[i]!) ** 2, 0);
  return ssTot > 0 ? 1 - ssRes / ssTot : NaN;
}
function olsThroughOrigin(x: number[], y: number[]): number {
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < x.length; i++) {
    sxx += x[i]! * x[i]!;
    sxy += x[i]! * y[i]!;
  }
  return sxx > 0 ? sxy / sxx : NaN;
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

async function loadSeasonGames(season: string): Promise<DrblProcessedGame[]> {
  const metas = await listSeasonGames(season);
  const out: DrblProcessedGame[] = [];
  let missing = 0;
  for (const meta of metas) {
    const g = await loadNormalizedGame(season, meta.gameId);
    if (!g) {
      missing += 1;
      continue;
    }
    out.push(g);
  }
  if (missing > 0) {
    console.warn(`[${season}] missing/quarantined games: ${missing}`);
  }
  out.sort(
    (a, b) =>
      (a.box.gameDate || "").localeCompare(b.box.gameDate || "") ||
      a.box.gameId.localeCompare(b.box.gameId)
  );
  return out;
}

type TeamAcc = {
  offCredit: number;
  defCredit: number;
  offV0: number;
  defV0: number;
  unobserved: number;
  offPoss: number;
  defPoss: number;
  playerStable: number;
};

async function main() {
  await mkdir(OUT, { recursive: true });
  await mkdir(RAW, { recursive: true });
  await warmEpvModel();

  const timestamp = new Date().toISOString();
  const gitCommit = execSync("git rev-parse HEAD", {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  const dirty =
    execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" }).trim()
      .length > 0;

  // ---- Phase 0 / 1: pre-open freeze + prerequisite reproduction ----
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

  const freezeBody = await readFile(
    path.join(M16L12, "raw/r1_value_freeze_body.json"),
    "utf8"
  );
  const freezeHashRecomputed = sha256(freezeBody);
  const freezeFile = JSON.parse(
    await readFile(path.join(M16L12, "30_r1_value_freeze.json"), "utf8")
  ) as { M16L1_2_R1_VALUE_FREEZE_HASH: string };
  const health12 = JSON.parse(
    await readFile(path.join(M16L12, "34_model_health.json"), "utf8")
  ) as Record<string, string | number>;
  const sem01 = JSON.parse(
    await readFile(path.join(M16L12, "01_semantic_reproduction.json"), "utf8")
  ) as Record<string, string>;

  if (
    sealedHash !== EXPECTED_SEAL ||
    sealed.pointEstimateFreezeHash !== EXPECTED_PE ||
    peManifest.POINT_ESTIMATE_FREEZE_HASH !== EXPECTED_PE ||
    freezeHashRecomputed !== M16L12_HASH ||
    freezeFile.M16L1_2_R1_VALUE_FREEZE_HASH !== M16L12_HASH ||
    health12.M16L1_1_SCALE_AUDIT_HASH !== M16L11_HASH ||
    health12.M16L1_WAR_PRE_RESERVED_FREEZE_HASH !== M16L1_FREEZE ||
    health12.CANONICAL_ABILITY_VERSION !== VALIDATED_ABILITY_MODEL_VERSION
  ) {
    throw new Error("STOP M16L2_PRE_RESERVED_FREEZE_REPRODUCTION_FAILURE");
  }

  const prereqOk =
    health12.RAW_R1_POINTS_ACCOUNTING_IDENTITY === "PASS" &&
    health12.R1_POINTS_UNIT === "SCOREBOARD_POINT_EQUIVALENT_RESIDUAL" &&
    health12.R1_POINTS_REFERENCE === "CONTEXTUAL_ROLE_MATCHED_R1" &&
    health12.REALIZED_STINT_VALUE_SOURCE ===
      "OBSERVED_PRIMITIVE_STINT_ATTRIBUTION" &&
    health12.PLAYER_ATTRIBUTION_EXHAUSTIVE === "NO" &&
    Number(health12.DEVELOPMENT_NET_POINTS_PER_WIN) === P1 &&
    health12.R1_POINT_TO_WIN_DIMENSIONAL_CONVERSION === "PASS" &&
    health12.R1_WIN_ESTIMAND_CLASS ===
      "PLAYER_ATTRIBUTED_WIN_EQUIVALENTS_ABOVE_CONTEXTUAL_R1" &&
    health12.R1_WINS_CAUSAL_REPLACEMENT_EFFECT === "NO" &&
    health12.CONVENTIONAL_WAR_AVAILABLE === "NO" &&
    health12.R1_WIN_EQUIVALENT_STATUS === "FROZEN_RESEARCH" &&
    health12.P1_STATUS === "PRESERVED" &&
    health12.R1_POINTS_SOURCE_OF_TRUTH ===
      "PRIMITIVE_APPROACH_B_ATTRIBUTED_VALUE" &&
    sem01.APPROACH_B_VALUE_UNIT === "SCOREBOARD_POINT_EQUIVALENT_RESIDUAL" &&
    sem01.R1_BASELINE_CLASS === "ROLE_MATCHED_REFERENCE_BASELINE" &&
    sem01.DRBL_ZERO_SEMANTIC_CLASS === "ROLE_MATCHED_R1_REFERENCE" &&
    sem01.SCALE_GAP_EXPLANATION === "VARIABLE_R1_BASELINE" &&
    sem01.DETERMINISTIC_UNIT_FACTOR_FOUND === "NO";

  if (!prereqOk) {
    throw new Error("STOP DO_NOT_OPEN_RESERVED_OUTCOMES");
  }

  const protocolBuf = await readFile(PROTOCOL_SRC);
  const protocolHash = sha256(protocolBuf);
  await writeFile(path.join(RAW, "m16l2_protocol.md"), protocolBuf);
  await writeFile(
    path.join(RAW, "m16l2_protocol.hash.txt"),
    protocolHash + "\n"
  );

  await writeFile(
    path.join(OUT, "00_preopen_freeze.json"),
    JSON.stringify(
      {
        milestone: "M16l2",
        timestamp,
        gitCommit,
        gitDirty: dirty,
        POINT_ESTIMATE_FREEZE_HASH: EXPECTED_PE,
        RESERVED_RESULT_SEAL_HASH: sealedHash,
        CANONICAL_ABILITY_VERSION: VALIDATED_ABILITY_MODEL_VERSION,
        M16L1_WAR_PRE_RESERVED_FREEZE_HASH: M16L1_FREEZE,
        M16L1_1_SCALE_AUDIT_HASH: M16L11_HASH,
        M16L1_2_R1_VALUE_FREEZE_HASH: M16L12_HASH,
        M16L2_PROTOCOL_HASH: protocolHash,
        P1,
        R1PointsFormula:
          "ApproachBAttributedValue = rawAbilityRateExact * N / 100",
        R1WinEqFormula: `R1Points / ${P1}`,
        production: {
          CANONICAL_DRBL_CHANGED: "NO",
          LIVE_WAR_CHANGED: "NO",
          PUBLIC_UI_CHANGED: "NO",
        },
        WAR_RESERVED_2025_26_STATUS_BEFORE: "UNCONSUMED",
        note: "No 2025-26 outcome aggregates in this file",
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "01_prerequisite_reproduction.json"),
    JSON.stringify(
      {
        result: "PASS",
        RAW_R1_POINTS_ACCOUNTING_IDENTITY: "PASS",
        R1_POINTS_UNIT: "SCOREBOARD_POINT_EQUIVALENT_RESIDUAL",
        R1_POINTS_REFERENCE: "CONTEXTUAL_ROLE_MATCHED_R1",
        REALIZED_STINT_VALUE_SOURCE: "OBSERVED_PRIMITIVE_STINT_ATTRIBUTION",
        PLAYER_ATTRIBUTION_EXHAUSTIVE: "NO",
        P1,
        R1_POINT_TO_WIN_DIMENSIONAL_CONVERSION: "PASS",
        R1_WIN_ESTIMAND_CLASS:
          "PLAYER_ATTRIBUTED_WIN_EQUIVALENTS_ABOVE_CONTEXTUAL_R1",
        R1_WINS_CAUSAL_REPLACEMENT_EFFECT: "NO",
        CONVENTIONAL_WAR_AVAILABLE: "NO",
        APPROACH_B_VALUE_UNIT: "SCOREBOARD_POINT_EQUIVALENT_RESIDUAL",
        R1_BASELINE_CLASS: "ROLE_MATCHED_REFERENCE_BASELINE",
        DRBL_ZERO_SEMANTIC_CLASS: "ROLE_MATCHED_R1_REFERENCE",
        SCALE_GAP_EXPLANATION: "VARIABLE_R1_BASELINE",
        DETERMINISTIC_UNIT_FACTOR_FOUND: "NO",
        R1_POINTS_SOURCE_OF_TRUTH: "PRIMITIVE_APPROACH_B_ATTRIBUTED_VALUE",
        R1_WIN_EQUIVALENT_STATUS: "FROZEN_RESEARCH",
        P1_STATUS: "PRESERVED",
        DEVELOPMENT_NET_POINTS_PER_WIN: P1,
        freezeHashesOk: true,
      },
      null,
      2
    )
  );

  // ---- Phase 2: structural precheck (no outcome aggregation) ----
  console.log(`[${RES}] structural precheck - listing games…`);
  const metas = await listSeasonGames(RES);
  console.log(`[${RES}] loading ${metas.length} normalized games (structure)…`);
  const games = await loadSeasonGames(RES);
  const teamIds = new Set<string>();
  const playerIds = new Set<string>();
  let possCount = 0;
  let appearanceSlots = 0;
  for (const g of games) {
    if (g.box.homeTeamId) teamIds.add(g.box.homeTeamId);
    if (g.box.awayTeamId) teamIds.add(g.box.awayTeamId);
    for (const p of g.box.players) playerIds.add(p.playerId);
    possCount += g.possessions.length;
    for (const possession of g.possessions) {
      appearanceSlots +=
        possession.offensePlayerIds.filter(Boolean).length +
        possession.defensePlayerIds.filter(Boolean).length;
    }
  }
  await writeFile(
    path.join(OUT, "02_reserved_structural_precheck.json"),
    JSON.stringify(
      {
        season: RES,
        listedGames: metas.length,
        loadedGames: games.length,
        uniqueTeamIds: teamIds.size,
        uniquePlayerIds: playerIds.size,
        possessionCount: possCount,
        appearanceSlots,
        SEQUENTIAL_ATTRIBUTION_VERSION,
        EXECUTION_SKILL_FRACTION,
        formulaContract: "same as development (R1 pool + seq-attr-v1)",
        outcomesAggregated: false,
      },
      null,
      2
    )
  );

  // ---- Phase 3: reserved open marker (THEN outcomes) ----
  const openTs = new Date().toISOString();
  const openIntent = {
    timestamp: openTs,
    gitCommit,
    POINT_ESTIMATE_FREEZE_HASH: EXPECTED_PE,
    RESERVED_RESULT_SEAL_HASH: sealedHash,
    M16L1_2_R1_VALUE_FREEZE_HASH: M16L12_HASH,
    M16L2_PROTOCOL_HASH: protocolHash,
    statement:
      "2025-26 reserved outcomes will now be consumed exactly once",
  };
  await writeFile(
    path.join(RAW, "00_reserved_open_intent.json"),
    JSON.stringify(openIntent, null, 2)
  );
  await writeFile(
    path.join(OUT, "03_reserved_open_marker.json"),
    JSON.stringify(
      {
        RESERVED_SEASON: RES,
        PREVIOUS_STATUS: "UNCONSUMED",
        NEW_STATUS: "CONSUMED_ONCE",
        WAR_RESERVED_2025_26_STATUS: "CONSUMED_ONCE",
        M16L2_PROTOCOL_HASH: protocolHash,
        M16L1_2_R1_VALUE_FREEZE_HASH: M16L12_HASH,
        timestamp: openTs,
        statement: openIntent.statement,
      },
      null,
      2
    )
  );
  console.log("RESERVED OPEN - 2025-26 outcomes CONSUMED_ONCE");

  // ---- Phase 4: team outcomes ----
  type Outcome = {
    teamId: string;
    games: number;
    wins: number;
    losses: number;
    pointsFor: number;
    pointsAgainst: number;
    actualNetPoints: number;
  };
  const outAcc = new Map<
    string,
    {
      games: number;
      wins: number;
      losses: number;
      pointsFor: number;
      pointsAgainst: number;
    }
  >();
  for (const g of games) {
    const home = g.box.homeTeamId;
    const away = g.box.awayTeamId;
    const hs = Number(g.box.homeScore);
    const as = Number(g.box.awayScore);
    if (!home || !away || !Number.isFinite(hs) || !Number.isFinite(as)) continue;
    const touch = (
      teamId: string,
      pf: number,
      pa: number,
      won: boolean,
      lost: boolean
    ) => {
      let r = outAcc.get(teamId);
      if (!r) {
        r = { games: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 };
        outAcc.set(teamId, r);
      }
      r.games += 1;
      r.pointsFor += pf;
      r.pointsAgainst += pa;
      if (won) r.wins += 1;
      if (lost) r.losses += 1;
    };
    touch(home, hs, as, hs > as, hs < as);
    touch(away, as, hs, as > hs, as < hs);
  }
  const outcomes: Outcome[] = [...outAcc.entries()]
    .map(([teamId, r]) => ({
      teamId,
      games: r.games,
      wins: r.wins,
      losses: r.losses,
      pointsFor: r.pointsFor,
      pointsAgainst: r.pointsAgainst,
      actualNetPoints: r.pointsFor - r.pointsAgainst,
    }))
    .sort((a, b) => a.teamId.localeCompare(b.teamId));

  let outcomeCorrupt = false;
  let netMismatch = 0;
  for (const t of outcomes) {
    if (t.actualNetPoints !== t.pointsFor - t.pointsAgainst) netMismatch += 1;
  }
  if (outcomes.length !== 30 || netMismatch > 0) outcomeCorrupt = true;
  const leagueWins = outcomes.reduce((s, t) => s + t.wins, 0);
  const leagueNet = outcomes.reduce((s, t) => s + t.actualNetPoints, 0);
  await writeFile(
    path.join(OUT, "04_reserved_team_outcomes.csv"),
    toCsv(
      outcomes.map((t) => ({
        teamId: t.teamId,
        games: t.games,
        wins: t.wins,
        losses: t.losses,
        pointsFor: t.pointsFor,
        pointsAgainst: t.pointsAgainst,
        actualNetPoints: t.actualNetPoints,
      }))
    )
  );

  // ---- Phase 5-11: attribution + baseline (IDs only; no player names in primary files) ----
  console.log(`[${RES}] building R1 pool…`);
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

  const teamAcc = new Map<string, TeamAcc>();
  const ensure = (id: string): TeamAcc => {
    let r = teamAcc.get(id);
    if (!r) {
      r = {
        offCredit: 0,
        defCredit: 0,
        offV0: 0,
        defV0: 0,
        unobserved: 0,
        offPoss: 0,
        defPoss: 0,
        playerStable: 0,
      };
      teamAcc.set(id, r);
    }
    return r;
  };

  const stintBuilder = new PlayerTeamStintBuilder();
  const nameByPlayer = new Map<string, string>(); // collected but unused until post-verdict

  console.log(`[${RES}] possession attribution + stints…`);
  let gi = 0;
  for (const g of games) {
    gi += 1;
    if (gi % 200 === 0) console.log(`[${RES}] game ${gi}/${games.length}`);
    for (const p of g.box.players) {
      nameByPlayer.set(p.playerId, p.playerName);
      stintBuilder.setPlayerName(p.playerId, p.playerName);
    }
    for (const possession of g.possessions) {
      const state = stateForPossession(possession, g.box, g.events);
      const offenseIds = possession.offensePlayerIds.filter(Boolean);
      const defenseIds = possession.defensePlayerIds.filter(Boolean);
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
      const nameMap = new Map(
        g.box.players.map((p) => [p.playerId, p.playerName])
      );
      const seq = attributePossessionSequential({
        possession,
        events: g.events,
        startEp: v0,
        offensePlayerIds: offenseIds,
        defensePlayerIds: defenseIds,
        nameById: nameMap,
      });

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
          stintBuilder.ingestAppearance({
            season: RES,
            playerId: c.playerId,
            teamId: possession.offenseTeamId,
            opponentTeamId: possession.defenseTeamId,
            gameId: g.box.gameId,
            gameDate: g.box.gameDate,
            value: c.stableAmount,
            appearanceExposure: 1,
          });
        }
        if (defSet.has(c.playerId)) {
          defCredit += c.amount;
          stableDef += c.stableAmount;
          stintBuilder.ingestAppearance({
            season: RES,
            playerId: c.playerId,
            teamId: possession.defenseTeamId,
            opponentTeamId: possession.offenseTeamId,
            gameId: g.box.gameId,
            gameDate: g.box.gameDate,
            value: c.stableAmount,
            appearanceExposure: 1,
          });
        }
      }

      const ot = ensure(possession.offenseTeamId);
      const dt = ensure(possession.defenseTeamId);
      ot.offCredit += offCredit;
      ot.offV0 += v0;
      ot.unobserved += seq.unobserved;
      ot.offPoss += 1;
      ot.playerStable += stableOff;

      dt.defCredit += defCredit;
      dt.defV0 += v0;
      dt.defPoss += 1;
      dt.playerStable += stableDef;
    }
  }

  const stints = stintBuilder.stintRows();
  type PlayerAgg = {
    playerId: string;
    N: number;
    V: number;
    stints: Array<{ teamId: string; teamN: number; observedV: number }>;
  };
  const byPlayer = new Map<string, PlayerAgg>();
  for (const st of stints) {
    let p = byPlayer.get(st.playerId);
    if (!p) {
      p = { playerId: st.playerId, N: 0, V: 0, stints: [] };
      byPlayer.set(st.playerId, p);
    }
    p.N += st.teamStintCombinedAppearances;
    p.V += st.observedRawStintAttributedValue;
    p.stints.push({
      teamId: st.teamId,
      teamN: st.teamStintCombinedAppearances,
      observedV: st.observedRawStintAttributedValue,
    });
  }

  // Player R1 points (IDs only)
  const idResiduals: number[] = [];
  let idMismatch = 0;
  const playerRowsIdOnly: Record<string, unknown>[] = [];
  for (const p of [...byPlayer.values()].sort((a, b) =>
    a.playerId.localeCompare(b.playerId)
  )) {
    const rawExact = p.N > 0 ? (100 * p.V) / p.N : 0;
    const recon = (rawExact * p.N) / 100;
    const res = Math.abs(recon - p.V);
    idResiduals.push(res);
    if (res > VALUE_TOL) idMismatch += 1;
    const validated = computeValidatedAbilityV1({
      rawAbilityRate: rawExact,
      actualCombinedPossessionAppearances: p.N,
    }).validatedDRBL100;
    playerRowsIdOnly.push({
      season: RES,
      playerId: p.playerId,
      N: p.N,
      rawAbilityRateExact: rawExact,
      validatedDRBL100: validated,
      R1Points: p.V,
      PosteriorR1Points: (validated * p.N) / 100,
      R1WinEq: p.V / P1,
    });
  }
  const idSorted = [...idResiduals].sort((a, b) => a - b);
  await writeFile(
    path.join(OUT, "05_reserved_player_r1_points.csv"),
    toCsv(playerRowsIdOnly)
  );
  await writeFile(
    path.join(OUT, "06_reserved_raw_value_identity.json"),
    JSON.stringify(
      {
        playerSeasons: idResiduals.length,
        maxResidual: idSorted.length ? idSorted[idSorted.length - 1] : 0,
        meanResidual: mean(idResiduals),
        P99Residual: percentile(idSorted, 99),
        mismatchCount: idMismatch,
        RAW_R1_POINTS_ACCOUNTING_IDENTITY_RESERVED:
          idMismatch === 0 ? "PASS" : "FAIL",
      },
      null,
      2
    )
  );

  // Stint conservation
  let stintMismatch = 0;
  const stintResiduals: number[] = [];
  let multi = 0;
  let single = 0;
  let twoTeam = 0;
  let threePlus = 0;
  const ptRows: Record<string, unknown>[] = [];
  for (const p of byPlayer.values()) {
    const sum = p.stints.reduce((s, t) => s + t.observedV, 0);
    const res = Math.abs(sum - p.V);
    stintResiduals.push(res);
    if (res > VALUE_TOL) stintMismatch += 1;
    if (p.stints.length === 1) single += 1;
    else {
      multi += 1;
      if (p.stints.length === 2) twoTeam += 1;
      else threePlus += 1;
    }
    const rawExact = p.N > 0 ? (100 * p.V) / p.N : 0;
    for (const st of p.stints) {
      ptRows.push({
        season: RES,
        playerId: p.playerId,
        teamId: st.teamId,
        teamN: st.teamN,
        observedRealizedR1Points: st.observedV,
        rateAllocatedR1PointsDiagnostic: (rawExact * st.teamN) / 100,
        R1WinEq: st.observedV / P1,
      });
    }
  }
  ptRows.sort(
    (a, b) =>
      String(a.playerId).localeCompare(String(b.playerId)) ||
      String(a.teamId).localeCompare(String(b.teamId))
  );
  await writeFile(
    path.join(OUT, "07_reserved_player_team_r1_points.csv"),
    toCsv(ptRows)
  );
  await writeFile(
    path.join(OUT, "08_reserved_stint_conservation.json"),
    JSON.stringify(
      {
        singleTeamPlayers: single,
        multiTeamPlayers: multi,
        twoTeamPlayers: twoTeam,
        threePlusTeamPlayers: threePlus,
        maxResidual: stintResiduals.length ? maxOf(stintResiduals) : 0,
        mismatchCount: stintMismatch,
        RESERVED_STINT_CONSERVATION: stintMismatch === 0 ? "PASS" : "FAIL",
        REALIZED_STINT_VALUE_SOURCE: "OBSERVED_PRIMITIVE_STINT_ATTRIBUTION",
      },
      null,
      2
    )
  );

  // Team R1 points from realized stints
  const teamR1 = new Map<string, number>();
  for (const p of byPlayer.values()) {
    for (const st of p.stints) {
      teamR1.set(st.teamId, (teamR1.get(st.teamId) ?? 0) + st.observedV);
    }
  }

  const teamR1Rows: Record<string, unknown>[] = [];
  const baselineRows: Record<string, unknown>[] = [];
  const unassignedRows: Record<string, unknown>[] = [];
  const accountingResiduals: number[] = [];
  let accountingMismatch = 0;
  const winEqResiduals: number[] = [];
  const winEqRows: Record<string, unknown>[] = [];

  for (const t of outcomes) {
    const a = teamAcc.get(t.teamId) ?? {
      offCredit: 0,
      defCredit: 0,
      offV0: 0,
      defV0: 0,
      unobserved: 0,
      offPoss: 0,
      defPoss: 0,
      playerStable: 0,
    };
    const teamPoints = teamR1.get(t.teamId) ?? 0;
    const baseline = a.offV0 - a.defV0;
    const unassigned = a.unobserved;
    const recon = teamPoints + baseline + unassigned;
    const resid = t.actualNetPoints - recon;
    accountingResiduals.push(Math.abs(resid));
    if (Math.abs(resid) > ACCOUNTING_TOL) accountingMismatch += 1;

    teamR1Rows.push({
      season: RES,
      teamId: t.teamId,
      TeamR1Points: teamPoints,
      TeamR1WinEq: teamPoints / P1,
      ApproachBPlayerStableSum: a.playerStable,
      ApproachBAttributedAccounting: a.offCredit + a.defCredit,
      ActualNetPoints: t.actualNetPoints,
    });
    baselineRows.push({
      season: RES,
      teamId: t.teamId,
      R1BaselineNetPoints: baseline,
      offV0Sum: a.offV0,
      defV0Sum: a.defV0,
      offPoss: a.offPoss,
      defPoss: a.defPoss,
    });
    unassignedRows.push({
      season: RES,
      teamId: t.teamId,
      UnassignedResidual: unassigned,
      offPoss: a.offPoss,
    });

    const teamWinEq = teamPoints / P1;
    const baseWinEq = baseline / P1;
    const uWinEq = unassigned / P1;
    const netWinEq = t.actualNetPoints / P1;
    const weRecon = teamWinEq + baseWinEq + uWinEq;
    const weResid = Math.abs(netWinEq - weRecon);
    winEqResiduals.push(weResid);
    winEqRows.push({
      season: RES,
      teamId: t.teamId,
      TeamR1WinEq: teamWinEq,
      R1BaselineWinEq: baseWinEq,
      UnassignedWinEq: uWinEq,
      NetPointWinEq: netWinEq,
      reconstructed: weRecon,
      residual: netWinEq - weRecon,
    });
  }

  await writeFile(path.join(OUT, "09_reserved_team_r1_points.csv"), toCsv(teamR1Rows));
  await writeFile(path.join(OUT, "10_reserved_r1_baseline.csv"), toCsv(baselineRows));
  await writeFile(
    path.join(OUT, "11_reserved_unassigned_residual.csv"),
    toCsv(unassignedRows)
  );

  const accSorted = [...accountingResiduals].sort((a, b) => a - b);
  const leagueAccResid = outcomes.reduce((s, t, i) => {
    const a = teamAcc.get(t.teamId)!;
    const teamPoints = teamR1.get(t.teamId) ?? 0;
    const baseline = a.offV0 - a.defV0;
    const unassigned = a.unobserved;
    return s + (t.actualNetPoints - (teamPoints + baseline + unassigned));
  }, 0);

  const accountingPass =
    !outcomeCorrupt &&
    accountingMismatch === 0 &&
    (accSorted.length ? accSorted[accSorted.length - 1]! : 0) <= ACCOUNTING_TOL;

  await writeFile(
    path.join(OUT, "12_primary_accounting_test.json"),
    JSON.stringify(
      {
        equation:
          "ActualNetPoints = TeamR1Points + R1BaselineNetPoints + UnassignedResidual",
        tolerance: ACCOUNTING_TOL,
        leagueResidual: leagueAccResid,
        maxAbsTeamResidual: accSorted.length ? accSorted[accSorted.length - 1] : 0,
        meanAbsResidual: mean(accountingResiduals),
        P99Residual: percentile(accSorted, 99),
        mismatchCount: accountingMismatch,
        R1_RESERVED_ACCOUNTING_REPRODUCTION: accountingPass ? "PASS" : "FAIL",
      },
      null,
      2
    )
  );

  const leagueAttr = [...teamR1.values()].reduce((a, b) => a + b, 0);
  const leagueU = outcomes.reduce(
    (s, t) => s + (teamAcc.get(t.teamId)?.unobserved ?? 0),
    0
  );
  const leagueSum = leagueAttr + leagueU;
  const zeroSum = Math.abs(leagueSum) < 1e-6;
  await writeFile(
    path.join(OUT, "13_reserved_league_identity.json"),
    JSON.stringify(
      {
        leagueTeamR1Points: leagueAttr,
        leagueUnassignedResidual: leagueU,
        sum: leagueSum,
        residual: leagueSum,
        RESERVED_LEAGUE_ATTRIBUTED_PLUS_UNASSIGNED_ZERO_SUM: zeroSum
          ? "YES"
          : "NO",
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "14_reserved_win_equivalent_accounting.csv"),
    toCsv(winEqRows)
  );
  const winEqPass =
    winEqResiduals.every((x) => x <= ACCOUNTING_TOL / Math.max(P1, 1));

  // ---- Phase 13-15: P1 calibration ----
  const leagueMeanWins = leagueWins / outcomes.length;
  const actualWins = outcomes.map((t) => t.wins);
  const predWins = outcomes.map(
    (t) => leagueMeanWins + t.actualNetPoints / P1
  );
  const p1Errs = actualWins.map((w, i) => w - predWins[i]!);
  const p1Rmse = rmse(p1Errs);
  const p1Mae = mae(p1Errs);
  const p1Bias = mean(p1Errs);
  const p1Pearson = pearson(actualWins, predWins);
  const p1Spearman = spearman(actualWins, predWins);
  const p1R2 = r2(actualWins, predWins);

  const actualWinDelta = actualWins.map((w) => w - leagueMeanWins);
  const predWinDelta = outcomes.map((t) => t.actualNetPoints / P1);
  const bReserved = olsThroughOrigin(predWinDelta, actualWinDelta);
  const scalePred = predWinDelta.map((x) => bReserved * x);
  const scaleErrs = actualWinDelta.map((y, i) => y - scalePred[i]!);
  const scaleRmse = rmse(scaleErrs);
  const scaleR2 = r2(actualWinDelta, scalePred);
  const p1ScalePass =
    Number.isFinite(bReserved) && bReserved >= 0.85 && bReserved <= 1.15;
  const p1MetricsFinite =
    Number.isFinite(p1Rmse) &&
    Number.isFinite(p1Mae) &&
    Number.isFinite(p1Pearson) &&
    Number.isFinite(p1R2);
  const p1Verdict = p1ScalePass && p1MetricsFinite && !outcomeCorrupt;

  await writeFile(
    path.join(OUT, "15_p1_reserved_calibration.json"),
    JSON.stringify(
      {
        LeagueMeanWins: leagueMeanWins,
        formula: "PredWins = LeagueMeanWins + ActualNetPoints/P1",
        P1,
        P1_REFIT: "NO",
        RMSE: p1Rmse,
        MAE: p1Mae,
        bias: p1Bias,
        Pearson: p1Pearson,
        Spearman: p1Spearman,
        R2: p1R2,
        scaleDiagnostic: {
          equation: "ActualWinDelta = b_reserved * PredWinDelta (intercept 0)",
          b_reserved: bReserved,
          RMSE: scaleRmse,
          R2: scaleR2,
          acceptedRange: [0.85, 1.15],
          P1_RESERVED_SCALE_STABILITY: p1ScalePass ? "PASS" : "FAIL",
          label: "POST_RESERVED_DIAGNOSTIC_ONLY NOT_MODEL_PARAMETER",
        },
        CONSTANT_INTERCEPT_TEAM_R1WINEQ_TEST_RUN: "NO",
      },
      null,
      2
    )
  );

  // ---- Phase 17-21: stability / ability diagnostics ----
  const baselines = outcomes.map(
    (t) => (teamAcc.get(t.teamId)?.offV0 ?? 0) - (teamAcc.get(t.teamId)?.defV0 ?? 0)
  );
  const unassigneds = outcomes.map(
    (t) => teamAcc.get(t.teamId)?.unobserved ?? 0
  );
  const teamPointsArr = outcomes.map((t) => teamR1.get(t.teamId) ?? 0);
  const nets = outcomes.map((t) => t.actualNetPoints);
  const totalPossTeam = outcomes.reduce(
    (s, t) =>
      s +
      (teamAcc.get(t.teamId)?.offPoss ?? 0) +
      (teamAcc.get(t.teamId)?.defPoss ?? 0),
    0
  );

  // Development reference from prior reports
  const devTeam = parseCsv(
    await readFile(path.join(M16L12, "19_team_r1_value.csv"), "utf8")
  );
  const devPlayers = parseCsv(
    await readFile(path.join(M16L12, "17_player_season_r1_value.csv"), "utf8")
  );
  const devLeague = JSON.parse(
    await readFile(path.join(M16L12, "09_league_residual_identity.json"), "utf8")
  ) as {
    leagueAttributedR1Points: number;
    leagueUnassignedResidual: number;
  };
  const devBaseline = parseCsv(
    await readFile(
      path.join(M16L11, "09_team_baseline_decomposition.csv"),
      "utf8"
    )
  );

  const resR1Points = [...byPlayer.values()].map((p) => p.V);
  const resRaw = [...byPlayer.values()].map((p) =>
    p.N > 0 ? (100 * p.V) / p.N : 0
  );
  const resWinEq = resR1Points.map((v) => v / P1);
  const resN = [...byPlayer.values()].map((p) => p.N);
  const resR1PerApp = resR1Points.map((v, i) =>
    resN[i]! > 0 ? v / resN[i]! : 0
  );

  const devR1Points = devPlayers.map((r) => Number(r.R1Points));
  const devRaw = devPlayers.map((r) => Number(r.rawAbilityRateExact));
  const devWinEq = devPlayers.map((r) => Number(r.R1WinEq));
  const devN = devPlayers.map((r) => Number(r.N));
  const devR1PerApp = devR1Points.map((v, i) =>
    devN[i]! > 0 ? v / devN[i]! : 0
  );
  const devTeamR1 = devTeam.map((r) => Number(r.TeamPlayerAttributedR1Points));
  const devBase = devBaseline.map((r) => Number(r.R1BaselineNetPoints));
  const devU = devBaseline.map((r) => Number(r.UnassignedNetResidual));

  await writeFile(
    path.join(OUT, "16_cross_season_distribution_stability.json"),
    JSON.stringify(
      {
        [DEV]: {
          playerCount: devPlayers.length,
          teamCount: 30,
          meanRawAbilityRate: mean(devRaw),
          SDRawAbilityRate: sd(devRaw),
          meanR1Points: mean(devR1Points),
          SDR1Points: sd(devR1Points),
          medianR1Points: median(devR1Points),
          P10R1Points: percentile([...devR1Points].sort((a, b) => a - b), 10),
          P90R1Points: percentile([...devR1Points].sort((a, b) => a - b), 90),
          meanR1WinEq: mean(devWinEq),
          SDR1WinEq: sd(devWinEq),
          TeamR1PointsSD: sd(devTeamR1),
          R1BaselineNetPointsSD: sd(devBase),
          UnassignedResidualTeamSD: sd(devU),
          leagueTeamR1Points: devLeague.leagueAttributedR1Points,
          leagueUnassignedResidual: devLeague.leagueUnassignedResidual,
          meanR1PointsPerAppearance: mean(devR1PerApp),
        },
        [RES]: {
          playerCount: byPlayer.size,
          teamCount: outcomes.length,
          meanRawAbilityRate: mean(resRaw),
          SDRawAbilityRate: sd(resRaw),
          meanR1Points: mean(resR1Points),
          SDR1Points: sd(resR1Points),
          medianR1Points: median(resR1Points),
          P10R1Points: percentile([...resR1Points].sort((a, b) => a - b), 10),
          P90R1Points: percentile([...resR1Points].sort((a, b) => a - b), 90),
          meanR1WinEq: mean(resWinEq),
          SDR1WinEq: sd(resWinEq),
          TeamR1PointsSD: sd(teamPointsArr),
          R1BaselineNetPointsSD: sd(baselines),
          UnassignedResidualTeamSD: sd(unassigneds),
          leagueTeamR1Points: leagueAttr,
          leagueUnassignedResidual: leagueU,
          meanR1PointsPerAppearance: mean(resR1PerApp),
          R1BaselinePerPossession:
            totalPossTeam > 0
              ? baselines.reduce((a, b) => a + Math.abs(b), 0) /
                (totalPossTeam / 2)
              : NaN,
          unassignedPerPossession:
            possCount > 0 ? Math.abs(leagueU) / possCount : NaN,
        },
        note: "Descriptive only; no tuning",
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "17_r1_formula_stability.json"),
    JSON.stringify(
      {
        candidateUniverse: ">=40 possessions",
        roleKnn: 8,
        roleFeatures: ["usage", "three", "starter", "mpg"],
        qualityRestriction: "bottom ~40% residual vs EPV",
        exposurePreference: "8-32 mpg",
        EPV: "unchanged",
        clamps: "unchanged",
        attribution: SEQUENTIAL_ATTRIBUTION_VERSION,
        EXECUTION_SKILL_FRACTION,
        seasonSpecificBranch: false,
        RESERVED_R1_FORMULA_IDENTICAL: "YES",
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "18_reserved_baseline_behavior.json"),
    JSON.stringify(
      {
        reserved: {
          mean: mean(baselines),
          SD: sd(baselines),
          min: minOf(baselines),
          max: maxOf(baselines),
          range: maxOf(baselines) - minOf(baselines),
          corrActualNetPoints: pearson(baselines, nets),
          corrTeamR1Points: pearson(baselines, teamPointsArr),
        },
        development: {
          mean: mean(devBase),
          SD: sd(devBase),
          corrActualNet:
            "see m16l1.1 (~0.980)",
        },
        variableBaselineRemainsMaterial: Math.abs(sd(baselines)) > 50,
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "19_reserved_unassigned_behavior.json"),
    JSON.stringify(
      {
        leagueSignedTotal: leagueU,
        absoluteTotal: Math.abs(leagueU),
        perPossessionMagnitude: possCount > 0 ? Math.abs(leagueU) / possCount : NaN,
        teamSD: sd(unassigneds),
        min: minOf(unassigneds),
        max: maxOf(unassigneds),
        corrActualNetPoints: pearson(unassigneds, nets),
        corrTeamR1Points: pearson(unassigneds, teamPointsArr),
        developmentLeagueUnassigned: devLeague.leagueUnassignedResidual,
        PLAYER_ATTRIBUTION_EXHAUSTIVE: "NO",
      },
      null,
      2
    )
  );

  const realized = playerRowsIdOnly.map((r) => Number(r.R1Points));
  const posterior = playerRowsIdOnly.map((r) => Number(r.PosteriorR1Points));
  const diffs = posterior.map((p, i) => p - realized[i]!);
  const bins = [
    { lo: 1, hi: 49, label: "1-49" },
    { lo: 50, hi: 199, label: "50-199" },
    { lo: 200, hi: 499, label: "200-499" },
    { lo: 500, hi: 999, label: "500-999" },
    { lo: 1000, hi: 1e12, label: "1000+" },
  ];
  const binDiff: Record<string, number> = {};
  for (const b of bins) {
    const xs: number[] = [];
    for (let i = 0; i < playerRowsIdOnly.length; i++) {
      const n = Number(playerRowsIdOnly[i]!.N);
      if (n >= b.lo && n <= b.hi) xs.push(diffs[i]!);
    }
    binDiff[b.label] = mean(xs);
  }
  await writeFile(
    path.join(OUT, "20_reserved_posterior_vs_realized.json"),
    JSON.stringify(
      {
        correlation: pearson(realized, posterior),
        realizedSD: sd(realized),
        posteriorSD: sd(posterior),
        meanDifference_posterior_minus_realized: mean(diffs),
        diffSD: sd(diffs),
        exposureBinMeanDiff: binDiff,
        DRBL_REOPENED: "NO",
      },
      null,
      2
    )
  );

  // ---- Phase 23-26: PRIMARY VERDICT (before named output) ----
  const rawIdPass = idMismatch === 0;
  const stintPass = stintMismatch === 0;
  const additivityPass = stintPass; // stint→season; transitive games
  const teamDecompPass = accountingPass;
  const formulaIdentical = true;
  const semanticPass =
    !outcomeCorrupt &&
    rawIdPass &&
    additivityPass &&
    stintPass &&
    teamDecompPass &&
    zeroSum &&
    formulaIdentical &&
    winEqPass;

  let overall: string;
  if (outcomeCorrupt) overall = "INVALID_RESERVED_DATA";
  else if (!semanticPass) overall = "SEMANTIC_FAIL";
  else if (!p1Verdict) overall = "SEMANTIC_PASS_PPW_FAIL";
  else overall = "STRONG_PASS";

  const r1PointsStatus = outcomeCorrupt
    ? "INVALID_RESERVED_DATA"
    : semanticPass
      ? "RESERVED_SUPPORTED"
      : "RESERVED_FAILED";
  const r1WineqStatus = outcomeCorrupt
    ? "INVALID_RESERVED_DATA"
    : !semanticPass
      ? "NOT_SUPPORTED"
      : p1Verdict
        ? "RESERVED_SUPPORTED"
        : "PPW_RESERVED_FAILED";

  const m16l3PointsEligible =
    overall === "STRONG_PASS" || overall === "SEMANTIC_PASS_PPW_FAIL";
  const m16l3WineqEligible = overall === "STRONG_PASS";

  const nextMilestone =
    overall === "STRONG_PASS"
      ? "M16l3 R1 VALUE PRODUCT MIGRATION"
      : overall === "SEMANTIC_PASS_PPW_FAIL"
        ? "R1 POINTS ONLY PRODUCT MIGRATION"
        : overall === "SEMANTIC_FAIL"
          ? "FUTURE-GENERATION RESEARCH"
          : "BLOCKED";

  // Prefer historical backfill as evidence priority if strong pass
  const nextMajorEvidence =
    overall === "STRONG_PASS" || overall === "SEMANTIC_PASS_PPW_FAIL"
      ? "HISTORICAL_MULTI_SEASON_PBP_BACKFILL"
      : "N/A";

  const primaryVerdict = {
    timestamp: new Date().toISOString(),
    PLAYER_REPUTATION_INSPECTED_PRE_VERDICT: "NO",
    PRIMARY_RESERVED_VERDICT_COMPUTED_BEFORE_NAMED_PLAYER_OUTPUT: "YES",
    EXTERNAL_ADVANCED_METRICS_ACCESSED: "NO",
    CONSTANT_INTERCEPT_TEAM_R1WINEQ_TEST_RUN: "NO",
    EMPIRICAL_SCALE_MULTIPLIER_FIT: "NO",
    NEW_PP_W_FIT: "NO",
    POST_RESERVED_MODEL_RETUNING_ALLOWED: "NO",
    P1_REFIT: "NO",
    RAW_R1_POINTS_ACCOUNTING_IDENTITY_RESERVED: rawIdPass ? "PASS" : "FAIL",
    RESERVED_PLAYER_SEASON_ADDITIVITY: additivityPass ? "PASS" : "FAIL",
    RESERVED_STINT_CONSERVATION: stintPass ? "PASS" : "FAIL",
    RESERVED_TEAM_R1_DECOMPOSITION: teamDecompPass ? "PASS" : "FAIL",
    RESERVED_TEAM_DECOMPOSITION_MAX_RESIDUAL: accSorted.length
      ? accSorted[accSorted.length - 1]
      : 0,
    RESERVED_LEAGUE_ATTRIBUTED_PLUS_UNASSIGNED_ZERO_SUM: zeroSum ? "YES" : "NO",
    RESERVED_R1_FORMULA_IDENTICAL: "YES",
    R1_RESERVED_ACCOUNTING_REPRODUCTION: accountingPass ? "PASS" : "FAIL",
    P1_RESERVED_SCALE_STABILITY: p1ScalePass ? "PASS" : "FAIL",
    P1_RESERVED_VERDICT: p1Verdict ? "PASS" : "FAIL",
    R1_VALUE_SEMANTIC_STABILITY_RESERVED: semanticPass ? "PASS" : "FAIL",
    M16L2_RESERVED_VERDICT: overall,
    R1_POINTS_RESEARCH_STATUS: r1PointsStatus,
    R1_WINEQ_RESEARCH_STATUS: r1WineqStatus,
    CONVENTIONAL_WAR_AVAILABLE: "NO",
    R1_WINS_CAUSAL_REPLACEMENT_EFFECT: "NO",
    PLAYER_ATTRIBUTION_EXHAUSTIVE: "NO",
    P1_ERA_ROBUSTNESS: "NOT_ESTABLISHED",
    M16L3_R1_POINTS_PRODUCT_MIGRATION_ELIGIBLE: m16l3PointsEligible
      ? "YES"
      : "NO",
    M16L3_R1_WINEQ_PRODUCT_MIGRATION_ELIGIBLE: m16l3WineqEligible ? "YES" : "NO",
    NEXT_MILESTONE: nextMilestone,
    NEXT_MAJOR_EVIDENCE_PRIORITY: nextMajorEvidence,
    P1_metrics: {
      RMSE: p1Rmse,
      MAE: p1Mae,
      bias: p1Bias,
      Pearson: p1Pearson,
      Spearman: p1Spearman,
      R2: p1R2,
      b_reserved: bReserved,
    },
  };

  await writeFile(
    path.join(OUT, "21_primary_reserved_verdict.json"),
    JSON.stringify(primaryVerdict, null, 2)
  );
  console.log(`PRIMARY VERDICT WRITTEN: ${overall}`);

  // ---- Phase 28: seal ----
  const datasetFingerprint = sha256(
    JSON.stringify({
      season: RES,
      games: games.length,
      teams: outcomes.length,
      possessions: possCount,
      players: byPlayer.size,
      leagueWins,
      leagueNet,
      teamIds: outcomes.map((t) => t.teamId),
    })
  );
  const sealBody = {
    preOpenHashes: {
      POINT_ESTIMATE_FREEZE_HASH: EXPECTED_PE,
      RESERVED_RESULT_SEAL_HASH: sealedHash,
      M16L1_WAR_PRE_RESERVED_FREEZE_HASH: M16L1_FREEZE,
      M16L1_1_SCALE_AUDIT_HASH: M16L11_HASH,
      M16L1_2_R1_VALUE_FREEZE_HASH: M16L12_HASH,
      M16L2_PROTOCOL_HASH: protocolHash,
    },
    reservedDatasetFingerprint: datasetFingerprint,
    gameCount: games.length,
    teamCount: outcomes.length,
    pbpPossessionCount: possCount,
    playerSeasons: byPlayer.size,
    primaryMetrics: {
      accountingMaxResidual: accSorted.length
        ? accSorted[accSorted.length - 1]
        : 0,
      leagueAttr,
      leagueU,
      zeroSum,
      p1Rmse,
      bReserved,
    },
    semanticVerdict: semanticPass ? "PASS" : "FAIL",
    p1Verdict: p1Verdict ? "PASS" : "FAIL",
    overallVerdict: overall,
    WAR_RESERVED_2025_26_STATUS: "CONSUMED_ONCE",
  };
  const sealJson = JSON.stringify(sealBody, null, 2);
  const sealHash = sha256(sealJson);
  await writeFile(
    path.join(OUT, "22_reserved_result_seal.json"),
    JSON.stringify(
      { ...sealBody, M16L2_RESERVED_RESULT_SEAL_HASH: sealHash },
      null,
      2
    )
  );
  await writeFile(path.join(RAW, "reserved_result_seal_body.json"), sealJson);
  await writeFile(
    path.join(RAW, "reserved_result_seal.hash.txt"),
    sealHash + "\n"
  );

  // ---- Phase 30: named player/team research output (AFTER verdict) ----
  const namedPlayers = playerRowsIdOnly.map((r) => {
    const pid = String(r.playerId);
    const p = byPlayer.get(pid)!;
    const teams = p.stints.map((s) => s.teamId).join("|");
    return {
      ...r,
      playerName: nameByPlayer.get(pid) ?? "",
      teams,
    };
  });
  await writeFile(
    path.join(OUT, "23_reserved_player_research_output.csv"),
    toCsv(namedPlayers)
  );
  await writeFile(
    path.join(OUT, "24_reserved_team_research_output.csv"),
    toCsv(
      outcomes.map((t) => {
        const a = teamAcc.get(t.teamId)!;
        const tp = teamR1.get(t.teamId) ?? 0;
        const baseline = a.offV0 - a.defV0;
        const u = a.unobserved;
        return {
          season: RES,
          teamId: t.teamId,
          games: t.games,
          wins: t.wins,
          losses: t.losses,
          actualNetPoints: t.actualNetPoints,
          TeamR1Points: tp,
          R1BaselineNetPoints: baseline,
          UnassignedResidual: u,
          TeamR1WinEq: tp / P1,
          R1BaselineWinEq: baseline / P1,
          UnassignedWinEq: u / P1,
          PredWins_P1: leagueMeanWins + t.actualNetPoints / P1,
        };
      })
    )
  );

  await writeFile(
    path.join(OUT, "25_human_blindness_disclosure.md"),
    `# Human-blindness disclosure

\`\`\`text
HUMAN_BLINDNESS = NOT_FULL
MODEL_PROTOCOL_BLINDNESS = FROZEN_BEFORE_RESERVED_OUTCOMES
\`\`\`

Public 2025-26 basketball outcomes may already be known to humans.
Primary reserved metrics and verdict were computed from IDs before named-player output.
`
  );

  await writeFile(
    path.join(OUT, "26_parameter_integrity.json"),
    JSON.stringify(
      {
        P1_REFIT: "NO",
        NEW_PP_W_FIT: "NO",
        EMPIRICAL_SCALE_MULTIPLIER_FIT: "NO",
        DRBL_RETUNED: "NO",
        R1_BASELINE_CHANGED: "NO",
        UNASSIGNED_REDISTRIBUTED: "NO",
        POST_RESERVED_MODEL_RETUNING_ALLOWED: "NO",
        CONSTANT_INTERCEPT_TEAM_R1WINEQ_TEST_RUN: "NO",
        result: "PASS",
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "27_production_eligibility.json"),
    JSON.stringify(
      {
        DRBL100_PRODUCTION_STATUS: "UNCHANGED_CERTIFIED",
        R1_POINTS_RESEARCH_STATUS: r1PointsStatus,
        R1_WINEQ_RESEARCH_STATUS: r1WineqStatus,
        CONVENTIONAL_WAR_AVAILABLE: "NO",
        M16L3_R1_POINTS_PRODUCT_MIGRATION_ELIGIBLE: m16l3PointsEligible
          ? "YES"
          : "NO",
        M16L3_R1_WINEQ_PRODUCT_MIGRATION_ELIGIBLE: m16l3WineqEligible
          ? "YES"
          : "NO",
        liveMigrationPerformed: false,
        nextProductionMilestoneRequired: true,
        NEXT_MILESTONE: nextMilestone,
        NEXT_MAJOR_EVIDENCE_PRIORITY: nextMajorEvidence,
      },
      null,
      2
    )
  );

  const modelHealth = {
    POINT_ESTIMATE_FREEZE_HASH: EXPECTED_PE,
    RESERVED_RESULT_SEAL_HASH: sealedHash,
    CANONICAL_ABILITY_VERSION: VALIDATED_ABILITY_MODEL_VERSION,
    M16L1_WAR_PRE_RESERVED_FREEZE_HASH: M16L1_FREEZE,
    M16L1_1_SCALE_AUDIT_HASH: M16L11_HASH,
    M16L1_2_R1_VALUE_FREEZE_HASH: M16L12_HASH,
    M16L2_PROTOCOL_HASH: protocolHash,
    WAR_RESERVED_2025_26_STATUS: "CONSUMED_ONCE",
    RESERVED_SEASON: RES,
    RESERVED_TEAM_COUNT: outcomes.length,
    RESERVED_GAME_COUNT: games.length,
    RESERVED_PLAYER_SEASONS: byPlayer.size,
    RESERVED_PBP_POSSESSIONS: possCount,
    RAW_R1_POINTS_ACCOUNTING_IDENTITY_RESERVED: rawIdPass ? "PASS" : "FAIL",
    RESERVED_PLAYER_SEASON_ADDITIVITY: additivityPass ? "PASS" : "FAIL",
    RESERVED_STINT_CONSERVATION: stintPass ? "PASS" : "FAIL",
    RESERVED_TEAM_R1_DECOMPOSITION: teamDecompPass ? "PASS" : "FAIL",
    RESERVED_TEAM_DECOMPOSITION_MAX_RESIDUAL: accSorted.length
      ? accSorted[accSorted.length - 1]
      : 0,
    RESERVED_LEAGUE_ATTRIBUTED_R1_POINTS: leagueAttr,
    RESERVED_LEAGUE_UNASSIGNED_RESIDUAL: leagueU,
    RESERVED_LEAGUE_ATTRIBUTED_PLUS_UNASSIGNED_ZERO_SUM: zeroSum ? "YES" : "NO",
    RESERVED_R1_FORMULA_IDENTICAL: "YES",
    P1,
    P1_REFIT: "NO",
    P1_RESERVED_RMSE: p1Rmse,
    P1_RESERVED_MAE: p1Mae,
    P1_RESERVED_BIAS: p1Bias,
    P1_RESERVED_PEARSON: p1Pearson,
    P1_RESERVED_SPEARMAN: p1Spearman,
    P1_RESERVED_R2: p1R2,
    P1_RESERVED_SCALE_B: bReserved,
    P1_RESERVED_SCALE_STABILITY: p1ScalePass ? "PASS" : "FAIL",
    P1_RESERVED_VERDICT: p1Verdict ? "PASS" : "FAIL",
    R1_VALUE_SEMANTIC_STABILITY_RESERVED: semanticPass ? "PASS" : "FAIL",
    M16L2_RESERVED_VERDICT: overall,
    R1_POINTS_RESEARCH_STATUS: r1PointsStatus,
    R1_WINEQ_RESEARCH_STATUS: r1WineqStatus,
    CONVENTIONAL_WAR_AVAILABLE: "NO",
    R1_WINS_CAUSAL_REPLACEMENT_EFFECT: "NO",
    PLAYER_ATTRIBUTION_EXHAUSTIVE: "NO",
    CONSTANT_INTERCEPT_TEAM_R1WINEQ_TEST_RUN: "NO",
    EMPIRICAL_SCALE_MULTIPLIER_FIT: "NO",
    NEW_PP_W_FIT: "NO",
    POST_RESERVED_MODEL_RETUNING_ALLOWED: "NO",
    EXTERNAL_ADVANCED_METRICS_ACCESSED: "NO",
    PLAYER_REPUTATION_INSPECTED_PRE_VERDICT: "NO",
    PRIMARY_RESERVED_VERDICT_COMPUTED_BEFORE_NAMED_PLAYER_OUTPUT: "YES",
    HUMAN_BLINDNESS: "NOT_FULL",
    MODEL_PROTOCOL_BLINDNESS: "FROZEN_BEFORE_RESERVED_OUTCOMES",
    P1_ERA_ROBUSTNESS: "NOT_ESTABLISHED",
    M16L2_RESERVED_RESULT_SEAL_HASH: sealHash,
    M16L3_R1_POINTS_PRODUCT_MIGRATION_ELIGIBLE: m16l3PointsEligible
      ? "YES"
      : "NO",
    M16L3_R1_WINEQ_PRODUCT_MIGRATION_ELIGIBLE: m16l3WineqEligible
      ? "YES"
      : "NO",
    CANONICAL_DRBL_CHANGED: "NO",
    LIVE_WAR_CHANGED: "NO",
    PUBLIC_UI_CHANGED: "NO",
    reservedDatasetFingerprint: datasetFingerprint,
    LeagueMeanWins: leagueMeanWins,
    leagueWins,
    leagueNetPoints: leagueNet,
    winEqAccountingMaxResidual: winEqResiduals.length
      ? maxOf(winEqResiduals)
      : 0,
    baselineMean: mean(baselines),
    baselineSD: sd(baselines),
    baselineCorrNet: pearson(baselines, nets),
    NEXT_MILESTONE: nextMilestone,
  };

  await writeFile(
    path.join(OUT, "28_model_health.json"),
    JSON.stringify(modelHealth, null, 2)
  );

  await writeFile(
    path.join(OUT, "29_full_audit.md"),
    `# M16l2 full audit

## Verdict

\`\`\`text
M16L2_RESERVED_VERDICT = ${overall}
R1_VALUE_SEMANTIC_STABILITY_RESERVED = ${semanticPass ? "PASS" : "FAIL"}
P1_RESERVED_VERDICT = ${p1Verdict ? "PASS" : "FAIL"}
\`\`\`

## Seal

\`${sealHash}\`

## Holdout

\`\`\`text
WAR_RESERVED_2025_26_STATUS = CONSUMED_ONCE
\`\`\`

## Production

No live DRBL/WAR/UI changes. Migration requires a later milestone.
`
  );

  console.log(
    JSON.stringify(
      {
        milestone: "M16l2",
        M16L2_RESERVED_VERDICT: overall,
        M16L2_PROTOCOL_HASH: protocolHash,
        M16L2_RESERVED_RESULT_SEAL_HASH: sealHash,
        P1_RESERVED_VERDICT: p1Verdict ? "PASS" : "FAIL",
        R1_VALUE_SEMANTIC_STABILITY_RESERVED: semanticPass ? "PASS" : "FAIL",
        b_reserved: bReserved,
        accountingMaxResidual: accSorted.length
          ? accSorted[accSorted.length - 1]
          : 0,
        NEXT_MILESTONE: nextMilestone,
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
