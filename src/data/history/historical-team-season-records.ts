/**
 * Bundled pre-ESPN-board team season W-L (Basketball-Reference standings).
 * Used when stats.nba.com is unavailable (Vercel / blocked egress).
 * Lives under public/runtime (ASSETS) so the ~152KB JSON stays off the Worker.
 */

export type BundledHistoricalTeamSeasonRow = {
  brefAbbr: string;
  displayName: string;
  conference: "East" | "West" | null;
  wins: number;
  losses: number;
};

type BundleShape = {
  seasons?: Record<string, BundledHistoricalTeamSeasonRow[]>;
};

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const ASSET_PATH = "/runtime/historical-team-season-records.json";

let seasons: Record<string, BundledHistoricalTeamSeasonRow[]> | null | undefined;

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

function loadFromPublicDir(): BundleShape | null {
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
      "historical-team-season-records.json"
    );
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as BundleShape;
  } catch {
    return null;
  }
}

async function loadFromAssets(): Promise<BundleShape | null> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(`https://assets.local${ASSET_PATH}`);
    if (!response.ok) return null;
    return (await response.json()) as BundleShape;
  } catch {
    return null;
  }
}

function apply(file: BundleShape | null): boolean {
  seasons =
    file?.seasons && typeof file.seasons === "object" ? file.seasons : {};
  return file != null;
}

function tryPrimeFromDisk(): void {
  if (seasons !== undefined) return;
  const file = loadFromPublicDir();
  if (file) apply(file);
}

export async function ensureHistoricalTeamSeasonRecords(): Promise<boolean> {
  if (seasons !== undefined) return seasons != null;
  const fromDisk = loadFromPublicDir();
  if (fromDisk) return apply(fromDisk);
  return apply(await loadFromAssets());
}

export function getBundledHistoricalTeamSeasonRecords(
  season: string
): BundledHistoricalTeamSeasonRow[] {
  tryPrimeFromDisk();
  const rows = seasons?.[season];
  if (!rows || rows.length === 0) return [];
  return rows.map((row) => ({
    brefAbbr: row.brefAbbr,
    displayName: row.displayName,
    conference:
      row.conference === "East" || row.conference === "West"
        ? row.conference
        : null,
    wins: row.wins,
    losses: row.losses,
  }));
}
