/**
 * Research prediction-time reliability features v1 (M16i3).
 *
 * Outcome-blind: functions accept ONLY a chronological historical
 * Approach-B appearance stream. No future target / residual / WIS inputs.
 */

import type { AppearanceContribution } from "./player-value";
import { RESEARCH_RATE_VERSION } from "./research-rate-v1";

export const RELIABILITY_FEATURES_VERSION = "drbl-reliability-features-v1";
export const R1_SEGMENT_COUNT = 4;

export type HistoricalAppearanceStream = {
  /** Chronological combined-appearance contributions for ONE player. */
  appearances: AppearanceContribution[];
};

export type ReliabilityFeatureValue = {
  value: number | null;
  available: boolean;
  reasonIfMissing?: string;
};

/** Deterministic equal-count segment sizes (differ by at most 1). */
export function equalSegmentSizes(n: number, k: number): number[] {
  if (k <= 0) throw new Error("segment count must be positive");
  const base = Math.floor(n / k);
  const rem = n % k;
  return Array.from({ length: k }, (_, i) => base + (i < rem ? 1 : 0));
}

export function streamAccounting(stream: HistoricalAppearanceStream): {
  N: number;
  totalValue: number;
  rawAbilityRate: number;
  maxGameDate: string;
} {
  const apps = stream.appearances;
  const N = apps.length;
  let totalValue = 0;
  let maxGameDate = "";
  for (const a of apps) {
    totalValue += a.value;
    if (a.gameDate > maxGameDate) maxGameDate = a.gameDate;
  }
  return {
    N,
    totalValue,
    rawAbilityRate: N > 0 ? (100 * totalValue) / N : NaN,
    maxGameDate,
  };
}

/**
 * R1 — weighted population SD of K=4 chronological equal-exposure segment rates.
 */
export function computeTemporalSegmentDispersion(
  stream: HistoricalAppearanceStream
): ReliabilityFeatureValue & {
  segmentNs?: number[];
  segmentRates?: number[];
  pBar?: number;
} {
  const apps = stream.appearances;
  const N = apps.length;
  if (N < R1_SEGMENT_COUNT) {
    return {
      value: null,
      available: false,
      reasonIfMissing: `N<${R1_SEGMENT_COUNT}`,
    };
  }
  const sizes = equalSegmentSizes(N, R1_SEGMENT_COUNT);
  if (sizes.some((s) => s <= 0)) {
    return {
      value: null,
      available: false,
      reasonIfMissing: "empty_segment",
    };
  }
  const segmentNs = sizes;
  const segmentRates: number[] = [];
  let offset = 0;
  let totalValue = 0;
  for (const nS of sizes) {
    let sum = 0;
    for (let i = 0; i < nS; i++) sum += apps[offset + i]!.value;
    offset += nS;
    totalValue += sum;
    segmentRates.push((100 * sum) / nS);
  }
  const pBar = (100 * totalValue) / N;
  let acc = 0;
  for (let s = 0; s < R1_SEGMENT_COUNT; s++) {
    const d = segmentRates[s]! - pBar;
    acc += segmentNs[s]! * d * d;
  }
  const dispersion = Math.sqrt(acc / N);
  return {
    value: dispersion,
    available: true,
    segmentNs,
    segmentRates,
    pBar,
  };
}

/**
 * R2 — absolute chronological half-split shift in raw P (points/100).
 */
export function computeSplitHalfPShift(
  stream: HistoricalAppearanceStream
): ReliabilityFeatureValue & {
  nEarly?: number;
  nLate?: number;
  pEarly?: number;
  pLate?: number;
} {
  const apps = stream.appearances;
  const N = apps.length;
  if (N < 2) {
    return { value: null, available: false, reasonIfMissing: "N<2" };
  }
  const nEarly = Math.floor(N / 2);
  const nLate = N - nEarly;
  if (nEarly < 1 || nLate < 1) {
    return {
      value: null,
      available: false,
      reasonIfMissing: "empty_half",
    };
  }
  let earlyValue = 0;
  for (let i = 0; i < nEarly; i++) earlyValue += apps[i]!.value;
  let lateValue = 0;
  for (let i = nEarly; i < N; i++) lateValue += apps[i]!.value;
  const pEarly = (100 * earlyValue) / nEarly;
  const pLate = (100 * lateValue) / nLate;
  return {
    value: Math.abs(pLate - pEarly),
    available: true,
    nEarly,
    nLate,
    pEarly,
    pLate,
  };
}

/**
 * R3 — population SD of appearance-level values, scaled to points/100.
 * Requires exact count=N appearance stream identity.
 */
export function computeAppearanceValueDispersion(
  stream: HistoricalAppearanceStream
): ReliabilityFeatureValue & { meanV?: number } {
  const apps = stream.appearances;
  const N = apps.length;
  if (N < 1) {
    return { value: null, available: false, reasonIfMissing: "N<1" };
  }
  let sum = 0;
  for (const a of apps) sum += a.value;
  const meanV = sum / N;
  let acc = 0;
  for (const a of apps) {
    const d = a.value - meanV;
    acc += d * d;
  }
  const sd = Math.sqrt(acc / N);
  return {
    value: 100 * sd,
    available: true,
    meanV,
  };
}

export const RELIABILITY_FEATURE_META = {
  version: RELIABILITY_FEATURES_VERSION,
  segmentCount: R1_SEGMENT_COUNT,
  halfSplitRule: "early = first floor(N/2); late = remainder; absolute shift",
  appearanceDispersion: "100 * population SD of appearance values v_j",
  exposureDefinition: "actual historical combined possession appearances N",
  pointEstimateVersion: RESEARCH_RATE_VERSION,
  outcomeBlind: true as const,
};

/** Build a synthetic chronological stream from values (tests only). */
export function syntheticStreamFromValues(
  values: number[],
  playerId = "p0"
): HistoricalAppearanceStream {
  return {
    appearances: values.map((value, i) => ({
      playerId,
      gameId: `g${i}`,
      gameDate: `2024-10-${String((i % 28) + 1).padStart(2, "0")}`,
      period: 1,
      possessionId: `poss${i}`,
      side: i % 2 === 0 ? ("offense" as const) : ("defense" as const),
      value,
      teamId: "1610612747",
      opponentTeamId: "1610612738",
      appearanceExposure: 1 as const,
    })),
  };
}
