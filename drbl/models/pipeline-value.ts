/**
 * Canonical DRBL value pipeline (v4).
 *
 * Architecture:
 *   rawDRBL → posteriorDRBL → OOF-calibrated finalAbilityDRBL100
 *     ├─ WAA  = finalAbility * poss / 100 / pointsPerWin
 *     └─ WAR  = (finalAbility - replacement) * poss / 100 / pointsPerWin
 *
 * Position / archetype are descriptive metadata only — never inputs to value.
 */

export const PIPELINE_VERSION = "4.0.0";
export const POSTERIOR_VERSION = "eb-fused-v1";
export const CALIBRATION_VERSION = "team-net-loo-v1";
export const REPLACEMENT_VERSION = "fringe-posterior-calibrated-v1";
export const ARCHETYPE_VERSION = "behavior-only-v1";
export const POSITION_METADATA_VERSION = "roster-or-unavailable-v1";
/** Unit repair: paired exposure with frozen LOO/repl/PPW (M16e1 deploy). */
export const WAR_FORMULA_VERSION = "4.0.1";
export const WAR_FORMULA_VERSION_PREVIOUS = "4.0.0";
/** Exposure unit for calibrated (netRating-scale) WAR. */
export const WAR_EXPOSURE_UNIT = "paired_team_possessions";
export const POINTS_PER_WIN_VERSION = "team-margin-median-v1";

/**
 * Combined-event appearances: offensive + defensive side-of-ball events.
 * Raw DRBL rates use this denominator.
 */
export function combinedPossessionAppearancesFromParts(
  offensiveAppearances: number,
  defensiveAppearances: number
): number {
  return Math.max(0, offensiveAppearances) + Math.max(0, defensiveAppearances);
}

/**
 * Paired on-court team possessions for netRating-scale WAR.
 * Canonical until a better possession-ID field exists:
 *   (N_off + N_def) / 2
 *
 * Note: N_combined / N_paired ≡ 2 by this definition — that identity is not
 * independent evidence of the unit bug (see M16e1).
 */
export function pairedOnCourtPossessionsFromCombined(
  combinedPossessionAppearances: number
): number {
  return Math.max(0, combinedPossessionAppearances) / 2;
}

export type PipelineHealthFlag =
  | "POSTERIOR_COMPUTED_BUT_UNUSED"
  | "CALIBRATION_IS_CONSTANT_MULTIPLIER_WITHOUT_SOURCE"
  | "REPLACEMENT_LEVEL_ZERO_WHILE_ZERO_IS_LEAGUE_AVERAGE"
  | "POSITION_PROXY_INVALID"
  | "ARCHETYPE_USES_IMPACT_FEATURES"
  | "WAR_USES_NONCANONICAL_ABILITY"
  | "CALIBRATION_LEAKAGE"
  | "PASS";

export interface FieldLineage {
  field: string;
  dependsOn: string[];
  usedBy: string[];
  unit: string;
  formula: string;
}

