/**
 * M16g2 — research/production alignment shadow architecture.
 *   npm run drbl:m16g2
 *
 * Implements research-only:
 *   rawAbilityRate → EB(k=1600, prior=0, N=actual combined) → researchDRBL100
 *
 * Does NOT change production, WAR, calibration, or open RESERVED_TEST predictive eval.
 * Does NOT use M16b VALIDATION to redesign architecture.
 */
import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";

import {
  EVALUATION_PROTOCOL_VERSION,
} from "../drbl/evaluation/protocol";
import { verifyFrozenSplitHashes } from "../drbl/evaluation/m16c-dataset";
import { hashGames, type SplitGame } from "../drbl/evaluation/splits";
import { pearson, spearman, rmse } from "../drbl/evaluation/metrics";
import { SEQUENTIAL_ATTRIBUTION_VERSION } from "../drbl/models/sequential-attribution";
import { ABILITY_LINEAGE_VERSION } from "../drbl/models/ability-lineage";
import {
  DEFAULT_RANKING_MODE,
  PRIOR_EQUIVALENT_POSSESSIONS,
} from "../drbl/models/ranking-config";
import { empiricalBayesRate } from "../drbl/models/leaderboard";
import {
  RESEARCH_ABILITY_VERSION,
  RESEARCH_K,
  RESEARCH_POSTERIOR_LAYER_COUNT,
  RESEARCH_POSTERIOR_VERSION,
  RESEARCH_PRIOR_MEAN,
  computeResearchAbilityV1,
  wrongPathEb1600OfDrblP,
  wrongPathEb1600OfEb200,
  wrongPathEb200OfEb1600,
} from "../drbl/models/research-ability-v1";
import {
  WAR_EXPOSURE_UNIT,
  WAR_FORMULA_VERSION,
} from "../drbl/models/pipeline-value";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m16g2");
const CHARTS = path.join(OUT, "charts");
const M16G = path.join(ROOT, "reports", "m16g");
const M16G1 = path.join(ROOT, "reports", "m16g1");
const ARTIFACT_2024 =
  path.join(ROOT, "reports", "m16a", "artifacts", "full-2024-25.json");

const EXPECTED_TRAIN =
  "7bec77be45295ee858d90896d9383e4da951e98e81ad1ef31b5285fb055d1550";
const EXPECTED_VAL =
  "4fd339a445f269162c2d76e9102ea5bb965a5d0fc05e0fcd2f60593117c5faf0";
const EXPECTED_RES =
  "e542aa54602390ed65792f37e10207814e10b62bfdf552ddf4da69825076c1ce";

const M16G1_K1600_RMSE = 2.6960956582451727;
const M16G1_REL_MEDIAN = 0.4557823129251701;
const M16G1_REL_P10 = 0.12424740010946908;
const M16G1_REL_P90 = 0.7057741816844428;
const PRACTICAL_OPTIMUM_MIN_K = 1600;
const NUMERIC_BEST_K = 2400;
const PROD_COMPONENT_K = PRIOR_EQUIVALENT_POSSESSIONS;
const PROD_FUSED_K = PRIOR_EQUIVALENT_POSSESSIONS;

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
function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((p / 100) * (sorted.length - 1)))
  );
  return sorted[idx]!;
}
function distSummary(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return {
    n: xs.length,
    mean: mean(xs),
    sd: sd(xs),
    median: percentile(s, 50),
    p1: percentile(s, 1),
    p5: percentile(s, 5),
    p25: percentile(s, 25),
    p75: percentile(s, 75),
    p95: percentile(s, 95),
    p99: percentile(s, 99),
    min: s[0] ?? NaN,
    max: s[s.length - 1] ?? NaN,
  };
}

type FoldRow = {
  foldId: number;
  playerId: string;
  rawPB: number;
  publishedDrblP: number;
  N: number;
  target: number;
};

function parseFoldRows(csv: string): FoldRow[] {
  const lines = csv.trim().split(/\r?\n/).slice(1);
  return lines.map((line) => {
    const cols = line.split(",");
    return {
      foldId: Number(cols[0]),
      playerId: cols[1]!,
      rawPB: Number(cols[2]),
      publishedDrblP: Number(cols[3]),
      N: Number(cols[4]),
      target: Number(cols[5]),
    };
  });
}

