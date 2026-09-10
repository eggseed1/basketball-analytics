/**
 * Raw advanced box score fetch for official team possessions.
 *
 * Priority:
 * 1) stats.nba.com boxscoreadvancedv3 (when network policy allows)
 * 2) BallDontLie GOAT advanced (Vercel-friendly when API key present)
 * 3) On-disk DRBL raw cache
 *
 * Traditional CDN boxes do not carry possessions — never invent estimates.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { looksLikeEspnEventId } from "@/data/identity/game-id";
import { resolveNbaGameId } from "@/data/identity/resolve-nba-game-id";
import { fetchBdlOfficialPossessions } from "@/data/providers/nba/bdl-official-possessions";

import { CACHE_TTL_MS } from "./cache-policy";
import { statsNbaNetworkEnabled } from "./runtime-policy";

export type AdvancedBoxSource = "stats" | "disk" | "bdl";

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
    | "missing_file"
    | "skipped";
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
    "boxscoreadvanced.json"
  );
}

function hasAdvancedEnvelope(raw: unknown): boolean {
  return Boolean((raw as { boxScoreAdvanced?: unknown })?.boxScoreAdvanced);
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
  const routeId = String(gameId ?? "").trim();
  const now = Date.now();
  const attempts: AdvancedBoxFetchAttempt[] = [];

  if (!routeId) {
    return {
      status: "unavailable",
      attempts: [{ source: "input", outcome: "empty", detail: "missing gameId" }],
      reason: "game_not_supported",
    };
  }

  if (!options?.bypassCache) {
    const cached = memoryCache.get(routeId);
    if (cached && cached.freshUntil > now) {
      attempts.push({ source: "memory_cache", outcome: "ok" });
      return {
        status: "available",
        payload: { raw: cached.value, source: cached.source },
        attempts,
      };
    }
  }

  const nbaGameId =
    (await resolveNbaGameId(routeId).catch(() => null)) ??
    (!looksLikeEspnEventId(routeId) ? routeId : null);

  if (statsNbaNetworkEnabled() && nbaGameId) {
    const statsResult = await fetchJson(statsAdvancedUrl(nbaGameId));
    if (statsResult.ok) {
      if (!hasAdvancedEnvelope(statsResult.raw)) {
        attempts.push({
          source: "stats_nba",
          outcome: "invalid_shape",
          detail: "missing boxScoreAdvanced",
        });
      } else {
        attempts.push({ source: "stats_nba", outcome: "ok" });
        memoryCache.set(routeId, {
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
  } else {
    attempts.push({
      source: "stats_nba",
      outcome: "skipped",
      detail: statsNbaNetworkEnabled()
        ? "nba_game_id_unresolved"
        : "disabled_on_vercel",
    });
  }

  try {
    const bdl = await fetchBdlOfficialPossessions(nbaGameId ?? routeId);
    if (bdl) {
      attempts.push({
        source: "balldontlie",
        outcome: "ok",
        detail: `bdl_game=${bdl.bdlGameId}`,
      });
      memoryCache.set(routeId, {
        value: bdl.raw,
        source: "bdl",
        freshUntil: now + CACHE_TTL_MS.boxScore,
      });
      return {
        status: "available",
        payload: { raw: bdl.raw, source: "bdl" },
        attempts,
      };
    }
    attempts.push({
      source: "balldontlie",
      outcome: "empty",
      detail: "no_match_or_no_key",
    });
  } catch (error) {
    attempts.push({
      source: "balldontlie",
      outcome: "network_error",
      detail: error instanceof Error ? error.message.slice(0, 120) : "error",
    });
  }

  for (const id of [nbaGameId, routeId].filter(Boolean) as string[]) {
    const disk = await readDiskCache(id);
    if (!disk) continue;
    if (!hasAdvancedEnvelope(disk)) {
      attempts.push({
        source: "disk_cache",
        outcome: "invalid_shape",
        detail: "missing boxScoreAdvanced",
      });
      continue;
    }
    attempts.push({ source: "disk_cache", outcome: "ok" });
    memoryCache.set(routeId, {
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
  attempts.push({ source: "disk_cache", outcome: "missing_file" });

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
