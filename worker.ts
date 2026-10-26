import { localeCacheKeySegment } from "./src/i18n/locale-cache-key";
import {
  DAILY_HTML_POLICY,
  edgeCacheStorageControlHeader,
  edgeHtmlCacheEnabled,
  htmlCacheControlHeader,
  htmlCachePolicyForPath,
  htmlHasGameFinalMarker,
  isCdnHtmlPath,
  isGameHtmlPath,
  type PageHtmlCachePolicy,
} from "./src/lib/page-html-cache-policy";
import { decodePageHtmlKv, encodePageHtmlKv } from "./src/lib/page-html-kv-codec";

type RateLimitBinding = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

type PageCacheBinding = {
  get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
  put(
    key: string,
    value: ArrayBuffer | string,
    options: { expirationTtl: number }
  ): Promise<void>;
};

type OriginFetcher = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

type WorkerEnv = Record<string, unknown> & {
  API_RATE_LIMITER?: RateLimitBinding;
  PAGE_CACHE?: PageCacheBinding;
  CF_VERSION_METADATA?: { id?: string };
  /** Fat OpenNext Worker — only used on MISS / uncached paths. */
  ORIGIN?: OriginFetcher;
  /** Optional deploy override: force English (or another implemented locale) for all HTML. */
  DRBL_FORCE_LOCALE?: string;
  /**
   * Kill switch for Cloudflare Cache API + public s-maxage on daily HTML.
   * Unset/true = on; "0" / "false" / "off" = KV-only with private no-store.
   */
  DRBL_EDGE_HTML_CACHE?: string;
};

type WorkerContext = { waitUntil(promise: Promise<unknown>): void };

/** Forward to the origin Worker. EDGE/KV hits never call this. */
async function originFetch(
  request: Request,
  env: WorkerEnv
): Promise<Response> {
  if (!env.ORIGIN) {
    return new Response("ORIGIN binding missing", { status: 503 });
  }
  return env.ORIGIN.fetch(request);
}

/** Cloudflare Workers expose caches.default; DOM CacheStorage typings omit it. */
function edgeCache(): Cache {
  return (caches as unknown as { default: Cache }).default;
}

/**
 * JSON APIs the homepage polls after first paint. `s-maxage` alone does nothing
 * on Workers — Cache API here makes the second desk hit cheap.
 * Skip personalized / live paths (scores, watchlist, analytics?fresh=1).
 */
const EDGE_CACHED_API =
  /^\/api\/(?:home\/(?:insights|hot-cold|performers|week-strip|standings)|news\/analytics)$/;

const API_EDGE_TTL_SECONDS = 120;

function apiCacheKeyRequest(version: string, url: URL): Request {
  return new Request(
    `https://drbl-api-cache.internal/${version}${url.pathname}${url.search}`,
    { method: "GET", headers: { accept: "application/json" } }
  );
}

async function serveCachedApi(
  request: Request,
  env: WorkerEnv,
  ctx: WorkerContext
): Promise<Response | null> {
  if (request.method !== "GET") return null;
  const url = new URL(request.url);
  if (!EDGE_CACHED_API.test(url.pathname)) return null;
  // Soft-refresh with fresh=1 must bypass (analytics desk).
  if (url.searchParams.has("fresh")) return null;

  const version = env.CF_VERSION_METADATA?.id?.trim() || "nov";
  const cacheKey = apiCacheKeyRequest(version, url);

  try {
    const matched = await edgeCache().match(cacheKey);
    if (matched) {
      const headers = new Headers(matched.headers);
      headers.set("x-api-cache", "EDGE");
      return new Response(matched.body, { status: matched.status, headers });
    }
  } catch {
    /* Cache API unavailable — fall through */
  }

  const response = await originFetch(request, env);
  const type = response.headers.get("content-type") ?? "";
  if (
    response.status !== 200 ||
    response.body == null ||
    response.headers.has("set-cookie") ||
    !type.includes("application/json")
  ) {
    return response;
  }

  const [toClient, toCache] = response.body.tee();
  ctx.waitUntil(
    (async () => {
      try {
        const headers = new Headers();
        headers.set("content-type", type);
        headers.set(
          "cache-control",
          `public, max-age=${API_EDGE_TTL_SECONDS}`
        );
        headers.set("x-api-cache", "EDGE");
        await edgeCache().put(
          cacheKey,
          new Response(toCache, { status: 200, headers })
        );
      } catch {
        await toCache.cancel().catch(() => undefined);
      }
    })()
  );

  const headers = new Headers(response.headers);
  headers.set("x-api-cache", "MISS");
  return new Response(toClient, { status: 200, headers });
}

