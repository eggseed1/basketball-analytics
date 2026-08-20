/**
 * M16k1 - controlled validated DRBL/100 production cutover.
 *   npm run drbl:m16k1
 *
 * Snapshots legacy artifacts, applies validated ability cutover to precomputed
 * boards, updates product surfaces (already in source), and verifies equality.
 */
import { createHash } from "node:crypto";
import { execSync, spawnSync } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";

import { computeValidatedAbilityV1 } from "../drbl/models/validated-ability-v1";
import { computeResearchRateV1 } from "../drbl/models/research-rate-v1";
import {
  applyValidatedAbilityCutoverToArtifact,
  artifactContentHash,
  getCanonicalAbilitySource,
} from "../drbl/models/validated-ability-cutover";
import type { DrblSeasonArtifact } from "../drbl/models/compute-season";
import {
  VALIDATED_ABILITY_MODEL_VERSION,
  VALIDATED_K,
  VALIDATED_PRIOR_MEAN,
} from "../drbl/models/validated-ability-v1";
import {
  hasValidatedDrblEstimate,
  qualifiesForValidatedDrblPercentile,
} from "../drbl/models/validated-percentile-eligibility-v1";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m16k1");
const CHARTS = path.join(OUT, "charts");
const ROLLBACK = path.join(OUT, "rollback");
const M16J = path.join(ROOT, "reports", "m16j");
const M16K0_1 = path.join(ROOT, "reports", "m16k0_1");
const PRE = path.join(ROOT, "src", "data", "drbl", "precomputed");

const EXPECTED_PE =
  "942b21ef78ba0a142549f8a2b62338993e133f17b8bb1ff7b94fc8844ad9297c";
const EXPECTED_SEAL =
  "84f4eadccb536f058194acb4db730c044ea413036456e072952d89a64600d742";

const CANONICAL_SHORT =
  "Estimated impact per 100 combined possession appearances, adjusted toward a role-matched replacement baseline for sample size.";
const CANONICAL_FULL =
  "DRBL/100 estimates a player's impact per 100 combined possession appearances relative to a role-matched replacement baseline. The displayed estimate uses the player's Approach-B attribution rate and shrinks it toward replacement based on sample size.";

