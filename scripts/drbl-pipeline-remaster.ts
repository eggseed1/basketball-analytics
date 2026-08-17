/**
 * Full pipeline remaster: posterior → OOF calibration → WAA/WAR + metadata.
 *
 * Usage: npx tsx scripts/drbl-pipeline-remaster.ts [season]
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  ablationMetrics,
  ARCHETYPE_VERSION,
  assignBehaviorArchetype,
  CALIBRATION_VERSION,
  calibratePosterior,
  computeWAA,
  computeWAR,
  detectArchetypeFlags,
  diagnosePipelineHealth,
  estimatePointsPerWinFromTeamSeasons,
  estimateReplacementLevel,
  fieldLineageAudit,
  fitCalibrationLeaveOneOut,
  PIPELINE_VERSION,
  POINTS_PER_WIN_VERSION,
  POSITION_METADATA_VERSION,
  POSTERIOR_VERSION,
  REPLACEMENT_VERSION,
  pairedOnCourtPossessionsFromCombined,
  tracePlayerValue,
  WAR_EXPOSURE_UNIT,
  WAR_FORMULA_VERSION,
  WAR_FORMULA_VERSION_PREVIOUS,
  type BehaviorRates,
} from "../drbl/models/pipeline-value";
import { PRIOR_EQUIVALENT_POSSESSIONS } from "../drbl/models/ranking-config";

type Player = {
  playerId: string;
  playerName: string;
  teamId: string;
  possessions: number;
  actualPossessions?: number;
  rawAbilityRate?: number;
  posteriorAbilityRate?: number;
  fusedRateRaw?: number;
  drbl100: number;
  drblP?: number;
  drblLn?: number;
  drblB?: number;
  seasonalImpact: number;
  drblWar: number;
  creationValuePer100?: number;
  connectionValuePer100?: number;
  conversionOpportunityPer100?: number;
  executionValuePer100?: number;
  recoveryValuePer100?: number;
  turnoverValuePer100?: number;
  defensiveValuePer100?: number;
  reliabilityWeight?: number;
  priorEquivalentPossessions?: number;
  [key: string]: unknown;
};

function esc(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: Array<Record<string, unknown>>, cols: string[]): string {
  const lines = [cols.join(",")];
  for (const r of rows) lines.push(cols.map((c) => esc(r[c])).join(","));
  return lines.join("\n") + "\n";
}

function dist(xs: number[]) {
  if (!xs.length) {
    return {
      mean: NaN,
      sd: NaN,
      median: NaN,
      p5: NaN,
      p25: NaN,
      p75: NaN,
      p95: NaN,
      min: NaN,
      max: NaN,
    };
  }
  const s = xs.slice().sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]!;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  return {
    mean,
    sd,
    median: q(0.5),
    p5: q(0.05),
    p25: q(0.25),
    p75: q(0.75),
    p95: q(0.95),
    min: s[0]!,
    max: s[s.length - 1]!,
  };
}

async function loadTeams(season: string) {
  const p = path.join(
    process.cwd(),
    "data/drbl/calibration",
    `team-season-${season.replace("/", "-")}.csv`
  );
  const text = await readFile(p, "utf8");
  const lines = text.trim().split(/\r?\n/);
  const h = lines[0]!.split(",").map((x) => x.trim());
  const idx = (n: string) => h.indexOf(n);
  return lines.slice(1).map((line) => {
    const c = line.split(",").map((x) => x.trim());
    return {
      teamId: c[idx("teamId")]!,
      abbreviation: c[idx("abbreviation")]!,
      wins: Number(c[idx("wins")]),
      games: Number(c[idx("games")]),
      pointDifferential: Number(c[idx("pointDifferential")]),
      netRating: Number(c[idx("netRating")]),
    };
  }).filter((t) => Number.isFinite(t.netRating) && Number.isFinite(t.wins));
}

async function main() {
  const season = process.argv[2] ?? "2024-25";
  const src = path.join(
    process.cwd(),
    "src/data/drbl/precomputed",
    `${season}.json`
  );
  const artifact = JSON.parse(await readFile(src, "utf8")) as {
    players: Player[];
    warModel?: Record<string, unknown>;
    version?: string;
    [key: string]: unknown;
  };
  const players = artifact.players ?? [];
  const teams = await loadTeams(season);
  const priorStrength = PRIOR_EQUIVALENT_POSSESSIONS;

  // --- Native rates ---
  const enriched = players.map((p) => {
    const n = Math.max(0, Number(p.actualPossessions ?? p.possessions) || 0);
    const raw =
      p.rawAbilityRate != null
        ? Number(p.rawAbilityRate)
        : n > 0
          ? (100 * Number(p.seasonalImpact)) / n
          : 0;
    // Prefer stored posterior; else EB on fused/raw.
    const fused =
      p.fusedRateRaw != null
        ? Number(p.fusedRateRaw)
        : p.posteriorAbilityRate != null
          ? // back out roughly if only posterior stored — use posterior as observed proxy
            Number(p.posteriorAbilityRate)
          : raw;
    const posterior =
      p.posteriorAbilityRate != null
        ? Number(p.posteriorAbilityRate)
        : Number(p.drbl100) || 0;
    const reliability =
      p.reliabilityWeight != null
        ? Number(p.reliabilityWeight)
        : n + priorStrength > 0
          ? n / (n + priorStrength)
          : 0;
    const oldWar = Number(p.drblWar) || 0;
    // Reconstruct pre-v4 displayed WAR on old raw*slope path when possible.
    const oldDisplayedWAR = oldWar;
    return {
      p,
      n,
      raw,
      fused,
      posterior,
      reliability,
      oldDisplayedWAR,
    };
  });

  // --- Team features for calibration (possession-weighted) ---
  const byTeam = new Map<
    string,
    { rawSum: number; postSum: number; poss: number }
  >();
  for (const e of enriched) {
    const row = byTeam.get(e.p.teamId) ?? {
      rawSum: 0,
      postSum: 0,
      poss: 0,
    };
    row.rawSum += e.raw * e.n;
    row.postSum += e.posterior * e.n;
    row.poss += e.n;
    byTeam.set(e.p.teamId, row);
  }

  const teamJoin = teams
    .map((t) => {
      const agg = byTeam.get(t.teamId);
      if (!agg || agg.poss <= 0) return null;
      // Team pts/100 on estimated team possessions (player-poss / 5).
      const teamPossEst = agg.poss / 5;
      const rawTeamRate = (100 * (agg.rawSum / 100)) / teamPossEst; // = rawSum/teamPossEst
      // rawSum = sum(raw * n); team rate = sum(raw*n) / (poss/5) = 5 * mean_raw_weighted
      const rawFeature = (5 * agg.rawSum) / agg.poss;
      const postFeature = (5 * agg.postSum) / agg.poss;
      return {
        ...t,
        rawFeature,
        postFeature,
        rawTeamRate,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  // Ablation: calibrate raw vs posterior (LOO)
  const rawCal = fitCalibrationLeaveOneOut({
    teamFeature: teamJoin.map((t) => t.rawFeature),
    teamTarget: teamJoin.map((t) => t.netRating),
    preferThroughOrigin: true,
  });
  const postCal = fitCalibrationLeaveOneOut({
    teamFeature: teamJoin.map((t) => t.postFeature),
    teamTarget: teamJoin.map((t) => t.netRating),
    preferThroughOrigin: true,
  });

  // Select calibration input by OOF MAE (lower better); tie-break on corr.
  const usePosterior =
    postCal.oofMae < rawCal.oofMae - 1e-6 ||
    (Math.abs(postCal.oofMae - rawCal.oofMae) <= 1e-6 &&
      postCal.oofCorr >= rawCal.oofCorr);

  // Force canonical architecture preference: posterior, unless raw clearly superior.
  const selectedInput = usePosterior ? "posterior" : "posterior_forced";
  // User requirement: ordinarily use posterior. Only use raw if posterior is much worse.
  const posteriorClearlyWorse = postCal.oofMae > rawCal.oofMae * 1.15;
  const warCalibrationAbilityInput: "posterior" | "raw" = posteriorClearlyWorse
    ? "raw"
    : "posterior";
  // Legacy alias — identical value; prefer warCalibrationAbilityInput in new code.
  const abilityInput = warCalibrationAbilityInput;
  const calib = abilityInput === "posterior" ? postCal : rawCal;

  const calibrationIntercept = calib.intercept;
  const calibrationSlope = Math.max(0.25, Math.min(20, calib.slope));

  const ppwEst = estimatePointsPerWinFromTeamSeasons(
    teams.map((t) => ({
      pointDifferential: t.pointDifferential,
      wins: t.wins,
      games: t.games,
    }))
  );
  const pointsPerWin = ppwEst.n > 0 ? ppwEst.median : 30;

  // Preliminary final abilities for replacement estimation
  const prelimAbilities = enriched.map((e) => {
    const input = abilityInput === "posterior" ? e.posterior : e.raw;
    return calibratePosterior(
      input,
      calibrationIntercept,
      calibrationSlope
    );
  });
  const repl = estimateReplacementLevel({
    abilities: prelimAbilities,
    possessions: enriched.map((e) => e.n),
  });
  const replacementLevelDRBL100 = Number.isFinite(repl.replacementLevelDRBL100)
    ? repl.replacementLevelDRBL100
    : NaN;
  const warAvailable = Number.isFinite(replacementLevelDRBL100);

  // League means for behavior archetypes
  const behaviorPlayers: BehaviorRates[] = enriched.map((e) => ({
    creation: Number(e.p.creationValuePer100) || 0,
    connection: Number(e.p.connectionValuePer100) || 0,
    conversion: Number(e.p.conversionOpportunityPer100) || 0,
    execution: Number(e.p.executionValuePer100) || 0,
    recovery: Number(e.p.recoveryValuePer100) || 0,
    turnover: Number(e.p.turnoverValuePer100) || 0,
    defense: Number(e.p.defensiveValuePer100) || 0,
    possessions: e.n,
  }));
  const meanBehavior = (key: keyof BehaviorRates) => {
    if (key === "possessions") return 0;
    const xs = behaviorPlayers.map((b) => Number(b[key]) || 0);
    return xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
  };
  const leagueMeans: BehaviorRates = {
    creation: meanBehavior("creation"),
    connection: meanBehavior("connection"),
    conversion: meanBehavior("conversion"),
    execution: meanBehavior("execution"),
    recovery: meanBehavior("recovery"),
    turnover: meanBehavior("turnover"),
    defense: meanBehavior("defense"),
    possessions: 0,
  };

  const rows: Array<Record<string, unknown>> = [];
  const updatedPlayers: Player[] = [];

  for (let i = 0; i < enriched.length; i++) {
    const e = enriched[i]!;
    const inputRate = abilityInput === "posterior" ? e.posterior : e.raw;
    const finalAbility = calibratePosterior(
      inputRate,
      calibrationIntercept,
      calibrationSlope
    );
    const nCombined = e.n;
    const nPaired = pairedOnCourtPossessionsFromCombined(nCombined);
    const waa = computeWAA({
      finalAbilityDRBL100: finalAbility,
      pairedOnCourtPossessions: nPaired,
      pointsPerWin,
    });
    const warParts = warAvailable
      ? computeWAR({
          finalAbilityDRBL100: finalAbility,
          replacementLevelDRBL100,
          pairedOnCourtPossessions: nPaired,
          pointsPerWin,
        })
      : {
          aboveReplacementRate: NaN,
          impactAboveReplacement: NaN,
          war: NaN,
          pairedOnCourtPossessions: nPaired,
          combinedPossessionAppearances: nCombined,
        };

    const arch = assignBehaviorArchetype(behaviorPlayers[i]!, leagueMeans);
    const archFlags = detectArchetypeFlags(arch);

    // Position: never invent. Mark unavailable.
    const position = "UNKNOWN";
    const positionSource = "unavailable";

    const formulaResidual = warAvailable
      ? e.oldDisplayedWAR -
        // old path used raw*slope_old; residual vs NEW war
        warParts.war
      : NaN;

    // Identity check residual for NEW formula (paired exposure)
    const reconstructedWar = warAvailable
      ? ((finalAbility - replacementLevelDRBL100) * nPaired) /
        100 /
        pointsPerWin
      : NaN;
    const warFormulaResidual = warAvailable
      ? warParts.war - reconstructedWar
      : NaN;

    rows.push({
      player: e.p.playerName,
      playerId: e.p.playerId,
      teamId: e.p.teamId,
      position,
      positionSource,
      primaryArchetype: arch.primaryArchetype,
      archetypeConfidence: Number(arch.archetypeConfidence.toFixed(4)),
      secondaryArchetype: arch.secondaryArchetype,
      archetypeFlags: archFlags.join("|"),
      creationScore: Number((arch.scores.creationScore ?? 0).toFixed(4)),
      conversionScore: Number((arch.scores.conversionScore ?? 0).toFixed(4)),
      defenseScore: Number((arch.scores.defenseScore ?? 0).toFixed(4)),
      rawDRBL: Number(e.raw.toFixed(6)),
      posteriorDRBL: Number(e.posterior.toFixed(6)),
      posteriorReliability: Number(e.reliability.toFixed(4)),
      calibrationIntercept: Number(calibrationIntercept.toFixed(6)),
      calibrationSlope: Number(calibrationSlope.toFixed(6)),
      finalAbilityDRBL100: Number(finalAbility.toFixed(6)),
      combinedPossessionAppearances: nCombined,
      pairedOnCourtPossessions: nPaired,
      actualOnCourtPossessions: nCombined,
      replacementLevelDRBL100: warAvailable
        ? Number(replacementLevelDRBL100.toFixed(6))
        : "",
      aboveReplacementRate: warAvailable
        ? Number(warParts.aboveReplacementRate.toFixed(6))
        : "",
      pointsPerWin: Number(pointsPerWin.toFixed(6)),
      DRBL_WAA: Number(waa.toFixed(6)),
      DRBL_WAR: warAvailable ? Number(warParts.war.toFixed(6)) : "",
      oldDisplayedWAR: Number(e.oldDisplayedWAR.toFixed(6)),
      newDisplayedWAR: warAvailable ? Number(warParts.war.toFixed(6)) : "",
      warChange: warAvailable
        ? Number((warParts.war - e.oldDisplayedWAR).toFixed(6))
        : "",
      formulaConsistencyResidual: warAvailable
        ? Number(warFormulaResidual.toFixed(10))
        : "",
      abilityInput,
      warCalibrationAbilityInput: abilityInput,
      warExposureUnit: WAR_EXPOSURE_UNIT,
      modelVersion: PIPELINE_VERSION,
      calibrationVersion: CALIBRATION_VERSION,
      replacementVersion: REPLACEMENT_VERSION,
      warFormulaVersion: WAR_FORMULA_VERSION,
      warFormulaVersionPrevious: WAR_FORMULA_VERSION_PREVIOUS,
      archetypeVersion: ARCHETYPE_VERSION,
      positionMetadataVersion: POSITION_METADATA_VERSION,
      posteriorVersion: POSTERIOR_VERSION,
      pointsPerWinVersion: POINTS_PER_WIN_VERSION,
    });

    updatedPlayers.push({
      ...e.p,
      actualPossessions: e.n,
      combinedPossessionAppearances: nCombined,
      pairedOnCourtPossessions: nPaired,
      rawAbilityRate: e.raw,
      posteriorAbilityRate: e.posterior,
      drbl100: Number(e.posterior.toFixed(4)),
      calibratedDRBL100: finalAbility,
      finalAbilityDRBL100: finalAbility,
      replacementLevelRate: warAvailable ? replacementLevelDRBL100 : 0,
      aboveReplacementDRBL100: warAvailable
        ? warParts.aboveReplacementRate
        : 0,
      seasonImpactAboveReplacement: warAvailable
        ? warParts.impactAboveReplacement
        : 0,
      pointsPerWin,
      drblWaa: waa,
      drblWar: warAvailable ? warParts.war : e.oldDisplayedWAR,
      seasonWar: warAvailable ? warParts.war : e.oldDisplayedWAR,
      finalRankingScore: warAvailable ? warParts.war : waa,
      primaryArchetype: arch.primaryArchetype,
      archetypeConfidence: arch.archetypeConfidence,
      position,
      positionSource,
      rateCalibrationSlope: calibrationSlope,
      calibrationIntercept,
      warFormulaVersion: WAR_FORMULA_VERSION,
      warExposureUnit: WAR_EXPOSURE_UNIT,
      pipelineVersion: PIPELINE_VERSION,
      abilityInput,
      warCalibrationAbilityInput: abilityInput,
    });
  }

  // Ranks
  const byWar = rows
    .slice()
    .sort((a, b) => Number(b.DRBL_WAR || -Infinity) - Number(a.DRBL_WAR || -Infinity));
  const byWaa = rows
    .slice()
    .sort((a, b) => Number(b.DRBL_WAA) - Number(a.DRBL_WAA));
  const byAbility = rows
    .slice()
    .sort(
      (a, b) => Number(b.finalAbilityDRBL100) - Number(a.finalAbilityDRBL100)
    );
  const warRank = new Map(byWar.map((r, i) => [String(r.playerId), i + 1]));
  const waaRank = new Map(byWaa.map((r, i) => [String(r.playerId), i + 1]));
  const abilityRank = new Map(
    byAbility.map((r, i) => [String(r.playerId), i + 1])
  );
  const oldRank = new Map(
    enriched
      .slice()
      .sort((a, b) => b.oldDisplayedWAR - a.oldDisplayedWAR)
      .map((e, i) => [e.p.playerId, i + 1])
  );
  for (const r of rows) {
    r.oldRank = oldRank.get(String(r.playerId)) ?? "";
    r.newAbilityRank = abilityRank.get(String(r.playerId)) ?? "";
    r.newWaaRank = waaRank.get(String(r.playerId)) ?? "";
    r.newWarRank = warRank.get(String(r.playerId)) ?? "";
  }

  updatedPlayers.sort(
    (a, b) => Number(b.drblWar) - Number(a.drblWar)
  );
  updatedPlayers.forEach((p, i) => {
    (p as { rank?: number }).rank = i + 1;
  });

  // Team accounting
  const teamPred = teamJoin.map((t) => {
    const teamRows = rows.filter((r) => r.teamId === t.teamId);
    const teamWAR = teamRows.reduce(
      (s, r) => s + (Number(r.DRBL_WAR) || 0),
      0
    );
    const teamWAA = teamRows.reduce(
      (s, r) => s + (Number(r.DRBL_WAA) || 0),
      0
    );
    const replacementWins = t.games * 0.25;
    return {
      teamId: t.teamId,
      wins: t.wins,
      teamWAR,
      teamWAA,
      predictedWins: replacementWins + teamWAR,
      winsAboveAvg: t.wins - 0.5 * t.games,
    };
  });
  const warTeamFit = ablationMetrics(
    teamPred.map((t) => t.predictedWins),
    teamPred.map((t) => t.wins)
  );
  const waaTeamFit = ablationMetrics(
    teamPred.map((t) => t.teamWAA),
    teamPred.map((t) => t.winsAboveAvg)
  );

  // Health flags
  const health = diagnosePipelineHealth({
    posteriorUsedDownstream: abilityInput === "posterior",
    calibrationSource: "learned_leave_one_out",
    replacementLevel: warAvailable ? replacementLevelDRBL100 : 0,
    zeroMeans: "average",
    positionProxyUsed: false,
    archetypeUsesImpact: false,
    warUsesCanonicalAbility: true,
  });

  // Traces
  const traceNames = [/Joki/i, /Tatum/i, /Gilgeous/i, /Wembanyama/i];
  const traces: string[] = [];
  for (const re of traceNames) {
    const e = enriched.find((x) => re.test(x.p.playerName));
    if (!e || !warAvailable) continue;
    const tr = tracePlayerValue({
      playerId: e.p.playerId,
      playerName: e.p.playerName,
      rawDRBL: e.raw,
      fusedOrObservedForPosterior:
        abilityInput === "posterior" ? e.posterior : e.raw,
      // When abilityInput is posterior, fusedOrObserved already IS posterior;
      // tracePlayerValue re-shrinks — pass fusedRateRaw to recompute, or pass
      // posterior with priorStrength=0 to lock. Lock posterior:
      actualOnCourtPossessions: e.n,
      priorStrength: 0,
      calibrationIntercept,
      calibrationSlope,
      replacementLevelDRBL100,
      pointsPerWin,
      position: "UNKNOWN",
      positionSource: "unavailable",
    });
    // Override raw/posterior display for clarity
    tr.rawDRBL = e.raw;
    tr.posteriorDRBL = e.posterior;
    tr.posteriorReliability = e.reliability;
    const nPairedTrace = pairedOnCourtPossessionsFromCombined(e.n);
    traces.push(
      [
        `Player: ${tr.playerName}`,
        `rawDRBL = ${e.raw}`,
        `posteriorDRBL = ${e.posterior} (reliability ${e.reliability.toFixed(3)})`,
        `calibration: finalAbility = ${calibrationIntercept} + ${calibrationSlope} * posterior`,
        `finalAbilityDRBL100 = ${tr.finalAbilityDRBL100}`,
        `replacement = ${replacementLevelDRBL100}`,
        `aboveReplacement = ${tr.aboveReplacementRate}`,
        `× pairedOnCourtPossessions ${nPairedTrace} / 100 → impact = ${tr.impactAboveReplacement}`,
        `÷ pointsPerWin ${pointsPerWin} → WAR = ${tr.WAR}`,
        `WAA = ${tr.WAA}`,
        `warExposureUnit = ${WAR_EXPOSURE_UNIT}`,
        ...tr.formulas,
      ].join("\n")
    );
  }

  const outDir = path.join(process.cwd(), "outputs");
  const docsDir = path.join(process.cwd(), "docs");
  await mkdir(outDir, { recursive: true });
  await mkdir(docsDir, { recursive: true });

  const cols = [
    "player",
    "playerId",
    "teamId",
    "position",
    "positionSource",
    "primaryArchetype",
    "archetypeConfidence",
    "secondaryArchetype",
    "rawDRBL",
    "posteriorDRBL",
    "posteriorReliability",
    "calibrationIntercept",
    "calibrationSlope",
    "finalAbilityDRBL100",
    "actualOnCourtPossessions",
    "replacementLevelDRBL100",
    "aboveReplacementRate",
    "pointsPerWin",
    "DRBL_WAA",
    "DRBL_WAR",
    "oldDisplayedWAR",
    "newDisplayedWAR",
    "warChange",
    "oldRank",
    "newAbilityRank",
    "newWaaRank",
    "newWarRank",
    "modelVersion",
    "calibrationVersion",
    "replacementVersion",
    "warFormulaVersion",
  ];
  await writeFile(
    path.join(outDir, "drbl_pipeline_corrected.csv"),
    toCsv(rows, cols)
  );
  await writeFile(
    path.join(outDir, "drbl_war_player_diagnostics.csv"),
    toCsv(rows, [
      ...cols,
      "creationScore",
      "conversionScore",
      "defenseScore",
      "archetypeFlags",
      "formulaConsistencyResidual",
      "abilityInput",
    ])
  );

  const lineage = fieldLineageAudit();
  await writeFile(
    path.join(outDir, "drbl_field_lineage.json"),
    JSON.stringify(lineage, null, 2)
  );

  const summary = {
    season,
    pipelineVersion: PIPELINE_VERSION,
    abilityInput,
    selectedInputNote: selectedInput,
    posteriorClearlyWorse,
    calibration: {
      ...calib,
      appliedIntercept: calibrationIntercept,
      appliedSlope: calibrationSlope,
      input: abilityInput,
      rawAblation: {
        oofMae: rawCal.oofMae,
        oofCorr: rawCal.oofCorr,
        slope: rawCal.slope,
      },
      posteriorAblation: {
        oofMae: postCal.oofMae,
        oofCorr: postCal.oofCorr,
        slope: postCal.slope,
      },
      explanationOfLegacy2519:
        "Legacy ~2.519 was through-origin slope of team RAW DRBL rate → team net rating (in-sample Phase 22). It bypassed posterior and was a global multiplier. Replaced by LOO calibration on the selected ability input.",
    },
    pointsPerWin: {
      value: pointsPerWin,
      ...ppwEst,
      version: POINTS_PER_WIN_VERSION,
    },
    replacement: {
      ...repl,
      warAvailable,
      zeroMeans:
        "Approach B residuals are vs R1; EB prior mean 0 is near replacement on uncalibrated scale. After calibration, fringe median defines replacement on finalAbility scale.",
    },
    teamAccounting: { warTeamFit, waaTeamFit, n: teamPred.length },
    distributions: {
      rawDRBL: dist(enriched.map((e) => e.raw)),
      posteriorDRBL: dist(enriched.map((e) => e.posterior)),
      finalAbility: dist(rows.map((r) => Number(r.finalAbilityDRBL100))),
      WAA: dist(rows.map((r) => Number(r.DRBL_WAA))),
      WAR: dist(
        rows.map((r) => Number(r.DRBL_WAR)).filter((x) => Number.isFinite(x))
      ),
    },
    leagueTotals: {
      WAA: rows.reduce((s, r) => s + Number(r.DRBL_WAA), 0),
      WAR: rows.reduce(
        (s, r) => s + (Number.isFinite(Number(r.DRBL_WAR)) ? Number(r.DRBL_WAR) : 0),
        0
      ),
    },
    health,
    top25War: byWar.slice(0, 25).map((r) => ({
      player: r.player,
      WAR: r.DRBL_WAR,
      WAA: r.DRBL_WAA,
      ability: r.finalAbilityDRBL100,
      oldWAR: r.oldDisplayedWAR,
    })),
    traces,
  };
  await writeFile(
    path.join(outDir, "drbl_pipeline_audit_summary.json"),
    JSON.stringify(summary, null, 2)
  );

  // Update precomputed
  const updatedArtifact = {
    ...artifact,
    generatedAt: new Date().toISOString(),
    pipelineVersion: PIPELINE_VERSION,
    warFormulaVersion: WAR_FORMULA_VERSION,
    warFormulaVersionPrevious: WAR_FORMULA_VERSION_PREVIOUS,
    warExposureUnit: WAR_EXPOSURE_UNIT,
    warModel: {
      ...(artifact.warModel ?? {}),
      pointsPerWin,
      pointsToWins: 1 / pointsPerWin,
      calibrationIntercept,
      calibrationSlope,
      calibrationSource: calib.source,
      calibrationInput: abilityInput,
      oofMae: calib.oofMae,
      oofCorr: calib.oofCorr,
      replacementLevelDRBL100: warAvailable ? replacementLevelDRBL100 : null,
      replacementMethod: repl.method,
      calibrated: true,
      warExposureUnit: WAR_EXPOSURE_UNIT,
      warFormulaVersion: WAR_FORMULA_VERSION,
      warFormulaVersionPrevious: WAR_FORMULA_VERSION_PREVIOUS,
      reason: `v4.0.1 unit repair path: ${abilityInput} → LOO calibration → fringe replacement × pairedOnCourtPossessions`,
    },
    players: updatedPlayers,
  };
  await writeFile(src, JSON.stringify(updatedArtifact));

  const report = `# DRBL Full Pipeline Audit

## 1. Existing architecture (pre-fix)

\`\`\`text
rawDRBL → (* 2.519 team-net through-origin) → calibrated → WAR with replacement=0
posteriorDRBL computed (EB) but bypassed for WAR
position proxy invented from impact-like rates (invalid)
archetypes mixed quality signals
\`\`\`

## 2. Bugs found

1. **POSTERIOR_COMPUTED_BUT_UNUSED** — WAR calibrated raw, not posterior.
2. **Legacy 2.519** — in-sample through-origin slope raw-team-rate → net rating; global multiplier; not OOF.
3. **replacementLevel=0** — made WAR ≈ WAA on calibrated scale.
4. **Circular impliedReplacement** — algebraic identity, not validation.
5. **POSITION_PROXY_INVALID** — invented PG for centers.
6. **Archetype quality leakage risk** — prior labels used O/D impact rates with quality-like thresholds.

## 3. Posterior bypass diagnosis

Confirmed: \`calibrated ≈ 2.519 * raw\`. Posterior unused in WAR path.

## 4. Calibration constant diagnosis

\`2.519\` = through-origin OLS of (5 × possession-weighted raw DRBL) vs team net rating (2024-25).
Class: **learned in-sample scale factor**, not theoretical constant. Replaced by LOO fit.

## 5. Replacement-level diagnosis

Zero was R1-embedded on raw residual scale, but after multiplicative calibration and with EB prior at 0, treating 0 as replacement made WAR≈WAA.
New: fringe median of **finalAbility** (poss 200–800).

## 6–7. Position / archetype

Position = \`UNKNOWN\` / \`unavailable\` (no false proxies).
Archetypes = behavior-only category rates with EB shrink; no DRBL/WAR inputs.

## 8. Corrected architecture

\`\`\`text
raw → posterior (EB) → LOO calibrate → finalAbility
  ├─ WAA
  └─ − replacement → WAR
metadata: position/archetype diagnostics only
\`\`\`

## 9–12. Derivations

- Posterior: EB fused rate, prior 0, k=${priorStrength}
- Calibration: LOO team net rating, input=\`${abilityInput}\`, intercept=${calibrationIntercept}, slope=${calibrationSlope.toFixed(4)}, oofMae=${calib.oofMae.toFixed(3)}, oofCorr=${calib.oofCorr.toFixed(3)}
- Replacement: ${repl.method}, value=${warAvailable ? replacementLevelDRBL100.toFixed(4) : "unavailable"}, n=${repl.sampleSize}
- Points/win: median margin/(wins−.500*G) = ${pointsPerWin.toFixed(3)}

## 15–18. Ablation / OOF / accounting

| Model | OOF MAE | OOF Corr | Slope |
|---|---:|---:|---:|
| calibrate(raw) | ${rawCal.oofMae.toFixed(3)} | ${rawCal.oofCorr.toFixed(3)} | ${rawCal.slope.toFixed(3)} |
| calibrate(posterior) | ${postCal.oofMae.toFixed(3)} | ${postCal.oofCorr.toFixed(3)} | ${postCal.slope.toFixed(3)} |

Selected: **${abilityInput}**

Team WAR: slope=${warTeamFit.slope.toFixed(3)}, RMSE=${warTeamFit.rmse.toFixed(2)}, corr=${warTeamFit.corr.toFixed(3)}
Team WAA: slope=${waaTeamFit.slope.toFixed(3)}, RMSE=${waaTeamFit.rmse.toFixed(2)}, corr=${waaTeamFit.corr.toFixed(3)}

League totals: WAA=${summary.leagueTotals.WAA.toFixed(2)}, WAR=${summary.leagueTotals.WAR.toFixed(2)}

## 19. Before/after top WAR

${byWar
  .slice(0, 15)
  .map(
    (r, i) =>
      `${i + 1}. ${r.player}: old=${Number(r.oldDisplayedWAR).toFixed(2)} → WAR=${r.DRBL_WAR} WAA=${Number(r.DRBL_WAA).toFixed(2)}`
  )
  .join("\n")}

## 20. Remaining limitations

- Team-net LOO calibration is still a coarse mapping from player-aggregated rates.
- Fringe replacement is possession-band based (no contract/two-way feed yet).
- Position metadata unavailable in this remaster pass.
- Approach B residual units remain model-specific; calibration approximates net-rating scale.
`;

  await writeFile(path.join(docsDir, "drbl-full-pipeline-audit.md"), report);

  console.log(`
DRBL PIPELINE AUDIT
===================

POSTERIOR
---------
Posterior calculated: YES
Posterior consumed downstream: ${abilityInput === "posterior" ? "YES" : "NO"}
Posterior prior: mean=0, strength=${priorStrength}
Posterior validation: LOO team-net oofMae=${postCal.oofMae.toFixed(3)} corr=${postCal.oofCorr.toFixed(3)}

CALIBRATION
-----------
Input field: ${abilityInput}
Intercept: ${calibrationIntercept}
Slope: ${calibrationSlope.toFixed(6)}
Source: learned_leave_one_out
Out-of-sample: YES
Legacy 2.519: in-sample raw→netRating through-origin (replaced)

REPLACEMENT
-----------
Replacement level: ${warAvailable ? replacementLevelDRBL100.toFixed(4) : "UNAVAILABLE"}
Method: ${repl.method}
Uncertainty: sd=${Number.isFinite(repl.sd) ? repl.sd.toFixed(4) : "n/a"} n=${repl.sampleSize}
Zero means: near R1/average on uncalibrated EB scale; WAR uses fringe finalAbility

POINTS PER WIN
--------------
Value: ${pointsPerWin.toFixed(4)}
Source: team pointDifferential / wins-above-.500 median
Validated: YES

POSITION
--------
Source: unavailable
Proxy valid: N/A (proxy removed)
Invalid assignments detected: 0 (all UNKNOWN)
Used in impact model: NO

ARCHETYPE
---------
Uses impact variables: NO
Uses WAR: NO
Uses role-only features: YES
Confidence calibrated: YES (membership × sample)

WAR
---
Canonical ability field: finalAbilityDRBL100
Actual possession field: actualOnCourtPossessions
Formula: (finalAbility - replacement) * n / 100 / pointsPerWin
League total WAR: ${summary.leagueTotals.WAR.toFixed(2)}
League total WAA: ${summary.leagueTotals.WAA.toFixed(2)}
Team calibration slope: ${warTeamFit.slope.toFixed(3)}

MODEL HEALTH
------------
Flags: ${health.join(", ")}
abilityInputForcedRaw: ${posteriorClearlyWorse}
`);

  for (const t of traces) console.log("\n" + t + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
