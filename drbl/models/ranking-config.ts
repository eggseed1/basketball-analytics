/**
 * Ranking configuration — every constant named, unit, purpose.
 * rankingFormulaVersion bumps when semantics change.
 */

export const RANKING_FORMULA_VERSION = "2.2.0";

/** Leaderboard size after scoring the full eligible population. */
export const LEADERBOARD_SIZE = 100;

/**
 * Ranking modes (mutually exclusive concepts).
 * - ability: posterior per-100 rate (sample-size regularized)
 * - ability_conservative: posterior − z·SE
 * - season_value: realized wins above replacement this season
 * - forecast_value: projected WAR over explicit forecast possessions
 */
export type RankingMode =
  | "ability"
  | "ability_conservative"
  | "season_value"
  | "forecast_value";

/**
 * Default for public “top / best players” boards that were previously sorting
 * noisy fused rates: use realized season value (WAR) so exposure matters.
 * Ability mode remains available and is what `drbl100` (posterior rate) represents.
 */
export const DEFAULT_RANKING_MODE: RankingMode = "season_value";

/**
 * EB prior strength (pseudo-possessions) for rate shrinkage only.
 * Must NEVER be added into realized season exposure.
 */
export const PRIOR_EQUIVALENT_POSSESSIONS = 200;

/** Minimum actual possessions for leaderboard eligibility (not a statistical fix). */
export const MINIMUM_ACTUAL_POSSESSIONS = 50;

/**
 * Points of seasonal impact per win (unit: points / win).
 * Seasonal impact is points above replacement (Approach B residual shares).
 * 30 is the provisional M13 conversion; WAR module may override when calibrated.
 * Do NOT store wins-per-point (1/30) in this field — that was a naming bug.
 */
export const DEFAULT_POINTS_PER_WIN = 30;

/** Nominal interval confidence for ± half-width around ability rate. */
export const INTERVAL_CONFIDENCE = 0.8;

/**
 * Critical value for ~80% normal interval (z such that P(|Z|<z)≈0.8).
 * ≈ 1.28155; we use 1.28.
 */
export const INTERVAL_CRITICAL_VALUE = 1.28;

/** Conservative ability penalty multiplier on SE. */
export const CONFIDENCE_PENALTY = 1.28;

/** Default forecast horizon (possessions) when no playing-time model exists. */
export const DEFAULT_FORECAST_POSSESSIONS = 2500;

/** Analytical uncertainty has no production cap; display may soft-cap separately. */
export const DISPLAY_UNCERTAINTY_CAP = 4;

export interface RankingConfig {
  leaderboardSize: number;
  rankingMode: RankingMode;
  minimumActualPossessions: number;
  priorEquivalentPossessions: number;
  pointsPerWin: number;
  intervalConfidence: number;
  intervalCriticalValue: number;
  confidencePenalty: number;
  forecastPossessions: number;
  rankingFormulaVersion: string;
  /** Replacement rate on the per-100 scale; Approach B residuals are vs R1 so 0. */
  replacementLevelRate: number;
}

export function defaultRankingConfig(
  overrides: Partial<RankingConfig> = {}
): RankingConfig {
  return {
    leaderboardSize: LEADERBOARD_SIZE,
    rankingMode: DEFAULT_RANKING_MODE,
    minimumActualPossessions: MINIMUM_ACTUAL_POSSESSIONS,
    priorEquivalentPossessions: PRIOR_EQUIVALENT_POSSESSIONS,
    pointsPerWin: DEFAULT_POINTS_PER_WIN,
    intervalConfidence: INTERVAL_CONFIDENCE,
    intervalCriticalValue: INTERVAL_CRITICAL_VALUE,
    confidencePenalty: CONFIDENCE_PENALTY,
    forecastPossessions: DEFAULT_FORECAST_POSSESSIONS,
    rankingFormulaVersion: RANKING_FORMULA_VERSION,
    replacementLevelRate: 0,
    ...overrides,
  };
}
