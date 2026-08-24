/**
 * Public play-by-play fetch:
 * - ESPN event ids use the ESPN game summary PBP directly.
 * - NBA GameIDs use NBA CDN, then stats.nba.com, then optional disk cache.
 *
 * Provider namespaces are never crossed: an ESPN event id must not be retried
 * against NBA GameID endpoints.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { CACHE_TTL_MS } from "./cache-policy";

export interface RawPlayByPlayPayload {
  raw: unknown;
  source: "cdn" | "stats" | "espn" | "disk";
}

type CacheEntry = {
  freshUntil: number;
  value: unknown;
  source: RawPlayByPlayPayload["source"];
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

const ESPN_HEADERS: Record<string, string> = {
  Accept: "application/json, text/plain, */*",
  "User-Agent": "Mozilla/5.0 DRBL-PBP/1.0",
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

function espnUrl(gameId: string): string {
  return `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${encodeURIComponent(gameId)}`;
}

async function fetchJson(
  url: string,
  headers: Record<string, string>,
  retries = 2
): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(5_000),
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

function clockToIso(value: unknown): string {
  const text = String(value ?? "").trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) return "PT0S";
  return `PT${Number(match[1])}M${Number(match[2])}S`;
}

function inferEspnAction(textRaw: unknown, scoreValueRaw: unknown) {
  const text = String(textRaw ?? "").toLowerCase();
  const scoreValue = Number(scoreValueRaw ?? 0) || 0;
  if (text.includes("free throw")) return "freethrow";
  if (text.includes("3-pt") || text.includes("three point") || scoreValue === 3) return "3pt";
  if (
    text.includes("layup") ||
    text.includes("dunk") ||
    text.includes("jumper") ||
    text.includes("jump shot") ||
    text.includes("hook shot") ||
    scoreValue === 2
  ) return "2pt";
  if (text.includes("rebound")) return "rebound";
  if (text.includes("turnover")) return "turnover";
  if (text.includes("foul")) return "foul";
  if (text.includes("substitution")) return "substitution";
  if (text.includes("timeout")) return "timeout";
  if (text.includes("jump ball")) return "jumpball";
  if (text.includes("end of") || text.includes("start of")) return "period";
  return "unknown";
}

/** Convert ESPN summary `plays` into the canonical NBA-action-shaped envelope. */
function normalizeEspnSummary(raw: unknown): unknown {
  const root = raw as {
    plays?: Array<{
      id?: string | number;
      sequenceNumber?: string | number;
      text?: string;
      scoringPlay?: boolean;
      scoreValue?: number | string;
      homeScore?: number | string;
      awayScore?: number | string;
      period?: { number?: number | string };
      clock?: { displayValue?: string };
      team?: { id?: string | number; abbreviation?: string };
      participants?: Array<{
        athlete?: { id?: string | number; displayName?: string; shortName?: string };
      }>;
    }>;
  };
  const plays = Array.isArray(root.plays) ? root.plays : [];
  const actions = plays.map((play, index) => {
    const text = String(play.text ?? "");
    const actionType = inferEspnAction(text, play.scoreValue);
    const isShot = actionType === "2pt" || actionType === "3pt" || actionType === "freethrow";
    const made = isShot && (Boolean(play.scoringPlay) || Number(play.scoreValue ?? 0) > 0);
    const participant = play.participants?.[0]?.athlete;
    const actionNumber = Number(play.sequenceNumber ?? play.id ?? index + 1) || index + 1;
    return {
      actionNumber,
      orderNumber: actionNumber,
      period: Number(play.period?.number ?? 0) || 0,
      clock: clockToIso(play.clock?.displayValue),
      actionType,
      subType: "",
      description: text,
      teamId: String(play.team?.id ?? ""),
      teamTricode: String(play.team?.abbreviation ?? ""),
      personId: Number(participant?.id ?? 0) || 0,
      playerName: participant?.displayName ?? participant?.shortName ?? "",
      scoreHome: Number(play.homeScore ?? 0) || 0,
      scoreAway: Number(play.awayScore ?? 0) || 0,
      shotResult: isShot ? (made ? "Made" : "Missed") : "",
      isFieldGoal: actionType === "2pt" || actionType === "3pt" ? 1 : 0,
      points: Number(play.scoreValue ?? 0) || 0,
    };
  });
  return { game: { actions } };
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

async function fetchRawPlayByPlayUncached(
  gameId: string
): Promise<RawPlayByPlayPayload | null> {
  const now = Date.now();

  // ESPN event ids (40...) are not NBA GameIDs. Use ESPN's own PBP and never
  // burn retries against NBA endpoints with an incompatible id namespace.
  if (/^40\d{7,}$/.test(gameId)) {
    try {
      const summary = await fetchJson(espnUrl(gameId), ESPN_HEADERS, 1);
      const raw = normalizeEspnSummary(summary);
      if (hasActions(raw)) {
        memoryCache.set(gameId, {
          value: raw,
          source: "espn",
          freshUntil: now + CACHE_TTL_MS.boxScore,
        });
        return { raw, source: "espn" };
      }
    } catch {
      return null;
    }
    return null;
  }

  try {
    const raw = await fetchJson(cdnUrl(gameId), HEADERS, 2);
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
  source: RawPlayByPlayPayload["source"]
): import("@/pbp/product-types").PbpProductSource {
  if (source === "cdn") return "nba_cdn";
  if (source === "stats") return "stats_nba";
  if (source === "espn") return "espn";
  return "disk_cache";
}

export function clearPlayByPlayCache(): void {
  memoryCache.clear();
  inflight.clear();
}
