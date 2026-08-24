/**
 * Public NBA play-by-play fetch:
 * 1) CDN liveData  https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_{id}.json
 * 2) stats.nba.com playbyplayv3 fallback where that origin is reachable
 * 3) Optional on-disk DRBL raw cache (previously downloaded public data)
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { CACHE_TTL_MS } from "./cache-policy";
import { runtimeTimeoutMs, statsNbaNetworkEnabled } from "./runtime-policy";

export interface RawPlayByPlayPayload {
  raw: unknown;
  source: "cdn" | "stats" | "disk";
}

type CacheEntry = {
  freshUntil: number;
  value: unknown;
  source: "cdn" | "stats" | "disk";
};

const memoryCache = new Map<string, CacheEntry>();
/** In-flight dedupe so Game Lab + Possession Explorer share one network pull. */
const inflight = new Map<string, Promise<RawPlayByPlayPayload | null>>();

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
  retries = 2
): Promise<unknown> {
  let lastError: unknown;
  const timeoutMs = runtimeTimeoutMs(5_000, 2_500);
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries - 1) await delay(250 * (attempt + 1));
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

/**
 * Fetch raw play-by-play JSON for a game (CDN first, stats fallback, disk last).
 * Returns null when no source has actions.
 */
async function fetchRawPlayByPlayUncached(
  gameId: string
): Promise<RawPlayByPlayPayload | null> {
  const now = Date.now();

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

  // Do not bypass the shared Vercel runtime policy with a direct Stats request.
  if (statsNbaNetworkEnabled()) {
    try {
      const raw = await fetchJson(statsUrl(gameId), STATS_HEADERS, 1);
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
  }

  const disk = await readDiskCache(gameId);
  if (disk && hasActions(disk)) {
    memoryCache.set(gameId, {
      value: disk,
      source: "disk",
      freshUntil: now + CACHE_TTL_MS.boxScore,
    });
    return { raw: disk, source: "disk" };
  }

  return null;
}

export async function fetchRawPlayByPlay(
  gameId: string
): Promise<RawPlayByPlayPayload | null> {
  const now = Date.now();
  const cached = memoryCache.get(gameId);
  if (cached && cached.freshUntil > now) {
    return { raw: cached.value, source: cached.source };
  }

  const pending = inflight.get(gameId);
  if (pending) return pending;

  const request = fetchRawPlayByPlayUncached(gameId).finally(() => {
    inflight.delete(gameId);
  });
  inflight.set(gameId, request);
  return request;
}

export function mapRawPbpSource(
  source: "cdn" | "stats" | "disk"
): import("@/pbp/product-types").PbpProductSource {
  if (source === "cdn") return "nba_cdn";
  if (source === "stats") return "stats_nba";
  return "disk_cache";
}

export function clearPlayByPlayCache(): void {
  memoryCache.clear();
  inflight.clear();
}