export function fieldLineageAudit(): FieldLineage[] {
  return [
    {
      field: "rawDRBL",
      dependsOn: ["Approach B residual shares", "actualOnCourtPossessions"],
      usedBy: ["posteriorDRBL (via fused rate)", "diagnostics"],
      unit: "residual points / 100 possessions",
      formula: "100 * totalValue / actualOnCourtPossessions",
    },
    {
      field: "posteriorDRBL",
      dependsOn: [
        "fusedRateRaw",
        "actualOnCourtPossessions",
        "priorMean=0",
        "priorStrength",
      ],
      usedBy: ["calibration", "finalAbilityDRBL100"],
      unit: "residual points / 100 possessions (EB shrunk)",
      formula: "w*fused + (1-w)*prior; w = n/(n+k)",
    },
    {
      field: "finalAbilityDRBL100",
      dependsOn: ["posteriorDRBL", "calibrationIntercept", "calibrationSlope"],
      usedBy: ["WAA", "WAR", "aboveReplacementRate"],
      unit: "calibrated net points / 100 paired team possessions",
      formula: "intercept + slope * posteriorDRBL",
    },
    {
      field: "replacementLevelDRBL100",
      dependsOn: ["fringe players' finalAbilityDRBL100"],
      usedBy: ["aboveReplacementRate", "WAR"],
      unit: "net points / 100 paired team possessions",
      formula: "median(finalAbility | fringe sample)",
    },
    {
      field: "DRBL_WAA",
      dependsOn: [
        "finalAbilityDRBL100",
        "pairedOnCourtPossessions",
        "pointsPerWin",
      ],
      usedBy: ["leaderboard (optional)", "team accounting"],
      unit: "wins",
      formula: "finalAbility * pairedOnCourtPossessions / 100 / pointsPerWin",
    },
    {
      field: "DRBL_WAR",
      dependsOn: [
        "finalAbilityDRBL100",
        "replacementLevelDRBL100",
        "pairedOnCourtPossessions",
        "pointsPerWin",
      ],
      usedBy: ["leaderboard", "team accounting"],
      unit: "wins",
      formula:
        "(finalAbility - replacement) * pairedOnCourtPossessions / 100 / pointsPerWin",
    },
    {
      field: "combinedPossessionAppearances",
      dependsOn: ["offensiveAppearances", "defensiveAppearances"],
      usedBy: ["rawAbilityRate denominator"],
      unit: "player side-of-ball possession appearances",
      formula: "N_off + N_def",
    },
    {
      field: "pairedOnCourtPossessions",
      dependsOn: ["combinedPossessionAppearances"],
      usedBy: ["WAR 4.0.1+", "WAA"],
      unit: "paired team possessions while on court",
      formula: "(N_off + N_def) / 2",
    },
    {
      field: "position",
      dependsOn: ["roster metadata OR unavailable"],
      usedBy: ["diagnostics only"],
      unit: "categorical",
      formula: "never invent proxy labels",
    },
    {
      field: "archetype",
      dependsOn: [
        "creation/connection/execution/defense category rates",
        "possessions (shrinkage only)",
      ],
      usedBy: ["diagnostics only"],
      unit: "categorical + confidence",
      formula: "argmax behavioral membership; no DRBL/WAR inputs",
    },
  ];
}

export function empiricalBayesPosterior(
  observedRate: number,
  actualPossessions: number,
  priorMean: number,
  priorStrength: number
): { posterior: number; reliability: number } {
  const n = Math.max(0, actualPossessions);
  const k = Math.max(0, priorStrength);
  const reliability = n + k > 0 ? n / (n + k) : 0;
  const posterior = reliability * observedRate + (1 - reliability) * priorMean;
  return { posterior, reliability };
}

export function calibratePosterior(
  posteriorDRBL: number,
  intercept: number,
  slope: number
): number {
  return intercept + slope * posteriorDRBL;
}

export function computeWAA(args: {
  finalAbilityDRBL100: number;
  /** Prefer pairedOnCourtPossessions for calibrated ability; legacy alias OK. */
  pairedOnCourtPossessions?: number;
  actualOnCourtPossessions?: number;
  pointsPerWin: number;
}): number {
  const n = Math.max(
    0,
    args.pairedOnCourtPossessions ?? args.actualOnCourtPossessions ?? 0
  );
  const impact = (args.finalAbilityDRBL100 * n) / 100;
  return args.pointsPerWin > 0 ? impact / args.pointsPerWin : 0;
}

/**
 * WAR from calibrated (paired/netRating-scale) ability.
 * Exposure must be pairedOnCourtPossessions — not combined appearances.
 */
