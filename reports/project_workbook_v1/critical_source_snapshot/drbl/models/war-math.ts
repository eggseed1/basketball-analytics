/**
 * DRBL-WAR dimensional mathematics (unit ledger + pure conversion steps).
 *
 * UNIT LEDGER
 * -----------
 * rawAbilityRate / warInputRate / posteriorAbilityRate
 *   unit: points / 100 possessions  (Approach B residual shares vs R1)
 * replacementLevelRate
 *   unit: points / 100 possessions
 * aboveReplacementRate
 *   unit: points / 100 possessions
 * actualOnCourtPossessions
 *   unit: possessions (player on-court appearances; O and D counted separately)
 * modelObservationCount
 *   unit: observations (may equal actualOnCourtPossessions in Approach B)
 * priorEquivalentPossessions
 *   unit: pseudo-possessions (shrinkage only — NEVER season exposure)
 * seasonImpactAboveReplacement
 *   unit: points (scoring-margin value above replacement)
 * pointsPerWin
 *   unit: points / win
 * winsPerPoint
 *   unit: wins / point  (= 1 / pointsPerWin)
 * DRBL_WAR
 *   unit: wins
 *
 * Canonical identity:
 *   WAR = ((warInputRate - replacementLevelRate) * actualOnCourtPossessions / 100)
 *         / pointsPerWin
 */

export const WAR_FORMULA_VERSION = "3.0.0";

/** Historical NBA scoring-margin rule of thumb; also matches M13 provisional. */
export const PROVISIONAL_POINTS_PER_WIN = 30;

export const PROVISIONAL_WINS_PER_POINT = 1 / PROVISIONAL_POINTS_PER_WIN;

export type WarScaleFlag =
  | "WAR_USES_WRONG_RATE"
  | "WAR_USES_MODEL_OBSERVATIONS_AS_EXPOSURE"
  | "DOUBLE_PER100_DIVISION"
  | "MISSING_REPLACEMENT_LEVEL"
  | "INVALID_REPLACEMENT_LEVEL"
  | "POINTS_PER_WIN_UNIT_MISMATCH"
  | "PRIOR_COUNTED_AS_ACTUAL_EXPOSURE"
  | "OFFENSE_DEFENSE_EXPOSURE_DOUBLE_COUNT"
  | "UNEXPLAINED_SCALE_FACTOR"
  | "DRBL_RATE_NOT_TRUE_POINTS_PER_100"
  | "PASS";

export interface WarConfig {
  /** Points of seasonal impact per marginal win. */
  pointsPerWin: number;
  /** Replacement ability on the per-100 scale. */
  replacementLevelRate: number;
  /**
   * Which rate feeds realized season WAR.
   * `raw_realized` preserves Approach B totalValue conservation.
   * `posterior` uses EB-fused ability (forecast / ability boards).
   */
  warInputRateSource: "raw_realized" | "posterior";
  /** Optional multiplicative calibration of rates into true pts/100 (Phase 22). */
  rateCalibrationSlope: number;
  rateCalibrationIntercept: number;
}

export const DEFAULT_WAR_CONFIG: WarConfig = {
  pointsPerWin: PROVISIONAL_POINTS_PER_WIN,
  replacementLevelRate: 0,
  warInputRateSource: "raw_realized",
  rateCalibrationSlope: 1,
  rateCalibrationIntercept: 0,
};

export function calculateAboveReplacementRate(
  posteriorOrRawAbilityRatePer100: number,
  replacementLevelRatePer100: number
): number {
  return posteriorOrRawAbilityRatePer100 - replacementLevelRatePer100;
}

export function calculateSeasonImpactAboveReplacement(
  aboveReplacementRatePer100: number,
  actualOnCourtPossessions: number
): number {
  const n = Math.max(0, actualOnCourtPossessions);
  return (aboveReplacementRatePer100 * n) / 100;
}

/**
 * Convert points of impact into wins.
 * `pointsPerWin` MUST be points/win (e.g. 30), never wins/point (1/30).
 */
export function convertImpactToWins(
  impactAboveReplacement: number,
  pointsPerWin: number
): number {
  if (!(pointsPerWin > 0) || !Number.isFinite(pointsPerWin)) return 0;
  return impactAboveReplacement / pointsPerWin;
}

export function winsPerPointFromPointsPerWin(pointsPerWin: number): number {
  return pointsPerWin > 0 ? 1 / pointsPerWin : 0;
}

export function pointsPerWinFromWinsPerPoint(winsPerPoint: number): number {
  return winsPerPoint > 0 ? 1 / winsPerPoint : PROVISIONAL_POINTS_PER_WIN;
}

