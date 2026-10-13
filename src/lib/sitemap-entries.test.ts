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

test("each child sitemap is unique https://drbl.io URLs in a urlset", () => {
  const seen = new Set<string>();
  for (const kind of SITEMAP_KINDS) {
    const urls = sitemapUrls(kind);
    assert.ok(urls.length > 0, `${kind} is empty`);
    const xml = urlsetXml(kind);
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