type CachePolicy = PageHtmlCachePolicy;

const PAGE_CACHE_MAX_BYTES = 5 * 1024 * 1024;
const UNCACHED_PATH = /^\/(?:api|internal|_next)(?:\/|$)|\.[a-z0-9]+$/i;
// Query params pages read that are safe to key on. Any other param could change
// the HTML in ways the key can't see, so those requests skip the cache.
const CACHEABLE_PARAMS = new Set([
  "season", "view", "seasonType", "page", "stat", "filter", "mode",
  "tab", "rate", "arc", "gamesPage", "sort", "dir", "from", "theme",
  // Scores day/week/month shells (list pagination `after`/`afterId` stay uncached).
  "date", "month", "week",
  // Explore board filters (pages read these; keep HTML cacheable).
  "minimumMinutes", "minimumGames", "team", "position", "player",
  // Compare deep-links.
  "a", "b", "an", "bn", "teamA", "teamB", "teamId", "seasonA", "seasonB",
  "seasons", "era", "basis",
]);
const REPLAYED_HEADERS = [
  "content-type", "link", "vary", "content-security-policy", "permissions-policy",
  "referrer-policy", "x-content-type-options", "x-frame-options",
  "strict-transport-security",
];
// Streamed server errors and redirects inside a 200 stream.
// next/dynamic ssr:false also emits a digest, which is not an error.
// Nested notFound() (404) is common on otherwise-good player HTML (slot digests);
// only treat hard failures as uncacheable so PAGE_CACHE / Cache API can HIT.
// Pages flag a degraded render (a known player whose career didn't load) with data-page-cache="skip".
const UNCACHEABLE_MARKERS = [
  /data-dgst="(?!BAILOUT_TO_CLIENT_SIDE_RENDERING")/,
  /NEXT_HTTP_ERROR_FALLBACK;(?:500|403)/,
  /NEXT_REDIRECT/,
  /data-page-cache="skip"/,
];

/**
 * Truncated streams leave the loading shell up and poison PAGE_CACHE.
 * Also reject route loading.tsx documents that finished without deep content
 * (seen as STALE ~100KB Game Lab pages stuck on "Loading Game Lab…").
 */
function isUncacheableHtml(html: string, pathname?: string): boolean {
  if (!/<\/html>/i.test(html)) return true;
  if (UNCACHEABLE_MARKERS.some((marker) => marker.test(html))) return true;

  // Game Lab: DestinationLoadingFrame subtitle without finished lab headings.
  if (pathname && /^\/games\/[^/]+$/.test(pathname)) {
    const loadingShell =
      /Matchup identity and score load first/i.test(html) &&
      !/type-heading">(?:Game flow|Team comparison|Box score|Top performers)/i.test(
        html
      );
    if (loadingShell) return true;
    // Final with no roster / team totals — do not poison EDGE (CDN timeout).
    if (
      /Box score roster lines are not available for this game/i.test(html) ||
      /Team box totals aren.?t available for this game/i.test(html)
    ) {
      return true;
    }
  }

  // Player page: loading skeleton only (no identity heading in the document).
  if (pathname && /^\/players\/[^/]+$/.test(pathname)) {
    const loadingOnly =
      /Loading player…/i.test(html) &&
      !/data-motion-page/i.test(html) &&
      html.length < 200_000;
    if (loadingOnly) return true;
  }

  return false;
}

type PageCacheEntry = {
  key: string;
  policy: CachePolicy;
  pathname: string;
  cdn: boolean;
};

function pageCacheEntry(request: Request, env: WorkerEnv): PageCacheEntry | null {
  if (request.method !== "GET" || !env.PAGE_CACHE) return null;
  // Version metadata should always be present with wrangler version_metadata;
  // fall back so a missing id does not disable the whole HTML cache path.
  const version = env.CF_VERSION_METADATA?.id?.trim() || "nov";
  if (request.headers.has("rsc") || request.headers.has("next-router-prefetch")) return null;
  const url = new URL(request.url);
  if (UNCACHED_PATH.test(url.pathname)) return null;
  const params = [...url.searchParams.entries()];
  if (params.some(([k, v]) => !CACHEABLE_PARAMS.has(k) || v.length > 40)) return null;
  params.sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv));
  const query = new URLSearchParams(params).toString();
  const locale = localeCacheKeySegment(request, {
    forceLocale: typeof env.DRBL_FORCE_LOCALE === "string" ? env.DRBL_FORCE_LOCALE : null,
  });
  const key = `page:${version}:${locale}:${url.pathname}${query ? `?${query}` : ""}`;
  if (key.length > 480) return null;
  const cdn =
    edgeHtmlCacheEnabled(
      typeof env.DRBL_EDGE_HTML_CACHE === "string" ? env.DRBL_EDGE_HTML_CACHE : undefined
    ) && isCdnHtmlPath(url.pathname);
  return {
    key,
    policy: htmlCachePolicyForPath(url.pathname),
    pathname: url.pathname,
    cdn,
  };
}

