/**
 * ESPN CDN summary loader (cdn.espn.com) — no server-only gate.
 * Shared by box score, play-by-play, and ESPN→NBA game id crosswalk.
 */
import type { EspnSummaryResponse } from "@/data/transformers/espn";
import { ESPN_FETCH_USER_AGENT } from "@/data/providers/nba/espn-client";
import { longUpstreamBudgetsEnabled } from "@/data/providers/nba/runtime-policy";

const CDN_BASE = "https://cdn.espn.com/core/nba";

/** Coalesce concurrent box + PBP loads for the same ESPN event. */
const inflight = new Map<string, Promise<EspnSummaryResponse | null>>();
const recent = new Map<
  string,
  { expiresAt: number; value: EspnSummaryResponse }
>();
const RECENT_TTL_MS = 30_000;
/** Live games refresh every 20s on the client, so a 30s memo would skip polls. */
const RECENT_LIVE_TTL_MS = 8_000;

function isLiveSummary(summary: EspnSummaryResponse): boolean {
  const state = (
    summary as { header?: { competitions?: Array<{ status?: { type?: { state?: string } } }> } }
  ).header?.competitions?.[0]?.status?.type?.state;
  return state === "in";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function playCount(summary: EspnSummaryResponse | null): number {
  if (!summary) return 0;
  const plays = (summary as { plays?: unknown[] }).plays;
  return Array.isArray(plays) ? plays.length : 0;
}

/** Athletes listed on the ESPN boxscore (CDN play packages sometimes omit this). */
function boxAthleteCount(summary: EspnSummaryResponse | null): number {
  if (!summary) return 0;
  const players = (
    summary as {
      boxscore?: {
        players?: Array<{
          statistics?: Array<{ athletes?: unknown[] }>;
        }>;
      };
    }
  ).boxscore?.players;
  if (!Array.isArray(players)) return 0;
  let n = 0;
  for (const block of players) {
    for (const stats of block.statistics ?? []) {
      n += Array.isArray(stats.athletes) ? stats.athletes.length : 0;
    }
  }
  return n;
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
  // Same curl UA as espnFetchJson — browser UAs get Akamai 403 from CF Workers
  // in ~50ms, which made preferBox look like a permanent miss after F4 isolation.
  const response = await fetch(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent": ESPN_FETCH_USER_AGENT,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`ESPN CDN request failed (${response.status}): ${url}`);
  }
  return response.json();
}

export type EspnCdnSummaryOptions = {
  preferPlays?: boolean;
  /**
   * Prefer the dedicated /boxscore package first (box API + Game Lab roster).
   * Must not share an in-flight preferPlays fetch that can settle plays-only.
   */
  preferBox?: boolean;
  /** Per-URL AbortSignal timeout. Defaults 15s (Workers) / 8s. */
  timeoutMs?: number;
  /**
   * Cap sequential CDN package attempts. Shell identity only needs one good
   * package; Game Lab PBP can try all three. Default: all URLs.
   */
  maxUrls?: number;
};

/** Exported for unit tests (URL order + coalesce isolation). */
export function cdnPackageUrls(
  id: string,
  options?: EspnCdnSummaryOptions
): string[] {
  const enc = encodeURIComponent(id);
  const playbyplay = `${CDN_BASE}/playbyplay?xhr=1&gameId=${enc}`;
  const game = `${CDN_BASE}/game?xhr=1&gameId=${enc}`;
  const boxscore = `${CDN_BASE}/boxscore?xhr=1&gameId=${enc}`;
  // Prefer the smaller playbyplay package when Game Lab needs events.
  // Box callers and shell (maxUrls) try boxscore before the heavier /game package.
  if (options?.preferPlays) return [playbyplay, game, boxscore];
  if (options?.preferBox || options?.maxUrls != null) {
    return [boxscore, game, playbyplay];
  }
  return [game, playbyplay, boxscore];
}

/** Exported for unit tests (box vs plays inflight isolation). */
export function coalesceKeyFor(id: string, options?: EspnCdnSummaryOptions): string {
  // Shell-tight budgets must not reuse a long preferPlays inflight (up to 3×15s).
  if (options?.timeoutMs != null || options?.maxUrls != null) return `${id}:shell`;
  // Box and PBP must not share one promise: preferPlays can settle plays-only
  // after timeouts and leave the box caller with a null transform.
  if (options?.preferPlays) return `${id}:plays`;
  if (options?.preferBox) return `${id}:box`;
  return id;
}

async function fetchEspnCdnGameSummaryUncached(
  id: string,
  options?: EspnCdnSummaryOptions
): Promise<EspnSummaryResponse | null> {
  const timeoutMs =
    options?.timeoutMs ??
    (longUpstreamBudgetsEnabled() ? 15_000 : 8_000);

  const urls = cdnPackageUrls(id, options);
  const limited =
    typeof options?.maxUrls === "number" && options.maxUrls > 0
      ? urls.slice(0, options.maxUrls)
      : urls;

  let best: EspnSummaryResponse | null = null;
  for (const url of limited) {
    try {
      const payload = await fetchCdnPayload(url, timeoutMs);
      const summary = findEspnCdnSummary(payload);
      if (!summary) continue;
      const plays = playCount(summary);
      const boxers = boxAthleteCount(summary);
      // Prefer a package that has both plays and box athletes when available.
      if (plays > 0 && boxers > 0) return summary;
      // Box-primary callers can stop once athletes are present.
      if (options?.preferBox && boxers > 0) return summary;
      if (plays > 0) {
        // Keep looking for a boxscore package (preferPlays hits /playbyplay first).
        if (!best || playCount(best) < plays || boxAthleteCount(best) < boxers) {
          best = summary;
        }
        continue;
      }
      if (boxers > 0 && (!best || boxAthleteCount(best) === 0)) {
        best = summary;
        continue;
      }
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
 *
 * Shell callers should pass a short `timeoutMs` + `maxUrls: 1` so a hung CDN
 * cannot outlive the Worker HTML stream window (~12s) and freeze loading.tsx.
 */
export async function fetchEspnCdnGameSummary(
  gameId: string,
  options?: EspnCdnSummaryOptions
): Promise<EspnSummaryResponse | null> {
  const id = String(gameId ?? "").trim();
  if (!/^40\d{6,}$/.test(id)) return null;

  const cached = recent.get(id);
  if (cached && cached.expiresAt > Date.now()) {
    const plays = playCount(cached.value);
    const boxers = boxAthleteCount(cached.value);
    if (options?.preferPlays) {
      // PBP callers accept plays-only; box callers must not reuse that cache.
      if (plays > 0) return cached.value;
    } else if (boxers > 0) {
      return cached.value;
    } else if (plays > 0 && boxers === 0) {
      // Stale plays-only entry — fall through and fetch a boxscore package.
    }
  }

  const coalesceKey = coalesceKeyFor(id, options);

  const pending = inflight.get(coalesceKey);
  if (pending) return pending;

  const request = fetchEspnCdnGameSummaryUncached(id, options)
    .then((value) => {
      // Only memo packages that include box athletes. Caching plays-only here
      // used to win the recent map after preferPlays / shell maxUrls:1 and made
      // concurrent box API calls fall through into a second flaky fetch — or,
      // worse, share the same inflight and settle without athletes.
      if (value && boxAthleteCount(value) > 0) {
        const ttl = isLiveSummary(value) ? RECENT_LIVE_TTL_MS : RECENT_TTL_MS;
        recent.set(id, { value, expiresAt: Date.now() + ttl });
      }
      return value;
    })
    .finally(() => {
      inflight.delete(coalesceKey);
    });
  inflight.set(coalesceKey, request);
  return request;
}

/** Test-only: clear in-memory CDN memo so fixture races start clean. */
export function __resetEspnCdnSummaryCacheForTests(): void {
  inflight.clear();
  recent.clear();
}
