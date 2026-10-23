/**
 * Deploy-baked NBA draft picks since 1990 (stats.nba.com drafthistory).
 * Written by scripts/build-runtime-draft-history-snapshot.mjs.
 * Lives under public/runtime (ASSETS) so the ~95KB JSON stays off the Worker.
 */

export type BundledDraftPick = {
  nbaId: string;
  name: string;
  year: number;
  round: number;
  roundPick: number;
  overall: number;
  /** Team that made the pick, as NBA abbreviates it that year. */
  teamAbbr: string;
};

type DraftHistoryFile = {
  generatedAt?: string;
  picks?: Array<[string, string, number, number, number, number, string]>;
};

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const ASSET_PATH = "/runtime/draft-history-snapshot.json";

let fileData: DraftHistoryFile | null | undefined;
let cached: BundledDraftPick[] | null = null;

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

function loadFromPublicDir(): DraftHistoryFile | null {
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
      "draft-history-snapshot.json"
    );
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as DraftHistoryFile;
  } catch {
    return null;
  }
}

async function loadFromAssets(): Promise<DraftHistoryFile | null> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(`https://assets.local${ASSET_PATH}`);
    if (!response.ok) return null;
    return (await response.json()) as DraftHistoryFile;
  } catch {
    return null;
  }
}

function apply(file: DraftHistoryFile | null): boolean {
  fileData = file;
  cached = null;
  return file != null;
}

function tryPrimeFromDisk(): void {
  if (fileData !== undefined) return;
  const file = loadFromPublicDir();
  if (file) apply(file);
}

export async function ensureDraftHistorySnapshot(): Promise<boolean> {
  if (fileData !== undefined) return fileData != null;
  const fromDisk = loadFromPublicDir();
  if (fromDisk) return apply(fromDisk);
  return apply(await loadFromAssets());
}

export function bundledDraftPicks(): BundledDraftPick[] {
  tryPrimeFromDisk();
  if (cached) return cached;
  const rows = fileData?.picks ?? [];
  cached = rows.map(([nbaId, name, year, round, roundPick, overall, teamAbbr]) => ({
    nbaId,
    name,
    year,
    round,
    roundPick,
    overall,
    teamAbbr,
  }));
  return cached;
}
