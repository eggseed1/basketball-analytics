import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DAILY_HTML_POLICY,
  LIVE_HTML_POLICY,
  edgeCacheStorageControlHeader,
  edgeHtmlCacheEnabled,
  htmlCacheControlHeader,
  htmlCachePolicyForPath,
  htmlHasGameFinalMarker,
  isCdnHtmlPath,
  isGameHtmlPath,
  isLiveHtmlPath,
  isScoresHtmlPath,
} from "./page-html-cache-policy";

describe("page-html-cache-policy", () => {
  it("marks live surfaces and keeps them off the CDN allowlist", () => {
    assert.equal(isLiveHtmlPath("/scores"), false);
    assert.equal(isScoresHtmlPath("/scores"), true);
    assert.equal(isLiveHtmlPath("/games/401909834"), true);
    assert.equal(isLiveHtmlPath("/explore/games"), true);
    assert.equal(isGameHtmlPath("/games/401909834"), true);
    assert.equal(isGameHtmlPath("/scores"), false);
    assert.equal(isCdnHtmlPath("/games/401909834"), false);
    assert.equal(isCdnHtmlPath("/explore/games"), false);
  });

  it("allows the scores shell on a short public CDN TTL", () => {
    assert.equal(isCdnHtmlPath("/scores"), true);
    assert.equal(htmlCachePolicyForPath("/scores").fresh, LIVE_HTML_POLICY.fresh);
    assert.match(
      htmlCacheControlHeader("/scores", LIVE_HTML_POLICY),
      /^public, max-age=0, s-maxage=60, stale-while-revalidate=/
    );
  });

  it("detects the final-game HTML marker for Worker EDGE promotion", () => {
    assert.equal(htmlHasGameFinalMarker('<span hidden data-html-cache="game-final" />'), true);
    assert.equal(htmlHasGameFinalMarker("<main>live game</main>"), false);
  });

  it("allows daily player/team/board HTML on the CDN path", () => {
    for (const path of [
      "/",
      "/players",
      "/players/4594268",
      "/players/4594268/season-rank",
      "/teams/18",
      "/explore",
      "/explore/players",
      "/standings",
      "/history",
      "/learn/drbl",
      "/compare",
      "/ask",
    ]) {
      assert.equal(isCdnHtmlPath(path), true, path);
    }
  });

  it("keeps interactive tools off the CDN allowlist", () => {
    for (const path of ["/gm", "/ask?q=who", "/api/players"]) {
      // ask with query is not matched by pathname alone; pathname /ask is ok
      if (path.startsWith("/ask?")) continue;
      if (path.startsWith("/api")) {
        assert.equal(isCdnHtmlPath(path), false, path);
      }
    }
    assert.equal(isCdnHtmlPath("/gm"), false);
    assert.equal(isCdnHtmlPath("/gm/league"), false);
  });

  it("picks policies by path class", () => {
    assert.equal(htmlCachePolicyForPath("/").fresh, 5 * 60);
    assert.equal(htmlCachePolicyForPath("/scores").fresh, LIVE_HTML_POLICY.fresh);
    assert.equal(htmlCachePolicyForPath("/players/1").fresh, DAILY_HTML_POLICY.fresh);
  });

  it("emits public s-maxage only for CDN paths when enabled", () => {
    const daily = DAILY_HTML_POLICY;
    assert.match(
      htmlCacheControlHeader("/players/1", daily),
      /^public, max-age=0, s-maxage=900, stale-while-revalidate=/
    );
    assert.equal(
      htmlCacheControlHeader("/players/1", daily, { cdnEnabled: false }),
      "private, no-cache, no-store, max-age=0, must-revalidate"
    );
    assert.match(
      htmlCacheControlHeader("/games/401909834", daily, { cdnEnabled: true }),
      /^public, max-age=0, s-maxage=900, stale-while-revalidate=/
    );
  });

  it("stores Cache API entries with a real max-age (not client max-age=0)", () => {
    assert.equal(
      edgeCacheStorageControlHeader(DAILY_HTML_POLICY),
      `public, max-age=${DAILY_HTML_POLICY.fresh}`
    );
  });

  it("honors the edge cache kill switch", () => {
    assert.equal(edgeHtmlCacheEnabled(undefined), true);
    assert.equal(edgeHtmlCacheEnabled(""), true);
    assert.equal(edgeHtmlCacheEnabled("1"), true);
    assert.equal(edgeHtmlCacheEnabled("0"), false);
    assert.equal(edgeHtmlCacheEnabled("off"), false);
    assert.equal(edgeHtmlCacheEnabled("false"), false);
  });
});
