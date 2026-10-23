/**
 * Player awards for Cloudflare Workers.
 * Lives under public/runtime (ASSETS) so the ~140KB JSON stays off the Worker.
 */
import type { RawPlayerAward } from "@/data/providers/nba/player-awards";

type AwardsFile = {
  version?: number;
  generatedAt?: string;
  names?: Record<string, string>;
  slugs?: Record<string, string>;
  players?: Record<string, Array<[string, string]>>;
};

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const ASSET_PATH = "/runtime/player-awards-snapshot.json";

let data: AwardsFile | null | undefined;
let players: Record<string, Array<[string, string]>> = {};

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

function loadFromPublicDir(): AwardsFile | null {
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
      "player-awards-snapshot.json"
    );
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as AwardsFile;
  } catch {
    return null;
  }
}

async function loadFromAssets(): Promise<AwardsFile | null> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(`https://assets.local${ASSET_PATH}`);
    if (!response.ok) return null;
    return (await response.json()) as AwardsFile;
  } catch {
    return null;
  }
}

function apply(file: AwardsFile | null): boolean {
  data = file;
  players =
    file?.players && typeof file.players === "object" ? file.players : {};
  return file != null;
}

function tryPrimeFromDisk(): void {
  if (data !== undefined) return;
  const file = loadFromPublicDir();
  if (file) apply(file);
}

export async function ensurePlayerAwards(): Promise<boolean> {
  if (data !== undefined) return data != null;
  const fromDisk = loadFromPublicDir();
  if (fromDisk) return apply(fromDisk);
  return apply(await loadFromAssets());
}

export function getBundledPlayerAwardsRaw(
  nbaPlayerId: string
): RawPlayerAward[] {
  tryPrimeFromDisk();
  const key = String(nbaPlayerId ?? "").trim();
  if (!key) return [];
  const rows = players[key];
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return rows
    .filter((row) => Array.isArray(row) && row[0])
    .map((row) => ({
      personId: key,
      description: String(row[0] ?? ""),
      season: row[1] != null ? String(row[1]) : null,
      team: null,
      allNbaTeamNumber: null,
    }));
}

export function hasBundledPlayerAwards(nbaPlayerId: string): boolean {
  tryPrimeFromDisk();
  const key = String(nbaPlayerId ?? "").trim();
  return Boolean(key && Array.isArray(players[key]) && players[key]!.length > 0);
}

export function bundledPlayerAwardsMeta() {
  tryPrimeFromDisk();
  return {
    version: data?.version ?? 0,
    generatedAt: data?.generatedAt ?? null,
    playerCount: Object.keys(players).length,
  };
}

/** Names/slugs maps used by legend NBA↔BRef remaps. */
export function getBundledPlayerAwardsNameMaps(): {
  names: Record<string, string>;
  slugs: Record<string, string>;
} {
  tryPrimeFromDisk();
  return {
    names:
      data?.names && typeof data.names === "object" ? data.names : {},
    slugs:
      data?.slugs && typeof data.slugs === "object" ? data.slugs : {},
  };
}

/** Full players map for award history boards. */
export function getBundledPlayerAwardsPlayers(): Record<
  string,
  Array<[string, string] | [string, string, string]>
> {
  tryPrimeFromDisk();
  return players as Record<
    string,
    Array<[string, string] | [string, string, string]>
  >;
}