export function computeWAR(args: {
  finalAbilityDRBL100: number;
  replacementLevelDRBL100: number;
  /** Canonical v4.0.1+ exposure (paired team possessions). */
  pairedOnCourtPossessions?: number;
  /**
   * @deprecated Legacy name. If provided without pairedOnCourtPossessions,
   * treated as combined appearances and halved (unit repair). Prefer explicit
   * pairedOnCourtPossessions.
   */
  actualOnCourtPossessions?: number;
  pointsPerWin: number;
}): {
  aboveReplacementRate: number;
  impactAboveReplacement: number;
  war: number;
  pairedOnCourtPossessions: number;
  combinedPossessionAppearances: number | null;
} {
  let paired: number;
  let combined: number | null = null;
  if (
    args.pairedOnCourtPossessions != null &&
    Number.isFinite(args.pairedOnCourtPossessions)
  ) {
    paired = Math.max(0, args.pairedOnCourtPossessions);
  } else if (
    args.actualOnCourtPossessions != null &&
    Number.isFinite(args.actualOnCourtPossessions)
  ) {
    // Legacy callers pass combined appearances; apply unit repair.
    combined = Math.max(0, args.actualOnCourtPossessions);
    paired = pairedOnCourtPossessionsFromCombined(combined);
  } else {
    paired = 0;
  }
  const aboveReplacementRate =
    args.finalAbilityDRBL100 - args.replacementLevelDRBL100;
  const impactAboveReplacement = (aboveReplacementRate * paired) / 100;
  const war =
    args.pointsPerWin > 0 ? impactAboveReplacement / args.pointsPerWin : 0;
  return {
    aboveReplacementRate,
    impactAboveReplacement,
    war,
    pairedOnCourtPossessions: paired,
    combinedPossessionAppearances: combined,
  };
}

export function fitLinear(
  xs: number[],
  ys: number[]
): {
  intercept: number;
  slope: number;
  corr: number;
  rmse: number;
  mae: number;
} {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) {
    return { intercept: 0, slope: 1, corr: 0, rmse: 0, mae: 0 };
  }
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumYY = 0;
  let sumXY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i]!;
    sumY += ys[i]!;
    sumXX += xs[i]! * xs[i]!;
    sumYY += ys[i]! * ys[i]!;
    sumXY += xs[i]! * ys[i]!;
  }
  const mx = sumX / n;
  const my = sumY / n;
  const varX = sumXX - n * mx * mx;
  const varY = sumYY - n * my * my;
  const cov = sumXY - n * mx * my;
  const slope = Math.abs(varX) > 1e-12 ? cov / varX : 0;
  const intercept = my - slope * mx;
  const corr =
    varX > 1e-12 && varY > 1e-12 ? cov / Math.sqrt(varX * varY) : 0;
  let abs = 0;
  let sq = 0;
  for (let i = 0; i < n; i++) {
    const err = intercept + slope * xs[i]! - ys[i]!;
    abs += Math.abs(err);
    sq += err * err;
  }
  return {
    intercept,
    slope,
    corr,
    mae: abs / n,
    rmse: Math.sqrt(sq / n),
  };
}

export function throughOriginSlope(xs: number[], ys: number[]): number {
  let sumXY = 0;
  let sumXX = 0;
  const n = Math.min(xs.length, ys.length);
  for (let i = 0; i < n; i++) {
    sumXY += xs[i]! * ys[i]!;
    sumXX += xs[i]! * xs[i]!;
  }
  return sumXX > 1e-12 ? sumXY / sumXX : 1;
}

/**
 * Leave-one-out team calibration: fit on other teams, score held-out.
 */
export function fitCalibrationLeaveOneOut(args: {
  teamFeature: number[];
  teamTarget: number[];
  preferThroughOrigin?: boolean;
}): {
  intercept: number;
  slope: number;
  throughOriginSlope: number;
  oofMae: number;
  oofRmse: number;
  oofCorr: number;
  inSample: ReturnType<typeof fitLinear>;
  source: "learned_leave_one_out";
} {
  const n = Math.min(args.teamFeature.length, args.teamTarget.length);
  const preds: number[] = [];
  const actuals: number[] = [];
  const preferTO = args.preferThroughOrigin ?? true;

  for (let hold = 0; hold < n; hold++) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < n; i++) {
      if (i === hold) continue;
      xs.push(args.teamFeature[i]!);
      ys.push(args.teamTarget[i]!);
    }
    const fit = fitLinear(xs, ys);
    const to = throughOriginSlope(xs, ys);
    const slope = preferTO ? to : fit.slope;
    const intercept = preferTO ? 0 : fit.intercept;
    preds.push(intercept + slope * args.teamFeature[hold]!);
    actuals.push(args.teamTarget[hold]!);
  }

  let abs = 0;
  let sq = 0;
  for (let i = 0; i < preds.length; i++) {
    const e = preds[i]! - actuals[i]!;
    abs += Math.abs(e);
    sq += e * e;
  }
  const inSample = fitLinear(args.teamFeature, args.teamTarget);
  const toAll = throughOriginSlope(args.teamFeature, args.teamTarget);
  const oofCorr = fitLinear(preds, actuals).corr;

  return {
    intercept: preferTO ? 0 : inSample.intercept,
    slope: preferTO ? toAll : inSample.slope,
    throughOriginSlope: toAll,
    oofMae: preds.length ? abs / preds.length : 0,
    oofRmse: preds.length ? Math.sqrt(sq / preds.length) : 0,
    oofCorr,
    inSample,
    source: "learned_leave_one_out",
  };
}

