/**
 * Slim player name index for header / explore search on Cloudflare.
 * Built from modern BRef boards + all-era BRef letter index in
 * build-runtime-cf-assets.mjs — keep off the 10MB advanced module.
 *
 * Lives under public/runtime (ASSETS) so the ~324KB JSON stays off the
 * Worker isolate; Node reads the same file from disk.
 *
 * Row: [id, name, team, lastSeason, minutes, firstSeason?]
 */

type SearchSlimRow =
  | [string, string, string, string, number]
  | [string, string, string, string, number, string];

type SearchSnapshotFile = {
  version?: number;
  generatedAt?: string;
  players?: SearchSlimRow[];
};

export type PlayerSearchIndexRow = {
  id: string;
  name: string;
  nameLower: string;
  team: string;
  season: string;
  minutes: number;
  /** Earliest known season when present (all-era index). */
  firstSeason?: string;
};

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const ASSET_PATH = "/runtime/player-search-snapshot.json";

let data: SearchSnapshotFile | null | undefined;
let raw: SearchSlimRow[] = [];
let cached: PlayerSearchIndexRow[] | null = null;
const bySeasonCache = new Map<string, PlayerSearchIndexRow[]>();
let byLooseName: Map<string, PlayerSearchIndexRow[]> | null = null;

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

function loadFromPublicDir(): SearchSnapshotFile | null {
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
      "player-search-snapshot.json"
    );
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as SearchSnapshotFile;
  } catch {
    return null;
  }
}

async function loadFromAssets(): Promise<SearchSnapshotFile | null> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(`https://assets.local${ASSET_PATH}`);
    if (!response.ok) return null;
    return (await response.json()) as SearchSnapshotFile;
  } catch {
    return null;
  }
}

function applySnapshot(file: SearchSnapshotFile | null): boolean {
  data = file;
  raw = Array.isArray(file?.players) ? file!.players! : [];
  cached = null;
  bySeasonCache.clear();
  byLooseName = null;
  return file != null;
}

function tryPrimeFromDisk(): void {
  if (data !== undefined) return;
  const file = loadFromPublicDir();
  if (file) applySnapshot(file);
}

export async function ensurePlayerSearch(): Promise<boolean> {
  if (data !== undefined) return data != null;
  const fromDisk = loadFromPublicDir();
  if (fromDisk) return applySnapshot(fromDisk);
  return applySnapshot(await loadFromAssets());
}

function toRow(row: SearchSlimRow): PlayerSearchIndexRow {
  const [id, name, team, season, minutes, firstSeason] = row;
  return {
    id: String(id ?? ""),
    name: String(name ?? ""),
    nameLower: String(name ?? "").toLowerCase(),
    team: String(team ?? ""),
    season: String(season ?? ""),
    minutes: Number(minutes) || 0,
    ...(firstSeason ? { firstSeason: String(firstSeason) } : {}),
  };
}

export function getPlayerSearchIndex(): PlayerSearchIndexRow[] {
  tryPrimeFromDisk();
  if (cached) return cached;
  cached = raw
    .filter((row) => row?.[0] && row?.[1])
    .map((row) => toRow(row));
  return cached;
}

export function getPlayerSearchIndexForSeason(
  season: string
): PlayerSearchIndexRow[] {
  const key = String(season ?? "").trim();
  if (!key) return [];
  const hit = bySeasonCache.get(key);
  if (hit) return hit;
  const rows = getPlayerSearchIndex().filter((row) => row.season === key);
  bySeasonCache.set(key, rows);
  return rows;
}

/** Punctuation-blind key: "Ed O'Bannon", "ed obannon" and "ED O BANNON" match. */
function looseNameKey(name: string): string {
  return String(name ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Index row for a name typed without its punctuation (name-shaped routes such
 * as `bref:ed obannon`). With a season, prefers the player active that year so
 * fathers and sons resolve apart.
 */
export function findPlayerSearchRowByName(
  name: string,
  season?: string | null
): PlayerSearchIndexRow | null {
  if (!byLooseName) {
    byLooseName = new Map();
    for (const row of getPlayerSearchIndex()) {
      const key = looseNameKey(row.name);
      if (!key) continue;
      const list = byLooseName.get(key) ?? [];
      list.push(row);
      byLooseName.set(key, list);
    }
  }
  const rows = byLooseName.get(looseNameKey(name)) ?? [];
  if (rows.length <= 1 || !season) return rows[0] ?? null;
  return (
    rows.find(
      (r) => (r.firstSeason ?? r.season) <= season && season <= r.season
    ) ??
    rows[0] ??
    null
  );
}

export function playerSearchSnapshotMeta() {
  tryPrimeFromDisk();
  return {
    version: data?.version ?? 0,
    generatedAt: data?.generatedAt ?? null,
    playerCount: raw.length,
  };
}
