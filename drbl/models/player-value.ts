/**
 * DRBL-P Approach B — marginal contribution vs contextual replacement.
 *
 * Identification (documented):
 * - EPV(S) from time-safe pre-possession state (M5).
 * - Replacement EP = EPV(S) + role-matched R1 residual (M7), not a simulated
 *   lineup swap (Approach A). Spec prefers Approach A; this remains B.
 * - Credit: sequential opportunity/execution attribution of
 *   (actual − R1 replacement EP), with assists as connection credit and
 *   make/miss noise down-weighted in stable totals (seq-attr-v1).
 * - Shrinkage toward 0 by possession count.
 *
 * Spec: do not claim full counterfactual simulation until Approach A exists.
 */

import type { DrblBoxScore, DrblEvent, DrblPossession } from "../types";
import {
  predictExpectedPoints,
  type PossessionEpState,
} from "./expected-points";
import {
  emptyRole,
  replacementExpectedPoints,
  type ReplacementPool,
  type RoleVector,
} from "./replacement";
import { fusePlayerRating } from "./fusion";
import {
  ABILITY_LINEAGE_VERSION,
  CANONICAL_ABILITY_INPUT,
} from "./ability-lineage";
import {
  predictHalfWidth,
  type UncertaintyCalibration,
} from "./uncertainty";
import { leverageWeight } from "./leverage";
import {
  defaultRankingConfig,
  PRIOR_EQUIVALENT_POSSESSIONS,
  type RankingConfig,
  type RankingMode,
} from "./ranking-config";
import {
  attributePossessionSequential,
  aggregateStableByPlayer,
  aggregateStableByPlayerAndCategory,
  SEQUENTIAL_ATTRIBUTION_VERSION,
} from "./sequential-attribution";
import {
  abilitySamplingSe,
  applyDisplayUncertaintyCap,
  combineStandardErrors,
  createLeaderboard,
  empiricalBayesRate,
  finalRankingScoreFor,
  seasonalImpactFromRawRate,
  standardizedDisagreement,
  warFromImpact,
} from "./leaderboard";
import {
  VALIDATED_ABILITY_MODEL_VERSION,
  VALIDATED_K,
  VALIDATED_PRIOR_MEAN,
  computeValidatedAbilityV1,
} from "./validated-ability-v1";
import {
  R1_POINT_VALUE_VERSION,
  R1_POINTS_PER_WIN,
  R1_WIN_EQUIVALENT_VERSION,
  buildR1ValueFieldsFromAttributed,
} from "./r1-value-v1";

export type { RankingMode, RankingConfig };
export { defaultRankingConfig, createLeaderboard, SEQUENTIAL_ATTRIBUTION_VERSION };

export interface DrblPlayerAccumulator {
  playerId: string;
  playerName: string;
  teamId: string;
  possessions: number;
  offensivePossessions: number;
  defensivePossessions: number;
  /** Sum of possession values (points above replacement) — stable sequential. */
  totalValue: number;
  offensiveValue: number;
  defensiveValue: number;
  /** Σ BaseValue × λ_raw (DRBL-L numerator before mean normalization). */
  leverageValue: number;
  leverageWeightSum: number;
  /** Sum of shot-decision SDV (points); separate from residual P. */
  sdvSum: number;
  sdvN: number;
  shotMakingSum: number;
  shotMakingN: number;
  epvShootSum: number;
  vContSum: number;
  /** Sequential category sums (stable credits). */
  creationValue: number;
  connectionValue: number;
  conversionOpportunityValue: number;
  executionValue: number;
  recoveryValue: number;
  turnoverValue: number;
  defenseEventValue: number;
}