export function estimatePointsPerWinFromTeamSeasons(
  rows: Array<{ pointDifferential: number; wins: number; games: number }>
): { pointsPerWin: number; median: number; n: number; mean: number } {
  const ratios: number[] = [];
  for (const r of rows) {
    const above = r.wins - 0.5 * r.games;
    if (Math.abs(above) < 1e-6) continue;
    const ppw = r.pointDifferential / above;
    if (Number.isFinite(ppw) && ppw > 5 && ppw < 80) ratios.push(ppw);
  }
  if (!ratios.length) {
    return { pointsPerWin: 30, median: 30, mean: 30, n: 0 };
  }
  const sorted = ratios.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const mean = ratios.reduce((s, x) => s + x, 0) / ratios.length;
  return { pointsPerWin: median, median, mean, n: ratios.length };
}

export function estimateReplacementLevel(args: {
  abilities: number[];
  possessions: number[];
  minPoss?: number;
  maxPoss?: number;
}): {
  replacementLevelDRBL100: number;
  method: string;
  sampleSize: number;
  mean: number;
  sd: number;
  min: number;
  max: number;
} {
  const minP = args.minPoss ?? 200;
  const maxP = args.maxPoss ?? 800;
  const fringe: number[] = [];
  for (let i = 0; i < args.abilities.length; i++) {
    const n = args.possessions[i] ?? 0;
    if (n >= minP && n <= maxP) fringe.push(args.abilities[i]!);
  }
  if (fringe.length < 5) {
    return {
      replacementLevelDRBL100: NaN,
      method: "insufficient_fringe_sample",
      sampleSize: fringe.length,
      mean: NaN,
      sd: NaN,
      min: NaN,
      max: NaN,
    };
  }
  const sorted = fringe.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const mean = fringe.reduce((s, x) => s + x, 0) / fringe.length;
  const sd = Math.sqrt(
    fringe.reduce((s, x) => s + (x - mean) ** 2, 0) / fringe.length
  );
  return {
    replacementLevelDRBL100: median,
    method: `fringe_median_poss_${minP}_${maxP}`,
    sampleSize: fringe.length,
    mean,
    sd,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
  };
}

export interface BehaviorRates {
  creation: number;
  connection: number;
  conversion: number;
  execution: number;
  recovery: number;
  turnover: number;
  defense: number;
  possessions: number;
}

export interface ArchetypeResult {
  primaryArchetype: string;
  primaryMembership: number;
  secondaryArchetype: string;
  secondaryMembership: number;
  archetypeConfidence: number;
  scores: Record<string, number>;
}

function shrinkRate(
  observed: number,
  n: number,
  leagueMean: number,
  priorStrength: number
): number {
  const w = n + priorStrength > 0 ? n / (n + priorStrength) : 0;
  return w * observed + (1 - w) * leagueMean;
}

