/**
 * Raw NBA advanced box score fetch (stats.nba.com → disk cache).
 *
 * Official team possessions live on boxscoreadvancedv3
 * (`boxScoreAdvanced.*.statistics.possessions`). Traditional CDN / traditional
 * stats boxes do not carry this field.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { CACHE_TTL_MS } from "./cache-policy";

export type AdvancedBoxSource = "stats" | "disk";

export type RawAdvancedBoxPayload = {
  raw: unknown;
  source: AdvancedBoxSource;
};

export type AdvancedBoxFetchAttempt = {
  source: string;
  outcome:
    | "ok"
    | "http_error"
    | "network_error"
    | "empty"
    | "invalid_shape"
    | "missing_file";
  detail?: string;
};

export type AdvancedBoxFetchResult =
  | {
      status: "available";
      payload: RawAdvancedBoxPayload;
      attempts: AdvancedBoxFetchAttempt[];
    }
  | {
      status: "unavailable";
      attempts: AdvancedBoxFetchAttempt[];
      reason:
        | "endpoint_unavailable"
        | "game_not_supported"
        | "response_invalid"
        | "fetch_failed";
    };

type CacheEntry = {
  freshUntil: number;
  value: unknown;
  source: AdvancedBoxSource;
};

const memoryCache = new Map<string, CacheEntry>();

const HEADERS: Record<string, string> = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://www.nba.com",
  Referer: "https://www.nba.com/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "x-nba-stats-origin": "stats",
  "x-nba-stats-token": "true",
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statsAdvancedUrl(gameId: string): string {
  return (
    `https://stats.nba.com/stats/boxscoreadvancedv3?GameID=${gameId}` +
    `&StartPeriod=0&EndPeriod=14`
  );
}

function diskPath(gameId: string): string {
  return path.join(
    process.cwd(),
    "data",
    "drbl",
    "raw",
    "games",
    gameId,
    "boxscore-advanced-v3.json"
  );
}

function hasAdvancedEnvelope(raw: unknown): boolean {
  const root = raw as {
    boxScoreAdvanced?: unknown;
    meta?: unknown;
  };
  return Boolean(root.boxScoreAdvanced);
}

async function fetchJson(
  url: string,
  retries = 3
): Promise<{ ok: true; raw: unknown } | { ok: false; detail: string }> {
  let lastDetail = "unknown";
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, { headers: HEADERS });
      if (!response.ok) {
        lastDetail = `HTTP ${response.status}`;
        if (response.status === 404 || response.status === 400) {
          return { ok: false, detail: lastDetail };
        }
        await delay(350 * (attempt + 1));
        continue;
      }
      const raw = await response.json();
      return { ok: true, raw };
    } catch (error) {
      lastDetail =
        error instanceof Error ? error.message : "network_error";
      await delay(350 * (attempt + 1));
    }
  }
  return { ok: false, detail: lastDetail };
}

async function readDiskCache(gameId: string): Promise<unknown | null> {
  try {
    const raw = await readFile(diskPath(gameId), "utf8");
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/**
 * Fetch advanced box score with structured attempt diagnostics.
 * Does not invent possessions when the payload lacks the field.
 */
export async function fetchRawAdvancedBoxScoreDetailed(
  gameId: string,
  options?: { bypassCache?: boolean }
): Promise<AdvancedBoxFetchResult> {
  const now = Date.now();
  const attempts: AdvancedBoxFetchAttempt[] = [];

  if (!options?.bypassCache) {
    const cached = memoryCache.get(gameId);
    if (cached && cached.freshUntil > now) {
      attempts.push({ source: "memory_cache", outcome: "ok" });
      return {
        status: "available",
        payload: { raw: cached.value, source: cached.source },
        attempts,
      };
    }
  }

  const statsResult = await fetchJson(statsAdvancedUrl(gameId));
  if (statsResult.ok) {
    if (!hasAdvancedEnvelope(statsResult.raw)) {
      attempts.push({
        source: "stats_nba",
        outcome: "invalid_shape",
        detail: "missing boxScoreAdvanced",
      });
    } else {
      attempts.push({ source: "stats_nba", outcome: "ok" });
      memoryCache.set(gameId, {
        value: statsResult.raw,
        source: "stats",
        freshUntil: now + CACHE_TTL_MS.boxScore,
      });
      return {
        status: "available",
        payload: { raw: statsResult.raw, source: "stats" },
        attempts,
      };
    }
  } else {
    const httpish = statsResult.detail.startsWith("HTTP");
    attempts.push({
      source: "stats_nba",
      outcome: httpish ? "http_error" : "network_error",
      detail: statsResult.detail,
    });
  }

  const disk = await readDiskCache(gameId);
  if (disk) {
    if (!hasAdvancedEnvelope(disk)) {
      attempts.push({
        source: "disk_cache",
        outcome: "invalid_shape",
        detail: "missing boxScoreAdvanced",
      });
    } else {
      attempts.push({ source: "disk_cache", outcome: "ok" });
      memoryCache.set(gameId, {
        value: disk,
        source: "disk",
        freshUntil: now + CACHE_TTL_MS.boxScore,
      });
      return {
        status: "available",
        payload: { raw: disk, source: "disk" },
        attempts,
      };
    }
  } else {
    attempts.push({ source: "disk_cache", outcome: "missing_file" });
  }

  const last = attempts[attempts.length - 1];
  const reason =
    last?.outcome === "http_error" && last.detail?.includes("404")
      ? "game_not_supported"
      : last?.outcome === "invalid_shape"
        ? "response_invalid"
        : last?.outcome === "http_error"
          ? "endpoint_unavailable"
          : "fetch_failed";

  return { status: "unavailable", attempts, reason };
}

/** Convenience wrapper matching traditional box client shape. */
export async function fetchRawAdvancedBoxScore(
  gameId: string
): Promise<RawAdvancedBoxPayload | null> {
  const result = await fetchRawAdvancedBoxScoreDetailed(gameId);
  if (result.status !== "available") return null;
  return result.payload;
}

export function clearRawAdvancedBoxScoreCache(): void {
  memoryCache.clear();
}