export interface DrblPlayerSeasonRow {
  playerId: string;
  playerName: string;
  teamId: string;
  /** Actual on-court possessions (never includes prior pseudo-count). */
  possessions: number;
  actualPossessions: number;
  /**
   * Canonical ability rate per 100 (M16k1+: validated P-only EB1600).
   * NOT the default Explore table sort key.
   */
  drbl100: number;
  rawAbilityRate: number;
  /** Legacy fused EB200 posterior — diagnostic only after M16k1. */
  posteriorAbilityRate: number;
  fusedRateRaw: number;
  reliabilityWeight: number;
  priorMean: number;
  priorEquivalentPossessions: number;
  /** Canonical published ability source (M16k1: validated_raw_eb1600). */
  publishedAbilityInput: "validated_raw_eb1600" | "fused_rate";
  abilityLineageVersion: string;
  /** Production model id after M16k1 cutover. */
  abilityModelVersion?: string;
  /** DRBL-P Approach B component (EB-shrunk raw rate). */
  drblP: number;
  drblLn: number;
  drblB: number;
  drblO: number;
  drblD: number;
  sdv100: number;
  shotMaking100: number;
  epvShootMean: number;
  vContMean: number;
  /**
   * Realized points above replacement =
   * rawAbilityRate * actualPossessions / 100
   * (= accumulator totalValue). Prior strength is NOT in the exposure term.
   * Legacy/display companion to canonical r1Points (may be rounded in artifacts).
   */
  seasonalImpact: number;
  /**
   * Canonical realized R1 Points (full precision Approach-B attributed value).
   * M16l3: source of truth for cumulative point value.
   */
  r1Points?: number;
  /** r1Points / R1_POINTS_PER_WIN — not conventional WAR. */
  r1WinEquivalents?: number;
  r1PointValueVersion?: string;
  r1WinEquivalentVersion?: string;
  r1PointsPerWin?: number;
  /**
   * Legacy seasonalImpact / pointsPerWin (historical WAR generations).
   * DEPRECATED_NONCANONICAL — do not reinterpret as R1 Win Equivalents.
   */
  drblWar: number;
  /** Explicit legacy alias preserved for migration clarity. */
  legacyDrblWar?: number;
  seasonWar: number;
  forecastPossessions: number;
  forecastImpact: number;
  forecastWar: number;
  replacementLevelRate: number;
  pointsPerWin: number;
  drblL: number;
  meanLeverage: number;
  /** Scale-standardized component disagreement index (not a calibrated SE). */
  disagreement: number;
  componentDisagreementIndex: number;
  /** Analytical SE of ability rate (uncapped). */
  abilityStandardError: number;
  /**
   * Analytical half-width around posterior ability (uncapped).
   * Does not affect ranking under season_value / forecast modes.
   */
  uncertainty: number;
  /** Chart-only capped half-width; never used for rank or analytical export math. */
  displayUncertainty: number;
  intervalLo: number;
  intervalHi: number;
  intervalConfidence: number;
  rankingMode: RankingMode;
  finalRankingScore: number;
  eligibilityStatus: "eligible" | "insufficient_sample";
  eligibilityReason: string;
  rankingFormulaVersion: string;
  rank?: number;
  /** Sequential attribution category rates per 100 (stable credits). */
  creationValuePer100: number;
  connectionValuePer100: number;
  conversionOpportunityPer100: number;
  executionValuePer100: number;
  recoveryValuePer100: number;
  turnoverValuePer100: number;
  defensiveValuePer100: number;
  sequentialAttributionVersion: string;
}

/**
 * Provisional wins-per-point (for M13 team regression slope).
 * Prefer PROVISIONAL_POINTS_PER_WIN / war-math for player WAR.
 */
export const PROVISIONAL_WIN_CONVERSION = 1 / 30;

/** Provisional points/win for player WAR (unit-correct name). */
export const PROVISIONAL_POINTS_PER_WIN = 30;

/** @deprecated use PRIOR_EQUIVALENT_POSSESSIONS from ranking-config */
const SHRINKAGE_K = PRIOR_EQUIVALENT_POSSESSIONS;

/** Re-export formal WP leverage for callers/tests. */
export { leverageWeight } from "./leverage";

function eventByAction(
  events: DrblEvent[],
  actionNumber: number
): DrblEvent | undefined {
  return events.find((e) => e.actionNumber === actionNumber);
}

export function stateForPossession(
  possession: DrblPossession,
  box: DrblBoxScore,
  events: DrblEvent[]
): PossessionEpState {
  const start = eventByAction(events, possession.startActionNumber);
  const offenseIsHome = possession.offenseTeamId === box.homeTeamId;
  const scoreHome = start?.scoreHome ?? 0;
  const scoreAway = start?.scoreAway ?? 0;
  const scoreDiff = offenseIsHome
    ? scoreHome - scoreAway
    : scoreAway - scoreHome;
  return {
    period: possession.period,
    clockSeconds: possession.startClockSeconds,
    offenseIsHome,
    scoreDiff,
  };
}

