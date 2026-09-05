/**
 * Cloudflare-safe player game logs (splits / highs / games tabs).
 * Baked at deploy into public/runtime/player-game-logs/{season}/{id}.json
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
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

type GameLogManifest = {
  seasons?: string[];
  /** Per-season baked player file counts (NBA-id files). */
  seasonCounts?: Record<string, number>;
  /** Seasons with enough logs for race/tracker UX. */
  usableSeasons?: string[];
};

/** Minimum baked logs before a season appears in race-tracker options. */
export const PLAYER_GAME_LOG_RACE_MIN_FILES = 25;

function seasonsFromManifest(
  json: GameLogManifest,
  options?: { minFiles?: number }
): string[] {
  const minFiles = options?.minFiles ?? 0;
  if (
    minFiles > 0 &&
    Array.isArray(json.usableSeasons) &&
    json.usableSeasons.length
  ) {
    return json.usableSeasons.filter((season) => /^\d{4}-\d{2}$/.test(season));
  }
  if (minFiles > 0 && json.seasonCounts) {
    return Object.entries(json.seasonCounts)
      .filter(
        ([season, count]) =>
          /^\d{4}-\d{2}$/.test(season) && Number(count) >= minFiles
      )
      .map(([season]) => season);
  }
  if (Array.isArray(json.seasons) && json.seasons.length) {
    return [...json.seasons].filter((season) => /^\d{4}-\d{2}$/.test(season));
  }
  return [];
}

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

function seasonsFromPublicDir(options?: { minFiles?: number }): string[] {
  try {
    const root = path.join(
      process.cwd(),
      "public",
      "runtime",
      "player-game-logs"
    );
    const manifestPath = path.join(root, "manifest.json");
    if (existsSync(manifestPath)) {
      const json = JSON.parse(
        readFileSync(manifestPath, "utf8")
      ) as GameLogManifest;
      const fromManifest = seasonsFromManifest(json, options);
      if (fromManifest.length) return fromManifest;
    }
    if (!existsSync(root)) return [];
    const minFiles = options?.minFiles ?? 0;
    return readdirSync(root).filter((name) => {
      if (!/^\d{4}-\d{2}$/.test(name)) return false;
      if (minFiles <= 0) return true;
      try {
        const dir = path.join(root, name);
        const count = readdirSync(dir).filter((f) => f.endsWith(".json")).length;
        return count >= minFiles;
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

async function seasonsFromAssets(options?: {
  minFiles?: number;
}): Promise<string[]> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return [];
    const response = await assets.fetch(
      "https://assets.local/runtime/player-game-logs/manifest.json"
    );
    if (!response.ok) return [];
    const json = (await response.json()) as GameLogManifest;
    return seasonsFromManifest(json, options);
  } catch {
    return [];
  }
}

/** Seasons with baked player game-log assets (CF-safe). */
export async function resolvePlayerGameLogSeasons(options?: {
  minFiles?: number;
}): Promise<string[]> {
  const fromFs = seasonsFromPublicDir(options);
  if (fromFs.length) {
    return [...fromFs].sort((a, b) => b.localeCompare(a));
  }
  const fromAssets = await seasonsFromAssets(options);
  return [...fromAssets].sort((a, b) => b.localeCompare(a));
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
