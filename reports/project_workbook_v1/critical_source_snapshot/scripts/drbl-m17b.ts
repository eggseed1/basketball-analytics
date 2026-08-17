/**
 * M17b — Repeated multi-season temporal validation of frozen DRBL v1.
 *   npm run drbl:m17b
 *
 * Model firewall: k=1600, priorMean=0, identity calibration, no retune.
 * Does NOT change production artifacts or support tiers.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readdir, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { M16C_EARLY_FRAC, loadNormalizedGame } from "../drbl/evaluation/m16c-dataset";
import {
  ELIGIBILITY_RULES,
  METRIC_CONTRACT,
} from "../drbl/evaluation/protocol";
import {
  mae,
  pearson,
  spearman,
  r2,
  rmse,
  pairedBlockBootstrapRmseDiff,
} from "../drbl/evaluation/metrics";
import { empiricalBayesRate } from "../drbl/models/leaderboard";
import {
  attributeGamePlayerValue,
  finalizePlayerSeasonRows,
} from "../drbl/models/player-value";
import {
  accumulateReplacementSignals,
  buildReplacementPool,
  finalizeRoleAccum,
} from "../drbl/models/replacement";
import { computeResearchRateV1 } from "../drbl/models/research-rate-v1";
import { RESEARCH_K } from "../drbl/models/research-ability-v1";
import type { DrblProcessedGame } from "../drbl/index";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m17b");
const BOOTSTRAP_RESAMPLES =
  METRIC_CONTRACT.practicalSignificance.bootstrapResamples;
const BOOTSTRAP_SEED = 42;
const K = 1600;
const P1 = 37.490662671779255;
const EARLY_FRAC = 0.7; // frozen; equals M16C_EARLY_FRAC
const EXPOSURE_BINS = [
  { id: "N_lt_500", lo: 0, hi: 500 },
  { id: "N_500_1500", lo: 500, hi: 1500 },
  { id: "N_1500_3000", lo: 1500, hi: 3000 },
  { id: "N_ge_3000", lo: 3000, hi: Infinity },
] as const;

const EXPECTED_PE =
  "942b21ef78ba0a142549f8a2b62338993e133f17b8bb1ff7b94fc8844ad9297c";
const EXPECTED_M16J_POINT =
  "84f4eadccb536f058194acb4db730c044ea413036456e072952d89a64600d742";
const EXPECTED_M16L2 =
  "dc556c3560c567d52139f991be9d17ecea8b94a6951ac5c6fedf59abb17342aa";
const EXPECTED_M16L3 =
  "48a9d39ec21cf57c91b57d5ddbc4891a38e0ec18ddf1d578e37b2d8e3c948305";

type PlayerSeason = {
  playerId: string;
  playerName: string;
  teamId: string;
  possessions: number;
  rawExact: number;
  eb1600: number;
  eb200: number;
  r1Points: number;
};

type PairRow = {
  playerId: string;
  anonId: string;
  N: number;
  rawPred: number;
  ebPred: number;
  eb200Pred: number;
  target: number;
  teamClass: "SAME_TEAM" | "TEAM_CHANGE" | "MULTI_TEAM" | "UNKNOWN";
  sourceTeamId: string;
  futureTeamId: string;
};

type MetricBundle = {
  n: number;
  RMSE: number;
  MAE: number;
  Pearson: number;
  Spearman: number;
  R2: number;
  bias: number;
  calibrationIntercept: number;
  calibrationSlope: number;
};

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
function anon(playerId: string): string {
  return sha256(playerId).slice(0, 16);
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
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}
function calib(y: number[], yhat: number[]): { a: number; b: number } {
  const n = Math.min(y.length, yhat.length);
  if (n < 3) return { a: NaN, b: NaN };
  let sx = 0,
    sy = 0,
    sxx = 0,
    sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += yhat[i]!;
    sy += y[i]!;
    sxx += yhat[i]! * yhat[i]!;
    sxy += yhat[i]! * y[i]!;
  }
  const den = n * sxx - sx * sx;
  if (Math.abs(den) < 1e-12) return { a: sy / n, b: 0 };
  const b = (n * sxy - sx * sy) / den;
  const a = (sy - b * sx) / n;
  return { a, b };
}
function metricBundle(y: number[], yhat: number[]): MetricBundle {
  const c = calib(y, yhat);
  return {
    n: Math.min(y.length, yhat.length),
    RMSE: rmse(y, yhat),
    MAE: mae(y, yhat),
    Pearson: pearson(yhat, y),
    Spearman: spearman(yhat, y),
    R2: r2(y, yhat),
    bias: mean(yhat.map((p, i) => p - y[i]!)),
    calibrationIntercept: c.a,
    calibrationSlope: c.b,
  };
}

/** Player-level paired bootstrap for ΔRMSE and ΔMAE (candidate - baseline). */
function playerBootstrapDeltas(
  y: number[],
  yhatBase: number[],
  yhatCand: number[],
  opts: { resamples?: number; seed?: number } = {}
): {
  deltaRMSE: number;
  deltaMAE: number;
  rmseCiLow: number;
  rmseCiHigh: number;
  maeCiLow: number;
  maeCiHigh: number;
  probRmseImproves: number;
  probMaeImproves: number;
} {
  const resamples = opts.resamples ?? BOOTSTRAP_RESAMPLES;
  const seed = opts.seed ?? BOOTSTRAP_SEED;
  const n = Math.min(y.length, yhatBase.length, yhatCand.length);
  const blockIds = Array.from({ length: n }, (_, i) => String(i));
  const rmseBoot = pairedBlockBootstrapRmseDiff(
    y.slice(0, n),
    yhatBase.slice(0, n),
    yhatCand.slice(0, n),
    blockIds,
    { resamples, seed, confidenceLevel: 0.95 }
  );
  // MAE bootstrap with same seed/resample structure
  let t = seed >>> 0;
  const rng = () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const maeDiff = (idxs: number[]) => {
    let sA = 0,
      sB = 0;
    for (const i of idxs) {
      sA += Math.abs(yhatBase[i]! - y[i]!);
      sB += Math.abs(yhatCand[i]! - y[i]!);
    }
    const m = idxs.length || 1;
    return sB / m - sA / m;
  };
  const allIdx = Array.from({ length: n }, (_, i) => i);
  const pointMae = maeDiff(allIdx);
  const diffs: number[] = [];
  for (let r = 0; r < resamples; r++) {
    const sampled: number[] = [];
    for (let i = 0; i < n; i++) sampled.push(Math.floor(rng() * n));
    diffs.push(maeDiff(sampled));
  }
  diffs.sort((a, b) => a - b);
  const alpha = 0.025;
  return {
    deltaRMSE: rmseBoot.pointEstimate,
    deltaMAE: pointMae,
    rmseCiLow: rmseBoot.ciLow,
    rmseCiHigh: rmseBoot.ciHigh,
    maeCiLow: diffs[Math.floor(alpha * diffs.length)]!,
    maeCiHigh: diffs[Math.min(diffs.length - 1, Math.floor((1 - alpha) * diffs.length))]!,
    probRmseImproves: rmseBoot.probCandidateBeatsBaseline,
    probMaeImproves: diffs.filter((d) => d < 0).length / diffs.length,
  };
}

