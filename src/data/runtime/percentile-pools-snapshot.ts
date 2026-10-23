/**
 * Baked per-season peer pools for player percentile series.
 * Built by scripts/build-runtime-percentile-pools.ts from the same bundled
 * boards the edge percentile API ranks against.
 *
 * Lives under public/runtime (ASSETS) so the ~884KB JSON stays off the
 * Worker isolate; Node reads the same file from disk.
 */

type PercentilePoolsSnapshot = {
  version: number;
  generatedAt: string;
  /** season → metric id → 101 quantile cutoffs (0th..100th). */
  seasons: Record<string, Record<string, number[]>>;
};

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const ASSET_PATH = "/runtime/percentile-pools-snapshot.json";

let pools: PercentilePoolsSnapshot | null | undefined;
/** Dedupes concurrent first loads; null miss is not sticky (retry next request). */
let poolsInflight: Promise<boolean> | null = null;

function cloudflareAssets(): AssetsFetcher | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare") as {
      getCloudflareContext: () => { env?: { ASSETS?: AssetsFetcher } };
    };
    return getCloudflareContext()?.env?.ASSETS ?? null;
  } catch {
    return null;
  }
}

function loadFromPublicDir(): PercentilePoolsSnapshot | null {
  try {
    if (process.env.NEXT_RUNTIME === "edge") return null;
    // eslint-disable-next-line no-eval
    const req = eval("require") as NodeRequire;
    const fs = req("node:fs") as typeof import("node:fs");
    const path = req("node:path") as typeof import("node:path");
    const file = path.join(
      process.cwd(),
      "public",
      "runtime",
      "percentile-pools-snapshot.json"
    );
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as PercentilePoolsSnapshot;
  } catch {
    return null;
  }
}

async function loadFromAssets(): Promise<PercentilePoolsSnapshot | null> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(`https://assets.local${ASSET_PATH}`);
    if (!response.ok) return null;
    return (await response.json()) as PercentilePoolsSnapshot;
  } catch {
    return null;
  }
}

export async function ensurePercentilePools(): Promise<boolean> {
  if (pools != null) return true;
  if (poolsInflight) return poolsInflight;
  // Clear inflight in promise.finally AFTER this assignment. An async IIFE's
  // own `finally` runs before the outer `inflight = …` completes when the body
  // has no await, which would leave a settled miss stuck forever.
  const pending = (async () => {
    const fromDisk = loadFromPublicDir();
    const loaded = fromDisk ?? (await loadFromAssets());
    if (loaded) {
      pools = loaded;
      return true;
    }
    // Transient ASSETS miss — leave `pools` unset so the next request retries.
    return false;
  })();
  poolsInflight = pending;
  void pending.finally(() => {
    if (poolsInflight === pending) poolsInflight = null;
  });
  return pending;
}

export function bundledSeasonCutoffs(
  season: string,
  metricId: string
): readonly number[] | undefined {
  return pools?.seasons[season]?.[metricId];
}
