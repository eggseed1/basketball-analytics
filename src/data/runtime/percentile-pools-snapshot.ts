/**
 * Baked per-season peer pools for player percentile series.
 * Built by scripts/build-runtime-percentile-pools.ts from the same bundled
 * boards the edge percentile API ranks against.
 *
 * JSON is copied to public/runtime for Workers Static Assets — do not
 * static-import.
 */
import { loadRuntimeJson } from "./load-runtime-json";

type PercentilePoolsSnapshot = {
  version: number;
  generatedAt: string;
  /** season → metric id → 101 quantile cutoffs (0th..100th). */
  seasons: Record<string, Record<string, number[]>>;
};

let pools: PercentilePoolsSnapshot | null = null;
let loadPromise: Promise<PercentilePoolsSnapshot> | null = null;

const EMPTY: PercentilePoolsSnapshot = {
  version: 0,
  generatedAt: "",
  seasons: {},
};

async function ensurePools(): Promise<PercentilePoolsSnapshot> {
  if (pools) return pools;
  if (!loadPromise) {
    loadPromise = (async () => {
      pools =
        (await loadRuntimeJson<PercentilePoolsSnapshot>(
          "percentile-pools-snapshot.json"
        )) ?? EMPTY;
      return pools;
    })();
  }
  return loadPromise;
}

export async function bundledSeasonCutoffs(
  season: string,
  metricId: string
): Promise<readonly number[] | undefined> {
  const data = await ensurePools();
  return data.seasons[season]?.[metricId];
}

/** Sync read after {@link bundledSeasonCutoffs} / ensurePools has warmed the cache. */
export function bundledSeasonCutoffsSync(
  season: string,
  metricId: string
): readonly number[] | undefined {
  return pools?.seasons[season]?.[metricId];
}
