/**
 * ESPN CDN summary loader (cdn.espn.com) — no server-only gate.
 * Shared by box score, play-by-play, and ESPN→NBA game id crosswalk.
 */
import type { EspnSummaryResponse } from "@/data/transformers/espn";
import { longUpstreamBudgetsEnabled } from "@/data/providers/nba/runtime-policy";

const CDN_BASE = "https://cdn.espn.com/core/nba";

/** Coalesce concurrent box + PBP loads for the same ESPN event. */
const inflight = new Map<string, Promise<EspnSummaryResponse | null>>();
const recent = new Map<
  string,
  { expiresAt: number; value: EspnSummaryResponse }
>();
const RECENT_TTL_MS = 30_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function playCount(summary: EspnSummaryResponse | null): number {
  if (!summary) return 0;
  const plays = (summary as { plays?: unknown[] }).plays;
  return Array.isArray(plays) ? plays.length : 0;
}

/**
 * ESPN's CDN wrapper has changed shape over time (`content`, `gamepackageJSON`,
 * nested page modules). Find the actual site-summary object without coupling the
 * route to one wrapper revision.
 *
 * Prefer a node that has both header + plays when available so Game Lab does not
 * latch onto a header-only shell.
 */
export function findEspnCdnSummary(
  value: unknown,
  depth = 0
): EspnSummaryResponse | null {
  if (depth > 7) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return findEspnCdnSummary(JSON.parse(trimmed), depth + 1);
      } catch {
        return null;
      }
    }
    return null;
  }

  if (Array.isArray(value)) {
    let best: EspnSummaryResponse | null = null;
    for (const item of value) {
      const found = findEspnCdnSummary(item, depth + 1);
      if (!found) continue;
      if (playCount(found) > 0) return found;
      if (!best) best = found;
    }
    return best;
  }

  if (!isRecord(value)) return null;

  const header = value.header;
  const selfIsSummary =
    isRecord(header) &&
    Array.isArray(header.competitions) &&
    header.competitions.length > 0;

  for (const key of [
    "gamepackageJSON",
    "gamepackage",
    "content",
    "page",
    "boxscore",
    "game",
  ]) {
    if (!(key in value)) continue;
    const found = findEspnCdnSummary(value[key], depth + 1);
    if (found && playCount(found) > 0) return found;
    if (found && !selfIsSummary) return found;
  }

  if (selfIsSummary) {
    return value as EspnSummaryResponse;
  }

  for (const nested of Object.values(value)) {
    const found = findEspnCdnSummary(nested, depth + 1);
    if (found) return found;
  }
  return null;
}

async function fetchCdnPayload(url: string, timeoutMs: number): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`ESPN CDN request failed (${response.status}): ${url}`);
  }
  return response.json();
}

async function fetchEspnCdnGameSummaryUncached(
  id: string,
  options?: { preferPlays?: boolean }
): Promise<EspnSummaryResponse | null> {
  const timeoutMs = longUpstreamBudgetsEnabled() ? 15_000 : 8_000;

  // Prefer the smaller playbyplay package when Game Lab needs events.
  const urls = options?.preferPlays
    ? [
        `${CDN_BASE}/playbyplay?xhr=1&gameId=${encodeURIComponent(id)}`,
        `${CDN_BASE}/game?xhr=1&gameId=${encodeURIComponent(id)}`,
        `${CDN_BASE}/boxscore?xhr=1&gameId=${encodeURIComponent(id)}`,
      ]
    : [
        `${CDN_BASE}/game?xhr=1&gameId=${encodeURIComponent(id)}`,
        `${CDN_BASE}/playbyplay?xhr=1&gameId=${encodeURIComponent(id)}`,
        `${CDN_BASE}/boxscore?xhr=1&gameId=${encodeURIComponent(id)}`,
      ];

  let best: EspnSummaryResponse | null = null;
  for (const url of urls) {
    try {
      const payload = await fetchCdnPayload(url, timeoutMs);
      const summary = findEspnCdnSummary(payload);
      if (!summary) continue;
      if (playCount(summary) > 0) return summary;
      if (!best) best = summary;
    } catch {
      // try next URL
    }
  }
  return best;
}

/**
 * Load the ESPN site-summary-shaped object from cdn.espn.com (40xxxxxxx ids).
 * Works from Cloudflare Workers where site.api.espn.com often 403s.
 *
 * Concurrent callers (box + PBP + shell) share one in-flight fetch and a short
 * recent cache so Game Lab does not stampede ESPN CDN.
 */
export async function fetchEspnCdnGameSummary(
  gameId: string,
  options?: { preferPlays?: boolean }
): Promise<EspnSummaryResponse | null> {
  const id = String(gameId ?? "").trim();
  if (!/^40\d{6,}$/.test(id)) return null;

  const cached = recent.get(id);
  if (cached && cached.expiresAt > Date.now()) {
    if (!options?.preferPlays || playCount(cached.value) > 0) {
      return cached.value;
    }
  }

  const pending = inflight.get(id);
  if (pending) return pending;

  const request = fetchEspnCdnGameSummaryUncached(id, options)
    .then((value) => {
      if (value && playCount(value) > 0) {
        recent.set(id, { value, expiresAt: Date.now() + RECENT_TTL_MS });
      }
      return value;
    })
    .finally(() => {
      inflight.delete(id);
    });
  inflight.set(id, request);
  return request;
}
