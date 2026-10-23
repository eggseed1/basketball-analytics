/**
 * Playwright route/flow smoke for post-opt regression audit.
 * Usage: AUDIT_BASE=... node scripts/audit-regression-browser.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, devices } from "playwright";

const BASE =
  process.env.AUDIT_BASE ||
  "https://basketball-analytics.drbl-analytics.workers.dev";
const OUT = path.join(process.cwd(), "reports/perf-cdn-html-regression-audit");
fs.mkdirSync(OUT, { recursive: true });

const ROUTES = [
  { id: "home", path: "/", expect: /DRBL|standings|score/i },
  { id: "scores", path: "/scores", expect: /score|game|upcoming/i },
  { id: "standings", path: "/standings", expect: /East|West|standings/i },
  { id: "explore", path: "/explore/players", expect: /Impact|player|PPG|board/i },
  { id: "hot-cold", path: "/explore/players/hot-cold", expect: /hot|cold|window|detective|scoring/i },
  { id: "viz", path: "/explore/players/visualizations", expect: /visual|race|scatter|chart/i },
  { id: "trade", path: "/explore/teams/trade", expect: /trade|salary|team/i },
  { id: "player", path: "/players/4065648", expect: /Tatum|percentile|career/i },
  { id: "player-season", path: "/players/4065648?season=2023-24", expect: /Tatum|2023|percentile|career/i },
  { id: "team", path: "/teams/2", expect: /team|roster|Boston|Celtics|overview/i },
  { id: "compare", path: "/compare", expect: /compare/i },
  { id: "ask", path: "/ask", expect: /ask|DRBL|question/i },
  { id: "learn", path: "/learn", expect: /learn|stat/i },
  { id: "sentiment", path: "/sentiment", expect: /sentiment|league|player/i },
  { id: "offseason", path: "/offseason", expect: /transaction|offseason|sign/i },
  { id: "movement", path: "/movement", expect: /movement|report|rumor/i },
  { id: "history", path: "/history", expect: /history|season|time/i },
  { id: "arcade", path: "/arcade", expect: /arcade|daily|game/i },
  { id: "gm", path: "/gm", expect: /gm|franchise|lab|roster/i },
  { id: "awards", path: "/awards", expect: /award/i },
  { id: "findings", path: "/findings", expect: /finding|insight/i },
  { id: "about", path: "/about", expect: /about|DRBL/i },
];

const results = [];

async function runRoute(browser, profile, route) {
  const context = await browser.newContext({
    viewport: profile.viewport,
    userAgent: profile.userAgent,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedReqs = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 240));
  });
  page.on("pageerror", (err) => pageErrors.push(String(err).slice(0, 240)));
  page.on("response", (res) => {
    if (res.status() >= 500 && res.url().includes(new URL(BASE).host)) {
      failedReqs.push(`${res.status()} ${res.url().slice(0, 160)}`);
    }
  });
  const t0 = Date.now();
  let status = null;
  try {
    const res = await page.goto(`${BASE}${route.path}`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    status = res?.status() ?? null;
    await page.waitForTimeout(2500);
    const body = await page.locator("body").innerText().catch(() => "");
    const title = await page.title();
    const htmlCache = await res?.headerValue("x-page-cache").catch(() => null);
    const expectOk = route.expect.test(body) || route.expect.test(title);
    const badConsole = consoleErrors.filter(
      (t) =>
        !/favicon|ResizeObserver|hydration|third-party|ChunkLoadError/i.test(t)
    );
    const ok =
      status === 200 &&
      expectOk &&
      pageErrors.length === 0 &&
      failedReqs.length === 0;
    results.push({
      id: `${profile.id}:${route.id}`,
      ok,
      status,
      ms: Date.now() - t0,
      htmlCache,
      expectOk,
      consoleErrors: badConsole.slice(0, 5),
      pageErrors: pageErrors.slice(0, 5),
      failedReqs: failedReqs.slice(0, 5),
      title: title.slice(0, 80),
    });
    console.log(
      `${ok ? "PASS" : "FAIL"} ${profile.id}:${route.id} status=${status} cache=${htmlCache}`
    );
  } catch (e) {
    results.push({
      id: `${profile.id}:${route.id}`,
      ok: false,
      detail: String(e?.message || e),
      ms: Date.now() - t0,
    });
    console.log(`FAIL ${profile.id}:${route.id} ${e?.message || e}`);
  }
  await context.close();
}

async function playerSeasonSwitch(browser) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/players/4065648`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForTimeout(3000);
  // Click a past season on the slider if present
  const seasonBtn = page
    .locator('button, [role="slider"], [data-season]')
    .filter({ hasText: /2023|2022|2021/ })
    .first();
  let switched = false;
  if (await seasonBtn.count()) {
    await seasonBtn.click().catch(() => null);
    await page.waitForTimeout(4000);
    switched = true;
  } else {
    await page.goto(`${BASE}/players/4065648?season=2023-24`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await page.waitForTimeout(4000);
    switched = true;
  }
  const body = await page.locator("body").innerText();
  const failedLoad = /Couldn't load .*percentiles/i.test(body);
  const hasRanks =
    /percentile|Impact|WAR|DARKO|BPM/i.test(body) && !failedLoad;
  results.push({
    id: "flow:player-season-switch",
    ok: switched && hasRanks && errors.length === 0,
    failedLoad,
    hasRanks,
    errors: errors.slice(0, 5),
  });
  console.log(
    `${switched && hasRanks && !errors.length ? "PASS" : "FAIL"} flow:player-season-switch failedLoad=${failedLoad}`
  );
  await context.close();
}

async function deferredHome(browser) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  const apiHits = [];
  page.on("response", (res) => {
    if (res.url().includes("/api/home/")) {
      apiHits.push({ url: res.url(), status: res.status() });
    }
  });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(5000);
  const okApis = apiHits.filter((h) => h.status === 200);
  results.push({
    id: "flow:home-deferred-apis",
    ok: okApis.length >= 1,
    apiHits: apiHits.slice(0, 12),
  });
  console.log(
    `${okApis.length >= 1 ? "PASS" : "FAIL"} flow:home-deferred-apis hits=${apiHits.length}`
  );
  await context.close();
}

const browser = await chromium.launch();
const desktop = {
  id: "desktop",
  viewport: { width: 1280, height: 800 },
};
const mobile = {
  id: "mobile",
  viewport: devices["iPhone 13"].viewport,
  userAgent: devices["iPhone 13"].userAgent,
};

for (const route of ROUTES) {
  await runRoute(browser, desktop, route);
}
// Sample mobile on critical paths
for (const route of ROUTES.filter((r) =>
  ["home", "explore", "player", "scores"].includes(r.id)
)) {
  await runRoute(browser, mobile, route);
}
await playerSeasonSwitch(browser);
await deferredHome(browser);
await browser.close();

const report = {
  base: BASE,
  measuredAt: new Date().toISOString(),
  pass: results.filter((r) => r.ok).length,
  fail: results.filter((r) => !r.ok).length,
  results,
};
fs.writeFileSync(path.join(OUT, "browser-probe.json"), JSON.stringify(report, null, 2));
console.log(`\n${report.pass} pass / ${report.fail} fail`);
process.exit(report.fail ? 1 : 0);