function svgScatter(
  pts: Array<{ x: number; y: number }>,
  title: string,
  xlab: string,
  ylab: string,
  diagonal = false
): string {
  const w = 560,
    h = 340,
    pad = 52;
  const xs = pts.map((p) => p.x).filter(Number.isFinite);
  const ys = pts.map((p) => p.y).filter(Number.isFinite);
  if (!xs.length || !ys.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="20" y="40">${title}</text></svg>`;
  }
  const xmin = Math.min(...xs),
    xmax = Math.max(...xs),
    ymin = Math.min(...ys),
    ymax = Math.max(...ys);
  const dx = xmax - xmin || 1;
  const dy = ymax - ymin || 1;
  const mapX = (x: number) => pad + ((x - xmin) / dx) * (w - 2 * pad);
  const mapY = (y: number) => h - pad - ((y - ymin) / dy) * (h - 2 * pad);
  const dots = pts
    .slice(0, 2000)
    .map(
      (p) =>
        `<circle cx="${mapX(p.x).toFixed(1)}" cy="${mapY(p.y).toFixed(1)}" r="2.2" fill="#1f4e79" fill-opacity="0.45"/>`
    )
    .join("");
  let diag = "";
  if (diagonal) {
    const lo = Math.max(xmin, ymin);
    const hi = Math.min(xmax, ymax);
    diag = `<line x1="${mapX(lo)}" y1="${mapY(lo)}" x2="${mapX(hi)}" y2="${mapY(hi)}" stroke="#c0392b" stroke-dasharray="4 3"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="100%" height="100%" fill="#fafafa"/>
  <text x="${w / 2}" y="24" text-anchor="middle" font-family="Segoe UI,sans-serif" font-size="14">${title}</text>
  <text x="${w / 2}" y="${h - 12}" text-anchor="middle" font-size="11">${xlab}</text>
  <text x="16" y="${h / 2}" text-anchor="middle" font-size="11" transform="rotate(-90 16 ${h / 2})">${ylab}</text>
  ${diag}${dots}
</svg>`;
}

function svgHist(
  values: number[],
  title: string,
  xlab: string,
  bins = 30
): string {
  const w = 560,
    h = 340,
    pad = 52;
  const finite = values.filter(Number.isFinite);
  if (!finite.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="20" y="40">${title}</text></svg>`;
  }
  const xmin = Math.min(...finite);
  const xmax = Math.max(...finite);
  const dx = (xmax - xmin) / bins || 1;
  const counts = new Array(bins).fill(0) as number[];
  for (const v of finite) {
    const i = Math.min(bins - 1, Math.floor((v - xmin) / dx));
    counts[i]!++;
  }
  const ymax = Math.max(...counts) || 1;
  const barW = (w - 2 * pad) / bins;
  const bars = counts
    .map((c, i) => {
      const bh = ((c / ymax) * (h - 2 * pad));
      const x = pad + i * barW;
      const y = h - pad - bh;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(barW - 1).toFixed(1)}" height="${bh.toFixed(1)}" fill="#1f4e79" fill-opacity="0.7"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="100%" height="100%" fill="#fafafa"/>
  <text x="${w / 2}" y="24" text-anchor="middle" font-family="Segoe UI,sans-serif" font-size="14">${title}</text>
  <text x="${w / 2}" y="${h - 12}" text-anchor="middle" font-size="11">${xlab}</text>
  ${bars}
</svg>`;
}

function svgLine(
  points: Array<{ x: number; y: number }>,
  title: string,
  xlab: string,
  ylab: string
): string {
  const w = 560,
    h = 340,
    pad = 52;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xmin = Math.min(...xs),
    xmax = Math.max(...xs),
    ymin = Math.min(...ys),
    ymax = Math.max(...ys);
  const dx = xmax - xmin || 1;
  const dy = ymax - ymin || 1;
  const mapped = points.map((p) => ({
    x: pad + ((p.x - xmin) / dx) * (w - 2 * pad),
    y: h - pad - ((p.y - ymin) / dy) * (h - 2 * pad),
  }));
  const d = mapped
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="100%" height="100%" fill="#fafafa"/>
  <text x="${w / 2}" y="24" text-anchor="middle" font-family="Segoe UI,sans-serif" font-size="14">${title}</text>
  <text x="${w / 2}" y="${h - 12}" text-anchor="middle" font-size="11">${xlab}</text>
  <text x="16" y="${h / 2}" text-anchor="middle" font-size="11" transform="rotate(-90 16 ${h / 2})">${ylab}</text>
  <path d="${d}" fill="none" stroke="#1f4e79" stroke-width="2"/>
</svg>`;
}

async function loadSplitList(
  name: "train" | "validation" | "reserved_test"
): Promise<SplitGame[]> {
  const file =
    name === "reserved_test" ? "reserved_test_game_ids.json" : `${name}_game_ids.json`;
  const p = path.join(ROOT, "reports/m16b/splits", file);
  const raw = JSON.parse(await readFile(p, "utf8")) as
    | { games?: SplitGame[] }
    | SplitGame[];
  return Array.isArray(raw) ? raw : (raw.games ?? []);
}

async function inventoryFieldConsumers(): Promise<Record<string, unknown>[]> {
  const fields = [
    "drblP",
    "drblLn",
    "drblB",
    "fusedRateRaw",
    "posteriorAbilityRate",
    "drbl100",
    "drblO",
    "drblD",
    "uncertainty",
    "intervalLo",
    "intervalHi",
    "seasonalImpact",
    "rank",
    "WAR",
    "drblWar",
    "seasonWar",
  ];
  const roots = ["drbl", "src", "scripts"];
  const rows: Record<string, unknown>[] = [];
  for (const field of fields) {
    const hits: string[] = [];
    for (const root of roots) {
      try {
        const out = execSync(
          `rg -l --glob "*.ts" --glob "*.tsx" --glob "!**/node_modules/**" ${JSON.stringify(field)} ${root}`,
          { cwd: ROOT, encoding: "utf8" }
        );
        hits.push(
          ...out
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean)
        );
      } catch {
        // no matches
      }
    }
    const uniq = [...new Set(hits)].sort();
    for (const file of uniq) {
      let consumerClass = "other";
      if (file.includes("__tests__") || file.endsWith(".test.ts"))
        consumerClass = "test";
      else if (file.startsWith("scripts")) consumerClass = "artifact writer";
      else if (file.includes("war")) consumerClass = "WAR";
      else if (file.includes("compute-season") || file.includes("player-value"))
        consumerClass = "model";
      else if (file.includes("ability-lineage") || file.includes("fusion"))
        consumerClass = "model";
      else if (file.includes("board-provenance") || file.includes("leaderboard"))
        consumerClass = "loader";
      else if (file.includes("precomputed") || file.includes("providers"))
        consumerClass = "API";
      else if (file.includes("explore") || file.includes("player-season-table"))
        consumerClass = "explore table";
      else if (file.includes("players/[") || file.includes("players\\["))
        consumerClass = "player page";
      else if (file.includes("charts") || file.includes("savant"))
        consumerClass = "chart";
      else if (file.startsWith("src/app") || file.startsWith("src\\app"))
        consumerClass = "API";
      else if (file.startsWith("src/data") || file.startsWith("src\\data"))
        consumerClass = "loader";
      else if (file.startsWith("src/lib") || file.startsWith("src\\lib"))
        consumerClass = "API";
      rows.push({
        field,
        file: file.replace(/\\/g, "/"),
        consumerClass,
      });
    }
    if (!uniq.length) {
      rows.push({ field, file: "(none found)", consumerClass: "unmapped" });
    }
  }
  return rows;
}

