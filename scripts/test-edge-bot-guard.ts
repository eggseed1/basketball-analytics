import assert from "node:assert/strict";
import {
  botGuardMode,
  classifyEdgeRequest,
  isHtmlShellPath,
  isSeoCrawler,
  shouldRefuseOrigin,
} from "../src/lib/edge-bot-guard";

const CHROME_145_WIN =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";
const FIREFOX_151_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:151.0) Gecko/20100101 Firefox/151.0";
const SAFARI_15_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1";
const CHROME_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1";
const APPLEBOT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)";
const AMAZON_SEARCH =
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Amzn-SearchBot/0.1) Chrome/119.0.6045.214 Safari/537.36";
const GOOGLEBOT =
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const OAI_SEARCH =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36; compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot";
const SEMRUSH = "Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)";
const EXA = "Mozilla/5.0 (compatible; ExaSearchBot/1.0; +https://crawler.exa.ai/)";
const GPTBOT = "Mozilla/5.0 AppleWebKit/537.36 (compatible; GPTBot/1.2; +https://openai.com/gptbot)";
const OLD_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/48.0.2564.116 Safari/537.36";

function headers(ua: string, extra: Record<string, string> = {}, ip = "203.0.113.9"): Headers {
  const h = new Headers({ "user-agent": ua, ...extra });
  if (ip) h.set("cf-connecting-ip", ip);
  return h;
}

function req(
  path: string,
  ua: string,
  extra: Record<string, string> = {},
  cf: { asn?: number } | null = null,
  ip = "203.0.113.9"
) {
  return {
    url: `https://drbl.io${path}`,
    headers: headers(ua, extra, ip),
    cf,
  };
}

const browserNav = { "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" };
const sameOriginRsc = {
  "sec-fetch-mode": "cors",
  "sec-fetch-dest": "empty",
  "sec-fetch-site": "same-origin",
  rsc: "1",
};

assert.deepEqual(classifyEdgeRequest(headers(CHROME_145_WIN)), {
  block: true,
  reason: "fake-browser",
});
assert.deepEqual(classifyEdgeRequest(headers(FIREFOX_151_MAC)), {
  block: true,
  reason: "fake-browser",
});
assert.equal(classifyEdgeRequest(headers(CHROME_145_WIN, browserNav)).block, false);
assert.equal(classifyEdgeRequest(headers(FIREFOX_151_MAC, { "sec-fetch-mode": "cors" })).block, false);
assert.equal(classifyEdgeRequest(headers(SAFARI_15_IOS)).block, false);
assert.equal(classifyEdgeRequest(headers(CHROME_IOS)).block, false);
assert.equal(classifyEdgeRequest(headers(OLD_CHROME)).block, false);

assert.deepEqual(classifyEdgeRequest(req("/", GPTBOT)), {
  block: true,
  reason: "disallowed-bot",
});

for (const ua of [APPLEBOT, GOOGLEBOT, OAI_SEARCH, SEMRUSH, AMAZON_SEARCH]) {
  assert.equal(classifyEdgeRequest(req("/", ua)).block, false, ua);
}

assert.deepEqual(classifyEdgeRequest(req("/explore/players?_rsc=abc", CHROME_145_WIN, browserNav)), {
  block: true,
  reason: "rsc-scrape",
});
assert.deepEqual(classifyEdgeRequest(req("/?_rsc=abc", OAI_SEARCH)), {
  block: true,
  reason: "rsc-scrape",
});
assert.equal(
  classifyEdgeRequest(req("/explore/players?_rsc=abc", CHROME_145_WIN, sameOriginRsc)).block,
  false
);

assert.equal(isSeoCrawler(GOOGLEBOT), true);
assert.equal(isSeoCrawler(APPLEBOT), true);
assert.equal(isSeoCrawler(OAI_SEARCH), false);
assert.equal(isSeoCrawler(SEMRUSH), false);

// SEO crawlers may cold-render.
assert.equal(shouldRefuseOrigin(req("/", GOOGLEBOT, {}, { asn: 15169 })), false);
assert.equal(shouldRefuseOrigin(req("/", APPLEBOT)), false);
// Non-SEO bots are cache-only.
assert.equal(shouldRefuseOrigin(req("/scores", OAI_SEARCH)), true);
assert.equal(shouldRefuseOrigin(req("/ask", SEMRUSH)), true);
assert.equal(shouldRefuseOrigin(req("/compare", EXA)), true);
assert.equal(shouldRefuseOrigin(req("/", AMAZON_SEARCH)), true);
// Cloud ASN without cookie.
assert.equal(
  shouldRefuseOrigin(req("/scores", CHROME_145_WIN, browserNav, { asn: 31898 })),
  true
);
assert.equal(
  shouldRefuseOrigin(
    req("/scores", CHROME_145_WIN, { ...browserNav, cookie: "sid=1" }, { asn: 31898 })
  ),
  false
);
assert.equal(
  shouldRefuseOrigin(req("/games/1", "drbl-deploy-cache-warm", {}, { asn: 14061 })),
  false
);

assert.equal(isHtmlShellPath("/learn/true-shooting"), true);
assert.equal(isHtmlShellPath("/explore/players"), true);
assert.equal(isHtmlShellPath("/players/123"), false);

assert.equal(botGuardMode(undefined), "block");
assert.equal(botGuardMode("log"), "log");
assert.equal(botGuardMode("OFF"), "off");

console.log("edge-bot-guard: ok");