/** Synthetic request so Cache API keys match KV (locale + version + path), not raw Cookie. */
function edgeCacheKeyRequest(entry: PageCacheEntry): Request {
  return new Request(`https://drbl-page-cache.internal/${encodeURIComponent(entry.key)}`, {
    method: "GET",
    headers: { accept: "text/html" },
  });
}

function applyHtmlCacheHeaders(
  headers: Headers,
  entry: PageCacheEntry,
  state: "HIT" | "STALE" | "MISS" | "EDGE"
): void {
  headers.set(
    "cache-control",
    htmlCacheControlHeader(entry.pathname, entry.policy, { cdnEnabled: entry.cdn })
  );
  headers.set("x-page-cache", state);
}

async function cachedResponse(
  raw: ArrayBuffer,
  entry: PageCacheEntry
): Promise<{ response: Response; stale: boolean } | null> {
  const decoded = await decodePageHtmlKv(raw);
  if (!decoded) return null;
  const age = Math.max(0, Math.round((Date.now() - decoded.meta.at) / 1000));
  if (age >= entry.policy.fresh + entry.policy.stale) return null;
  const { html } = decoded;
  // Drop poisoned loading shells so the next request re-renders.
  if (isUncacheableHtml(html, entry.pathname)) return null;
  const stale = age >= entry.policy.fresh;
  const headers = new Headers(decoded.meta.headers);
  headers.set("age", String(age));
  applyHtmlCacheHeaders(headers, entry, stale ? "STALE" : "HIT");
  return { response: new Response(html, { status: 200, headers }), stale };
}

function isCacheableResponse(response: Response): response is Response & { body: ReadableStream<Uint8Array> } {
  const type = response.headers.get("content-type") ?? "";
  return (
    response.status === 200 &&
    response.body !== null &&
    type.startsWith("text/html") &&
    !response.headers.has("set-cookie")
  );
}

function edgeEligibleEntry(
  entry: PageCacheEntry,
  html: string
): { eligible: boolean; policy: CachePolicy } {
  if (entry.cdn) return { eligible: true, policy: entry.policy };
  // Finished games: path stays off the path-based CDN allowlist (live HTML must
  // stay private), but finals with the page marker may use Cache API + s-maxage.
  if (isGameHtmlPath(entry.pathname) && htmlHasGameFinalMarker(html)) {
    return { eligible: true, policy: DAILY_HTML_POLICY };
  }
  return { eligible: false, policy: entry.policy };
}

async function putEdgeHtml(
  entry: PageCacheEntry,
  html: string,
  replayed: Record<string, string>,
  policy: CachePolicy
): Promise<void> {
  const edgeHeaders = new Headers(replayed);
  // Storage TTL for caches.default — not the browser-facing max-age=0 header.
  edgeHeaders.set("cache-control", edgeCacheStorageControlHeader(policy));
  edgeHeaders.set("x-page-cache", "EDGE");
  // Reliable Age for SWR refresh (Cache API Age is not always present).
  edgeHeaders.set("x-drbl-cached-at", String(Date.now()));
  const edgeResponse = new Response(html, { status: 200, headers: edgeHeaders });
  await edgeCache().put(edgeCacheKeyRequest(entry), edgeResponse);
}

