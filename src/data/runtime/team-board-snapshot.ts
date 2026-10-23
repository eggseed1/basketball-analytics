/**
 * ESPN by-team board payloads for Cloudflare Workers.
 * Lives under public/runtime (ASSETS) so the ~1.5MB JSON stays off the
 * Worker isolate upload; Node reads the same file from disk.
 */
type ByTeamPayload = {
  teams?: unknown[];
  categories?: unknown[];
};

type SnapshotFile = {
  version?: number;
  generatedAt?: string;
  source?: string;
  seasons?: Record<string, ByTeamPayload>;
};

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const ASSET_PATH = "/runtime/team-board-snapshot.json";

let cached: SnapshotFile | null | undefined;

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

/** Node-only disk read — keep `node:fs` off the webpack graph. */
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
      "team-board-snapshot.json"
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

async function ensureSnapshot(): Promise<SnapshotFile | null> {
  if (cached !== undefined) return cached;
  const fromDisk = loadFromPublicDir();
  if (fromDisk) {
    cached = fromDisk;
    return cached;
  }
  const fromAssets = await loadFromAssets();
  cached = fromAssets;
  return cached;
}

export async function runtimeTeamBoardMeta() {
  const data = await ensureSnapshot();
  return {
    generatedAt: data?.generatedAt ?? null,
    source: data?.source ?? null,
    seasons: Object.keys(data?.seasons ?? {}),
  };
}

export async function getRuntimeTeamBoardPayload(
  season: string
): Promise<ByTeamPayload | null> {
  const data = await ensureSnapshot();
  const hit = data?.seasons?.[season];
  if (!hit || !Array.isArray(hit.teams) || hit.teams.length === 0) return null;
  return hit;
}

export async function hasRuntimeTeamBoard(season: string): Promise<boolean> {
  return (await getRuntimeTeamBoardPayload(season)) != null;
}