/** Behavior-only archetypes — must not consume DRBL/WAR. */
export function assignBehaviorArchetype(
  player: BehaviorRates,
  leagueMeans: BehaviorRates,
  priorStrength = 200
): ArchetypeResult {
  const n = Math.max(0, player.possessions);
  const create = shrinkRate(
    player.creation,
    n,
    leagueMeans.creation,
    priorStrength
  );
  const connect = shrinkRate(
    player.connection,
    n,
    leagueMeans.connection,
    priorStrength
  );
  const convert = shrinkRate(
    player.conversion,
    n,
    leagueMeans.conversion,
    priorStrength
  );
  const exec = shrinkRate(
    player.execution,
    n,
    leagueMeans.execution,
    priorStrength
  );
  const defend = shrinkRate(
    player.defense,
    n,
    leagueMeans.defense,
    priorStrength
  );

  const scores: Record<string, number> = {
    creator: Math.max(0, create),
    connector: Math.max(0, connect),
    converter: Math.max(0, convert),
    finisher: Math.max(0, exec - Math.max(0, create)),
    defender: Math.max(0, defend),
  };
  const entries = Object.entries(scores).sort((a, b) => b[1]! - a[1]!);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const primary = entries[0] ?? ["uncertain", 0];
  const secondary = entries[1] ?? ["uncertain", 0];
  const primaryMembership = total > 1e-9 ? primary[1]! / total : 0;
  const secondaryMembership = total > 1e-9 ? secondary[1]! / total : 0;
  const confidence =
    n < 100 ? primaryMembership * (n / 100) : primaryMembership;
  const primaryArchetype =
    confidence < 0.25 || total < 1e-6 ? "uncertain" : primary[0]!;

  return {
    primaryArchetype,
    primaryMembership,
    secondaryArchetype: secondary[0]!,
    secondaryMembership,
    archetypeConfidence: confidence,
    scores: {
      creationScore: create,
      connectionScore: connect,
      conversionScore: convert,
      executionScore: exec,
      defenseScore: defend,
    },
  };
}

export function detectArchetypeFlags(a: ArchetypeResult): string[] {
  const flags: string[] = [];
  const create = a.scores.creationScore ?? 0;
  const exec = a.scores.executionScore ?? 0;
  const def = a.scores.defenseScore ?? 0;
  if (a.primaryArchetype === "defender" && create > 1.0) {
    flags.push("DEFENDER_WITH_EXTREME_CREATION_PROFILE");
  }
  if (a.primaryArchetype === "creator" && create < 0.05) {
    flags.push("CREATOR_WITH_NEAR_ZERO_INITIATION");
  }
  if (a.primaryArchetype === "finisher" && create > exec) {
    flags.push("FINISHER_WITH_HIGH_SELF_CREATION");
  }
  if (a.primaryArchetype === "defender" && def < 0.05 && create > def) {
    flags.push("DEFENDER_WITH_WEAK_DEFENSE_SCORE");
  }
  return flags;
}

export interface PlayerValueTrace {
  playerId: string;
  playerName: string;
  rawDRBL: number;
  posteriorDRBL: number;
  posteriorReliability: number;
  priorMean: number;
  priorStrength: number;
  calibrationIntercept: number;
  calibrationSlope: number;
  finalAbilityDRBL100: number;
  replacementLevelDRBL100: number;
  aboveReplacementRate: number;
  /** @deprecated Prefer combinedPossessionAppearances / pairedOnCourtPossessions */
  actualOnCourtPossessions: number;
  combinedPossessionAppearances?: number;
  pairedOnCourtPossessions?: number;
  impactAboveAverage: number;
  impactAboveReplacement: number;
  pointsPerWin: number;
  WAA: number;
  WAR: number;
  position: string;
  positionSource: string;
  primaryArchetype: string;
  archetypeConfidence: number;
  formulas: string[];
}

