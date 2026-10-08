/**
 * Baked per-season peer pools for player percentile series.
 * Built by scripts/build-runtime-percentile-pools.ts from the same bundled
 * boards the edge percentile API ranks against.
 */
import snapshot from "./percentile-pools-snapshot.json";

type PercentilePoolsSnapshot = {
  version: number;
  generatedAt: string;
  /** season → metric id → 101 quantile cutoffs (0th..100th). */
  seasons: Record<string, Record<string, number[]>>;
};

const pools = snapshot as PercentilePoolsSnapshot;

export function bundledSeasonCutoffs(
  season: string,
  metricId: string
): readonly number[] | undefined {
  return pools.seasons[season]?.[metricId];
}
