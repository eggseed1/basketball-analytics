/**
 * Possession reconstruction calibration — sampling, grading helpers, aggregates.
 * Network-free pure helpers; live audit lives in scripts/audit-possession-reconstruction.ts.
 */

import type {
  OfficialPossessionResult,
  PossessionCalibrationGrade,
  ReconstructedPossessionResult,
} from "./product-types";
import { calibrationGradeFromDeltas } from "./official-possessions";

export type CalibrationGameRow = {
  gameId: string;
  season: string;
  date: string | null;
  seasonType: "regular" | "playoffs" | "unknown";
  periods: number | null;
  pbpSource: string | null;
  boxSource: string | null;
  advancedBoxSource: string | null;
  rawEventCount: number | null;
  normalizedEventCount: number | null;
  reconstructedHome: number | null;
  reconstructedAway: number | null;
  officialHome: number | null;
  officialAway: number | null;
  deltaHome: number | null;
  deltaAway: number | null;
  absDeltaHome: number | null;
  absDeltaAway: number | null;
  calibrationGrade: PossessionCalibrationGrade | "fetch_failed" | "reconstruct_failed";
  scoreConservationOk: boolean | null;
  lineupValid: boolean | null;
  unknownEventCount: number | null;
  droppedEventCount: number | null;
  unresolvedFreeThrowCount: number | null;
  duplicateActionWarnings: number | null;
  duplicateOrderWarnings: number | null;
  technicalFtCount: number | null;
  flagrantFtCount: number | null;
  editedEventCount: number | null;
  failureReason: string | null;
  elapsedMs: number;
  comparable: boolean;
};

export type CalibrationAggregateStats = {
  attemptedGames: number;
  successfullyFetched: number;
  successfullyReconstructed: number;
  officialTotalsAvailable: number;
  comparableGames: number;
  exactMatchPct: number | null;
  withinOnePct: number | null;
  withinTwoPct: number | null;
  outsideTwoPct: number | null;
  meanSignedError: number | null;
  meanAbsoluteError: number | null;
  medianAbsoluteError: number | null;
  p95AbsoluteError: number | null;
  maxAbsoluteError: number | null;
  meanSignedHomeBias: number | null;
  meanSignedAwayBias: number | null;
  reconstructionFailureRate: number | null;
  officialTotalAvailabilityRate: number | null;
};

/** Mulberry32 — deterministic PRNG for reproducible sampling. */
export function createSeededRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic sample without replacement.
 * Stable across runs for the same seed + input order.
 */
export function sampleDeterministic<T>(
  items: readonly T[],
  count: number,
  seed: number
): T[] {
  if (count <= 0 || items.length === 0) return [];
  if (count >= items.length) return [...items];
  const rng = createSeededRng(seed);
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy.slice(0, count);
}

export function seasonEra(season: string): string {
  const start = Number(season.slice(0, 4));
  if (!Number.isFinite(start)) return "unknown";
  if (start <= 1999) return "early_stats_nba";
  if (start <= 2009) return "early_2000s";
  if (start <= 2013) return "pre_tracking_modern";
  if (start <= 2017) return "mid_2010s";
  if (start <= 2021) return "cdn_transition";
  return "cdn_supported_recent";
}

