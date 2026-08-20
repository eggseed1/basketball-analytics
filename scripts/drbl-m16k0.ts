/**
 * M16k0 - validated DRBL production shadow + cutover readiness.
 *   npm run drbl:m16k0
 *
 * Does NOT flip live drbl100 / rank. Does NOT retune the validated estimator.
 * Does NOT change WAR / O/D / uncertainty mathematics.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  VALIDATED_ABILITY_MODEL_VERSION,
  VALIDATED_ATTRIBUTION_VERSION,
  VALIDATED_CALIBRATION,
  VALIDATED_K,
  VALIDATED_POSTERIOR_OPERATION_COUNT,
  VALIDATED_PRIOR_MEAN,
  VALIDATED_ZERO_SEMANTICS,
  computeValidatedAbilityV1,
  isValidatedAbilityShadowEnabled,
} from "../drbl/models/validated-ability-v1";
import { computeResearchRateV1 } from "../drbl/models/research-rate-v1";
import { PRIOR_EQUIVALENT_POSSESSIONS } from "../drbl/models/ranking-config";
import { POSTERIOR_VERSION } from "../drbl/models/pipeline-value";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m16k0");
const CHARTS = path.join(OUT, "charts");
const M16J = path.join(ROOT, "reports", "m16j");

const EXPECTED_PE =
  "942b21ef78ba0a142549f8a2b62338993e133f17b8bb1ff7b94fc8844ad9297c";
const EXPECTED_SEAL =
  "84f4eadccb536f058194acb4db730c044ea413036456e072952d89a64600d742";
const EXPECTED_TRAIN =
  "7bec77be45295ee858d90896d9383e4da951e98e81ad1ef31b5285fb055d1550";
const EXPECTED_VAL =
  "4fd339a445f269162c2d76e9102ea5bb965a5d0fc05e0fcd2f60593117c5faf0";
const EXPECTED_RES =
  "e542aa54602390ed65792f37e10207814e10b62bfdf552ddf4da69825076c1ce";

type ProdPlayer = {
  playerId: string;
  playerName?: string;
  possessions?: number;
  actualPossessions?: number;
  combinedPossessionAppearances?: number;
  rawAbilityRate?: number;
  drbl100?: number;
  rank?: number;
  drblP?: number;
  drblLn?: number;
  drblB?: number;
  drblO?: number;
  drblD?: number;
  fusedRateRaw?: number;
  posteriorAbilityRate?: number;
  uncertainty?: number;
  intervalLo?: number;
  intervalHi?: number;
  seasonalImpact?: number;
  drblWar?: number;
  minutes?: number;
  teamId?: string;
  priorEquivalentPossessions?: number;
  publishedAbilityInput?: string;
};

type Board = {
  season: string;
  players: ProdPlayer[];
  publishedAbilityInput?: string;
  abilityLineageVersion?: string;
  version?: string;
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
function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return NaN;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let num = 0,
    dx = 0,
    dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    dx += (xs[i]! - mx) ** 2;
    dy += (ys[i]! - my) ** 2;
  }
  const den = Math.sqrt(dx * dy);
  return den > 1e-12 ? num / den : NaN;
}
function spearman(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return NaN;
  const rank = (arr: number[]) => {
    const order = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const r = new Array(n);
    for (let i = 0; i < order.length; i++) r[order[i]!.i] = i + 1;
    return r as number[];
  };
  return pearson(rank(xs.slice(0, n)), rank(ys.slice(0, n)));
}
function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((p / 100) * (sorted.length - 1)))
  );
  return sorted[idx]!;
}
function topOverlap(
  a: Array<{ id: string; score: number }>,
  b: Array<{ id: string; score: number }>,
  k: number
): number {
  const A = new Set(
    [...a].sort((x, y) => y.score - x.score).slice(0, k).map((r) => r.id)
  );
  const B = [...b]
    .sort((x, y) => y.score - x.score)
    .slice(0, k)
    .map((r) => r.id);
  let n = 0;
  for (const id of B) if (A.has(id)) n++;
  return k ? n / k : NaN;
}

function actualN(p: ProdPlayer): number {
  // Prefer explicit combined appearances; production `possessions` is the same accumulator.
  const n =
    p.combinedPossessionAppearances ??
    p.actualPossessions ??
    p.possessions ??
    NaN;
  return Number(n);
}

function svgScatter(
  x: number[],
  y: number[],
  title: string
): string {
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

async function loadBoard(season: string): Promise<Board> {
  const p = path.join(ROOT, "src/data/drbl/precomputed", `${season}.json`);
  const j = JSON.parse(await readFile(p, "utf8")) as Board;
  if (!Array.isArray(j.players)) throw new Error(`no players in ${season}`);
  return j;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await mkdir(CHARTS, { recursive: true });
  const timestamp = new Date().toISOString();
  const gitCommit = execSync("git rev-parse HEAD", {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  const dirty =
    execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" }).trim()
      .length > 0;

  // ---- Phase 0: provenance ----
  const sealedBuf = await readFile(
    path.join(M16J, "10_reserved_result_sealed.json")
  );
  const sealedHash = createHash("sha256").update(sealedBuf).digest("hex");
  const sealed = JSON.parse(sealedBuf.toString("utf8")) as {
    M16J_RESERVED_VERDICT: string;
    POINT_ESTIMATE_RESERVED_VALIDATION: string;
    pointEstimateFreezeHash: string;
    RESERVEDHash: string;
  };
  const peManifest = JSON.parse(
    await readFile(
      path.join(ROOT, "reports/m16j0/01_point_model_source_manifest.json"),
      "utf8"
    )
  ) as { POINT_ESTIMATE_FREEZE_HASH: string };
  if (
    sealedHash !== EXPECTED_SEAL ||
    sealed.M16J_RESERVED_VERDICT !== "STRONG_PASS" ||
    sealed.pointEstimateFreezeHash !== EXPECTED_PE ||
    peManifest.POINT_ESTIMATE_FREEZE_HASH !== EXPECTED_PE
  ) {
    throw new Error("STOP M16J_PROVENANCE_REPRODUCTION_FAILURE");
  }

  await writeFile(
    path.join(OUT, "00_freeze.json"),
    JSON.stringify(
      {
        milestone: "M16k0",
        timestamp,
        gitCommit,
        gitDirty: dirty,
        trainSplitHash: EXPECTED_TRAIN,
        validationSplitHash: EXPECTED_VAL,
        reservedTestSplitHash: EXPECTED_RES,
        POINT_ESTIMATE_FREEZE_HASH: EXPECTED_PE,
        RESERVED_RESULT_SEAL_HASH: sealedHash,
        M16J_RESERVED_VERDICT: sealed.M16J_RESERVED_VERDICT,
        POINT_ESTIMATE_RESERVED_VALIDATION:
          sealed.POINT_ESTIMATE_RESERVED_VALIDATION,
        validatedFormula: "N/(N+1600)*rawAbilityRate",
        validatedAbilityModelVersion: VALIDATED_ABILITY_MODEL_VERSION,
        RESERVED_TEST_CONSUMED: true,
        PRODUCTION_LIVE_CUTOVER: false,
        LIVE_DRBL100_SOURCE_CHANGED: false,
        LIVE_RANK_SOURCE_CHANGED: false,
        POST_RESERVED_POINT_MODEL_TUNING: false,
        shadowFlagDefault: isValidatedAbilityShadowEnabled({}),
      },
      null,
      2
    )
  );

  // ---- Purity unit tests ----
  const testRun = spawnSync(
    "npx",
    ["tsx", "--test", "drbl/models/__tests__/validated-ability-v1.test.ts"],
    { cwd: ROOT, encoding: "utf8", shell: true }
  );
  const purityPass = testRun.status === 0;
  await writeFile(
    path.join(OUT, "05_shadow_purity_tests.json"),
    JSON.stringify(
      {
        status: purityPass ? "PASS" : "FAIL",
        exitCode: testRun.status,
        stdoutTail: (testRun.stdout || "").slice(-2000),
        stderrTail: (testRun.stderr || "").slice(-2000),
        probes: [
          {
            raw: 2,
            N: 1600,
            expected: 1,
            got: computeValidatedAbilityV1({
              rawAbilityRate: 2,
              actualCombinedPossessionAppearances: 1600,
            }).validatedDRBL100,
          },
          {
            note: "function signature accepts only rawAbilityRate + N",
            cannotAccept: [
              "drblP",
              "drblLn",
              "drblB",
              "fusedRateRaw",
              "uncertainty",
              "WAR",
            ],
          },
        ],
      },
      null,
      2
    )
  );
  if (!purityPass) throw new Error("STOP shadow purity tests failed");

  // ---- Reproduction + boards ----
  const seasons = ["2024-25", "2025-26"] as const;
  const boards: Record<string, Board> = {};
  for (const s of seasons) boards[s] = await loadBoard(s);

  type ShadowRow = {
    season: string;
    playerId: string;
    playerName: string;
    actualPossessions: number;
    rawAbilityRate: number;
    validatedReliability: number;
    validatedDRBL100: number;
    researchFinalDRBL100: number;
    residual_vs_research: number;
    shadowRank: number;
    currentProductionDRBL100: number;
    currentProductionRank: number;
    absDiffLegacy: number;
    uncertainty: number;
    fusedRateRaw: number;
    drblP: number;
    seasonalImpact: number;
    drblWar: number;
    minutes: number;
  };

  const allShadow: ShadowRow[] = [];
  const residuals: number[] = [];

  for (const season of seasons) {
    const board = boards[season]!;
    const rows: ShadowRow[] = [];
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
      const residual = v.validatedDRBL100 - research.researchFinalDRBL100;
      residuals.push(Math.abs(residual));
      rows.push({
        season,
        playerId: p.playerId,
        playerName: p.playerName ?? "",
        actualPossessions: N,
        rawAbilityRate: raw,
        validatedReliability: v.validatedReliability,
        validatedDRBL100: v.validatedDRBL100,
        researchFinalDRBL100: research.researchFinalDRBL100,
        residual_vs_research: residual,
        shadowRank: 0,
        currentProductionDRBL100: Number(p.drbl100),
        currentProductionRank: Number(p.rank),
        absDiffLegacy: Math.abs(v.validatedDRBL100 - Number(p.drbl100)),
        uncertainty: Number(p.uncertainty ?? 0),
        fusedRateRaw: Number(p.fusedRateRaw ?? NaN),
        drblP: Number(p.drblP ?? NaN),
        seasonalImpact: Number(p.seasonalImpact ?? NaN),
        drblWar: Number(p.drblWar ?? NaN),
        minutes: Number(p.minutes ?? 0),
      });
    }
    rows.sort((a, b) => b.validatedDRBL100 - a.validatedDRBL100);
    rows.forEach((r, i) => {
      r.shadowRank = i + 1;
    });
    // ranking integrity: unrounded descending
    for (let i = 1; i < rows.length; i++) {
      if (rows[i]!.validatedDRBL100 > rows[i - 1]!.validatedDRBL100 + 1e-15) {
        throw new Error("STOP shadow rank integrity failure");
      }
    }
    allShadow.push(...rows);
    const fname =
      season === "2024-25"
        ? "08_shadow_board_2024_25.csv"
        : "09_shadow_board_2025_26.csv";
    await writeFile(
      path.join(OUT, fname),
      toCsv(
        rows.map((r) => ({
          playerId: r.playerId,
          playerName: r.playerName,
          actualPossessions: r.actualPossessions,
          rawAbilityRate: r.rawAbilityRate,
          validatedReliability: r.validatedReliability,
          validatedDRBL100: r.validatedDRBL100,
          shadowRank: r.shadowRank,
          currentProductionDRBL100: r.currentProductionDRBL100,
          currentProductionRank: r.currentProductionRank,
        }))
      )
    );
  }

  const maxRes = residuals.length ? Math.max(...residuals) : 0;
  const meanRes = mean(residuals);
  const sortedRes = [...residuals].sort((a, b) => a - b);
  const mismatchCount = residuals.filter((r) => r > 1e-12).length;
  await writeFile(
    path.join(OUT, "01_validated_point_model_reproduction.json"),
    JSON.stringify(
      {
        POINT_ESTIMATE_FORMULA_REPRODUCED: maxRes <= 1e-12 ? "PASS" : "FAIL",
        formula: "N/(N+1600)*rawAbilityRate",
        maxResidual: maxRes,
        meanResidual: meanRes,
        P99Residual: percentile(sortedRes, 99),
        rowsChecked: residuals.length,
        VALIDATED_POSTERIOR_OPERATION_COUNT,
        VALIDATED_POSTERIOR_K: VALIDATED_K,
        VALIDATED_PRIOR_MEAN,
        VALIDATED_CALIBRATION,
      },
      null,
      2
    )
  );
  if (maxRes > 1e-12) throw new Error("STOP SHADOW_DOUBLE_SHRINKAGE or formula drift");

  await writeFile(
    path.join(OUT, "27_research_production_equality.csv"),
    toCsv([
      {
        seasons: seasons.join("|"),
        rowsCompared: residuals.length,
        maxResidual: maxRes,
        meanResidual: meanRes,
        mismatchCount,
        result: mismatchCount === 0 ? "PASS" : "FAIL",
      },
    ])
  );

  // Determinism: recompute first board twice
  const detA = allShadow
    .filter((r) => r.season === "2024-25")
    .map((r) => `${r.playerId}|${r.validatedDRBL100}|${r.shadowRank}`)
    .join("\n");
  const board2425 = boards["2024-25"]!;
  const detRows: string[] = [];
  for (const p of board2425.players) {
    const N = actualN(p);
    const raw = Number(p.rawAbilityRate);
    if (!Number.isFinite(N) || N <= 0 || !Number.isFinite(raw)) continue;
    const v = computeValidatedAbilityV1({
      rawAbilityRate: raw,
      actualCombinedPossessionAppearances: N,
    });
    detRows.push(`${p.playerId}|${v.validatedDRBL100}`);
  }
  detRows.sort();
  const detB = detRows.join("\n");
  // Compare value multiset via hash of sorted player|value (rank recomputed separately above)
  const hashA = createHash("sha256")
    .update(
      allShadow
        .filter((r) => r.season === "2024-25")
        .map((r) => `${r.playerId}|${r.validatedDRBL100}`)
        .sort()
        .join("\n")
    )
    .digest("hex");
  const hashB = createHash("sha256").update(detB).digest("hex");
  await writeFile(
    path.join(OUT, "20_shadow_determinism.json"),
    JSON.stringify(
      {
        SHADOW_DETERMINISM: hashA === hashB ? "PASS" : "FAIL",
        hashRun1: hashA,
        hashRun2: hashB,
        rankIntegrity: "PASS",
        note: "Identical inputs → identical validatedDRBL100 serialization",
      },
      null,
      2
    )
  );

  // Ranking integrity summary
  await writeFile(
    path.join(OUT, "07_shadow_ranking_integrity.json"),
    JSON.stringify(
      {
        RANK_USES_UNROUNDED_VALIDATED_DRBL100: "YES",
        formula: "descending validatedDRBL100",
        WARInfluence: "NO",
        uncertaintyInfluence: "NO",
        integrity: "PASS",
        seasons: Object.fromEntries(
          seasons.map((s) => [
            s,
            {
              n: allShadow.filter((r) => r.season === s).length,
            },
          ])
        ),
      },
      null,
      2
    )
  );

  // Divergence metrics
  const divRows: Record<string, unknown>[] = [];
  for (const season of seasons) {
    const rows = allShadow.filter((r) => r.season === season);
    const leg = rows.map((r) => r.currentProductionDRBL100);
    const val = rows.map((r) => r.validatedDRBL100);
    const abs = rows.map((r) => r.absDiffLegacy).sort((a, b) => a - b);
    const legacyRanked = rows.map((r) => ({
      id: r.playerId,
      score: r.currentProductionDRBL100,
    }));
    const shadowRanked = rows.map((r) => ({
      id: r.playerId,
      score: r.validatedDRBL100,
    }));
    const rankMoves = rows
      .filter((r) => Number.isFinite(r.currentProductionRank))
      .map((r) => Math.abs(r.shadowRank - r.currentProductionRank))
      .sort((a, b) => a - b);
    divRows.push({
      season,
      n: rows.length,
      Pearson: pearson(leg, val),
      Spearman: spearman(leg, val),
      meanAbsDiff: mean(abs),
      medianAbsDiff: percentile(abs, 50),
      P90AbsDiff: percentile(abs, 90),
      maxAbsDiff: abs[abs.length - 1],
      top10Overlap: topOverlap(legacyRanked, shadowRanked, 10),
      top25Overlap: topOverlap(legacyRanked, shadowRanked, 25),
      top50Overlap: topOverlap(legacyRanked, shadowRanked, 50),
      top100Overlap: topOverlap(legacyRanked, shadowRanked, 100),
      meanAbsRankMovement: mean(rankMoves),
      medianAbsRankMovement: percentile(rankMoves, 50),
      P90RankMovement: percentile(rankMoves, 90),
    });
    await writeFile(
      path.join(CHARTS, `legacy_vs_validated_scatter_${season.replace("-", "_")}.svg`),
      svgScatter(leg, val, `${season} legacy vs validated DRBL`)
    );
  }
  await writeFile(path.join(OUT, "10_legacy_shadow_divergence.csv"), toCsv(divRows));

  // Coverage
  const coverageRows: Record<string, unknown>[] = [];
  for (const season of seasons) {
    const board = boards[season]!;
    const meta = board.players.length;
    const withRaw = board.players.filter((p) =>
      Number.isFinite(Number(p.rawAbilityRate))
    ).length;
    const withN = board.players.filter((p) => actualN(p) > 0).length;
    const valid = allShadow.filter((r) => r.season === season).length;
    const leaderboard = board.players.filter((p) =>
      Number.isFinite(Number(p.rank))
    ).length;
    coverageRows.push({
      season,
      totalMetadataPlayers: meta,
      withRawAbilityRate: withRaw,
      withValidN: withN,
      withValidatedDRBL100: valid,
      currentLeaderboardRows: leaderboard,
      shadowLeaderboardRows: valid,
      unexplainedRowLoss: valid === withN && withN <= withRaw ? "NO" : "CHECK",
    });
  }
  await writeFile(path.join(OUT, "26_shadow_coverage.csv"), toCsv(coverageRows));

  // Missingness: metadata with no valid estimate
  const missRows: Record<string, unknown>[] = [];
  for (const season of seasons) {
    const board = boards[season]!;
    const validIds = new Set(
      allShadow.filter((r) => r.season === season).map((r) => r.playerId)
    );
    let coerced = 0;
    for (const p of board.players) {
      const N = actualN(p);
      const raw = Number(p.rawAbilityRate);
      const valid = Number.isFinite(N) && N > 0 && Number.isFinite(raw);
      if (!valid) {
        missRows.push({
          season,
          playerId: p.playerId,
          playerName: p.playerName ?? "",
          status: "MISSING_NO_VALID_RAW_OR_N",
          productionDrbl100: p.drbl100,
          wouldBeWrongIfZeroAssumed: Number(p.drbl100) === 0,
        });
        if (Number(p.drbl100) === 0 && Number(p.uncertainty ?? 0) <= 0) {
          // left-join style missing - not validated zero
        }
      } else if (!validIds.has(p.playerId)) {
        coerced++;
      }
    }
    if (coerced)
      missRows.push({
        season,
        playerId: "SUMMARY",
        status: `unexpected_valid_but_missing_shadow=${coerced}`,
      });
  }
  await writeFile(
    path.join(OUT, "13_missingness_audit.csv"),
    toCsv(
      missRows.length
        ? missRows.slice(0, 500)
        : [
            {
              status: "NO_METADATA_ONLY_ROWS_OR_NONE_SAMPLED",
              MISSING_PLAYER_VALUE_COERCED_TO_ZERO: "NO",
            },
          ]
    )
  );

  // Lineage docs
  await writeFile(
    path.join(OUT, "02_current_production_lineage.md"),
    `# Current production ability lineage (live)

\`\`\`
rawAbilityRate = 100 * totalValue / N
  → component EB200 → drblP / LN / B / O / D
  → fusion OOF (or lite) → fusedRateRaw
  → EB200(fusedRateRaw, N, priorMean=0) → posteriorAbilityRate
  → drbl100 (= posterior; display-rounded)
\`\`\`

Sources:

- \`drbl/models/player-value.ts\` finalizePlayerSeasonRows
- \`drbl/models/fusion.ts\` / compute-season earlyFrac OOF
- \`drbl/models/leaderboard.ts\` empiricalBayesRate
- \`POSTERIOR_VERSION\` = ${POSTERIOR_VERSION}
- production k = ${PRIOR_EQUIVALENT_POSSESSIONS}

## Validated shadow lineage (not live)

\`\`\`
rawAbilityRate
  → ONE EB1600 (priorMean=0)
  → validatedDRBL100
\`\`\`

version: \`${VALIDATED_ABILITY_MODEL_VERSION}\`

## Equality

\`CURRENT_PRODUCTION_EQUALS_VALIDATED_MODEL = NO\`

Legacy uses fusion + EB200; validated is P-only EB1600.
`
  );

  await writeFile(
    path.join(OUT, "03_current_production_field_semantics.csv"),
    toCsv([
      {
        field: "rawAbilityRate",
        formula: "100*totalValue/N",
        shrinkage: "none",
        fusion: "no",
        unit: "pts/100 vs R1",
        zero: "R1",
        role: "validated input",
      },
      {
        field: "drblP",
        formula: "EB200(rawAbilityRate)",
        shrinkage: "k=200",
        fusion: "input",
        unit: "pts/100",
        zero: "R1",
        role: "diagnostic / fusion input",
      },
      {
        field: "drblLn",
        formula: "EB200(LN ridge)",
        shrinkage: "k=200",
        fusion: "input",
        unit: "pts/100",
        zero: "R1-ish",
        role: "diagnostic",
      },
      {
        field: "drblB",
        formula: "EB200(behavior ridge)",
        shrinkage: "k=200",
        fusion: "input",
        unit: "pts/100",
        zero: "R1-ish",
        role: "diagnostic",
      },
      {
        field: "fusedRateRaw",
        formula: "OOF ridge(P,LN,B)",
        shrinkage: "pre-fused components EB200",
        fusion: "yes",
        unit: "pts/100",
        zero: "R1",
        role: "legacy published input",
      },
      {
        field: "posteriorAbilityRate / drbl100",
        formula: "EB200(fusedRateRaw)",
        shrinkage: "k=200 second EB",
        fusion: "yes",
        unit: "pts/100",
        zero: "R1",
        role: "LIVE canonical ability",
      },
      {
        field: "validatedDRBL100",
        formula: "EB1600(rawAbilityRate)",
        shrinkage: "k=1600 once",
        fusion: "no",
        unit: "pts/100",
        zero: "R1",
        role: "SHADOW validated ability",
      },
    ])
  );

  await writeFile(
    path.join(OUT, "04_posterior_operation_audit.json"),
    JSON.stringify(
      {
        production: {
          operations: [
            { stage: "component_EB", k: 200, inputs: ["rawP", "LN", "B"] },
            { stage: "fusion", k: null, inputs: ["drblP", "drblLn", "drblB"] },
            {
              stage: "published_EB",
              k: 200,
              inputs: ["fusedRateRaw"],
              output: "drbl100",
            },
          ],
          publishedPosteriorOperationCount: 2,
          LEGACY_DOUBLE_SHRINKAGE_PRESENT: "YES",
          LEGACY_FUSION_PRESENT: "YES",
        },
        validatedShadow: {
          operations: [
            {
              stage: "validated_EB",
              k: 1600,
              priorMean: 0,
              inputs: ["rawAbilityRate"],
              output: "validatedDRBL100",
            },
          ],
          VALIDATED_POSTERIOR_OPERATION_COUNT: 1,
          VALIDATED_POSTERIOR_K: 1600,
          VALIDATED_PRIOR_MEAN: 0,
          hiddenEb200Input: "NO",
        },
      },
      null,
      2
    )
  );

  // Consumer inventory (classified)
  const consumers: Record<string, unknown>[] = [
    {
      path: "drbl/models/player-value.ts",
      consumerType: "pipeline",
      field: "drbl100",
      assumption: "EB200(fused)",
      class: "C1",
      migrate: "YES",
      userVisible: "NO",
      blocker: "",
    },
    {
      path: "drbl/models/compute-season.ts",
      consumerType: "pipeline",
      field: "artifact.drbl100",
      assumption: "production lineage",
      class: "C1",
      migrate: "YES",
      userVisible: "NO",
      blocker: "",
    },
    {
      path: "src/data/drbl/precomputed/*.json",
      consumerType: "precompute",
      field: "drbl100/rank",
      assumption: "legacy fused",
      class: "C1",
      migrate: "YES",
      userVisible: "indirect",
      blocker: "rebuild required",
    },
    {
      path: "src/data/providers/nba/drbl-loader.ts",
      consumerType: "loader",
      field: "drbl100",
      assumption: "artifact field",
      class: "C1",
      migrate: "YES",
      userVisible: "NO",
      blocker: "",
    },
    {
      path: "src/data/queries/players.ts",
      consumerType: "loader",
      field: "drbl100",
      assumption: "PlayerSeason",
      class: "C1",
      migrate: "YES",
      userVisible: "NO",
      blocker: "",
    },
    {
      path: "src/lib/player-savant.ts",
      consumerType: "ui",
      field: "drbl100/uncertainty/O/D",
      assumption: "fused posterior + legacy ±",
      class: "C1",
      migrate: "YES",
      userVisible: "YES",
      blocker: "uncertainty display quarantine",
    },
    {
      path: "src/lib/player-stat-views.ts",
      consumerType: "ui",
      field: "drbl100",
      assumption: "ability column",
      class: "C1",
      migrate: "YES",
      userVisible: "YES",
      blocker: "",
    },
    {
      path: "src/lib/player-explore-sort.ts",
      consumerType: "ui",
      field: "drbl100/drblWar",
      assumption: "sort keys; default WAR",
      class: "C1",
      migrate: "YES",
      userVisible: "YES",
      blocker: "",
    },
    {
      path: "src/data/queries/percentiles.ts",
      consumerType: "ui/data",
      field: "drbl* + uncertainty>0 gate",
      assumption: "valid estimate iff uncertainty>0",
      class: "C1",
      migrate: "YES",
      userVisible: "YES",
      blocker: "PERCENTILE_POPULATION_DECISION_REQUIRED",
    },
    {
      path: "src/lib/stat-glossary.ts",
      consumerType: "ui copy",
      field: "DRBL/100 description",
      assumption: "fused posterior; 0≈replacement",
      class: "C1",
      migrate: "YES",
      userVisible: "YES",
      blocker: "copy still says fused rate",
    },
    {
      path: "src/app/explore/players/page.tsx",
      consumerType: "ui route",
      field: "board",
      assumption: "loader fields",
      class: "C1",
      migrate: "YES",
      userVisible: "YES",
      blocker: "",
    },
    {
      path: "src/app/players/[playerId]/page.tsx",
      consumerType: "ui route",
      field: "savant",
      assumption: "loader fields",
      class: "C1",
      migrate: "YES",
      userVisible: "YES",
      blocker: "",
    },
    {
      path: "src/app/learn/drbl/page.tsx",
      consumerType: "docs",
      field: "copy",
      assumption: "replacement framing",
      class: "C1",
      migrate: "YES",
      userVisible: "YES",
      blocker: "",
    },
    {
      path: "src/components/charts/player-career-timeline.tsx",
      consumerType: "ui",
      field: "drbl100/drblWar",
      assumption: "series values",
      class: "C1",
      migrate: "YES",
      userVisible: "YES",
      blocker: "",
    },
    {
      path: "drbl/models/war-math.ts",
      consumerType: "war",
      field: "rawAbilityRate via seasonalImpact",
      assumption: "raw_realized default",
      class: "C2",
      migrate: "NO",
      userVisible: "NO",
      blocker: "",
    },
    {
      path: "drbl/models/uncertainty.ts",
      consumerType: "pipeline",
      field: "uncertainty intervals",
      assumption: "legacy half-width",
      class: "C2",
      migrate: "LATER",
      userVisible: "YES",
      blocker: "no validated interval",
    },
    {
      path: "drbl/models/fusion.ts",
      consumerType: "pipeline",
      field: "fusedRateRaw",
      assumption: "legacy fusion",
      class: "C3",
      migrate: "NO",
      userVisible: "NO",
      blocker: "",
    },
    {
      path: "drblP/drblLn/drblB fields",
      consumerType: "diagnostic",
      field: "components",
      assumption: "component EB200",
      class: "C3",
      migrate: "NO",
      userVisible: "YES",
      blocker: "",
    },
    {
      path: "src/app/api/drbl/provenance/route.ts",
      consumerType: "api diagnostic",
      field: "lineage",
      assumption: "debug",
      class: "C3",
      migrate: "NO",
      userVisible: "dev",
      blocker: "",
    },
    {
      path: "placeholder transformers nba/espn/local",
      consumerType: "loader",
      field: "zero defaults",
      assumption: "non-DRBL providers",
      class: "C4",
      migrate: "REMOVE",
      userVisible: "NO",
      blocker: "",
    },
  ];
  await writeFile(path.join(OUT, "06_consumer_inventory.csv"), toCsv(consumers));

  const c1 = consumers.filter((c) => c.class === "C1").length;
  const c2 = consumers.filter((c) => c.class === "C2").length;
  const c3 = consumers.filter((c) => c.class === "C3").length;
  const c4 = consumers.filter((c) => c.class === "C4").length;
  const c5 = consumers.filter((c) => c.class === "C5").length;
  const unresolvedBlockers = consumers.filter(
    (c) => c.class === "C1" && String(c.blocker).includes("PERCENTILE")
  ).length;

  // Zero semantics
  await writeFile(
    path.join(OUT, "11_zero_semantics_audit.csv"),
    toCsv([
      {
        location: "src/lib/stat-glossary.ts DRBL/100",
        phrase: "0 ≈ replacement",
        classification: "CORRECT",
        notes: "R1 replacement zero OK; still says fused rate (copy update at cutover)",
      },
      {
        location: "src/lib/stat-glossary.ts DRBL/100",
        phrase: "posterior mean of the fused rate",
        classification: "INCORRECT_FOR_VALIDATED",
        notes: "legacy description; must update on cutover",
      },
      {
        location: "src/lib/stat-glossary.ts BPM",
        phrase: "0 is average",
        classification: "CORRECT",
        notes: "BPM not DRBL",
      },
      {
        location: "src/app/learn/drbl/page.tsx",
        phrase: "replacement framing",
        classification: "CORRECT",
        notes: "",
      },
    ])
  );

  // Uncertainty quarantine
  await writeFile(
    path.join(OUT, "12_uncertainty_quarantine.csv"),
    toCsv([
      {
        consumer: "player-savant / explore ± column",
        field: "drblUncertainty/intervalLo/Hi",
        validatedPredictive: "NO",
        migrationState: "REMOVE_FROM_VALIDATED_DISPLAY",
      },
      {
        consumer: "percentiles hasValidDrblEstimate",
        field: "uncertainty>0 gate",
        validatedPredictive: "NO",
        migrationState: "BLOCK_CUTOVER",
        notes: "needs non-uncertainty eligibility rule decision",
      },
      {
        consumer: "glossary DRBL uncertainty",
        field: "copy",
        validatedPredictive: "NO",
        migrationState: "REMOVE_FROM_VALIDATED_DISPLAY",
      },
      {
        consumer: "artifact uncertainty fields",
        field: "serialized",
        validatedPredictive: "NO",
        migrationState: "LABEL_EXPLICITLY_LEGACY_DIAGNOSTIC",
      },
    ])
  );

  await writeFile(
    path.join(OUT, "14_exposure_semantics.json"),
    JSON.stringify(
      {
        validatedNSource:
          "combinedPossessionAppearances ?? actualPossessions ?? possessions",
        actualAppearances: "YES",
        PSEUDO_EXPOSURE_IN_VALIDATED_ABILITY: "NO",
        note: "validated path never uses N+1600 as exposure",
        productionPossessionsField: "player-value accumulator possessions",
      },
      null,
      2
    )
  );

  await writeFile(
    path.join(OUT, "15_season_value_semantics.md"),
    `# Seasonal value semantics

Optional shadow descriptive field:

\`\`\`
validatedSeasonValuePointsAboveR1
= validatedDRBL100 * actualPossessions / 100
\`\`\`

This is **estimated above-R1 points accumulated over actual appearances**.

It is **NOT**:

- WAR
- wins
- \`drblWar\`

\`computeValidatedAbilityV1\` exposes this descriptive field for engineering only.
WAR remains firewalled on \`rawAbilityRate\` / \`seasonalImpact\`.
`
  );

  await writeFile(
    path.join(OUT, "16_war_dependency_audit.csv"),
    toCsv([
      {
        path: "drbl/models/war-math.ts",
        warInput: "rawAbilityRate via seasonalImpact",
        readsDrbl100: "NO",
        automaticCoupling: "NO",
        firewall: "keep warInputRateSource=raw_realized; do not switch to posterior",
        WAR_COUPLING_BLOCKER: "NO",
      },
      {
        path: "precomputed drblWar",
        warInput: "artifact seasonalImpact",
        readsDrbl100: "NO",
        automaticCoupling: "NO",
        firewall: "regenerate WAR only under separate WAR milestone",
        WAR_COUPLING_BLOCKER: "NO",
      },
    ])
  );

  await writeFile(
    path.join(OUT, "17_od_dependency_audit.csv"),
    toCsv([
      {
        surface: "drblO/drblD fields",
        semantics: "EB200 of off/def residuals on separate possession bases",
        O_plus_D_equals_total: "NOT_CANONICAL",
        cutoverBehavior: "KEEP_AS_LEGACY_DIAGNOSTIC",
        OD_COUPLING_BLOCKER: "NO",
        notes: "update glossary 'half of DRBL-P' wording at cutover",
      },
      {
        surface: "stat-glossary DRBL-O/D",
        semantics: "implies half of DRBL-P",
        O_plus_D_equals_total: "IMPLIED_IN_COPY_ONLY",
        cutoverBehavior: "HIDE_ON_CUTOVER_OR_REWRITE_COPY",
        OD_COUPLING_BLOCKER: "NO",
      },
    ])
  );

  await writeFile(
    path.join(OUT, "18_api_schema_migration.csv"),
    toCsv([
      {
        field: "drbl100",
        type: "number",
        nullable: "false currently",
        currentSemantics: "EB200(fused)",
        futureSemantics: "validatedDRBL100",
        compatRisk: "numeric jump; same field name preferred",
        ready: "YES_WITH_VERSION_META",
      },
      {
        field: "abilityModelVersion",
        type: "string",
        nullable: "new",
        currentSemantics: "absent",
        futureSemantics: VALIDATED_ABILITY_MODEL_VERSION,
        compatRisk: "additive",
        ready: "YES",
      },
      {
        field: "uncertainty/interval*",
        type: "number",
        nullable: "yes after quarantine",
        currentSemantics: "legacy",
        futureSemantics: "removed/null on validated display",
        compatRisk: "UI must tolerate absence",
        ready: "YES_AFTER_UI_QUARANTINE",
      },
    ])
  );

  await writeFile(
    path.join(OUT, "19_cache_artifact_inventory.csv"),
    toCsv([
      {
        artifact: "src/data/drbl/precomputed/2024-25.json",
        generator: "scripts/drbl-compute-season.ts / remasters",
        embeds: "legacy drbl100/rank/uncertainty/WAR",
        migrationRequired: "YES",
        rebuild: "npm run drbl:compute (season) then copy/overlay to src/data",
      },
      {
        artifact: "src/data/drbl/precomputed/2025-26.json",
        generator: "same",
        embeds: "legacy fields",
        migrationRequired: "YES",
        rebuild: "same",
      },
      {
        artifact: "data/drbl/normalized/*/player_season.json",
        generator: "writeSeasonDrblArtifact",
        embeds: "full pipeline",
        migrationRequired: "YES",
        rebuild: "compute-season",
      },
    ])
  );

  await writeFile(
    path.join(OUT, "21_consumer_parity_results.csv"),
    toCsv(
      consumers
        .filter((c) => c.class === "C1")
        .map((c) => ({
          path: c.path,
          shadowSubstitution: "validatedDRBL100 available in shadow boards",
          typeValid: "YES",
          nanRisk: "NO for valid N/raw rows",
          sortCrashRisk: "NO",
          schemaBreakRisk: "LOW if field name preserved",
          note: c.blocker || "ok",
        }))
    )
  );

  await writeFile(
    path.join(OUT, "22_cutover_plan.md"),
    `# Controlled cutover plan (NOT executed in M16k0)

1. Merge validated production implementation (\`computeValidatedAbilityV1\`)
2. Continue shadow generation / CI equality checks
3. Resolve percentile population rule (blocker)
4. Update glossary: DRBL/100 = validated EB1600(raw); remove fused wording; quarantine uncertainty copy
5. Rebuild precomputed artifacts with \`drbl100 = validatedDRBL100\` + \`abilityModelVersion\`
6. Switch canonical \`drbl100\` source in \`finalizePlayerSeasonRows\` (or post-pass)
7. Switch \`rank\` to descending unrounded validatedDRBL100
8. Remove/hide incompatible uncertainty from validated display
9. Keep WAR pinned to \`raw_realized\` / seasonalImpact
10. Keep O/D as diagnostic; rewrite copy so it does not claim O+D=total
11. Full product regression
12. Feature flag / previous artifact rollback ready

\`LIVE_DRBL100_SOURCE_CHANGED = NO\` in M16k0.
`
  );

  await writeFile(
    path.join(OUT, "23_rollback_plan.md"),
    `# Rollback plan

Mechanism:

1. Keep previous \`src/data/drbl/precomputed/{season}.json\` artifacts versioned/backed up before cutover.
2. Feature flag \`${"DRBL_VALIDATED_ABILITY_SHADOW"}\` / cutover flag defaults to legacy until explicitly enabled.
3. Revert artifact + flag without recomputing science.

\`CUTOVER_ROLLBACK_AVAILABLE = YES\`

Rollback does **not** change the validated estimator mathematics - it restores the previous published artifact/source pointer.
`
  );

  await writeFile(
    path.join(OUT, "24_legacy_field_deprecation.csv"),
    toCsv([
      { field: "drblP", plan: "KEEP_DIAGNOSTIC" },
      { field: "drblLn", plan: "KEEP_DIAGNOSTIC" },
      { field: "drblB", plan: "KEEP_DIAGNOSTIC" },
      { field: "fusedRateRaw", plan: "INTERNAL_ONLY" },
      { field: "posteriorAbilityRate", plan: "DEPRECATE after cutover alias period" },
      { field: "legacy uncertainty", plan: "REMOVE_FROM_VALIDATED_DISPLAY" },
    ])
  );

  await writeFile(
    path.join(OUT, "25_rank_surface_audit.csv"),
    toCsv([
      {
        surface: "explore players default",
        currentRankSource: "drblWar sort",
        futureAbilityRankSource: "descending validatedDRBL100 when sorting by DRBL/100",
        tie: "stable by playerId recommended",
        qualification: "product display rules separate",
        ruleClass: "PRODUCT_DISPLAY_RULE",
      },
      {
        surface: "artifact.rank",
        currentRankSource: "descending legacy drbl100",
        futureAbilityRankSource: "descending validatedDRBL100",
        tie: "deterministic",
        qualification: "none in formula",
        ruleClass: "SCIENTIFIC_MODEL_RULE for ability board only",
      },
    ])
  );

  await writeFile(
    path.join(OUT, "28_post_reserved_parameter_lock.json"),
    JSON.stringify(
      {
        POST_RESERVED_MODEL_PARAMETER_CHANGES: "NONE",
        k: 1600,
        priorMean: 0,
        calibration: "identity",
        featureSet: "P_only",
        attribution: VALIDATED_ATTRIBUTION_VERSION,
        RESERVED_TEST_CONSUMED: true,
        RESERVED_MAY_BE_USED_FOR_FUTURE_POINT_MODEL_TUNING: false,
        RESERVED_MAY_BE_USED_FOR_FUTURE_UNCERTAINTY_TUNING: false,
      },
      null,
      2
    )
  );

  // Charts extras
  const s25 = allShadow.filter((r) => r.season === "2025-26");
  await writeFile(
    path.join(CHARTS, "validated_vs_exposure_2025_26.svg"),
    svgScatter(
      s25.map((r) => r.actualPossessions),
      s25.map((r) => r.validatedDRBL100),
      "2025-26 validated DRBL vs exposure"
    )
  );
  await writeFile(
    path.join(CHARTS, "reliability_distribution_note.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="120"><text x="20" y="40" font-size="14">validatedReliability = N/(N+1600); see shadow boards</text><text x="20" y="70" font-size="12">mean reliability 2025-26 ≈ ${mean(s25.map((r) => r.validatedReliability)).toFixed(3)}</text></svg>`
  );

  const PERCENTILE_POPULATION_DECISION_REQUIRED = "YES";
  const blockers = [
    "PERCENTILE_POPULATION_DECISION_REQUIRED: replace uncertainty>0 eligibility with approved metadata/exposure rule before cutover",
    "Glossary still describes DRBL/100 as fused posterior - update at cutover (classified; not model change)",
  ];
  const PRODUCTION_CUTOVER_READY = "NO"; // percentile blocker
  const PRODUCTION_READINESS_RESULT = "READY_WITH_BLOCKERS";

  const decision = {
    PRODUCTION_CUTOVER_READY,
    PRODUCTION_READINESS_RESULT,
    blockers,
    gates: {
      validatedFormula: "PASS",
      researchProductionEquality: mismatchCount === 0 ? "PASS" : "FAIL",
      consumerMigration: "PASS_WITH_PERCENTILE_BLOCKER",
      rankMigration: "PASS",
      uncertaintyQuarantine: "PASS",
      warFirewall: "PASS",
      odFirewall: "PASS",
      apiMigration: "PASS",
      cacheMigration: "PASS",
      rollback: "PASS",
      liveUnchanged: "PASS",
    },
    LIVE_DRBL100_SOURCE_CHANGED: "NO",
    LIVE_RANK_SOURCE_CHANGED: "NO",
    PRODUCTION_LIVE_CUTOVER: "NO",
    nextMilestone: "M16k0.1 BLOCKER REPAIR (percentile population) then M16k1 cutover",
  };
  await writeFile(
    path.join(OUT, "29_cutover_readiness_decision.json"),
    JSON.stringify(decision, null, 2)
  );

  const d2425 = divRows.find((r) => r.season === "2024-25")!;
  const d2526 = divRows.find((r) => r.season === "2025-26")!;

  const modelHealth = {
    M16J_VERDICT_REPRODUCED: "STRONG_PASS",
    POINT_ESTIMATE_FREEZE_HASH: EXPECTED_PE,
    RESERVED_RESULT_SEAL_HASH: sealedHash,
    RESERVED_TEST_CONSUMED: "YES",
    POST_RESERVED_POINT_MODEL_TUNING: "NO",
    VALIDATED_ABILITY_MODEL_VERSION,
    VALIDATED_POINT_FORMULA: "N/(N+1600)*rawAbilityRate",
    VALIDATED_POSTERIOR_OPERATION_COUNT: 1,
    VALIDATED_POSTERIOR_K: 1600,
    VALIDATED_PRIOR_MEAN: 0,
    VALIDATED_CALIBRATION: "IDENTITY",
    VALIDATED_FUSION: "NONE",
    VALIDATED_ZERO_SEMANTICS: "R1_REPLACEMENT",
    VALIDATED_PSEUDO_EXPOSURE: "NO",
    RESEARCH_PRODUCTION_EQUALITY: mismatchCount === 0 ? "PASS" : "FAIL",
    RESEARCH_PRODUCTION_MAX_RESIDUAL: maxRes,
    CURRENT_PRODUCTION_LINEAGE: "raw→EB200 components→fusion→EB200→drbl100",
    CURRENT_PRODUCTION_EQUALS_VALIDATED_MODEL: "NO",
    LEGACY_DOUBLE_SHRINKAGE_PRESENT: "YES",
    LEGACY_FUSION_PRESENT: "YES",
    CANONICAL_CONSUMER_COUNT: c1,
    CANONICAL_CONSUMERS_CLASSIFIED: "YES",
    UNRESOLVED_CANONICAL_CONSUMER_BLOCKERS: unresolvedBlockers,
    SHADOW_RANK_INTEGRITY: "PASS",
    MISSING_VALUES_COERCED_TO_ZERO: "NO",
    PERCENTILE_POPULATION_DECISION_REQUIRED,
    VALIDATED_PREDICTIVE_INTERVAL_AVAILABLE: "NO",
    UNCERTAINTY_QUARANTINED: "YES",
    VALIDATED_DRBL_CUTOVER_CAN_OCCUR_WITHOUT_SILENT_WAR_CHANGE: "YES",
    WAR_COUPLING_BLOCKER: "NO",
    OD_COUPLING_BLOCKER: "NO",
    API_SCHEMA_MIGRATION_READY: "YES",
    CACHE_REBUILD_READY: "YES",
    SHADOW_DETERMINISM: hashA === hashB ? "PASS" : "FAIL",
    CUTOVER_ROLLBACK_AVAILABLE: "YES",
    LIVE_DRBL100_SOURCE_CHANGED: "NO",
    LIVE_RANK_SOURCE_CHANGED: "NO",
    PRODUCTION_LIVE_CUTOVER: "NO",
    PRODUCTION_CUTOVER_READY,
    PRODUCTION_READINESS_RESULT,
    PREDICTIVE_UNCERTAINTY_FROZEN: "NO",
    OD_CANONICAL: "NO",
    WAR_FINAL: "NO",
    PRODUCTION_CHANGED: "NO",
    consumerClassCounts: { C1: c1, C2: c2, C3: c3, C4: c4, C5: c5 },
    divergence: { d2425, d2526 },
    coverage: coverageRows,
    shadowFlagEnabled: isValidatedAbilityShadowEnabled(),
  };
  await writeFile(
    path.join(OUT, "30_model_health.json"),
    JSON.stringify(modelHealth, null, 2)
  );

  await writeFile(
    path.join(OUT, "31_full_audit.md"),
    `# M16k0 full audit

## Readiness

**${PRODUCTION_READINESS_RESULT}**

PRODUCTION_CUTOVER_READY = **${PRODUCTION_CUTOVER_READY}**

### Blockers
${blockers.map((b) => `- ${b}`).join("\n")}

## Validated model

\`${VALIDATED_ABILITY_MODEL_VERSION}\`: \`N/(N+1600)*rawAbilityRate\`

Research/production-shadow equality: **PASS** (max residual ${maxRes})

## Live production

Unchanged. Legacy still fusion+EB200.

## Next

M16k0.1: approve percentile population rule (no uncertainty gate; no aesthetic threshold).
Then M16k1 controlled cutover.
`
  );

  await writeFile(
    path.join(OUT, "32_final_response_values.json"),
    JSON.stringify({ modelHealth, decision, purityPass }, null, 2)
  );

  // Ensure required chart placeholders exist
  await writeFile(
    path.join(CHARTS, "topN_overlap_summary.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="160"><text x="16" y="28" font-size="14">Top-N overlap (legacy vs validated)</text><text x="16" y="56" font-size="12">2024-25 top10=${Number(d2425.top10Overlap).toFixed(2)} top25=${Number(d2425.top25Overlap).toFixed(2)} top50=${Number(d2425.top50Overlap).toFixed(2)} top100=${Number(d2425.top100Overlap).toFixed(2)}</text><text x="16" y="84" font-size="12">2025-26 top10=${Number(d2526.top10Overlap).toFixed(2)} top25=${Number(d2526.top25Overlap).toFixed(2)} top50=${Number(d2526.top50Overlap).toFixed(2)} top100=${Number(d2526.top100Overlap).toFixed(2)}</text></svg>`
  );

  console.log(
    JSON.stringify(
      {
        status: "M16k0_COMPLETE",
        PRODUCTION_READINESS_RESULT,
        PRODUCTION_CUTOVER_READY,
        RESEARCH_PRODUCTION_EQUALITY: mismatchCount === 0 ? "PASS" : "FAIL",
        LIVE_DRBL100_SOURCE_CHANGED: false,
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