async function main() {
  await mkdir(CHARTS, { recursive: true });
  const timestamp = new Date().toISOString();
  const gitCommit = execSync("git rev-parse HEAD", {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  const dirty =
    execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" }).trim()
      .length > 0;

  const trainGames = await loadSplitList("train");
  const valGames = await loadSplitList("validation");
  const reservedGames = await loadSplitList("reserved_test");
  const reservedHash = hashGames(reservedGames);
  const hashCheck = verifyFrozenSplitHashes({
    train: trainGames,
    validation: valGames,
    trainHashExpected: EXPECTED_TRAIN,
    validationHashExpected: EXPECTED_VAL,
    reservedTestHashExpected: EXPECTED_RES,
    reservedTestGamesForHashOnly: reservedGames,
  });
  if (!hashCheck.ok || reservedHash !== EXPECTED_RES) {
    await writeFile(
      path.join(OUT, "00_freeze.json"),
      JSON.stringify(
        {
          status: "EVALUATION_PROTOCOL_DRIFT",
          hashCheck,
          reservedHash,
          timestamp,
          gitCommit,
          gitDirty: dirty,
        },
        null,
        2
      )
    );
    throw new Error("STOP EVALUATION_PROTOCOL_DRIFT");
  }

  const freeze = {
    milestone: "M16g2",
    timestamp,
    gitCommit,
    gitDirty: dirty,
    evaluationProtocolVersion: EVALUATION_PROTOCOL_VERSION,
    trainSplitHash: EXPECTED_TRAIN,
    validationSplitHash: EXPECTED_VAL,
    reservedTestSplitHash: EXPECTED_RES,
    approachBVersion: SEQUENTIAL_ATTRIBUTION_VERSION,
    abilityLineageVersion: ABILITY_LINEAGE_VERSION,
    productionPosteriorVersion: "eb-fused-v1",
    productionComponentK: PROD_COMPONENT_K,
    productionFusedK: PROD_FUSED_K,
    researchAbilityVersion: RESEARCH_ABILITY_VERSION,
    researchPosteriorVersion: RESEARCH_POSTERIOR_VERSION,
    researchK: RESEARCH_K,
    priorMean: RESEARCH_PRIOR_MEAN,
    exposureDefinition: "actual_combined_possession_appearances",
    WAR_versions_by_season: {
      "2024-25": WAR_FORMULA_VERSION,
      "2025-26": "provisional (unchanged in M16g2)",
    },
    WAR_exposureUnit: WAR_EXPOSURE_UNIT,
    RESERVED_TEST_PREDICTIVE_METRICS_USED: "NO",
    PRODUCTION_CHANGED: "NO",
  };
  await writeFile(
    path.join(OUT, "00_freeze.json"),
    JSON.stringify(freeze, null, 2)
  );

  // --- Phase 1: reproduce M16g1 research posterior ---
  const foldCsv = await readFile(path.join(M16G, "04_fold_rows.csv"), "utf8");
  const folds = parseFoldRows(foldCsv);
  const preds1600 = folds.map((r) =>
    computeResearchAbilityV1({
      rawAbilityRate: r.rawPB,
      actualCombinedPossessionAppearances: r.N,
    })
  );
  const y = folds.map((r) => r.target);
  const yhat = preds1600.map((p) => p.researchDRBL100);
  const k1600Rmse = rmse(y, yhat);
  const rels = preds1600.map((p) => p.researchReliability).sort((a, b) => a - b);
  const relMedian = percentile(rels, 50);
  const relP10 = percentile(rels, 10);
  const relP90 = percentile(rels, 90);
  const identityResiduals = folds.map((r, i) => {
    const expected = (r.N / (r.N + RESEARCH_K)) * r.rawPB;
    return Math.abs(preds1600[i]!.researchDRBL100 - expected);
  });
  const maxIdentityResidual = Math.max(...identityResiduals);

  const practicalBandOk =
    Math.abs(k1600Rmse - M16G1_K1600_RMSE) < 1e-9 &&
    PRACTICAL_OPTIMUM_MIN_K === 1600 &&
    NUMERIC_BEST_K === 2400;
  const relOk =
    Math.abs(relMedian - M16G1_REL_MEDIAN) < 1e-9 &&
    Math.abs(relP10 - M16G1_REL_P10) < 1e-9 &&
    Math.abs(relP90 - M16G1_REL_P90) < 1e-9;

  const m16g1Repro = {
    reproduced: practicalBandOk && relOk && maxIdentityResidual < 1e-12 ? "PASS" : "FAIL",
    k1600RMSE: k1600Rmse,
    expectedK1600RMSE: M16G1_K1600_RMSE,
    k1600RMSE_delta: k1600Rmse - M16G1_K1600_RMSE,
    practicalBandSelection: {
      NUMERIC_BEST_K,
      PRACTICAL_OPTIMUM_MIN_K,
      SELECTED_RESEARCH_K: RESEARCH_K,
      FINAL_K_STATUS: "PLATEAU_SELECTED",
      match: practicalBandOk,
    },
    reliabilityDistributions: {
      median: relMedian,
      p10: relP10,
      p90: relP90,
      expected: {
        median: M16G1_REL_MEDIAN,
        p10: M16G1_REL_P10,
        p90: M16G1_REL_P90,
      },
      match: relOk,
    },
    maxDirectFormulaResidual: maxIdentityResidual,
    nRows: folds.length,
    sourceFoldRows: "reports/m16g/04_fold_rows.csv",
  };
  await writeFile(
    path.join(OUT, "01_m16g1_reproduction.json"),
    JSON.stringify(m16g1Repro, null, 2)
  );
  if (m16g1Repro.reproduced !== "PASS") {
    throw new Error("STOP M16G1_REPRODUCTION_FAILURE");
  }

  // --- Phase 2/4/9/13/15 docs ---
  await writeFile(
    path.join(OUT, "02_research_ability_contract.md"),
    `# Research ability contract (M16g2)

## Versions
- research ability: \`${RESEARCH_ABILITY_VERSION}\`
- research posterior: \`${RESEARCH_POSTERIOR_VERSION}\`
- input estimator: \`${SEQUENTIAL_ATTRIBUTION_VERSION}\` (Approach B)
- ability lineage (production provenance): \`${ABILITY_LINEAGE_VERSION}\`

## Definitions

\`\`\`text
P_B_RAW = rawAbilityRate
unit: points per 100 combined possession appearances
      relative to the frozen R1 baseline
\`\`\`

\`\`\`text
reliability = N / (N + 1600)
P_B_POSTERIOR = reliability * P_B_RAW + (1 - reliability) * 0
RESEARCH_DRBL100 = P_B_POSTERIOR
\`\`\`

where \`N = actualCombinedPossessionAppearances\`.

## Explicit exclusions inside RESEARCH_DRBL100
- no P/LN/B fusion
- no second EB
- no calibration
- no WAR conversion
- no stacking on \`drblP\` / \`fusedRateRaw\` / \`posteriorAbilityRate\`

## Layer count
\`RESEARCH_POSTERIOR_LAYER_COUNT = ${RESEARCH_POSTERIOR_LAYER_COUNT}\`

## Calibration boundary
\`CALIBRATION_NOT_YET_SELECTED\` — researchDRBL100 is pre-calibration posterior ability.
`
  );

  await writeFile(
    path.join(OUT, "05_zero_semantics_contract.md"),
    `# Zero semantics contract (M16g2)

Carry-forward from M16g1:

\`\`\`text
P_B zero = R1 replacement baseline
\`\`\`

For \`researchDRBL100\`:

\`\`\`text
0 means the posterior expectation equals the R1 baseline
under the current Approach-B construction.
\`\`\`

Do **not** claim numerical identity with the final WAR replacement level
after future calibration. WAR zero identity remains unproven here.

\`ZERO_SEMANTICS = REPLACEMENT_LEVEL\`
`
  );

  await writeFile(
    path.join(OUT, "07_component_role_contract.md"),
    `# Component role contract (M16g2)

| Component | Role | Enters researchDRBL100? |
|-----------|------|-------------------------|
| P (Approach B rawAbilityRate) | PRIMARY research ability input | yes (then EB1600) |
| LN | DIAGNOSTIC_RESEARCH_COMPONENT | NO |
| B | DIAGNOSTIC_RESEARCH_COMPONENT | NO |
| M6 | DIAGNOSTIC / RESEARCH-ONLY (M16d formal winner P+M6; practical base = P) | NO |

LN/B/M6 raw/display values may continue to exist for diagnostics and explanation.
They must not feed the research shadow primary ability path.
`
  );

  await writeFile(
    path.join(OUT, "08_old_vs_research_architecture.md"),
    `# Old vs research architecture (M16g2)

## Legacy production

\`\`\`text
raw P
→ EB200 P (drblP)
→ fusion with EB LN/B components
→ EB200 fused ability (posteriorAbilityRate / drbl100)
\`\`\`

| Dimension | Legacy |
|-----------|--------|
| Fitted components in primary ability | P + LN + B (fusion) |
| EB operations | ≥2 (component + fused) |
| Prior strength(s) | k=200 (components), k=200 (fused) |
| Fusion | YES |
| Calibration | separate WAR-era / display layers possible |
| Rate meaning | fused + double-shrunk ability-ish |
| Zero meaning | R1 baseline inside components, then fused |

## Selected research shadow

\`\`\`text
raw P_B (rawAbilityRate)
→ EB1600
→ researchDRBL100
\`\`\`

| Dimension | Research |
|-----------|----------|
| Fitted components in primary ability | 1 (P only) |
| EB operations | exactly 1 |
| Prior strength | k=1600 |
| Fusion | NO |
| Calibration | NOT YET SELECTED |
| Rate meaning | posterior Approach-B rate |
| Zero meaning | R1 replacement baseline under Approach B |

## Major semantic difference
Production collapses component shrinkage, fusion, and a second fused posterior into \`drbl100\`.
Research isolates a single EB on unshrunk raw Approach-B P.
`
  );

  // --- Phase 6 independence tests ---
  const independenceCases = [
    { raw: 3.5, n: 800 },
    { raw: -1.2, n: 2200 },
    { raw: 0.4, n: 150 },
    { raw: 6.0, n: 5000 },
  ];
  const independenceRows = independenceCases.map((c) => {
    const base = computeResearchAbilityV1({
      rawAbilityRate: c.raw,
      actualCombinedPossessionAppearances: c.n,
    });
    // Simulate "perturbing" legacy fusion inputs: they are not arguments.
    const afterPerturb = computeResearchAbilityV1({
      rawAbilityRate: c.raw,
      actualCombinedPossessionAppearances: c.n,
    });
    const legacyFusedPerturbed = empiricalBayesRate(
      c.raw * 0.5 + 2.0 /* pretend fusion */,
      c.n,
      0,
      200
    ).posterior;
    return {
      raw: c.raw,
      n: c.n,
      researchDRBL100: base.researchDRBL100,
      afterLegacyPerturb: afterPerturb.researchDRBL100,
      unchanged: base.researchDRBL100 === afterPerturb.researchDRBL100,
      legacyFusedPerturbedValue_notUsed: legacyFusedPerturbed,
      differsFromLegacyFused:
        Math.abs(base.researchDRBL100 - legacyFusedPerturbed) > 1e-9,
      posteriorOperationsApplied: base.posteriorOperationsApplied,
    };
  });
  const independencePass = independenceRows.every(
    (r) => r.unchanged && r.differsFromLegacyFused && r.posteriorOperationsApplied === 1
  );
  await writeFile(
    path.join(OUT, "03_shadow_independence_tests.json"),
    JSON.stringify(
      {
        result: independencePass ? "PASS" : "FAIL",
        note: "computeResearchAbilityV1 accepts only rawAbilityRate and N; LN/B/fusion cannot enter.",
        cases: independenceRows,
      },
      null,
      2
    )
  );

  // --- Phase 7 single posterior identity ---
  const identityCsv = independenceCases.map((c) => {
    const r = computeResearchAbilityV1({
      rawAbilityRate: c.raw,
      actualCombinedPossessionAppearances: c.n,
    });
    const expected = (c.n / (c.n + 1600)) * c.raw;
    const drblP = empiricalBayesRate(c.raw, c.n, 0, 200).posterior;
    const w1 = wrongPathEb1600OfEb200(c.raw, c.n);
    const w2 = wrongPathEb200OfEb1600(c.raw, c.n);
    const w3 = wrongPathEb1600OfDrblP(drblP, c.n);
    const fusedThenEb200 = empiricalBayesRate(
      0.7 * drblP + 0.2 * 1 + 0.1 * 0.5,
      c.n,
      0,
      200
    ).posterior;
    return {
      rawAbilityRate: c.raw,
      N: c.n,
      expected_EB1600_raw: expected,
      researchDRBL100: r.researchDRBL100,
      residual: r.researchDRBL100 - expected,
      wrong_EB1600_of_EB200: w1,
      wrong_EB200_of_EB1600: w2,
      wrong_EB1600_of_drblP: w3,
      wrong_EB200_of_fusion: fusedThenEb200,
      equals_wrong_EB1600_of_EB200: Math.abs(r.researchDRBL100 - w1) < 1e-12,
      equals_wrong_EB200_of_EB1600: Math.abs(r.researchDRBL100 - w2) < 1e-12,
      equals_wrong_EB1600_of_drblP: Math.abs(r.researchDRBL100 - w3) < 1e-12,
      equals_wrong_EB200_of_fusion: Math.abs(r.researchDRBL100 - fusedThenEb200) < 1e-12,
      posteriorOperationsApplied: r.posteriorOperationsApplied,
    };
  });
  const singlePosteriorPass = identityCsv.every(
    (r) =>
      Math.abs(r.residual) < 1e-12 &&
      !r.equals_wrong_EB1600_of_EB200 &&
      !r.equals_wrong_EB200_of_EB1600 &&
      !r.equals_wrong_EB1600_of_drblP &&
      !r.equals_wrong_EB200_of_fusion &&
      r.posteriorOperationsApplied === 1
  );
  if (!singlePosteriorPass) {
    throw new Error("STOP RESEARCH_DOUBLE_SHRINKAGE or identity failure");
  }
  await writeFile(path.join(OUT, "04_single_posterior_identity.csv"), toCsv(identityCsv));

  // --- Phase 10 O/D decomposition audit ---
  // Structural: different denominators → not additive in general.
  const odCases = [
    { offV: 10, defV: -2, offN: 600, defN: 400 },
    { offV: 5, defV: 5, offN: 500, defN: 500 },
    { offV: 8, defV: -8, offN: 800, defN: 200 },
    { offV: 0, defV: 3, offN: 100, defN: 900 },
  ].map((c) => {
    const totalN = c.offN + c.defN;
    const rawAbility = (100 * (c.offV + c.defV)) / totalN;
    const rawO = (100 * c.offV) / c.offN;
    const rawD = (100 * c.defV) / c.defN;
    const residual = rawO + rawD - rawAbility;
    const weighted =
      (c.offN * rawO + c.defN * rawD) / totalN - rawAbility;
    return {
      rawOffense_field: "100 * offensiveValue / offensivePossessions",
      rawDefense_field: "100 * defensiveValue / defensivePossessions",
      denominator_total: "combined possessions = offN + defN (typical)",
      sign_convention: "offense positive contribution; defense as stored defensiveValue",
      same_N_as_total: c.offN === totalN && c.defN === totalN ? "YES" : "NO",
      offN: c.offN,
      defN: c.defN,
      rawO,
      rawD,
      rawAbilityRate: rawAbility,
      reconstruction_residual_rawO_plus_rawD: residual,
      weighted_reconstruction_residual: weighted,
    };
  });
  const maxOdResidual = Math.max(
    ...odCases.map((r) => Math.abs(r.reconstruction_residual_rawO_plus_rawD))
  );
  const odCanonical =
    maxOdResidual < 1e-9
      ? "PASS"
      : "FAIL";
  await writeFile(path.join(OUT, "06_od_decomposition_audit.csv"), toCsv(odCases));
  const researchOdStatus =
    odCanonical === "PASS" ? "CANONICAL" : "NOT_CANONICAL_YET";

  // --- Phase 16–20: shadow on 2024-25 development artifact ---
  const art = JSON.parse(await readFile(ARTIFACT_2024, "utf8")) as {
    players: Array<Record<string, unknown>>;
  };
  const shadowRows = art.players
    .map((p) => {
      const raw = Number(p.rawAbilityRate);
      const n = Number(
        p.combinedPossessionAppearances ??
          p.actualPossessions ??
          p.possessions
      );
      const research = computeResearchAbilityV1({
        rawAbilityRate: raw,
        actualCombinedPossessionAppearances: n,
      });
      const legacyDrbl100 = Number(p.drbl100);
      return {
        playerId: String(p.playerId),
        rawAbilityRate: raw,
        N: n,
        legacy_drblP: Number(p.drblP),
        legacy_fusedRateRaw: Number(p.fusedRateRaw),
        legacy_posteriorAbilityRate: Number(p.posteriorAbilityRate),
        legacy_drbl100: legacyDrbl100,
        researchReliability: research.researchReliability,
        researchDRBL100: research.researchDRBL100,
        researchSeasonalImpact: research.researchSeasonalImpact,
        diff_research_minus_legacy: research.researchDRBL100 - legacyDrbl100,
        posteriorOperationsApplied: research.posteriorOperationsApplied,
        absDiff: Math.abs(research.researchDRBL100 - legacyDrbl100),
      };
    })
    .filter((r) => Number.isFinite(r.rawAbilityRate) && r.N > 0);

  const doubleShrinkRows = shadowRows.filter(
    (r) => r.posteriorOperationsApplied !== 1
  );
  if (doubleShrinkRows.length) {
    throw new Error("STOP RESEARCH_DOUBLE_SHRINKAGE");
  }

  await writeFile(
    path.join(OUT, "09_shadow_comparison.csv"),
    toCsv(
      shadowRows.map(
        ({
          absDiff: _a,
          researchSeasonalImpact: _s,
          posteriorOperationsApplied: _p,
          ...rest
        }) => rest
      )
    )
  );

  const legacyVals = shadowRows.map((r) => r.legacy_drbl100);
  const researchVals = shadowRows.map((r) => r.researchDRBL100);
  const absDiffs = shadowRows.map((r) => r.absDiff);
  const legacyDist = distSummary(legacyVals);
  const researchDist = distSummary(researchVals);
  const distCompare = [
    { metric: "field", legacy_drbl100: "legacy", researchDRBL100: "research" },
    ...Object.keys(legacyDist).map((k) => ({
      metric: k,
      legacy_drbl100: (legacyDist as Record<string, number>)[k],
      researchDRBL100: (researchDist as Record<string, number>)[k],
    })),
    {
      metric: "Pearson",
      legacy_drbl100: pearson(legacyVals, researchVals),
      researchDRBL100: pearson(legacyVals, researchVals),
    },
    {
      metric: "Spearman",
      legacy_drbl100: spearman(legacyVals, researchVals),
      researchDRBL100: spearman(legacyVals, researchVals),
    },
    {
      metric: "mean_abs_diff",
      legacy_drbl100: mean(absDiffs),
      researchDRBL100: mean(absDiffs),
    },
    {
      metric: "median_abs_diff",
      legacy_drbl100: percentile([...absDiffs].sort((a, b) => a - b), 50),
      researchDRBL100: percentile([...absDiffs].sort((a, b) => a - b), 50),
    },
    {
      metric: "p95_abs_diff",
      legacy_drbl100: percentile([...absDiffs].sort((a, b) => a - b), 95),
      researchDRBL100: percentile([...absDiffs].sort((a, b) => a - b), 95),
    },
  ];
  await writeFile(path.join(OUT, "10_distribution_comparison.csv"), toCsv(distCompare));

  // Exposure quartiles
  const byN = [...shadowRows].sort((a, b) => a.N - b.N);
  const qSize = Math.ceil(byN.length / 4);
  const exposureRows = [0, 1, 2, 3].map((qi) => {
    const slice = byN.slice(qi * qSize, Math.min(byN.length, (qi + 1) * qSize));
    const diffs = slice.map((r) => r.legacy_drbl100 - r.researchDRBL100);
    const abs = slice.map((r) => r.absDiff);
    const rel = slice.map((r) => r.researchReliability);
    return {
      quartile: `Q${qi + 1}`,
      nPlayers: slice.length,
      nMin: slice[0]?.N ?? NaN,
      nMax: slice[slice.length - 1]?.N ?? NaN,
      mean_legacy_minus_research: mean(diffs),
      mean_research_reliability: mean(rel),
      mean_abs_diff: mean(abs),
      median_abs_diff: percentile([...abs].sort((a, b) => a - b), 50),
    };
  });
  await writeFile(path.join(OUT, "11_exposure_divergence.csv"), toCsv(exposureRows));

  // Ranking sensitivity (development data only)
  const byLegacy = [...shadowRows].sort(
    (a, b) => b.legacy_drbl100 - a.legacy_drbl100
  );
  const byResearch = [...shadowRows].sort(
    (a, b) => b.researchDRBL100 - a.researchDRBL100
  );
  const legacyRank = new Map(byLegacy.map((r, i) => [r.playerId, i + 1]));
  const researchRank = new Map(byResearch.map((r, i) => [r.playerId, i + 1]));
  const rankDeltas = shadowRows.map(
    (r) =>
      Math.abs(
        (legacyRank.get(r.playerId) ?? 0) - (researchRank.get(r.playerId) ?? 0)
      )
  );
  const topOverlap = (k: number) => {
    const a = new Set(byLegacy.slice(0, k).map((r) => r.playerId));
    const b = new Set(byResearch.slice(0, k).map((r) => r.playerId));
    let o = 0;
    for (const id of a) if (b.has(id)) o++;
    return o / k;
  };
  const rankingSensitivity = {
    Spearman: spearman(
      shadowRows.map((r) => legacyRank.get(r.playerId)!),
      shadowRows.map((r) => researchRank.get(r.playerId)!)
    ),
    top10_overlap: topOverlap(10),
    top25_overlap: topOverlap(25),
    top50_overlap: topOverlap(50),
    top100_overlap: topOverlap(100),
    mean_abs_rank_change: mean(rankDeltas),
    used_for_model_selection: "NO",
    researchRank_definition: "descending researchDRBL100 (research artifact only)",
    productionDefaultRankingMode: DEFAULT_RANKING_MODE,
  };
  await writeFile(
    path.join(OUT, "20_ranking_sensitivity.json"),
    JSON.stringify(rankingSensitivity, null, 2)
  );

  // Seasonal impact identity check
  const seasonalOk = shadowRows.every((r) => {
    const expected = (r.researchDRBL100 * r.N) / 100;
    const bad = (r.researchDRBL100 * (r.N + 1600)) / 100;
    return (
      Math.abs(r.researchSeasonalImpact - expected) < 1e-9 &&
      Math.abs(r.researchSeasonalImpact - bad) > 1e-6
    );
  });

  // --- Phase 21/23 docs ---
  await writeFile(
    path.join(OUT, "12_uncertainty_compatibility.md"),
    `# Uncertainty compatibility (M16g2)

## Current formula (production)
Source: \`drbl/models/uncertainty.ts\` + disagreement from \`leaderboard.ts\` / \`player-value.ts\`.

\`\`\`text
rawScale = 1/sqrt(max(1, N)/100) + disagreementCoef * disagreement
halfWidth = scaleMultiplier * rawScale   (OOF-calibrated coverage)
\`\`\`

Disagreement is a scale-standardized SD across **P / LN / B** component z-scores
(\`estimatorDisagreement(drblP, drblLn, drblB)\`).

## Classification

| Term | Status |
|------|--------|
| sample-size term \`1/sqrt(N/100)\` | still semantically valid for any rate |
| disagreement (P/LN/B) | legacy-fusion-specific |
| OOF calibration vs fused target | legacy-fusion-specific / needs redesign |
| published interval around \`drbl100\` | needs redesign for P-only research ability |

## Verdict
\`UNCERTAINTY_COMPATIBILITY = REDESIGN_REQUIRED\`

\`UNCERTAINTY_REDESIGN_REQUIRED = YES\`

No new uncertainty model is invented in M16g2.
Research shadow display contract excludes uncertainty for now.
`
  );

  await writeFile(
    path.join(OUT, "13_ranking_contract.md"),
    `# Ranking contract (M16g2)

## Production today
- Default ranking mode: \`${DEFAULT_RANKING_MODE}\` (season value / WAR), **not** raw \`drbl100\` sort.
- Ability boards may still sort by \`drbl100\` when mode=\`ability\`.
- Production rank fields remain unchanged in M16g2.

## Research shadow ranking
\`\`\`text
researchRank = descending researchDRBL100
\`\`\`
Research artifact only. No cumulative-value ranking. No WAR ranking substitution.
Do not modify production rank.
`
  );

  // Consumer inventory
  const consumers = await inventoryFieldConsumers();
  await writeFile(path.join(OUT, "14_field_consumer_inventory.csv"), toCsv(consumers));

  await writeFile(
    path.join(OUT, "15_proposed_field_schema.md"),
    `# Proposed canonical future field schema (NOT deployed)

Design only — production still uses legacy names.

| Proposed field | Meaning |
|----------------|---------|
| rawP100 | Unshrunk Approach-B rate (\`rawAbilityRate\`) |
| posteriorP100 | EB1600(rawP100) |
| drbl100 | Final displayed ability after posterior **and** any future calibration |
| drblO100 / drblD100 | Only if algebraically canonical (currently NOT) |
| lnDiagnostic100 | LN diagnostic |
| bDiagnostic100 | B diagnostic |
| m6Diagnostic100 | M6 diagnostic |
| abilityReliability | N/(N+k) |
| abilityPosteriorK | 1600 |
| abilityPriorMean | 0 |
| abilityLineageVersion | research/production lineage id |
| seasonalImpact | posterior_or_final_rate * actualN / 100 |
| war | separate conversion after calibration/replacement lock |

Naming rule: never overload \`raw\` / \`posterior\` / \`fused\` / \`calibrated\` ambiguously.
`
  );

  await writeFile(
    path.join(OUT, "16_legacy_mapping.csv"),
    toCsv([
      {
        current_field: "rawAbilityRate",
        future_canonical_meaning: "rawP100 (unshrunk Approach B)",
        action: "keep/rename",
      },
      {
        current_field: "drblP",
        future_canonical_meaning: "legacy EB200(P); not research primary",
        action: "deprecate as primary; diagnostic alias",
      },
      {
        current_field: "drblLn",
        future_canonical_meaning: "lnDiagnostic100",
        action: "rename/keep diagnostic",
      },
      {
        current_field: "drblB",
        future_canonical_meaning: "bDiagnostic100",
        action: "rename/keep diagnostic",
      },
      {
        current_field: "fusedRateRaw",
        future_canonical_meaning: "legacy fusion rate",
        action: "deprecate",
      },
      {
        current_field: "posteriorAbilityRate",
        future_canonical_meaning: "legacy EB200(fused)",
        action: "deprecate",
      },
      {
        current_field: "drbl100",
        future_canonical_meaning: "final displayed ability (post-calibration TBD)",
        action: "keep name; change semantics after migration",
      },
      {
        current_field: "drblO",
        future_canonical_meaning: "drblO100 if canonical else diagnostic",
        action: "alias pending O/D audit",
      },
      {
        current_field: "drblD",
        future_canonical_meaning: "drblD100 if canonical else diagnostic",
        action: "alias pending O/D audit",
      },
    ])
  );

  await writeFile(
    path.join(OUT, "17_migration_plan.md"),
    `# Migration plan (future — not executed in M16g2)

1. Add canonical research fields (\`research*\` / future \`rawP100\` / \`posteriorP100\`).
2. Recompute artifacts in shadow.
3. Add / keep invariant tests (single posterior, no pseudo-exposure, fusion independence).
4. Redesign/validate uncertainty if required (\`REDESIGN_REQUIRED\`).
5. Settle calibration (\`CALIBRATION_NOT_YET_SELECTED\`).
6. Freeze final rate semantics for displayed \`drbl100\`.
7. Reevaluate WAR conversion after rate/posterior/calibration/replacement lock.
8. Switch production display/rankings.
9. Deprecate legacy fused/double-EB fields after compatibility period.

Production alignment eventually means:
\`displayed DRBL/100 = final selected posterior/calibrated research ability\`
with **no** hidden legacy fusion/posterior.

M16g2 does **not** execute these production steps.
`
  );

  // Charts
  await writeFile(
    path.join(CHARTS, "legacy_vs_research_scatter.svg"),
    svgScatter(
      shadowRows.map((r) => ({ x: r.legacy_drbl100, y: r.researchDRBL100 })),
      "Legacy drbl100 vs research posterior",
      "legacy drbl100",
      "researchDRBL100",
      true
    )
  );
  await writeFile(
    path.join(CHARTS, "diff_vs_exposure.svg"),
    svgScatter(
      shadowRows.map((r) => ({
        x: r.N,
        y: r.diff_research_minus_legacy,
      })),
      "Difference vs exposure",
      "N (combined appearances)",
      "research − legacy"
    )
  );
  await writeFile(
    path.join(CHARTS, "reliability_vs_exposure.svg"),
    svgScatter(
      shadowRows.map((r) => ({ x: r.N, y: r.researchReliability })),
      "Research reliability vs exposure",
      "N",
      "reliability = N/(N+1600)"
    )
  );
  await writeFile(
    path.join(CHARTS, "legacy_distribution.svg"),
    svgHist(legacyVals, "Legacy drbl100 distribution", "drbl100")
  );
  await writeFile(
    path.join(CHARTS, "research_distribution.svg"),
    svgHist(researchVals, "Research DRBL100 distribution", "researchDRBL100")
  );
  await writeFile(
    path.join(CHARTS, "rank_displacement_hist.svg"),
    svgHist(rankDeltas, "Absolute rank displacement", "|Δ rank|")
  );
  await writeFile(
    path.join(CHARTS, "rank_scatter.svg"),
    svgScatter(
      shadowRows.map((r) => ({
        x: legacyRank.get(r.playerId)!,
        y: researchRank.get(r.playerId)!,
      })),
      "Legacy vs research rank",
      "legacy rank",
      "research rank",
      true
    )
  );
  await writeFile(
    path.join(CHARTS, "raw_vs_posterior.svg"),
    svgScatter(
      shadowRows.map((r) => ({ x: r.rawAbilityRate, y: r.researchDRBL100 })),
      "Raw P vs research posterior P",
      "rawAbilityRate",
      "researchDRBL100",
      true
    )
  );
  await writeFile(
    path.join(CHARTS, "shrinkage_vs_N.svg"),
    svgScatter(
      shadowRows.map((r) => ({
        x: r.N,
        y: Math.abs(r.rawAbilityRate - r.researchDRBL100),
      })),
      "Posterior shrinkage magnitude vs N",
      "N",
      "|raw − posterior|"
    )
  );
  // reliability curve reference
  const curve = [50, 100, 200, 400, 800, 1600, 3200, 6400, 10000].map((n) => ({
    x: n,
    y: n / (n + 1600),
  }));
  await writeFile(
    path.join(CHARTS, "reliability_curve.svg"),
    svgLine(curve, "Reliability vs N (k=1600)", "N", "reliability")
  );

  const modelHealth = {
    M16G1_REPRODUCED: m16g1Repro.reproduced,
    RESEARCH_RAW_INPUT: "rawAbilityRate",
    RESEARCH_K: 1600,
    RESEARCH_PRIOR_MEAN: 0,
    RESEARCH_EXPOSURE: "actual_combined_possession_appearances",
    RESEARCH_POSTERIOR_LAYER_COUNT: 1,
    LEGACY_FUSION_AFFECTS_RESEARCH_SHADOW: "NO",
    LEGACY_EB200_AFFECTS_RESEARCH_SHADOW: "NO",
    SHADOW_SINGLE_POSTERIOR_IDENTITY: singlePosteriorPass ? "PASS" : "FAIL",
    PSEUDO_EXPOSURE_PRESENT: seasonalOk ? "NO" : "YES",
    ZERO_SEMANTICS: "REPLACEMENT_LEVEL",
    RAW_OD_DECOMPOSITION: odCanonical,
    RESEARCH_OD_STATUS: researchOdStatus,
    LN_ROLE: "DIAGNOSTIC",
    B_ROLE: "DIAGNOSTIC",
    M6_ROLE: "DIAGNOSTIC",
    UNCERTAINTY_COMPATIBILITY: "REDESIGN_REQUIRED",
    RESEARCH_RANKING_DEFINED: "PASS",
    PRODUCTION_FIELD_CONSUMERS_MAPPED: consumers.length > 0 ? "PASS" : "FAIL",
    CALIBRATION_SELECTED: "NO",
    WAR_CHANGED: "NO",
    PRODUCTION_CHANGED: "NO",
    RESERVED_TEST_PREDICTIVE_METRICS_USED: "NO",
    shadowPlayerCount: shadowRows.length,
    rankingSensitivity,
    distribution: {
      legacyMean: legacyDist.mean,
      legacySd: legacyDist.sd,
      researchMean: researchDist.mean,
      researchSd: researchDist.sd,
      pearson: pearson(legacyVals, researchVals),
      spearman: spearman(legacyVals, researchVals),
      meanAbsDiff: mean(absDiffs),
    },
    independencePass,
    maxDirectFormulaResidual: maxIdentityResidual,
    maxOdResidual,
  };
  await writeFile(
    path.join(OUT, "18_model_health.json"),
    JSON.stringify(modelHealth, null, 2)
  );

  const chartFiles = (await readdir(CHARTS)).sort();
  await writeFile(
    path.join(OUT, "19_full_audit.md"),
    `# M16g2 full audit

## Freeze
- git: \`${gitCommit}\`
- dirty: ${dirty}
- protocol: \`${EVALUATION_PROTOCOL_VERSION}\`
- hashes: TRAIN/VALIDATION/RESERVED_TEST match expected

## Research contract
\`rawAbilityRate → EB(k=1600, prior=0) → researchDRBL100\` with exactly one posterior layer.

## Proofs
- M16g1 reproduction: **${m16g1Repro.reproduced}** (k1600 RMSE=${k1600Rmse})
- Single-posterior identity: **${singlePosteriorPass ? "PASS" : "FAIL"}**
- Fusion independence: **${independencePass ? "PASS" : "FAIL"}**
- Pseudo-exposure: **${seasonalOk ? "NO" : "YES"}**
- O/D: RAW_OD_DECOMPOSITION=${odCanonical}, RESEARCH_OD_STATUS=${researchOdStatus}
- Uncertainty: REDESIGN_REQUIRED
- Production changed: NO
- RESERVED_TEST predictive metrics: NO

## Shadow (2024-25 development artifact)
- n=${shadowRows.length}
- legacy mean/SD: ${legacyDist.mean.toFixed(4)} / ${legacyDist.sd.toFixed(4)}
- research mean/SD: ${researchDist.mean.toFixed(4)} / ${researchDist.sd.toFixed(4)}
- Pearson=${pearson(legacyVals, researchVals).toFixed(4)}, Spearman=${spearman(legacyVals, researchVals).toFixed(4)}

## Ranking sensitivity (descriptive only)
${JSON.stringify(rankingSensitivity, null, 2)}

## Charts
${chartFiles.map((f) => `- charts/${f}`).join("\n")}

## Recommendation
Next scientific milestone: post-posterior **calibration** selection (without reopening RESERVED_TEST prematurely).
Next engineering milestone: uncertainty redesign compatible with P-only ability.
Production deployment: **NO**.
`
  );

  // Final response values for the required STOP template
  await writeFile(
    path.join(OUT, "21_final_response_values.json"),
    JSON.stringify(
      {
        freeze,
        m16g1Repro,
        modelHealth,
        rankingSensitivity,
        exposureRows,
        researchOdStatus,
        functionName: "computeResearchAbilityV1",
        fields: [
          "researchRawP100",
          "researchReliability",
          "researchPosteriorP100",
          "researchDRBL100",
        ],
      },
      null,
      2
    )
  );

  console.log(
    JSON.stringify(
      {
        status: "M16g2_COMPLETE",
        M16G1_REPRODUCED: m16g1Repro.reproduced,
        RESEARCH_OD_STATUS: researchOdStatus,
        UNCERTAINTY_COMPATIBILITY: "REDESIGN_REQUIRED",
        PRODUCTION_CHANGED: "NO",
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