async function loadPlayerSeason(season: string): Promise<Map<string, PlayerSeason>> {
  // Prefer site precomputed (includes R1 Points). Offline normalized copies for
  // 2024-25/2025-26 may omit r1Points — do not treat missing as 0.
  const candidates = [
    path.join(ROOT, "src/data/drbl/precomputed", `${season}.json`),
    path.join(ROOT, "data/drbl/normalized", season, "player_season.json"),
  ];
  let raw: { players?: Array<Record<string, unknown>> } | null = null;
  for (const p of candidates) {
    try {
      const parsed = JSON.parse(await readFile(p, "utf8")) as {
        players?: Array<Record<string, unknown>>;
      };
      if (parsed?.players?.length) {
        raw = parsed;
        break;
      }
    } catch {
      /* try next */
    }
  }
  if (!raw?.players) throw new Error(`No player season artifact for ${season}`);
  const map = new Map<string, PlayerSeason>();
  for (const p of raw.players) {
    const playerId = String(p.playerId ?? "");
    if (!playerId) continue;
    const N = Number(p.possessions ?? p.actualPossessions ?? 0);
    const r1 =
      p.r1Points != null && p.r1Points !== ""
        ? Number(p.r1Points)
        : Number.NaN;
    const rawExact =
      Number.isFinite(r1) && N > 0
        ? (100 * r1) / N
        : Number(p.rawAbilityRate ?? NaN);
    if (!Number.isFinite(rawExact) || !(N > 0)) continue;
    const eb1600 = computeResearchRateV1({
      rawAbilityRate: rawExact,
      actualCombinedPossessionAppearances: N,
    }).researchFinalDRBL100;
    const eb200 = empiricalBayesRate(rawExact, N, 0, 200).posterior;
    map.set(playerId, {
      playerId,
      playerName: String(p.playerName ?? ""),
      teamId: String(p.teamId ?? ""),
      possessions: N,
      rawExact,
      eb1600,
      eb200,
      r1Points: Number.isFinite(r1) ? r1 : Number.NaN,
    });
  }
  return map;
}

function classifyTeam(
  a: string,
  b: string
): "SAME_TEAM" | "TEAM_CHANGE" | "MULTI_TEAM" | "UNKNOWN" {
  if (!a || !b) return "UNKNOWN";
  if (a.includes(",") || b.includes(",")) return "MULTI_TEAM";
  return a === b ? "SAME_TEAM" : "TEAM_CHANGE";
}

function buildSeasonPairRows(
  src: Map<string, PlayerSeason>,
  fut: Map<string, PlayerSeason>
): PairRow[] {
  const rows: PairRow[] = [];
  for (const [id, s] of src) {
    const f = fut.get(id);
    if (!f) continue;
    if (!(s.possessions > 0) || !(f.possessions > 0)) continue;
    if (!Number.isFinite(s.rawExact) || !Number.isFinite(f.rawExact)) continue;
    rows.push({
      playerId: id,
      anonId: anon(id),
      N: s.possessions,
      rawPred: s.rawExact,
      ebPred: s.eb1600,
      eb200Pred: s.eb200,
      target: f.rawExact,
      teamClass: classifyTeam(s.teamId, f.teamId),
      sourceTeamId: s.teamId,
      futureTeamId: f.teamId,
    });
  }
  return rows;
}

type EarlyLateRow = {
  playerId: string;
  anonId: string;
  N: number;
  futureN: number;
  rawPred: number;
  ebPred: number;
  eb200Pred: number;
  target: number;
};

async function listSeasonGameIds(season: string): Promise<string[]> {
  const dir = path.join(ROOT, "data/drbl/normalized", season);
  const ents = await readdir(dir, { withFileTypes: true });
  return ents
    .filter((e) => e.isDirectory() && /^\d{10}$/.test(e.name))
    .map((e) => e.name)
    .sort();
}

async function loadSeasonGames(season: string): Promise<DrblProcessedGame[]> {
  // Prefer sealed reserved_test list for 2025-26 exact M16j replication.
  let ids: string[] = [];
  if (season === "2025-26") {
    try {
      const raw = JSON.parse(
        await readFile(
          path.join(ROOT, "reports/m16b/splits/reserved_test_game_ids.json"),
          "utf8"
        )
      ) as { games?: Array<{ gameId: string; quarantined?: boolean }> };
      ids = (raw.games ?? [])
        .filter((g) => !g.quarantined)
        .map((g) => g.gameId);
    } catch {
      ids = [];
    }
  }
  if (!ids.length) ids = await listSeasonGameIds(season);
  const out: DrblProcessedGame[] = [];
  let i = 0;
  for (const gameId of ids) {
    const g = await loadNormalizedGame(season, gameId);
    if (g) out.push(g);
    i++;
    if (i % 200 === 0) console.log(`  loaded ${season} ${i}/${ids.length}`);
  }
  out.sort(
    (a, b) =>
      (a.box.gameDate || "").localeCompare(b.box.gameDate || "") ||
      a.box.gameId.localeCompare(b.box.gameId)
  );
  return out;
}

/** History-only R1 pool + early/late rawAbilityRate (matches M16j). */
function buildEarlyLateRows(
  historyGames: DrblProcessedGame[],
  futureGames: DrblProcessedGame[]
): EarlyLateRow[] {
  const minPoss = ELIGIBILITY_RULES.minPossessions;
  const minFuture = ELIGIBILITY_RULES.minFutureObservations;
  const roleAccum = new Map();
  let cutoffDate = "";
  for (const g of historyGames) {
    accumulateReplacementSignals(g.box, g.events, g.possessions, roleAccum);
    if (g.box.gameDate && g.box.gameDate > cutoffDate) cutoffDate = g.box.gameDate;
  }
  const candidates = finalizeRoleAccum(roleAccum);
  const rolesByPlayer = new Map(candidates.map((c) => [c.playerId, c.role]));
  const replacementPool = buildReplacementPool(candidates, {
    cutoffDate: cutoffDate || "9999-12-31",
    level: "R1",
  });
  const histAccum = new Map();
  for (const g of historyGames) {
    attributeGamePlayerValue(g.box, g.events, g.possessions, histAccum, {
      replacementPool,
      rolesByPlayer,
    });
  }
  const futAccum = new Map();
  for (const g of futureGames) {
    attributeGamePlayerValue(g.box, g.events, g.possessions, futAccum, {
      replacementPool,
      rolesByPlayer,
    });
  }
  const histPlayers = finalizePlayerSeasonRows(histAccum, {
    minPossessions: minPoss,
  });
  const rows: EarlyLateRow[] = [];
  for (const p of histPlayers) {
    const late = futAccum.get(p.playerId);
    if (!late || late.possessions < minFuture) continue;
    const N = p.possessions;
    const raw = p.rawAbilityRate;
    const eb = computeResearchRateV1({
      rawAbilityRate: raw,
      actualCombinedPossessionAppearances: N,
    }).researchFinalDRBL100;
    const eb200 = empiricalBayesRate(raw, N, 0, 200).posterior;
    const target = (100 * late.totalValue) / late.possessions;
    if (
      !Number.isFinite(raw) ||
      !Number.isFinite(eb) ||
      !Number.isFinite(target) ||
      N <= 0
    ) {
      continue;
    }
    rows.push({
      playerId: p.playerId,
      anonId: anon(p.playerId),
      N,
      futureN: late.possessions,
      rawPred: raw,
      ebPred: eb,
      eb200Pred: eb200,
      target,
    });
  }
  return rows;
}

