/**
 * M16l1 — Frozen WAR rate-source + PPW development selection (no live WAR/DRBL change).
 * Development only: 2024-25. 2025-26 outcomes untouched.
 *   npm run drbl:m16l1
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { listSeasonGames } from "../drbl/download/season-games";
import { loadNormalizedGame } from "../drbl/evaluation/m16c-dataset";
import { pearson, spearman } from "../drbl/evaluation/metrics";
import { MINIMUM_ACTUAL_POSSESSIONS } from "../drbl/models/ranking-config";
import {
  VALIDATED_ABILITY_MODEL_VERSION,
  VALIDATED_K,
  computeValidatedAbilityV1,
} from "../drbl/models/validated-ability-v1";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m16l1");
const RAW = path.join(OUT, "raw");
const PRE = path.join(ROOT, "src", "data", "drbl", "precomputed");
const M16J = path.join(ROOT, "reports", "m16j");
const M16L0 = path.join(ROOT, "reports", "m16l0");
const M16L01 = path.join(ROOT, "reports", "m16l0_1");

const EXPECTED_PE =
  "942b21ef78ba0a142549f8a2b62338993e133f17b8bb1ff7b94fc8844ad9297c";
const EXPECTED_SEAL =
  "84f4eadccb536f058194acb4db730c044ea413036456e072952d89a64600d742";

const DEV_SEASON = "2024-25";
const HOLD_SEASON = "2025-26";
const P0 = 30;
const BOOT_N = 10_000;
const FLOAT_TOL = 1e-9;
const VALUE_TOL = 1e-6;

type Stint = {
  season: string;
  playerId: string;
  playerName: string;
  teamId: string;
  teamN: number;
  observedV: number;
};

type PlayerSeason = {
  season: string;
  playerId: string;
  playerName: string;
  seasonN: number;
  approachB: number;
  rawExact: number;
  validated: number;
  teamCount: number;
};

type TeamOutcome = {
  season: string;
  teamId: string;
  games: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  netPoints: number;
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
function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}
function rmse(errs: number[]): number {
  return Math.sqrt(mean(errs.map((e) => e * e)));
}
function mae(errs: number[]): number {
  return mean(errs.map((e) => Math.abs(e)));
}
function bias(errs: number[]): number {
  return mean(errs);
}
function r2(y: number[], pred: number[]): number {
  const m = mean(y);
  const ssTot = y.reduce((s, yi) => s + (yi - m) ** 2, 0);
  const ssRes = y.reduce((s, yi, i) => s + (yi - pred[i]!) ** 2, 0);
  return ssTot > 0 ? 1 - ssRes / ssTot : NaN;
}
function sha256(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}
function assertNoHoldout(season: string, ctx: string): void {
  if (season === HOLD_SEASON) {
    throw new Error(`STOP WAR_RESERVED_TARGET_METRICS_ACCESSED via ${ctx}`);
  }
}

/** Mulberry32 PRNG for reproducible bootstrap. */
function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function olsThroughIntercept(
  x: number[],
  y: number[]
): { a: number; b: number } {
  const n = x.length;
  const mx = mean(x);
  const my = mean(y);
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (x[i]! - mx) * (x[i]! - mx);
    sxy += (x[i]! - mx) * (y[i]! - my);
  }
  const b = sxx > 0 ? sxy / sxx : NaN;
  const a = my - b * mx;
  return { a, b };
}

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

function buildPlayerSeasons(stints: Stint[]): PlayerSeason[] {
  const by = new Map<
    string,
    {
      season: string;
      playerId: string;
      playerName: string;
      seasonN: number;
      approachB: number;
      teams: Set<string>;
    }
  >();
  for (const s of stints) {
    const k = `${s.season}::${s.playerId}`;
    let r = by.get(k);
    if (!r) {
      r = {
        season: s.season,
        playerId: s.playerId,
        playerName: s.playerName,
        seasonN: 0,
        approachB: 0,
        teams: new Set(),
      };
      by.set(k, r);
    }
    r.seasonN += s.teamN;
    r.approachB += s.observedV;
    r.teams.add(s.teamId);
    if (s.playerName) r.playerName = s.playerName;
  }
  return [...by.values()].map((r) => {
    const rawExact = r.seasonN > 0 ? (100 * r.approachB) / r.seasonN : NaN;
    const validated = computeValidatedAbilityV1({
      rawAbilityRate: rawExact,
      actualCombinedPossessionAppearances: r.seasonN,
    }).validatedDRBL100;
    return {
      season: r.season,
      playerId: r.playerId,
      playerName: r.playerName,
      seasonN: r.seasonN,
      approachB: r.approachB,
      rawExact,
      validated,
      teamCount: r.teams.size,
    };
  });
}

