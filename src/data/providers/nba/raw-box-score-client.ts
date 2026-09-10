/**
 * Raw NBA box score fetch (CDN → stats fallback → disk cache).
 * CDN shape is required for DRBL normalizeBoxScore.
 * Accepts ESPN event ids (resolved via schedule crosswalk) or NBA GameIDs.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { statsBoxScoreV3ToCdnShape } from "../../../../drbl/download/stats-boxscore-adapt";
import { looksLikeEspnEventId } from "@/data/identity/game-id";
import { resolveNbaGameId } from "@/data/identity/resolve-nba-game-id";

import { CACHE_TTL_MS } from "./cache-policy";
import { statsNbaNetworkEnabled } from "./runtime-policy";

type CacheEntry = {
  freshUntil: number;
  value: unknown;
  source: "cdn" | "stats" | "disk";
  nbaGameId?: string;
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
  return `https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${gameId}.json`;
}

function statsUrl(gameId: string): string {
  return (
    `https://stats.nba.com/stats/boxscoretraditionalv3?GameID=${gameId}` +
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

function hasGame(raw: unknown): boolean {
  const payload = raw as {
    game?: unknown;
    boxScoreTraditional?: unknown;
  };
  return Boolean(payload.game || payload.boxScoreTraditional);
}

function toCdnShape(raw: unknown, source: "cdn" | "stats" | "disk"): unknown {
  if ((raw as { game?: unknown }).game) return raw;
  if (source === "stats") {
    const adapted = statsBoxScoreV3ToCdnShape(raw);
    if (adapted) return adapted;
  }
  return raw;
}

async function readDiskCache(gameId: string): Promise<unknown | null> {
  const file = path.join(
    process.cwd(),
    "data",
    "drbl",
    "raw",
    "games",
    gameId,
    "boxscore.json"
  );
  try {
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export interface RawBoxScorePayload {
  raw: unknown;
  source: "cdn" | "stats" | "disk";
  nbaGameId?: string;
}

async function fetchRawBoxScoreForNbaId(
  nbaGameId: string
): Promise<RawBoxScorePayload | null> {
  try {
    const raw = await fetchJson(cdnUrl(nbaGameId), HEADERS);
    if (hasGame(raw)) {
      const shaped = toCdnShape(raw, "cdn");
      return { raw: shaped, source: "cdn", nbaGameId };
    }
  } catch {
    // fall through
  }

  if (statsNbaNetworkEnabled()) {
    try {
      const raw = await fetchJson(statsUrl(nbaGameId), STATS_HEADERS);
      if (hasGame(raw)) {
        const shaped = toCdnShape(raw, "stats");
        if ((shaped as { game?: unknown }).game) {
          return { raw: shaped, source: "stats", nbaGameId };
        }
      }
    } catch {
      // fall through
    }
  }

  const disk = await readDiskCache(nbaGameId);
  if (disk && hasGame(disk)) {
    const shaped = toCdnShape(disk, "disk");
    return { raw: shaped, source: "disk", nbaGameId };
  }

  return null;
}

export async function fetchRawBoxScore(
  gameId: string
): Promise<RawBoxScorePayload | null> {
  const routeId = String(gameId ?? "").trim();
  if (!routeId) return null;

  const now = Date.now();
  const cached = memoryCache.get(routeId);
  if (cached && cached.freshUntil > now) {
    return {
      raw: cached.value,
      source: cached.source,
      nbaGameId: cached.nbaGameId,
    };
  }

  const resolved =
    (await resolveNbaGameId(routeId).catch(() => null)) ??
    (!looksLikeEspnEventId(routeId) ? routeId : null);
  if (!resolved) return null;

  const hit = await fetchRawBoxScoreForNbaId(resolved);
  if (!hit) return null;

  memoryCache.set(routeId, {
    value: hit.raw,
    source: hit.source,
    nbaGameId: hit.nbaGameId,
    freshUntil: now + CACHE_TTL_MS.boxScore,
  });
  return hit;
}

export function clearRawBoxScoreCache(): void {
  memoryCache.clear();
}