export function tracePlayerValue(args: {
  playerId: string;
  playerName: string;
  rawDRBL: number;
  fusedOrObservedForPosterior: number;
  actualOnCourtPossessions: number;
  priorMean?: number;
  priorStrength: number;
  calibrationIntercept: number;
  calibrationSlope: number;
  replacementLevelDRBL100: number;
  pointsPerWin: number;
  position?: string;
  positionSource?: string;
  primaryArchetype?: string;
  archetypeConfidence?: number;
}): PlayerValueTrace {
  const priorMean = args.priorMean ?? 0;
  const { posterior, reliability } = empiricalBayesPosterior(
    args.fusedOrObservedForPosterior,
    args.actualOnCourtPossessions,
    priorMean,
    args.priorStrength
  );
  const finalAbilityDRBL100 = calibratePosterior(
    posterior,
    args.calibrationIntercept,
    args.calibrationSlope
  );
  const nCombined = Math.max(0, args.actualOnCourtPossessions);
  const nPaired = pairedOnCourtPossessionsFromCombined(nCombined);
  const impactAboveAverage = (finalAbilityDRBL100 * nPaired) / 100;
  const waa =
    args.pointsPerWin > 0 ? impactAboveAverage / args.pointsPerWin : 0;
  const warParts = computeWAR({
    finalAbilityDRBL100,
    replacementLevelDRBL100: args.replacementLevelDRBL100,
    pairedOnCourtPossessions: nPaired,
    pointsPerWin: args.pointsPerWin,
  });

  return {
    playerId: args.playerId,
    playerName: args.playerName,
    rawDRBL: args.rawDRBL,
    posteriorDRBL: posterior,
    posteriorReliability: reliability,
    priorMean,
    priorStrength: args.priorStrength,
    calibrationIntercept: args.calibrationIntercept,
    calibrationSlope: args.calibrationSlope,
    finalAbilityDRBL100,
    replacementLevelDRBL100: args.replacementLevelDRBL100,
    aboveReplacementRate: warParts.aboveReplacementRate,
    actualOnCourtPossessions: nCombined,
    combinedPossessionAppearances: nCombined,
    pairedOnCourtPossessions: nPaired,
    impactAboveAverage,
    impactAboveReplacement: warParts.impactAboveReplacement,
    pointsPerWin: args.pointsPerWin,
    WAA: waa,
    WAR: warParts.war,
    position: args.position ?? "UNKNOWN",
    positionSource: args.positionSource ?? "unavailable",
    primaryArchetype: args.primaryArchetype ?? "uncertain",
    archetypeConfidence: args.archetypeConfidence ?? 0,
    formulas: [
      `posterior = ${reliability.toFixed(4)}*${args.fusedOrObservedForPosterior} + ${(1 - reliability).toFixed(4)}*${priorMean} = ${posterior}`,
      `finalAbility = ${args.calibrationIntercept} + ${args.calibrationSlope} * ${posterior} = ${finalAbilityDRBL100}`,
      `aboveReplacement = ${finalAbilityDRBL100} - (${args.replacementLevelDRBL100}) = ${warParts.aboveReplacementRate}`,
      `pairedOnCourtPossessions = combinedPossessionAppearances/2 = ${nPaired}`,
      `impactAR = ${warParts.aboveReplacementRate} * ${nPaired} / 100 = ${warParts.impactAboveReplacement}`,
      `WAR = ${warParts.impactAboveReplacement} / ${args.pointsPerWin} = ${warParts.war}`,
      `WAA = ${finalAbilityDRBL100} * ${nPaired} / 100 / ${args.pointsPerWin} = ${waa}`,
    ],
  };
}

export function diagnosePipelineHealth(args: {
  posteriorUsedDownstream: boolean;
  calibrationSource: string;
  replacementLevel: number;
  zeroMeans: "average" | "replacement" | "other";
  positionProxyUsed: boolean;
  archetypeUsesImpact: boolean;
  warUsesCanonicalAbility: boolean;
}): PipelineHealthFlag[] {
  const flags: PipelineHealthFlag[] = [];
  if (!args.posteriorUsedDownstream) {
    flags.push("POSTERIOR_COMPUTED_BUT_UNUSED");
  }
  if (
    args.calibrationSource === "hardcoded" ||
    args.calibrationSource === "unknown"
  ) {
    flags.push("CALIBRATION_IS_CONSTANT_MULTIPLIER_WITHOUT_SOURCE");
  }
  if (args.replacementLevel === 0 && args.zeroMeans === "average") {
    flags.push("REPLACEMENT_LEVEL_ZERO_WHILE_ZERO_IS_LEAGUE_AVERAGE");
  }
  if (args.positionProxyUsed) flags.push("POSITION_PROXY_INVALID");
  if (args.archetypeUsesImpact) flags.push("ARCHETYPE_USES_IMPACT_FEATURES");
  if (!args.warUsesCanonicalAbility) {
    flags.push("WAR_USES_NONCANONICAL_ABILITY");
  }
  if (!flags.length) flags.push("PASS");
  return flags;
}

export function ablationMetrics(
  pred: number[],
  actual: number[]
): {
  mae: number;
  rmse: number;
  corr: number;
  slope: number;
  intercept: number;
} {
  const fit = fitLinear(pred, actual);
  return {
    mae: fit.mae,
    rmse: fit.rmse,
    corr: fit.corr,
    slope: fit.slope,
    intercept: fit.intercept,
  };
}