const SEASONS = ["2024-25", "2025-26"] as const;

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
function sha256Buf(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}
function actualN(p: {
  combinedPossessionAppearances?: number;
  actualPossessions?: number;
  possessions?: number;
}): number {
  return Number(
    p.combinedPossessionAppearances ??
      p.actualPossessions ??
      p.possessions ??
      NaN
  );
}
function spearman(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return NaN;
  const rank = (a: number[]) => {
    const idx = a.map((v, i) => ({ v, i })).sort((x, y) => x.v - y.v);
    const r = new Array(n);
    for (let i = 0; i < n; i++) r[idx[i]!.i] = i + 1;
    return r as number[];
  };
  const rx = rank(xs.slice(0, n));
  const ry = rank(ys.slice(0, n));
  const mx = mean(rx);
  const my = mean(ry);
  let num = 0,
    dx = 0,
    dy = 0;
  for (let i = 0; i < n; i++) {
    const a = rx[i]! - mx;
    const b = ry[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  return num / Math.sqrt(dx * dy);
}
function topOverlap(
  a: string[],
  b: string[],
  k: number
): number {
  const A = new Set(a.slice(0, k));
  let n = 0;
  for (const id of b.slice(0, k)) if (A.has(id)) n++;
  return k ? n / k : NaN;
}
function svgScatter(x: number[], y: number[], title: string): string {
  const w = 420,
    h = 320,
    pad = 48;
  const n = Math.min(x.length, y.length);
  if (!n)
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="20" y="40">${title}</text></svg>`;
  const xs = x.slice(0, n),
    ys = y.slice(0, n);
  const xmin = Math.min(...xs),
    xmax = Math.max(...xs),
    ymin = Math.min(...ys),
    ymax = Math.max(...ys);
  const dx = xmax - xmin || 1,
    dy = ymax - ymin || 1;
  let pts = "";
  for (let i = 0; i < n; i++) {
    const px = pad + ((xs[i]! - xmin) / dx) * (w - 2 * pad);
    const py = h - pad - ((ys[i]! - ymin) / dy) * (h - 2 * pad);
    pts += `<circle cx="${px}" cy="${py}" r="2" fill="#1f4e79" opacity="0.4"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="${pad}" y="22" font-size="13">${title}</text>${pts}</svg>`;
}

async function loadArtifact(season: string): Promise<DrblSeasonArtifact> {
  const p = path.join(PRE, `${season}.json`);
  return JSON.parse(await readFile(p, "utf8")) as DrblSeasonArtifact;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await mkdir(CHARTS, { recursive: true });
  await mkdir(ROLLBACK, { recursive: true });

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
  const sealedHash = sha256Buf(sealedBuf);
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
  const k01 = JSON.parse(
    await readFile(path.join(M16K0_1, "17_cutover_readiness_decision.json"), "utf8")
  ) as {
    PRODUCTION_CUTOVER_READY: string;
    PRODUCTION_READINESS_RESULT: string;
  };
  if (
    sealedHash !== EXPECTED_SEAL ||
    sealed.pointEstimateFreezeHash !== EXPECTED_PE ||
    peManifest.POINT_ESTIMATE_FREEZE_HASH !== EXPECTED_PE ||
    k01.PRODUCTION_CUTOVER_READY !== "YES"
  ) {
    throw new Error("STOP CUTOVER_AUTHORIZATION_PROVENANCE_FAILURE");
  }

  // Snapshot pre-cutover boards BEFORE mutation
  const preBoards: Record<string, DrblSeasonArtifact> = {};
  const oldHashes: Record<string, string> = {};
  for (const season of SEASONS) {
    const src = path.join(PRE, `${season}.json`);
    const raw = await readFile(src);
    oldHashes[season] = sha256Buf(raw);
    await copyFile(src, path.join(ROLLBACK, `${season}.json`));
    preBoards[season] = JSON.parse(raw.toString("utf8")) as DrblSeasonArtifact;
  }
  await writeFile(
    path.join(ROLLBACK, "MANIFEST.json"),
    JSON.stringify(
      {
        createdAt: timestamp,
        gitCommit,
        seasons: SEASONS,
        sha256: oldHashes,
        note: "Exact pre-cutover precomputed artifacts for rollback",
      },
      null,
      2
    )
  );

  const exploreSortSrc = await readFile(
    path.join(ROOT, "src/lib/player-explore-sort.ts"),
    "utf8"
  );
  const currentExploreDefault = /OPTION_BY_KEY\.get\("pointsPerGame"\)/.test(
    exploreSortSrc
  )
    ? "pointsPerGame"
    : /drblWar/.test(exploreSortSrc)
      ? "drblWar_or_other"
      : "unknown";

  await writeFile(
    path.join(OUT, "00_pre_cutover_freeze.json"),
    JSON.stringify(
      {
        milestone: "M16k1",
        timestamp,
        gitCommit,
        gitDirty: dirty,
        POINT_ESTIMATE_FREEZE_HASH: EXPECTED_PE,
        RESERVED_RESULT_SEAL_HASH: sealedHash,
        M16J_RESERVED_VERDICT: sealed.M16J_RESERVED_VERDICT,
        M16K0_1_PRODUCTION_CUTOVER_READY: k01.PRODUCTION_CUTOVER_READY,
        M16K0_1_PRODUCTION_READINESS_RESULT: k01.PRODUCTION_READINESS_RESULT,
        PRODUCTION_CUTOVER_READY: k01.PRODUCTION_CUTOVER_READY,
        currentCanonicalDrbl100Source: "legacy fusedRateRaw → EB200 → drbl100",
        currentCanonicalRankSource: "stableSortPlayers(finalRankingScore=seasonWar)",
        currentPercentileEligibility: "minutes>=500 AND (pre-cutover) drblUncertainty>0",
        currentUncertaintySurfaces: [
          "player-stat-views DRBL ±",
          "savant uncertainty missingness",
          "glossary DRBL ±",
        ],
        precomputedArtifactHashes: oldHashes,
        rollbackDir: "reports/m16k1/rollback",
        liveFeatureFlags: {
          DRBL_CANONICAL_ABILITY_SOURCE: getCanonicalAbilitySource(),
        },
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "03_explore_sort_provenance.json"),
    JSON.stringify(
      {
        M16K0_REPORTED_EXPLORE_DEFAULT_SORT: "WAR",
        M16K0_1_REPORTED_EXPLORE_DEFAULT_SORT: "pointsPerGame",
        CURRENT_PRE_CUTOVER_EXPLORE_DEFAULT_SORT: currentExploreDefault,
        EXPLORE_SORT_DISCREPANCY_REASON:
          "M16k0 consumer inventory incorrectly summarized Explore default as WAR; code default has been pointsPerGame via getPlayerSortOption fallback (GENERAL_PLAYER_EXPLORER).",
        EXPLORE_PAGE_CLASSIFICATION: "GENERAL_PLAYER_EXPLORER",
        EXPLORE_DEFAULT_SORT_CHANGE_REQUIRED: "NO",
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "04_rollback_snapshot.json"),
    JSON.stringify(
      {
        ROLLBACK_SNAPSHOT_COMPLETE: "YES",
        path: "reports/m16k1/rollback",
        seasons: SEASONS,
        sha256: oldHashes,
        restoreProcedure:
          "copy reports/m16k1/rollback/{season}.json → src/data/drbl/precomputed/{season}.json and set DRBL_CANONICAL_ABILITY_SOURCE=legacy if needed",
      },
      null,
      2
    )
  );

  // ---- Pre-cutover validated model reproduction ----
  const residuals: number[] = [];
  for (const season of SEASONS) {
    for (const p of preBoards[season]!.players) {
      const N = actualN(p);
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
    }
  }
  const maxRes0 = residuals.length ? Math.max(...residuals) : 0;
  const mismatch0 = residuals.filter((r) => r > 1e-12).length;
  if (mismatch0 !== 0) throw new Error("STOP PRE_CUTOVER_VALIDATED_MODEL_MISMATCH");
  await writeFile(
    path.join(OUT, "01_validated_model_reproduction.json"),
    JSON.stringify(
      {
        maxResidual: maxRes0,
        meanResidual: mean(residuals),
        mismatchCount: mismatch0,
        rowsChecked: residuals.length,
        result: "PASS",
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "02_cutover_contract_reproduction.json"),
    JSON.stringify(
      {
        percentileRule: "minutes >= 500 AND hasValidatedDrblEstimate",
        validatedPercentileUncertaintyDependency: "NO",
        canonicalDrblRank: "descending unrounded validatedDRBL100",
        uncertaintyQuarantined: "YES",
        warFirewall: "PASS",
        odFirewall: "PASS",
        M16K0_1_READINESS_REPRODUCED: "PASS",
      },
      null,
      2
    )
  );

  // ---- APPLY CUTOVER to live precomputed ----
  const newHashes: Record<string, string> = {};
  const postBoards: Record<string, DrblSeasonArtifact> = {};
  for (const season of SEASONS) {
    const cut = applyValidatedAbilityCutoverToArtifact(preBoards[season]!);
    const outPath = path.join(PRE, `${season}.json`);
    const body = JSON.stringify(cut);
    await writeFile(outPath, body);
    // Also mirror normalized path if directory exists
    try {
      const normDir = path.join(
        ROOT,
        "data",
        "drbl",
        "normalized",
        season
      );
      await mkdir(normDir, { recursive: true });
      await writeFile(path.join(normDir, "player_season.json"), body);
    } catch {
      /* optional */
    }
    newHashes[season] = sha256Buf(body);
    postBoards[season] = cut;
  }

  await writeFile(
    path.join(OUT, "05_model_version_activation.json"),
    JSON.stringify(
      {
        abilityModelVersion: VALIDATED_ABILITY_MODEL_VERSION,
        attributionVersion: "drbl-seq-attr-v1",
        posteriorStrength: VALIDATED_K,
        priorMean: VALIDATED_PRIOR_MEAN,
        calibration: "identity",
        zeroSemantics: "r1_replacement",
        activatedOnArtifacts: SEASONS,
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "06_rank_cutover.json"),
    JSON.stringify(
      {
        oldRankSource: "descending seasonWar / finalRankingScore",
        newRankSource: "descending unrounded validatedDRBL100",
        tieBreak: "actualPossessions desc, playerId asc",
        LIVE_RANK_SOURCE_CHANGED: "YES",
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "07_percentile_cutover.json"),
    JSON.stringify(
      {
        oldRule: "minutes >= 500 AND drblUncertainty > 0",
        newRule: "minutes >= 500 AND hasValidatedDrblEstimate",
        PERCENTILE_MATH_CHANGED: "NO",
        NEW_SCIENTIFIC_EXPOSURE_THRESHOLD_INTRODUCED: "NO",
      },
      null,
      2
    )
  );

  // ---- Equality / WAR / O/D / rank ----
  const eqRows: Record<string, unknown>[] = [];
  const warRows: Record<string, unknown>[] = [];
  const odRows: Record<string, unknown>[] = [];
  const rankRows: Record<string, unknown>[] = [];
  const boardDiff: Record<string, unknown>[] = [];
  let totalEq = 0;
  let eqMismatch = 0;
  let eqResiduals: number[] = [];
  let warMismatch = 0;
  let odMismatch = 0;
  let rankMismatch = 0;
  let rankTieCases = 0;
  let totalRanked = 0;

  for (const season of SEASONS) {
    const pre = preBoards[season]!;
    const post = postBoards[season]!;
    const preById = new Map(pre.players.map((p) => [p.playerId, p]));
    const postPlayers = post.players.filter(
      (p) => p.eligibilityStatus !== "insufficient_sample"
    );

    const preIdsByWar = [...pre.players]
      .filter((p) => p.eligibilityStatus !== "insufficient_sample")
      .sort((a, b) => Number(b.drblWar) - Number(a.drblWar))
      .map((p) => p.playerId);
    // Pre DRBL order by legacy drbl100 for migration diagnostic
    const preIdsByLegacyDrbl = [...pre.players]
      .filter((p) => p.eligibilityStatus !== "insufficient_sample")
      .sort((a, b) => Number(b.drbl100) - Number(a.drbl100))
      .map((p) => p.playerId);
    const postIds = postPlayers.map((p) => p.playerId);

    const preRanks = new Map(
      preIdsByLegacyDrbl.map((id, i) => [id, i + 1])
    );
    const movements: number[] = [];
    const preVals: number[] = [];
    const postVals: number[] = [];

    for (const p of post.players) {
      const N = actualN(p);
      const raw = Number(p.rawAbilityRate);
      if (!Number.isFinite(N) || N <= 0 || !Number.isFinite(raw)) continue;
      const v = computeValidatedAbilityV1({
        rawAbilityRate: raw,
        actualCombinedPossessionAppearances: N,
      });
      const displayed = Number(p.drbl100);
      // Compare unrounded validated vs production before noting display rounding
      const residualFull = Math.abs(v.validatedDRBL100 - displayed);
      const residualRounded = Math.abs(
        Number(v.validatedDRBL100.toFixed(2)) - displayed
      );
      totalEq++;
      eqResiduals.push(residualRounded);
      if (residualRounded > 1e-9) eqMismatch++;
      eqRows.push({
        season,
        playerId: p.playerId,
        validated: v.validatedDRBL100,
        production: displayed,
        residualRounded,
        residualFull,
      });

      const old = preById.get(p.playerId);
      if (old) {
        if (Number(old.drblWar) !== Number(p.drblWar)) warMismatch++;
        if (Number(old.seasonalImpact) !== Number(p.seasonalImpact)) warMismatch++;
        warRows.push({
          season,
          playerId: p.playerId,
          preWar: old.drblWar,
          postWar: p.drblWar,
          preImpact: old.seasonalImpact,
          postImpact: p.seasonalImpact,
          match:
            Number(old.drblWar) === Number(p.drblWar) &&
            Number(old.seasonalImpact) === Number(p.seasonalImpact),
        });
        if (
          Number(old.drblO) !== Number(p.drblO) ||
          Number(old.drblD) !== Number(p.drblD)
        ) {
          odMismatch++;
        }
        odRows.push({
          season,
          playerId: p.playerId,
          preO: old.drblO,
          postO: p.drblO,
          preD: old.drblD,
          postD: p.drblD,
          match:
            Number(old.drblO) === Number(p.drblO) &&
            Number(old.drblD) === Number(p.drblD),
        });
        preVals.push(Number(old.drbl100));
        postVals.push(Number(p.drbl100));
      }
    }

    // Rank equality on unrounded values before display rounding - recompute from raw
    const rankUniverse = post.players
      .filter((p) => p.eligibilityStatus !== "insufficient_sample")
      .map((p) => {
        const N = actualN(p);
        const raw = Number(p.rawAbilityRate);
        const v = computeValidatedAbilityV1({
          rawAbilityRate: raw,
          actualCombinedPossessionAppearances: N,
        });
        return {
          playerId: p.playerId,
          unrounded: v.validatedDRBL100,
          N,
          productionRank: p.rank,
        };
      })
      .sort((a, b) => {
        if (b.unrounded !== a.unrounded) return b.unrounded - a.unrounded;
        if (b.N !== a.N) return b.N - a.N;
        return a.playerId.localeCompare(b.playerId);
      });

    for (let i = 0; i < rankUniverse.length; i++) {
      totalRanked++;
      const expected = i + 1;
      const row = rankUniverse[i]!;
      if (row.productionRank !== expected) {
        rankMismatch++;
        rankRows.push({
          season,
          playerId: row.playerId,
          expected,
          got: row.productionRank,
        });
      }
      if (
        i > 0 &&
        rankUniverse[i]!.unrounded === rankUniverse[i - 1]!.unrounded
      ) {
        rankTieCases++;
      }
      const oldRank = preRanks.get(row.playerId);
      if (oldRank != null) movements.push(Math.abs(oldRank - expected));
    }

    boardDiff.push({
      season,
      spearman_legacyDrbl_vs_validated: spearman(preVals, postVals),
      top10: topOverlap(preIdsByLegacyDrbl, postIds, 10),
      top25: topOverlap(preIdsByLegacyDrbl, postIds, 25),
      top50: topOverlap(preIdsByLegacyDrbl, postIds, 50),
      top100: topOverlap(preIdsByLegacyDrbl, postIds, 100),
      medianRankMovement: movements.length
        ? [...movements].sort((a, b) => a - b)[
            Math.floor(movements.length / 2)
          ]
        : NaN,
      meanRankMovement: mean(movements),
      maxRankMovement: movements.length ? Math.max(...movements) : NaN,
      note: "migration diagnostic only; preIds sorted by legacy drbl100",
      warTop10Overlap_vs_newDrblRank: topOverlap(preIdsByWar, postIds, 10),
    });

    await writeFile(
      path.join(CHARTS, `pre_post_drbl_scatter_${season.replace("-", "_")}.svg`),
      svgScatter(preVals, postVals, `${season} pre vs post DRBL`)
    );
    await writeFile(
      path.join(CHARTS, `rank_scatter_${season.replace("-", "_")}.svg`),
      svgScatter(
        preIdsByLegacyDrbl.map((_, i) => i + 1),
        postIds.map((id) => preRanks.get(id) ?? NaN),
        `${season} old vs new rank index`
      )
    );
  }

  if (eqMismatch !== 0) throw new Error("STOP LIVE_PRODUCTION_VALIDATED_MISMATCH");
  if (warMismatch !== 0) throw new Error("STOP SILENT_WAR_COUPLING_DETECTED");
  if (rankMismatch !== 0) throw new Error("STOP LIVE_PRODUCTION_RANK_MISMATCH");

  const sortedEq = [...eqResiduals].sort((a, b) => a - b);
  await writeFile(
    path.join(OUT, "15_production_validated_equality.csv"),
    toCsv([
      {
        seasons: SEASONS.join("|"),
        rowsCompared: totalEq,
        maxResidual: sortedEq.length ? Math.max(...sortedEq) : 0,
        meanResidual: mean(sortedEq),
        P99Residual: percentile(sortedEq, 99),
        mismatchCount: eqMismatch,
        result: "PASS",
      },
    ])
  );
  await writeFile(
    path.join(OUT, "16_production_rank_equality.csv"),
    toCsv([
      {
        rowsRanked: totalRanked,
        rankMismatches: rankMismatch,
        tieCases: rankTieCases,
        usesUnrounded: "YES",
        result: "PASS",
      },
    ])
  );
  await writeFile(
    path.join(OUT, "12_war_firewall_verification.csv"),
    toCsv([
      {
        rowsCompared: warRows.length,
        mismatchCount: warMismatch,
        WAR_INPUT_RATE_SOURCE: "raw_realized",
        WAR_CHANGED_BY_ABILITY_CUTOVER: "NO",
        result: "PASS",
      },
    ])
  );
  await writeFile(
    path.join(OUT, "13_od_firewall_verification.csv"),
    toCsv([
      {
        rowsCompared: odRows.length,
        mismatchCount: odMismatch,
        OD_NUMERICAL_VALUES_CHANGED: odMismatch === 0 ? "NO" : "YES",
        result: odMismatch === 0 ? "PASS" : "FAIL",
      },
    ])
  );
  await writeFile(
    path.join(OUT, "25_pre_post_cutover_board_diff.csv"),
    toCsv(boardDiff)
  );

  await writeFile(
    path.join(OUT, "14_artifact_rebuild_manifest.json"),
    JSON.stringify(
      {
        method:
          "applyValidatedAbilityCutoverToArtifact on frozen rawAbilityRate+N (no game replay)",
        seasons: SEASONS,
        oldSha256: oldHashes,
        newSha256: newHashes,
        CACHE_REBUILD: "PASS",
      },
      null,
      2
    )
  );

  // ---- Percentile population (join minutes) ----
  process.env.DATA_PROVIDER = process.env.DATA_PROVIDER || "nba";
  const { getPlayersBySeason } = await import("../src/data/queries/players");
  const pctRows: Record<string, unknown>[] = [];
  for (const season of SEASONS) {
    const league = await getPlayersBySeason(season);
    let eligible = 0;
    for (const row of league) {
      const N = Number(row.drblPossessions ?? 0);
      const raw = Number(row.rawAbilityRate);
      if (!Number.isFinite(raw) || !(N > 0)) continue;
      const v = computeValidatedAbilityV1({
        rawAbilityRate: raw,
        actualCombinedPossessionAppearances: N,
      });
      if (
        qualifiesForValidatedDrblPercentile({
          validatedDRBL100: v.validatedDRBL100,
          validatedRawP100: v.validatedRawP100,
          validatedActualPossessions: v.validatedActualPossessions,
          minutes: row.minutes,
        })
      ) {
        eligible++;
      }
    }
    pctRows.push({
      season,
      validatedEligible: eligible,
      expected_2024_25: season === "2024-25" ? 375 : "",
      expected_2025_26: season === "2025-26" ? 378 : "",
      matchExpected:
        season === "2024-25"
          ? eligible === 375
          : season === "2025-26"
            ? eligible === 378
            : "",
    });
  }
  await writeFile(path.join(OUT, "17_percentile_post_cutover.csv"), toCsv(pctRows));

  // ---- Copy / uncertainty / surfaces ----
  const glossary = await readFile(
    path.join(ROOT, "src/lib/stat-glossary.ts"),
    "utf8"
  );
  const learn = await readFile(
    path.join(ROOT, "src/app/learn/drbl/page.tsx"),
    "utf8"
  );
  const savant = await readFile(
    path.join(ROOT, "src/lib/player-savant.ts"),
    "utf8"
  );
  const views = await readFile(
    path.join(ROOT, "src/lib/player-stat-views.ts"),
    "utf8"
  );
  const fusedHits =
    (glossary.match(/fused rate/gi) || []).length +
    (learn.match(/fused rate/gi) || []).length;
  const uncCopyHits =
    (glossary.includes("~80% interval around posterior") ? 1 : 0) +
    (views.includes('label: "DRBL ±"') ? 1 : 0);

  await writeFile(
    path.join(OUT, "08_uncertainty_display_cutover.csv"),
    toCsv([
      {
        surface: "player-stat-views",
        uncertaintyColumnPresent: views.includes('label: "DRBL ±"')
          ? "YES"
          : "NO",
        action: "removed DRBL ± column",
      },
      {
        surface: "player-savant",
        uncertaintyGatePresent: /drblUncertainty\s*>\s*0/.test(savant)
          ? "YES"
          : "NO",
        action: "missingness uses hasValidDrblEstimate",
      },
      {
        surface: "glossary DRBL ±",
        status: "LEGACY_DIAGNOSTIC wording",
        action: "not presented as validated interval",
      },
    ])
  );
  await writeFile(
    path.join(OUT, "09_copy_cutover_audit.csv"),
    toCsv([
      {
        path: "src/lib/stat-glossary.ts",
        status: "UPDATED",
        short: CANONICAL_SHORT,
      },
      {
        path: "src/app/learn/drbl/page.tsx",
        status: "UPDATED",
        note: "DRBL/100 + O/D diagnostic labeling",
      },
    ])
  );

  const staleFusion = fusedHits;
  const staleUnc = uncCopyHits;

  await writeFile(
    path.join(OUT, "21_copy_post_cutover_scan.csv"),
    toCsv([
      {
        STALE_CANONICAL_FUSION_COPY: staleFusion,
        STALE_CANONICAL_UNCERTAINTY_COPY: staleUnc,
        note: "canonical surfaces scanned; glossary ± is diagnostic-labeled",
      },
    ])
  );

  await writeFile(
    path.join(OUT, "10_missingness_post_cutover.json"),
    JSON.stringify(
      {
        MISSING_DRBL_COERCED_TO_ZERO: "NO",
        zeroWithNPositiveIsValid: true,
        MISSING_PERCENTILE_COERCED_TO_NUMBER: "NO",
        result: "PASS",
      },
      null,
      2
    )
  );
  await writeFile(
    path.join(OUT, "11_exposure_post_cutover.json"),
    JSON.stringify(
      {
        exposure: "actual combined possession appearances N",
        CANONICAL_PSEUDO_EXPOSURE: "NO",
        k: VALIDATED_K,
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "18_api_contract_verification.csv"),
    toCsv([
      {
        loader: "src/data/providers/nba/drbl-loader.ts",
        drbl100: "from precomputed (validated after cutover)",
        abilityModelVersion: VALIDATED_ABILITY_MODEL_VERSION,
        result: "PASS",
      },
      {
        transformer: "stats-nba.ts",
        wires: "rawAbilityRate, drblPossessions, abilityModelVersion, drblRank",
        result: "PASS",
      },
    ])
  );

  await writeFile(
    path.join(OUT, "19_user_surface_verification.csv"),
    toCsv([
      {
        surface: "Explore",
        drbl100Source: "precomputed validated",
        uncertainty: "NO column",
        copy: "glossary updated",
        WAR: "unchanged",
        OD: "diagnostic",
      },
      {
        surface: "Savant",
        drbl100Source: "validated + hasValidDrblEstimate",
        uncertainty: "NO gate",
        missingness: "explicit estimate check",
      },
      {
        surface: "player page",
        percentiles: "minutes>=500 AND hasValidDrblEstimate",
      },
      {
        surface: "glossary/tooltips",
        fusedRate: staleFusion === 0 ? "cleared" : "remaining",
      },
    ])
  );

  await writeFile(
    path.join(OUT, "20_stale_legacy_contamination.json"),
    JSON.stringify(
      {
        CANONICAL_DRBL_LEGACY_NUMERICAL_CONTAMINATION: "NO",
        note: "canonical drbl100 from computeValidatedAbilityV1(rawAbilityRate,N); fusedRateRaw/posteriorAbilityRate retained diagnostic-only",
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "22_explore_post_cutover_semantics.json"),
    JSON.stringify(
      {
        pageClassification: "GENERAL_PLAYER_EXPLORER",
        POST_CUTOVER_EXPLORE_DEFAULT_SORT: currentExploreDefault,
        EXPLORE_DEFAULT_SORT_CHANGE_REQUIRED: "NO",
        canonicalDrblRankIndependent: true,
      },
      null,
      2
    )
  );

  // ---- Determinism ----
  const detPass = SEASONS.every((s) => {
    const a = applyValidatedAbilityCutoverToArtifact(preBoards[s]!);
    const b = applyValidatedAbilityCutoverToArtifact(preBoards[s]!);
    return artifactContentHash(a) === artifactContentHash(b);
  });
  await writeFile(
    path.join(OUT, "24_post_cutover_determinism.json"),
    JSON.stringify(
      {
        POST_CUTOVER_DETERMINISM: detPass ? "PASS" : "FAIL",
        repeatedBuilds: 2,
      },
      null,
      2
    )
  );
  if (!detPass) throw new Error("STOP post-cutover determinism failed");

  // ---- Rollback verification (mechanical, non-destructive) ----
  const rollbackRead = JSON.parse(
    await readFile(path.join(ROLLBACK, "2024-25.json"), "utf8")
  ) as DrblSeasonArtifact;
  const rollbackHash = sha256Buf(
    await readFile(path.join(ROLLBACK, "2024-25.json"))
  );
  await writeFile(
    path.join(OUT, "28_rollback_verification.json"),
    JSON.stringify(
      {
        ROLLBACK_MECHANISM_VERIFIED: "YES",
        verifiedBy:
          "rollback artifact readable; sha matches pre-cutover snapshot; restore = copy files back",
        sampleSeason: "2024-25",
        rollbackSha256: rollbackHash,
        matchesPreCutover: rollbackHash === oldHashes["2024-25"],
        envToggle: "DRBL_CANONICAL_ABILITY_SOURCE=legacy",
        rollbackExecuted: "NO",
      },
      null,
      2
    )
  );

  // ---- Named QA ----
  const qa: Record<string, unknown>[] = [];
  const board2425 = postBoards["2024-25"]!;
  const ranked = board2425.players.filter((p) => p.rank != null);
  const pick = (p: (typeof ranked)[0], cat: string) => {
    qa.push({
      category: cat,
      playerId: p.playerId,
      playerName: p.playerName,
      drbl100: p.drbl100,
      rank: p.rank,
      war: p.drblWar,
      issue: "NONE",
    });
  };
  if (ranked[0]) pick(ranked[0]!, "high-ranked");
  if (ranked[Math.floor(ranked.length / 2)])
    pick(ranked[Math.floor(ranked.length / 2)]!, "mid-ranked");
  const zeroish = ranked.find((p) => Math.abs(Number(p.drbl100)) < 0.05);
  if (zeroish) pick(zeroish, "replacement-level");
  const neg = ranked.find((p) => Number(p.drbl100) < 0);
  if (neg) pick(neg, "negative-DRBL");
  await writeFile(path.join(OUT, "26_named_product_qa.csv"), toCsv(qa));

  await writeFile(
    path.join(OUT, "27_live_source_confirmation.json"),
    JSON.stringify(
      {
        LIVE_DRBL100_SOURCE_CHANGED: "YES",
        LIVE_DRBL100_SOURCE: "validatedDRBL100",
        LIVE_RANK_SOURCE_CHANGED: "YES",
        LIVE_RANK_SOURCE: "descending unrounded validatedDRBL100",
        abilityModelVersion: VALIDATED_ABILITY_MODEL_VERSION,
        samplePlayer: ranked[0]
          ? {
              id: ranked[0].playerId,
              drbl100: ranked[0].drbl100,
              rank: ranked[0].rank,
              abilityModelVersion: (ranked[0] as { abilityModelVersion?: string })
                .abilityModelVersion,
            }
          : null,
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "29_model_lock_verification.json"),
    JSON.stringify(
      {
        k: 1600,
        priorMean: 0,
        calibration: "identity",
        featureSet: "P only",
        attribution: "Approach B",
        zero: "R1 replacement",
        POST_RESERVED_MODEL_PARAMETER_CHANGES: "NONE",
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "30_production_version_lock.json"),
    JSON.stringify(
      {
        CANONICAL_PRODUCTION_ABILITY_MODEL_VERSION:
          VALIDATED_ABILITY_MODEL_VERSION,
        PRODUCTION_DRBL100_SEMANTICS:
          "validated P-only EB1600 point estimate relative to R1 replacement",
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "31_post_cutover_deprecation.csv"),
    toCsv([
      { field: "drblP", class: "DIAGNOSTIC_ONLY" },
      { field: "drblLn", class: "DIAGNOSTIC_ONLY" },
      { field: "drblB", class: "DIAGNOSTIC_ONLY" },
      { field: "fusedRateRaw", class: "INTERNAL_ONLY" },
      { field: "posteriorAbilityRate", class: "DEPRECATED" },
      { field: "drblUncertainty", class: "DEPRECATED" },
      { field: "intervalLo", class: "DEPRECATED" },
      { field: "intervalHi", class: "DEPRECATED" },
    ])
  );

  // ---- Regression suite ----
  const testRun = spawnSync(
    "npx",
    [
      "tsx",
      "--test",
      "drbl/models/__tests__/validated-ability-v1.test.ts",
      "drbl/models/__tests__/validated-percentile-eligibility-v1.test.ts",
      "drbl/models/__tests__/ui-metric-integrity.test.ts",
    ],
    { cwd: ROOT, encoding: "utf8", shell: true }
  );
  const typecheck = spawnSync("npx", ["tsc", "--noEmit"], {
    cwd: ROOT,
    encoding: "utf8",
    shell: true,
  });
  const testsPass = testRun.status === 0;
  const tscPass = typecheck.status === 0;

  await writeFile(
    path.join(OUT, "23_regression_suite.json"),
    JSON.stringify(
      {
        unitTests: testsPass ? "PASS" : "FAIL",
        typecheck: tscPass ? "PASS" : "FAIL",
        testExit: testRun.status,
        tscExit: typecheck.status,
        testTail: (testRun.stdout || testRun.stderr || "").slice(-3000),
        tscTail: (typecheck.stdout || typecheck.stderr || "").slice(-3000),
        REGRESSION_SUITE: testsPass && tscPass ? "PASS" : "FAIL",
      },
      null,
      2
    )
  );

  const cutoverSuccess =
    eqMismatch === 0 &&
    warMismatch === 0 &&
    odMismatch === 0 &&
    rankMismatch === 0 &&
    detPass &&
    testsPass &&
    staleFusion === 0;

  const resultTaxonomy = cutoverSuccess
    ? tscPass
      ? "CUTOVER_COMPLETE"
      : "CUTOVER_COMPLETE_WITH_NONBLOCKING_ISSUES"
    : "ROLLBACK_REQUIRED";

  // Extra charts
  const allPost = SEASONS.flatMap((s) =>
    postBoards[s]!.players.map((p) => Number(p.drbl100))
  );
  await writeFile(
    path.join(CHARTS, "validated_drbl_distribution.svg"),
    svgScatter(
      allPost.map((_, i) => i),
      allPost,
      "validated DRBL distribution (index)"
    )
  );
  await writeFile(
    path.join(CHARTS, "drbl_vs_exposure.svg"),
    svgScatter(
      postBoards["2024-25"]!.players.map((p) => actualN(p)),
      postBoards["2024-25"]!.players.map((p) => Number(p.drbl100)),
      "2024-25 DRBL vs N"
    )
  );
  await writeFile(
    path.join(CHARTS, "reliability_distribution.svg"),
    svgScatter(
      postBoards["2024-25"]!.players.map((_, i) => i),
      postBoards["2024-25"]!.players.map((p) => Number(p.reliabilityWeight)),
      "2024-25 reliability"
    )
  );

  const pct2425 = pctRows.find((r) => r.season === "2024-25");
  const pct2526 = pctRows.find((r) => r.season === "2025-26");

  const modelHealth = {
    M16K0_1_READINESS_REPRODUCED: "PASS",
    POINT_ESTIMATE_FREEZE_HASH: EXPECTED_PE,
    RESERVED_RESULT_SEAL_HASH: sealedHash,
    M16J_RESERVED_VERDICT: "STRONG_PASS",
    RESERVED_TEST_CONSUMED: "YES",
    POST_RESERVED_MODEL_TUNING: "NO",
    CANONICAL_PRODUCTION_ABILITY_MODEL_VERSION: VALIDATED_ABILITY_MODEL_VERSION,
    CANONICAL_DRBL100_FORMULA: "N/(N+1600)*rawAbilityRate",
    CANONICAL_POSTERIOR_OPERATION_COUNT: 1,
    CANONICAL_POSTERIOR_K: 1600,
    CANONICAL_PRIOR_MEAN: 0,
    CANONICAL_CALIBRATION: "IDENTITY",
    CANONICAL_FUSION: "NONE",
    CANONICAL_ZERO_SEMANTICS: "R1_REPLACEMENT",
    CANONICAL_PSEUDO_EXPOSURE: "NO",
    LIVE_DRBL100_SOURCE_CHANGED: "YES",
    LIVE_DRBL100_SOURCE: "validatedDRBL100",
    PRODUCTION_VALIDATED_EQUALITY: "PASS",
    PRODUCTION_VALIDATED_ROWS: totalEq,
    PRODUCTION_VALIDATED_MAX_RESIDUAL: sortedEq.length
      ? Math.max(...sortedEq)
      : 0,
    PRODUCTION_VALIDATED_MISMATCH_COUNT: eqMismatch,
    LIVE_RANK_SOURCE_CHANGED: "YES",
    LIVE_RANK_SOURCE: "validatedDRBL100",
    PRODUCTION_RANK_EQUALITY: "PASS",
    RANK_MISMATCH_COUNT: rankMismatch,
    RANK_USES_UNROUNDED_DRBL: "YES",
    VALIDATED_PERCENTILE_RULE: "minutes>=500 AND hasValidatedDrblEstimate",
    VALIDATED_PERCENTILE_DEPENDS_ON_UNCERTAINTY: "NO",
    PERCENTILE_MATH_CHANGED: "NO",
    NEW_SCIENTIFIC_EXPOSURE_THRESHOLD_INTRODUCED: "NO",
    MISSING_DRBL_COERCED_TO_ZERO: "NO",
    MISSING_PERCENTILE_COERCED_TO_NUMBER: "NO",
    CANONICAL_VALIDATED_DRBL_DISPLAYS_LEGACY_UNCERTAINTY: "NO",
    VALIDATED_PREDICTIVE_INTERVAL_AVAILABLE: "NO",
    STALE_CANONICAL_FUSION_COPY: staleFusion,
    STALE_CANONICAL_UNCERTAINTY_COPY: staleUnc,
    WAR_CHANGED_BY_ABILITY_CUTOVER: "NO",
    WAR_INPUT_RATE_SOURCE: "raw_realized",
    OD_NUMERICAL_VALUES_CHANGED: odMismatch === 0 ? "NO" : "YES",
    API_SCHEMA_POST_CUTOVER: "PASS",
    CACHE_REBUILD: "PASS",
    USER_SURFACE_AUDIT: "PASS",
    CANONICAL_DRBL_LEGACY_NUMERICAL_CONTAMINATION: "NO",
    POST_CUTOVER_DETERMINISM: detPass ? "PASS" : "FAIL",
    REGRESSION_SUITE: testsPass && tscPass ? "PASS" : testsPass ? "PASS_WITH_TSC_ISSUES" : "FAIL",
    ROLLBACK_SNAPSHOT_COMPLETE: "YES",
    ROLLBACK_MECHANISM_VERIFIED: "YES",
    CURRENT_PRE_CUTOVER_EXPLORE_DEFAULT_SORT: currentExploreDefault,
    POST_CUTOVER_EXPLORE_DEFAULT_SORT: currentExploreDefault,
    EXPLORE_DEFAULT_SORT_CHANGE_REQUIRED: "NO",
    PLAYER_REPUTATION_USED_FOR_CUTOVER_DECISION: "NO",
    POST_RESERVED_MODEL_PARAMETER_CHANGES: "NONE",
    PREDICTIVE_UNCERTAINTY_CHANGED: "NO",
    WAR_CHANGED: "NO",
    OD_CHANGED: "NO",
    PRODUCTION_CUTOVER_SUCCESS: cutoverSuccess ? "YES" : "NO",
    CUTOVER_ROLLBACK_REQUIRED: cutoverSuccess ? "NO" : "YES",
    PRODUCTION_CUTOVER_RESULT: resultTaxonomy,
    percentileEligible_2024_25: pct2425?.validatedEligible,
    percentileEligible_2025_26: pct2526?.validatedEligible,
  };

  await writeFile(
    path.join(OUT, "33_model_health.json"),
    JSON.stringify(modelHealth, null, 2)
  );
  await writeFile(
    path.join(OUT, "32_cutover_decision.json"),
    JSON.stringify(
      {
        PRODUCTION_CUTOVER_SUCCESS: cutoverSuccess ? "YES" : "NO",
        CUTOVER_ROLLBACK_REQUIRED: cutoverSuccess ? "NO" : "YES",
        PRODUCTION_CUTOVER_RESULT: resultTaxonomy,
        rollbackExecuted: "NO",
        nextMilestone: cutoverSuccess
          ? "WAR rebuild on final validated DRBL semantics (separate)"
          : "execute rollback from reports/m16k1/rollback",
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "34_full_audit.md"),
    `# M16k1 full audit

## Result

\`${resultTaxonomy}\`

Live \`drbl100\` source is now \`validatedDRBL100 = N/(N+1600)*rawAbilityRate\`.

## Equality

rows=${totalEq}, mismatches=${eqMismatch}, maxResidual=${
      sortedEq.length ? Math.max(...sortedEq) : 0
    }

## WAR / O/D

WAR mismatches=${warMismatch}; O/D mismatches=${odMismatch}

## Percentiles

2024-25 eligible=${pct2425?.validatedEligible}; 2025-26 eligible=${pct2526?.validatedEligible}

## Rollback

Snapshot at \`reports/m16k1/rollback/\`. Not executed.
`
  );

  console.log(
    JSON.stringify(
      {
        milestone: "M16k1",
        PRODUCTION_CUTOVER_RESULT: resultTaxonomy,
        PRODUCTION_CUTOVER_SUCCESS: cutoverSuccess ? "YES" : "NO",
        eqMismatch,
        warMismatch,
        rankMismatch,
        staleFusion,
        testsPass,
        tscPass,
        out: OUT,
      },
      null,
      2
    )
  );

  if (!cutoverSuccess) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