async function storePage(
  env: WorkerEnv,
  entry: PageCacheEntry,
  headers: Headers,
  body: ReadableStream<Uint8Array>
): Promise<void> {
  const html = await new Response(body).text();
  if (html.length > PAGE_CACHE_MAX_BYTES) return;
  if (isUncacheableHtml(html, entry.pathname)) return;
  const replayed: Record<string, string> = {};
  for (const name of REPLAYED_HEADERS) {
    const value = headers.get(name);
    if (value) replayed[name] = value;
  }
  const edge = edgeEligibleEntry(entry, html);
  const kvPolicy = edge.eligible && isGameHtmlPath(entry.pathname) ? edge.policy : entry.policy;
  const packed = await encodePageHtmlKv({ at: Date.now(), headers: replayed }, html);
  await env.PAGE_CACHE!.put(entry.key, packed, {
    expirationTtl: kvPolicy.fresh + kvPolicy.stale,
  });

  if (!edge.eligible) return;
  try {
    await putEdgeHtml(entry, html, replayed, edge.policy);
  } catch {
    // Cache API can throw in some runtimes; KV alone is still enough.
  }
}

// Keys this isolate is already re-rendering, so a burst of stale hits starts one render.
const refreshing = new Set<string>();
/** Cross-isolate coalesce: KV lock so every colo doesn't SSR the same STALE key. */
const REFRESH_LOCK_TTL_SECONDS = 90;

async function claimRefreshLock(env: WorkerEnv, pageKey: string): Promise<boolean> {
  if (!env.PAGE_CACHE) return true;
  const lockKey = `refresh:${pageKey}`;
  try {
    const existing = await env.PAGE_CACHE.get(lockKey, "arrayBuffer");
    if (existing && existing.byteLength > 0) return false;
    await env.PAGE_CACHE.put(lockKey, "1", {
      expirationTtl: Math.max(60, REFRESH_LOCK_TTL_SECONDS),
    });
    return true;
  } catch {
    // Fail open — better a duplicate refresh than stuck STALE forever.
    return true;
  }
}

async function refreshPage(request: Request, env: WorkerEnv, ctx: WorkerContext, entry: PageCacheEntry) {
  if (refreshing.has(entry.key)) return;
  refreshing.add(entry.key);
  try {
    if (!(await claimRefreshLock(env, entry.key))) return;
    const response = await originFetch(request, env);
    if (isCacheableResponse(response)) await storePage(env, entry, response.headers, response.body);
    else await response.body?.cancel();
  } finally {
    refreshing.delete(entry.key);
  }
}

function edgeStoredAgeSeconds(headers: Headers): number {
  const cachedAt = Number(headers.get("x-drbl-cached-at") ?? "");
  if (Number.isFinite(cachedAt) && cachedAt > 0) {
    return Math.max(0, Math.round((Date.now() - cachedAt) / 1000));
  }
  const age = Number(headers.get("age") ?? "");
  return Number.isFinite(age) && age >= 0 ? age : 0;
}

/** Policy used when this path was put into Cache API (game finals use daily). */
function edgeStoragePolicy(entry: PageCacheEntry): CachePolicy {
  if (isGameHtmlPath(entry.pathname)) return DAILY_HTML_POLICY;
  return entry.policy;
}

async function matchEdgeCache(
  entry: PageCacheEntry
): Promise<{ response: Response; stale: boolean } | null> {
  // Path-based CDN pages always check Cache API. Game finals may also be there
  // even though isCdnHtmlPath(games) is false (live games must stay private).
  if (!entry.cdn && !isGameHtmlPath(entry.pathname)) return null;
  try {
    const matched = await edgeCache().match(edgeCacheKeyRequest(entry));
    if (!matched) return null;

    const storagePolicy = edgeStoragePolicy(entry);
    const age = edgeStoredAgeSeconds(matched.headers);
    if (age >= storagePolicy.fresh + storagePolicy.stale) return null;
    const stale = age >= storagePolicy.fresh;

    // Finished games: must verify the final marker before serving. Buffering is
    // OK — finals are smaller after PBP left Flight. Daily CDN pages stream.
    if (isGameHtmlPath(entry.pathname)) {
      const html = await matched.text();
      if (isUncacheableHtml(html, entry.pathname)) return null;
      if (!htmlHasGameFinalMarker(html)) return null;
      const headers = new Headers(matched.headers);
      headers.set(
        "cache-control",
        htmlCacheControlHeader(entry.pathname, DAILY_HTML_POLICY, {
          cdnEnabled: true,
        })
      );
      headers.set("x-page-cache", stale ? "STALE" : "EDGE");
      headers.set("age", String(age));
      return {
        response: new Response(html, { status: matched.status, headers }),
        stale,
      };
    }

    const headers = new Headers(matched.headers);
    applyHtmlCacheHeaders(headers, entry, stale ? "STALE" : "EDGE");
    headers.set("age", String(age));
    return {
      response: new Response(matched.body, { status: matched.status, headers }),
      stale,
    };
  } catch {
    return null;
  }
}

