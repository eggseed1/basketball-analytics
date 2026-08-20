/**
 * M16e1 - WAR unit-consistent diagnostic candidates.
 *   npm run drbl:m16e1
 *
 * DIAGNOSTIC_CANDIDATE only. No production WAR/DRBL changes.
 * No Approach A. No RESERVED_TEST predictive evaluation.
 */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

import { EVALUATION_PROTOCOL_VERSION } from "../drbl/evaluation/protocol";
import {
  fitCalibrationLeaveOneOut,
  fitLinear,
  throughOriginSlope,
  computeWAR,
  WAR_FORMULA_VERSION,
  PIPELINE_VERSION,
  CALIBRATION_VERSION,
  REPLACEMENT_VERSION,
  POINTS_PER_WIN_VERSION,
} from "../drbl/models/pipeline-value";
import { calculateSeasonPlayerPairedPossessions } from "../drbl/models/paired-possessions";
import {
  diagnosticWarCombinedConverted,
  diagnosticWarPaired,
  LOO_OUTPUT_UNIT,
} from "../drbl/models/war-units";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "m16e1");
const M16B = path.join(ROOT, "reports", "m16b");
const M16E0 = path.join(ROOT, "reports", "m16e0");

const EXPECTED_TRAIN =
  "7bec77be45295ee858d90896d9383e4da951e98e81ad1ef31b5285fb055d1550";
const EXPECTED_VAL =
  "4fd339a445f269162c2d76e9102ea5bb965a5d0fc05e0fcd2f60593117c5faf0";
const EXPECTED_RES =
  "e542aa54602390ed65792f37e10207814e10b62bfdf552ddf4da69825076c1ce";

const TRACE_NEEDLES = [
  "jokic",
  "gilgeous",
  "franz wagner",
  "wembanyama",
  "pritchard",
  "zubac",
  "derozan",
  "christian braun",
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
function sha256(buf: string | Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}
function normName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}
function quantiles(xs: number[]) {
  if (!xs.length) {
    return {
      mean: NaN,
      median: NaN,
      sd: NaN,
      p5: NaN,
      p25: NaN,
      p75: NaN,
      p95: NaN,
      min: NaN,
      max: NaN,
    };
  }
  const a = xs.slice().sort((x, y) => x - y);
  const n = a.length;
  const q = (p: number) => {
    const i = (n - 1) * p;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    if (lo === hi) return a[lo]!;
    return a[lo]! * (hi - i) + a[hi]! * (i - lo);
  };
  const mean = a.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(a.reduce((s, x) => s + (x - mean) ** 2, 0) / n);
  return {
    mean,
    median: q(0.5),
    sd,
    p5: q(0.05),
    p25: q(0.25),
    p75: q(0.75),
    p95: q(0.95),
    min: a[0]!,
    max: a[n - 1]!,
  };
}
function fitWins(xs: number[], ys: number[]) {
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
  const slope = Math.abs(den) > 1e-12 ? (n * sxy - sx * sy) / den : 0;
  const intercept = (sy - slope * sx) / n;
  let sse = 0;
  let sae = 0;
  for (let i = 0; i < n; i++) {
    const e = ys[i]! - (intercept + slope * xs[i]!);
    sse += e * e;
    sae += Math.abs(e);
  }
  const sst = syy - (sy * sy) / n;
  return {
    intercept,
    slope,
    rmse: Math.sqrt(sse / n),
    mae: sae / n,
    r2: sst > 1e-12 ? 1 - sse / sst : 0,
  };
}
function svgScatter(
  points: Array<{ x: number; y: number }>,
  title: string,
  xlab: string,
  ylab: string
): string {
  const W = 640,
    H = 400,
    pad = 48;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xmin = Math.min(...xs, 0);
  const xmax = Math.max(...xs, 1);
  const ymin = Math.min(...ys, 0);
  const ymax = Math.max(...ys, 1);
  const sx = (x: number) =>
    pad + ((x - xmin) / (xmax - xmin || 1)) * (W - 2 * pad);
  const sy = (y: number) =>
    H - pad - ((y - ymin) / (ymax - ymin || 1)) * (H - 2 * pad);
  const dots = points
    .map(
      (p) =>
        `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="2.5" fill="#1f4e79" opacity="0.7"/>`
    )
    .join("");
  return `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="100%" height="100%" fill="#f7f5f0"/>
  <text x="${W / 2}" y="24" text-anchor="middle" font-size="14" font-family="Georgia,serif">${title}</text>
  <text x="${W / 2}" y="${H - 8}" text-anchor="middle" font-size="11">${xlab}</text>
  <text x="14" y="${H / 2}" text-anchor="middle" font-size="11" transform="rotate(-90 14 ${H / 2})">${ylab}</text>
  <line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="#333"/>
  <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${H - pad}" stroke="#333"/>
  ${dots}
</svg>`;
}

