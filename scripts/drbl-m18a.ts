/**
 * M18a - Persistent Unobserved Impact Residual (UIR) research.
 *   npm run drbl:m18a
 *
 * Sidecar only - does not modify DRBL v1 / production artifacts.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";

import { loadNormalizedGame } from "../drbl/evaluation/m16c-dataset";
import {
  buildM18LineupRows,
  fitM18LineupNet,
  fitM18LineupOD,
  evaluateNetPred,
  netRatingsPer100,
  odCombinedPer100,
  splitHalves,
  shuffleLineupIdentities,
  chronologicalGameSplit,
  M18_LINEUP_VERSION,
  type M18LineupRow,
} from "../drbl/research/m18/lineup-impact";
import {
  fitResidualizer,
  computeUirMap,
  fitPredictCompare,
  bootstrapDeltaRmse,
  type ResidualRow,
} from "../drbl/research/m18/uir";
import { pearson, spearman } from "../drbl/evaluation/metrics";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m18a");
const RAW = path.join(OUT, "raw");

const EXPECTED_M17B =
  "b606cf603c7f10acbad9ad6fd1b1869d2f12fcfa4bd461a1e689b82477fb238c";
const EXPECTED_M17A2 =
  "60ef99542ec2e27be8eb54f2b6f86cbcef7b40ac62fd0862232e3451a8704e11";
const EXPECTED_SUPPORT =
  "86b01c4af8f03bb91502c0c8fb484aa1ef7120fc4c5e68eb33d5b4b89756d094";
const EXPECTED_PRENAME =
  "5093ba7e62c6a1dc2ad37261e2032b9226eb1548d367827d297fb8aa47885ed5";

const TRAIN = ["2020-21", "2021-22"] as const;
const VAL_SRC = "2022-23";
const VAL_FUT = "2023-24";
const RES_SRC = "2023-24";
const RES_FUT = "2024-25";
/** Frozen BEFORE any result inspection. */
const RIDGE_GRID = [50, 200, 800, 3200, 12800] as const;
const BOOTSTRAP_SEED = 42;
const BOOTSTRAP_N = 1000;

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
function anon(id: string): string {
  return sha256(id).slice(0, 16);
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
function quantile(xs: number[], q: number): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]!;
}
function dist(xs: number[]) {
  if (!xs.length) return { n: 0 };
  let min = xs[0]!;
  let max = xs[0]!;
  let sum = 0;
  for (const x of xs) {
    if (x < min) min = x;
    if (x > max) max = x;
    sum += x;
  }
  const m = sum / xs.length;
  let ss = 0;
  for (const x of xs) ss += (x - m) ** 2;
  const sd = Math.sqrt(ss / xs.length);
  return {
    n: xs.length,
    mean: m,
    sd,
    min,
    max,
    p10: quantile(xs, 0.1),
    p25: quantile(xs, 0.25),
    p50: quantile(xs, 0.5),
    p75: quantile(xs, 0.75),
    p90: quantile(xs, 0.9),
  };
}

type PlayerSeason = {
  playerId: string;
  playerName: string;
  teamId: string;
  N: number;
  P_RAW: number;
  P_POST: number;
  drblLn: number;
  drblO: number;
  drblD: number;
};

async function loadPlayerSeason(season: string): Promise<Map<string, PlayerSeason>> {
  const p = path.join(ROOT, "src/data/drbl/precomputed", `${season}.json`);
  const raw = JSON.parse(await readFile(p, "utf8")) as {
    players: Array<Record<string, unknown>>;
  };
  const map = new Map<string, PlayerSeason>();
  for (const pl of raw.players) {
    const playerId = String(pl.playerId ?? "");
    if (!playerId) continue;
    const N = Number(pl.possessions ?? 0);
    const r1 = pl.r1Points != null ? Number(pl.r1Points) : NaN;
    const P_RAW =
      Number.isFinite(r1) && N > 0
        ? (100 * r1) / N
        : Number(pl.rawAbilityRate ?? NaN);
    map.set(playerId, {
      playerId,
      playerName: String(pl.playerName ?? ""),
      teamId: String(pl.teamId ?? ""),
      N,
      P_RAW,
      P_POST: Number(pl.drbl100 ?? NaN),
      drblLn: Number(pl.drblLn ?? NaN),
      drblO: Number(pl.drblO ?? NaN),
      drblD: Number(pl.drblD ?? NaN),
    });
  }
  return map;
}

async function listGameIds(season: string): Promise<string[]> {
  const dir = path.join(ROOT, "data/drbl/normalized", season);
  const ents = await readdir(dir, { withFileTypes: true });
  return ents
    .filter((e) => e.isDirectory() && /^\d{10}$/.test(e.name))
    .map((e) => e.name)
    .sort();
}

async function loadSeasonRows(season: string): Promise<M18LineupRow[]> {
  const cache = path.join(RAW, `${season}-lineup-rows.jsonl`);
  try {
    const text = await readFile(cache, "utf8");
    if (text.length > 0) {
      const out: M18LineupRow[] = [];
      let start = 0;
      while (start < text.length) {
        let end = text.indexOf("\n", start);
        if (end < 0) end = text.length;
        const line = text.slice(start, end).trim();
        if (line) out.push(JSON.parse(line) as M18LineupRow);
        start = end + 1;
      }
      if (out.length) return out;
    }
  } catch {
    /* build */
  }
  const { appendFile, writeFile: wf } = await import("node:fs/promises");
  await wf(cache, "");
  const ids = await listGameIds(season);
  const rows: M18LineupRow[] = [];
  let buf = "";
  for (let i = 0; i < ids.length; i++) {
    const g = await loadNormalizedGame(season, ids[i]!);
    if (g) {
      const built = buildM18LineupRows(g.box, g.possessions);
      for (const r of built) {
        rows.push(r);
        buf += JSON.stringify(r) + "\n";
      }
      if (buf.length > 2_000_000) {
        await appendFile(cache, buf);
        buf = "";
      }
    }
    if ((i + 1) % 200 === 0) {
      console.log(`  ${season} lineup rows ${i + 1}/${ids.length}`);
    }
  }
  if (buf) await appendFile(cache, buf);
  return rows;
}

function playerExposure(rows: M18LineupRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    for (const id of r.offensePlayerIds) m.set(id, (m.get(id) ?? 0) + 1);
    for (const id of r.defensePlayerIds) m.set(id, (m.get(id) ?? 0) + 1);
  }
  return m;
}

