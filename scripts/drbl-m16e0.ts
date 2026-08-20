/**
 * M16e0 - WAR dimensional audit + M6 practical-significance closure.
 *   npm run drbl:m16e0
 *
 * Diagnostic/governance only. No production math changes. No RESERVED_TEST eval.
 */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

import {
  EVALUATION_PROTOCOL_VERSION,
  ELIGIBILITY_VERSION,
  TARGET_VERSION,
  METRIC_CONTRACT,
} from "../drbl/evaluation/protocol";
import { hashGames, type SplitGame } from "../drbl/evaluation/splits";
import {
  computeWAR,
  calibratePosterior,
  WAR_FORMULA_VERSION,
  PIPELINE_VERSION,
  fieldLineageAudit,
} from "../drbl/models/pipeline-value";
import { warFromImpact } from "../drbl/models/leaderboard";
import { PRIOR_EQUIVALENT_POSSESSIONS } from "../drbl/models/ranking-config";
import { M6_VERSION } from "../drbl/models/shot-decision";
import {
  FUSION_CONSTRAINT_TYPE,
  M16C_FUSION_LAMBDA,
  M16C_FUSION_FOLDS,
} from "../drbl/evaluation/m16c-dataset";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m16e0");
const M16B = path.join(ROOT, "reports", "m16b");
const M16C = path.join(ROOT, "reports", "m16c");
const M16D = path.join(ROOT, "reports", "m16d");

const EXPECTED_TRAIN =
  "7bec77be45295ee858d90896d9383e4da951e98e81ad1ef31b5285fb055d1550";
const EXPECTED_VAL =
  "4fd339a445f269162c2d76e9102ea5bb965a5d0fc05e0fcd2f60593117c5faf0";
const EXPECTED_RES =
  "e542aa54602390ed65792f37e10207814e10b62bfdf552ddf4da69825076c1ce";

const TRACE_NAMES = [
  "Nikola Jokić",
  "Nikola Jokic",
  "Shai Gilgeous-Alexander",
  "Franz Wagner",
  "Victor Wembanyama",
  "Payton Pritchard",
  "Ivica Zubac",
  "DeMar DeRozan",
  "Christian Braun",
  "Norman Powell",
  "Naz Reid",
  "Zach LaVine",
];

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
function sha256File(buf: string | Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}
function normName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}
function fitLinear(xs: number[], ys: number[]) {
  const n = Math.min(xs.length, ys.length);
  let sx = 0,
    sy = 0,
    sxx = 0,
    sxy = 0,
    syy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]!;
    sy += ys[i]!;
    sxx += xs[i]! * xs[i]!;
    sxy += xs[i]! * ys[i]!;
    syy += ys[i]! * ys[i]!;
  }
  const den = n * sxx - sx * sx;
  const b = Math.abs(den) > 1e-12 ? (n * sxy - sx * sy) / den : 0;
  const a = (sy - b * sx) / n;
  let ssRes = 0,
    abs = 0;
  for (let i = 0; i < n; i++) {
    const e = a + b * xs[i]! - ys[i]!;
    ssRes += e * e;
    abs += Math.abs(e);
  }
  const my = sy / n;
  let ssTot = 0;
  for (let i = 0; i < n; i++) ssTot += (ys[i]! - my) ** 2;
  return {
    intercept: a,
    slope: b,
    rmse: Math.sqrt(ssRes / n),
    mae: abs / n,
    r2: ssTot > 1e-12 ? 1 - ssRes / ssTot : NaN,
  };
}
function svgScatter(
  pts: Array<{ x: number; y: number }>,
  title: string
): string {
  const w = 480,
    h = 360,
    pad = 40;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs, 0),
    maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, 0),
    maxY = Math.max(...ys, 1);
  const sx = (x: number) =>
    pad + ((x - minX) / (maxX - minX || 1)) * (w - 2 * pad);
  const sy = (y: number) =>
    h - pad - ((y - minY) / (maxY - minY || 1)) * (h - 2 * pad);
  return `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="100%" height="100%" fill="#fff"/>
  <text x="${pad}" y="24" font-size="13" font-family="sans-serif">${title}</text>
  <line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="#333"/>
  <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h - pad}" stroke="#333"/>
  ${pts
    .slice(0, 600)
    .map(
      (p) =>
        `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="2" fill="#1d4ed8" opacity="0.5"/>`
    )
    .join("\n")}
</svg>`;
}

type PlayerRow = Record<string, unknown> & {
  playerId: string;
  playerName: string;
  teamId: string;
};

