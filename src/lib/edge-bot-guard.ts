/**
 * Thin-edge filters that keep scrapers off OpenNext SSR.
 *
 * 1. fake-browser — desktop Chrome/Firefox UA with no Fetch Metadata
 * 2. rsc-scrape — Next.js RSC / `_rsc` requests that are not same-origin client nav
 * 3. disallowed-bot — AI training crawlers listed in robots.ts (hard 403)
 * 4. refuse-origin — cloud ASNs and non-SEO bots may use EDGE/KV hits only;
 *    cache MISS does not call OpenNext
 */

export type BotGuardMode = "block" | "log" | "off";

export type BotGuardReason = "fake-browser" | "rsc-scrape" | "disallowed-bot" | "cache-only";

export type BotGuardVerdict =
  | { block: false }
  | { block: true; reason: BotGuardReason };

const ALLOW = { block: false } as const;

/**
 * Search engines we still cold-render for. Keep in sync with robots.ts intent
 * (never block Googlebot / Bingbot).
 */
const SEO_CRAWLER =
  /googlebot|bingbot|applebot(?!-extended)|duckduckbot|yandex(?:bot)?|baiduspider/i;

/** Any self-identified bot / crawler / previewer. */
const DECLARED_AGENT =
  /bot|crawl|spider|slurp|preview|externalhit|lighthouse|pagespeed|google|bing|yandex|baidu|duckduck|monitor|uptime/i;

/**
 * AI training crawlers from src/app/robots.ts — hard-blocked at the edge even
 * when a page is already in PAGE_CACHE (robots disallow: /).
 */
const DISALLOWED_BOT =
  /GPTBot|ClaudeBot|Claude-Web|anthropic-ai|CCBot|Bytespider|Amazonbot|meta-externalagent|FacebookBot|Applebot-Extended|Google-Extended|Google-CloudVertexBot|GoogleOther|Reflectionbot|cohere-ai|Diffbot|omgili|MistralAI-Training|PetalBot|Timpibot|ImagesiftBot/i;

const CHROMIUM_VERSION = /\bChrome\/(\d+)\./;
const FIREFOX_VERSION = /\bFirefox\/(\d+)\./;
/** iOS Chrome/Firefox run WebKit and identify as CriOS / FxiOS, not Chrome/Firefox. */
const MIN_CHROMIUM_WITH_FETCH_METADATA = 80;
const MIN_FIREFOX_WITH_FETCH_METADATA = 90;

/**
 * Hosting / cloud ASNs that drove Nov SSR spend (Oracle, major VPS, cloud).
 * Residential ISPs are intentionally omitted. Update from Cloudflare Analytics.
 */
const CLOUD_HOSTING_ASN = new Set<number>([
  31898, // Oracle Cloud
  14061, // DigitalOcean
  24940, // Hetzner
  16276, // OVH
  16509, // Amazon
  14618, // Amazon
  15169, // Google Cloud
  8075, // Microsoft
  20473, // Choopa / Vultr
  63949, // Linode / Akamai
  62567, // DigitalOcean
  45102, // Alibaba
  132203, // Tencent
  136907, // Huawei Cloud
  37963, // Alibaba
  55960, // Biznet / cloud
  45090, // Tencent
  209366, // SEMrush
]);

export function botGuardMode(raw: unknown): BotGuardMode {
  if (typeof raw !== "string") return "block";
  const value = raw.trim().toLowerCase();
  if (value === "off" || value === "0" || value === "false") return "off";
  if (value === "log") return "log";
  return "block";
}

export function isSeoCrawler(ua: string): boolean {
  return SEO_CRAWLER.test(ua);
}

function claimsFetchMetadataBrowser(ua: string): boolean {
  const chromium = CHROMIUM_VERSION.exec(ua);
  if (chromium) return Number(chromium[1]) >= MIN_CHROMIUM_WITH_FETCH_METADATA;
  const firefox = FIREFOX_VERSION.exec(ua);
  if (firefox) return Number(firefox[1]) >= MIN_FIREFOX_WITH_FETCH_METADATA;
  return false;
}

function isSameOriginClientNav(headers: Headers): boolean {
  const site = (headers.get("sec-fetch-site") ?? "").toLowerCase();
  if (site !== "same-origin" && site !== "same-site") return false;
  return headers.has("sec-fetch-mode") || headers.has("sec-fetch-dest");
}

