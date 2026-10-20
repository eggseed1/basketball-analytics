/**
 * Durable verification for i18n + perf completion.
 * Writes evidence under reports/i18n-perf-completion/.
 *
 * Usage:
 *   PERF_BASE=http://localhost:3001 node scripts/verify-i18n-perf-completion.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, firefox, webkit, devices } from "playwright";
import { createRequire } from "node:module";
// Resolved via tsx when this script is run with `npx tsx`.
const { localeCacheKeySegment } = await import("../src/i18n/locale-cache-key.ts");
void createRequire;

const BASE = process.env.PERF_BASE || "http://localhost:3001";
const OUT = path.resolve("reports/i18n-perf-completion");
const LOCALES = ["en", "es", "fr", "de", "pt-BR", "ko", "ja", "zh-Hans", "zh-Hant"];
const TEMPLATES = [
  { id: "home", path: "/" },
  { id: "scores", path: "/scores" },
  { id: "standings", path: "/standings" },
  { id: "players", path: "/explore/players" },
  { id: "player-detail", path: "/players/1966" },
  { id: "team-detail", path: "/teams/13" },
  { id: "compare", path: "/compare" },
  { id: "learn", path: "/learn" },
  { id: "learn-topic", path: "/learn/pace" },
  { id: "findings", path: "/findings" },
  { id: "ask", path: "/ask" },
  { id: "arcade", path: "/arcade" },
  { id: "gm", path: "/gm" },
  { id: "games-explore", path: "/explore/games" },
];

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

async function fetchHtml(pathname, cookieLocale) {
  const headers = { Accept: "text/html" };
  if (cookieLocale) headers.Cookie = `DRBL_LOCALE=${cookieLocale}`;
  const res = await fetch(`${BASE}${pathname}`, { headers });
  const html = await res.text();
  return { status: res.status, html, bytes: Buffer.byteLength(html) };
}

function langOf(html) {
  const m = html.match(/\blang="([^"]+)"/);
  return m?.[1] ?? null;
}

async function localeSmoke() {
  const rows = [];
  for (const locale of LOCALES) {
    const { status, html, bytes } = await fetchHtml("/", locale);
    rows.push({
      locale,
      status,
      lang: langOf(html),
      htmlKb: Math.round((bytes / 1024) * 10) / 10,
      ok: status === 200 && langOf(html) === (locale === "pt-BR" ? "pt-BR" : locale),
    });
  }
  // Automatic via Accept-Language
  const res = await fetch(`${BASE}/`, {
    headers: { Accept: "text/html", "Accept-Language": "ja,en;q=0.5" },
  });
  const html = await res.text();
  rows.push({
    locale: "auto(ja)",
    status: res.status,
    lang: langOf(html),
    htmlKb: Math.round((Buffer.byteLength(html) / 1024) * 10) / 10,
    ok: res.status === 200 && langOf(html) === "ja",
  });
  // en-XA (may fall through in production)
  const xa = await fetchHtml("/", "en-XA");
  rows.push({
    locale: "en-XA",
    status: xa.status,
    lang: langOf(xa.html),
    hasPseudo: xa.html.includes("【"),
    htmlKb: Math.round((xa.bytes / 1024) * 10) / 10,
    ok: xa.status === 200,
  });
  fs.writeFileSync(path.join(OUT, "locale-smoke.json"), JSON.stringify(rows, null, 2));
  return rows;
}

function cacheKeyEvidence() {
  const cases = [
    {
      name: "cookie-de-beats-accept-fr",
      a: localeCacheKeySegment(
        new Request("https://ex/", {
          headers: { cookie: "DRBL_LOCALE=de", "accept-language": "fr" },
        })
      ),
      expect: "de",
    },
    {
      name: "accept-ja",
      a: localeCacheKeySegment(
        new Request("https://ex/", { headers: { "accept-language": "ja,en;q=0.8" } })
      ),
      expect: "ja",
    },
    {
      name: "force-en",
      a: localeCacheKeySegment(
        new Request("https://ex/", {
          headers: { cookie: "DRBL_LOCALE=de", "accept-language": "fr" },
        }),
        { forceLocale: "en" }
      ),
      expect: "en",
    },
    {
      name: "en-XA-isolated",
      a: localeCacheKeySegment(
        new Request("https://ex/", { headers: { cookie: "DRBL_LOCALE=en-XA" } })
      ),
      expect: "en-XA",
    },
    {
      name: "auto-zh-Hant",
      a: localeCacheKeySegment(
        new Request("https://ex/", { headers: { "accept-language": "zh-TW" } })
      ),
      expect: "zh-Hant",
    },
  ];
  const results = cases.map((c) => ({
    ...c,
    ok: c.a === c.expect,
    note: "Unit isolation of localeCacheKeySegment; Worker PAGE_CACHE keys use page:{version}:{locale}:{path}",
  }));
  // Order independence: same URL different cookies → different keys
  const kDe = `page:v1:${localeCacheKeySegment(new Request("https://ex/standings", { headers: { cookie: "DRBL_LOCALE=de" } }))}:/standings`;
  const kFr = `page:v1:${localeCacheKeySegment(new Request("https://ex/standings", { headers: { cookie: "DRBL_LOCALE=fr" } }))}:/standings`;
  results.push({
    name: "de-fr-distinct-keys",
    a: kDe,
    b: kFr,
    ok: kDe !== kFr,
    expect: "distinct",
  });
  fs.writeFileSync(path.join(OUT, "cache", "locale-key-unit.json"), JSON.stringify(results, null, 2));
  return results;
}

async function htmlSizes() {
  const routes = TEMPLATES.map((t) => t.path);
  const out = [];
  for (const pathname of routes) {
    const samples = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      const { status, bytes } = await fetchHtml(pathname, "en");
      samples.push({ ms: performance.now() - t0, bytes, status });
    }
    const sorted = [...samples].sort((a, b) => a.ms - b.ms);
    out.push({
      path: pathname,
      status: samples[0].status,
      medianMs: Math.round(sorted[1].ms),
      rangeMs: [Math.round(sorted[0].ms), Math.round(sorted[2].ms)],
      htmlKb: Math.round((sorted[1].bytes / 1024) * 10) / 10,
    });
  }
  fs.writeFileSync(path.join(OUT, "perf", "html-sizes.json"), JSON.stringify(out, null, 2));
  return out;
}

async function screenshots() {
  const engines = [
    { name: "chromium", launcher: chromium },
    { name: "firefox", launcher: firefox },
    { name: "webkit", launcher: webkit },
  ];
  const profiles = [
    { id: "desktop", viewport: { width: 1280, height: 800 } },
    { id: "tablet", ...devices["iPad Mini"] },
    { id: "phone", ...devices["iPhone 13"] },
  ];
  const results = [];
  for (const engine of engines) {
    let browser;
    try {
      browser = await engine.launcher.launch();
    } catch (err) {
      results.push({ engine: engine.name, error: String(err) });
      continue;
    }
    for (const profile of profiles) {
      const contextOpts = {
        viewport: profile.viewport,
        userAgent: profile.userAgent,
        locale: "en-US",
      };
      const context = await browser.newContext(contextOpts);
      await context.addCookies([
        { name: "DRBL_LOCALE", value: "en", url: BASE },
      ]);
      const page = await context.newPage();
      for (const route of TEMPLATES) {
        const dir = path.join(OUT, "screenshots", "devices", engine.name, profile.id);
        ensureDir(dir);
        const file = path.join(dir, `${route.id}.png`);
        try {
          const res = await page.goto(`${BASE}${route.path}`, {
            waitUntil: "domcontentloaded",
            timeout: 90_000,
          });
          await page.waitForTimeout(1200);
          await page.screenshot({ path: file, fullPage: false });
          results.push({
            engine: engine.name,
            profile: profile.id,
            route: route.id,
            status: res?.status() ?? null,
            file: path.relative(process.cwd(), file),
            ok: (res?.status() ?? 0) < 400,
            note: "Emulated viewport — not a physical device",
          });
        } catch (err) {
          results.push({
            engine: engine.name,
            profile: profile.id,
            route: route.id,
            ok: false,
            error: String(err),
          });
        }
      }
      await context.close();
    }
    // Locale stress on Chromium desktop only
    if (engine.name === "chromium") {
      for (const locale of ["de", "ko", "ja", "zh-Hans", "en-XA"]) {
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        await context.addCookies([{ name: "DRBL_LOCALE", value: locale, url: BASE }]);
        const page = await context.newPage();
        for (const route of [
          { id: "home", path: "/" },
          { id: "standings", path: "/standings" },
          { id: "players", path: "/explore/players" },
          { id: "learn-topic", path: "/learn/pace" },
        ]) {
          const dir = path.join(OUT, "screenshots", "locales", locale);
          ensureDir(dir);
          const file = path.join(dir, `${route.id}.png`);
          try {
            await page.goto(`${BASE}${route.path}`, {
              waitUntil: "domcontentloaded",
              timeout: 90_000,
            });
            await page.waitForTimeout(1000);
            await page.screenshot({ path: file, fullPage: false });
            const html = await page.content();
            results.push({
              kind: "locale",
              locale,
              route: route.id,
              file: path.relative(process.cwd(), file),
              lang: langOf(html),
              ok: true,
            });
          } catch (err) {
            results.push({ kind: "locale", locale, route: route.id, ok: false, error: String(err) });
          }
        }
        await context.close();
      }
    }
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, "screenshots", "index.json"), JSON.stringify(results, null, 2));
  return results;
}

async function dualContextIsolation() {
  // Separate browser contexts, same URL, different locales — HTML lang must differ.
  const browser = await chromium.launch();
  const out = [];
  for (const order of [
    ["de", "fr"],
    ["fr", "de"],
    ["ja", "en"],
    ["en", "ja"],
  ]) {
    const [a, b] = order;
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    await ctxA.addCookies([{ name: "DRBL_LOCALE", value: a, url: BASE }]);
    await ctxB.addCookies([{ name: "DRBL_LOCALE", value: b, url: BASE }]);
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    await pageA.goto(`${BASE}/standings`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await pageB.goto(`${BASE}/standings`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    // refresh both
    await pageA.reload({ waitUntil: "domcontentloaded" });
    await pageB.reload({ waitUntil: "domcontentloaded" });
    const langA = langOf(await pageA.content());
    const langB = langOf(await pageB.content());
    out.push({
      order: `${a} then ${b}`,
      langA,
      langB,
      ok: langA === a && langB === b && langA !== langB,
      layer: "next-start-local (not Cloudflare edge HIT/MISS)",
    });
    await ctxA.close();
    await ctxB.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, "cache", "dual-context.json"), JSON.stringify(out, null, 2));
  return out;
}

ensureDir(path.join(OUT, "cache"));
ensureDir(path.join(OUT, "perf"));
ensureDir(path.join(OUT, "screenshots"));
ensureDir(path.join(OUT, "logs"));

const summary = {
  base: BASE,
  startedAt: new Date().toISOString(),
  cacheKeys: cacheKeyEvidence(),
  localeSmoke: await localeSmoke(),
  htmlSizes: await htmlSizes(),
  dualContext: await dualContextIsolation(),
  screenshots: await screenshots(),
  finishedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
console.log(
  JSON.stringify(
    {
      localeOk: summary.localeSmoke.every((r) => r.ok),
      cacheOk: summary.cacheKeys.every((r) => r.ok),
      dualOk: summary.dualContext.every((r) => r.ok),
      shotOk: summary.screenshots.filter((r) => r.ok !== false).length,
      shotFail: summary.screenshots.filter((r) => r.ok === false).length,
      out: OUT,
    },
    null,
    2
  )
);
