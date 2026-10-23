/**
 * ESPN ↔ NBA player id aliases for Cloudflare Workers.
 * Lives under public/runtime (ASSETS) so the ~156KB JSON stays off the Worker.
 */
import type {
  PlayerIdAlias,
  PlayerIdAliasIndex,
} from "@/data/providers/impact/player-id-aliases";

type AliasFile = {
  version?: number;
  aliases?: PlayerIdAlias[];
};

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const ASSET_PATH = "/runtime/player-id-aliases-snapshot.json";

let rows: PlayerIdAlias[] | null | undefined;
let cached: PlayerIdAliasIndex | null = null;

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

function loadFromPublicDir(): AliasFile | null {
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
      "player-id-aliases-snapshot.json"
    );
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as AliasFile;
  } catch {
    return null;
  }
}

async function loadFromAssets(): Promise<AliasFile | null> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(`https://assets.local${ASSET_PATH}`);
    if (!response.ok) return null;
    return (await response.json()) as AliasFile;
  } catch {
    return null;
  }
}

function apply(file: AliasFile | null): boolean {
  rows = Array.isArray(file?.aliases) ? (file!.aliases as PlayerIdAlias[]) : [];
  cached = null;
  return file != null;
}

function tryPrimeFromDisk(): void {
  if (rows !== undefined) return;
  const file = loadFromPublicDir();
  if (file) apply(file);
}

export async function ensurePlayerIdAliases(): Promise<boolean> {
  if (rows !== undefined) return rows != null;
  const fromDisk = loadFromPublicDir();
  if (fromDisk) return apply(fromDisk);
  return apply(await loadFromAssets());
}

export function getBundledPlayerIdAliasIndex(): PlayerIdAliasIndex {
  tryPrimeFromDisk();
  if (cached) return cached;
  const byEspn = new Map<string, PlayerIdAlias>();
  const byNba = new Map<string, PlayerIdAlias>();
  const byBref = new Map<string, PlayerIdAlias>();
  for (const row of rows ?? []) {
    if (!row?.espnPlayerId || !row?.nbaPlayerId) continue;
    const normalized: PlayerIdAlias = {
      espnPlayerId: String(row.espnPlayerId).trim(),
      nbaPlayerId: String(row.nbaPlayerId).trim(),
      playerName: row.playerName?.trim() || undefined,
      brefSlug: row.brefSlug?.trim().toLowerCase() || undefined,
      matchMethod: row.matchMethod?.trim() || undefined,
      confidence: row.confidence?.trim() || undefined,
      productionApproved:
        typeof row.productionApproved === "boolean"
          ? row.productionApproved
          : undefined,
    };
    if (!normalized.espnPlayerId || !normalized.nbaPlayerId) continue;
    byEspn.set(normalized.espnPlayerId, normalized);
    byNba.set(normalized.nbaPlayerId, normalized);
    if (normalized.brefSlug) byBref.set(normalized.brefSlug, normalized);
  }
  cached = { byEspn, byNba, byBref };
  return cached;
}

/** Raw alias rows (for legend remap construction). */
export function getBundledPlayerIdAliasRows(): PlayerIdAlias[] {
  tryPrimeFromDisk();
  return rows ?? [];
}