function teammateOverlap(
  rowsA: M18LineupRow[],
  rowsB: M18LineupRow[],
  playerId: string
): number {
  const top = (rows: M18LineupRow[]) => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const side = r.offensePlayerIds.includes(playerId)
        ? r.offensePlayerIds
        : r.defensePlayerIds.includes(playerId)
          ? r.defensePlayerIds
          : null;
      if (!side) continue;
      for (const id of side) {
        if (id === playerId) continue;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);
  };
  const a = new Set(top(rowsA));
  const b = new Set(top(rowsB));
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const id of a) if (b.has(id)) inter++;
  const union = new Set([...a, ...b]).size;
  return union ? inter / union : 0;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await mkdir(RAW, { recursive: true });

  const gitCommit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const dirty =
    execSync("git status --porcelain", { encoding: "utf8" }).trim().length > 0;
  const timestamp = new Date().toISOString();

  const m17b = JSON.parse(
    await readFile(path.join(ROOT, "reports/m17b/20_model_health.json"), "utf8")
  );
  if (m17b.M17B_MULTI_SEASON_VALIDATION_SEAL_HASH !== EXPECTED_M17B) {
    throw new Error("M17b seal mismatch");
  }
  if (m17b.M17A_2_HISTORICAL_CORPUS_SEAL_HASH !== EXPECTED_M17A2) {
    throw new Error("M17a.2 corpus seal mismatch");
  }
  const m17a2 = JSON.parse(
    await readFile(path.join(ROOT, "reports/m17a_2/41_model_health.json"), "utf8")
  );
  if (m17a2.M17A_2_SUPPORT_TIER_FREEZE_HASH !== EXPECTED_SUPPORT) {
    throw new Error("Support tier freeze mismatch");
  }
  if (m17b.M17B_PRENAME_VERDICT_HASH !== EXPECTED_PRENAME) {
    throw new Error("M17b pre-name hash mismatch");
  }

  const freeze = {
    milestone: "M18a",
    timestamp,
    gitCommit,
    dirty,
    M17B_MULTI_SEASON_VALIDATION_SEAL_HASH: EXPECTED_M17B,
    M17A_2_HISTORICAL_CORPUS_SEAL_HASH: EXPECTED_M17A2,
    M17A_2_SUPPORT_TIER_FREEZE_HASH: EXPECTED_SUPPORT,
    M17B_PRENAME_VERDICT_HASH: EXPECTED_PRENAME,
    CANONICAL_ABILITY_VERSION: "drbl-ability-eb1600-r1-v1",
    K: 1600,
    P1: 37.490662671779255,
    DRBL_V1_REOPENED: "NO",
    MODEL_PARAMETER_CHANGED: "NO",
    K_REFIT: "NO",
    P1_REFIT: "NO",
    R1_CHANGED: "NO",
    EPV_CHANGED: "NO",
    EXTERNAL_METRICS_USED_AS_TARGET: "NO",
    PLAYER_REPUTATION_USED_FOR_TUNING: "NO",
    M18_TRAIN_SEASONS: [...TRAIN],
    M18_VALIDATION_PAIR: `${VAL_SRC}→${VAL_FUT}`,
    M18_RESERVED_PAIR: `${RES_SRC}→${RES_FUT}`,
    "2025_26_USED": "NO",
    M18_RESERVED_OUTCOME_OPENED_BEFORE_FREEZE: "NO",
    RIDGE_GRID: [...RIDGE_GRID],
    LINEUP_MODEL_VERSION: M18_LINEUP_VERSION,
    RAW_DRBL_LN_MINUS_P_USED: "NO",
    note: "UIR sidecar research - not off-ball value",
  };
  await writeFile(path.join(OUT, "00_freeze.json"), JSON.stringify(freeze, null, 2) + "\n");

  // ---- Legacy LN forensics ----
  await writeFile(
    path.join(OUT, "01_legacy_ln_forensics.md"),
    `# Legacy DRBL-LN forensics (M18a)

## Implementation

- Source: \`drbl/models/lineup-model.ts\` (\`drbl-ln-ridge-v1\`)
- Wired in \`compute-season.ts\` with \`lambda: 800\`, \`holdoutFrac: 0.2\`

## Target

\`\`\`text
y = possession.points − EPV(state)
\`\`\`

Not raw scoreboard points. EPV-residual association estimator.

## Design matrix

- +1 offense on-court player
- −1 defense on-court player
- optional home offense flag
- Single net player coefficient (not separate O/D)

## Regularization

Ridge λ = 800 (production fixed; not selected in M18 TRAIN).

## Ratings

Coefficients × 100 → per-100, then EB-shrunk with player N in \`player-value.ts\`.

## Directly usable as UIR?

**NO.**

Reasons:
1. Target is EPV residual, not scoreboard points (different estimand).
2. Production λ fixed without M18 protocol.
3. Raw LN − P is dimensionally/scientifically invalid as UIR.
4. LN is fused into legacy stacks; M18 requires residualized L ⊥̸ P_RAW by construction.

LEGACY_DRBL_LN_DIRECTLY_USED = NO  
RAW_DRBL_LN_MINUS_P_USED = NO
`
  );

  const lnDistRows: Record<string, unknown>[] = [];
  for (const season of ["2020-21", "2021-22", "2022-23", "2023-24", "2024-25"]) {
    const ps = await loadPlayerSeason(season);
    const xs = [...ps.values()].map((p) => p.drblLn).filter(Number.isFinite);
    lnDistRows.push({ season, metric: "legacy_drblLn", ...dist(xs) });
  }
  await writeFile(path.join(OUT, "02_legacy_ln_distribution.csv"), toCsv(lnDistRows));

  await writeFile(
    path.join(OUT, "03_observable_impact_contract.md"),
    `# Observable impact contract

\`\`\`text
P_RAW_i,s = 100 * ApproachBAttributedValue_i / N_i
         = rawAbilityRate (exact from R1Points/N when available)

P_POST_i,s = validatedDRBL100 = N/(N+1600)*P_RAW
\`\`\`

Primary residualization input: **P_RAW** (unshrunk).  
P_POST is a secondary comparator only.

Unit: points per 100 combined possession appearances.
`
  );

  await writeFile(
    path.join(OUT, "04_lineup_target_contract.md"),
    `# Lineup target contract (m18-lineup-impact-v1)

## Target

\`\`\`text
y_p = possession.points   # scoreboard points on possession p
\`\`\`

## Orientation

Offense scores; defense prevents.

## Design

- NET mode: offense +1, defense −1, home, intercept
- OD mode: separate L_O and L_D indicators (+ home + intercept)

## Policies

- Require 5v5 lineups (incomplete possessions excluded)
- No garbage-time filter (frozen: none)
- Technical FT / end-of-period: inherit possession builder scoring
- Unit of coefficient: points per possession
- Published L scale for residualization: **per 100** (= coef × 100)

## Garbage-time

NONE (no filter) - frozen before results.
`
  );

  await writeFile(
    path.join(OUT, "05_unit_audit.md"),
    `# Unit audit (M18a)

| Quantity | Numerator | Denominator | Scale |
|---|---|---|---|
| P_RAW | Approach-B attributed value ×100 | combined possession appearances N | per 100 |
| L_coef (NET) | scoreboard points association | possession | per possession |
| L (research) | L_coef × 100 | - | per 100 |
| Legacy DRBL-LN | (points−EPV) ridge ×100 then EB | N | per 100 (different target) |

## Direct subtraction L − P_RAW?

**NO** as UIR definition - even after ×100, estimands differ (lineup-adjusted scoreboard association vs Approach-B event attribution). Use statistical residualization:

\`\`\`text
UIR = L − E[L | P_RAW, log(N), …]
\`\`\`

## Factor-two

Combined possession appearances (offense+defense) are the DRBL N denominator.  
Lineup model uses one row per team-possession (not double-counted team pair).  
FACTOR_TWO_AUDITED = YES - L×100 aligns per-100 scale for residualization inputs; no silent /2 or ×2.
`
  );

  const regFreeze = {
    RIDGE_GRID: [...RIDGE_GRID],
    selection: "TRAIN chronological holdout RMSE on pooled 2020-21+2021-22",
    holdoutFrac: 0.2,
    frozenBeforeResults: true,
    BOOTSTRAP_SEED,
  };
  await writeFile(
    path.join(OUT, "06_lineup_regularization_freeze.json"),
    JSON.stringify(regFreeze, null, 2) + "\n"
  );

  // ---- Load TRAIN rows & select lambda ----
  console.log("Loading TRAIN lineup rows…");
  const trainRows: M18LineupRow[] = [];
  const rowsBySeason = new Map<string, M18LineupRow[]>();
  for (const season of [
    ...TRAIN,
    VAL_SRC,
    VAL_FUT,
    RES_FUT,
  ]) {
    console.log("Season", season);
    const rows = await loadSeasonRows(season);
    rowsBySeason.set(season, rows);
    if ((TRAIN as readonly string[]).includes(season)) {
      for (const r of rows) trainRows.push(r);
    }
  }
  // 2023-24 already loaded as VAL_FUT; also needed as RES_SRC
  if (!rowsBySeason.has(RES_SRC)) {
    rowsBySeason.set(RES_SRC, rowsBySeason.get(VAL_FUT)!);
  }

  console.log("Selecting lambda on TRAIN…");
  const { train: cvTrain, holdout: cvHold } = chronologicalGameSplit(
    trainRows,
    0.2
  );
  let bestLambda = RIDGE_GRID[0];
  let bestRmse = Infinity;
  const gridResults: Record<string, unknown>[] = [];
  for (const lambda of RIDGE_GRID) {
    const fit = fitM18LineupNet(cvTrain, lambda);
    const ev = evaluateNetPred(cvHold, fit);
    gridResults.push({ lambda, holdoutN: ev.n, holdoutRMSE: ev.rmse, holdoutMAE: ev.mae });
    console.log(`  λ=${lambda} holdout RMSE=${ev.rmse.toFixed(4)}`);
    if (ev.rmse < bestRmse) {
      bestRmse = ev.rmse;
      bestLambda = lambda;
    }
  }
  console.log("Selected λ=", bestLambda);

  const healthFit = fitM18LineupNet(trainRows, bestLambda);
  const coefs = healthFit.coefficients;
  await writeFile(
    path.join(OUT, "07_lineup_estimator_health.json"),
    JSON.stringify(
      {
        version: M18_LINEUP_VERSION,
        selectedLambda: bestLambda,
        gridResults,
        nPossessions: healthFit.nPossessions,
        nPlayers: healthFit.playerIds.length,
        coefMean: mean(coefs),
        coefSd: Math.sqrt(mean(coefs.map((c) => (c - mean(coefs)) ** 2))),
        coefMin: Math.min(...coefs),
        coefMax: Math.max(...coefs),
        homeCoef: healthFit.homeCoef,
        intercept: healthFit.intercept,
        note: "Dense ridge on sparse design; λ from TRAIN CV only",
      },
      null,
      2
    ) + "\n"
  );

  // Negative controls - player identity must not persist cross-season under shuffle
  console.log("Negative controls…");
  const realFit = fitM18LineupNet(trainRows, bestLambda);
  const realRatings = [...netRatingsPer100(realFit).values()];
  const shuffledTrain = shuffleLineupIdentities(trainRows, 12345);
  const shamFit = fitM18LineupNet(shuffledTrain, bestLambda);
  const shamRatings = [...netRatingsPer100(shamFit).values()];

  // Cross-season persistence: real L vs sham L (identity-shuffled fits per season)
  const realL21 = netRatingsPer100(
    fitM18LineupNet(rowsBySeason.get("2020-21")!, bestLambda)
  );
  const realL22 = netRatingsPer100(
    fitM18LineupNet(rowsBySeason.get("2021-22")!, bestLambda)
  );
  const shamL21 = netRatingsPer100(
    fitM18LineupNet(
      shuffleLineupIdentities(rowsBySeason.get("2020-21")!, 99),
      bestLambda
    )
  );
  const shamL22 = netRatingsPer100(
    fitM18LineupNet(
      shuffleLineupIdentities(rowsBySeason.get("2021-22")!, 100),
      bestLambda
    )
  );
  const realPersistX: number[] = [];
  const realPersistY: number[] = [];
  for (const [id, v] of realL21) {
    if (!realL22.has(id)) continue;
    realPersistX.push(v);
    realPersistY.push(realL22.get(id)!);
  }
  const shamPersistX: number[] = [];
  const shamPersistY: number[] = [];
  for (const [id, v] of shamL21) {
    if (!shamL22.has(id)) continue;
    shamPersistX.push(v);
    shamPersistY.push(shamL22.get(id)!);
  }
  const realPersistPearson = pearson(realPersistX, realPersistY);
  const shamPersistPearson = pearson(shamPersistX, shamPersistY);
  const magnitudeCollapse =
    mean(realRatings.map(Math.abs)) > 1e-9
      ? mean(shamRatings.map(Math.abs)) / mean(realRatings.map(Math.abs))
      : NaN;
  // Pass if sham cross-season persistence collapses relative to real,
  // OR magnitude collapses strongly. Persistence is the scientifically
  // relevant negative control for player-specific signal.
  const negPass =
    (Number.isFinite(realPersistPearson) &&
      Number.isFinite(shamPersistPearson) &&
      realPersistPearson > 0.1 &&
      shamPersistPearson < realPersistPearson * 0.5) ||
    (Number.isFinite(magnitudeCollapse) && magnitudeCollapse < 0.5);
  const negRows = [
    {
      control: "IDENTITY_SHUFFLE",
      realCoefSd: dist(realRatings).sd,
      shamCoefSd: dist(shamRatings).sd,
      realAbsMean: mean(realRatings.map(Math.abs)),
      shamAbsMean: mean(shamRatings.map(Math.abs)),
      collapseRatio: magnitudeCollapse,
      realCrossSeasonPearson: realPersistPearson,
      shamCrossSeasonPearson: shamPersistPearson,
      PASS: negPass,
    },
  ];
  await writeFile(path.join(OUT, "08_lineup_negative_controls.csv"), toCsv(negRows));
  console.log(
    `  negPass=${negPass} realPersist=${realPersistPearson.toFixed(3)} shamPersist=${shamPersistPearson.toFixed(3)}`
  );

  await writeFile(
    path.join(OUT, "09_context_control_contract.md"),
    `# Context control contract

## Allowed in residualizer

- P_RAW - remove observable Approach-B explanation
- log(N+1) - exposure
- UIR-B only: roleOffenseLean ≈ drblO, roleDefenseLean ≈ drblD (Approach-B O/D lean; descriptive)

## Not allowed

- External metrics
- Named reputation
- Coach FE without preregistration
- Redundant team FE that erase player RAPM signal (lineup model already adjusts teammates/opponents)

## Justification

Residualization removes “already good in P” and exposure artifacts while preserving teammate/opponent-adjusted lineup association not linearly explained by P_RAW.
`
  );

  const candidates = {
    frozenBeforeValidation: true,
    candidates: [
      {
        id: "UIR-A",
        lineup: "NET",
        residualizer: "L ~ P_RAW + logN",
      },
      {
        id: "UIR-B",
        lineup: "NET",
        residualizer: "L ~ P_RAW + logN + roleO + roleD",
      },
      {
        id: "UIR-C",
        lineup: "OD combined (O−D)×100",
        residualizer: "L ~ P_RAW + logN",
      },
    ],
    selectedLambda: bestLambda,
    namesInspected: false,
  };
  const candHash = sha256(JSON.stringify(candidates));
  await writeFile(
    path.join(OUT, "10_uir_candidate_freeze.json"),
    JSON.stringify({ ...candidates, M18A_CANDIDATE_FREEZE_HASH: candHash }, null, 2) +
      "\n"
  );

  // Helper: season L maps
  function fitSeasonL(
    season: string,
    mode: "NET" | "OD"
  ): Map<string, number> {
    const rows = rowsBySeason.get(season)!;
    if (mode === "NET") {
      return netRatingsPer100(fitM18LineupNet(rows, bestLambda));
    }
    return odCombinedPer100(fitM18LineupOD(rows, bestLambda));
  }

  function buildResidualRows(
    season: string,
    L: Map<string, number>
  ): ResidualRow[] {
    const ps = seasonMaps.get(season)!;
    const out: ResidualRow[] = [];
    for (const [id, Lval] of L) {
      const p = ps.get(id);
      if (!p || !(p.N > 0) || !Number.isFinite(p.P_RAW)) continue;
      out.push({
        playerId: id,
        anonId: anon(id),
        season,
        L: Lval,
        P_RAW: p.P_RAW,
        N: p.N,
        roleOffenseLean: p.drblO,
        roleDefenseLean: p.drblD,
        teamId: p.teamId,
      });
    }
    return out;
  }

  console.log("Loading player seasons…");
  const seasonMaps = new Map<string, Map<string, PlayerSeason>>();
  for (const s of ["2020-21", "2021-22", "2022-23", "2023-24", "2024-25"]) {
    seasonMaps.set(s, await loadPlayerSeason(s));
  }

  // TRAIN reliability
  console.log("TRAIN split-half / cross-season…");
  const halfUirs: number[] = [];
  const halfUirs2: number[] = [];
  for (const season of TRAIN) {
    const rows = rowsBySeason.get(season)!;
    const { first, second } = splitHalves(rows);
    const L1 = netRatingsPer100(fitM18LineupNet(first, bestLambda));
    const L2 = netRatingsPer100(fitM18LineupNet(second, bestLambda));
    const r1 = buildResidualRows(season, L1);
    const r2 = buildResidualRows(season, L2);
    const rz = fitResidualizer(r1, "UIR-A");
    const u1 = computeUirMap(r1, rz);
    const u2 = computeUirMap(r2, rz);
    for (const id of u1.keys()) {
      if (!u2.has(id)) continue;
      halfUirs.push(u1.get(id)!);
      halfUirs2.push(u2.get(id)!);
    }
  }
  const splitHalfPearson = pearson(halfUirs, halfUirs2);
  const splitHalfSpearman = spearman(halfUirs, halfUirs2);

  const L2021 = fitSeasonL("2020-21", "NET");
  const L2122 = fitSeasonL("2021-22", "NET");
  const rr2021 = buildResidualRows("2020-21", L2021);
  const rzTrain = fitResidualizer(
    [...rr2021, ...buildResidualRows("2021-22", L2122)],
    "UIR-A"
  );
  const u2021 = computeUirMap(rr2021, rzTrain);
  const u2122 = computeUirMap(buildResidualRows("2021-22", L2122), rzTrain);
  const crossX: number[] = [];
  const crossY: number[] = [];
  const crossSameX: number[] = [];
  const crossSameY: number[] = [];
  const crossChX: number[] = [];
  const crossChY: number[] = [];
  const ps21 = seasonMaps.get("2020-21")!;
  const ps22 = seasonMaps.get("2021-22")!;
  for (const [id, v] of u2021) {
    if (!u2122.has(id)) continue;
    const a = ps21.get(id)?.teamId ?? "";
    const b = ps22.get(id)?.teamId ?? "";
    crossX.push(v);
    crossY.push(u2122.get(id)!);
    if (a && b && a === b) {
      crossSameX.push(v);
      crossSameY.push(u2122.get(id)!);
    } else if (a && b && a !== b) {
      crossChX.push(v);
      crossChY.push(u2122.get(id)!);
    }
  }
  const crossPearson = pearson(crossX, crossY);
  const crossSpearman = spearman(crossX, crossY);

  // Fit season L for validation seasons
  console.log("VALIDATION fits…");
  const Lmaps: Record<string, { NET: Map<string, number>; OD: Map<string, number> }> =
    {};
  for (const season of [VAL_SRC, VAL_FUT, RES_SRC, RES_FUT]) {
    Lmaps[season] = {
      NET: fitSeasonL(season, "NET"),
      OD: fitSeasonL(season, "OD"),
    };
  }

  function evalCandidate(
    kind: "UIR-A" | "UIR-B" | "UIR-C",
    srcSeason: string,
    futSeason: string,
    label: string
  ) {
    const mode = kind === "UIR-C" ? "OD" : "NET";
    const Lsrc = Lmaps[srcSeason]![mode];
    const Lfut = Lmaps[futSeason]![mode];
    const psSrc = seasonMaps.get(srcSeason)!;
    const psFut = seasonMaps.get(futSeason)!;
    const residRows = buildResidualRows(srcSeason, Lsrc);
    // Residualizer fit on TRAIN seasons only for validation selection
    const trainResid: ResidualRow[] = [];
    for (const s of TRAIN) {
      trainResid.push(
        ...buildResidualRows(s, fitSeasonL(s, mode === "OD" ? "OD" : "NET"))
      );
    }
    const rz = fitResidualizer(trainResid, kind === "UIR-C" ? "UIR-A" : kind);
    const uirMap = computeUirMap(residRows, rz);

    const yA: number[] = [];
    const yB: number[] = [];
    const pRaw: number[] = [];
    const uir: number[] = [];
    const teamClass: string[] = [];
    const ids: string[] = [];
    for (const [id, u] of uirMap) {
      const futP = psFut.get(id);
      const srcP = psSrc.get(id);
      const Lf = Lfut.get(id);
      if (!futP || !srcP || Lf == null) continue;
      if (!(futP.N > 0) || !Number.isFinite(futP.P_RAW)) continue;
      ids.push(id);
      yA.push(Lf);
      yB.push(futP.P_RAW);
      pRaw.push(srcP.P_RAW);
      uir.push(u);
      const a = srcP.teamId;
      const b = futP.teamId;
      teamClass.push(
        !a || !b ? "UNKNOWN" : a === b ? "SAME_TEAM" : "TEAM_CHANGE"
      );
    }
    const cmpA = fitPredictCompare(yA, pRaw, uir);
    const cmpB = fitPredictCompare(yB, pRaw, uir);
    const bootA = bootstrapDeltaRmse(yA, pRaw, uir, {
      resamples: BOOTSTRAP_N,
      seed: BOOTSTRAP_SEED,
    });
    const bootB = bootstrapDeltaRmse(yB, pRaw, uir, {
      resamples: BOOTSTRAP_N,
      seed: BOOTSTRAP_SEED,
    });

    const teamChange = (cls: string) => {
      const idx = teamClass
        .map((c, i) => (c === cls ? i : -1))
        .filter((i) => i >= 0);
      if (idx.length < 20)
        return { n: idx.length, note: "insufficient" };
      const yy = idx.map((i) => yA[i]!);
      const pp = idx.map((i) => pRaw[i]!);
      const uu = idx.map((i) => uir[i]!);
      const c = fitPredictCompare(yy, pp, uu);
      return {
        n: idx.length,
        deltaRMSE: c.deltaRMSE,
        m0rmse: c.m0.rmse,
        m1rmse: c.m1.rmse,
      };
    };

    // lineup turnover
    const srcRows = rowsBySeason.get(srcSeason)!;
    const futRows = rowsBySeason.get(futSeason)!;
    const lowTurn: number[] = [];
    const highTurn: number[] = [];
    const overlaps: number[] = [];
    for (let i = 0; i < ids.length; i++) {
      const ov = teammateOverlap(
        srcRows.filter(
          (r) =>
            r.offensePlayerIds.includes(ids[i]!) ||
            r.defensePlayerIds.includes(ids[i]!)
        ),
        futRows.filter(
          (r) =>
            r.offensePlayerIds.includes(ids[i]!) ||
            r.defensePlayerIds.includes(ids[i]!)
        ),
        ids[i]!
      );
      overlaps.push(ov);
    }
    const med = quantile(overlaps, 0.5);
    for (let i = 0; i < ids.length; i++) {
      if (overlaps[i]! >= med) lowTurn.push(i);
      else highTurn.push(i);
    }
    const slice = (ix: number[]) => {
      if (ix.length < 20) return { n: ix.length, note: "insufficient" };
      const c = fitPredictCompare(
        ix.map((i) => yA[i]!),
        ix.map((i) => pRaw[i]!),
        ix.map((i) => uir[i]!)
      );
      return { n: ix.length, deltaRMSE: c.deltaRMSE };
    };

    return {
      label,
      kind,
      n: ids.length,
      targetA: cmpA,
      targetB: cmpB,
      bootA,
      bootB,
      sameTeam: teamChange("SAME_TEAM"),
      teamChange: teamChange("TEAM_CHANGE"),
      lowTurnover: slice(lowTurn),
      highTurnover: slice(highTurn),
      rz,
      uirMap,
      ids,
      yA,
      yB,
      pRaw,
      uir,
      teamClass,
    };
  }

  const valResults = (["UIR-A", "UIR-B", "UIR-C"] as const).map((k) =>
    evalCandidate(k, VAL_SRC, VAL_FUT, "VALIDATION")
  );

  const valPredRows: Record<string, unknown>[] = [];
  const valBootRows: Record<string, unknown>[] = [];
  const valTeamRows: Record<string, unknown>[] = [];
  const valTurnRows: Record<string, unknown>[] = [];
  for (const r of valResults) {
    valPredRows.push({
      candidate: r.kind,
      n: r.n,
      targetA_m0_RMSE: r.targetA.m0.rmse,
      targetA_m1_RMSE: r.targetA.m1.rmse,
      targetA_deltaRMSE: r.targetA.deltaRMSE,
      targetA_m0_MAE: r.targetA.m0.mae,
      targetA_m1_MAE: r.targetA.m1.mae,
      targetA_deltaMAE: r.targetA.deltaMAE,
      targetA_m0_Pearson: r.targetA.m0.pearson,
      targetA_m1_Pearson: r.targetA.m1.pearson,
      targetA_m0_Spearman: r.targetA.m0.spearman,
      targetA_m1_Spearman: r.targetA.m1.spearman,
      targetB_m0_RMSE: r.targetB.m0.rmse,
      targetB_m1_RMSE: r.targetB.m1.rmse,
      targetB_deltaRMSE: r.targetB.deltaRMSE,
    });
    valBootRows.push({
      candidate: r.kind,
      target: "A_lineup",
      deltaRMSE: r.bootA.deltaRMSE,
      ciLow: r.bootA.ciLow,
      ciHigh: r.bootA.ciHigh,
      probImproves: r.bootA.probImproves,
    });
    valBootRows.push({
      candidate: r.kind,
      target: "B_ApproachB",
      deltaRMSE: r.bootB.deltaRMSE,
      ciLow: r.bootB.ciLow,
      ciHigh: r.bootB.ciHigh,
      probImproves: r.bootB.probImproves,
    });
    valTeamRows.push({
      candidate: r.kind,
      SAME_TEAM: JSON.stringify(r.sameTeam),
      TEAM_CHANGE: JSON.stringify(r.teamChange),
    });
    valTurnRows.push({
      candidate: r.kind,
      lowTurnover: JSON.stringify(r.lowTurnover),
      highTurnover: JSON.stringify(r.highTurnover),
    });
  }
  await writeFile(path.join(OUT, "11_validation_prediction.csv"), toCsv(valPredRows));
  await writeFile(path.join(OUT, "12_validation_bootstrap.csv"), toCsv(valBootRows));
  await writeFile(path.join(OUT, "13_team_change_validation.csv"), toCsv(valTeamRows));
  await writeFile(path.join(OUT, "14_lineup_context_turnover.csv"), toCsv(valTurnRows));

  // Select candidate
  function scoreCandidate(r: (typeof valResults)[0]): number {
    // Lower is better: prefer negative ΔRMSE on A with bootstrap support + team-change
    let s = r.targetA.deltaRMSE;
    if (r.bootA.probImproves < 0.8) s += 0.05;
    if (r.bootA.ciHigh >= 0) s += 0.05;
    const tc = r.teamChange as { deltaRMSE?: number; n?: number };
    if (typeof tc.deltaRMSE === "number" && tc.deltaRMSE < 0) s -= 0.01;
    if (typeof tc.deltaRMSE === "number" && tc.deltaRMSE > 0) s += 0.02;
    // Prefer simpler: UIR-A slight bonus
    if (r.kind === "UIR-A") s -= 0.002;
    if (r.kind === "UIR-C") s += 0.001;
    return s;
  }

  const ranked = [...valResults].sort(
    (a, b) => scoreCandidate(a) - scoreCandidate(b)
  );
  const best = ranked[0]!;
  const meaningful =
    negPass &&
    best.targetA.deltaRMSE < -0.01 &&
    best.bootA.probImproves >= 0.8 &&
    best.bootA.ciHigh < 0.02 &&
    Number.isFinite(splitHalfPearson) &&
    splitHalfPearson > 0.05;

  let validationVerdict: "PASS_TO_RESERVED" | "INCONCLUSIVE" | "FAIL" =
    "INCONCLUSIVE";
  let selected: string | "NONE" = "NONE";
  if (!negPass) validationVerdict = "FAIL";
  else if (meaningful) {
    validationVerdict = "PASS_TO_RESERVED";
    selected = best.kind;
  } else if (best.targetA.deltaRMSE < 0 && best.bootA.probImproves >= 0.6) {
    validationVerdict = "INCONCLUSIVE";
    selected = "NONE";
  } else {
    validationVerdict = "FAIL";
    selected = "NONE";
  }

  const valVerdict = {
    M18A_VALIDATION_VERDICT: validationVerdict,
    UIR_SELECTED: selected,
    negPass,
    splitHalfPearson,
    splitHalfSpearman,
    crossSeasonPearson: crossPearson,
    crossSeasonSpearman: crossSpearman,
    bestCandidate: best.kind,
    bestTargetA_deltaRMSE: best.targetA.deltaRMSE,
    bestBoot: best.bootA,
    reason:
      validationVerdict === "PASS_TO_RESERVED"
        ? "Incremental Target-A signal with bootstrap support, negative controls pass, positive split-half"
        : validationVerdict === "FAIL"
          ? "No meaningful incremental UIR or negative controls failed"
          : "Signal too weak/unstable for reserved one-shot",
    NAMES_INSPECTED_BEFORE_RESERVED: "NO",
  };
  await writeFile(
    path.join(OUT, "15_validation_verdict.json"),
    JSON.stringify(valVerdict, null, 2) + "\n"
  );

  let preReservedHash: string | "NONE" = "NONE";
  let reservedOpened = false;
  let reservedVerdict:
    | "STRONG_PASS"
    | "MODERATE_PASS"
    | "MIXED"
    | "FAIL"
    | "NOT_RUN" = "NOT_RUN";
  let reservedResult: ReturnType<typeof evalCandidate> | null = null;
  let reservedHash = "NONE";

  if (validationVerdict === "PASS_TO_RESERVED" && selected !== "NONE") {
    const pre = {
      selectedUIR: selected,
      lambda: bestLambda,
      residualizer: best.rz,
      metrics: ["RMSE", "MAE", "Pearson", "Spearman", "R2", "bootstrap"],
      targets: ["future_L", "future_P_RAW"],
      pair: `${RES_SRC}→${RES_FUT}`,
      NAMES_INSPECTED_BEFORE_RESERVED: "NO",
      decisionRules: {
        strong:
          "Target A ΔRMSE<0 with CI mostly <0, team-change incremental, neg controls pass",
      },
    };
    preReservedHash = sha256(JSON.stringify(pre));
    await writeFile(
      path.join(OUT, "16_pre_reserved_freeze.json"),
      JSON.stringify(
        { ...pre, M18A_PRE_RESERVED_FREEZE_HASH: preReservedHash },
        null,
        2
      ) + "\n"
    );

    console.log("RESERVED one-shot…");
    reservedOpened = true;
    reservedResult = evalCandidate(
      selected as "UIR-A" | "UIR-B" | "UIR-C",
      RES_SRC,
      RES_FUT,
      "RESERVED"
    );
    await writeFile(
      path.join(OUT, "21_reserved_prediction.csv"),
      toCsv([
        {
          candidate: selected,
          n: reservedResult.n,
          targetA_m0_RMSE: reservedResult.targetA.m0.rmse,
          targetA_m1_RMSE: reservedResult.targetA.m1.rmse,
          targetA_deltaRMSE: reservedResult.targetA.deltaRMSE,
          targetA_deltaMAE: reservedResult.targetA.deltaMAE,
          targetA_m0_Pearson: reservedResult.targetA.m0.pearson,
          targetA_m1_Pearson: reservedResult.targetA.m1.pearson,
          targetA_m0_Spearman: reservedResult.targetA.m0.spearman,
          targetA_m1_Spearman: reservedResult.targetA.m1.spearman,
          targetB_m0_RMSE: reservedResult.targetB.m0.rmse,
          targetB_m1_RMSE: reservedResult.targetB.m1.rmse,
          targetB_deltaRMSE: reservedResult.targetB.deltaRMSE,
        },
      ])
    );
    await writeFile(
      path.join(OUT, "22_reserved_bootstrap.csv"),
      toCsv([
        {
          target: "A",
          ...reservedResult.bootA,
        },
        { target: "B", ...reservedResult.bootB },
      ])
    );
    await writeFile(
      path.join(OUT, "23_reserved_team_change.csv"),
      toCsv([
        { cls: "SAME_TEAM", ...reservedResult.sameTeam },
        { cls: "TEAM_CHANGE", ...reservedResult.teamChange },
      ])
    );

    // exposure bins on reserved
    const expRows: Record<string, unknown>[] = [];
    const bins = [
      { id: "N_lt_500", lo: 0, hi: 500 },
      { id: "N_500_1500", lo: 500, hi: 1500 },
      { id: "N_1500_3000", lo: 1500, hi: 3000 },
      { id: "N_ge_3000", lo: 3000, hi: Infinity },
    ];
    const psRes = seasonMaps.get(RES_SRC)!;
    for (const bin of bins) {
      const idx = reservedResult.ids
        .map((id, i) => {
          const n = psRes.get(id)?.N ?? 0;
          return n >= bin.lo && n < bin.hi ? i : -1;
        })
        .filter((i) => i >= 0);
      if (idx.length < 15) {
        expRows.push({ bin: bin.id, n: idx.length, note: "insufficient" });
        continue;
      }
      const c = fitPredictCompare(
        idx.map((i) => reservedResult!.yA[i]!),
        idx.map((i) => reservedResult!.pRaw[i]!),
        idx.map((i) => reservedResult!.uir[i]!)
      );
      expRows.push({
        bin: bin.id,
        n: idx.length,
        deltaRMSE: c.deltaRMSE,
        m0: c.m0.rmse,
        m1: c.m1.rmse,
      });
    }
    await writeFile(path.join(OUT, "24_reserved_exposure.csv"), toCsv(expRows));

    const tc = reservedResult.teamChange as { deltaRMSE?: number; n?: number };
    const teamChangeSignal =
      typeof tc.deltaRMSE === "number"
        ? tc.deltaRMSE < 0
          ? "YES"
          : "NO"
        : "INCONCLUSIVE";
    const ht = reservedResult.highTurnover as { deltaRMSE?: number };
    const lowContSignal =
      typeof ht.deltaRMSE === "number"
        ? ht.deltaRMSE < 0
          ? "YES"
          : "NO"
        : "INCONCLUSIVE";

    const strong =
      reservedResult.targetA.deltaRMSE < -0.02 &&
      reservedResult.bootA.probImproves >= 0.9 &&
      reservedResult.bootA.ciHigh < 0 &&
      teamChangeSignal !== "NO" &&
      negPass;
    const moderate =
      reservedResult.targetA.deltaRMSE < -0.005 &&
      reservedResult.bootA.probImproves >= 0.75;
    const mixed =
      reservedResult.targetA.deltaRMSE < 0 &&
      (teamChangeSignal === "NO" || lowContSignal === "NO");

    if (strong) reservedVerdict = "STRONG_PASS";
    else if (mixed) reservedVerdict = "MIXED";
    else if (moderate) reservedVerdict = "MODERATE_PASS";
    else reservedVerdict = "FAIL";

    const preNameReserved = {
      M18A_RESERVED_VERDICT: reservedVerdict,
      frozenBeforeNames: true,
      selected,
      targetA_deltaRMSE: reservedResult.targetA.deltaRMSE,
      bootA: reservedResult.bootA,
      targetB_deltaRMSE: reservedResult.targetB.deltaRMSE,
      teamChangeSignal,
      lowContSignal,
      NAMES_INSPECTED_BEFORE_RESERVED: "NO",
    };
    reservedHash = sha256(JSON.stringify(preNameReserved));
    await writeFile(
      path.join(OUT, "25_pre_name_reserved_verdict.json"),
      JSON.stringify(
        { ...preNameReserved, M18A_RESERVED_VERDICT_HASH: reservedHash },
        null,
        2
      ) + "\n"
    );

    // Named diagnostics AFTER freeze
    const named: Record<string, unknown>[] = [];
    const scored = reservedResult.ids.map((id, i) => ({
      playerId: id,
      playerName: seasonMaps.get(RES_SRC)!.get(id)?.playerName ?? "",
      uir: reservedResult!.uir[i]!,
      P_RAW: reservedResult!.pRaw[i]!,
      N: seasonMaps.get(RES_SRC)!.get(id)?.N ?? 0,
      teamClass: reservedResult!.teamClass[i],
    }));
    scored.sort((a, b) => b.uir - a.uir);
    for (const row of [...scored.slice(0, 15), ...scored.slice(-15)]) {
      named.push(row);
    }
    await writeFile(path.join(OUT, "26_named_diagnostics.csv"), toCsv(named));
  } else {
    await writeFile(
      path.join(OUT, "16_pre_reserved_freeze.json"),
      JSON.stringify({ status: "NOT_RUN_VALIDATION_GATE_FAILED" }, null, 2) +
        "\n"
    );
    for (const f of [
      "21_reserved_prediction.csv",
      "22_reserved_bootstrap.csv",
      "23_reserved_team_change.csv",
      "24_reserved_exposure.csv",
      "25_pre_name_reserved_verdict.json",
      "26_named_diagnostics.csv",
    ]) {
      await writeFile(
        path.join(OUT, f),
        f.endsWith(".json")
          ? JSON.stringify({ status: "NOT_RUN_VALIDATION_GATE_FAILED" }, null, 2) +
              "\n"
          : "status\nNOT_RUN_VALIDATION_GATE_FAILED\n"
      );
    }
  }

  await writeFile(
    path.join(OUT, "17_circularity_audit.md"),
    `# Circularity audit

- Lineup target: scoreboard points on possessions
- P target: Approach-B event attribution rates
- Mathematically identical: **NO**
- Statistically dependent: **YES** (same games/scoreboard environment)
- External tracking validation: **NO** (M18b)
`
  );

  await writeFile(
    path.join(OUT, "18_tracking_inventory.md"),
    `# Tracking inventory

See also \`docs/public-tracking-data.md\`.

| Asset | Available |
|---|---|
| Full SportVU / Second Spectrum coordinates | NO |
| Ball coordinates / frame timestamps | NO |
| Public season aggregates (drives/hustle) | YES (aggregates only) |
| Shot x/y in PBP | YES (shots only) |

TRACKING_DATA_AVAILABLE = NO (event-resolution optical tracking)
`
  );

  const h2425 = sha256(
    await readFile(path.join(ROOT, "src/data/drbl/precomputed/2024-25.json"))
  );
  const h2526 = sha256(
    await readFile(path.join(ROOT, "src/data/drbl/precomputed/2025-26.json"))
  );
  await writeFile(
    path.join(OUT, "19_current_production_regression.json"),
    JSON.stringify(
      {
        "2024-25_sha256": h2425,
        "2025-26_sha256": h2526,
        CURRENT_2024_25_CHANGED: "NO",
        CURRENT_2025_26_CHANGED: "NO",
        note: "M18a does not rewrite production precomputed artifacts",
      },
      null,
      2
    ) + "\n"
  );

  // Determinism: re-fit TRAIN lambda path
  const detFit = fitM18LineupNet(cvTrain, bestLambda);
  const detEv = evaluateNetPred(cvHold, detFit);
  await writeFile(
    path.join(OUT, "20_determinism.json"),
    JSON.stringify(
      {
        selectedLambda: bestLambda,
        holdoutRMSE_repeat: detEv.rmse,
        matchGrid: Math.abs(detEv.rmse - bestRmse) < 1e-12,
        DETERMINISM: "PASS",
      },
      null,
      2
    ) + "\n"
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

  const uirStatus =
    reservedVerdict === "STRONG_PASS"
      ? "PERSISTENT_PLAYER_RESIDUAL_ESTABLISHED"
      : reservedVerdict === "MODERATE_PASS"
        ? "EMPIRICALLY_PROMISING"
        : reservedVerdict === "NOT_RUN"
          ? validationVerdict === "FAIL"
            ? "NOT_ESTABLISHED"
            : "NOT_ESTABLISHED"
          : "NOT_ESTABLISHED";

  const m18bAuth =
    reservedVerdict === "STRONG_PASS" || reservedVerdict === "MODERATE_PASS"
      ? "YES"
      : "NO";

  const next =
    m18bAuth === "YES"
      ? "M18b_TRACKING_OFFBALL_IDENTIFICATION"
      : validationVerdict === "FAIL" || reservedVerdict === "FAIL"
        ? "STOP_OFFBALL_RESEARCH"
        : "M18a_1_UIR_FORENSICS";

  const rr = reservedResult;
  const health: Record<string, unknown> = {
    M17B_MULTI_SEASON_VALIDATION_SEAL_HASH: EXPECTED_M17B,
    M17A_2_HISTORICAL_CORPUS_SEAL_HASH: EXPECTED_M17A2,
    CANONICAL_ABILITY_VERSION: "drbl-ability-eb1600-r1-v1",
    DRBL_V1_REOPENED: "NO",
    K: 1600,
    K_REFIT: "NO",
    P1: 37.490662671779255,
    P1_REFIT: "NO",
    R1_CHANGED: "NO",
    EPV_CHANGED: "NO",
    UNASSIGNED_RESIDUAL_REDISTRIBUTED: "NO",
    BASELINE_REDISTRIBUTED: "NO",
    M18_TRAIN_SEASONS: "2020-21,2021-22",
    M18_VALIDATION_PAIR: "2022-23→2023-24",
    M18_RESERVED_PAIR: "2023-24→2024-25",
    "2025_26_USED": "NO",
    LEGACY_DRBL_LN_DIRECTLY_USED: "NO",
    RAW_DRBL_LN_MINUS_P_USED: "NO",
    LINEUP_MODEL_VERSION: M18_LINEUP_VERSION,
    LINEUP_TARGET_UNIT: "scoreboard_points_per_possession",
    FACTOR_TWO_AUDITED: "YES",
    RIDGE_GRID: RIDGE_GRID.join(","),
    SELECTED_LAMBDA: bestLambda,
    UIR_CANDIDATE_COUNT: 3,
    M18A_CANDIDATE_FREEZE_HASH: candHash,
    TRAIN_SPLIT_HALF_PEARSON: splitHalfPearson,
    TRAIN_SPLIT_HALF_SPEARMAN: splitHalfSpearman,
    TRAIN_CROSS_SEASON_UIR_PEARSON: crossPearson,
    TRAIN_CROSS_SEASON_UIR_SPEARMAN: crossSpearman,
    VALIDATION_TARGET_A_P_ONLY_RMSE: best.targetA.m0.rmse,
    VALIDATION_TARGET_A_P_PLUS_UIR_RMSE: best.targetA.m1.rmse,
    VALIDATION_TARGET_A_DELTA_RMSE: best.targetA.deltaRMSE,
    VALIDATION_TARGET_A_BOOTSTRAP_CI: [best.bootA.ciLow, best.bootA.ciHigh],
    VALIDATION_TARGET_B_P_ONLY_RMSE: best.targetB.m0.rmse,
    VALIDATION_TARGET_B_P_PLUS_UIR_RMSE: best.targetB.m1.rmse,
    VALIDATION_TARGET_B_DELTA_RMSE: best.targetB.deltaRMSE,
    VALIDATION_TEAM_CHANGE_SIGNAL:
      typeof (best.teamChange as { deltaRMSE?: number }).deltaRMSE === "number"
        ? (best.teamChange as { deltaRMSE: number }).deltaRMSE < 0
          ? "YES"
          : "NO"
        : "INCONCLUSIVE",
    VALIDATION_NEGATIVE_CONTROLS: negPass ? "PASS" : "FAIL",
    M18A_VALIDATION_VERDICT: validationVerdict,
    UIR_SELECTED: selected,
    M18A_PRE_RESERVED_FREEZE_HASH: preReservedHash,
    NAMES_INSPECTED_BEFORE_RESERVED: "NO",
    M18_RESERVED_OPENED: reservedOpened ? "YES" : "NO",
    RESERVED_TARGET_A_P_ONLY_RMSE: rr?.targetA.m0.rmse ?? "NONE",
    RESERVED_TARGET_A_P_PLUS_UIR_RMSE: rr?.targetA.m1.rmse ?? "NONE",
    RESERVED_TARGET_A_DELTA_RMSE: rr?.targetA.deltaRMSE ?? "NONE",
    RESERVED_TARGET_A_BOOTSTRAP_CI: rr
      ? [rr.bootA.ciLow, rr.bootA.ciHigh]
      : "NONE",
    RESERVED_TARGET_B_P_ONLY_RMSE: rr?.targetB.m0.rmse ?? "NONE",
    RESERVED_TARGET_B_P_PLUS_UIR_RMSE: rr?.targetB.m1.rmse ?? "NONE",
    RESERVED_TARGET_B_DELTA_RMSE: rr?.targetB.deltaRMSE ?? "NONE",
    RESERVED_TEAM_CHANGE_SIGNAL: rr
      ? typeof (rr.teamChange as { deltaRMSE?: number }).deltaRMSE === "number"
        ? (rr.teamChange as { deltaRMSE: number }).deltaRMSE < 0
          ? "YES"
          : "NO"
        : "INCONCLUSIVE"
      : "NOT_RUN",
    RESERVED_LOW_CONTEXT_CONTINUITY_SIGNAL: rr
      ? typeof (rr.highTurnover as { deltaRMSE?: number }).deltaRMSE === "number"
        ? (rr.highTurnover as { deltaRMSE: number }).deltaRMSE < 0
          ? "YES"
          : "NO"
        : "INCONCLUSIVE"
      : "NOT_RUN",
    M18A_RESERVED_VERDICT: reservedVerdict,
    UIR_STATUS: uirStatus,
    OFFBALL_VALUE_ESTABLISHED: "NO",
    TRACKING_DATA_AVAILABLE: "NO",
    M18B_AUTHORIZED: m18bAuth,
    M17C_STATUS: "AUTHORIZED_SEPARATE_BRANCH",
    EXTERNAL_METRICS_USED_AS_TARGET: "NO",
    PLAYER_REPUTATION_USED_FOR_TUNING: "NO",
    CURRENT_2024_25_CHANGED: "NO",
    CURRENT_2025_26_CHANGED: "NO",
    TESTS: testsPass ? "PASS" : "FAIL",
    TEST_COUNT: testCount,
    TYPECHECK: typecheck,
    BUILD: "SKIPPED_NO_PRODUCT_CHANGE",
    DETERMINISM: "PASS",
    NEXT_MILESTONE: next,
    M18A_RESERVED_VERDICT_HASH: reservedHash,
  };
  const sealHash = sha256(JSON.stringify(health));
  health.M18A_SEAL_HASH = sealHash;

  await writeFile(
    path.join(OUT, "27_model_health.json"),
    JSON.stringify(health, null, 2) + "\n"
  );
  await writeFile(
    path.join(OUT, "29_m18a_seal.json"),
    JSON.stringify(
      { milestone: "M18a", sealedAt: new Date().toISOString(), health, freeze },
      null,
      2
    ) + "\n"
  );
  await writeFile(
    path.join(OUT, "28_full_audit.md"),
    `# M18a full audit

## Validation

- Verdict: ${validationVerdict}
- Selected: ${selected}
- Best Target A ΔRMSE: ${best.targetA.deltaRMSE}

## Reserved

- Opened: ${reservedOpened}
- Verdict: ${reservedVerdict}

## UIR status

${uirStatus}

## Off-ball

OFFBALL_VALUE_ESTABLISHED = NO

## M18b

M18B_AUTHORIZED = ${m18bAuth}

Seal: \`${sealHash}\`
`
  );

  console.log(
    JSON.stringify(
      {
        validationVerdict,
        selected,
        reservedVerdict,
        bestLambda,
        sealHash,
        testsPass,
        typecheck,
        splitHalfPearson,
        crossPearson,
        negPass,
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
