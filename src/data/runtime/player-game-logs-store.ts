/**
 * Cloudflare-safe player game logs (splits / highs / games tabs).
 * Baked into public/runtime/player-game-logs/{season}/{id}.json. CI only rebakes
 * the current season, so past seasons are served from the PLAYER_GAME_LOGS R2
 * bucket (scripts/upload-player-game-logs-r2.mjs) with the same keys.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { CompactPlayerGameLogRow } from "@/data/history/player-game-log";

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

type GameLogBucket = {
  get: (key: string) => Promise<{ json<T>(): Promise<T> } | null>;
};

type GameLogEnv = { ASSETS?: AssetsFetcher; PLAYER_GAME_LOGS?: GameLogBucket };

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

function cloudflareEnv(): GameLogEnv | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare") as {
      getCloudflareContext: (opts?: { async?: boolean }) => { env?: GameLogEnv };
    };
    return getCloudflareContext()?.env ?? null;
  } catch {
    return null;
  }
}

function cloudflareAssets(): AssetsFetcher | null {
  return cloudflareEnv()?.ASSETS ?? null;
}

async function bucketJson<T>(key: string): Promise<T | null> {
  try {
    const bucket = cloudflareEnv()?.PLAYER_GAME_LOGS;
    if (!bucket) return null;
    const object = await bucket.get(key);
    return object ? await object.json<T>() : null;
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

async function assetManifest(): Promise<GameLogManifest | null> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(
      "https://assets.local/runtime/player-game-logs/manifest.json"
    );
    if (response.status === 404) return {};
    if (!response.ok) return null;
    return (await response.json()) as GameLogManifest;
  } catch {
    return null;
  }
}

/** Deployed assets are immutable per Worker version, so one read per isolate. */
let assetSeasonsCache: Set<string> | undefined;

/** Null when unknown (no ASSETS binding or a failed read): callers try assets anyway. */
async function assetSeasons(): Promise<Set<string> | null> {
  if (assetSeasonsCache) return assetSeasonsCache;
  const json = await assetManifest();
  if (!json) return null;
  assetSeasonsCache = new Set(seasonsFromManifest(json));
  return assetSeasonsCache;
}

/** Deployed assets hold the current season; R2 holds the rest. */
async function seasonsFromCloudflare(options?: {
  minFiles?: number;
}): Promise<string[]> {
  const manifests = await Promise.all([
    assetManifest(),
    bucketJson<GameLogManifest>("manifest.json"),
  ]);
  const seasons = new Set<string>();
  for (const json of manifests) {
    if (!json) continue;
    for (const season of seasonsFromManifest(json, options)) seasons.add(season);
  }
  return [...seasons];
}

/** Seasons with baked player game-log assets (CF-safe). */
export async function resolvePlayerGameLogSeasons(options?: {
  minFiles?: number;
}): Promise<string[]> {
  const fromFs = seasonsFromPublicDir(options);
  if (fromFs.length) {
    return [...fromFs].sort((a, b) => b.localeCompare(a));
  }
  const fromCloudflare = await seasonsFromCloudflare(options);
  return fromCloudflare.sort((a, b) => b.localeCompare(a));
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

  const deployed = await assetSeasons();
  if (!deployed || deployed.has(options.season)) {
    for (const id of ids) {
      const asset = await fetchGameLogAsset(options.season, id);
      if (asset.length) return asset;
    }
  }

  for (const id of ids) {
    const json = await bucketJson<GameLogAssetFile>(`${options.season}/${id}.json`);
    const games = normalizeGames(json?.games);
    if (games.length) return games;
  }

  return [];
}