async function buildDevTeamOutcomes(season: string): Promise<TeamOutcome[]> {
  assertNoHoldout(season, "buildDevTeamOutcomes");
  const metas = await listSeasonGames(season);
  const acc = new Map<
    string,
    {
      games: number;
      wins: number;
      losses: number;
      pointsFor: number;
      pointsAgainst: number;
    }
  >();
  for (const meta of metas) {
    const g = await loadNormalizedGame(season, meta.gameId);
    if (!g) continue;
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
      let r = acc.get(teamId);
      if (!r) {
        r = { games: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 };
        acc.set(teamId, r);
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
  return [...acc.entries()]
    .map(([teamId, r]) => ({
      season,
      teamId,
      games: r.games,
      wins: r.wins,
      losses: r.losses,
      pointsFor: r.pointsFor,
      pointsAgainst: r.pointsAgainst,
      netPoints: r.pointsFor - r.pointsAgainst,
    }))
    .sort((a, b) => a.teamId.localeCompare(b.teamId));
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
    throw new Error("STOP M16L1_DRBL_PROVENANCE_DRIFT");
  }

  const m16l0 = JSON.parse(
    await readFile(path.join(M16L0, "21_model_health.json"), "utf8")
  ) as Record<string, string>;
  const m16l01 = JSON.parse(
    await readFile(path.join(M16L01, "30_model_health.json"), "utf8")
  ) as Record<string, string>;
  const m16l01Ready = JSON.parse(
    await readFile(path.join(M16L01, "29_readiness_decision.json"), "utf8")
  ) as Record<string, string>;

  const structOk =
    m16l01.TEAM_STINT_VALUE_ALLOCATION_AVAILABLE === "YES" &&
    m16l01.TEAM_ATTRIBUTION_ADDITIVITY_STATUS ===
      "PASS_INDEPENDENT_REFERENCE" &&
    m16l01Ready.M16L1_WAR_BAKEOFF_READY === "YES" &&
    m16l01.STINT_LEVEL_POSTERIOR_REFIT === "NO" &&
    m16l01.WAR_ESTIMATION_UNIT === "PLAYER_SEASON" &&
    m16l01.TEAM_VALIDATION_ALLOCATION_UNIT === "PLAYER_TEAM_SEASON" &&
    m16l01.W0_ALLOCATION_CONSERVATION === "PASS" &&
    m16l01.W1_ALLOCATION_CONSERVATION === "PASS";

  if (
    m16l0.WAR_SEMANTIC_SPEC_FROZEN !== "YES" ||
    m16l0.WAR_EXPOSURE_DENOMINATOR !== "COMBINED_APPEARANCE_POSSESSIONS" ||
    m16l0.PLAYER_LEVEL_ZERO_IS_REPLACEMENT !== "YES" ||
    m16l0.ADDITIONAL_PLAYER_REPLACEMENT_SUBTRACTION !== "NO" ||
    !structOk
  ) {
    throw new Error("STOP M16L1_PREREQUISITE_DRIFT");
  }

  const boardDev = JSON.parse(
    await readFile(path.join(PRE, `${DEV_SEASON}.json`), "utf8")
  ) as {
    players: Array<{
      playerId: string;
      playerName?: string;
      possessions?: number;
      actualPossessions?: number;
      combinedPossessionAppearances?: number;
      rawAbilityRate?: number;
      drbl100?: number;
    }>;
    warFormulaVersion?: string;
    abilityModelVersion?: string;
  };
  const boardHold = JSON.parse(
    await readFile(path.join(PRE, `${HOLD_SEASON}.json`), "utf8")
  ) as { warFormulaVersion?: string; players: unknown[] };

  await writeFile(
    path.join(OUT, "00_freeze.json"),
    JSON.stringify(
      {
        milestone: "M16l1",
        timestamp,
        gitCommit,
        gitDirty: dirty,
        POINT_ESTIMATE_FREEZE_HASH: EXPECTED_PE,
        RESERVED_RESULT_SEAL_HASH: sealedHash,
        canonicalAbilityVersion: VALIDATED_ABILITY_MODEL_VERSION,
        M16L0_WAR_SEMANTIC_SPEC_FROZEN: "YES",
        M16L0_1_TEAM_STINT_AVAILABLE: "YES",
        M16L0_1_ADDITIVITY: "PASS_INDEPENDENT_REFERENCE",
        CURRENT_WAR_VERSION_2024_25: boardDev.warFormulaVersion ?? "4.0.1",
        CURRENT_WAR_VERSION_2025_26:
          boardHold.warFormulaVersion ?? "provisional_raw_ppw30",
        WAR_RESERVED_2025_26: "ELIGIBLE_WITH_HUMAN_BLINDNESS_LIMITATION",
        WAR_DEVELOPMENT_SEASONS: [DEV_SEASON],
        LIVE_WAR_CHANGED: false,
        PRODUCTION_DRBL_CHANGED: false,
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
        canonicalDRBL: `N/(N+${VALIDATED_K})*rawAbilityRate`,
        exposure: "COMBINED_APPEARANCE_POSSESSIONS",
        zero: "R1",
        additionalReplacementSubtraction: "NO",
        WAR_ESTIMATION_UNIT: "PLAYER_SEASON",
        TEAM_VALIDATION_ALLOCATION_UNIT: "PLAYER_TEAM_SEASON",
        W0: "rawAbilityRate*teamN/100",
        W1: "validatedDRBL100*teamN/100",
        STINT_LEVEL_POSTERIOR_REFIT: "NO",
        TEAM_ATTRIBUTION_ADDITIVITY_STATUS: "PASS_INDEPENDENT_REFERENCE",
        M16L0_REPRODUCED: "PASS",
        M16L0_1_REPRODUCED: "PASS",
      },
      null,
      2
    )
  );

  // ---- Load stints (both seasons for universe recon; outcomes only DEV) ----
  const allStints = parseStints(
    await readFile(path.join(M16L01, "06_player_team_season_stints.csv"), "utf8")
  );
  const allPlayers = buildPlayerSeasons(allStints);
  const devStints = allStints.filter((s) => s.season === DEV_SEASON);
  const holdStints = allStints.filter((s) => s.season === HOLD_SEASON);
  const devPlayers = allPlayers.filter((p) => p.season === DEV_SEASON);
  const holdPlayers = allPlayers.filter((p) => p.season === HOLD_SEASON);

  // Accounting universe reconciliation (both seasons audited + product)
  const reconRows: Record<string, unknown>[] = [];
  let unexplained = 0;
  for (const season of [DEV_SEASON, HOLD_SEASON] as const) {
    const board = JSON.parse(
      await readFile(path.join(PRE, `${season}.json`), "utf8")
    ) as {
      players: Array<{
        playerId: string;
        combinedPossessionAppearances?: number;
        actualPossessions?: number;
        possessions?: number;
        rawAbilityRate?: number;
        drbl100?: number;
      }>;
    };
    const acc = allPlayers.filter((p) => p.season === season);
    const pubIds = new Set(board.players.map((p) => p.playerId));
    const accIds = new Set(acc.map((p) => p.playerId));
    for (const p of acc) {
      if (pubIds.has(p.playerId)) continue;
      let classification = "OTHER";
      let reason = "";
      if (p.seasonN < MINIMUM_ACTUAL_POSSESSIONS) {
        classification = "LOW_EXPOSURE_PLAYER";
        reason = `seasonN=${p.seasonN} < public minimumActualPossessions=${MINIMUM_ACTUAL_POSSESSIONS}`;
      } else if (
        Number.isFinite(p.rawExact) &&
        Number.isFinite(p.validated) &&
        p.seasonN > 0
      ) {
        classification = "VALID_PBP_PLAYER_NOT_ON_PUBLIC_BOARD";
        reason = "valid WAR accounting input absent from public board";
      } else {
        classification = "INVALID_ESTIMATE";
        reason = "non-finite rate";
        unexplained += 1;
      }
      reconRows.push({
        season,
        playerId: p.playerId,
        N: p.seasonN,
        teamCount: p.teamCount,
        rawRateFinite: Number.isFinite(p.rawExact),
        validatedRateFinite: Number.isFinite(p.validated),
        metadataAvailable: false,
        classification,
        reason,
        setDiff: "A-B",
      });
    }
    for (const bp of board.players) {
      if (accIds.has(bp.playerId)) continue;
      unexplained += 1;
      reconRows.push({
        season,
        playerId: bp.playerId,
        N:
          bp.combinedPossessionAppearances ??
          bp.actualPossessions ??
          bp.possessions ??
          "",
        teamCount: "",
        rawRateFinite: Number.isFinite(Number(bp.rawAbilityRate)),
        validatedRateFinite: Number.isFinite(Number(bp.drbl100)),
        metadataAvailable: true,
        classification: "OTHER",
        reason: "public board player missing from stint accounting",
        setDiff: "B-A",
      });
    }
  }
  if (unexplained > 0) {
    throw new Error("STOP UNEXPLAINED_ACCOUNTING_UNIVERSE_ROWS");
  }
  await writeFile(
    path.join(OUT, "02_accounting_universe_reconciliation.csv"),
    toCsv(
      reconRows.length
        ? reconRows
        : [
            {
              season: "",
              playerId: "",
              classification: "NONE",
              reason: "empty_diff",
            },
          ]
    )
  );

  const warAccountingN = allPlayers.length;
  const publicN = boardDev.players.length + boardHold.players.length;

  await writeFile(
    path.join(OUT, "03_war_accounting_universe_contract.md"),
    `# WAR accounting universe contract

\`\`\`text
hasValidWarAccountingInput(row) iff:
  finite full-precision rawAbilityRateExact
  AND finite validatedDRBL100
  AND seasonN > 0
  AND >=1 valid team stint
  AND sum(teamN) == seasonN
\`\`\`

\`\`\`text
WAR_TEAM_AGGREGATION_USES_PUBLIC_DISPLAY_UNIVERSE = NO
WAR_TEAM_AGGREGATION_USES_500_MINUTE_RULE = NO
\`\`\`

Public product board uses \`minimumActualPossessions=${MINIMUM_ACTUAL_POSSESSIONS}\` for display eligibility.
WAR accounting includes low-exposure PBP players with N>0.
`
  );

  // ---- Development team outcomes (2024-25 only) ----
  console.log("Building 2024-25 team outcomes…");
  const outcomes = await buildDevTeamOutcomes(DEV_SEASON);
  if (outcomes.length !== 30) {
    throw new Error(`Expected 30 teams, got ${outcomes.length}`);
  }
  await writeFile(
    path.join(OUT, "04_development_team_outcomes.csv"),
    toCsv(outcomes as unknown as Record<string, unknown>[])
  );
  const leagueNet = outcomes.reduce((s, t) => s + t.netPoints, 0);
  const leagueWins = outcomes.reduce((s, t) => s + t.wins, 0);

  // ---- Team point candidates ----
  const playerById = new Map(devPlayers.map((p) => [p.playerId, p]));
  const teamW0 = new Map<string, number>();
  const teamW1 = new Map<string, number>();
  const teamExposure = new Map<string, number>();
  const teamPlayerCount = new Map<string, number>();

  for (const st of devStints) {
    const ps = playerById.get(st.playerId);
    if (!ps || !(ps.seasonN > 0)) continue;
    if (!Number.isFinite(ps.rawExact) || !Number.isFinite(ps.validated)) {
      throw new Error(`Invalid rates for ${st.playerId}`);
    }
    const w0 = (ps.rawExact * st.teamN) / 100;
    const w1 = (ps.validated * st.teamN) / 100;
    teamW0.set(st.teamId, (teamW0.get(st.teamId) ?? 0) + w0);
    teamW1.set(st.teamId, (teamW1.get(st.teamId) ?? 0) + w1);
    teamExposure.set(st.teamId, (teamExposure.get(st.teamId) ?? 0) + st.teamN);
    teamPlayerCount.set(
      st.teamId,
      (teamPlayerCount.get(st.teamId) ?? 0) + 1
    );
  }

  const candRows = outcomes.map((t) => ({
    season: t.season,
    teamId: t.teamId,
    W0TeamPoints: teamW0.get(t.teamId) ?? 0,
    W1TeamPoints: teamW1.get(t.teamId) ?? 0,
    teamTotalPlayerAppearanceExposure: teamExposure.get(t.teamId) ?? 0,
    playerStintRows: teamPlayerCount.get(t.teamId) ?? 0,
    netPoints: t.netPoints,
    wins: t.wins,
  }));
  await writeFile(
    path.join(OUT, "05_development_candidate_team_points.csv"),
    toCsv(candRows)
  );

  const sumW0Team = [...teamW0.values()].reduce((a, b) => a + b, 0);
  const sumW1Team = [...teamW1.values()].reduce((a, b) => a + b, 0);
  const sumW0Player = devPlayers.reduce(
    (s, p) => s + (p.rawExact * p.seasonN) / 100,
    0
  );
  const sumW1Player = devPlayers.reduce(
    (s, p) => s + (p.validated * p.seasonN) / 100,
    0
  );
  const w0AccRes = Math.abs(sumW0Team - sumW0Player);
  const w1AccRes = Math.abs(sumW1Team - sumW1Player);
  if (w0AccRes > VALUE_TOL || w1AccRes > VALUE_TOL) {
    throw new Error("STOP TEAM_POINT_ACCOUNTING_FAILURE");
  }
  await writeFile(
    path.join(OUT, "06_team_point_accounting.json"),
    JSON.stringify(
      {
        sumW0Team,
        sumW0Player,
        w0Residual: w0AccRes,
        sumW1Team,
        sumW1Player,
        w1Residual: w1AccRes,
        W0_TEAM_POINT_ACCOUNTING: "PASS",
        W1_TEAM_POINT_ACCOUNTING: "PASS",
      },
      null,
      2
    )
  );

  // ---- Decision A: rate source LOO fixed slope 1 ----
  type TeamRow = {
    teamId: string;
    netPoints: number;
    wins: number;
    w0: number;
    w1: number;
  };
  const teams: TeamRow[] = candRows.map((r) => ({
    teamId: r.teamId,
    netPoints: r.netPoints,
    wins: r.wins,
    w0: r.W0TeamPoints,
    w1: r.W1TeamPoints,
  }));

  const foldRows: Record<string, unknown>[] = [];
  const predW0: number[] = [];
  const predW1: number[] = [];
  const yNet: number[] = [];
  const errW0: number[] = [];
  const errW1: number[] = [];

  for (let h = 0; h < teams.length; h++) {
    const hold = teams[h]!;
    const train = teams.filter((_, i) => i !== h);
    const a0 = mean(train.map((t) => t.netPoints - t.w0));
    const a1 = mean(train.map((t) => t.netPoints - t.w1));
    const p0 = a0 + hold.w0;
    const p1 = a1 + hold.w1;
    predW0.push(p0);
    predW1.push(p1);
    yNet.push(hold.netPoints);
    errW0.push(hold.netPoints - p0);
    errW1.push(hold.netPoints - p1);
    foldRows.push({
      fold: h,
      heldOutTeamId: hold.teamId,
      actualNetPoints: hold.netPoints,
      W0TeamPoints: hold.w0,
      W1TeamPoints: hold.w1,
      a_W0: a0,
      a_W1: a1,
      predW0: p0,
      predW1: p1,
      errW0: hold.netPoints - p0,
      errW1: hold.netPoints - p1,
    });
  }
  await writeFile(path.join(OUT, "07_rate_source_fold_rows.csv"), toCsv(foldRows));

  const w0Metrics = {
    RMSE: rmse(errW0),
    MAE: mae(errW0),
    bias: bias(errW0),
    Pearson: pearson(predW0, yNet),
    Spearman: spearman(predW0, yNet),
    R2: r2(yNet, predW0),
    predictionSD: sd(predW0),
    targetSD: sd(yNet),
    interceptMean: mean(foldRows.map((r) => Number(r.a_W0))),
    interceptSD: sd(foldRows.map((r) => Number(r.a_W0))),
  };
  const w1Metrics = {
    RMSE: rmse(errW1),
    MAE: mae(errW1),
    bias: bias(errW1),
    Pearson: pearson(predW1, yNet),
    Spearman: spearman(predW1, yNet),
    R2: r2(yNet, predW1),
    predictionSD: sd(predW1),
    targetSD: sd(yNet),
    interceptMean: mean(foldRows.map((r) => Number(r.a_W1))),
    interceptSD: sd(foldRows.map((r) => Number(r.a_W1))),
  };
  await writeFile(
    path.join(OUT, "08_rate_source_metrics.json"),
    JSON.stringify(
      {
        protocol: "LOO fixed-slope-1 netPoints = a + candidateTeamPoints",
        W0: w0Metrics,
        W1: w1Metrics,
        deltaRMSE_W1_minus_W0: w1Metrics.RMSE - w0Metrics.RMSE,
        relativeW1Improvement:
          (w0Metrics.RMSE - w1Metrics.RMSE) / w0Metrics.RMSE,
      },
      null,
      2
    )
  );

  const free0 = olsThroughIntercept(
    teams.map((t) => t.w0),
    teams.map((t) => t.netPoints)
  );
  const free1 = olsThroughIntercept(
    teams.map((t) => t.w1),
    teams.map((t) => t.netPoints)
  );
  const freePred0 = teams.map((t) => free0.a + free0.b * t.w0);
  const freePred1 = teams.map((t) => free1.a + free1.b * t.w1);
  await writeFile(
    path.join(OUT, "09_rate_source_free_slope.json"),
    JSON.stringify(
      {
        W0: {
          intercept: free0.a,
          b: free0.b,
          RMSE: rmse(teams.map((t, i) => t.netPoints - freePred0[i]!)),
          R2: r2(
            teams.map((t) => t.netPoints),
            freePred0
          ),
        },
        W1: {
          intercept: free1.a,
          b: free1.b,
          RMSE: rmse(teams.map((t, i) => t.netPoints - freePred1[i]!)),
          R2: r2(
            teams.map((t) => t.netPoints),
            freePred1
          ),
        },
        FREE_SLOPE_TEAM_REGRESSION_USED_TO_RECALIBRATE_DRBL: "NO",
      },
      null,
      2
    )
  );

  // Bootstrap paired on LOO errors
  const rng = mulberry32(0x4d31366c); // 'M16l'
  const deltas: number[] = [];
  let w1Wins = 0;
  let w0Wins = 0;
  for (let b = 0; b < BOOT_N; b++) {
    const idx: number[] = [];
    for (let i = 0; i < teams.length; i++) {
      idx.push(Math.floor(rng() * teams.length));
    }
    const e0 = idx.map((i) => errW0[i]!);
    const e1 = idx.map((i) => errW1[i]!);
    const d = rmse(e1) - rmse(e0);
    deltas.push(d);
    if (d < 0) w1Wins += 1;
    else if (d > 0) w0Wins += 1;
  }
  deltas.sort((a, b) => a - b);
  const ciLo = deltas[Math.floor(0.025 * BOOT_N)]!;
  const ciHi = deltas[Math.floor(0.975 * BOOT_N)]!;
  const pW1Beats = w1Wins / BOOT_N;
  const pW0Beats = w0Wins / BOOT_N;
  let teamsW1Better = 0;
  let teamsW0Better = 0;
  for (let i = 0; i < teams.length; i++) {
    if (Math.abs(errW1[i]!) < Math.abs(errW0[i]!)) teamsW1Better += 1;
    else if (Math.abs(errW0[i]!) < Math.abs(errW1[i]!)) teamsW0Better += 1;
  }
  await writeFile(
    path.join(OUT, "10_rate_source_bootstrap.json"),
    JSON.stringify(
      {
        replicates: BOOT_N,
        meanDelta: mean(deltas),
        medianDelta: deltas[Math.floor(BOOT_N / 2)],
        ci95: [ciLo, ciHi],
        P_W1_beats_W0: pW1Beats,
        P_W0_beats_W1: pW0Beats,
        teamsLowerAbsError_W1: teamsW1Better,
        teamsLowerAbsError_W0: teamsW0Better,
        independenceNote:
          "NBA team-seasons are not fully independent because teams play one another.",
      },
      null,
      2
    )
  );

  const relW1Imp = (w0Metrics.RMSE - w1Metrics.RMSE) / w0Metrics.RMSE;
  const relW0Imp = (w1Metrics.RMSE - w0Metrics.RMSE) / w1Metrics.RMSE;
  let rateDecision:
    | "W1_EMPIRICAL_WIN"
    | "W0_EMPIRICAL_WIN"
    | "W1_SEMANTIC_TIEBREAKER"
    | "RATE_SOURCE_SELECTION_BLOCKED" = "W1_SEMANTIC_TIEBREAKER";
  let rateStrength: "EMPIRICAL_STRONG" | "SEMANTIC_TIEBREAKER" | "BLOCKED" =
    "SEMANTIC_TIEBREAKER";
  let selectedRate: "W0" | "W1" = "W1";
  let rateReason = "";

  const w1Empirical =
    relW1Imp >= 0.01 &&
    pW1Beats >= 0.95 &&
    w1Metrics.MAE <= w0Metrics.MAE &&
    free1.b > 0;
  const w0Empirical =
    relW0Imp >= 0.01 &&
    pW0Beats >= 0.95 &&
    w0Metrics.MAE <= w1Metrics.MAE;

  if (w1Empirical) {
    rateDecision = "W1_EMPIRICAL_WIN";
    rateStrength = "EMPIRICAL_STRONG";
    selectedRate = "W1";
    rateReason = "W1 cleared empirical strong gates vs W0 on LOO fixed-slope net points";
  } else if (w0Empirical) {
    rateDecision = "W0_EMPIRICAL_WIN";
    rateStrength = "EMPIRICAL_STRONG";
    selectedRate = "W0";
    rateReason = "W0 cleared empirical strong gates vs W1 on LOO fixed-slope net points";
  } else {
    rateDecision = "W1_SEMANTIC_TIEBREAKER";
    rateStrength = "SEMANTIC_TIEBREAKER";
    selectedRate = "W1";
    rateReason =
      "No empirical strong win; WAR estimand is ESTIMATED season impact so W1 (validated posterior) is semantic tiebreaker";
  }

  await writeFile(
    path.join(OUT, "11_rate_source_decision.json"),
    JSON.stringify(
      {
        RATE_SOURCE_DECISION: rateDecision,
        SELECTED_RATE_SOURCE: selectedRate,
        RATE_SOURCE_SELECTION_STRENGTH: rateStrength,
        gates: {
          relW1Imp,
          relW0Imp,
          pW1Beats,
          pW0Beats,
          w1MAE: w1Metrics.MAE,
          w0MAE: w0Metrics.MAE,
          w1FreeSlopeB: free1.b,
          w1Empirical,
          w0Empirical,
        },
        reason: rateReason,
      },
      null,
      2
    )
  );

  // ---- PPW identifiability ----
  const pv = teams.map((t) =>
    selectedRate === "W1" ? t.w1 : t.w0
  ); // for numeric proof use W1 points as PointValue stand-in
  const warP0 = pv.map((v) => v / P0);
  const warP1demo = pv.map((v) => v / 35); // arbitrary positive PPW for algebra demo
  const demoRatio = P0 / 35;
  const freeP0 = olsThroughIntercept(warP0, teams.map((t) => t.wins));
  const freeP1d = olsThroughIntercept(warP1demo, teams.map((t) => t.wins));
  const predFreeP0 = warP0.map((w) => freeP0.a + freeP0.b * w);
  const predFreeP1d = warP1demo.map((w) => freeP1d.a + freeP1d.b * w);
  const predDiffMax = Math.max(
    ...predFreeP0.map((p, i) => Math.abs(p - predFreeP1d[i]!))
  );
  const bRatioOk =
    Math.abs(freeP1d.b * demoRatio - freeP0.b) < 1e-9 ||
    Math.abs(freeP1d.b - freeP0.b / demoRatio) < 1e-6;

  await writeFile(
    path.join(OUT, "12_ppw_identifiability_proof.md"),
    `# PPW identifiability proof

## Algebra

\`\`\`text
WAR_P1 = PointValue / P1
WAR_P0 = PointValue / P0
⇒ WAR_P1 = (P0/P1) * WAR_P0
\`\`\`

Free-slope regression \`Wins = a + b*WAR + e\` absorbs the scale:

\`\`\`text
b_P1 = (P1/P0) * b_P0
\`\`\`

Therefore free-slope RMSE/R²/Pearson/Spearman cannot identify PPW.

## Numerical check (development)

Using PointValue = selected candidate team points and demo P1=35 vs P0=30:

- max |pred_free_P0 - pred_free_P1| = ${predDiffMax}
- free-slope b rescaling check: ${bRatioOk ? "PASS" : "FAIL"}

\`\`\`text
FREE_SLOPE_PPW_IDENTIFIABILITY = NOT_IDENTIFIABLE
FREE_SLOPE_REGRESSION_USED_TO_SELECT_PPW = NO
\`\`\`
`
  );

  // ---- Decision B: PPW from Wins ~ NetPoints ----
  const ppwFolds: Record<string, unknown>[] = [];
  const predP0: number[] = [];
  const predP1: number[] = [];
  const yWins: number[] = [];
  const errP0: number[] = [];
  const errP1: number[] = [];
  const p1Folds: number[] = [];
  const cFolds: number[] = [];
  const alphaFolds: number[] = [];
  let allCPositive = true;

  for (let h = 0; h < teams.length; h++) {
    const hold = teams[h]!;
    const train = teams.filter((_, i) => i !== h);
    const fit = olsThroughIntercept(
      train.map((t) => t.netPoints),
      train.map((t) => t.wins)
    );
    if (!(fit.b > 0)) allCPositive = false;
    const p1Fold = 1 / fit.b;
    cFolds.push(fit.b);
    p1Folds.push(p1Fold);
    alphaFolds.push(fit.a);
    const pred1 = fit.a + hold.netPoints / p1Fold;
    const aP0 = mean(train.map((t) => t.wins - t.netPoints / P0));
    const pred0 = aP0 + hold.netPoints / P0;
    predP0.push(pred0);
    predP1.push(pred1);
    yWins.push(hold.wins);
    errP0.push(hold.wins - pred0);
    errP1.push(hold.wins - pred1);
    ppwFolds.push({
      fold: h,
      heldOutTeamId: hold.teamId,
      actualWins: hold.wins,
      netPoints: hold.netPoints,
      alpha_fold: fit.a,
      c_fold: fit.b,
      P1_fold: p1Fold,
      alpha_P0: aP0,
      predWins_P0: pred0,
      predWins_P1: pred1,
      errP0: hold.wins - pred0,
      errP1: hold.wins - pred1,
    });
  }
  await writeFile(path.join(OUT, "13_ppw_fold_rows.csv"), toCsv(ppwFolds));

  const fullP1Fit = olsThroughIntercept(
    teams.map((t) => t.netPoints),
    teams.map((t) => t.wins)
  );
  const fullP1 = 1 / fullP1Fit.b;
  const p1Mean = mean(p1Folds);
  const p1Sd = sd(p1Folds);
  const p1Cv = p1Mean > 0 ? p1Sd / p1Mean : Infinity;

  const p0M = {
    RMSE: rmse(errP0),
    MAE: mae(errP0),
    bias: bias(errP0),
    R2: r2(yWins, predP0),
  };
  const p1M = {
    RMSE: rmse(errP1),
    MAE: mae(errP1),
    bias: bias(errP1),
    R2: r2(yWins, predP1),
  };

  await writeFile(
    path.join(OUT, "14_ppw_metrics.json"),
    JSON.stringify(
      {
        P0: p0M,
        P1: p1M,
        fullDevelopment: { c: fullP1Fit.b, alpha: fullP1Fit.a, P1: fullP1 },
        fold: {
          P1_min: Math.min(...p1Folds),
          P1_max: Math.max(...p1Folds),
          P1_mean: p1Mean,
          P1_SD: p1Sd,
          P1_CV: p1Cv,
          alpha_min: Math.min(...alphaFolds),
          alpha_max: Math.max(...alphaFolds),
          all_c_positive: allCPositive,
        },
      },
      null,
      2
    )
  );

  const rng2 = mulberry32(0x50505731); // PPW1
  const ppwDeltas: number[] = [];
  let p1Beat = 0;
  let p0Beat = 0;
  for (let b = 0; b < BOOT_N; b++) {
    const idx: number[] = [];
    for (let i = 0; i < teams.length; i++) idx.push(Math.floor(rng2() * teams.length));
    const d = rmse(idx.map((i) => errP1[i]!)) - rmse(idx.map((i) => errP0[i]!));
    ppwDeltas.push(d);
    if (d < 0) p1Beat += 1;
    else if (d > 0) p0Beat += 1;
  }
  ppwDeltas.sort((a, b) => a - b);
  const ppwCi: [number, number] = [
    ppwDeltas[Math.floor(0.025 * BOOT_N)]!,
    ppwDeltas[Math.floor(0.975 * BOOT_N)]!,
  ];
  const pP1Beats = p1Beat / BOOT_N;
  await writeFile(
    path.join(OUT, "15_ppw_bootstrap.json"),
    JSON.stringify(
      {
        replicates: BOOT_N,
        meanDelta: mean(ppwDeltas),
        ci95: ppwCi,
        P_P1_beats_P0: pP1Beats,
        P_P0_beats_P1: p0Beat / BOOT_N,
      },
      null,
      2
    )
  );

  const relP1Imp = (p0M.RMSE - p1M.RMSE) / p0M.RMSE;
  const stabilityPass =
    allCPositive &&
    p1Cv <= 0.15 &&
    Number.isFinite(fullP1) &&
    fullP1 > 0 &&
    p1M.RMSE <= 1.005 * p0M.RMSE;
  const strongP1 = stabilityPass && relP1Imp >= 0.01 && pP1Beats >= 0.9;

  let ppwDecision:
    | "P1_EMPIRICALLY_SUPPORTED"
    | "P1_SEMANTIC_UNIT_CONVERSION_SELECTED"
    | "P0_RETAINED_P1_FAILED"
    | "PPW_SELECTION_BLOCKED";
  let selectedPpw: "P0" | "P1";
  let finalPpw: number;
  let ppwReason: string;

  if (!stabilityPass) {
    ppwDecision = "P0_RETAINED_P1_FAILED";
    selectedPpw = "P0";
    finalPpw = P0;
    ppwReason = `P1 failed stability/noninferiority (CV=${p1Cv}, RMSE ratio=${p1M.RMSE / p0M.RMSE}, allCPositive=${allCPositive})`;
  } else if (strongP1) {
    ppwDecision = "P1_EMPIRICALLY_SUPPORTED";
    selectedPpw = "P1";
    finalPpw = fullP1;
    ppwReason = "P1 stable and cleared strong empirical improvement gates";
  } else {
    ppwDecision = "P1_SEMANTIC_UNIT_CONVERSION_SELECTED";
    selectedPpw = "P1";
    finalPpw = fullP1;
    ppwReason =
      "P1 stable/noninferior; selected as direct net-points→wins unit conversion vs provisional 30";
  }

  await writeFile(
    path.join(OUT, "16_ppw_decision.json"),
    JSON.stringify(
      {
        PPW_DECISION: ppwDecision,
        SELECTED_PPW_SOURCE: selectedPpw,
        FINAL_DEVELOPMENT_PPW: finalPpw,
        stabilityPass,
        strongP1,
        relP1Imp,
        pP1Beats,
        reason: ppwReason,
      },
      null,
      2
    )
  );

  const fitHash = sha256(
    JSON.stringify({
      alpha: fullP1Fit.a,
      c: fullP1Fit.b,
      P1: fullP1,
      seasons: [DEV_SEASON],
      teamN: teams.length,
      source: "Wins = alpha + c*NetPoints",
    })
  );
  await writeFile(
    path.join(OUT, "17_final_ppw_fit.json"),
    JSON.stringify(
      {
        SELECTED_PPW_SOURCE: selectedPpw,
        FINAL_DEVELOPMENT_PPW: finalPpw,
        ...(selectedPpw === "P1"
          ? {
              alpha: fullP1Fit.a,
              c: fullP1Fit.b,
              PPW: fullP1,
              developmentSeasons: [DEV_SEASON],
              teamN: teams.length,
              fitHash,
            }
          : { PPW: 30, note: "P0 retained" }),
        frozen: true,
        refitAfterReservedForbidden: true,
      },
      null,
      2
    )
  );

  // ---- Final research WAR on development ----
  const rateOf = (p: PlayerSeason) =>
    selectedRate === "W1" ? p.validated : p.rawExact;

  const playerWar = devPlayers.map((p) => {
    const rate = rateOf(p);
    const pts = (rate * p.seasonN) / 100;
    return {
      season: p.season,
      playerId: p.playerId,
      playerName: p.playerName,
      selectedRateSource: selectedRate,
      selectedRate: rate,
      N: p.seasonN,
      seasonPointValue: pts,
      PPW: finalPpw,
      WAR: pts / finalPpw,
      researchWarModelVersion: "drbl-war-r1-v1",
    };
  });

  const teamWarMap = new Map<string, number>();
  const teamPtsMap = new Map<string, number>();
  for (const st of devStints) {
    const ps = playerById.get(st.playerId)!;
    const rate = rateOf(ps);
    const pts = (rate * st.teamN) / 100;
    const war = pts / finalPpw;
    teamPtsMap.set(st.teamId, (teamPtsMap.get(st.teamId) ?? 0) + pts);
    teamWarMap.set(st.teamId, (teamWarMap.get(st.teamId) ?? 0) + war);
  }

  // Conservation player WAR vs team WAR
  const sumPlayerWar = playerWar.reduce((s, p) => s + p.WAR, 0);
  const sumTeamWar = [...teamWarMap.values()].reduce((a, b) => a + b, 0);
  if (Math.abs(sumPlayerWar - sumTeamWar) > 1e-6) {
    throw new Error("STOP TEAM_WAR_ALLOCATION_CONSERVATION_FAIL");
  }

  // Fixed-slope wins diagnostic LOO
  const warFoldErr: number[] = [];
  const warFoldPred: number[] = [];
  const warIntercepts: number[] = [];
  for (let h = 0; h < teams.length; h++) {
    const hold = teams[h]!;
    const train = teams.filter((_, i) => i !== h);
    const tw = (t: TeamRow) => teamWarMap.get(t.teamId) ?? 0;
    const a = mean(train.map((t) => t.wins - tw(t)));
    warIntercepts.push(a);
    const pred = a + tw(hold);
    warFoldPred.push(pred);
    warFoldErr.push(hold.wins - pred);
  }
  const fixedWarDiag = {
    RMSE: rmse(warFoldErr),
    MAE: mae(warFoldErr),
    bias: bias(warFoldErr),
    R2: r2(
      teams.map((t) => t.wins),
      warFoldPred
    ),
    replacementTeamWinsInterceptMean: mean(warIntercepts),
    replacementTeamWinsInterceptSD: sd(warIntercepts),
  };

  const teamWarVec = teams.map((t) => teamWarMap.get(t.teamId) ?? 0);
  const freeWar = olsThroughIntercept(
    teamWarVec,
    teams.map((t) => t.wins)
  );
  const freeWarPred = teamWarVec.map((w) => freeWar.a + freeWar.b * w);
  const freeWarDiag = {
    intercept: freeWar.a,
    b: freeWar.b,
    RMSE: rmse(teams.map((t, i) => t.wins - freeWarPred[i]!)),
    R2: r2(
      teams.map((t) => t.wins),
      freeWarPred
    ),
    TEAM_WAR_FREE_SLOPE_USED_TO_RESCALE_SELECTED_WAR: "NO",
  };

  const teamWarValues = [...teamWarMap.values()];
  const leagueDiag = {
    leagueTotalWAR: sumTeamWar,
    meanTeamWAR: mean(teamWarValues),
    medianTeamWAR: [...teamWarValues].sort((a, b) => a - b)[
      Math.floor(teamWarValues.length / 2)
    ],
    minTeamWAR: Math.min(...teamWarValues),
    maxTeamWAR: Math.max(...teamWarValues),
    teamWAR_SD: sd(teamWarValues),
    replacementTeamWinsIntercept: fixedWarDiag.replacementTeamWinsInterceptMean,
    LEAGUE_TOTAL_WAR_TARGET_IMPOSED: "NO",
  };

  await writeFile(
    path.join(OUT, "18_2025_26_holdout_guard.json"),
    JSON.stringify(
      {
        WAR_RESERVED_2025_26: "ELIGIBLE_WITH_HUMAN_BLINDNESS_LIMITATION",
        WAR_RESERVED_TARGET_METRICS_ACCESSED: "NO",
        WAR_SELECTION_USED_2025_26: "NO",
        PPW_FIT_USED_2025_26: "NO",
        holdStintRowsLoadedForStructureOnly: holdStints.length,
        holdOutcomeMetricsAccessed: false,
        asserts: "season != 2025-26 for all scoring/fitting routines",
      },
      null,
      2
    )
  );

  const finalFormula = `${selectedRate === "W1" ? "validatedDRBL100" : "rawAbilityRate"} * N / 100 / ${finalPpw}`;
  const freezeContract = {
    warModelVersion: "drbl-war-r1-v1",
    warRateSource: selectedRate,
    rateFormula:
      selectedRate === "W1"
        ? "validatedDRBL100 = N/(N+1600)*rawAbilityRate"
        : "rawAbilityRate = 100*ApproachBAttributedValue/N",
    rateVersion:
      selectedRate === "W1"
        ? VALIDATED_ABILITY_MODEL_VERSION
        : "raw-approach-b",
    warExposureSource: "actualCombinedPossessionAppearances",
    replacementSemantics: "R1_zero_no_additional_subtraction",
    teamAllocationRule: "selectedSeasonRate * teamN / 100 / PPW",
    pointsPerWinSource: selectedPpw,
    pointsPerWin: finalPpw,
    pointsPerWinVersion:
      selectedPpw === "P1" ? `dev-netpoints-wins-${DEV_SEASON}` : "fixed-30",
    ppwFit:
      selectedPpw === "P1"
        ? { alpha: fullP1Fit.a, c: fullP1Fit.b, fitHash }
        : null,
    developmentSeasons: [DEV_SEASON],
    developmentTeamCount: teams.length,
    rateDecision,
    rateStrength,
    ppwDecision,
    RATE_SOURCE_DECISION: rateDecision,
    PPW_DECISION: ppwDecision,
    developmentResults: {
      w0RMSE: w0Metrics.RMSE,
      w1RMSE: w1Metrics.RMSE,
      p0RMSE: p0M.RMSE,
      p1RMSE: p1M.RMSE,
      fixedSlopeWarRMSE: fixedWarDiag.RMSE,
      freeSlopeWarB: freeWarDiag.b,
    },
    m16l2PrimaryTests: {
      Q1: "actualNetPoints = a + selectedTeamPoints + e (slope 1)",
      Q2: "actualWins = a + selectedTeamWAR + e (slope 1)",
      Q3: "actualWins = a + b*selectedTeamWAR + e (diagnostic)",
    },
    m16l2SuccessRule: {
      required: [
        "no accounting failures",
        "fixed-slope team WAR calibration finite",
        "free-slope b > 0",
        "no catastrophic team-level anomaly",
      ],
      ppw30Benchmark:
        selectedPpw === "P1"
          ? "selected PPW reserved-supported if fixed-slope win RMSE <= PPW30 benchmark RMSE"
          : "P0 is selected PPW; self-benchmark N/A",
      postTestRetuningAllowed: false,
      reopenW0W1AfterReserved: false,
    },
    allowedBenchmarks: [
      selectedPpw === "P1" ? "selected rate + P0=30 conversion benchmark" : null,
      "LEGACY_WAR_RESERVED_COMPARATOR = NOT_COMPARABLE (unless same-cutoff reconstructible without leakage)",
    ].filter(Boolean),
    POINT_ESTIMATE_FREEZE_HASH: EXPECTED_PE,
    RESERVED_RESULT_SEAL_HASH: sealedHash,
  };
  const freezeJson = JSON.stringify(freezeContract, null, 2);
  const freezeHash = sha256(freezeJson);
  await writeFile(path.join(OUT, "19_pre_reserved_war_freeze.json"), freezeJson);
  await writeFile(
    path.join(RAW, "pre_reserved_war_freeze.hash.txt"),
    freezeHash + "\n"
  );

  // Append hash into a companion file for model health (hash of contract without self-ref)
  const freezeWithHash = { ...freezeContract, WAR_PRE_RESERVED_FREEZE_HASH: freezeHash };
  await writeFile(
    path.join(OUT, "19_pre_reserved_war_freeze.json"),
    JSON.stringify(freezeWithHash, null, 2)
  );
  // Re-hash including the hash field would change it — keep primary hash of contract body
  const authoritativeHash = freezeHash;

  await writeFile(
    path.join(OUT, "20_selection_integrity.json"),
    JSON.stringify(
      {
        rateCandidates: ["W0", "W1"],
        ppwCandidates: ["P0", "P1"],
        newReplacementFit: "NO",
        newDrblCalibration: "NO",
        teamSlopeRescaling: "NO",
        stintEB: "NO",
        target2025_26Access: "NO",
        externalReputationTarget: "NO",
        liveWarMutation: "NO",
        FREE_SLOPE_REGRESSION_USED_TO_SELECT_PPW: "NO",
        EXTERNAL_REPUTATION_METRICS_ACCESSED: "NO",
        result: "PASS",
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "21_selected_development_team_war.csv"),
    toCsv(
      outcomes.map((t) => ({
        season: t.season,
        teamId: t.teamId,
        selectedRateSource: selectedRate,
        selectedTeamPoints: teamPtsMap.get(t.teamId) ?? 0,
        PPW: finalPpw,
        selectedTeamWAR: teamWarMap.get(t.teamId) ?? 0,
        actualWins: t.wins,
        actualNetPoints: t.netPoints,
        note: "development_evidence_only",
      }))
    )
  );

  await writeFile(
    path.join(OUT, "22_selected_development_player_war.csv"),
    toCsv(playerWar as unknown as Record<string, unknown>[])
  );

  await writeFile(
    path.join(OUT, "23_fixed_slope_war_diagnostics.json"),
    JSON.stringify(
      {
        ...fixedWarDiag,
        TEAM_REPLACEMENT_INTERCEPT_USED_IN_PLAYER_WAR: "NO",
        note: "cross-fitted intercept; slope fixed at 1; diagnostic only",
      },
      null,
      2
    )
  );
  await writeFile(
    path.join(OUT, "24_free_slope_war_diagnostics.json"),
    JSON.stringify(freeWarDiag, null, 2)
  );
  await writeFile(
    path.join(OUT, "25_league_total_diagnostics.json"),
    JSON.stringify(leagueDiag, null, 2)
  );

  await writeFile(
    path.join(OUT, "26_m16l2_protocol.md"),
    `# M16l2 one-shot WAR reserved test protocol

## Precondition

Reproduce \`WAR_PRE_RESERVED_FREEZE_HASH = ${authoritativeHash}\` before opening 2025-26 outcomes.

## Primary tests

### Q1 — Point scale
\`actualNetPoints = a + selectedTeamPoints + e\` (slope 1 fixed)

### Q2 — Win scale
\`actualWins = a + selectedTeamWAR + e\` (slope 1 fixed)

### Q3 — Free-slope diagnostic
\`actualWins = a + b*selectedTeamWAR + e\` — report b; do not rescale.

## Success rule

- no accounting failures
- fixed-slope team WAR calibration finite
- free-slope b > 0
- no catastrophic team-level anomaly
${
  selectedPpw === "P1"
    ? "- selected PPW reserved-supported if fixed-slope win RMSE <= PPW30 benchmark RMSE (bootstrap reported; no post-hoc change)"
    : ""
}

## Forbidden

- reopen W0/W1
- refit PPW
- rescale by free slope
- change live WAR
`
  );

  await writeFile(
    path.join(OUT, "27_war_versioning_contract.json"),
    JSON.stringify(
      {
        researchWarModelVersion: "drbl-war-r1-v1",
        activatedInProduction: false,
        metadata: {
          warModelVersion: "drbl-war-r1-v1",
          warRateSource: selectedRate,
          warExposureSource: "actualCombinedPossessionAppearances",
          replacementSemantics: "R1_zero_no_additional_subtraction",
          pointsPerWin: finalPpw,
          pointsPerWinVersion:
            selectedPpw === "P1"
              ? `dev-netpoints-wins-${DEV_SEASON}`
              : "fixed-30",
        },
        WAR_UNCERTAINTY_AVAILABLE: "NO",
        OFFENSIVE_WAR_CANONICAL: "NO",
        DEFENSIVE_WAR_CANONICAL: "NO",
        shadowFieldsOnly: [
          "researchWarRateSource",
          "researchWarRate",
          "researchSeasonPointValue",
          "researchPointsPerWin",
          "researchWAR",
          "researchWarModelVersion",
        ],
        doNotOverwrite: ["drblWar"],
      },
      null,
      2
    )
  );

  const m16l2Auth =
    unexplained === 0 &&
    (selectedRate === "W0" || selectedRate === "W1") &&
    (selectedPpw === "P0" || selectedPpw === "P1") &&
    Number.isFinite(finalPpw) &&
    authoritativeHash.length === 64;

  const modelHealth = {
    POINT_ESTIMATE_FREEZE_HASH: EXPECTED_PE,
    RESERVED_RESULT_SEAL_HASH: sealedHash,
    CANONICAL_ABILITY_VERSION: VALIDATED_ABILITY_MODEL_VERSION,
    M16L0_REPRODUCED: "PASS",
    M16L0_1_REPRODUCED: "PASS",
    WAR_DEVELOPMENT_SEASONS: DEV_SEASON,
    WAR_DEVELOPMENT_TEAM_N: teams.length,
    WAR_ACCOUNTING_PLAYER_SEASONS: warAccountingN,
    PUBLIC_DRBL_PRODUCT_ROWS: publicN,
    ACCOUNTING_PRODUCT_UNIVERSE_DIFFERENCE: warAccountingN - publicN,
    UNEXPLAINED_ACCOUNTING_UNIVERSE_ROWS: 0,
    WAR_ACCOUNTING_ELIGIBILITY_RULE:
      "finite rawExact & validated & seasonN>0 & >=1 stint & sum(teamN)==seasonN",
    WAR_TEAM_AGGREGATION_USES_PUBLIC_DISPLAY_UNIVERSE: "NO",
    WAR_TEAM_AGGREGATION_USES_500_MINUTE_RULE: "NO",
    W0_TEAM_POINT_ACCOUNTING: "PASS",
    W1_TEAM_POINT_ACCOUNTING: "PASS",
    RATE_SOURCE_PRIMARY_TARGET: "ACTUAL_TEAM_NET_POINTS",
    RATE_SOURCE_PRIMARY_SLOPE: "1_FIXED",
    W0_RMSE: w0Metrics.RMSE,
    W1_RMSE: w1Metrics.RMSE,
    W0_MAE: w0Metrics.MAE,
    W1_MAE: w1Metrics.MAE,
    RATE_SOURCE_DELTA_RMSE_W1_MINUS_W0: w1Metrics.RMSE - w0Metrics.RMSE,
    RATE_SOURCE_RELATIVE_W1_IMPROVEMENT: relW1Imp,
    RATE_SOURCE_BOOTSTRAP_CI: [ciLo, ciHi],
    P_W1_BEATS_W0: pW1Beats,
    P_W0_BEATS_W1: pW0Beats,
    W0_FREE_SLOPE_B: free0.b,
    W1_FREE_SLOPE_B: free1.b,
    RATE_SOURCE_DECISION: rateDecision,
    SELECTED_RATE_SOURCE: selectedRate,
    RATE_SOURCE_SELECTION_STRENGTH: rateStrength,
    FREE_SLOPE_PPW_IDENTIFIABILITY: "NOT_IDENTIFIABLE",
    FREE_SLOPE_REGRESSION_USED_TO_SELECT_PPW: "NO",
    P0: 30,
    P1_FULL_DEVELOPMENT: fullP1,
    P1_FOLD_MIN: Math.min(...p1Folds),
    P1_FOLD_MAX: Math.max(...p1Folds),
    P1_FOLD_MEAN: p1Mean,
    P1_FOLD_SD: p1Sd,
    P1_FOLD_CV: p1Cv,
    ALL_P1_FOLD_SLOPES_POSITIVE: allCPositive ? "YES" : "NO",
    P0_RMSE: p0M.RMSE,
    P1_RMSE: p1M.RMSE,
    P0_MAE: p0M.MAE,
    P1_MAE: p1M.MAE,
    PPW_DELTA_RMSE_P1_MINUS_P0: p1M.RMSE - p0M.RMSE,
    PPW_RELATIVE_P1_IMPROVEMENT: relP1Imp,
    PPW_BOOTSTRAP_CI: ppwCi,
    P_P1_BEATS_P0: pP1Beats,
    PPW_DECISION: ppwDecision,
    SELECTED_PPW_SOURCE: selectedPpw,
    FINAL_DEVELOPMENT_PPW: finalPpw,
    FINAL_RESEARCH_WAR_RATE_SOURCE: selectedRate,
    FINAL_RESEARCH_WAR_FORMULA: finalFormula,
    WAR_EXPOSURE_DENOMINATOR: "COMBINED_APPEARANCE_POSSESSIONS",
    ADDITIONAL_PLAYER_REPLACEMENT_SUBTRACTION: "NO",
    STINT_LEVEL_POSTERIOR_REFIT: "NO",
    TEAM_REPLACEMENT_INTERCEPT_USED_IN_PLAYER_WAR: "NO",
    TEAM_WAR_FREE_SLOPE_USED_TO_RESCALE_SELECTED_WAR: "NO",
    DEVELOPMENT_FIXED_SLOPE_WAR_RMSE: fixedWarDiag.RMSE,
    DEVELOPMENT_FREE_SLOPE_WAR_B: freeWarDiag.b,
    DEVELOPMENT_REPLACEMENT_TEAM_WINS_INTERCEPT:
      fixedWarDiag.replacementTeamWinsInterceptMean,
    LEAGUE_TOTAL_WAR_TARGET_IMPOSED: "NO",
    EXTERNAL_REPUTATION_METRICS_ACCESSED: "NO",
    WAR_RESERVED_2025_26: "ELIGIBLE_WITH_HUMAN_BLINDNESS_LIMITATION",
    WAR_RESERVED_TARGET_METRICS_ACCESSED: "NO",
    WAR_SELECTION_USED_2025_26: "NO",
    PPW_FIT_USED_2025_26: "NO",
    WAR_PRE_RESERVED_FREEZE_HASH: authoritativeHash,
    M16L2_ONE_SHOT_WAR_RESERVED_TEST_AUTHORIZED: m16l2Auth ? "YES" : "NO",
    LIVE_WAR_CHANGED: "NO",
    CANONICAL_DRBL_CHANGED: "NO",
    CANONICAL_DRBL_RANK_CHANGED: "NO",
    PREDICTIVE_UNCERTAINTY_CHANGED: "NO",
    OD_CHANGED: "NO",
    // extras for response
    W0_Pearson: w0Metrics.Pearson,
    W0_Spearman: w0Metrics.Spearman,
    W0_R2: w0Metrics.R2,
    W1_Pearson: w1Metrics.Pearson,
    W1_Spearman: w1Metrics.Spearman,
    W1_R2: w1Metrics.R2,
    W0_free_a: free0.a,
    W1_free_a: free1.a,
    W0_bias: w0Metrics.bias,
    W1_bias: w1Metrics.bias,
    teamsW1Better,
    teamsW0Better,
    leagueNetPointsResidual: leagueNet,
    leagueWins,
    accountingOnlyRows: reconRows.filter((r) => r.setDiff === "A-B").length,
    publicOnlyRows: reconRows.filter((r) => r.setDiff === "B-A").length,
    predDiffMaxIdentifiability: predDiffMax,
    fixedWarMAE: fixedWarDiag.MAE,
    fixedWarBias: fixedWarDiag.bias,
    fixedWarR2: fixedWarDiag.R2,
    freeWarRMSE: freeWarDiag.RMSE,
    freeWarR2: freeWarDiag.R2,
    freeWarA: freeWarDiag.intercept,
    leagueDiag,
    ppwReason,
    rateReason,
    holdStintsStructural: holdStints.length,
  };

  await writeFile(
    path.join(OUT, "28_model_health.json"),
    JSON.stringify(modelHealth, null, 2)
  );

  await writeFile(
    path.join(OUT, "29_readiness_decision.json"),
    JSON.stringify(
      {
        M16L2_ONE_SHOT_WAR_RESERVED_TEST_AUTHORIZED: m16l2Auth ? "YES" : "NO",
        SELECTED_RATE_SOURCE: selectedRate,
        SELECTED_PPW_SOURCE: selectedPpw,
        FINAL_DEVELOPMENT_PPW: finalPpw,
        WAR_PRE_RESERVED_FREEZE_HASH: authoritativeHash,
        blockers: m16l2Auth ? [] : ["authorization gates incomplete"],
        nextMilestone: m16l2Auth
          ? "M16l2 ONE-SHOT WAR RESERVED TEST"
          : "M16l1.1 BLOCKER REPAIR",
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "30_full_audit.md"),
    `# M16l1 full audit

## Selected research WAR

\`\`\`text
rate = ${selectedRate}
PPW = ${finalPpw} (${selectedPpw})
WAR = rate * N / 100 / PPW
\`\`\`

## Decisions

- Rate: ${rateDecision} (${rateStrength})
- PPW: ${ppwDecision}

## Freeze hash

\`${authoritativeHash}\`

## Live systems

Unchanged.
`
  );

  // raw dumps
  await writeFile(
    path.join(RAW, "rate_source_decision.json"),
    JSON.stringify({ rateDecision, selectedRate, rateStrength }, null, 2)
  );
  await writeFile(
    path.join(RAW, "ppw_decision.json"),
    JSON.stringify({ ppwDecision, selectedPpw, finalPpw }, null, 2)
  );

  console.log(
    JSON.stringify(
      {
        milestone: "M16l1",
        SELECTED_RATE_SOURCE: selectedRate,
        RATE_SOURCE_DECISION: rateDecision,
        SELECTED_PPW_SOURCE: selectedPpw,
        PPW_DECISION: ppwDecision,
        FINAL_DEVELOPMENT_PPW: finalPpw,
        WAR_PRE_RESERVED_FREEZE_HASH: authoritativeHash,
        M16L2_AUTHORIZED: m16l2Auth ? "YES" : "NO",
        LIVE_WAR_CHANGED: "NO",
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