/**
 * Per-possession involvement weights (timestamp-safe: events on this possession only).
 * Base 1 for all on-court; +1 if appears on an event; +1 if FGA shooter.
 */
export function involvementWeights(
  playerIds: string[],
  possession: DrblPossession,
  events: DrblEvent[]
): Map<string, number> {
  const weights = new Map<string, number>();
  for (const id of playerIds) weights.set(id, 1);
  for (const n of possession.eventActionNumbers) {
    const e = eventByAction(events, n);
    if (!e?.playerId || !weights.has(e.playerId)) continue;
    weights.set(e.playerId, (weights.get(e.playerId) ?? 1) + 1);
    if (
      (e.actionType === "2pt" || e.actionType === "3pt") &&
      (e.shotResult === "Made" || e.shotResult === "Missed")
    ) {
      weights.set(e.playerId, (weights.get(e.playerId) ?? 1) + 1);
    }
  }
  return weights;
}

export function allocateByWeights(
  total: number,
  weights: Map<string, number>,
  playerIds: string[]
): Map<string, number> {
  const out = new Map<string, number>();
  let sumW = 0;
  for (const id of playerIds) sumW += weights.get(id) ?? 1;
  if (sumW <= 0 || playerIds.length === 0) {
    for (const id of playerIds) out.set(id, 0);
    return out;
  }
  for (const id of playerIds) {
    const w = weights.get(id) ?? 1;
    out.set(id, (total * w) / sumW);
  }
  return out;
}

/** Usage-weighted mean role of on-court offense (focal mix; post-M7). */
export function usageWeightedRole(
  offenseIds: string[],
  roles: Map<string, RoleVector> | null
): RoleVector {
  if (!roles || offenseIds.length === 0) return emptyRole();
  const vecs: Array<{ role: RoleVector; w: number }> = [];
  for (const id of offenseIds) {
    const r = roles.get(id);
    if (!r) continue;
    vecs.push({ role: r, w: Math.max(0.05, r.usage) });
  }
  if (vecs.length === 0) return emptyRole();
  const sw = vecs.reduce((s, v) => s + v.w, 0);
  return {
    usage: vecs.reduce((s, v) => s + v.role.usage * v.w, 0) / sw,
    threeRate: vecs.reduce((s, v) => s + v.role.threeRate * v.w, 0) / sw,
    starterRate: vecs.reduce((s, v) => s + v.role.starterRate * v.w, 0) / sw,
    minutesPerGame:
      vecs.reduce((s, v) => s + v.role.minutesPerGame * v.w, 0) / sw,
  };
}

function ensurePlayer(
  map: Map<string, DrblPlayerAccumulator>,
  playerId: string,
  playerName: string,
  teamId: string
): DrblPlayerAccumulator {
  let row = map.get(playerId);
  if (!row) {
    row = {
      playerId,
      playerName,
      teamId,
      possessions: 0,
      offensivePossessions: 0,
      defensivePossessions: 0,
      totalValue: 0,
      offensiveValue: 0,
      defensiveValue: 0,
      leverageValue: 0,
      leverageWeightSum: 0,
      sdvSum: 0,
      sdvN: 0,
      shotMakingSum: 0,
      shotMakingN: 0,
      epvShootSum: 0,
      vContSum: 0,
      creationValue: 0,
      connectionValue: 0,
      conversionOpportunityValue: 0,
      executionValue: 0,
      recoveryValue: 0,
      turnoverValue: 0,
      defenseEventValue: 0,
    };
    map.set(playerId, row);
  }
  return row;
}

/** One combined O/D appearance contribution (research stream reconstruction). */
export type AppearanceContribution = {
  playerId: string;
  gameId: string;
  gameDate: string;
  period: number;
  possessionId: string;
  side: "offense" | "defense";
  /** Stable attributed value for this appearance (points above R1). */
  value: number;
  /**
   * Team identity for this appearance from possession context
   * (offenseTeamId or defenseTeamId). Required for WAR team-stint allocation.
   */
  teamId: string;
  /** Opponent team on the same possession when available. */
  opponentTeamId: string;
  /** Exposure increment for combined N (=1 per appearance). */
  appearanceExposure: 1;
};

