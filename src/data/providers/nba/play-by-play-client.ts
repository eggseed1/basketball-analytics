/**
 * Public NBA play-by-play fetch:
 * 1) CDN liveData  https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_{id}.json
 * 2) stats.nba.com playbyplayv3 fallback
 * 3) Optional on-disk DRBL raw cache (previously downloaded public data)
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { CACHE_TTL_MS } from "./cache-policy";

type CacheEntry = {
  freshUntil: number;
  value: unknown;
  source: "cdn" | "stats";
};

const memoryCache = new Map<string, CacheEntry>();

const HEADERS: Record<string, string> = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://www.nba.com",
  Referer: "https://www.nba.com/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

const STATS_HEADERS: Record<string, string> = {
  ...HEADERS,
  "x-nba-stats-origin": "stats",
  "x-nba-stats-token": "true",
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cdnUrl(gameId: string): string {
  return `https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_${gameId}.json`;
}

function statsUrl(gameId: string): string {
  return (
    `https://stats.nba.com/stats/playbyplayv3?GameID=${gameId}` +
    `&StartPeriod=0&EndPeriod=14`
  );
}

async function fetchJson(
  url: string,
  headers: Record<string, string>,
  retries = 3
): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      await delay(350 * (attempt + 1));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Fetch failed: ${url}`);
}

function hasActions(raw: unknown): boolean {
  const root = raw as { game?: { actions?: unknown[] } };
  return Array.isArray(root.game?.actions) && root.game!.actions!.length > 0;
}

async function readDiskCache(gameId: string): Promise<unknown | null> {
  const file = path.join(
    process.cwd(),
    "data",
    "drbl",
    "raw",
    "games",
    gameId,
    "playbyplay.json"
  );
  try {
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export interface RawPlayByPlayPayload {
  raw: unknown;
  source: "cdn" | "stats";
}

/**
 * Fetch raw play-by-play JSON for a game (CDN first, stats fallback, disk last).
 * Returns null when no source has actions.
 */
export async function fetchRawPlayByPlay(
  gameId: string
): Promise<RawPlayByPlayPayload | null> {
  const now = Date.now();
  const cached = memoryCache.get(gameId);
  if (cached && cached.freshUntil > now) {
    return { raw: cached.value, source: cached.source };
  }

  try {
    const raw = await fetchJson(cdnUrl(gameId), HEADERS);
    if (hasActions(raw)) {
      memoryCache.set(gameId, {
        value: raw,
        source: "cdn",
        freshUntil: now + CACHE_TTL_MS.boxScore,
      });
      return { raw, source: "cdn" };
    }
  } catch {
    // fall through
  }

  try {
    const raw = await fetchJson(statsUrl(gameId), STATS_HEADERS);
    if (hasActions(raw)) {
      memoryCache.set(gameId, {
        value: raw,
        source: "stats",
        freshUntil: now + CACHE_TTL_MS.boxScore,
      });
      return { raw, source: "stats" };
    }
  } catch {
    // fall through
  }

  const disk = await readDiskCache(gameId);
  if (disk && hasActions(disk)) {
    // Treat disk as CDN-shaped public dump (usually from a prior CDN pull).
    memoryCache.set(gameId, {
      value: disk,
      source: "cdn",
      freshUntil: now + CACHE_TTL_MS.boxScore,
    });
    return { raw: disk, source: "cdn" };
  }

  return null;
}

export function clearPlayByPlayCache(): void {
  memoryCache.clear();
}
