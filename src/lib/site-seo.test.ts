/**
 * Run: npx tsx --test src/lib/site-seo.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  organizationJsonLd,
  SITE_DESCRIPTION,
  SITE_HOME_TITLE,
  SITE_KEYWORDS,
  SITE_TITLE_DEFAULT,
  websiteJsonLd,
} from "@/lib/site-seo";

test("site copy names DRBL and advanced stats", () => {
  for (const text of [SITE_DESCRIPTION, SITE_TITLE_DEFAULT, SITE_HOME_TITLE]) {
    assert.match(text, /DRBL/i);
    assert.match(text, /advanced stats/i);
  }
  assert.ok(SITE_KEYWORDS.includes("DRBL"));
  assert.ok(SITE_KEYWORDS.includes("NBA advanced stats"));
});

test("WebSite JSON-LD exposes SearchAction and brand aliases", () => {
  const data = websiteJsonLd();
  assert.equal(data["@type"], "WebSite");
  assert.equal(data.name, "DRBL");
  const aliases = data.alternateName as string[];
  assert.ok(aliases.includes("drbl.io"));
  const action = data.potentialAction as { target: { urlTemplate: string } };
  assert.match(action.target.urlTemplate, /\/ask\?q=\{search_term_string\}$/);
});

test("Organization JSON-LD points at the site logo", () => {
  const data = organizationJsonLd();
  assert.equal(data["@type"], "Organization");
  assert.equal(data["@id"], "https://drbl.io/#organization");
  assert.equal(data.logo, "https://drbl.io/icon");
});
