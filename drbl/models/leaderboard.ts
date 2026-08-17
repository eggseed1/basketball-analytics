/**
 * Leaderboard construction — score ALL eligible players, then truncate.
 *
 * rankingFormulaVersion 2.0.0
 */

import {
  defaultRankingConfig,
  type RankingConfig,
  type RankingMode,
  DISPLAY_UNCERTAINTY_CAP,
} from "./ranking-config";

export interface RankablePlayer {
  playerId: string;
  playerName: string;
  teamId: string;
  /** Actual on-court possessions (never includes prior pseudo-count). */
  actualPossessions: number;
  /** Unshrunk points-above-replacement per 100. */
  rawAbilityRate: number;
  /** EB posterior rate (prior strength only affects this, not exposure). */
  posteriorAbilityRate: number;
  /** Fused rate before possession EB (diagnostic). */
  fusedRateRaw: number;
  drblP: number;
  drblLn: number;
  drblB: number;
  drblO: number;
  drblD: number;
  sdv100: number;
  shotMaking100: number;
  epvShootMean: number;
  vContMean: number;
  /** Realized points above replacement = rawAbilityRate * actualPossessions / 100. */
  seasonalImpact: number;
  seasonWar: number;
  forecastPossessions: number;
  forecastImpact: number;
  forecastWar: number;
  reliabilityWeight: number;
  priorMean: number;
  priorEquivalentPossessions: number;
  replacementLevelRate: number;
  pointsPerWin: number;
  /** Scale-standardized component disagreement index (not a SE). */
  componentDisagreementIndex: number;
  /** Analytical SE for ability rate (uncapped). */
  abilityStandardError: number;
  abilityIntervalLow: number;
  abilityIntervalHigh: number;
  /** Display-only capped half-width (must not affect rank). */
  displayUncertainty: number;
  drblL: number;
  meanLeverage: number;
  rankingMode: RankingMode;
  finalRankingScore: number;
  eligibilityStatus: "eligible" | "insufficient_sample";
  eligibilityReason: string;
  rankingFormulaVersion: string;
  /** @deprecated alias — posterior ability rate for site compatibility */
  drbl100: number;
  /** @deprecated alias — seasonWar */
  drblWar: number;
  /** @deprecated aliases for CSV compatibility */
  possessions: number;
  disagreement: number;
  uncertainty: number;
  intervalLo: number;
  intervalHi: number;
}

export function empiricalBayesRate(
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

/**
 * Realized season impact uses ACTUAL possessions only.
 * priorStrength must not appear in the exposure term.
 */
export function seasonalImpactFromRate(
  posteriorOrRawRate: number,
  actualPossessions: number
): number {
  return (posteriorOrRawRate * Math.max(0, actualPossessions)) / 100;
}

/**
 * Correct identity: impact = rawRate * actualPossessions / 100.
 * (Using posterior * (n+k)/100 would incorrectly count prior as exposure.)
 */
export function seasonalImpactFromRawRate(
  rawAbilityRate: number,
  actualPossessions: number
): number {
  return seasonalImpactFromRate(rawAbilityRate, actualPossessions);
}

/**
 * Convert seasonal impact (points) to wins.
 * `pointsPerWin` is points/win (e.g. 30), not wins/point.
 */
export function warFromImpact(
  impact: number,
  pointsPerWin: number
): number {
  if (!(pointsPerWin > 0)) return 0;
  // Legacy compatibility: values in (0, 1] were historically wins-per-point.
  if (pointsPerWin > 0 && pointsPerWin <= 1) {
    return impact * pointsPerWin;
  }
  return impact / pointsPerWin;
}

export function finalRankingScoreFor(
  mode: RankingMode,
  player: {
    posteriorAbilityRate: number;
    abilityStandardError: number;
    seasonWar: number;
    forecastWar: number;
  },
  config: RankingConfig
): number {
  switch (mode) {
    case "ability":
      return player.posteriorAbilityRate;
    case "ability_conservative":
      return (
        player.posteriorAbilityRate -
        config.confidencePenalty * player.abilityStandardError
      );
    case "season_value":
      return player.seasonWar;
    case "forecast_value":
      return player.forecastWar;
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

/** Population SD of numbers. */
export function populationSd(xs: number[]): number {
  if (xs.length === 0) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
  return Math.sqrt(v);
}

/**
 * Scale-standardized disagreement: SD of z-scores across components.
 * Components with missing B are skipped for that player.
 */
export function standardizedDisagreement(
  components: Array<{ value: number; mean: number; sd: number }>
): number {
  const zs: number[] = [];
  for (const c of components) {
    const scale = c.sd > 1e-9 ? c.sd : 1;
    zs.push((c.value - c.mean) / scale);
  }
  return populationSd(zs);
}

/**
 * Sampling SE proxy for a per-100 rate: residual scale / sqrt(n).
 * residualScale calibrated ~ league residual SD on per-100 (~12–15 pts/100);
 * use 12 as a stable default when no calib object is passed.
 */
export function abilitySamplingSe(
  actualPossessions: number,
  residualScalePer100 = 12
): number {
  const n = Math.max(1, actualPossessions);
  return residualScalePer100 / Math.sqrt(n);
}

export function combineStandardErrors(
  samplingSe: number,
  modelSe: number
): number {
  return Math.sqrt(samplingSe ** 2 + modelSe ** 2);
}

export function stableSortPlayers<T extends { finalRankingScore: number; abilityStandardError: number; actualPossessions: number; playerId: string }>(
  players: T[]
): T[] {
  return players.slice().sort((a, b) => {
    if (b.finalRankingScore !== a.finalRankingScore) {
      return b.finalRankingScore - a.finalRankingScore;
    }
    if (a.abilityStandardError !== b.abilityStandardError) {
      return a.abilityStandardError - b.abilityStandardError;
    }
    if (b.actualPossessions !== a.actualPossessions) {
      return b.actualPossessions - a.actualPossessions;
    }
    return a.playerId.localeCompare(b.playerId);
  });
}

/**
 * Score full population → filter eligible → sort → take top N → assign ranks.
 */
export function createLeaderboard<T extends RankablePlayer>(
  evaluated: T[],
  config: RankingConfig = defaultRankingConfig()
): Array<T & { rank: number }> {
  const eligible = evaluated.filter(
    (p) => p.eligibilityStatus === "eligible"
  );
  const sorted = stableSortPlayers(eligible);
  const top = sorted.slice(0, config.leaderboardSize);
  return top.map((p, i) => ({ ...p, rank: i + 1 }));
}

export function applyDisplayUncertaintyCap(
  analyticalSe: number,
  criticalValue: number
): { trueHalfWidth: number; displayHalfWidth: number } {
  const trueHalfWidth = criticalValue * analyticalSe;
  return {
    trueHalfWidth,
    displayHalfWidth: Math.min(DISPLAY_UNCERTAINTY_CAP, trueHalfWidth),
  };
}
