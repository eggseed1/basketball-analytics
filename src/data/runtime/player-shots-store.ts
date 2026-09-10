/**
 * Cloudflare-safe player-season shot indexes.
 * Prefer Static Assets baked at deploy (`public/runtime/player-shots/...`).
 * Disk reads still work locally when P18 history indexes or public/ assets exist.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { PlayerSeasonShotIndex } from "@/data/history/player-season-shots";
import { loadPlayerSeasonShotIndex } from "@/data/history/player-season-shots";

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

function cloudflareAssets(): AssetsFetcher | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare") as {
      getCloudflareContext: (opts?: { async?: boolean }) => {
        env?: { ASSETS?: AssetsFetcher };
      };
    };
    const ctx = getCloudflareContext();
    return ctx?.env?.ASSETS ?? null;
  } catch {
    return null;
  }
}

function uniqueIds(ids: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id) continue;
    const key = String(id).trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function loadFromPublicDir(
  season: string,
  playerId: string
): PlayerSeasonShotIndex | null {
  try {
    const p = path.join(
      process.cwd(),
      "public",
      "runtime",
      "player-shots",
      season,
      `${playerId}.json`
    );
    if (!existsSync(p)) return null;
    const json = JSON.parse(readFileSync(p, "utf8")) as PlayerSeasonShotIndex;
    if (!json || !Array.isArray(json.shots) || json.shots.length === 0) {
      return null;
    }
    return json;
  } catch {
    return null;
  }
}

async function fetchShotAsset(
  season: string,
  playerId: string
): Promise<PlayerSeasonShotIndex | null> {
  const pathname = `/runtime/player-shots/${encodeURIComponent(
    season
  )}/${encodeURIComponent(playerId)}.json`;
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(`https://assets.local${pathname}`);
    if (!response.ok) return null;
    const json = (await response.json()) as PlayerSeasonShotIndex;
    if (!json || !Array.isArray(json.shots) || json.shots.length === 0) {
      return null;
    }
    return json;
  } catch {
    return null;
  }
}

/**
 * Resolve a player-season shot index for CF + local.
 * Order: history disk → public/ bake (local) → Workers ASSETS.
 */
export async function resolvePlayerSeasonShotIndex(options: {
  season: string;
  playerId: string;
  nbaId?: string | null;
  espnId?: string | null;
}): Promise<PlayerSeasonShotIndex | null> {
  const ids = uniqueIds([
    options.nbaId,
    options.playerId,
    options.espnId,
  ]);

  for (const id of ids) {
    const disk = loadPlayerSeasonShotIndex(id, options.season);
    if (disk && disk.coordinateShots > 0) return disk;
  }

  for (const id of ids) {
    const pub = loadFromPublicDir(options.season, id);
    if (pub && pub.coordinateShots > 0) return pub;
  }

  for (const id of ids) {
    const asset = await fetchShotAsset(options.season, id);
    if (asset && asset.coordinateShots > 0) return asset;
  }

  return null;
}