function isRscRequest(url: URL, headers: Headers): boolean {
  if (url.searchParams.has("_rsc")) return true;
  if (headers.has("rsc")) return true;
  if (headers.has("next-router-state-tree")) return true;
  if (headers.has("next-router-prefetch")) return true;
  if (headers.has("next-url")) return true;
  return false;
}

export type CfAsn = { asn?: number | string | null };

/** Request shape used by the guard (avoids relying on DOM Request in tests). */
export type GuardRequest = {
  url: string;
  headers: Headers;
  cf?: CfAsn | null;
};

export function classifyEdgeRequest(input: Headers | GuardRequest): BotGuardVerdict {
  const headers = input instanceof Headers ? input : input.headers;
  const url =
    input instanceof Headers ? new URL("https://drbl.io/") : new URL(input.url);

  // Service-binding and cron subrequests carry no client IP.
  if (!headers.get("cf-connecting-ip")) return ALLOW;

  const ua = headers.get("user-agent") ?? "";

  if (ua && DISALLOWED_BOT.test(ua)) {
    return { block: true, reason: "disallowed-bot" };
  }

  // Next client RSC navigations are cheap to forge and skip PAGE_CACHE. Only
  // same-origin browser fetches (after a real document load) should reach origin.
  if (isRscRequest(url, headers) && !isSameOriginClientNav(headers)) {
    return { block: true, reason: "rsc-scrape" };
  }

  if (!ua || DECLARED_AGENT.test(ua)) return ALLOW;
  if (!claimsFetchMetadataBrowser(ua)) return ALLOW;
  if (headers.has("sec-fetch-mode") || headers.has("sec-fetch-dest")) return ALLOW;
  return { block: true, reason: "fake-browser" };
}

/**
 * True when a cache MISS must not call OpenNext. Cache HIT/STALE still serve.
 * Google/Bing/Applebot may cold-fetch. OAI-Search / Semrush / Exa / cloud ASNs
 * do not.
 */
export function shouldRefuseOrigin(input: GuardRequest): boolean {
  const headers = input.headers;
  if (!headers.get("cf-connecting-ip")) return false;
  if (headers.has("cookie")) return false;

  const verdict = classifyEdgeRequest(input);
  if (verdict.block) return true;

  const ua = headers.get("user-agent") ?? "";
  // Deploy / cron warmers intentionally cold-fill PAGE_CACHE from cloud IPs.
  if (/^drbl-(?:deploy-cache-warm|keep-warm-cron)\b/i.test(ua)) return false;
  // Real search engines may cold-fetch HTML for SEO.
  if (isSeoCrawler(ua)) return false;
  // Every other self-identified bot is cache-only (OAI-Search, Semrush, Exa, …).
  if (DECLARED_AGENT.test(ua)) return true;

  const asnRaw = input.cf?.asn;
  const asn = typeof asnRaw === "string" ? Number(asnRaw) : asnRaw;
  if (typeof asn === "number" && Number.isFinite(asn) && CLOUD_HOSTING_ASN.has(asn)) {
    return true;
  }
  return false;
}

/** Main nav shells bots hammered in Nov (SSR CPU bill). */
export function isHtmlShellPath(pathname: string): boolean {
  if (pathname === "/" || pathname === "/scores" || pathname === "/standings") return true;
  if (pathname === "/ask" || pathname === "/compare" || pathname === "/acquisitions") return true;
  if (
    pathname === "/sentiment" ||
    pathname === "/offseason" ||
    pathname === "/history" ||
    pathname === "/arcade" ||
    pathname === "/about" ||
    pathname === "/terms" ||
    pathname === "/privacy" ||
    pathname === "/sources"
  ) {
    return true;
  }
  if (pathname === "/learn" || pathname.startsWith("/learn/")) return true;
  if (pathname.startsWith("/explore/")) return true;
  if (pathname.startsWith("/teams/")) return true;
  return false;
}

export function botGuardResponse(reason: BotGuardReason = "fake-browser"): Response {
  const body =
    reason === "disallowed-bot"
      ? "Crawling of this site is disallowed for this user agent (see /robots.txt).\n"
      : reason === "cache-only"
        ? "This path is only served from cache for automated clients. Try again later or use a normal browser.\n"
        : "This request was blocked because it looked automated. If you're using a normal browser, update it or turn off extensions that strip request headers.\n";
  return new Response(body, {
    status: 403,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-drbl-bot-guard": reason,
    },
  });
}