export function calibrateAbilityRatePer100(
  ratePer100: number,
  slope: number,
  intercept: number
): number {
  return intercept + slope * ratePer100;
}

export function selectWarInputRate(args: {
  rawAbilityRate: number;
  posteriorAbilityRate: number;
  source: WarConfig["warInputRateSource"];
}): number {
  return args.source === "posterior"
    ? args.posteriorAbilityRate
    : args.rawAbilityRate;
}

export function calculateWAR(args: {
  rawAbilityRate: number;
  posteriorAbilityRate: number;
  actualOnCourtPossessions: number;
  config?: Partial<WarConfig>;
}): {
  warInputRate: number;
  calibratedWarInputRate: number;
  replacementLevelRate: number;
  aboveReplacementRate: number;
  impactAboveReplacement: number;
  pointsPerWin: number;
  war: number;
  config: WarConfig;
} {
  const config: WarConfig = { ...DEFAULT_WAR_CONFIG, ...args.config };
  const warInputRate = selectWarInputRate({
    rawAbilityRate: args.rawAbilityRate,
    posteriorAbilityRate: args.posteriorAbilityRate,
    source: config.warInputRateSource,
  });
  const calibratedWarInputRate = calibrateAbilityRatePer100(
    warInputRate,
    config.rateCalibrationSlope,
    config.rateCalibrationIntercept
  );
  const aboveReplacementRate = calculateAboveReplacementRate(
    calibratedWarInputRate,
    config.replacementLevelRate
  );
  const impactAboveReplacement = calculateSeasonImpactAboveReplacement(
    aboveReplacementRate,
    args.actualOnCourtPossessions
  );
  const war = convertImpactToWins(
    impactAboveReplacement,
    config.pointsPerWin
  );
  return {
    warInputRate,
    calibratedWarInputRate,
    replacementLevelRate: config.replacementLevelRate,
    aboveReplacementRate,
    impactAboveReplacement,
    pointsPerWin: config.pointsPerWin,
    war,
    config,
  };
}

export interface WarTraceInput {
  playerId: string;
  playerName: string;
  rawAbilityRate: number;
  posteriorAbilityRate: number;
  drblP: number;
  drblLn: number;
  drblB: number;
  actualOnCourtPossessions: number;
  modelObservationCount?: number;
  pbpAttributedPossessions?: number;
  priorEquivalentPossessions?: number;
  config?: Partial<WarConfig>;
}

export interface WarTrace {
  playerId: string;
  playerName: string;
  rawDRBL100: number;
  posteriorDRBL100: number;
  drblP: number;
  drblLn: number;
  drblB: number;
  warInputRate: number;
  calibratedWarInputRate: number;
  replacementLevelRate: number;
  aboveReplacementRate: number;
  actualOnCourtPossessions: number;
  modelObservationCount: number;
  pbpAttributedPossessions: number;
  priorEquivalentPossessions: number;
  impactAboveReplacement: number;
  pointsPerWin: number;
  DRBL_WAR: number;
  identities: {
    aboveReplacementOk: boolean;
    impactOk: boolean;
    warOk: boolean;
  };
  formulas: string[];
}

export function traceWarCalculation(input: WarTraceInput): WarTrace {
  const result = calculateWAR({
    rawAbilityRate: input.rawAbilityRate,
    posteriorAbilityRate: input.posteriorAbilityRate,
    actualOnCourtPossessions: input.actualOnCourtPossessions,
    config: input.config,
  });
  const n = Math.max(0, input.actualOnCourtPossessions);
  const aboveCheck =
    Math.abs(
      result.aboveReplacementRate -
        (result.calibratedWarInputRate - result.replacementLevelRate)
    ) < 1e-9;
  const impactCheck =
    Math.abs(
      result.impactAboveReplacement -
        (result.aboveReplacementRate * n) / 100
    ) < 1e-9;
  const warCheck =
    Math.abs(
      result.war - result.impactAboveReplacement / result.pointsPerWin
    ) < 1e-9;

  const formulas = [
    `calibratedWarInputRate = ${result.config.rateCalibrationIntercept} + ${result.config.rateCalibrationSlope} * ${result.warInputRate} = ${result.calibratedWarInputRate}`,
    `aboveReplacementRate = ${result.calibratedWarInputRate} - (${result.replacementLevelRate}) = ${result.aboveReplacementRate} points / 100 possessions`,
    `impactAboveReplacement = ${result.aboveReplacementRate} * ${n} / 100 = ${result.impactAboveReplacement} points`,
    `DRBL_WAR = ${result.impactAboveReplacement} / ${result.pointsPerWin} = ${result.war} wins`,
  ];

  return {
    playerId: input.playerId,
    playerName: input.playerName,
    rawDRBL100: input.rawAbilityRate,
    posteriorDRBL100: input.posteriorAbilityRate,
    drblP: input.drblP,
    drblLn: input.drblLn,
    drblB: input.drblB,
    warInputRate: result.warInputRate,
    calibratedWarInputRate: result.calibratedWarInputRate,
    replacementLevelRate: result.replacementLevelRate,
    aboveReplacementRate: result.aboveReplacementRate,
    actualOnCourtPossessions: n,
    modelObservationCount: input.modelObservationCount ?? n,
    pbpAttributedPossessions: input.pbpAttributedPossessions ?? n,
    priorEquivalentPossessions: input.priorEquivalentPossessions ?? 0,
    impactAboveReplacement: result.impactAboveReplacement,
    pointsPerWin: result.pointsPerWin,
    DRBL_WAR: result.war,
    identities: {
      aboveReplacementOk: aboveCheck,
      impactOk: impactCheck,
      warOk: warCheck,
    },
    formulas,
  };
}