export function gradeFromOfficialAndDerived(
  official: OfficialPossessionResult,
  reconstructed: ReconstructedPossessionResult
): PossessionCalibrationGrade {
  if (
    official.status !== "available" ||
    reconstructed.status !== "available"
  ) {
    return "not_comparable";
  }
  return calibrationGradeFromDeltas({
    official: { home: official.home, away: official.away },
    derived: { home: reconstructed.home, away: reconstructed.away },
  });
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[idx]!;
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

/** Aggregate accuracy over comparable team-game deltas (home+away treated as observations). */
export function aggregateCalibrationStats(
  rows: CalibrationGameRow[]
): CalibrationAggregateStats {
  const attemptedGames = rows.length;
  const successfullyFetched = rows.filter(
    (r) => r.failureReason !== "pbp_fetch_failed" && r.rawEventCount != null
  ).length;
  const successfullyReconstructed = rows.filter(
    (r) =>
      r.reconstructedHome != null &&
      r.reconstructedAway != null &&
      r.calibrationGrade !== "reconstruct_failed" &&
      r.calibrationGrade !== "fetch_failed"
  ).length;
  const officialTotalsAvailable = rows.filter(
    (r) => r.officialHome != null && r.officialAway != null
  ).length;
  const comparable = rows.filter((r) => r.comparable);
  const comparableGames = comparable.length;

  const exact = comparable.filter((r) => r.calibrationGrade === "exact").length;
  const withinOne = comparable.filter(
    (r) =>
      r.calibrationGrade === "exact" || r.calibrationGrade === "within_one"
  ).length;
  const withinTwo = comparable.filter((r) => {
    if (r.absDeltaHome == null || r.absDeltaAway == null) return false;
    return r.absDeltaHome <= 2 && r.absDeltaAway <= 2;
  }).length;
  const outsideTwo = comparable.filter((r) => {
    if (r.absDeltaHome == null || r.absDeltaAway == null) return false;
    return r.absDeltaHome > 2 || r.absDeltaAway > 2;
  }).length;

  const signed: number[] = [];
  const abs: number[] = [];
  const homeSigned: number[] = [];
  const awaySigned: number[] = [];
  for (const row of comparable) {
    if (row.deltaHome == null || row.deltaAway == null) continue;
    signed.push(row.deltaHome, row.deltaAway);
    abs.push(Math.abs(row.deltaHome), Math.abs(row.deltaAway));
    homeSigned.push(row.deltaHome);
    awaySigned.push(row.deltaAway);
  }
  const absSorted = [...abs].sort((a, b) => a - b);

  const pct = (n: number) =>
    comparableGames > 0 ? (100 * n) / comparableGames : null;

  return {
    attemptedGames,
    successfullyFetched,
    successfullyReconstructed,
    officialTotalsAvailable,
    comparableGames,
    exactMatchPct: pct(exact),
    withinOnePct: pct(withinOne),
    withinTwoPct: pct(withinTwo),
    outsideTwoPct: pct(outsideTwo),
    meanSignedError: mean(signed),
    meanAbsoluteError: mean(abs),
    medianAbsoluteError: median(abs),
    p95AbsoluteError: percentile(absSorted, 95),
    maxAbsoluteError: absSorted.length ? absSorted[absSorted.length - 1]! : null,
    meanSignedHomeBias: mean(homeSigned),
    meanSignedAwayBias: mean(awaySigned),
    reconstructionFailureRate:
      attemptedGames > 0
        ? (attemptedGames - successfullyReconstructed) / attemptedGames
        : null,
    officialTotalAvailabilityRate:
      attemptedGames > 0 ? officialTotalsAvailable / attemptedGames : null,
  };
}

export function groupRowsBy(
  rows: CalibrationGameRow[],
  keyFn: (row: CalibrationGameRow) => string
): Record<string, CalibrationAggregateStats> {
  const groups = new Map<string, CalibrationGameRow[]>();
  for (const row of rows) {
    const key = keyFn(row);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  const out: Record<string, CalibrationAggregateStats> = {};
  for (const [key, list] of groups) {
    out[key] = aggregateCalibrationStats(list);
  }
  return out;
}

export function worstComparableGames(
  rows: CalibrationGameRow[],
  limit = 15
): CalibrationGameRow[] {
  return [...rows]
    .filter((r) => r.comparable)
    .sort((a, b) => {
      const aMax = Math.max(a.absDeltaHome ?? 0, a.absDeltaAway ?? 0);
      const bMax = Math.max(b.absDeltaHome ?? 0, b.absDeltaAway ?? 0);
      return bMax - aMax;
    })
    .slice(0, limit);
}

/** Assert reconstructed counts are never used as official aggregates. */
export function officialIsNotReconstructedCount(
  official: OfficialPossessionResult,
  reconstructed: ReconstructedPossessionResult
): boolean {
  if (official.status !== "available") return true;
  if (reconstructed.status !== "available") return true;
  // Structural check: official carries provider definition; counts may coincide
  // numerically but must not share the reconstructed definition tag.
  return official.definition === "provider_reported";
}
