/**
 * Run: npx tsx --test src/lib/sitemap-entries.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import { SITEMAP_KINDS, sitemapUrls } from "@/lib/sitemap-entries";
import { sitemapIndexXml, urlsetXml } from "@/lib/sitemap-xml";

test("sitemap index lists the three child files", () => {
  const xml = sitemapIndexXml();
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<sitemapindex xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
  for (const kind of SITEMAP_KINDS) {
    assert.match(xml, new RegExp(`<loc>https://drbl.io/sitemaps/${kind}\\.xml</loc>`));
  }
});

test("each child sitemap is unique https://drbl.io URLs in a urlset", async () => {
  const seen = new Set<string>();
  for (const kind of SITEMAP_KINDS) {
    const urls = await sitemapUrls(kind);
    assert.ok(urls.length > 0, `${kind} is empty`);
    const xml = await urlsetXml(kind);
    assert.match(xml, /<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    assert.equal(locs.length, urls.length, `${kind} XML count`);
    for (const loc of locs) {
      assert.match(loc, /^https:\/\/drbl\.io\//);
      assert.equal(seen.has(loc), false, `duplicate ${loc}`);
      seen.add(loc);
    }
  }
  assert.ok(seen.size > 1000);
});

test("pages sitemap includes brand and advanced-stats hubs", async () => {
  const locs = new Set((await sitemapUrls("pages")).map((u) => u.loc));
  for (const path of [
    "/",
    "/scores",
    "/explore/players",
    "/standings",
    "/compare",
    "/ask",
  ]) {
    assert.ok(locs.has(`https://drbl.io${path}`), `missing ${path}`);
  }
});
