/**
 * Bundled ESPN conference standings for Cloudflare Workers (no node:fs).
 * Lives under public/runtime (ASSETS) so the ~27KB JSON stays off the Worker.
 */
import type { LeagueStandings } from "@/data/types/standings";

type SnapshotFile = {
  version?: number;
  generatedAt?: string;
  source?: string;
  seasons?: Record<string, LeagueStandings>;
};

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const ASSET_PATH = "/runtime/standings-snapshot.json";

let data: SnapshotFile | null | undefined;

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

function loadFromPublicDir(): SnapshotFile | null {
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
      "standings-snapshot.json"
    );
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as SnapshotFile;
  } catch {
    return null;
  }
}

async function loadFromAssets(): Promise<SnapshotFile | null> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(`https://assets.local${ASSET_PATH}`);
    if (!response.ok) return null;
    return (await response.json()) as SnapshotFile;
  } catch {
    return null;
  }
}

function tryPrimeFromDisk(): void {
  if (data !== undefined) return;
  const file = loadFromPublicDir();
  if (file) data = file;
}

export async function ensureStandingsSnapshot(): Promise<boolean> {
  if (data !== undefined) return data != null;
  const fromDisk = loadFromPublicDir();
  if (fromDisk) {
    data = fromDisk;
    return true;
  }
  data = await loadFromAssets();
  return data != null;
}

export function runtimeStandingsMeta() {
  tryPrimeFromDisk();
  return {
    generatedAt: data?.generatedAt ?? null,
    source: data?.source ?? null,
    seasons: Object.keys(data?.seasons ?? {}),
  };
}

export function getRuntimeStandings(season: string): LeagueStandings | null {
  tryPrimeFromDisk();
  const hit = data?.seasons?.[season];
  if (!hit?.conferences?.length) return null;
  const rowCount = hit.conferences.reduce(
    (count, conference) => count + conference.rows.length,
    0
  );
  return rowCount > 0 ? hit : null;
}

export function hasRuntimeStandings(season: string): boolean {
  return getRuntimeStandings(season) != null;
}