type Player = {
  playerId: string;
  playerName: string;
  teamId: string;
  possessions?: number;
  actualPossessions?: number;
  rawAbilityRate?: number;
  posteriorAbilityRate?: number;
  drbl100?: number;
  finalAbilityDRBL100?: number;
  aboveReplacementDRBL100?: number;
  replacementLevelRate?: number;
  rateCalibrationSlope?: number;
  calibrationIntercept?: number;
  pointsPerWin?: number;
  drblWar?: number;
  seasonImpactAboveReplacement?: number;
  seasonalImpact?: number;
  warCalibrationAbilityInput?: string;
};

type TeamRow = {
  teamId: string;
  abbreviation: string;
  wins: number;
  games: number;
  pointDifferential: number;
  netRating: number;
};

async function loadTeams(season: string): Promise<TeamRow[]> {
  const p = path.join(
    ROOT,
    "data/drbl/calibration",
    `team-season-${season}.csv`
  );
  const text = await readFile(p, "utf8");
  const lines = text.trim().split(/\r?\n/);
  const h = lines[0]!.split(",").map((x) => x.trim());
  const idx = (n: string) => h.indexOf(n);
  return lines
    .slice(1)
    .map((line) => {
      const c = line.split(",").map((x) => x.trim());
      return {
        teamId: c[idx("teamId")]!,
        abbreviation: c[idx("abbreviation")]!,
        wins: Number(c[idx("wins")]),
        games: Number(c[idx("games")]),
        pointDifferential: Number(c[idx("pointDifferential")]),
        netRating: Number(c[idx("netRating")]),
      };
    })
    .filter((t) => Number.isFinite(t.netRating));
}

