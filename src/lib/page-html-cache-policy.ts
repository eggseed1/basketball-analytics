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

/** Homepage is the coldest path after deploy; fewer re-renders = fewer OOMs. */
export const HOME_HTML_POLICY: PageHtmlCachePolicy = {
  fresh: 5 * 60,
  stale: 30 * 60,
};

export const DAILY_HTML_POLICY: PageHtmlCachePolicy = {
  fresh: 15 * 60,
  stale: 6 * 60 * 60,
};

/** Scores, live game lab, and other high-churn HTML. */
export const LIVE_HTML_PATH =
  /^\/(?:scores|dashboard|explore\/games|games\/[^/]+)$/;

export const HOME_HTML_PATH = /^\/$/;

/**
 * Path prefixes safe for Cloudflare Cache API + public s-maxage.
 * Everything else may still use Worker KV PAGE_CACHE with private no-store.
 * Live paths (scores / game lab) are excluded in isCdnHtmlPath.
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

export function isCdnHtmlPath(pathname: string): boolean {
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
  if (isLiveHtmlPath(pathname)) return LIVE_HTML_POLICY;
  return DAILY_HTML_POLICY;
}

/**
 * Browser + CDN directives for a Worker HTML response.
 * - CDN-eligible: public s-maxage so caches.default (and CF cache) may store.
 *   max-age=0 keeps browsers revalidating with the Worker.
 * - Live / non-CDN: private no-store (today's behavior).
 */
export function htmlCacheControlHeader(
  pathname: string,
  policy: PageHtmlCachePolicy,
  options?: { cdnEnabled?: boolean }
): string {
  const cdn = options?.cdnEnabled !== false && isCdnHtmlPath(pathname);
  if (!cdn) {
    return "private, no-cache, no-store, max-age=0, must-revalidate";
  }
  return `public, max-age=0, s-maxage=${policy.fresh}, stale-while-revalidate=${policy.stale}`;
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
