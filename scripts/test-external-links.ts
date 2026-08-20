/**
 * External link navigation correctness.
 * Run: npx tsx scripts/test-external-links.ts
 *
 * Proves external destinations use exactly one path: browser <a>, never Next router.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { appLinkUsesNextRouter } from "../src/components/ui/app-link";
import {
  assertInternalHref,
  isExternalHref,
  isModifiedClickEvent,
  linkNavigationKind,
} from "../src/lib/navigation";

const EXTERNAL_SAMPLES = [
  "https://www.espn.com/nba/story/_/id/123",
  "https://www.nba.com/watch/league-pass",
  "http://www.nba.com/game",
  "//cdn.example.com/x",
  "mailto:press@example.com",
  "https://www.bball-index.com/article",
  "https://cleaningtheglass.com/stats",
];

const INTERNAL_SAMPLES = [
  "/",
  "/scores",
  "/ask?q=lebron",
  "/learn/true-shooting",
  "/offseason?event=abc",
  "/teams/2#evidence",
];

console.log("linkNavigationKind / AppLink path selection…");

for (const href of EXTERNAL_SAMPLES) {
  assert.equal(isExternalHref(href), true, href);
  assert.equal(linkNavigationKind(href), "external", href);
  assert.equal(
    appLinkUsesNextRouter(href),
    false,
    `${href} must not use Next.js router`
  );
}

for (const href of INTERNAL_SAMPLES) {
  assert.equal(isExternalHref(href), false, href);
  assert.equal(linkNavigationKind(href), "internal", href);
  assert.equal(appLinkUsesNextRouter(href), true, href);
}

assert.equal(linkNavigationKind("#evidence"), "hash");
assert.equal(appLinkUsesNextRouter("#evidence"), false);

// Watch / broadcast destinations.
assert.equal(
  linkNavigationKind("https://www.nba.com/watch/league-pass"),
  "external"
);
assert.equal(
  appLinkUsesNextRouter("https://www.nba.com/watch/league-pass"),
  false
);

console.log("assertInternalHref refuses external URLs…");
assert.throws(
  () => assertInternalHref("https://www.espn.com/nba/"),
  /refused external href/
);
assert.equal(assertInternalHref("/explore/players"), "/explore/players");

console.log("modifier-click detection (no synthetic in-app nav)…");
assert.equal(isModifiedClickEvent({ metaKey: true, button: 0 }), true);
assert.equal(isModifiedClickEvent({ ctrlKey: true, button: 0 }), true);
assert.equal(isModifiedClickEvent({ button: 1 }), true); // middle
assert.equal(isModifiedClickEvent({ button: 0 }), false);

/**
 * Single navigation path contract for AppLink external branch:
 * - kind === external ⇒ browser anchor only
 * - no second router.push
 * Simulated by counting which handlers would run for a primary click.
 */
function simulateAppLinkPrimaryClick(href: string): {
  browserNav: boolean;
  nextRouterNav: boolean;
} {
  const kind = linkNavigationKind(href);
  if (kind === "external" || kind === "hash") {
    return { browserNav: true, nextRouterNav: false };
  }
  return { browserNav: false, nextRouterNav: true };
}

const espnClick = simulateAppLinkPrimaryClick(
  "https://www.espn.com/nba/team/_/name/bos"
);
assert.deepEqual(espnClick, { browserNav: true, nextRouterNav: false });

const nbaWatchClick = simulateAppLinkPrimaryClick(
  "https://www.nba.com/watch/league-pass"
);
assert.deepEqual(nbaWatchClick, { browserNav: true, nextRouterNav: false });

const internalClick = simulateAppLinkPrimaryClick("/scores");
assert.deepEqual(internalClick, { browserNav: false, nextRouterNav: true });

// Double-navigation guard: never both paths.
for (const href of [...EXTERNAL_SAMPLES, ...INTERNAL_SAMPLES, "#x"]) {
  const paths = simulateAppLinkPrimaryClick(href);
  const active = Number(paths.browserNav) + Number(paths.nextRouterNav);
  assert.equal(active, 1, `${href} must trigger exactly one navigation path`);
}

console.log("static scan: next/link must not hardcode external hrefs…");
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts|jsx|js)$/.test(name)) out.push(p);
  }
  return out;
}

const root = join(process.cwd(), "src");
const bad: string[] = [];
for (const file of walk(root)) {
  const src = readFileSync(file, "utf8");
  if (!src.includes('from "next/link"') && !src.includes("from 'next/link'")) {
    continue;
  }
  // Flag next/link usage with a literal external URL as href.
  const re =
    /<Link[\s\S]{0,200}?href=\{?\s*(["'`])(https?:|\/\/)/g;
  if (re.test(src)) {
    bad.push(file.replace(process.cwd() + "/", ""));
  }
}
assert.deepEqual(
  bad,
  [],
  `next/link must not take external hrefs:\n${bad.join("\n")}`
);

console.log("OK - external links use a single browser navigation path.");