export function formatWarTrace(trace: WarTrace): string {
  return [
    `Player: ${trace.playerName} (${trace.playerId})`,
    `rawDRBL100                 = ${trace.rawDRBL100}`,
    `posteriorDRBL100           = ${trace.posteriorDRBL100}`,
    `drblP / drblLn / drblB     = ${trace.drblP} / ${trace.drblLn} / ${trace.drblB}`,
    `warInputRate               = ${trace.warInputRate}`,
    `calibratedWarInputRate     = ${trace.calibratedWarInputRate}`,
    `replacementLevelDRBL100    = ${trace.replacementLevelRate}`,
    `aboveReplacementRate       = ${trace.aboveReplacementRate}`,
    `actualOnCourtPossessions   = ${trace.actualOnCourtPossessions}`,
    `modelObservationCount      = ${trace.modelObservationCount}`,
    `seasonImpactAboveReplacement = ${trace.impactAboveReplacement}`,
    `pointsPerWin               = ${trace.pointsPerWin}`,
    `DRBL_WAR                   = ${trace.DRBL_WAR}`,
    "",
    ...trace.formulas,
  ].join("\n");
}

/** Fringe / roster-cutoff empirical replacement on a chosen rate scale. */
export function deriveReplacementLevelFromFringe(
  rates: number[],
  options: { percentile?: number } = {}
): number {
  if (!rates.length) return 0;
  const sorted = rates.slice().sort((a, b) => a - b);
  const p = options.percentile ?? 0.5;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(p * (sorted.length - 1)))
  );
  return sorted[idx]!;
}

export function fitLinear(
  xs: number[],
  ys: number[]
): { intercept: number; slope: number; corr: number } {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return { intercept: 0, slope: 1, corr: 0 };
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumYY = 0;
  let sumXY = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i]!;
    const y = ys[i]!;
    sumX += x;
    sumY += y;
    sumXX += x * x;
    sumYY += y * y;
    sumXY += x * y;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  const varX = sumXX - n * meanX * meanX;
  const varY = sumYY - n * meanY * meanY;
  const cov = sumXY - n * meanX * meanY;
  const slope = Math.abs(varX) > 1e-12 ? cov / varX : 0;
  const intercept = meanY - slope * meanX;
  const corr =
    varX > 1e-12 && varY > 1e-12 ? cov / Math.sqrt(varX * varY) : 0;
  return { intercept, slope, corr };
}

/**
 * Phase 22: map Approach B team rates onto observed team net ratings.
 */
export function fitRateCalibrationToTeamNet(args: {
  drblTeamPtsPer100: number[];
  teamNetRating: number[];
}): {
  intercept: number;
  slope: number;
  corr: number;
  throughOriginSlope: number;
} {
  const fit = fitLinear(args.drblTeamPtsPer100, args.teamNetRating);
  let sumXY = 0;
  let sumXX = 0;
  const n = Math.min(
    args.drblTeamPtsPer100.length,
    args.teamNetRating.length
  );
  for (let i = 0; i < n; i++) {
    const x = args.drblTeamPtsPer100[i]!;
    const y = args.teamNetRating[i]!;
    sumXY += x * y;
    sumXX += x * x;
  }
  const throughOriginSlope = sumXX > 1e-12 ? sumXY / sumXX : 1;
  return { ...fit, throughOriginSlope };
}

