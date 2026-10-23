/**
 * NBA hustle tracking for Cloudflare Workers.
 * Lives under public/runtime (ASSETS) so the ~172KB JSON stays off the
 * Worker isolate; Node reads the same file from disk.
 *
 * Row: [nbaId, teamId, contested, defl, charges, scrAst, loose, boxOuts, gp]
 */
import type { HustleSeasonPatch } from "@/data/transformers/hustle-stats";

type HustleSlimRow = [
  string,
  string,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number,
];

type HustleOverlayFile = {
  version?: number;
  generatedAt?: string;
  seasons?: Record<string, HustleSlimRow[]>;
};

export type BundledHustlePlayerRow = {
  playerId: string;
  teamId: string;
  gamesPlayed: number;
  patch: Partial<HustleSeasonPatch>;
};

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const ASSET_PATH = "/runtime/hustle-overlay-snapshot.json";

let data: HustleOverlayFile | null | undefined;
let seasons: Record<string, HustleSlimRow[]> = {};
const seasonCache = new Map<string, BundledHustlePlayerRow[]>();

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

function loadFromPublicDir(): HustleOverlayFile | null {
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
      "hustle-overlay-snapshot.json"
    );
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as HustleOverlayFile;
  } catch {
    return null;
  }
}

async function loadFromAssets(): Promise<HustleOverlayFile | null> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(`https://assets.local${ASSET_PATH}`);
    if (!response.ok) return null;
    return (await response.json()) as HustleOverlayFile;
  } catch {
    return null;
  }
}

function apply(file: HustleOverlayFile | null): boolean {
  data = file;
  seasons =
    file?.seasons && typeof file.seasons === "object" ? file.seasons : {};
  seasonCache.clear();
  return file != null;
}

function tryPrimeFromDisk(): void {
  if (data !== undefined) return;
  const file = loadFromPublicDir();
  if (file) apply(file);
}

export async function ensureHustleOverlay(): Promise<boolean> {
  if (data !== undefined) return data != null;
  const fromDisk = loadFromPublicDir();
  if (fromDisk) return apply(fromDisk);
  return apply(await loadFromAssets());
}

function rowToPlayer(row: HustleSlimRow): BundledHustlePlayerRow {
  const [
    playerId,
    teamId,
    contested,
    deflections,
    charges,
    screens,
    loose,
    boxOuts,
    gp,
  ] = row;
  const patch: Partial<HustleSeasonPatch> = {};
  if (contested != null) patch.hustleContestedShots = contested;
  if (deflections != null) patch.hustleDeflections = deflections;
  if (charges != null) patch.hustleChargesDrawn = charges;
  if (screens != null) patch.hustleScreenAssists = screens;
  if (loose != null) patch.hustleLooseBallsRecovered = loose;
  if (boxOuts != null) patch.hustleBoxOuts = boxOuts;
  return {
    playerId,
    teamId,
    gamesPlayed: gp,
    patch,
  };
}

export function getBundledHustleSeason(season: string): BundledHustlePlayerRow[] {
  tryPrimeFromDisk();
  const key = String(season ?? "").trim();
  if (!key) return [];
  const cached = seasonCache.get(key);
  if (cached) return cached;
  const rows = (seasons[key] ?? [])
    .filter((row) => row?.[0] && Object.keys(rowToPlayer(row).patch).length > 0)
    .map(rowToPlayer);
  seasonCache.set(key, rows);
  return rows;
}

export function bundledHustleOverlayMeta() {
  tryPrimeFromDisk();
  return {
    version: data?.version ?? 0,
    generatedAt: data?.generatedAt ?? null,
    seasons: Object.keys(seasons),
  };
}