export interface AttributeOptions {
  /** R1 pool frozen at a historical cutoff. */
  replacementPool?: ReplacementPool | null;
  /** Per-player role vectors (from M7 accumulators). */
  rolesByPlayer?: Map<string, RoleVector> | null;
  /**
   * Optional research-only hook: one call per combined possession appearance.
   * Must not receive future-block data. Used by reliability-feature reconstruction.
   */
  onAppearance?: (appearance: AppearanceContribution) => void;
}

/**
 * Attribute one game's possessions to on-court players (Approach B baseline +
 * sequential opportunity/execution split for shares).
 */
export function attributeGamePlayerValue(
  box: DrblBoxScore,
  events: DrblEvent[],
  possessions: DrblPossession[],
  into: Map<string, DrblPlayerAccumulator>,
  options: AttributeOptions = {}
): void {
  const nameById = new Map(box.players.map((p) => [p.playerId, p.playerName]));
  const pool = options.replacementPool ?? null;
  const roles = options.rolesByPlayer ?? null;
  const onAppearance = options.onAppearance;

  for (const possession of possessions) {
    const state = stateForPossession(possession, box, events);
    const offenseIds = possession.offensePlayerIds.filter(Boolean);
    const defenseIds = possession.defensePlayerIds.filter(Boolean);

    const role = usageWeightedRole(offenseIds, roles);
    const replacementEp = replacementExpectedPoints(state, role, pool);
    const lev = leverageWeight(state);

    const seq = attributePossessionSequential({
      possession,
      events,
      startEp: replacementEp,
      offensePlayerIds: offenseIds,
      defensePlayerIds: defenseIds,
      nameById,
    });
    const stableByPlayer = aggregateStableByPlayer(seq);
    const byCat = aggregateStableByPlayerAndCategory(seq);

    for (const playerId of offenseIds) {
      const share = stableByPlayer.get(playerId) ?? 0;
      const row = ensurePlayer(
        into,
        playerId,
        nameById.get(playerId) ?? `Player ${playerId}`,
        possession.offenseTeamId
      );
      row.possessions += 1;
      row.offensivePossessions += 1;
      row.offensiveValue += share;
      row.totalValue += share;
      row.leverageValue += share * lev;
      row.leverageWeightSum += lev;
      const cat = byCat.get(playerId) ?? {};
      row.creationValue += cat.creation ?? 0;
      row.connectionValue += cat.connection ?? 0;
      row.conversionOpportunityValue += cat.conversionOpportunity ?? 0;
      row.executionValue += cat.execution ?? 0;
      row.recoveryValue += cat.recovery ?? 0;
      row.turnoverValue += cat.turnover ?? 0;
      onAppearance?.({
        playerId,
        gameId: box.gameId,
        gameDate: box.gameDate || "",
        period: possession.period,
        possessionId: possession.possessionId,
        side: "offense",
        value: share,
        teamId: possession.offenseTeamId,
        opponentTeamId: possession.defenseTeamId,
        appearanceExposure: 1,
      });
    }

    for (const playerId of defenseIds) {
      const share = stableByPlayer.get(playerId) ?? 0;
      const row = ensurePlayer(
        into,
        playerId,
        nameById.get(playerId) ?? `Player ${playerId}`,
        possession.defenseTeamId
      );
      row.possessions += 1;
      row.defensivePossessions += 1;
      row.defensiveValue += share;
      row.totalValue += share;
      row.leverageValue += share * lev;
      row.leverageWeightSum += lev;
      const cat = byCat.get(playerId) ?? {};
      row.defenseEventValue += cat.defense ?? 0;
      onAppearance?.({
        playerId,
        gameId: box.gameId,
        gameDate: box.gameDate || "",
        period: possession.period,
        possessionId: possession.possessionId,
        side: "defense",
        value: share,
        teamId: possession.defenseTeamId,
        opponentTeamId: possession.offenseTeamId,
        appearanceExposure: 1,
      });
    }
  }
}

function empiricalBayesShrink(raw: number, n: number, prior = 0): number {
  const w = n / (n + SHRINKAGE_K);
  return w * raw + (1 - w) * prior;
}

/**
 * Finalize per-player season metrics, then rank the FULL eligible population
 * by `finalRankingScore` before any top-N truncation (rankingFormulaVersion 2.0).
 */