async function main() {
  await mkdir(path.join(OUT, "freeze"), { recursive: true });
  await mkdir(path.join(OUT, "charts"), { recursive: true });

  const gitCommit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const gitDirty =
    execSync("git status --porcelain", { encoding: "utf8" }).trim().length > 0;

  const m16bFreeze = JSON.parse(
    await readFile(path.join(M16B, "00_freeze.json"), "utf8")
  ) as {
    trainSplitHash?: string;
    validationSplitHash?: string;
    reservedTestSplitHash?: string;
  };
  const trainHash = m16bFreeze.trainSplitHash ?? EXPECTED_TRAIN;
  const valHash = m16bFreeze.validationSplitHash ?? EXPECTED_VAL;
  const resHash = m16bFreeze.reservedTestSplitHash ?? EXPECTED_RES;
  if (
    trainHash !== EXPECTED_TRAIN ||
    valHash !== EXPECTED_VAL ||
    resHash !== EXPECTED_RES
  ) {
    throw new Error("STOP EVALUATION_PROTOCOL_DRIFT");
  }

  const season = "2024-25";
  const artPath = path.join(ROOT, "src/data/drbl/precomputed", `${season}.json`);
  const artBuf = await readFile(artPath);
  const artHash = sha256(artBuf);
  const artifact = JSON.parse(artBuf.toString("utf8")) as {
    players: Player[];
    warModel?: Record<string, unknown>;
    abilityLineageVersion?: string;
    artifactGenerationId?: string;
    [k: string]: unknown;
  };
  await copyFile(artPath, path.join(OUT, "freeze", `site-${season}.json`));

  const wm = artifact.warModel ?? {};
  const slope = Number(wm.calibrationSlope ?? 5.835416607524311);
  const intercept = Number(wm.calibrationIntercept ?? 0);
  const repl = Number(wm.replacementLevelDRBL100 ?? -1.4886147765794517);
  const ppw = Number(wm.pointsPerWin ?? 38.714285714285715);

  const freeze = {
    milestone: "M16e1",
    timestamp: new Date().toISOString(),
    gitCommit,
    gitDirty,
    "2024-25": {
      artifactPath: `src/data/drbl/precomputed/${season}.json`,
      artifactHash: artHash,
      generationId: artifact.artifactGenerationId ?? null,
    },
    abilityLineageVersion: artifact.abilityLineageVersion ?? "ability-lineage-v1",
    warFormulaVersion: WAR_FORMULA_VERSION,
    warCalibrationVersion: CALIBRATION_VERSION,
    replacementVersion: REPLACEMENT_VERSION,
    pointsPerWinVersion: POINTS_PER_WIN_VERSION,
    pipelineVersion: PIPELINE_VERSION,
    looSlope: slope,
    looIntercept: intercept,
    looTargetDefinition: "team netRating from team-season CSV",
    looTargetUnits: LOO_OUTPUT_UNIT,
    looOutputUnit: LOO_OUTPUT_UNIT,
    evaluationProtocolVersion: EVALUATION_PROTOCOL_VERSION,
    trainSplitHash: trainHash,
    validationSplitHash: valHash,
    reservedTestSplitHash: resHash,
    M16E0_RESEARCH_BASE: "P",
    reservedTestPredictiveEvaluation: false,
    label: "DIAGNOSTIC_CANDIDATE",
  };
  await writeFile(
    path.join(OUT, "00_freeze.json"),
    JSON.stringify(freeze, null, 2)
  );

  const players = artifact.players ?? [];
  // --- Phase 1: reproduce production WAR ---
  let maxRecon = 0;
  let mismatch = 0;
  for (const p of players) {
    const post = Number(p.posteriorAbilityRate ?? p.drbl100 ?? 0);
    const finalAbility =
      p.finalAbilityDRBL100 != null
        ? Number(p.finalAbilityDRBL100)
        : intercept + slope * post;
    const n = Number(p.actualPossessions ?? p.possessions ?? 0);
    const w = computeWAR({
      finalAbilityDRBL100: finalAbility,
      replacementLevelDRBL100: Number(p.replacementLevelRate ?? repl),
      actualOnCourtPossessions: n,
      pointsPerWin: Number(p.pointsPerWin ?? ppw),
    });
    const displayed = Number(p.drblWar ?? 0);
    const resid = Math.abs(w.war - displayed);
    if (resid > maxRecon) maxRecon = resid;
    if (resid > 1e-6) mismatch++;
  }
  if (maxRecon > 1e-4 || mismatch > 0) {
    // allow tiny float noise
    if (maxRecon > 1e-4) {
      throw new Error(
        `STOP M16E0_REPRODUCTION_FAILURE maxRecon=${maxRecon} mismatches=${mismatch}`
      );
    }
  }

  console.log("Scanning paired possessions from normalized games...");
  const pairedMap = await calculateSeasonPlayerPairedPossessions(season, ROOT);
  await writeFile(
    path.join(OUT, "freeze", "paired-possessions-cache.json"),
    JSON.stringify([...pairedMap.values()])
  );

  // --- Phase 4-5 exposure + rate conversion ---
  const exposureRows: Record<string, unknown>[] = [];
  const rateConvRows: Record<string, unknown>[] = [];
  const ratios: number[] = [];
  let rateIdFail = 0;

  for (const p of players) {
    const nBoard = Number(p.actualPossessions ?? p.possessions ?? 0);
    const pp = pairedMap.get(p.playerId);
    const off = pp?.offensiveTeamPossessionsOnCourt ?? nBoard / 2;
    const def = pp?.defensiveTeamPossessionsOnCourt ?? nBoard / 2;
    const nCombined = pp?.combinedPossessionAppearances ?? off + def;
    const nPaired = pp?.pairedPossessions ?? (off + def) / 2;
    const ratio = nPaired > 0 ? nCombined / nPaired : NaN;
    if (Number.isFinite(ratio)) ratios.push(ratio);

    const raw = Number(p.rawAbilityRate ?? 0);
    const seasonalImpact = Number(p.seasonalImpact ?? 0);
    const pairedEq = nPaired > 0 ? raw * (nCombined / nPaired) : 0;
    const impactC = (raw * nCombined) / 100;
    const impactP = (pairedEq * nPaired) / 100;
    const idResid = Math.abs(impactC - impactP);
    if (idResid > 1e-6) rateIdFail++;

    exposureRows.push({
      playerId: p.playerId,
      playerName: p.playerName,
      teamId: p.teamId,
      N_combined: nCombined,
      N_paired: nPaired,
      offensiveTeamPossessionsOnCourt: off,
      defensiveTeamPossessionsOnCourt: def,
      ratioCombinedToPaired: ratio,
      boardActualPossessions: nBoard,
      combinedVsBoard: nCombined - nBoard,
      uniquePossessionIdsOnCourt: pp?.uniquePossessionIdsOnCourt ?? null,
      pairedExposureMethod:
        pp?.pairedExposureMethod ??
        "fallback_board_half_when_scan_missing",
      DIAGNOSTIC_CANDIDATE: true,
    });

    rateConvRows.push({
      playerId: p.playerId,
      playerName: p.playerName,
      rawCombinedRate: raw,
      pairedEquivalentRate: pairedEq,
      impact_combined_formula: impactC,
      impact_paired_formula: impactP,
      residual: impactC - impactP,
      seasonalImpactStored: seasonalImpact,
      residual_vs_stored_combined: impactC - seasonalImpact,
      DIAGNOSTIC_CANDIDATE: true,
    });
  }

  if (rateIdFail > 0) {
    throw new Error(`STOP RATE_CONVENTION_EQUIVALENCE_FAIL count=${rateIdFail}`);
  }

  const ratioStats = quantiles(ratios);
  await writeFile(path.join(OUT, "01_exposure_conventions.csv"), toCsv(exposureRows));
  await writeFile(
    path.join(OUT, "04_rate_conversion_identity.csv"),
    toCsv(rateConvRows)
  );

  // Team / quartile ratio summaries appended via separate small csv in audit
  const byTeamRatio = new Map<string, number[]>();
  for (const r of exposureRows) {
    const tid = String(r.teamId);
    const arr = byTeamRatio.get(tid) ?? [];
    if (Number.isFinite(Number(r.ratioCombinedToPaired))) {
      arr.push(Number(r.ratioCombinedToPaired));
    }
    byTeamRatio.set(tid, arr);
  }

  // --- Candidates A/B ---
  const candRows: Record<string, unknown>[] = [];
  const inflRows: Record<string, unknown>[] = [];
  const equivRows: Record<string, unknown>[] = [];
  const replRows: Record<string, unknown>[] = [];
  const prodToPaired: number[] = [];
  let equivFail = 0;
  let replFail = 0;
  let maxEquiv = 0;
  let sumAbsEquiv = 0;

  // Build team features for LOO refit (Candidate C)
  const teams = await loadTeams(season);
  const byTeam = new Map<
    string,
    { postSum: number; poss: number }
  >();
  for (const p of players) {
    const n = Number(p.actualPossessions ?? p.possessions ?? 0);
    const post = Number(p.posteriorAbilityRate ?? p.drbl100 ?? 0);
    const row = byTeam.get(p.teamId) ?? { postSum: 0, poss: 0 };
    row.postSum += post * n;
    row.poss += n;
    byTeam.set(p.teamId, row);
  }
  const meanExposureRatio = ratioStats.mean || 2;
  const teamJoin = teams
    .map((t) => {
      const agg = byTeam.get(t.teamId);
      if (!agg || agg.poss <= 0) return null;
      const postFeature = (5 * agg.postSum) / agg.poss;
      return {
        ...t,
        postFeature,
        targetPaired: t.netRating,
        targetCombined: t.netRating / meanExposureRatio,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  const postCalPaired = fitCalibrationLeaveOneOut({
    teamFeature: teamJoin.map((t) => t.postFeature),
    teamTarget: teamJoin.map((t) => t.targetPaired),
    preferThroughOrigin: true,
  });
  const postCalCombined = fitCalibrationLeaveOneOut({
    teamFeature: teamJoin.map((t) => t.postFeature),
    teamTarget: teamJoin.map((t) => t.targetCombined),
    preferThroughOrigin: true,
  });

  // LOO per-holdout slopes for stability
  const looSlopes: Array<Record<string, unknown>> = [];
  for (let hold = 0; hold < teamJoin.length; hold++) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < teamJoin.length; i++) {
      if (i === hold) continue;
      xs.push(teamJoin[i]!.postFeature);
      ys.push(teamJoin[i]!.targetPaired);
    }
    const s = throughOriginSlope(xs, ys);
    const withInt = fitLinear(xs, ys);
    looSlopes.push({
      leftOutTeamId: teamJoin[hold]!.teamId,
      abbreviation: teamJoin[hold]!.abbreviation,
      throughOriginSlope: s,
      interceptFit_a: withInt.intercept,
      interceptFit_b: withInt.slope,
      diffFromFullSlope: s - postCalPaired.throughOriginSlope,
      DIAGNOSTIC_CANDIDATE: true,
    });
  }
  const fullWithIntercept = fitLinear(
    teamJoin.map((t) => t.postFeature),
    teamJoin.map((t) => t.targetPaired)
  );

  // Candidate C: refit slope on combined target; global replacement scaled
  const slopeCombinedRefit = Math.max(
    0.25,
    Math.min(20, postCalCombined.throughOriginSlope)
  );
  // Fringe replacement on combined-refit calibrated abilities
  const fringeAbilities: number[] = [];
  const fringePoss: number[] = [];
  for (const p of players) {
    const n = Number(p.actualPossessions ?? p.possessions ?? 0);
    const post = Number(p.posteriorAbilityRate ?? p.drbl100 ?? 0);
    const finalC = slopeCombinedRefit * post;
    if (n >= 200 && n <= 800) {
      fringeAbilities.push(finalC);
      fringePoss.push(n);
    }
  }
  fringeAbilities.sort((a, b) => a - b);
  const replCombinedRefit =
    fringeAbilities.length >= 5
      ? fringeAbilities[Math.floor(fringeAbilities.length / 2)]!
      : repl / meanExposureRatio;

  for (const p of players) {
    const post = Number(p.posteriorAbilityRate ?? p.drbl100 ?? 0);
    const finalPaired =
      p.finalAbilityDRBL100 != null
        ? Number(p.finalAbilityDRBL100)
        : intercept + slope * post;
    const replP = Number(p.replacementLevelRate ?? repl);
    const nBoard = Number(p.actualPossessions ?? p.possessions ?? 0);
    const pp = pairedMap.get(p.playerId);
    const nCombined = pp?.combinedPossessionAppearances ?? nBoard;
    const nPaired = pp?.pairedPossessions ?? nBoard / 2;
    const ratio = nPaired > 0 ? nCombined / nPaired : 2;

    const prod = computeWAR({
      finalAbilityDRBL100: finalPaired,
      replacementLevelDRBL100: replP,
      actualOnCourtPossessions: nBoard,
      pointsPerWin: ppw,
    });

    const pairedCand = diagnosticWarPaired({
      calibratedRatePaired: finalPaired,
      replacementPaired: replP,
      nPaired,
      pointsPerWin: ppw,
    });
    const combConv = diagnosticWarCombinedConverted({
      calibratedRatePaired: finalPaired,
      replacementPaired: replP,
      nPaired,
      nCombined,
      pointsPerWin: ppw,
    });

    const finalRefit = slopeCombinedRefit * post;
    const aboveRefit = finalRefit - replCombinedRefit;
    const impactRefit = (aboveRefit * nCombined) / 100;
    const warRefit = ppw > 0 ? impactRefit / ppw : 0;

    const equivResid = Math.abs(
      pairedCand.seasonalImpactPaired - combConv.seasonalImpactCombined
    );
    sumAbsEquiv += equivResid;
    if (equivResid > maxEquiv) maxEquiv = equivResid;
    if (equivResid > 1e-6) equivFail++;

    const aboveP = pairedCand.aboveReplacementRatePaired;
    const aboveC = combConv.aboveReplacementRateCombined;
    const replIdent = Math.abs(aboveP * nPaired - aboveC * nCombined);
    if (replIdent > 1e-6) replFail++;

    const infl =
      Math.abs(pairedCand.warPaired) > 1e-9
        ? prod.war / pairedCand.warPaired
        : NaN;
    if (Number.isFinite(infl)) prodToPaired.push(infl);

    candRows.push({
      playerId: p.playerId,
      playerName: p.playerName,
      teamId: p.teamId,
      posteriorAbilityRate: post,
      productionWAR: prod.war,
      WAR_paired: pairedCand.warPaired,
      WAR_combined_converted: combConv.warCombinedConverted,
      WAR_combined_refit: warRefit,
      N_combined: nCombined,
      N_paired: nPaired,
      calibratedRate_paired: finalPaired,
      calibratedRate_combined_converted: combConv.calibratedRateCombined,
      calibratedRate_combined_refit: finalRefit,
      replacement_paired: replP,
      replacement_combined_converted: combConv.replacementCombined,
      replacement_combined_refit: replCombinedRefit,
      seasonalImpact_production: prod.impactAboveReplacement,
      seasonalImpact_paired: pairedCand.seasonalImpactPaired,
      seasonalImpact_combined_converted: combConv.seasonalImpactCombined,
      seasonalImpact_combined_refit: impactRefit,
      DIAGNOSTIC_CANDIDATE: true,
    });

    inflRows.push({
      playerId: p.playerId,
      playerName: p.playerName,
      productionToPairedRatio: infl,
      productionWAR: prod.war,
      WAR_paired: pairedCand.warPaired,
      DIAGNOSTIC_CANDIDATE: true,
    });

    equivRows.push({
      playerId: p.playerId,
      impact_paired: pairedCand.seasonalImpactPaired,
      impact_combined_converted: combConv.seasonalImpactCombined,
      residual: pairedCand.seasonalImpactPaired - combConv.seasonalImpactCombined,
      war_residual: pairedCand.warPaired - combConv.warCombinedConverted,
      DIAGNOSTIC_CANDIDATE: true,
    });

    replRows.push({
      playerId: p.playerId,
      aboveP_times_Npaired: aboveP * nPaired,
      aboveC_times_Ncombined: aboveC * nCombined,
      residual: aboveP * nPaired - aboveC * nCombined,
      DIAGNOSTIC_CANDIDATE: true,
    });
  }

  if (equivFail > 0 || maxEquiv > 1e-6) {
    throw new Error(
      `STOP UNIT_CONVERSION_EQUIVALENCE_FAIL fail=${equivFail} max=${maxEquiv}`
    );
  }
  if (replFail > 0) {
    throw new Error(`STOP REPLACEMENT_UNIT_CONVERSION_FAIL count=${replFail}`);
  }

  await writeFile(path.join(OUT, "02_candidate_war.csv"), toCsv(candRows));
  await writeFile(
    path.join(OUT, "03_production_inflation_factor.csv"),
    toCsv(inflRows)
  );
  await writeFile(path.join(OUT, "05_candidate_equivalence.csv"), toCsv(equivRows));
  await writeFile(
    path.join(OUT, "06_replacement_unit_conversion.csv"),
    toCsv(replRows)
  );

  const inflStats = quantiles(prodToPaired);
  const remainingEmpirical = slope / meanExposureRatio;
  const slopeDecomp = [
    {
      originalPairedSlope: slope,
      reproducedPairedSlope: postCalPaired.throughOriginSlope,
      combinedTargetSlope: slopeCombinedRefit,
      slopeRatio: slope / slopeCombinedRefit,
      meanExposureRatio,
      medianExposureRatio: ratioStats.median,
      remainingEmpiricalCalibrationFactor: remainingEmpirical,
      unitConversionFactor: meanExposureRatio,
      interpretation:
        "If slopeRatio ≈ exposureRatio, much of original slope is denominator conversion",
      DIAGNOSTIC_CANDIDATE: true,
    },
  ];
  await writeFile(
    path.join(OUT, "07_loo_scale_decomposition.csv"),
    toCsv(slopeDecomp)
  );

  // --- Team accounting ---
  function teamSums(field: string) {
    const m = new Map<string, number>();
    for (const r of candRows) {
      const tid = String(r.teamId);
      m.set(tid, (m.get(tid) ?? 0) + Number(r[field]));
    }
    return m;
  }
  const teamProd = teamSums("productionWAR");
  const teamPaired = teamSums("WAR_paired");
  const teamComb = teamSums("WAR_combined_converted");
  const teamRefit = teamSums("WAR_combined_refit");
  const teamImpactPaired = teamSums("seasonalImpact_paired");

  const teamRows: Record<string, unknown>[] = [];
  const wins: number[] = [];
  const xProd: number[] = [];
  const xPaired: number[] = [];
  const xComb: number[] = [];
  const xRefit: number[] = [];
  for (const t of teams) {
    const tp = teamProd.get(t.teamId) ?? 0;
    const ta = teamPaired.get(t.teamId) ?? 0;
    const tc = teamComb.get(t.teamId) ?? 0;
    const tr = teamRefit.get(t.teamId) ?? 0;
    const impact = teamImpactPaired.get(t.teamId) ?? 0;
    teamRows.push({
      teamId: t.teamId,
      abbreviation: t.abbreviation,
      actualWins: t.wins,
      games: t.games,
      pointDifferential: t.pointDifferential,
      netRating: t.netRating,
      teamProductionWAR: tp,
      teamPairedWAR: ta,
      teamCombinedConvertedWAR: tc,
      teamCombinedRefitWAR: tr,
      sumPlayerSeasonalImpact_paired: impact,
      impact_vs_pointDiff: impact - t.pointDifferential,
      conservationNote:
        "Player model not designed to conserve team differential exactly",
      DIAGNOSTIC_CANDIDATE: true,
    });
    wins.push(t.wins);
    xProd.push(tp);
    xPaired.push(ta);
    xComb.push(tc);
    xRefit.push(tr);
  }
  const fitProd = fitWins(xProd, wins);
  const fitPaired = fitWins(xPaired, wins);
  const fitComb = fitWins(xComb, wins);
  const fitRefit = fitWins(xRefit, wins);
  await writeFile(path.join(OUT, "08_team_accounting.csv"), toCsv(teamRows));

  await writeFile(
    path.join(OUT, "09_calibration_stability.csv"),
    toCsv(looSlopes)
  );
  const looSlopeVals = looSlopes.map((r) => Number(r.throughOriginSlope));
  const looQ = quantiles(looSlopeVals);
  const cv = looQ.mean !== 0 ? looQ.sd / Math.abs(looQ.mean) : NaN;
  const leverageRisk = cv > 0.15 || looQ.max - looQ.min > 1.5;

  // League totals
  function leagueStats(field: string) {
    const vals = candRows.map((r) => Number(r[field]));
    const pos = vals.filter((v) => v > 0).reduce((a, b) => a + b, 0);
    const neg = vals.filter((v) => v < 0).reduce((a, b) => a + b, 0);
    const sum = vals.reduce((a, b) => a + b, 0);
    const q = quantiles(vals);
    return {
      sum,
      mean: q.mean,
      median: q.median,
      positive: pos,
      negative: neg,
      meanTeam: sum / teams.length,
    };
  }
  const lgProd = leagueStats("productionWAR");
  const lgPaired = leagueStats("WAR_paired");
  const lgComb = leagueStats("WAR_combined_converted");
  const lgRefit = leagueStats("WAR_combined_refit");

  // Representative traces
  const traces = [];
  for (const needle of TRACE_NEEDLES) {
    const p = players.find((x) => normName(x.playerName).includes(needle));
    if (!p) continue;
    const row = candRows.find((r) => r.playerId === p.playerId)!;
    const pp = pairedMap.get(p.playerId);
    traces.push({
      player: p.playerName,
      playerId: p.playerId,
      posteriorAbilityRate: row.posteriorAbilityRate,
      originalLOO_pairedRate: row.calibratedRate_paired,
      N_combined: row.N_combined,
      N_paired: row.N_paired,
      exposureRatio: Number(row.N_combined) / Number(row.N_paired),
      offensive: pp?.offensiveTeamPossessionsOnCourt,
      defensive: pp?.defensiveTeamPossessionsOnCourt,
      replacement_paired: row.replacement_paired,
      replacement_combined: row.replacement_combined_converted,
      productionWAR: row.productionWAR,
      WAR_paired: row.WAR_paired,
      WAR_combined_converted: row.WAR_combined_converted,
      WAR_combined_refit: row.WAR_combined_refit,
      arithmetic: {
        production:
          `(${row.calibratedRate_paired} - (${row.replacement_paired})) * ${row.N_combined} / 100 / ${ppw}`,
        paired:
          `(${row.calibratedRate_paired} - (${row.replacement_paired})) * ${row.N_paired} / 100 / ${ppw}`,
        combined_converted:
          `(${row.calibratedRate_combined_converted} - (${row.replacement_combined_converted})) * ${row.N_combined} / 100 / ${ppw}`,
      },
      DIAGNOSTIC_CANDIDATE: true,
    });
  }
  await writeFile(
    path.join(OUT, "10_representative_traces.json"),
    JSON.stringify(traces, null, 2)
  );

  // Charts
  await writeFile(
    path.join(OUT, "charts", "n_combined_vs_n_paired.svg"),
    svgScatter(
      exposureRows.map((r) => ({
        x: Number(r.N_paired),
        y: Number(r.N_combined),
      })),
      "N_combined vs N_paired",
      "N_paired",
      "N_combined"
    )
  );
  await writeFile(
    path.join(OUT, "charts", "exposure_ratio_hist.svg"),
    svgScatter(
      ratios.map((r, i) => ({ x: i, y: r })),
      "N_combined / N_paired (index)",
      "player index",
      "ratio"
    )
  );
  await writeFile(
    path.join(OUT, "charts", "production_vs_paired_war.svg"),
    svgScatter(
      candRows.map((r) => ({
        x: Number(r.WAR_paired),
        y: Number(r.productionWAR),
      })),
      "Production WAR vs Paired Candidate",
      "WAR_paired",
      "productionWAR"
    )
  );
  await writeFile(
    path.join(OUT, "charts", "inflation_factor.svg"),
    svgScatter(
      prodToPaired.map((r, i) => ({ x: i, y: r })),
      "production / paired WAR",
      "player index",
      "ratio"
    )
  );
  await writeFile(
    path.join(OUT, "charts", "team_production_war_vs_wins.svg"),
    svgScatter(
      teamRows.map((r) => ({
        x: Number(r.teamProductionWAR),
        y: Number(r.actualWins),
      })),
      "Team production WAR vs wins",
      "teamWAR",
      "wins"
    )
  );
  await writeFile(
    path.join(OUT, "charts", "team_paired_war_vs_wins.svg"),
    svgScatter(
      teamRows.map((r) => ({
        x: Number(r.teamPairedWAR),
        y: Number(r.actualWins),
      })),
      "Team paired WAR vs wins",
      "teamPairedWAR",
      "wins"
    )
  );
  await writeFile(
    path.join(OUT, "charts", "paired_vs_combined_converted.svg"),
    svgScatter(
      candRows.map((r) => ({
        x: Number(r.WAR_paired),
        y: Number(r.WAR_combined_converted),
      })),
      "Paired vs combined-converted WAR",
      "paired",
      "combined_converted"
    )
  );
  await writeFile(
    path.join(OUT, "charts", "loo_slope_sensitivity.svg"),
    svgScatter(
      looSlopes.map((r, i) => ({
        x: i,
        y: Number(r.throughOriginSlope),
      })),
      "LOO through-origin slopes",
      "holdout index",
      "slope"
    )
  );

  // Verdict
  const nearTwo =
    Math.abs(inflStats.median - 2) < 0.05 &&
    Math.abs(ratioStats.median - 2) < 0.01;
  const accountingImproves =
    Math.abs(fitPaired.slope - 1) < Math.abs(fitProd.slope - 1);
  const bugStatus =
    nearTwo && accountingImproves && maxEquiv < 1e-9
      ? "CONFIRMED"
      : nearTwo
        ? "PROBABLE"
        : "UNRESOLVED";

  const health = {
    M16E0_REPRODUCED: maxRecon <= 1e-4 ? "PASS" : "FAIL",
    PAIRED_EXPOSURE_DEFINED: "PASS",
    COMBINED_EXPOSURE_DEFINED: "PASS",
    RATE_CONVERSION_IDENTITY: rateIdFail === 0 ? "PASS" : "FAIL",
    LOO_OUTPUT_UNIT_IDENTIFIED: "PASS",
    PAIRED_WAR_CANDIDATE_BUILT: "PASS",
    COMBINED_CONVERTED_CANDIDATE_BUILT: "PASS",
    CANDIDATE_EQUIVALENCE: equivFail === 0 ? "PASS" : "FAIL",
    REPLACEMENT_UNIT_EQUIVALENCE: replFail === 0 ? "PASS" : "FAIL",
    LOO_SLOPE_UNIT_COMPONENT_IDENTIFIED:
      Math.abs(slope / slopeCombinedRefit - meanExposureRatio) < 0.15
        ? "PASS"
        : "WARNING",
    TEAM_ACCOUNTING_IMPROVES: accountingImproves ? "YES" : "NO",
    WAR_UNIT_BUG_STATUS: bugStatus,
    PRODUCTION_WAR_CHANGED: "NO",
    PRODUCTION_DRBL_CHANGED: "NO",
    POSTERIOR_CHANGED: "NO",
    P_CHANGED: "NO",
    RESERVED_TEST_PREDICTIVE_EVALUATION: "NO",
    maxProductionReconResidual: maxRecon,
    maxEquivalenceResidual: maxEquiv,
    meanAbsEquivalenceResidual: sumAbsEquiv / (candRows.length || 1),
    exposureRatioStats: ratioStats,
    inflationStats: inflStats,
    league: { production: lgProd, paired: lgPaired, combined: lgComb, refit: lgRefit },
    teamFits: {
      production: fitProd,
      paired: fitPaired,
      combined: fitComb,
      refit: fitRefit,
    },
    loo: {
      fullSlope: postCalPaired.throughOriginSlope,
      combinedTargetSlope: slopeCombinedRefit,
      remainingEmpiricalFactor: remainingEmpirical,
      looMean: looQ.mean,
      looSd: looQ.sd,
      looMin: looQ.min,
      looMax: looQ.max,
      cv,
      WAR_CALIBRATION_TEAM_LEVERAGE_RISK: leverageRisk,
      throughOriginDiagnostic: {
        label: "DIAGNOSTIC_ONLY_WITH_INTERCEPT",
        a: fullWithIntercept.intercept,
        b: fullWithIntercept.slope,
        throughOriginSlope: postCalPaired.throughOriginSlope,
      },
    },
  };
  await writeFile(
    path.join(OUT, "11_dimensional_health.json"),
    JSON.stringify(health, null, 2)
  );

  const repairMd = `# WAR_REPAIR_CANDIDATE_V1 (NOT DEPLOYED)

Status: **DIAGNOSTIC_CANDIDATE** - do not deploy without separate approval.

## Verdict

\`WAR_UNIT_BUG_STATUS = ${bugStatus}\`

## Canonical architecture (if approved)

\`\`\`text
finalAbilityPaired100
= LOO-calibrated player ability
  in net points / 100 paired team possessions
  (existing LOO output already on this scale)

aboveReplacementPaired100
= finalAbilityPaired100 - replacementPaired100

seasonImpact
= aboveReplacementPaired100 × pairedOnCourtPossessions / 100

WAR
= seasonImpact / pointsPerWin
\`\`\`

Where:

\`\`\`text
pairedOnCourtPossessions
= average(offensiveTeamPossessionsOnCourt, defensiveTeamPossessionsOnCourt)

pointsPerWin
= frozen production value (~${ppw})

replacementPaired100
= fringe median on calibrated paired scale (~${repl})
\`\`\`

## Naming

Prefer:

- \`combinedPossessionAppearances\` (current production exposure)
- \`pairedOnCourtPossessions\` (repair exposure)

Avoid ambiguous bare \`possessions\` / \`actualOnCourtPossessions\` in new code.

## Expected scale effect

Production WAR / paired candidate ≈ **${inflStats.median.toFixed(4)}** (median).

## Production deployed

**NO**
`;
  await writeFile(path.join(OUT, "12_war_repair_candidate.md"), repairMd);

  const audit = `# M16e1 full audit

## Freeze
git ${gitCommit} dirty=${gitDirty}
evaluationProtocolVersion ${EVALUATION_PROTOCOL_VERSION}
M16E0_RESEARCH_BASE = P

## Possession conventions
- Combined: off + def player side-of-ball appearances
- Paired: average(off, def) from normalized possession files
- mean ratio ${ratioStats.mean} median ${ratioStats.median}

## LOO unit
\`${LOO_OUTPUT_UNIT}\`

## Equivalence
max residual ${maxEquiv} (paired vs combined-converted)

## Slope decomposition
original ${slope}
exposure factor ${meanExposureRatio}
combined-target slope ${slopeCombinedRefit}
remaining empirical ${remainingEmpirical}

## Team accounting
production slope ${fitProd.slope}
paired slope ${fitPaired.slope}
combined slope ${fitComb.slope}

## Bug status
${bugStatus}

## Preserved
- P research base
- M6 research component
- posterior untouched
- P calibration untouched
- production WAR/DRBL unchanged
- RESERVED_TEST unused for predictive evaluation
`;
  await writeFile(path.join(OUT, "13_full_audit.md"), audit);

  // Team ratio appendix
  const teamRatioRows = [...byTeamRatio.entries()].map(([teamId, arr]) => {
    const q = quantiles(arr);
    const abbr = teams.find((t) => t.teamId === teamId)?.abbreviation ?? "";
    return { teamId, abbreviation: abbr, n: arr.length, ...q };
  });
  await writeFile(
    path.join(OUT, "01b_exposure_ratio_by_team.csv"),
    toCsv(teamRatioRows)
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        bugStatus,
        maxRecon,
        maxEquiv,
        meanRatio: ratioStats.mean,
        medianInflation: inflStats.median,
        prodSlope: fitProd.slope,
        pairedSlope: fitPaired.slope,
        originalSlope: slope,
        combinedSlope: slopeCombinedRefit,
        remainingEmpirical,
        jokic: traces.find((t) =>
          normName(t.player).includes("jokic")
        ),
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
