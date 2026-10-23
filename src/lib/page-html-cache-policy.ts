/**
 * HTML edge-cache policy for the Cloudflare Worker (worker.ts).
 * Pure helpers so eligibility and Cache-Control stay unit-tested without
 * opening the OpenNext worker graph.
 *
 * Live / personalized surfaces stay off the CDN path. Daily player/team/board
 * HTML can use Cache API + public s-maxage so colo HITs skip KV and SSR.
 */

export type PageHtmlCachePolicy = {
  /** Serve from cache without revalidation. */
  fresh: number;
  /** After fresh, keep serving while a background refresh runs (KV stale-while-revalidate). */
  stale: number;
};

export const LIVE_HTML_POLICY: PageHtmlCachePolicy = {
  fresh: 60,
  stale: 10 * 60,
};

/**
 * Scoreboard shell only — tiles poll `/api/scores/live`, so HTML can stay
 * EDGE a bit longer than other live surfaces and avoid frequent cold MISS.
 */
export const SCORES_HTML_POLICY: PageHtmlCachePolicy = {
  fresh: 2 * 60,
  stale: 10 * 60,
};

/**
 * Homepage is the coldest path after deploy; fewer re-renders = fewer OOMs.
 * Match daily fresh window so colo EDGE (~100ms) wins over KV HIT (~1.5s+)
 * for longer between background refreshes.
 */
export const HOME_HTML_POLICY: PageHtmlCachePolicy = {
  fresh: 15 * 60,
  stale: 30 * 60,
};

export const DAILY_HTML_POLICY: PageHtmlCachePolicy = {
  fresh: 15 * 60,
  stale: 6 * 60 * 60,
};

/**
 * Live / high-churn HTML that stays private (client polls APIs for freshness).
 * `/scores` is separate: short public CDN is OK because Gamefeed refreshes live.
 */
export const LIVE_HTML_PATH =
  /^\/(?:dashboard|explore\/games|games\/[^/]+)$/;

/** Scoreboard shell — EDGE with LIVE_HTML_POLICY (60s); tiles poll `/api/scores/live`. */
export const SCORES_HTML_PATH = /^\/scores\/?$/;

/** Single-game lab pages. Finals may EDGE-cache; live stays private (see worker). */
export const GAME_HTML_PATH = /^\/games\/[^/]+$/;

/** Marker the game page emits when status is final (Worker gates EDGE on this). */
export const GAME_FINAL_HTML_MARKER = 'data-html-cache="game-final"';

export const HOME_HTML_PATH = /^\/$/;

/**
 * Path prefixes safe for Cloudflare Cache API + public s-maxage.
 * Everything else may still use Worker KV PAGE_CACHE with private no-store.
 * Live game lab / explore/games stay off the CDN path.
 * Finished games are promoted to EDGE in the Worker when the final marker is present.
 */
const CDN_HTML_PREFIXES = [
  "/players",
  "/teams",
  "/explore",
  "/standings",
  "/history",
  "/learn",
  "/compare",
  "/sources",
  "/records",
  "/draft",
  "/contracts",
  "/movement",
] as const;

export function isLiveHtmlPath(pathname: string): boolean {
  return LIVE_HTML_PATH.test(pathname);
}

export function isScoresHtmlPath(pathname: string): boolean {
  return SCORES_HTML_PATH.test(pathname);
}

export function isGameHtmlPath(pathname: string): boolean {
  return GAME_HTML_PATH.test(pathname);
}

export function htmlHasGameFinalMarker(html: string): boolean {
  return html.includes(GAME_FINAL_HTML_MARKER);
}

export function isCdnHtmlPath(pathname: string): boolean {
  if (isScoresHtmlPath(pathname)) return true;
  if (isLiveHtmlPath(pathname)) return false;
  if (pathname === "/" || pathname === "/ask" || pathname === "/ask/") return true;
  // explore/games is live (scoreboard-ish); other explore boards are daily.
  if (pathname === "/explore/games" || pathname.startsWith("/explore/games/")) {
    return false;
  }
  return CDN_HTML_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function htmlCachePolicyForPath(pathname: string): PageHtmlCachePolicy {
  if (HOME_HTML_PATH.test(pathname)) return HOME_HTML_POLICY;
  if (isScoresHtmlPath(pathname)) return SCORES_HTML_POLICY;
  if (isLiveHtmlPath(pathname)) return LIVE_HTML_POLICY;
  return DAILY_HTML_POLICY;
}

/**
 * Browser + CDN directives for a Worker HTML response.
 * - CDN-eligible: public s-maxage so caches.default (and CF cache) may store.
 *   max-age=0 keeps browsers revalidating with the Worker.
 * - Live / non-CDN: private no-store (today's behavior).
 * - `cdnEnabled: true` forces public (Worker EDGE for finished games).
 * - `cdnEnabled: false` forces private.
 */
export function htmlCacheControlHeader(
  pathname: string,
  policy: PageHtmlCachePolicy,
  options?: { cdnEnabled?: boolean }
): string {
  if (options?.cdnEnabled === false) {
    return "private, no-cache, no-store, max-age=0, must-revalidate";
  }
  const cdn = options?.cdnEnabled === true || isCdnHtmlPath(pathname);
  if (!cdn) {
    return "private, no-cache, no-store, max-age=0, must-revalidate";
  }
  return `public, max-age=0, s-maxage=${policy.fresh}, stale-while-revalidate=${policy.stale}`;
}

/**
 * Cache-Control for `caches.default.put` only.
 * Client responses keep max-age=0 (see htmlCacheControlHeader). Putting that
 * same header into the Cache API makes colo storage expire immediately, so KV
 * HIT (~1s+) keeps winning over EDGE (~60ms).
 *
 * Store for fresh+stale so colo can keep serving while the Worker background-
 * refreshes after `fresh` (same SWR idea as KV). matchEdgeCache rewrites the
 * client-facing Cache-Control; Age / x-drbl-cached-at drives stale refresh.
 */
export function edgeCacheStorageControlHeader(
  policy: PageHtmlCachePolicy
): string {
  return `public, max-age=${policy.fresh + policy.stale}`;
}

/** Env kill switch: unset/empty/"1"/"true"/"on" → enabled; "0"/"false"/"off" → disabled. */
export function edgeHtmlCacheEnabled(
  envValue: string | undefined | null
): boolean {
  if (envValue == null || envValue === "") return true;
  const v = envValue.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return true;
}