async function servePage(
  request: Request,
  env: WorkerEnv,
  ctx: WorkerContext,
  entry: PageCacheEntry
): Promise<Response> {
  const edgeHit = await matchEdgeCache(entry);
  if (edgeHit) {
    // Colo SWR: keep serving past fresh while one isolate re-renders.
    if (edgeHit.stale) {
      ctx.waitUntil(
        refreshPage(new Request(request), env, ctx, entry).catch(() => undefined)
      );
    }
    return edgeHit.response;
  }

  const raw = await env.PAGE_CACHE!.get(entry.key, "arrayBuffer").catch(() => null);
  const cached = raw ? await cachedResponse(raw, entry) : null;
  if (cached) {
    if (cached.stale) {
      ctx.waitUntil(refreshPage(new Request(request), env, ctx, entry).catch(() => undefined));
    }
    // Promote every KV HIT/STALE into colo Cache API so the next request skips
    // the slow KV read (~1s for large HTML) and serves EDGE (~60ms).
    ctx.waitUntil(
      (async () => {
        try {
          const html = await cached.response.clone().text();
          const edge = edgeEligibleEntry(entry, html);
          if (!edge.eligible) return;
          const replayed: Record<string, string> = {};
          cached.response.headers.forEach((value, name) => {
            if (REPLAYED_HEADERS.includes(name)) replayed[name] = value;
          });
          await putEdgeHtml(entry, html, replayed, edge.policy);
        } catch {
          /* ignore */
        }
      })()
    );
    return cached.response;
  }

  const response = await originFetch(request, env);
  if (!isCacheableResponse(response)) return response;
  const [toClient, toCache] = response.body.tee();
  ctx.waitUntil(storePage(env, entry, response.headers, toCache).catch(() => undefined));
  const headers = new Headers(response.headers);
  applyHtmlCacheHeaders(headers, entry, "MISS");
  return new Response(toClient, { status: response.status, headers });
}

const RETRY_AFTER_SECONDS = 60;

function tooManyRequests(): Response {
  return new Response(JSON.stringify({ error: "Too many requests. Try again in a minute." }), {
    status: 429,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "retry-after": String(RETRY_AFTER_SECONDS),
      "cache-control": "no-store",
    },
  });
}

const CANONICAL_HOST = "drbl.io";

const worker = {
  async fetch(request: Request, env: WorkerEnv, ctx: WorkerContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === `www.${CANONICAL_HOST}`) {
      url.hostname = CANONICAL_HOST;
      return Response.redirect(url.toString(), 301);
    }
    const { pathname } = url;
    // Internal subrequests (service binding, cache revalidation) carry no client IP.
    const ip = request.headers.get("cf-connecting-ip");
    if (ip && env.API_RATE_LIMITER) {
      // Ask deep-links (`?q=`) SSR the full query engine and were the top isolate
      // OOM source; rate them with /api so crawler storms cannot tip the homepage.
      const askQuery = pathname === "/ask" && url.searchParams.has("q");
      if (pathname.startsWith("/api/") || askQuery) {
        const { success } = await env.API_RATE_LIMITER.limit({
          key: `${askQuery ? "ask" : "api"}:${ip}`,
        });
        if (!success) return tooManyRequests();
      }
    }
    const cacheEntry = pageCacheEntry(request, env);
    if (cacheEntry) return servePage(request, env, ctx, cacheEntry);

    const apiCached = await serveCachedApi(request, env, ctx);
    if (apiCached) return apiCached;

    const response = await originFetch(request, env);
    // Surface why HTML skipped Worker PAGE_CACHE / Cache API (no set-cookie path).
    if (
      request.method === "GET" &&
      (response.headers.get("content-type") ?? "").startsWith("text/html")
    ) {
      const headers = new Headers(response.headers);
      const reason = !env.PAGE_CACHE
        ? "no-kv"
        : !env.CF_VERSION_METADATA?.id
          ? "no-version"
          : request.headers.has("rsc") || request.headers.has("next-router-prefetch")
            ? "rsc"
            : UNCACHED_PATH.test(pathname)
              ? "path"
              : "params-or-key";
      headers.set("x-page-cache", "SKIP");
      headers.set("x-page-cache-skip", reason);
      return new Response(response.body, { status: response.status, headers });
    }
    return response;
  },
};

export default worker;
