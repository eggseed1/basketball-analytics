/**
 * Thin-edge filter for scrapers that send a desktop browser User-Agent but none
 * of the Fetch Metadata headers real browsers attach to every HTTPS request
 * (Chrome/Edge since 76, Firefox since 90). Safari is not checked: iOS 15 and
 * older never send them.
 */

export type BotGuardMode = "block" | "log" | "off";

export type BotGuardVerdict = { block: false } | { block: true; reason: "fake-browser" };

const ALLOW = { block: false } as const;

/** Declared crawlers, previewers and audit tools keep their normal access. */
const DECLARED_AGENT =
  /bot|crawl|spider|slurp|preview|externalhit|lighthouse|pagespeed|google|bing|yandex|baidu|duckduck|monitor|uptime|headless/i;

const CHROMIUM_VERSION = /\bChrome\/(\d+)\./;
const FIREFOX_VERSION = /\bFirefox\/(\d+)\./;
/** iOS Chrome/Firefox run WebKit and identify as CriOS / FxiOS, not Chrome/Firefox. */
const MIN_CHROMIUM_WITH_FETCH_METADATA = 80;
const MIN_FIREFOX_WITH_FETCH_METADATA = 90;

export function botGuardMode(raw: unknown): BotGuardMode {
  if (typeof raw !== "string") return "block";
  const value = raw.trim().toLowerCase();
  if (value === "off" || value === "0" || value === "false") return "off";
  if (value === "log") return "log";
  return "block";
}

function claimsFetchMetadataBrowser(ua: string): boolean {
  const chromium = CHROMIUM_VERSION.exec(ua);
  if (chromium) return Number(chromium[1]) >= MIN_CHROMIUM_WITH_FETCH_METADATA;
  const firefox = FIREFOX_VERSION.exec(ua);
  if (firefox) return Number(firefox[1]) >= MIN_FIREFOX_WITH_FETCH_METADATA;
  return false;
}

export function classifyEdgeRequest(headers: Headers): BotGuardVerdict {
  // Service-binding and cron subrequests carry no client IP.
  if (!headers.get("cf-connecting-ip")) return ALLOW;
  const ua = headers.get("user-agent") ?? "";
  if (!ua || DECLARED_AGENT.test(ua)) return ALLOW;
  if (!claimsFetchMetadataBrowser(ua)) return ALLOW;
  if (headers.has("sec-fetch-mode") || headers.has("sec-fetch-dest")) return ALLOW;
  return { block: true, reason: "fake-browser" };
}

export function botGuardResponse(): Response {
  return new Response(
    "This request was blocked because it looked automated. If you're using a normal browser, update it or turn off extensions that strip request headers.\n",
    {
      status: 403,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "x-drbl-bot-guard": "fake-browser",
      },
    }
  );
}
