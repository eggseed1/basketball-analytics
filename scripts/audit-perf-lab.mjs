/**
 * Comparable FCP/LCP lab (3 runs) with buffered LCP observer + cache header.
 *   PERF_BASE=... node scripts/audit-perf-lab.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE =
  process.env.PERF_BASE ||
  "https://basketball-analytics.drbl-analytics.workers.dev";
const OUT = path.join(
  process.cwd(),
  "reports/perf-cdn-html-regression-audit/perf-lab-buffered"
);
fs.mkdirSync(OUT, { recursive: true });

const ROUTES = [
  { id: "home", path: "/" },
  { id: "explore", path: "/explore/players" },
  { id: "standings", path: "/standings" },
  { id: "player", path: "/players/4065648" },
];
const RUNS = 3;

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function once(browser, route) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__drblLcp = null;
    try {
      const po = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length) window.__drblLcp = entries[entries.length - 1];
      });
      po.observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      /* ignore */
    }
  });
  const t0 = Date.now();
  const res = await page.goto(BASE + route.path, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  const cache = await res?.headerValue("x-page-cache").catch(() => null);
  // Wait for deferred panels / LCP settle (not networkidle — live polling)
  await page.waitForTimeout(4000);
  // Deferred home APIs if any
  await page
    .waitForFunction(
      () => {
        const t = document.body?.innerText || "";
        return t.length > 400;
      },
      { timeout: 10000 }
    )
    .catch(() => null);
  await page.waitForTimeout(1500);
  const metrics = await page.evaluate(() => {
    const paints = performance.getEntriesByType("paint");
    const fcp =
      paints.find((p) => p.name === "first-contentful-paint")?.startTime ?? null;
    const lcpEntry = window.__drblLcp;
    let lcp = lcpEntry?.startTime ?? null;
    let lcpTag = lcpEntry?.element?.tagName ?? null;
    let lcpText = (lcpEntry?.element?.textContent || "").trim().slice(0, 100);
    let lcpUrl = lcpEntry?.url || null;
    if (lcp == null) {
      const legacy = performance.getEntriesByType("largest-contentful-paint");
      const last = legacy[legacy.length - 1];
      lcp = last?.startTime ?? null;
      lcpTag = last?.element?.tagName ?? null;
      lcpText = (last?.element?.textContent || "").trim().slice(0, 100);
      lcpUrl = last?.url || null;
    }
    return { fcp, lcp, lcpTag, lcpText, lcpUrl };
  });
  await context.close();
  return {
    ...metrics,
    wall: Date.now() - t0,
    status: res?.status() ?? null,
    cache,
  };
}

const browser = await chromium.launch();
const results = [];
for (const route of ROUTES) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    process.stderr.write(`${route.id} ${i + 1}\n`);
    runs.push(await once(browser, route));
  }
  const fcp = runs.map((r) => r.fcp).filter((v) => typeof v === "number");
  const lcp = runs.map((r) => r.lcp).filter((v) => typeof v === "number");
  results.push({
    route: route.id,
    path: route.path,
    environment: "workers.dev",
    browser: "Chromium desktop 1280x800, no CPU/network throttle",
    note: "Warm-ish navigations (no browser cache clear between runs). Worker EDGE/HIT may apply. Not field CWV. Not OpenNext preview.",
    runs,
    median: {
      fcp: fcp.length ? median(fcp) : null,
      lcp: lcp.length ? median(lcp) : null,
      wall: median(runs.map((r) => r.wall)),
    },
  });
}
await browser.close();

const report = {
  measuredAt: new Date().toISOString(),
  base: BASE,
  results,
};
fs.writeFileSync(path.join(OUT, "metrics.json"), JSON.stringify(report, null, 2));
for (const r of results) {
  console.log(
    `${r.route}\tFCP_med=${r.median.fcp?.toFixed?.(0)}\tLCP_med=${r.median.lcp?.toFixed?.(0)}\twall_med=${r.median.wall?.toFixed?.(0)}\truns_fcp=${r.runs.map((x) => x.fcp?.toFixed?.(0)).join(",")}\truns_lcp=${r.runs.map((x) => x.lcp?.toFixed?.(0)).join(",")}\tcache=${r.runs.map((x) => x.cache).join(",")}\tlcpEl=${r.runs.map((x) => x.lcpTag || "-").join("/")}`
  );
}