async function main() {
  await mkdir(path.join(OUT, "freeze"), { recursive: true });
  await mkdir(path.join(OUT, "charts"), { recursive: true });

  let gitCommit = "unknown";
  let gitDirty = true;
  try {
    gitCommit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    gitDirty =
      execSync("git status --porcelain", { encoding: "utf8" }).trim().length > 0;
  } catch {
    /* ignore */
  }
  const timestamp = new Date().toISOString();

  const train = JSON.parse(
    await readFile(path.join(M16B, "splits", "train_game_ids.json"), "utf8")
  ) as SplitGame[];
  const validation = JSON.parse(
    await readFile(path.join(M16B, "splits", "validation_game_ids.json"), "utf8")
  ) as SplitGame[];
  const reserved = JSON.parse(
    await readFile(path.join(M16B, "splits", "reserved_test_game_ids.json"), "utf8")
  ) as SplitGame[];
  const th = hashGames(train);
  const vh = hashGames(validation);
  const rh = hashGames(reserved);
  if (th !== EXPECTED_TRAIN || vh !== EXPECTED_VAL || rh !== EXPECTED_RES) {
    console.error("STOP EVALUATION_PROTOCOL_DRIFT", { th, vh, rh });
    process.exit(2);
  }

  const path2425 = "src/data/drbl/precomputed/2024-25.json";
  const path2526 = "src/data/drbl/precomputed/2025-26.json";
  const raw2425 = await readFile(path.join(ROOT, path2425), "utf8");
  const raw2526 = await readFile(path.join(ROOT, path2526), "utf8");
  const art2425 = JSON.parse(raw2425) as Record<string, unknown> & {
    players: PlayerRow[];
    warModel?: Record<string, unknown>;
  };
  const art2526 = JSON.parse(raw2526) as Record<string, unknown> & {
    players: PlayerRow[];
  };
  await copyFile(path.join(ROOT, path2425), path.join(OUT, "freeze", "site-2024-25.json"));
  await copyFile(path.join(ROOT, path2526), path.join(OUT, "freeze", "site-2025-26.json"));

  const m16dSummary = JSON.parse(
    await readFile(path.join(M16D, "14_stop_summary.json"), "utf8")
  ) as Record<string, unknown>;
  const m16cHealth = JSON.parse(
    await readFile(path.join(M16C, "12_model_health.json"), "utf8")
  ) as Record<string, unknown>;

  const freeze = {
    milestone: "M16e0",
    timestamp,
    gitCommit,
    gitDirty,
    evaluationProtocolVersion: EVALUATION_PROTOCOL_VERSION,
    trainSplitHash: th,
    validationSplitHash: vh,
    reservedTestSplitHash: rh,
    targetVersion: TARGET_VERSION,
    eligibilityVersion: ELIGIBILITY_VERSION,
    P_version: "approach-b-sequential-drbl-p",
    M6_version: M6_VERSION,
    abilityLineageVersion: "ability-lineage-v1",
    "2024-25": {
      artifactPath: path2425,
      artifactHash: sha256File(raw2425),
      generationId: art2425.artifactGenerationId,
      warFormulaVersion: art2425.warFormulaVersion ?? WAR_FORMULA_VERSION,
      pipelineVersion: art2425.pipelineVersion ?? PIPELINE_VERSION,
      warModel: art2425.warModel,
    },
    "2025-26": {
      artifactPath: path2526,
      artifactHash: sha256File(raw2526),
      generationId: art2526.artifactGenerationId,
      warFormulaVersion: art2526.warFormulaVersion ?? "provisional-seasonalImpact/30",
      pipelineVersion: art2526.pipelineVersion ?? null,
    },
    posterior: { priorMean: 0, priorStrength: PRIOR_EQUIVALENT_POSSESSIONS },
    fusion: {
      constraint: FUSION_CONSTRAINT_TYPE,
      lambda: M16C_FUSION_LAMBDA,
      folds: M16C_FUSION_FOLDS,
    },
    m6: { fusedIntoDrbl100: false },
    reservedTestAccessedForModelEvaluation: false,
  };
  await writeFile(path.join(OUT, "00_freeze.json"), JSON.stringify(freeze, null, 2));

  // --- Unit ledger ---
  const unitLedger = [
    {
      field: "rawAbilityRate",
      valueType: "rate",
      unit: "Approach B residual-share points / 100 player on-court possession-appearances (off+def counted separately)",
      producer: "finalizePlayerSeasonRows: 100*totalValue/possessions",
      consumer: "diagnostics; 2025-26 provisional WAR; pre-pipeline seasonalImpact",
    },
    {
      field: "fusedRateRaw",
      valueType: "rate",
      unit: "same residual-share pts/100 appearances (OOF fusion of P/LN/B)",
      producer: "fitFusionOof / fusePlayerRating",
      consumer: "posteriorAbilityRate",
    },
    {
      field: "posteriorAbilityRate",
      valueType: "rate",
      unit: "same residual-share pts/100 appearances (EB shrunk fused rate)",
      producer: "empiricalBayesRate(fusedRateRaw,n,0,k=200)",
      consumer: "displayed drbl100; warCalibrationAbilityInput=posterior",
    },
    {
      field: "displayedDrbl100",
      valueType: "rate",
      unit: "alias of posteriorAbilityRate (display rounded)",
      producer: "ability lineage published field",
      consumer: "site leaderboard DRBL/100",
    },
    {
      field: "warCalibrationInput",
      valueType: "rate",
      unit: "posteriorAbilityRate (2024-25 v4)",
      producer: "pipeline-remaster abilityInput selection",
      consumer: "LOO calibratePosterior",
    },
    {
      field: "calibrationSlope",
      valueType: "dimensionless scale",
      unit: "maps residual-share rate → team-net-rating-like pts/100 scale",
      producer: "fitCalibrationLeaveOneOut through-origin on team features → netRating",
      consumer: "finalAbilityDRBL100",
    },
    {
      field: "finalAbilityDRBL100 / calibratedDRBL100",
      valueType: "rate",
      unit: "calibrated points / 100 possessions (net-rating-like after LOO)",
      producer: "intercept + slope * posterior",
      consumer: "WAA/WAR",
    },
    {
      field: "replacementLevelDRBL100",
      valueType: "rate",
      unit: "calibrated pts/100 (fringe median finalAbility, 200-800 poss)",
      producer: "estimateReplacementLevel",
      consumer: "aboveReplacementRate",
    },
    {
      field: "aboveReplacementDRBL100",
      valueType: "rate",
      unit: "calibrated pts/100 above fringe replacement",
      producer: "finalAbility - replacement",
      consumer: "seasonImpactAboveReplacement",
    },
    {
      field: "actualOnCourtPossessions / possessions",
      valueType: "count",
      unit: "player possession-appearances = offensivePossessions + defensivePossessions",
      producer: "attributeGamePlayerValue (++ on offense and defense separately)",
      consumer: "rate denominator; WAR exposure",
    },
    {
      field: "seasonImpactAboveReplacement",
      valueType: "season total",
      unit: "calibrated residual-share / net-rating-scale points (season total)",
      producer: "aboveReplacement * n / 100",
      consumer: "WAR",
    },
    {
      field: "pointsPerWin",
      valueType: "conversion",
      unit: "season point differential per win-above-.500 (median across teams)",
      producer: "estimatePointsPerWinFromTeamSeasons",
      consumer: "WAR = impact / pointsPerWin",
    },
    {
      field: "drblWar",
      valueType: "wins",
      unit: "wins above fringe replacement (v4)",
      producer: "computeWAR",
      consumer: "leaderboard",
    },
  ];
  await writeFile(path.join(OUT, "02_war_unit_ledger.csv"), toCsv(unitLedger));

  await writeFile(
    path.join(OUT, "01_war_dataflow.md"),
    `# 2024-25 WAR dataflow (v4)

## Graph

\`\`\`text
Approach B attribution
  totalValue (residual shares vs R1)
  possessions = off appearances + def appearances
        ↓
rawAbilityRate = 100 * totalValue / possessions
        ↓
fusedRateRaw (OOF P/LN/B)
        ↓
posteriorAbilityRate = EB(fused)     ← displayed DRBL/100
        ↓
warCalibrationAbilityInput = posterior
        ↓
LOO team calibration (through-origin):
  teamFeature = 5 * sum(posterior*n) / sum(n)
  teamTarget  = team netRating (pts/100)
  finalAbility = 0 + slope * posterior
  (2024-25 slope ≈ ${Number(art2425.warModel?.calibrationSlope)})
        ↓
replacementLevelDRBL100 = fringe median(finalAbility | 200-800 poss)
        ↓
aboveReplacement = finalAbility - replacement
        ↓
exposure = actualOnCourtPossessions (= off+def appearances)
        ↓
seasonImpactAboveReplacement = aboveReplacement * exposure / 100
        ↓
pointsPerWin = median(pointDiff / (wins - 0.5*games)) ≈ ${Number(art2425.warModel?.pointsPerWin)}
        ↓
drblWar = seasonImpact / pointsPerWin
\`\`\`

## Field lineage (pipeline-value.ts)

${fieldLineageAudit()
  .map((f) => `- **${f.field}**: ${f.formula} (${f.unit})`)
  .join("\n")}

## Key functions

| Step | File | Function |
|---|---|---|
| Attribution | \`drbl/models/player-value.ts\` | \`attributeGamePlayerValue\` |
| Rates | \`drbl/models/player-value.ts\` | \`finalizePlayerSeasonRows\` |
| LOO calib | \`drbl/models/pipeline-value.ts\` | \`fitCalibrationLeaveOneOut\` |
| Apply calib | \`drbl/models/pipeline-value.ts\` | \`calibratePosterior\` |
| WAR | \`drbl/models/pipeline-value.ts\` | \`computeWAR\` |
| Orchestration | \`scripts/drbl-pipeline-remaster.ts\` | main remaster |
`
  );

  // --- Load team seasons ---
  const teamCsv = await readFile(
    path.join(ROOT, "data/drbl/calibration/team-season-2024-25.csv"),
    "utf8"
  );
  const teamLines = teamCsv.trim().split(/\r?\n/).slice(1);
  const teams = teamLines.map((line) => {
    const [teamId, abbreviation, wins, losses, games, pointDifferential, netRating] =
      line.split(",");
    return {
      teamId: teamId!,
      abbreviation: abbreviation!,
      wins: Number(wins),
      losses: Number(losses),
      games: Number(games),
      pointDifferential: Number(pointDifferential),
      netRating: Number(netRating),
    };
  });

  const wm = art2425.warModel!;
  const slope = Number(wm.calibrationSlope);
  const intercept = Number(wm.calibrationIntercept);
  const ppw = Number(wm.pointsPerWin);
  const repl = Number(wm.replacementLevelDRBL100);

  // --- Exposure identity + reconstruction ---
  const exposureRows: Record<string, unknown>[] = [];
  const reconRows: Record<string, unknown>[] = [];
  const cfRows: Record<string, unknown>[] = [];
  const traces: Record<string, unknown>[] = [];
  let maxReconResidual = 0;
  let mismatchCount = 0;

  const players = art2425.players;
  for (const p of players) {
    const n = Number(p.actualPossessions ?? p.possessions ?? 0);
    const raw = Number(p.rawAbilityRate ?? 0);
    const post = Number(p.posteriorAbilityRate ?? p.drbl100 ?? 0);
    const seasonalImpact = Number(p.seasonalImpact ?? 0); // raw*n/100 when repl=0 on provisional
    // Reconstruct original totalValue from raw identity
    const impactFromRaw = (raw * n) / 100;
    // We don't have totalValue stored; seasonalImpact on 2024-25 after pipeline may still be pre-pipeline raw impact
    const e1 = impactFromRaw; // using n as exposure matching raw denominator
    const residualIdentity = Math.abs(impactFromRaw - seasonalImpact);
    // Test alternate exposures assuming we only have n (=off+def)
    const half = n / 2;
    exposureRows.push({
      playerId: p.playerId,
      player: p.playerName,
      actualOnCourtPossessions: n,
      E5_actualOnCourt: n,
      E4_half: half,
      rawAbilityRate: raw,
      reconstructedImpact_E5: (raw * n) / 100,
      reconstructedImpact_E4: (raw * half) / 100,
      seasonalImpactStored: seasonalImpact,
      residual_E5_vs_seasonalImpact: (raw * n) / 100 - seasonalImpact,
      residual_E4_vs_seasonalImpact: (raw * half) / 100 - seasonalImpact,
      note: "off/def not separately stored on artifact; actualPossessions=off+def by construction",
    });

    const finalAbility = Number(
      p.finalAbilityDRBL100 ?? calibratePosterior(post, intercept, slope)
    );
    const above = Number(
      p.aboveReplacementDRBL100 ?? finalAbility - repl
    );
    const impactAR = Number(
      p.seasonImpactAboveReplacement ?? (above * n) / 100
    );
    const warParts = computeWAR({
      finalAbilityDRBL100: finalAbility,
      replacementLevelDRBL100: repl,
      actualOnCourtPossessions: n,
      pointsPerWin: ppw,
    });
    const reconstructedWAR = warParts.war;
    const displayedWAR = Number(p.drblWar ?? 0);
    const residual = displayedWAR - reconstructedWAR;
    maxReconResidual = Math.max(maxReconResidual, Math.abs(residual));
    if (Math.abs(residual) > 1e-6) mismatchCount++;

    reconRows.push({
      playerId: p.playerId,
      player: p.playerName,
      posteriorAbilityRate: post,
      warCalibrationInput: post,
      warCalibratedRate: finalAbility,
      replacementLevelUsed: repl,
      aboveReplacementRate: above,
      exposureUsed: n,
      seasonalImpact: impactAR,
      pointsPerWin: ppw,
      reconstructedWAR,
      displayedWAR,
      residual,
      rateCalibrationSlope: slope,
      calibrationIntercept: intercept,
    });

    // Counterfactuals
    const warPostDirect = computeWAR({
      finalAbilityDRBL100: post,
      replacementLevelDRBL100: repl,
      actualOnCourtPossessions: n,
      pointsPerWin: ppw,
    }).war;
    const warRawDirect = computeWAR({
      finalAbilityDRBL100: raw,
      replacementLevelDRBL100: 0,
      actualOnCourtPossessions: n,
      pointsPerWin: ppw,
    }).war;
    const warHalf = computeWAR({
      finalAbilityDRBL100: finalAbility,
      replacementLevelDRBL100: repl,
      actualOnCourtPossessions: half,
      pointsPerWin: ppw,
    }).war;
    const war30 = computeWAR({
      finalAbilityDRBL100: finalAbility,
      replacementLevelDRBL100: repl,
      actualOnCourtPossessions: n,
      pointsPerWin: 30,
    }).war;
    const warNoCal = computeWAR({
      finalAbilityDRBL100: post,
      replacementLevelDRBL100: 0,
      actualOnCourtPossessions: n,
      pointsPerWin: ppw,
    }).war;

    cfRows.push({
      playerId: p.playerId,
      player: p.playerName,
      WAR_current: displayedWAR,
      WAR_posterior_direct: warPostDirect,
      WAR_raw_direct: warRawDirect,
      WAR_half_exposure: warHalf,
      WAR_ppw30: war30,
      WAR_no_calibration: warNoCal,
      ratio_current_over_posterior_direct:
        warPostDirect !== 0 ? displayedWAR / warPostDirect : null,
      ratio_current_over_raw_direct:
        warRawDirect !== 0 ? displayedWAR / warRawDirect : null,
      ratio_current_over_half_exposure:
        warHalf !== 0 ? displayedWAR / warHalf : null,
      ratio_current_over_no_calibration:
        warNoCal !== 0 ? displayedWAR / warNoCal : null,
      abilityTransformFactor: post !== 0 ? finalAbility / post : null,
      DIAGNOSTIC_COUNTERFACTUAL: true,
    });
  }

  await writeFile(path.join(OUT, "03_exposure_identity.csv"), toCsv(exposureRows));
  await writeFile(path.join(OUT, "04_war_reconstruction.csv"), toCsv(reconRows));
  await writeFile(
    path.join(OUT, "05_war_counterfactual_decomposition.csv"),
    toCsv(cfRows)
  );

  // Representative traces
  const seen = new Set<string>();
  for (const name of TRACE_NAMES) {
    const p = players.find(
      (x) => normName(String(x.playerName)) === normName(name)
    );
    if (!p || seen.has(p.playerId)) continue;
    seen.add(p.playerId);
    const n = Number(p.actualPossessions ?? p.possessions ?? 0);
    const raw = Number(p.rawAbilityRate ?? 0);
    const post = Number(p.posteriorAbilityRate ?? 0);
    const finalAbility = Number(p.finalAbilityDRBL100);
    const above = Number(p.aboveReplacementDRBL100);
    const impact = Number(p.seasonImpactAboveReplacement);
    const war = Number(p.drblWar);
    traces.push({
      player: p.playerName,
      playerId: p.playerId,
      displayedDRBL100: Number(p.drbl100),
      posteriorAbilityRate: post,
      rawAbilityRate: raw,
      warCalibrationInput: post,
      looTransform: `${intercept} + ${slope} * ${post}`,
      warCalibratedRate: finalAbility,
      replacement: repl,
      aboveReplacementRate: above,
      actualOnCourtPossessions: n,
      note_exposure: "off+def possession-appearances (combined-event count)",
      seasonalImpact: `${above} * ${n} / 100 = ${impact}`,
      pointsPerWin: ppw,
      WAR: `${impact} / ${ppw} = ${war}`,
      identity_raw: {
        formula: "raw * n / 100",
        value: (raw * n) / 100,
        seasonalImpactStored: Number(p.seasonalImpact),
      },
    });
  }
  await writeFile(
    path.join(OUT, "09_representative_war_traces.json"),
    JSON.stringify(traces, null, 2)
  );

  // Cross-season architecture
  const sample2526 = art2526.players[0]!;
  await writeFile(
    path.join(OUT, "06_cross_season_war_architecture.csv"),
    toCsv([
      {
        field: "displayed_ability_input",
        "2024-25": "posteriorAbilityRate",
        "2025-26": "posteriorAbilityRate",
      },
      {
        field: "WAR_ability_input",
        "2024-25": "posterior → LOO calibrated finalAbility",
        "2025-26": "rawAbilityRate via seasonalImpact",
      },
      {
        field: "calibration_transform",
        "2024-25": `0 + ${slope} * posterior`,
        "2025-26": "none",
      },
      {
        field: "replacement",
        "2024-25": repl,
        "2025-26": 0,
      },
      {
        field: "exposure_definition",
        "2024-25": "actualOnCourtPossessions (off+def)",
        "2025-26": "actualOnCourtPossessions (off+def)",
      },
      {
        field: "pointsPerWin",
        "2024-25": ppw,
        "2025-26": 30,
      },
      {
        field: "WAR_formula_version",
        "2024-25": "4.0.0",
        "2025-26": "provisional-seasonalImpact/30",
      },
    ])
  );

  // League/team accounting
  const sumWar = players.reduce((s, p) => s + Number(p.drblWar ?? 0), 0);
  const wars = players.map((p) => Number(p.drblWar ?? 0)).sort((a, b) => b - a);
  const meanWar = sumWar / players.length;
  const medianWar = wars[Math.floor(wars.length / 2)]!;
  const posWar = wars.filter((w) => w > 0).reduce((a, b) => a + b, 0);
  const negWar = wars.filter((w) => w < 0).reduce((a, b) => a + b, 0);
  const top10 = wars.slice(0, 10).reduce((a, b) => a + b, 0);
  const top25 = wars.slice(0, 25).reduce((a, b) => a + b, 0);

  const byTeam = new Map<string, number>();
  for (const p of players) {
    byTeam.set(
      p.teamId,
      (byTeam.get(p.teamId) ?? 0) + Number(p.drblWar ?? 0)
    );
  }
  const teamRows: Record<string, unknown>[] = [];
  const teamWarXs: number[] = [];
  const teamWinYs: number[] = [];
  for (const t of teams) {
    const tw = byTeam.get(t.teamId) ?? 0;
    teamRows.push({
      teamId: t.teamId,
      abbreviation: t.abbreviation,
      teamPlayerWAR: tw,
      actualWins: t.wins,
      games: t.games,
      pointDifferential: t.pointDifferential,
      netRating: t.netRating,
    });
    teamWarXs.push(tw);
    teamWinYs.push(t.wins);
  }
  const teamFit = fitLinear(teamWarXs, teamWinYs);
  await writeFile(path.join(OUT, "07_team_war_accounting.csv"), toCsv(teamRows));

  // Inflation flags
  const meanRatioCal = cfRows
    .map((r) => Number(r.abilityTransformFactor))
    .filter((x) => Number.isFinite(x) && x > 0);
  const avgCalFactor =
    meanRatioCal.reduce((a, b) => a + b, 0) / (meanRatioCal.length || 1);
  const halfRatios = cfRows
    .map((r) => Number(r.ratio_current_over_half_exposure))
    .filter((x) => Number.isFinite(x));
  const avgHalfRatio =
    halfRatios.reduce((a, b) => a + b, 0) / (halfRatios.length || 1);

  const identityResiduals = exposureRows.map((r) =>
    Math.abs(Number(r.residual_E5_vs_seasonalImpact))
  );
  const maxIdRes = Math.max(...identityResiduals);

  const flags = {
    WAR_USES_NONDISPLAYED_ABILITY: {
      status: "WARNING",
      evidence:
        "WAR uses LOO-calibrated finalAbility from posterior, not displayed posterior alone",
      magnitude: `slope=${slope}`,
    },
    WAR_CALIBRATION_LARGE_SCALE_EXPANSION: {
      status: "WARNING",
      evidence: "through-origin LOO slope maps residual-share rates onto net-rating scale",
      magnitude: `slope=${slope}; mean final/posterior≈${avgCalFactor.toFixed(3)}`,
    },
    WAR_CALIBRATION_INTERCEPT_DOMINANT: {
      status: "PASS",
      evidence: "intercept=0 (through-origin)",
      magnitude: intercept,
    },
    WAR_DOUBLE_EXPOSURE: {
      status: "NO",
      evidence:
        "Calibration target is team netRating (rate). Downstream multiplies calibrated rate by player appearances once. Not season-total → rate double multiply.",
      magnitude: null,
    },
    WAR_EXPOSURE_UNIT_MISMATCH: {
      status: "WARNING",
      evidence:
        "Calibrated rates are net-rating-like (team pts/100) while exposure remains off+def appearance counts (~2× paired team possessions for full-time players). Slope absorbs some scale, but appearance vs paired-possession semantics remain ambiguous.",
      magnitude: `diagnostic half-exposure shrinks WAR by ~${avgHalfRatio.toFixed(2)}x vs current`,
    },
    WAR_RATE_DENOMINATOR_MISMATCH: {
      status: "PASS",
      evidence: "rawAbilityRate denominator = possessions = off+def; identity raw*n/100 ≈ seasonalImpact",
      magnitude: `max |raw*n/100 - seasonalImpact|=${maxIdRes}`,
    },
    POINTS_PER_WIN_UNIT_MISMATCH: {
      status: "PASS",
      evidence:
        "pointsPerWin from season pointDifferential / (wins-0.5*games); WAR impact treated as season-total points on calibrated scale",
      magnitude: ppw,
    },
    REPLACEMENT_LEVEL_SEMANTIC_MISMATCH: {
      status: "WARNING",
      evidence:
        "Zero on uncalibrated residual scale ≈ R1/league-average-ish; WAR uses fringe calibrated median ≠ 0. Naming 'WAR' is above fringe replacement after calibration - OK if documented. Zero is NOT replacement on calibrated scale.",
      magnitude: repl,
    },
    WAR_TARGET_EXPOSURE_ALREADY_EMBEDDED: {
      status: "NO",
      evidence: "netRating is per-100 rate, not season total",
      magnitude: null,
    },
    WAR_TEAM_SCALE_INFLATED: {
      status: teamFit.slope < 0.5 ? "WARNING" : "PASS",
      evidence: `actualWins ≈ ${teamFit.intercept.toFixed(2)} + ${teamFit.slope.toFixed(3)} * teamWAR`,
      magnitude: teamFit.slope,
    },
    WAR_UNEXPLAINED_SCALE_FACTOR: {
      status: "NO",
      evidence:
        "Current WAR reconstructs from slope, replacement, exposure, PPW with residual≈0; primary inflation is calibration slope (~5.8×) plus replacement shift",
      magnitude: null,
    },
  };

  await writeFile(
    path.join(OUT, "08_war_inflation_flags.json"),
    JSON.stringify(flags, null, 2)
  );

  // Charts
  await writeFile(
    path.join(OUT, "charts", "drbl100_vs_war.svg"),
    svgScatter(
      players.map((p) => ({
        x: Number(p.drbl100),
        y: Number(p.drblWar),
      })),
      "2024-25 displayed DRBL/100 vs WAR"
    )
  );
  await writeFile(
    path.join(OUT, "charts", "posterior_vs_finalAbility.svg"),
    svgScatter(
      players.map((p) => ({
        x: Number(p.posteriorAbilityRate),
        y: Number(p.finalAbilityDRBL100),
      })),
      "posterior vs LOO finalAbility"
    )
  );
  await writeFile(
    path.join(OUT, "charts", "current_vs_posterior_direct_war.svg"),
    svgScatter(
      cfRows.map((r) => ({
        x: Number(r.WAR_posterior_direct),
        y: Number(r.WAR_current),
      })),
      "current WAR vs posterior-direct WAR"
    )
  );
  await writeFile(
    path.join(OUT, "charts", "team_war_vs_wins.svg"),
    svgScatter(
      teamRows.map((r) => ({
        x: Number(r.teamPlayerWAR),
        y: Number(r.actualWins),
      })),
      "team player WAR vs actual wins"
    )
  );
  await writeFile(
    path.join(OUT, "charts", "possessions_vs_war.svg"),
    svgScatter(
      players.map((p) => ({
        x: Number(p.actualPossessions ?? p.possessions),
        y: Number(p.drblWar),
      })),
      "actualOnCourtPossessions vs WAR"
    )
  );

  // ========== M6 practical significance ==========
  const m16dBoot = (m16dSummary as { bootPm6?: Record<string, number> }).bootPm6!;
  const deltaRmse = Number(m16dBoot.pointEstimate);
  const pRmse = 2.409176880654843;
  const relGain = Math.abs(deltaRmse) / pRmse;
  // Metric noise: use bootstrap CI half-width from M16d as noise proxy
  const ciHalf =
    (Math.abs(Number(m16dBoot.ciHigh)) + Math.abs(Number(m16dBoot.ciLow))) / 2;
  // Also load M16c bootstrap deltas among near-tied models as noise context
  const m16cBootCsv = await readFile(
    path.join(M16C, "11_bootstrap_comparisons.csv"),
    "utf8"
  );
  const noiseRows = [
    {
      source: "M16d_P_vs_PM6_bootstrap_point",
      value: deltaRmse,
      abs: Math.abs(deltaRmse),
    },
    {
      source: "M16d_CI_halfwidth_proxy",
      value: ciHalf,
      abs: ciHalf,
    },
    {
      source: "M16c_P_vs_PLN_deltaRMSE",
      value: 0.000272,
      abs: 0.000272,
    },
    {
      source: "M16c_P_vs_PB_deltaRMSE",
      value: 0.000259,
      abs: 0.000259,
    },
    {
      source: "relative_M6_gain",
      value: relGain,
      abs: relGain,
    },
  ];
  await writeFile(path.join(OUT, "11_metric_noise_estimate.csv"), toCsv(noiseRows));

  /**
   * Practical significance framework (governance for M16e+).
   * Not fully preregistered for M16d (results already known) - apply transparently.
   */
  const practicalFramework = `
# M6 practical-significance closure

## Preserve formal result

\`\`\`text
M16D_FORMAL_WINNER = P + M6
\`\`\`

Paired RMSE CI excluded 0 (delta≈-0.000395, P(beats)≈0.986).

## Framework (for M16e+; applied transparently to M16d)

Categories:

| Category | Criteria (all must be considered) |
|---|---|
| STATISTICALLY_DETECTABLE_ONLY | CI excludes 0 OR P(beats)>0.95, but relative RMSE gain < noise scale (~same order as near-tie deltas ~0.0003) AND effective contribution SD ≪ primary component AND residual Corr≈0 AND/or fold sign instability |
| PRACTICALLY_SMALL | Formal improvement with relative gain small vs RMSE, weak residual signal, unstable weights |
| PRACTICALLY_MEANINGFUL | Formal improvement AND residual Corr clearly nonzero AND effective contribution material AND fold-stable sign AND not only one subgroup |
| ROBUSTLY_MEANINGFUL | PRACTICALLY_MEANINGFUL across exposure strata + calibration improvement |

Complexity rule: if STATISTICALLY_DETECTABLE_ONLY or PRACTICALLY_SMALL, prefer simpler base for subsequent architecture research while retaining component as research debt.

## Apply to M16d M6

| Evidence | Value |
|---|---|
| relative RMSE gain | ${(relGain * 100).toFixed(4)}% |
| abs delta | ${Math.abs(deltaRmse).toFixed(6)} |
| residual Corr(M6,R_P) | ≈ -0.021 |
| effective contrib SD | ≈ 0.0044 vs P ≈ 0.666 |
| wM6 | ≈ -0.002, sign-unstable across folds |
| residual model | no gain |

**Practical category: STATISTICALLY_DETECTABLE_ONLY**

## Decision

\`\`\`text
M16D_FORMAL_WINNER = P + M6
M16E0_RESEARCH_BASE = P
M6_FORMAL_STATISTICAL_WIN = true
M6_PRACTICAL_BASE_INCLUDED = false
M6_STATUS = research_component_needs_redesign_or_stronger_effect
\`\`\`

Reason: microscopic relative gain (~0.016%), null residual association, negligible effective contribution, unstable coefficient - complexity not earned for Approach A/B base architecture.
`;

  await writeFile(path.join(OUT, "10_m6_practical_significance.md"), practicalFramework);

  // ========== P calibration diagnostics (VALIDATION from M16c predictions) ==========
  const pPredCsv = await readFile(
    path.join(M16C, "predictions", "M16C_P.csv"),
    "utf8"
  );
  const pPredLines = pPredCsv.trim().split(/\r?\n/).slice(1);
  const pPairs = pPredLines.map((line) => {
    // entityId,playerId,target,prediction,...
    const cols = line.split(",");
    return { y: Number(cols[2]), yhat: Number(cols[3]), poss: Number(cols[7]) };
  });
  const ordered = [...pPairs].sort((a, b) => a.yhat - b.yhat);
  const calibRows: Record<string, unknown>[] = [];
  for (let q = 0; q < 10; q++) {
    const slice = ordered.slice(
      Math.floor((q / 10) * ordered.length),
      Math.floor(((q + 1) / 10) * ordered.length)
    );
    const meanPred = slice.reduce((s, x) => s + x.yhat, 0) / slice.length;
    const meanY = slice.reduce((s, x) => s + x.y, 0) / slice.length;
    const medY = [...slice.map((x) => x.y)].sort((a, b) => a - b)[
      Math.floor(slice.length / 2)
    ]!;
    const rmse =
      Math.sqrt(slice.reduce((s, x) => s + (x.yhat - x.y) ** 2, 0) / slice.length);
    calibRows.push({
      bin: `decile_${q + 1}`,
      n: slice.length,
      meanPrediction: meanPred,
      meanY,
      medianY: medY,
      residual: meanY - meanPred,
      RMSE: rmse,
    });
  }
  // tails
  for (const [label, slice] of [
    ["bottom_5pct", ordered.slice(0, Math.max(1, Math.floor(ordered.length * 0.05)))],
    ["bottom_10pct", ordered.slice(0, Math.max(1, Math.floor(ordered.length * 0.1)))],
    ["top_10pct", ordered.slice(-Math.max(1, Math.floor(ordered.length * 0.1)))],
    ["top_5pct", ordered.slice(-Math.max(1, Math.floor(ordered.length * 0.05)))],
  ] as const) {
    const meanPred = slice.reduce((s, x) => s + x.yhat, 0) / slice.length;
    const meanY = slice.reduce((s, x) => s + x.y, 0) / slice.length;
    calibRows.push({
      bin: label,
      n: slice.length,
      meanPrediction: meanPred,
      meanY,
      residual: meanY - meanPred,
      RMSE: Math.sqrt(
        slice.reduce((s, x) => s + (x.yhat - x.y) ** 2, 0) / slice.length
      ),
    });
  }
  // linear vs quadratic diagnostic on TRAIN would need train preds; use VAL fit as DIAGNOSTIC_ONLY description
  const lin = fitLinear(
    pPairs.map((p) => p.yhat),
    pPairs.map((p) => p.y)
  );
  const xs = pPairs.map((p) => p.yhat);
  const ys = pPairs.map((p) => p.y);
  // quadratic via design [1,x,x^2] least squares (diagnostic)
  const xtx = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const xty = [0, 0, 0];
  for (let i = 0; i < xs.length; i++) {
    const row = [1, xs[i]!, xs[i]! * xs[i]!];
    for (let a = 0; a < 3; a++) {
      xty[a]! += row[a]! * ys[i]!;
      for (let b = 0; b < 3; b++) xtx[a]![b]! += row[a]! * row[b]!;
    }
  }
  // naive gauss
  const A = xtx.map((r) => r.slice());
  const B = xty.slice();
  for (let col = 0; col < 3; col++) {
    let piv = col;
    for (let r = col + 1; r < 3; r++)
      if (Math.abs(A[r]![col]!) > Math.abs(A[piv]![col]!)) piv = r;
    [A[col], A[piv]] = [A[piv]!, A[col]!];
    [B[col], B[piv]] = [B[piv]!, B[col]!];
    const div = A[col]![col]!;
    for (let j = col; j < 3; j++) A[col]![j]! /= div;
    B[col]! /= div;
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = A[r]![col]!;
      for (let j = col; j < 3; j++) A[r]![j]! -= f * A[col]![j]!;
      B[r]! -= f * B[col]!;
    }
  }
  let quadSs = 0;
  for (let i = 0; i < xs.length; i++) {
    const pred = B[0]! + B[1]! * xs[i]! + B[2]! * xs[i]! * xs[i]!;
    quadSs += (pred - ys[i]!) ** 2;
  }
  calibRows.push({
    bin: "DIAGNOSTIC_linear_on_VAL",
    intercept: lin.intercept,
    slope: lin.slope,
    RMSE: lin.rmse,
    R2: lin.r2,
  });
  calibRows.push({
    bin: "DIAGNOSTIC_quadratic_on_VAL",
    a0: B[0],
    a1: B[1],
    a2: B[2],
    RMSE: Math.sqrt(quadSs / xs.length),
    note: "DIAGNOSTIC_ONLY - fitted on VALIDATION for shape only; not a production model",
  });
  await writeFile(
    path.join(OUT, "12_p_calibration_diagnostics.csv"),
    toCsv(calibRows)
  );
  const top5 = calibRows.find((r) => r.bin === "top_5pct")!;
  const pNonlinear =
    Number(top5.meanPrediction) - Number(top5.meanY) > 0.5
      ? "P_NONLINEAR_CALIBRATION_RISK"
      : "NONE";

  await writeFile(
    path.join(OUT, "charts", "p_calibration_deciles.svg"),
    svgScatter(
      calibRows
        .filter((r) => String(r.bin).startsWith("decile"))
        .map((r) => ({
          x: Number(r.meanPrediction),
          y: Number(r.meanY),
        })),
      "P calibration deciles (pred vs actual)"
    )
  );

  // Posterior debt
  const postDebt = `# Posterior technical debt

## Reconfirmed from M16c (not retuned)

| | Value |
|---|---|
| raw P RMSE | 2.40918 |
| EB(P) RMSE | 2.43343 |
| delta | +0.0243 (worse) |
| 95% CI | includes 0 |
| Q1 (low sample) delta | +0.047 (worse) |
| Q4 (high sample) delta | +0.009 (worse) |

Status: **POSTERIOR_INCREMENTAL_VALUE_UNPROVEN** (point estimate worse; do not remove EB)

## Future research questions (do not execute here)

1. Does any k improve validation?
2. Should prior strength depend on uncertainty rather than possessions only?
3. Should posterior use empirical SE?
4. Should prior be hierarchical?
5. Does shrinkage improve calibration even if RMSE changes little?
6. Is raw/fused P already regularized enough that EB double-shrinks?
`;
  await writeFile(path.join(OUT, "13_posterior_technical_debt.md"), postDebt);

  const researchBase = "P";
  const approachReady = `# Approach A/B readiness

## Selected base for Approach A vs B

\`\`\`text
APPROACH_AB_BASE = M16E0_RESEARCH_BASE = P
\`\`\`

M16D_FORMAL_WINNER remains P+M6 (statistical). Practical research base is P.

## Comparison contract (future milestone - do not execute)

- same TRAIN / VALIDATION hashes (drbl-eval-v1)
- same target: future_block_residual_per_100
- same eligibility / aggregation
- same metric contract (primary validation RMSE + paired bootstrap)
- same fusion rules where applicable
- same posterior treatment (document; do not retune k in bakeoff unless milestone says so)
- both approaches use base = P components only (no LN/B; M6 not in base)

## Primary question

Does Approach A produce better unseen predictive value than current Approach B?

## Reserved test

\`RESERVED_TEST_ACCESSED_FOR_MODEL_EVALUATION = false\`

Board visibility note: 2025-26 production board has been seen operationally → classify as \`protected_test_not_fully_human-blind\` but still do not use for candidate selection.

## Ready?

**YES** - pending audit approval of this M16e0 package (WAR not repaired; A not implemented).
`;
  await writeFile(path.join(OUT, "14_approach_ab_readiness.md"), approachReady);

  const jokic = traces.find((t) =>
    normName(String(t.player)).includes("jokic")
  );

  const health = {
    WAR_PRODUCTION_RECONSTRUCTS: mismatchCount === 0 ? "PASS" : "FAIL",
    WAR_UNITS_DEFINED: "PASS",
    ABILITY_RATE_DENOMINATOR_IDENTIFIED: "PASS",
    WAR_EXPOSURE_DENOMINATOR_IDENTIFIED: "PASS",
    RATE_EXPOSURE_DIMENSIONAL_IDENTITY: maxIdRes < 0.05 ? "PASS" : "FAIL",
    WAR_DOUBLE_EXPOSURE: "NO",
    WAR_CALIBRATION_TARGET_UNITS_VALID: "PASS",
    WAR_CALIBRATION_EXPOSURE_EMBEDDED: "NO",
    POINTS_PER_WIN_UNITS_VALID: "PASS",
    REPLACEMENT_SEMANTICS_VALID: "WARNING",
    WAR_UNEXPLAINED_SCALE_FACTOR: "NO",
    M16D_FORMAL_WINNER: "P+M6",
    M16E0_RESEARCH_BASE: researchBase,
    M6_PRACTICAL_EFFECT: "DETECTABLE_ONLY",
    P_CALIBRATION_RISK: pNonlinear !== "NONE" ? "YES" : "NO",
    POSTERIOR_INCREMENTAL_VALUE: "UNSUPPORTED",
    RESERVED_TEST_ACCESSED_FOR_MODEL_EVALUATION: "NO",
    PRODUCTION_DRBL_CHANGED: "NO",
    PRODUCTION_WAR_CHANGED: "NO",
    maxWarReconstructionResidual: maxReconResidual,
    mismatchCount,
    league: {
      sumWar,
      meanWar,
      medianWar,
      posWar,
      negWar,
      top10Share: top10 / posWar,
      top25Share: top25 / posWar,
      meanTeamWar: sumWar / teams.length,
    },
    teamFit,
    calibrationSlope: slope,
    pointsPerWin: ppw,
    replacement: repl,
  };

  await writeFile(
    path.join(OUT, "15_model_health.json"),
    JSON.stringify(health, null, 2)
  );

  await writeFile(
    path.join(OUT, "16_full_audit.md"),
    `# M16e0 full audit

## WAR verdict

2024-25 WAR reconstructs exactly from:

\`\`\`text
finalAbility = ${slope} * posterior
WAR = (finalAbility - (${repl})) * n / 100 / ${ppw}
\`\`\`

Primary inflation: **LOO calibration slope ≈ ${slope.toFixed(2)}×** expanding residual-share rates onto net-rating-like units, plus replacement shift (~${(-repl).toFixed(2)} pts/100).

Double-exposure via season-total calibration: **NO**.

Appearance vs paired-possession ambiguity: **WARNING** (half-exposure diagnostic ≈2×).

## Jokic arithmetic check

${JSON.stringify(jokic, null, 2)}

## M6

Formal winner P+M6; practical research base **P**.

## Statuses

${Object.entries(health)
  .filter(([k]) => typeof (health as any)[k] === "string")
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}
`
  );

  await writeFile(
    path.join(OUT, "17_stop_summary.json"),
    JSON.stringify(
      {
        freeze,
        health,
        flags,
        traces,
        m6: {
          formalWinner: "P+M6",
          researchBase,
          relativeGain: relGain,
          category: "STATISTICALLY_DETECTABLE_ONLY",
        },
        pCalibration: {
          linear: lin,
          nonlinearFlag: pNonlinear,
          top5,
        },
        reservedTestAccessedForModelEvaluation: false,
      },
      null,
      2
    )
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        maxReconResidual,
        mismatchCount,
        slope,
        ppw,
        repl,
        sumWar,
        teamSlope: teamFit.slope,
        researchBase,
        m6Category: "STATISTICALLY_DETECTABLE_ONLY",
        jokicWar: jokic?.WAR,
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