/**
 * Points-per-win from team season point differential vs wins above .500.
 */
export function estimatePointsPerWinFromTeamSeasons(
  rows: Array<{
    pointDifferential: number;
    wins: number;
    games: number;
  }>
): { pointsPerWin: number; n: number; median: number } {
  const ratios: number[] = [];
  for (const r of rows) {
    const above500 = r.wins - 0.5 * r.games;
    if (Math.abs(above500) < 1e-6) continue;
    const ppw = r.pointDifferential / above500;
    if (Number.isFinite(ppw) && ppw > 5 && ppw < 80) ratios.push(ppw);
  }
  if (!ratios.length) {
    return {
      pointsPerWin: PROVISIONAL_POINTS_PER_WIN,
      n: 0,
      median: PROVISIONAL_POINTS_PER_WIN,
    };
  }
  const sorted = ratios.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const mean = ratios.reduce((s, x) => s + x, 0) / ratios.length;
  return { pointsPerWin: mean, n: ratios.length, median };
}

export function diagnoseWarScale(args: {
  legacyPointsPerWinField?: number;
  warInputRate: number;
  rawAbilityRate: number;
  posteriorAbilityRate: number;
  drblP: number;
  actualOnCourtPossessions: number;
  modelObservationCount?: number;
  priorEquivalentPossessions?: number;
  seasonalImpact: number;
  replacementLevelRate: number;
  rateCalibrationSlope?: number;
}): WarScaleFlag[] {
  const flags: WarScaleFlag[] = [];
  const legacy = args.legacyPointsPerWinField;
  if (legacy != null && legacy > 0 && legacy < 1) {
    flags.push("POINTS_PER_WIN_UNIT_MISMATCH");
  }
  if (
    Math.abs(args.warInputRate - args.drblP) < 1e-9 &&
    Math.abs(args.warInputRate - args.rawAbilityRate) > 0.05
  ) {
    flags.push("WAR_USES_WRONG_RATE");
  }
  const obs = args.modelObservationCount;
  if (
    obs != null &&
    args.actualOnCourtPossessions > 0 &&
    obs < args.actualOnCourtPossessions * 0.25
  ) {
    flags.push("WAR_USES_MODEL_OBSERVATIONS_AS_EXPOSURE");
  }
  const expected = (args.rawAbilityRate * args.actualOnCourtPossessions) / 100;
  if (
    args.actualOnCourtPossessions > 0 &&
    Math.abs(args.seasonalImpact - expected) > 0.05 &&
    Math.abs(args.seasonalImpact - expected / 100) < 0.05
  ) {
    flags.push("DOUBLE_PER100_DIVISION");
  }
  const prior = args.priorEquivalentPossessions ?? 0;
  if (
    prior > 0 &&
    Math.abs(
      args.seasonalImpact -
        (args.rawAbilityRate * (args.actualOnCourtPossessions + prior)) / 100
    ) < 0.05 &&
    Math.abs(args.seasonalImpact - expected) > 0.05
  ) {
    flags.push("PRIOR_COUNTED_AS_ACTUAL_EXPOSURE");
  }
  if (
    !Number.isFinite(args.replacementLevelRate) ||
    args.replacementLevelRate > 2
  ) {
    flags.push("INVALID_REPLACEMENT_LEVEL");
  }
  const slope = args.rateCalibrationSlope ?? 1;
  if (slope > 1.5 || slope < 0.5) {
    flags.push("DRBL_RATE_NOT_TRUE_POINTS_PER_100");
  }
  if (!flags.length) flags.push("PASS");
  return flags;
}

export function assertWarInvariants(args: {
  actualOnCourtPossessions: number;
  pointsPerWin: number;
  posteriorDRBL100: number;
  replacementLevelRate: number;
  war: number;
}): string[] {
  const warnings: string[] = [];
  if (args.actualOnCourtPossessions < 0) {
    warnings.push("actualOnCourtPossessions < 0");
  }
  if (!(args.pointsPerWin > 0)) {
    warnings.push("pointsPerWin must be > 0");
  }
  if (!Number.isFinite(args.posteriorDRBL100)) {
    warnings.push("posteriorDRBL100 not finite");
  }
  if (!Number.isFinite(args.replacementLevelRate)) {
    warnings.push("replacementLevelRate not finite");
  }
  if (!Number.isFinite(args.war)) {
    warnings.push("WAR not finite");
  }
  if (Math.abs(args.posteriorDRBL100) > 40) {
    warnings.push("posteriorDRBL100 extreme (|rate| > 40)");
  }
  return warnings;
}