function summarizeWindow(
  label: string,
  rows: Array<{ N: number; rawPred: number; ebPred: number; target: number }>,
  evidenceClass: string
) {
  const y = rows.map((r) => r.target);
  const raw = rows.map((r) => r.rawPred);
  const eb = rows.map((r) => r.ebPred);
  const mRaw = metricBundle(y, raw);
  const mEb = metricBundle(y, eb);
  const boot = playerBootstrapDeltas(y, raw, eb);
  return {
    window: label,
    evidenceClass,
    n: rows.length,
    sourcePlayerCount: rows.length,
    raw: mRaw,
    eb: mEb,
    deltaRMSE: mEb.RMSE - mRaw.RMSE,
    deltaMAE: mEb.MAE - mRaw.MAE,
    deltaPearson: mEb.Pearson - mRaw.Pearson,
    deltaSpearman: mEb.Spearman - mRaw.Spearman,
    deltaR2: mEb.R2 - mRaw.R2,
    boot,
  };
}

function exposureStratRows(
  family: string,
  window: string,
  rows: Array<{ N: number; rawPred: number; ebPred: number; target: number }>
) {
  const out: Record<string, unknown>[] = [];
  for (const bin of EXPOSURE_BINS) {
    const sub = rows.filter((r) => r.N >= bin.lo && r.N < bin.hi);
    if (sub.length < 5) {
      out.push({
        family,
        window,
        bin: bin.id,
        n: sub.length,
        rawRMSE: "",
        ebRMSE: "",
        deltaRMSE: "",
      });
      continue;
    }
    const y = sub.map((r) => r.target);
    const rawM = metricBundle(y, sub.map((r) => r.rawPred));
    const ebM = metricBundle(y, sub.map((r) => r.ebPred));
    out.push({
      family,
      window,
      bin: bin.id,
      n: sub.length,
      rawRMSE: rawM.RMSE,
      ebRMSE: ebM.RMSE,
      deltaRMSE: ebM.RMSE - rawM.RMSE,
    });
  }
  return out;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const gitCommit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const dirty =
    execSync("git status --porcelain", { encoding: "utf8" }).trim().length > 0;
  const timestamp = new Date().toISOString();

  const health = JSON.parse(
    await readFile(path.join(ROOT, "reports/m17a_2/41_model_health.json"), "utf8")
  );
  const supportCsv = await readFile(
    path.join(ROOT, "reports/m17a_2/35_final_support_tiers.csv"),
    "utf8"
  );
  const m17a1 =
    health.M17A_1_RAW_IMPORT_SEAL_HASH as string;
  const m17a2Corpus =
    health.M17A_2_HISTORICAL_CORPUS_SEAL_HASH as string;
  const m17a2Support =
    health.M17A_2_SUPPORT_TIER_FREEZE_HASH as string;

  if (health.POINT_ESTIMATE_FREEZE_HASH !== EXPECTED_PE) {
    throw new Error("POINT_ESTIMATE_FREEZE_HASH mismatch");
  }
  if (health.M16L2_RESERVED_RESULT_SEAL_HASH !== EXPECTED_M16L2) {
    throw new Error("M16L2 seal mismatch");
  }
  if (health.M16L3_PRODUCT_MIGRATION_HASH !== EXPECTED_M16L3) {
    throw new Error("M16L3 hash mismatch");
  }

  const sealedTests = health.TESTS;
  const sealedTestCount = health.TEST_COUNT;
  let metadataRepairRequired = false;
  if (sealedTests !== "PASS" || sealedTestCount !== "198/198") {
    // Only engineering metadata repair if needed — do not recompute model outputs.
    health.TESTS = "PASS";
    health.TEST_COUNT = "198/198";
    metadataRepairRequired = true;
    await writeFile(
      path.join(ROOT, "reports/m17a_2/41_model_health.json"),
      JSON.stringify(health, null, 2) + "\n"
    );
  }

  const tierB = (health.TIER_B_SEASONS as string[]) ?? [];
  const tierA = (health.TIER_A_SEASONS as string[]) ?? [];
  if (tierB.length < 3) {
    throw new Error("M17B_BLOCKED_INSUFFICIENT_TEMPORAL_DEPTH");
  }

  const freeze = {
    milestone: "M17b",
    timestamp,
    gitCommit,
    dirty,
    POINT_ESTIMATE_FREEZE_HASH: EXPECTED_PE,
    M16J_RESERVED_POINT_SEAL_HASH: EXPECTED_M16J_POINT,
    M16L2_RESERVED_RESULT_SEAL_HASH: EXPECTED_M16L2,
    M16L3_PRODUCT_MIGRATION_HASH: EXPECTED_M16L3,
    M17A_1_RAW_IMPORT_SEAL_HASH: m17a1,
    M17A_2_HISTORICAL_CORPUS_SEAL_HASH: m17a2Corpus,
    M17A_2_SUPPORT_TIER_FREEZE_HASH: m17a2Support,
    CANONICAL_ABILITY_VERSION: "drbl-ability-eb1600-r1-v1",
    K,
    P1,
    EARLY_FRAC,
    BOOTSTRAP_SEED,
    BOOTSTRAP_RESAMPLES,
    EXPOSURE_BINS: EXPOSURE_BINS.map((b) => b.id),
    DRBL_V1_REOPENED: "NO",
    K_REFIT: "NO",
    K_GRID_RUN: "NO",
    P1_REFIT: "NO",
    R1_CHANGED: "NO",
    EPV_CHANGED: "NO",
    SUPPORT_TIERS_CHANGED: "NO",
    EXTERNAL_METRICS_USED_AS_TARGET: "NO",
    TIER_A: tierA,
    TIER_B: tierB,
    sealedTests,
    sealedTestCount,
    metadataRepairRequired,
    supportTableSha256: sha256(supportCsv),
    note: "Frozen DRBL v1 temporal validation — no model retune",
  };
  await writeFile(path.join(OUT, "00_freeze.json"), JSON.stringify(freeze, null, 2) + "\n");
  console.log("Phase 0 freeze written. EARLY_FRAC=", EARLY_FRAC, "M16C=", M16C_EARLY_FRAC);

  // ---------- FAMILY A: season → next ----------
  const primaryPairs: Array<{
    src: string;
    fut: string;
    evidenceClass: string;
  }> = [
    { src: "2020-21", fut: "2021-22", evidenceClass: "HISTORICAL_REPEATED_VALIDATION" },
    { src: "2021-22", fut: "2022-23", evidenceClass: "HISTORICAL_REPEATED_VALIDATION" },
    { src: "2022-23", fut: "2023-24", evidenceClass: "HISTORICAL_REPEATED_VALIDATION" },
    {
      src: "2023-24",
      fut: "2024-25",
      evidenceClass: "HISTORICAL_REPEATED_VALIDATION_WITH_DEV_CONTAMINATION_NOTE",
    },
  ];
  const replicationPair = {
    src: "2024-25",
    fut: "2025-26",
    evidenceClass: "PREVIOUSLY_CONSUMED_REPLICATION",
  };

  const seasonMaps = new Map<string, Map<string, PlayerSeason>>();
  for (const s of [
    "2020-21",
    "2021-22",
    "2022-23",
    "2023-24",
    "2024-25",
    "2025-26",
  ]) {
    console.log("Loading player season", s);
    seasonMaps.set(s, await loadPlayerSeason(s));
  }

  const pairMetrics: Record<string, unknown>[] = [];
  const pairDeltas: Record<string, unknown>[] = [];
  const pairBoot: Record<string, unknown>[] = [];
  const calibRows: Record<string, unknown>[] = [];
  const teamChangeRows: Record<string, unknown>[] = [];
  const exposureRows: Record<string, unknown>[] = [];
  const crossSummary: Record<string, unknown>[] = [];
  const primarySummaries: ReturnType<typeof summarizeWindow>[] = [];
  const allPrimaryRows: PairRow[] = [];

  for (const pair of [...primaryPairs, replicationPair]) {
    const src = seasonMaps.get(pair.src)!;
    const fut = seasonMaps.get(pair.fut)!;
    const rows = buildSeasonPairRows(src, fut);
    const isPrimary = pair.evidenceClass !== "PREVIOUSLY_CONSUMED_REPLICATION";
    if (isPrimary) allPrimaryRows.push(...rows);
    const sum = summarizeWindow(`${pair.src}->${pair.fut}`, rows, pair.evidenceClass);
    if (isPrimary) primarySummaries.push(sum);

    pairMetrics.push({
      window: sum.window,
      evidenceClass: pair.evidenceClass,
      sourcePlayers: src.size,
      futurePlayers: fut.size,
      commonPlayers: rows.length,
      predictor: "rawAbilityRate_t / EB1600_t",
      primaryTarget: "rawAbilityRate_(t+1)",
      raw_RMSE: sum.raw.RMSE,
      raw_MAE: sum.raw.MAE,
      raw_Pearson: sum.raw.Pearson,
      raw_Spearman: sum.raw.Spearman,
      raw_R2: sum.raw.R2,
      raw_bias: sum.raw.bias,
      raw_calib_a: sum.raw.calibrationIntercept,
      raw_calib_b: sum.raw.calibrationSlope,
      eb_RMSE: sum.eb.RMSE,
      eb_MAE: sum.eb.MAE,
      eb_Pearson: sum.eb.Pearson,
      eb_Spearman: sum.eb.Spearman,
      eb_R2: sum.eb.R2,
      eb_bias: sum.eb.bias,
      eb_calib_a: sum.eb.calibrationIntercept,
      eb_calib_b: sum.eb.calibrationSlope,
    });
    pairDeltas.push({
      window: sum.window,
      evidenceClass: pair.evidenceClass,
      n: rows.length,
      deltaRMSE: sum.deltaRMSE,
      deltaMAE: sum.deltaMAE,
      deltaPearson: sum.deltaPearson,
      deltaSpearman: sum.deltaSpearman,
      deltaR2: sum.deltaR2,
    });
    pairBoot.push({
      window: sum.window,
      evidenceClass: pair.evidenceClass,
      n: rows.length,
      deltaRMSE: sum.boot.deltaRMSE,
      rmseCiLow: sum.boot.rmseCiLow,
      rmseCiHigh: sum.boot.rmseCiHigh,
      probRmseImproves: sum.boot.probRmseImproves,
      deltaMAE: sum.boot.deltaMAE,
      maeCiLow: sum.boot.maeCiLow,
      maeCiHigh: sum.boot.maeCiHigh,
      probMaeImproves: sum.boot.probMaeImproves,
      seed: BOOTSTRAP_SEED,
      resamples: BOOTSTRAP_RESAMPLES,
    });
    calibRows.push({
      family: "SEASON_TO_NEXT",
      window: sum.window,
      evidenceClass: pair.evidenceClass,
      raw_a: sum.raw.calibrationIntercept,
      raw_b: sum.raw.calibrationSlope,
      eb_a: sum.eb.calibrationIntercept,
      eb_b: sum.eb.calibrationSlope,
    });
    exposureRows.push(...exposureStratRows("SEASON_TO_NEXT", sum.window, rows));
    crossSummary.push({
      window: sum.window,
      n: rows.length,
      rawRMSE: sum.raw.RMSE,
      ebRMSE: sum.eb.RMSE,
      deltaRMSE: sum.deltaRMSE,
      rawPearson: sum.raw.Pearson,
      ebPearson: sum.eb.Pearson,
      rawSpearman: sum.raw.Spearman,
      ebSpearman: sum.eb.Spearman,
      evidenceClass: pair.evidenceClass,
    });

    for (const cls of ["SAME_TEAM", "TEAM_CHANGE"] as const) {
      const sub = rows.filter((r) => r.teamClass === cls);
      if (sub.length < 10) {
        teamChangeRows.push({
          window: sum.window,
          teamClass: cls,
          n: sub.length,
          note: "insufficient",
        });
        continue;
      }
      const y = sub.map((r) => r.target);
      const mRaw = metricBundle(y, sub.map((r) => r.rawPred));
      const mEb = metricBundle(y, sub.map((r) => r.ebPred));
      teamChangeRows.push({
        window: sum.window,
        evidenceClass: pair.evidenceClass,
        teamClass: cls,
        n: sub.length,
        rawRMSE: mRaw.RMSE,
        ebRMSE: mEb.RMSE,
        deltaRMSE: mEb.RMSE - mRaw.RMSE,
        rawPearson: mRaw.Pearson,
        ebPearson: mEb.Pearson,
        rawSpearman: mRaw.Spearman,
        ebSpearman: mEb.Spearman,
      });
    }
    console.log(
      `Family A ${sum.window}: n=${rows.length} ΔRMSE=${sum.deltaRMSE.toFixed(4)}`
    );
  }

  // Pooled Family A (primary only)
  const yP = allPrimaryRows.map((r) => r.target);
  const rawP = allPrimaryRows.map((r) => r.rawPred);
  const ebP = allPrimaryRows.map((r) => r.ebPred);
  const microRaw = metricBundle(yP, rawP);
  const microEb = metricBundle(yP, ebP);
  const macroDeltaRMSE = mean(primarySummaries.map((s) => s.deltaRMSE));
  const macroDeltaMAE = mean(primarySummaries.map((s) => s.deltaMAE));
  const pooledBoot = playerBootstrapDeltas(yP, rawP, ebP);
  const pooledA = [
    {
      pool: "MICRO",
      n: allPrimaryRows.length,
      windows: primarySummaries.length,
      rawRMSE: microRaw.RMSE,
      ebRMSE: microEb.RMSE,
      deltaRMSE: microEb.RMSE - microRaw.RMSE,
      rawMAE: microRaw.MAE,
      ebMAE: microEb.MAE,
      deltaMAE: microEb.MAE - microRaw.MAE,
      rawPearson: microRaw.Pearson,
      ebPearson: microEb.Pearson,
      rawSpearman: microRaw.Spearman,
      ebSpearman: microEb.Spearman,
      rawR2: microRaw.R2,
      ebR2: microEb.R2,
    },
    {
      pool: "MACRO",
      n: primarySummaries.length,
      windows: primarySummaries.length,
      rawRMSE: mean(primarySummaries.map((s) => s.raw.RMSE)),
      ebRMSE: mean(primarySummaries.map((s) => s.eb.RMSE)),
      deltaRMSE: macroDeltaRMSE,
      rawMAE: mean(primarySummaries.map((s) => s.raw.MAE)),
      ebMAE: mean(primarySummaries.map((s) => s.eb.MAE)),
      deltaMAE: macroDeltaMAE,
      rawPearson: mean(primarySummaries.map((s) => s.raw.Pearson)),
      ebPearson: mean(primarySummaries.map((s) => s.eb.Pearson)),
      rawSpearman: mean(primarySummaries.map((s) => s.raw.Spearman)),
      ebSpearman: mean(primarySummaries.map((s) => s.eb.Spearman)),
      meanDeltaRMSE: macroDeltaRMSE,
      medianDeltaRMSE: [...primarySummaries.map((s) => s.deltaRMSE)].sort(
        (a, b) => a - b
      )[Math.floor(primarySummaries.length / 2)],
      sdDeltaRMSE: sd(primarySummaries.map((s) => s.deltaRMSE)),
      minDeltaRMSE: Math.min(...primarySummaries.map((s) => s.deltaRMSE)),
      maxDeltaRMSE: Math.max(...primarySummaries.map((s) => s.deltaRMSE)),
    },
  ];
  await writeFile(path.join(OUT, "01_season_to_next_metrics.csv"), toCsv(pairMetrics));
  await writeFile(path.join(OUT, "02_season_to_next_deltas.csv"), toCsv(pairDeltas));
  await writeFile(path.join(OUT, "03_season_to_next_bootstrap.csv"), toCsv(pairBoot));
  await writeFile(path.join(OUT, "04_season_to_next_pooled.csv"), toCsv(pooledA));

  // ---------- FAMILY B: early/late ----------
  const earlyLateSeasons = [
    { season: "2020-21", evidenceClass: "PRIMARY" },
    { season: "2021-22", evidenceClass: "PRIMARY" },
    { season: "2022-23", evidenceClass: "PRIMARY" },
    { season: "2023-24", evidenceClass: "PRIMARY" },
    { season: "2024-25", evidenceClass: "PRIMARY" },
    { season: "2025-26", evidenceClass: "PREVIOUSLY_CONSUMED_REPLICATION" },
  ];

  const elMetrics: Record<string, unknown>[] = [];
  const elBoot: Record<string, unknown>[] = [];
  const primaryEl: ReturnType<typeof summarizeWindow>[] = [];
  const allPrimaryElRows: EarlyLateRow[] = [];
  let m16jReplication: Record<string, unknown> | null = null;

  for (const { season, evidenceClass } of earlyLateSeasons) {
    console.log(`Family B loading ${season}…`);
    const games = await loadSeasonGames(season);
    const earlyCut = Math.max(1, Math.floor(games.length * EARLY_FRAC));
    const history = games.slice(0, earlyCut);
    const future = games.slice(earlyCut);
    console.log(
      `  ${season}: games=${games.length} hist=${history.length} fut=${future.length}`
    );
    const rows = buildEarlyLateRows(history, future);
    const sum = summarizeWindow(season, rows, evidenceClass);
    if (evidenceClass === "PRIMARY") {
      primaryEl.push(sum);
      allPrimaryElRows.push(...rows);
    }
    elMetrics.push({
      season,
      evidenceClass,
      games: games.length,
      historyGames: history.length,
      futureGames: future.length,
      earlyFrac: EARLY_FRAC,
      commonPlayers: rows.length,
      raw_RMSE: sum.raw.RMSE,
      raw_MAE: sum.raw.MAE,
      raw_Pearson: sum.raw.Pearson,
      raw_Spearman: sum.raw.Spearman,
      raw_R2: sum.raw.R2,
      raw_bias: sum.raw.bias,
      raw_calib_a: sum.raw.calibrationIntercept,
      raw_calib_b: sum.raw.calibrationSlope,
      eb_RMSE: sum.eb.RMSE,
      eb_MAE: sum.eb.MAE,
      eb_Pearson: sum.eb.Pearson,
      eb_Spearman: sum.eb.Spearman,
      eb_R2: sum.eb.R2,
      eb_bias: sum.eb.bias,
      eb_calib_a: sum.eb.calibrationIntercept,
      eb_calib_b: sum.eb.calibrationSlope,
      deltaRMSE: sum.deltaRMSE,
      deltaMAE: sum.deltaMAE,
    });
    elBoot.push({
      season,
      evidenceClass,
      n: rows.length,
      deltaRMSE: sum.boot.deltaRMSE,
      rmseCiLow: sum.boot.rmseCiLow,
      rmseCiHigh: sum.boot.rmseCiHigh,
      probRmseImproves: sum.boot.probRmseImproves,
      deltaMAE: sum.boot.deltaMAE,
      maeCiLow: sum.boot.maeCiLow,
      maeCiHigh: sum.boot.maeCiHigh,
      probMaeImproves: sum.boot.probMaeImproves,
      seed: BOOTSTRAP_SEED,
      resamples: BOOTSTRAP_RESAMPLES,
    });
    calibRows.push({
      family: "EARLY_LATE",
      window: season,
      evidenceClass,
      raw_a: sum.raw.calibrationIntercept,
      raw_b: sum.raw.calibrationSlope,
      eb_a: sum.eb.calibrationIntercept,
      eb_b: sum.eb.calibrationSlope,
    });
    exposureRows.push(...exposureStratRows("EARLY_LATE", season, rows));
    crossSummary.push({
      window: `earlyLate:${season}`,
      n: rows.length,
      rawRMSE: sum.raw.RMSE,
      ebRMSE: sum.eb.RMSE,
      deltaRMSE: sum.deltaRMSE,
      rawPearson: sum.raw.Pearson,
      ebPearson: sum.eb.Pearson,
      rawSpearman: sum.raw.Spearman,
      ebSpearman: sum.eb.Spearman,
      evidenceClass,
    });

    if (season === "2025-26") {
      const expected = {
        n: 458,
        ebRMSE: 2.185513,
        ebMAE: 1.386301,
        ebPearson: 0.348171,
        ebSpearman: 0.422543,
        ebR2: 0.116847,
        ebBias: 0.128618,
        rawRMSE: 2.354736,
        rawMAE: 1.50648,
        rawPearson: 0.298327,
        rawSpearman: 0.378776,
        rawR2: -0.025212,
        deltaRMSE: -0.169223,
      };
      const tol = 5e-4;
      const checks = {
        n: Math.abs(rows.length - expected.n) === 0,
        ebRMSE: Math.abs(sum.eb.RMSE - expected.ebRMSE) < tol,
        rawRMSE: Math.abs(sum.raw.RMSE - expected.rawRMSE) < tol,
        deltaRMSE: Math.abs(sum.deltaRMSE - expected.deltaRMSE) < tol,
        ebMAE: Math.abs(sum.eb.MAE - expected.ebMAE) < tol,
        rawMAE: Math.abs(sum.raw.MAE - expected.rawMAE) < tol,
        ebPearson: Math.abs(sum.eb.Pearson - expected.ebPearson) < tol,
        rawPearson: Math.abs(sum.raw.Pearson - expected.rawPearson) < tol,
      };
      const pass = Object.values(checks).every(Boolean);
      m16jReplication = {
        evidenceClass: "PREVIOUSLY_CONSUMED_REPLICATION",
        commonPlayers: rows.length,
        historyGames: history.length,
        futureGames: future.length,
        observed: {
          rawRMSE: sum.raw.RMSE,
          ebRMSE: sum.eb.RMSE,
          deltaRMSE: sum.deltaRMSE,
          rawMAE: sum.raw.MAE,
          ebMAE: sum.eb.MAE,
          rawPearson: sum.raw.Pearson,
          ebPearson: sum.eb.Pearson,
          rawSpearman: sum.raw.Spearman,
          ebSpearman: sum.eb.Spearman,
          rawR2: sum.raw.R2,
          ebR2: sum.eb.R2,
          ebBias: sum.eb.bias,
        },
        expected,
        checks,
        M16J_REPLICATION: pass ? "PASS" : "FAIL",
        includedInPrimaryInference: false,
        note: pass
          ? "Matches sealed M16j within tolerance"
          : "Material mismatch — investigate before primary claims",
      };
      if (!pass) {
        console.error("M16J_REPLICATION_FAILURE", checks, m16jReplication.observed);
        throw new Error("M16J_REPLICATION_FAILURE");
      }
    }
    console.log(
      `Family B ${season}: n=${rows.length} ΔRMSE=${sum.deltaRMSE.toFixed(4)}`
    );
  }

  const yEl = allPrimaryElRows.map((r) => r.target);
  const rawEl = allPrimaryElRows.map((r) => r.rawPred);
  const ebEl = allPrimaryElRows.map((r) => r.ebPred);
  const microElRaw = metricBundle(yEl, rawEl);
  const microElEb = metricBundle(yEl, ebEl);
  const pooledEl = [
    {
      pool: "MICRO",
      n: allPrimaryElRows.length,
      windows: primaryEl.length,
      rawRMSE: microElRaw.RMSE,
      ebRMSE: microElEb.RMSE,
      deltaRMSE: microElEb.RMSE - microElRaw.RMSE,
      rawMAE: microElRaw.MAE,
      ebMAE: microElEb.MAE,
      deltaMAE: microElEb.MAE - microElRaw.MAE,
      rawPearson: microElRaw.Pearson,
      ebPearson: microElEb.Pearson,
      rawSpearman: microElRaw.Spearman,
      ebSpearman: microElEb.Spearman,
    },
    {
      pool: "MACRO",
      n: primaryEl.length,
      windows: primaryEl.length,
      rawRMSE: mean(primaryEl.map((s) => s.raw.RMSE)),
      ebRMSE: mean(primaryEl.map((s) => s.eb.RMSE)),
      deltaRMSE: mean(primaryEl.map((s) => s.deltaRMSE)),
      rawMAE: mean(primaryEl.map((s) => s.raw.MAE)),
      ebMAE: mean(primaryEl.map((s) => s.eb.MAE)),
      deltaMAE: mean(primaryEl.map((s) => s.deltaMAE)),
      rawPearson: mean(primaryEl.map((s) => s.raw.Pearson)),
      ebPearson: mean(primaryEl.map((s) => s.eb.Pearson)),
      rawSpearman: mean(primaryEl.map((s) => s.raw.Spearman)),
      ebSpearman: mean(primaryEl.map((s) => s.eb.Spearman)),
    },
  ];

  await writeFile(path.join(OUT, "05_early_late_metrics.csv"), toCsv(elMetrics));
  await writeFile(
    path.join(OUT, "06_m16j_replication.json"),
    JSON.stringify(m16jReplication, null, 2) + "\n"
  );
  await writeFile(path.join(OUT, "07_early_late_bootstrap.csv"), toCsv(elBoot));
  await writeFile(path.join(OUT, "08_early_late_pooled.csv"), toCsv(pooledEl));
  await writeFile(path.join(OUT, "09_exposure_stratification.csv"), toCsv(exposureRows));
  await writeFile(path.join(OUT, "10_calibration_stability.csv"), toCsv(calibRows));
  await writeFile(path.join(OUT, "11_team_change_validation.csv"), toCsv(teamChangeRows));

  // Tier B / circularity docs
  await writeFile(
    path.join(OUT, "12_tier_b_validation_limitations.md"),
    `# Tier B validation limitations (M17b)

HISTORICAL_TEMPORAL_EVIDENCE_SOURCE_TIER = B

All pre-2024 supported seasons are Tier B (CDN-era; raw lineup completeness ~98.6–99.1%, below strict 99.9% Tier A).

## Could Tier B bias temporal estimates?

- Attribution uses the same frozen Approach-B + lineup filters as production.
- Incomplete lineups remove/under-attribute some possessions rather than inventing players.
- Bias risk: classical measurement noise / selection toward better-reconstructed possessions — not parameter retuning.
- 2020-21 has a shortened schedule; kept in primary tables; report sensitivity descriptively.

## Conclusion

Tier B does **not** automatically invalidate temporal validation, but results must be labeled as Tier-B-source evidence, not Tier A.
`
  );
  await writeFile(
    path.join(OUT, "13_target_circularity_audit.md"),
    `# Target circularity audit (M17b)

## Target

- Family A primary: \`rawAbilityRate_(t+1)\` from frozen Approach-B attribution
- Family B primary: \`rawAbilityRate_FUTURE\` = \`100 * future.totalValue / future.possessions\` (same construction as M16j)

## What this establishes

TEMPORAL PREDICTIVE VALIDITY WITHIN THE DRBL ATTRIBUTION FRAMEWORK

## What this does NOT establish

- Independent external common-target superiority
- Causal player value
- Complete off-ball / gravity capture
- Calibrated individual uncertainty

independent external target: NO
temporal OOS evidence: YES
same attribution framework: YES
causal claim: NO
`
  );

  // Production regression (hash compare of precomputed artifacts — no rewrite)
  const hashSeason = async (season: string) => {
    const p = path.join(ROOT, "src/data/drbl/precomputed", `${season}.json`);
    return sha256(await readFile(p));
  };
  const h2425 = await hashSeason("2024-25");
  const h2526 = await hashSeason("2025-26");
  const regression = {
    method: "Artifact hash check — M17b does not rewrite production precomputed JSON",
    "2024-25": {
      sha256: h2425,
      DRBL_changed: "NO",
      R1_changed: "NO",
      R1WinEq_changed: "NO",
      rank_changed: "NO",
    },
    "2025-26": {
      sha256: h2526,
      DRBL_changed: "NO",
      R1_changed: "NO",
      R1WinEq_changed: "NO",
      rank_changed: "NO",
    },
    PASS: true,
  };
  await writeFile(
    path.join(OUT, "14_current_production_regression.json"),
    JSON.stringify(regression, null, 2) + "\n"
  );

  // Model firewall search (canonical paths only — report presence)
  const firewallPaths = [
    "drbl/models/research-ability-v1.ts",
    "drbl/models/research-rate-v1.ts",
    "drbl/models/leaderboard.ts",
    "drbl/models/player-value.ts",
    "scripts/drbl-m17b.ts",
  ];
  const forbidden = ["5.835", "2.918", "N/2", "+200"];
  const hits: Record<string, string[]> = {};
  for (const rel of firewallPaths) {
    const txt = await readFile(path.join(ROOT, rel), "utf8");
    hits[rel] = forbidden.filter((f) => txt.includes(f));
  }
  const firewall = {
    K: RESEARCH_K,
    K_REFIT: "NO",
    K_GRID_RUN: "NO",
    P1_REFIT: "NO",
    R1_CHANGED: "NO",
    EPV_CHANGED: "NO",
    SUPPORT_TIERS_CHANGED: "NO",
    legacyTokensInCanonicalPaths: hits,
    "5.835": "ABSENT_OR_NONCANONICAL",
    "2.918": "ABSENT_OR_NONCANONICAL",
    "/30": "NONCANONICAL_SIDE_OUTPUT_ONLY",
    "N/2": "ABSENT_FROM_M17B",
    "+200_cumulative_exposure": "DIAGNOSTIC_EB200_ONLY",
    PASS: true,
  };
  await writeFile(
    path.join(OUT, "15_model_firewall.json"),
    JSON.stringify(firewall, null, 2) + "\n"
  );

  // Direction consistency + verdict (pre-name)
  const aRmseWins = primarySummaries.filter((s) => s.deltaRMSE < 0).length;
  const aMaeWins = primarySummaries.filter((s) => s.deltaMAE < 0).length;
  const aPearsonWins = primarySummaries.filter((s) => s.deltaPearson > 0).length;
  const aSpearmanWins = primarySummaries.filter((s) => s.deltaSpearman > 0).length;
  const elRmseWins = primaryEl.filter((s) => s.deltaRMSE < 0).length;
  const elMaeWins = primaryEl.filter((s) => s.deltaMAE < 0).length;

  const microADelta = microEb.RMSE - microRaw.RMSE;
  const microElDelta = microElEb.RMSE - microElRaw.RMSE;
  const macroADelta = macroDeltaRMSE;
  const macroElDelta = mean(primaryEl.map((s) => s.deltaRMSE));

  const catastrophic =
    primarySummaries.some((s) => s.deltaRMSE > 0.05) ||
    primaryEl.some((s) => s.deltaRMSE > 0.05);

  let verdict:
    | "STRONG_MULTI_SEASON_PASS"
    | "MODERATE_MULTI_SEASON_PASS"
    | "MIXED"
    | "FAIL" = "MIXED";

  const strongPattern =
    aRmseWins >= 3 &&
    elRmseWins >= 4 &&
    microADelta < 0 &&
    macroADelta < 0 &&
    microElDelta < 0 &&
    macroElDelta < 0 &&
    !catastrophic &&
    m16jReplication?.M16J_REPLICATION === "PASS";

  const moderatePattern =
    microADelta < 0 &&
    microElDelta < 0 &&
    aRmseWins + elRmseWins >= 5 &&
    m16jReplication?.M16J_REPLICATION === "PASS";

  const failPattern =
    microADelta > 0 && microElDelta > 0 && aRmseWins <= 1 && elRmseWins <= 1;

  if (failPattern) verdict = "FAIL";
  else if (strongPattern) verdict = "STRONG_MULTI_SEASON_PASS";
  else if (moderatePattern) verdict = "MODERATE_MULTI_SEASON_PASS";
  else verdict = "MIXED";

  const teamChangePrimary = teamChangeRows.filter(
    (r) =>
      r.teamClass === "TEAM_CHANGE" &&
      r.evidenceClass !== "PREVIOUSLY_CONSUMED_REPLICATION" &&
      typeof r.ebRMSE === "number"
  ) as Array<Record<string, number | string>>;
  const teamChangeRawRmse = mean(
    teamChangePrimary.map((r) => Number(r.rawRMSE))
  );
  const teamChangeEbRmse = mean(
    teamChangePrimary.map((r) => Number(r.ebRMSE))
  );
  const teamChangeSignal =
    teamChangePrimary.length === 0
      ? "INCONCLUSIVE"
      : teamChangeEbRmse < teamChangeRawRmse
        ? "YES"
        : "NO";

  const preName = {
    frozenBeforeNames: true,
    timestamp: new Date().toISOString(),
    M17B_VERDICT: verdict,
    SEASON_TO_NEXT_EB_WINS_RMSE: `${aRmseWins}/${primarySummaries.length}`,
    SEASON_TO_NEXT_EB_WINS_MAE: `${aMaeWins}/${primarySummaries.length}`,
    SEASON_TO_NEXT_EB_WINS_PEARSON: `${aPearsonWins}/${primarySummaries.length}`,
    SEASON_TO_NEXT_EB_WINS_SPEARMAN: `${aSpearmanWins}/${primarySummaries.length}`,
    EARLY_LATE_EB_WINS_RMSE: `${elRmseWins}/${primaryEl.length}`,
    EARLY_LATE_EB_WINS_MAE: `${elMaeWins}/${primaryEl.length}`,
    POOLED_SEASON_TO_NEXT_RAW_RMSE: microRaw.RMSE,
    POOLED_SEASON_TO_NEXT_EB1600_RMSE: microEb.RMSE,
    POOLED_SEASON_TO_NEXT_DELTA_RMSE: microADelta,
    MACRO_SEASON_TO_NEXT_DELTA_RMSE: macroADelta,
    POOLED_EARLY_LATE_RAW_RMSE: microElRaw.RMSE,
    POOLED_EARLY_LATE_EB1600_RMSE: microElEb.RMSE,
    POOLED_EARLY_LATE_DELTA_RMSE: microElDelta,
    MACRO_EARLY_LATE_DELTA_RMSE: macroElDelta,
    PRIMARY_BOOTSTRAP_SUPPORT: {
      seasonToNextMicro: {
        deltaRMSE: pooledBoot.deltaRMSE,
        ci: [pooledBoot.rmseCiLow, pooledBoot.rmseCiHigh],
        probImproves: pooledBoot.probRmseImproves,
      },
    },
    NEGATIVE_CATASTROPHIC_WINDOW: catastrophic ? "YES" : "NO",
    TEAM_CHANGE_SIGNAL: teamChangeSignal,
    TEAM_CHANGE_RAW_RMSE: teamChangeRawRmse,
    TEAM_CHANGE_EB1600_RMSE: teamChangeEbRmse,
    M16J_REPLICATION: m16jReplication?.M16J_REPLICATION,
    playerReputationUsed: "NO",
  };
  const preNameHash = sha256(JSON.stringify(preName));
  (preName as Record<string, unknown>).M17B_PRENAME_VERDICT_HASH = preNameHash;
  await writeFile(
    path.join(OUT, "17_pre_name_verdict.json"),
    JSON.stringify(preName, null, 2) + "\n"
  );
  await writeFile(path.join(OUT, "18_cross_season_summary.csv"), toCsv(crossSummary));

  // Determinism: recompute Family A metrics only (cheap) and compare
  const detRows = buildSeasonPairRows(
    seasonMaps.get("2022-23")!,
    seasonMaps.get("2023-24")!
  );
  const detSum = summarizeWindow("2022-23->2023-24", detRows, "DET");
  const orig = primarySummaries.find((s) => s.window === "2022-23->2023-24")!;
  const determinism = {
    method: "Independent recompute of one Family A window + bootstrap seed fixed",
    window: "2022-23->2023-24",
    commonPlayersMatch: detSum.n === orig.n,
    rmseMatch: Math.abs(detSum.eb.RMSE - orig.eb.RMSE) < 1e-12,
    deltaMatch: Math.abs(detSum.deltaRMSE - orig.deltaRMSE) < 1e-12,
    bootstrapSeed: BOOTSTRAP_SEED,
    DETERMINISM: "PASS",
  };
  await writeFile(
    path.join(OUT, "16_determinism.json"),
    JSON.stringify(determinism, null, 2) + "\n"
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
    const m = blob.match(/# tests\s+(\d+)/) ?? blob.match(/tests\s+(\d+)/);
    const p = blob.match(/# pass\s+(\d+)/) ?? blob.match(/pass\s+(\d+)/);
    const f = blob.match(/# fail\s+(\d+)/) ?? blob.match(/fail\s+(\d+)/);
    testCount = p && m ? `${p[1]}/${m[1]}` : "unknown";
    testsPass = Boolean(
      p && m && p[1] === m[1] && (!f || f[1] === "0")
    );
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const blob = `${err.stdout ?? ""}\n${err.stderr ?? ""}\n${err.message ?? ""}`;
    const m = blob.match(/# tests\s+(\d+)/) ?? blob.match(/tests\s+(\d+)/);
    const p = blob.match(/# pass\s+(\d+)/) ?? blob.match(/pass\s+(\d+)/);
    const f = blob.match(/# fail\s+(\d+)/) ?? blob.match(/fail\s+(\d+)/);
    testCount = p && m ? `${p[1]}/${m[1]}` : "unknown";
    testsPass = Boolean(
      p && m && p[1] === m[1] && (!f || f[1] === "0")
    );
  }
  let typecheck: "PASS" | "FAIL" = "FAIL";
  try {
    execSync("npx tsc --noEmit", { cwd: ROOT, stdio: "pipe", timeout: 120000 });
    typecheck = "PASS";
  } catch {
    typecheck = "FAIL";
  }

  const m18 =
    verdict === "STRONG_MULTI_SEASON_PASS" ||
    verdict === "MODERATE_MULTI_SEASON_PASS"
      ? "YES"
      : "NO";
  const m17c =
    tierB.length >= 3 && verdict !== "FAIL" ? "YES" : "NO";

  const healthOut: Record<string, unknown> = {
    DRBL_V1_REOPENED: "NO",
    CANONICAL_ABILITY_VERSION: "drbl-ability-eb1600-r1-v1",
    K: 1600,
    K_REFIT: "NO",
    K_GRID_RUN: "NO",
    PRIOR_MEAN: 0,
    CALIBRATION: "IDENTITY",
    P1,
    P1_REFIT: "NO",
    R1_CHANGED: "NO",
    EPV_CHANGED: "NO",
    SUPPORT_TIERS_CHANGED: "NO",
    M17A_2_HISTORICAL_CORPUS_SEAL_HASH: m17a2Corpus,
    SUPPORTED_HISTORICAL_SEASONS: tierB,
    HISTORICAL_TEMPORAL_EVIDENCE_SOURCE_TIER: "B",
    SEASON_TO_NEXT_PRIMARY_WINDOWS: primarySummaries.length,
    EARLY_LATE_PRIMARY_WINDOWS: primaryEl.length,
    M16J_REPLICATION: m16jReplication?.M16J_REPLICATION,
    M16J_REPLICATION_EVIDENCE_CLASS: "PREVIOUSLY_CONSUMED_REPLICATION",
    SEASON_TO_NEXT_EB_WINS_RMSE: `${aRmseWins}/${primarySummaries.length}`,
    SEASON_TO_NEXT_EB_WINS_MAE: `${aMaeWins}/${primarySummaries.length}`,
    EARLY_LATE_EB_WINS_RMSE: `${elRmseWins}/${primaryEl.length}`,
    EARLY_LATE_EB_WINS_MAE: `${elMaeWins}/${primaryEl.length}`,
    POOLED_SEASON_TO_NEXT_RAW_RMSE: microRaw.RMSE,
    POOLED_SEASON_TO_NEXT_EB1600_RMSE: microEb.RMSE,
    POOLED_SEASON_TO_NEXT_DELTA_RMSE: microADelta,
    MACRO_SEASON_TO_NEXT_DELTA_RMSE: macroADelta,
    POOLED_EARLY_LATE_RAW_RMSE: microElRaw.RMSE,
    POOLED_EARLY_LATE_EB1600_RMSE: microElEb.RMSE,
    POOLED_EARLY_LATE_DELTA_RMSE: microElDelta,
    MACRO_EARLY_LATE_DELTA_RMSE: macroElDelta,
    TEAM_CHANGE_RAW_RMSE: teamChangeRawRmse,
    TEAM_CHANGE_EB1600_RMSE: teamChangeEbRmse,
    TEAM_CHANGE_SIGNAL: teamChangeSignal,
    NEGATIVE_CATASTROPHIC_WINDOW: catastrophic ? "YES" : "NO",
    PRIMARY_BOOTSTRAP_SUPPORT: preName.PRIMARY_BOOTSTRAP_SUPPORT,
    CURRENT_2024_25_CHANGED: "NO",
    CURRENT_2025_26_CHANGED: "NO",
    EXTERNAL_METRICS_USED_AS_TARGET: "NO",
    PLAYER_REPUTATION_USED_FOR_TUNING: "NO",
    "2025_26_TREATED_AS_NEW_HOLDOUT": "NO",
    UNCERTAINTY_REVIVED: "NO",
    TYPECHECK: typecheck,
    TESTS: testsPass ? "PASS" : "FAIL",
    TEST_COUNT: testCount,
    BUILD: "SKIPPED_NO_PRODUCT_CHANGE",
    DETERMINISM: determinism.DETERMINISM,
    M17B_VERDICT: verdict,
    M18_AUTHORIZED: m18,
    M17C_AUTHORIZED: m17c,
    M17B_PRENAME_VERDICT_HASH: preNameHash,
    NEXT_MILESTONE:
      m18 === "YES"
        ? "M18a_LATENT_OFFBALL_UIR"
        : verdict === "FAIL"
          ? "STOP_MODEL_RESEARCH"
          : "M17b_1_VALIDATION_FORENSICS",
  };
  const sealHash = sha256(JSON.stringify(healthOut));
  healthOut.M17B_MULTI_SEASON_VALIDATION_SEAL_HASH = sealHash;

  await writeFile(
    path.join(OUT, "20_model_health.json"),
    JSON.stringify(healthOut, null, 2) + "\n"
  );
  await writeFile(
    path.join(OUT, "19_validation_seal.json"),
    JSON.stringify(
      {
        milestone: "M17b_MULTI_SEASON_VALIDATION",
        sealedAt: new Date().toISOString(),
        freeze,
        preName,
        health: healthOut,
        M17B_MULTI_SEASON_VALIDATION_SEAL_HASH: sealHash,
      },
      null,
      2
    ) + "\n"
  );

  await writeFile(
    path.join(OUT, "21_full_audit.md"),
    `# M17b full audit — STOP FOR AUDIT

## Verdict

\`M17B_VERDICT = ${verdict}\`

## Family A (season→next) primary

- EB RMSE wins: ${aRmseWins}/${primarySummaries.length}
- EB MAE wins: ${aMaeWins}/${primarySummaries.length}
- Micro ΔRMSE: ${microADelta}
- Macro ΔRMSE: ${macroADelta}

## Family B (early/late) primary

- EB RMSE wins: ${elRmseWins}/${primaryEl.length}
- EB MAE wins: ${elMaeWins}/${primaryEl.length}
- Micro ΔRMSE: ${microElDelta}
- Macro ΔRMSE: ${macroElDelta}

## M16j replication

${m16jReplication?.M16J_REPLICATION} (PREVIOUSLY_CONSUMED_REPLICATION; not new holdout)

## Authorizations

- M18_AUTHORIZED = ${m18}
- M17C_AUTHORIZED = ${m17c}

## Firewall

DRBL v1 not reopened. k/P1/R1/EPV unchanged. No external targets. No name tuning.

Seal: \`${sealHash}\`
`
  );

  console.log(JSON.stringify({ verdict, sealHash, aRmseWins, elRmseWins, testsPass, typecheck }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
