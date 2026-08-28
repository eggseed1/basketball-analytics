/**
 * Cloudflare-safe player game logs (splits / highs / games tabs).
 * Baked at deploy into public/runtime/player-game-logs/{season}/{id}.json
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { CompactPlayerGameLogRow } from "@/data/history/player-game-log";

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

type GameLogAssetFile = {
  playerId?: string;
  espnId?: string;
  season?: string;
  games?: CompactPlayerGameLogRow[];
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

function normalizeGames(
  games: CompactPlayerGameLogRow[] | undefined
): CompactPlayerGameLogRow[] {
  if (!Array.isArray(games) || games.length === 0) return [];
  return games
    .filter((g) => g && g.gameId && g.date)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));
}

function loadFromPublicDir(
  season: string,
  playerId: string
): CompactPlayerGameLogRow[] {
  try {
    const p = path.join(
      process.cwd(),
      "public",
      "runtime",
      "player-game-logs",
      season,
      `${playerId}.json`
    );
    if (!existsSync(p)) return [];
    const json = JSON.parse(readFileSync(p, "utf8")) as GameLogAssetFile;
    return normalizeGames(json.games);
  } catch {
    return [];
  }
}

async function fetchGameLogAsset(
  season: string,
  playerId: string
): Promise<CompactPlayerGameLogRow[]> {
  const pathname = `/runtime/player-game-logs/${encodeURIComponent(
    season
  )}/${encodeURIComponent(playerId)}.json`;
  try {
    const assets = cloudflareAssets();
    if (!assets) return [];
    const response = await assets.fetch(`https://assets.local${pathname}`);
    if (!response.ok) return [];
    const json = (await response.json()) as GameLogAssetFile;
    return normalizeGames(json.games);
  } catch {
    return [];
  }
}

/** Resolve baked game log for CF / local public assets. */
export async function resolvePlayerSeasonGameLog(options: {
  season: string;
  playerId: string;
  nbaId?: string | null;
  espnId?: string | null;
}): Promise<CompactPlayerGameLogRow[]> {
  const ids = uniqueIds([
    options.nbaId,
    options.playerId,
    options.espnId,
  ]);

  for (const id of ids) {
    const pub = loadFromPublicDir(options.season, id);
    if (pub.length) return pub;
  }

  for (const id of ids) {
    const asset = await fetchGameLogAsset(options.season, id);
    if (asset.length) return asset;
  }

  return [];
}