export function finalizePlayerSeasonRows(
  accumulators: Map<string, DrblPlayerAccumulator>,
  options: {
    minPossessions?: number;
    lineupRatingsPer100?: Map<string, number> | null;
    behaviorRatingsPer100?: Map<string, number> | null;
    fusionRatingsPer100?: Map<string, number> | null;
    uncertaintyCalibration?: UncertaintyCalibration | null;
    pointsToWins?: number | null;
    ranking?: Partial<RankingConfig>;
    /** If set, truncate to top N after sorting (default: return all eligible, sorted). */
    leaderboardSize?: number | null;
  } = {}
): DrblPlayerSeasonRow[] {
  const ranking = defaultRankingConfig({
    minimumActualPossessions:
      options.minPossessions ?? defaultRankingConfig().minimumActualPossessions,
    ...(options.pointsToWins != null && options.pointsToWins > 0
      ? {
          // pointsToWins from war.ts is wins/point; convert to points/win.
          pointsPerWin:
            options.pointsToWins <= 1
              ? 1 / options.pointsToWins
              : options.pointsToWins,
        }
      : {}),
    ...options.ranking,
  });
  const lnMap = options.lineupRatingsPer100 ?? null;
  const bMap = options.behaviorRatingsPer100 ?? null;
  const fusionMap = options.fusionRatingsPer100 ?? null;
  const uncCalib = options.uncertaintyCalibration ?? null;

  let totalLev = 0;
  let totalPoss = 0;
  for (const row of accumulators.values()) {
    totalLev += row.leverageWeightSum;
    totalPoss += row.possessions;
  }
  const meanRawLambda = totalPoss > 0 ? totalLev / totalPoss : 1;

  type Draft = {
    acc: DrblPlayerAccumulator;
    rawAbilityRate: number;
    fusedRateRaw: number;
    drblP: number;
    drblLn: number;
    drblB: number;
    hasB: boolean;
    drblO: number;
    drblD: number;
    sdv100: number;
    shotMaking100: number;
    epvShootMean: number;
    vContMean: number;
    seasonalImpact: number;
    drblL: number;
    meanLeverage: number;
    creationValuePer100: number;
    connectionValuePer100: number;
    conversionOpportunityPer100: number;
    executionValuePer100: number;
    recoveryValuePer100: number;
    turnoverValuePer100: number;
    defensiveValuePer100: number;
  };

  const drafts: Draft[] = [];
  for (const acc of accumulators.values()) {
    const n = acc.possessions;
    const raw100 = n > 0 ? (100 * acc.totalValue) / n : 0;
    const rawO =
      acc.offensivePossessions > 0
        ? (100 * acc.offensiveValue) / acc.offensivePossessions
        : 0;
    const rawD =
      acc.defensivePossessions > 0
        ? (100 * acc.defensiveValue) / acc.defensivePossessions
        : 0;

    const drblP = empiricalBayesShrink(raw100, n);
    const drblO = empiricalBayesShrink(rawO, acc.offensivePossessions);
    const drblD = empiricalBayesShrink(rawD, acc.defensivePossessions);
    // Realized impact uses ACTUAL possessions only (= totalValue when replacement=0).
    const seasonalImpact = seasonalImpactFromRawRate(
      raw100 - ranking.replacementLevelRate,
      n
    );

    const drblL =
      meanRawLambda > 1e-12
        ? acc.leverageValue / meanRawLambda
        : acc.leverageValue;
    const meanLeverage =
      meanRawLambda > 1e-12 && n > 0
        ? acc.leverageWeightSum / n / meanRawLambda
        : 1;

    const drblLnRaw = lnMap?.get(acc.playerId) ?? 0;
    const drblLn = empiricalBayesShrink(drblLnRaw, n);
    const hasB = bMap != null && bMap.has(acc.playerId);
    const drblBRaw = hasB ? (bMap!.get(acc.playerId) ?? 0) : 0;
    const drblB = hasB ? empiricalBayesShrink(drblBRaw, n) : 0;
    const liteFused = fusePlayerRating({
      drblP,
      drblLn,
      drblB: hasB ? drblB : undefined,
      possessions: n,
    });
    const fusedRateRaw = fusionMap?.get(acc.playerId) ?? liteFused;

    const sdvRaw = acc.sdvN > 0 ? (100 * acc.sdvSum) / acc.sdvN : 0;
    const makingRaw =
      acc.shotMakingN > 0 ? (100 * acc.shotMakingSum) / acc.shotMakingN : 0;

    drafts.push({
      acc,
      rawAbilityRate: raw100,
      fusedRateRaw,
      drblP,
      drblLn,
      drblB,
      hasB,
      drblO,
      drblD,
      sdv100: empiricalBayesShrink(sdvRaw, acc.sdvN),
      shotMaking100: empiricalBayesShrink(makingRaw, acc.shotMakingN),
      epvShootMean: acc.sdvN > 0 ? acc.epvShootSum / acc.sdvN : 0,
      vContMean: acc.sdvN > 0 ? acc.vContSum / acc.sdvN : 0,
      seasonalImpact,
      drblL,
      meanLeverage,
      creationValuePer100: n > 0 ? (100 * acc.creationValue) / n : 0,
      connectionValuePer100: n > 0 ? (100 * acc.connectionValue) / n : 0,
      conversionOpportunityPer100:
        n > 0 ? (100 * acc.conversionOpportunityValue) / n : 0,
      executionValuePer100: n > 0 ? (100 * acc.executionValue) / n : 0,
      recoveryValuePer100: n > 0 ? (100 * acc.recoveryValue) / n : 0,
      turnoverValuePer100: n > 0 ? (100 * acc.turnoverValue) / n : 0,
      defensiveValuePer100: n > 0 ? (100 * acc.defenseEventValue) / n : 0,
    });
  }

  // Component scale stats for standardized disagreement (comparable z-scores).
  const pVals = drafts.map((d) => d.drblP);
  const lnVals = drafts.map((d) => d.drblLn);
  const bVals = drafts.filter((d) => d.hasB).map((d) => d.drblB);
  const mean = (xs: number[]) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  const sd = (xs: number[]) => {
    if (xs.length < 2) return 1;
    const m = mean(xs);
    return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length) || 1;
  };
  const pMean = mean(pVals);
  const pSd = sd(pVals);
  const lnMean = mean(lnVals);
  const lnSd = sd(lnVals);
  const bMean = mean(bVals);
  const bSd = sd(bVals);

  const evaluated: DrblPlayerSeasonRow[] = [];
  for (const d of drafts) {
    const n = d.acc.possessions;
    // Canonical ability (M16k1): validated P-only EB1600 on rawAbilityRate.
    const validated = computeValidatedAbilityV1({
      rawAbilityRate: d.rawAbilityRate,
      actualCombinedPossessionAppearances: n,
    });
    // Legacy fused EB200 retained as diagnostic posterior only (not canonical).
    const { posterior: legacyPosterior } = empiricalBayesRate(
      d.fusedRateRaw,
      n,
      0,
      ranking.priorEquivalentPossessions
    );

    const comps = [
      { value: d.drblP, mean: pMean, sd: pSd },
      { value: d.drblLn, mean: lnMean, sd: lnSd },
    ];
    if (d.hasB) comps.push({ value: d.drblB, mean: bMean, sd: bSd });
    const componentDisagreementIndex = standardizedDisagreement(comps);

    const samplingSe = abilitySamplingSe(n);
    // Model SE proxy: disagreement index on standardized scale × residual scale.
    const modelSe = componentDisagreementIndex * 2;
    const abilityStandardError = combineStandardErrors(samplingSe, modelSe);
    const { trueHalfWidth, displayHalfWidth } = applyDisplayUncertaintyCap(
      abilityStandardError,
      ranking.intervalCriticalValue
    );
    // Prefer calibrated half-width when available, but never use display cap for analytics.
    let analyticalHalf = trueHalfWidth;
    if (uncCalib) {
      const legacy = predictHalfWidth(
        n,
        componentDisagreementIndex,
        {
          ...uncCalib,
          maxHalfWidth: Number.POSITIVE_INFINITY,
        }
      );
      analyticalHalf = Math.max(legacy, trueHalfWidth * 0.5);
    }

    const seasonWar = warFromImpact(d.seasonalImpact, ranking.pointsPerWin);
    const r1Fields = buildR1ValueFieldsFromAttributed(d.seasonalImpact);
    const forecastPossessions = ranking.forecastPossessions;
    // Forecast uses canonical validated ability (not WAR seasonalImpact).
    const forecastImpact = seasonalImpactFromRawRate(
      validated.validatedDRBL100 - ranking.replacementLevelRate,
      forecastPossessions
    );
    const forecastWar = warFromImpact(forecastImpact, ranking.pointsPerWin);

    const eligible = n >= ranking.minimumActualPossessions;
    const rowBase = {
      posteriorAbilityRate: validated.validatedDRBL100,
      abilityStandardError,
      seasonWar,
      forecastWar,
    };
    const finalRankingScore = finalRankingScoreFor(
      ranking.rankingMode,
      rowBase,
      ranking
    );

    // Full precision until after sort — display rounding only at export.
    evaluated.push({
      playerId: d.acc.playerId,
      playerName: d.acc.playerName,
      teamId: d.acc.teamId,
      possessions: n,
      actualPossessions: n,
      drbl100: validated.validatedDRBL100,
      rawAbilityRate: d.rawAbilityRate,
      posteriorAbilityRate: legacyPosterior,
      fusedRateRaw: d.fusedRateRaw,
      reliabilityWeight: validated.validatedReliability,
      priorMean: VALIDATED_PRIOR_MEAN,
      priorEquivalentPossessions: VALIDATED_K,
      abilityModelVersion: VALIDATED_ABILITY_MODEL_VERSION,
      drblP: d.drblP,
      drblLn: d.drblLn,
      drblB: d.drblB,
      drblO: d.drblO,
      drblD: d.drblD,
      sdv100: d.sdv100,
      shotMaking100: d.shotMaking100,
      epvShootMean: d.epvShootMean,
      vContMean: d.vContMean,
      seasonalImpact: d.seasonalImpact,
      r1Points: r1Fields.r1Points,
      r1WinEquivalents: r1Fields.r1WinEquivalents,
      r1PointValueVersion: r1Fields.r1PointValueVersion,
      r1WinEquivalentVersion: r1Fields.r1WinEquivalentVersion,
      r1PointsPerWin: r1Fields.r1PointsPerWin,
      drblWar: seasonWar,
      legacyDrblWar: seasonWar,
      seasonWar,
      forecastPossessions,
      forecastImpact,
      forecastWar,
      replacementLevelRate: ranking.replacementLevelRate,
      pointsPerWin: ranking.pointsPerWin,
      drblL: d.drblL,
      meanLeverage: d.meanLeverage,
      disagreement: componentDisagreementIndex,
      componentDisagreementIndex,
      abilityStandardError,
      // Legacy analytical half-width around legacy fused posterior — diagnostic only.
      uncertainty: analyticalHalf,
      displayUncertainty: displayHalfWidth,
      intervalLo: legacyPosterior - analyticalHalf,
      intervalHi: legacyPosterior + analyticalHalf,
      intervalConfidence: ranking.intervalConfidence,
      rankingMode: ranking.rankingMode,
      finalRankingScore,
      eligibilityStatus: eligible ? "eligible" : "insufficient_sample",
      eligibilityReason: eligible
        ? "ok"
        : `actualPossessions ${n} < minimum ${ranking.minimumActualPossessions}`,
      rankingFormulaVersion: ranking.rankingFormulaVersion,
      creationValuePer100: d.creationValuePer100,
      connectionValuePer100: d.connectionValuePer100,
      conversionOpportunityPer100: d.conversionOpportunityPer100,
      executionValuePer100: d.executionValuePer100,
      recoveryValuePer100: d.recoveryValuePer100,
      turnoverValuePer100: d.turnoverValuePer100,
      defensiveValuePer100: d.defensiveValuePer100,
      sequentialAttributionVersion: SEQUENTIAL_ATTRIBUTION_VERSION,
      publishedAbilityInput: CANONICAL_ABILITY_INPUT,
      abilityLineageVersion: ABILITY_LINEAGE_VERSION,
    });
  }

  const eligible = evaluated.filter((r) => r.eligibilityStatus === "eligible");
  // Canonical DRBL rank: descending unrounded validatedDRBL100 (tie: N, playerId).
  const sorted = eligible.slice().sort((a, b) => {
    if (b.drbl100 !== a.drbl100) return b.drbl100 - a.drbl100;
    if (b.actualPossessions !== a.actualPossessions) {
      return b.actualPossessions - a.actualPossessions;
    }
    return a.playerId.localeCompare(b.playerId);
  });

  const size = options.leaderboardSize;
  const truncated =
    size != null && size > 0 ? sorted.slice(0, size) : sorted;

  return truncated.map((p, i) => ({
    ...p,
    rank: i + 1,
    // Display rounding only after full-precision sort
    drbl100: Number(p.drbl100.toFixed(2)),
    rawAbilityRate: Number(p.rawAbilityRate.toFixed(4)),
    posteriorAbilityRate: Number(p.posteriorAbilityRate.toFixed(4)),
    fusedRateRaw: Number(p.fusedRateRaw.toFixed(4)),
    reliabilityWeight: Number(p.reliabilityWeight.toFixed(4)),
    drblP: Number(p.drblP.toFixed(2)),
    drblLn: Number(p.drblLn.toFixed(2)),
    drblB: Number(p.drblB.toFixed(2)),
    drblO: Number(p.drblO.toFixed(2)),
    drblD: Number(p.drblD.toFixed(2)),
    sdv100: Number(p.sdv100.toFixed(2)),
    shotMaking100: Number(p.shotMaking100.toFixed(2)),
    epvShootMean: Number(p.epvShootMean.toFixed(3)),
    vContMean: Number(p.vContMean.toFixed(3)),
    seasonalImpact: Number(p.seasonalImpact.toFixed(2)),
    // Canonical R1 fields: full internal precision (no display rounding).
    r1Points: p.r1Points,
    r1WinEquivalents: p.r1WinEquivalents,
    r1PointValueVersion: p.r1PointValueVersion ?? R1_POINT_VALUE_VERSION,
    r1WinEquivalentVersion:
      p.r1WinEquivalentVersion ?? R1_WIN_EQUIVALENT_VERSION,
    r1PointsPerWin: p.r1PointsPerWin ?? R1_POINTS_PER_WIN,
    drblWar: Number(p.drblWar.toFixed(2)),
    legacyDrblWar: Number((p.legacyDrblWar ?? p.drblWar).toFixed(2)),
    seasonWar: Number(p.seasonWar.toFixed(2)),
    forecastImpact: Number(p.forecastImpact.toFixed(2)),
    forecastWar: Number(p.forecastWar.toFixed(2)),
    drblL: Number(p.drblL.toFixed(2)),
    meanLeverage: Number(p.meanLeverage.toFixed(3)),
    disagreement: Number(p.disagreement.toFixed(2)),
    componentDisagreementIndex: Number(
      p.componentDisagreementIndex.toFixed(2)
    ),
    abilityStandardError: Number(p.abilityStandardError.toFixed(4)),
    uncertainty: Number(p.uncertainty.toFixed(2)),
    displayUncertainty: Number(p.displayUncertainty.toFixed(2)),
    intervalLo: Number(p.intervalLo.toFixed(2)),
    intervalHi: Number(p.intervalHi.toFixed(2)),
    finalRankingScore: Number(p.finalRankingScore.toFixed(6)),
    creationValuePer100: Number(p.creationValuePer100.toFixed(2)),
    connectionValuePer100: Number(p.connectionValuePer100.toFixed(2)),
    conversionOpportunityPer100: Number(
      p.conversionOpportunityPer100.toFixed(2)
    ),
    executionValuePer100: Number(p.executionValuePer100.toFixed(2)),
    recoveryValuePer100: Number(p.recoveryValuePer100.toFixed(2)),
    turnoverValuePer100: Number(p.turnoverValuePer100.toFixed(2)),
    defensiveValuePer100: Number(p.defensiveValuePer100.toFixed(2)),
  }));
}

/** Season-level λ normalization summary for the leverage artifact. */
export function summarizeLeverageFromAccumulators(
  accumulators: Map<string, DrblPlayerAccumulator>
): {
  meanRawLambda: number;
  minRawLambda: number;
  maxRawLambda: number;
  possessions: number;
} {
  let totalLev = 0;
  let totalPoss = 0;
  let minRaw = Number.POSITIVE_INFINITY;
  let maxRaw = 0;
  for (const row of accumulators.values()) {
    totalLev += row.leverageWeightSum;
    totalPoss += row.possessions;
    if (row.possessions <= 0) continue;
    const mean = row.leverageWeightSum / row.possessions;
    minRaw = Math.min(minRaw, mean);
    maxRaw = Math.max(maxRaw, mean);
  }
  return {
    meanRawLambda: totalPoss > 0 ? totalLev / totalPoss : 1,
    minRawLambda: Number.isFinite(minRaw) ? minRaw : 0,
    maxRawLambda: maxRaw,
    possessions: totalPoss,
  };
}

/** @deprecated alias — prefer predictExpectedPoints via expected-points. */
export { predictExpectedPoints };
