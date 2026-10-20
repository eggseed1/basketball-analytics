/**
 * Lab performance measurements for representative routes.
 * Usage:
 *   PERF_BASE=http://localhost:3001 node scripts/perf-lab-measure.mjs --out /tmp/tm/perf/baseline
 *
 * Reports median of 3 cold navigations per route (Chromium). Labels lab metrics
 * honestly — TBT is not INP; Lighthouse-style scores are not field CWV.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, devices } from "playwright";

const BASE = process.env.PERF_BASE || "http://localhost:3000";
const OUT = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : "/tmp/tm/perf/baseline";
const RUNS = Number(process.env.PERF_RUNS || 3);

const ROUTES = [
  { id: "home", path: "/" },
  { id: "scores", path: "/scores" },
  { id: "standings", path: "/standings" },
  { id: "players", path: "/explore/players" },
  { id: "ask", path: "/ask" },
  { id: "arcade", path: "/arcade" },
  { id: "compare", path: "/compare" },
  { id: "learn", path: "/learn" },
  { id: "player-detail", path: "/players/1966" },
  { id: "team-detail", path: "/teams/13" },
  { id: "sentiment", path: "/sentiment" },
  { id: "gm", path: "/gm" },
];

const PROFILES = [
  {
    id: "desktop",
    viewport: { width: 1280, height: 800 },
    cpu: 1,
    network: null,
  },
  {
    id: "mobile-slow4g",
    viewport: devices["iPhone 13"].viewport,
    userAgent: devices["iPhone 13"].userAgent,
    cpu: 4,
    network: {
      offline: false,
      downloadThroughput: ((1.6 * 1024 * 1024) / 8) * 0.8,
      uploadThroughput: ((750 * 1024) / 8) * 0.8,
      latency: 150,
    },
  },
];

function median(nums) {
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function range(nums) {
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

async function measureOnce(browser, profile, route) {
  const context = await browser.newContext({
    viewport: profile.viewport,
    userAgent: profile.userAgent,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  if (profile.network) {
    await cdp.send("Network.emulateNetworkConditions", profile.network);
  }
  if (profile.cpu > 1) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });
  }

  const transfer = { js: 0, css: 0, img: 0, font: 0, other: 0, requests: 0 };
  const longTasks = [];
  page.on("response", async (res) => {
    try {
      const req = res.request();
      if (req.resourceType() === "document" && req.frame() === page.mainFrame()) return;
      const headers = res.headers();
      const len = Number(headers["content-length"] || 0);
      const type = req.resourceType();
      transfer.requests += 1;
      if (type === "script") transfer.js += len;
      else if (type === "stylesheet") transfer.css += len;
      else if (type === "image") transfer.img += len;
      else if (type === "font") transfer.font += len;
      else transfer.other += len;
    } catch {
      /* ignore */
    }
  });

  await page.addInitScript(() => {
    window.__perfLongTasks = [];
    try {
      const po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          window.__perfLongTasks.push({ name: e.name, duration: e.duration, start: e.startTime });
        }
      });
      po.observe({ type: "longtask", buffered: true });
    } catch {
      /* Safari-ish */
    }
  });

  const t0 = Date.now();
  const response = await page.goto(`${BASE}${route.path}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  const ttfb = response ? (await response.timing())?.responseStart : null;

  // Wait until main content exists and boot overlay is gone (or timeout).
  await page.waitForSelector("#main-content", { timeout: 60000 }).catch(() => null);
  await page
    .waitForFunction(
      () => {
        const boot = document.getElementById("app-boot");
        if (!boot) return true;
        const style = getComputedStyle(boot);
        return style.display === "none" || style.opacity === "0" || boot.getAttribute("aria-hidden") === "true" && style.pointerEvents === "none";
      },
      { timeout: 30000 }
    )
    .catch(() => null);

  // Give LCP a moment to settle.
  await page.waitForTimeout(2000);

  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const paints = performance.getEntriesByType("paint");
    const fcp = paints.find((p) => p.name === "first-contentful-paint")?.startTime ?? null;
    let lcp = null;
    try {
      const lcpEntries = performance.getEntriesByType("largest-contentful-paint");
      if (lcpEntries.length) lcp = lcpEntries[lcpEntries.length - 1].startTime;
    } catch {
      /* */
    }
    let cls = 0;
    try {
      for (const e of performance.getEntriesByType("layout-shift")) {
        if (!e.hadRecentInput) cls += e.value;
      }
    } catch {
      /* */
    }
    const long = window.__perfLongTasks || [];
    const tbtProxy = long
      .filter((t) => t.duration > 50)
      .reduce((sum, t) => sum + (t.duration - 50), 0);
    const main = document.getElementById("main-content");
    const mainReady = !!(main && main.getBoundingClientRect().height > 40);
    return {
      fcp,
      lcp,
      cls,
      tbtProxy,
      longTaskCount: long.length,
      domContentLoaded: nav?.domContentLoadedEventEnd ?? null,
      loadEvent: nav?.loadEventEnd ?? null,
      transferSize: nav?.transferSize ?? null,
      encodedBodySize: nav?.encodedBodySize ?? null,
      mainReady,
      title: document.title,
    };
  });

  const shotDir = path.join(OUT, "screenshots", profile.id);
  fs.mkdirSync(shotDir, { recursive: true });
  await page.screenshot({
    path: path.join(shotDir, `${route.id}.png`),
    fullPage: false,
  });

  const wall = Date.now() - t0;
  await context.close();
  return {
    route: route.id,
    path: route.path,
    profile: profile.id,
    status: response?.status() ?? 0,
    wallMs: wall,
    ttfbMs: ttfb,
    transfer,
    ...metrics,
  };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const profile of PROFILES) {
    for (const route of ROUTES) {
      const runs = [];
      for (let i = 0; i < RUNS; i++) {
        process.stderr.write(`measure ${profile.id} ${route.id} run ${i + 1}/${RUNS}\n`);
        try {
          runs.push(await measureOnce(browser, profile, route));
        } catch (err) {
          runs.push({
            route: route.id,
            path: route.path,
            profile: profile.id,
            error: String(err?.message || err),
          });
        }
      }
      const ok = runs.filter((r) => !r.error && typeof r.fcp === "number");
      if (!ok.length) {
        results.push({ route: route.id, profile: profile.id, error: runs[0]?.error || "no ok runs", runs });
        continue;
      }
      const pick = (key) => ok.map((r) => r[key]).filter((v) => typeof v === "number");
      results.push({
        route: route.id,
        path: route.path,
        profile: profile.id,
        n: ok.length,
        median: {
          fcp: median(pick("fcp")),
          lcp: median(pick("lcp")),
          cls: median(pick("cls")),
          tbtProxy: median(pick("tbtProxy")),
          wallMs: median(pick("wallMs")),
          domContentLoaded: median(pick("domContentLoaded")),
          jsBytes: median(ok.map((r) => r.transfer?.js || 0)),
          cssBytes: median(ok.map((r) => r.transfer?.css || 0)),
          imgBytes: median(ok.map((r) => r.transfer?.img || 0)),
        },
        range: {
          fcp: range(pick("fcp")),
          lcp: range(pick("lcp")),
          wallMs: range(pick("wallMs")),
        },
        runs,
      });
    }
  }

  await browser.close();
  const outFile = path.join(OUT, "metrics.json");
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        base: BASE,
        runsPerRoute: RUNS,
        note: "Lab Chromium metrics. TBT proxy from Long Tasks ≠ INP. Not field CWV.",
        results,
      },
      null,
      2
    )
  );
  console.log(outFile);
  // Compact table
  for (const r of results) {
    if (r.error) {
      console.log(`${r.profile}\t${r.route}\tERROR\t${r.error}`);
      continue;
    }
    const m = r.median;
    console.log(
      `${r.profile}\t${r.route}\tFCP=${m.fcp?.toFixed?.(0)}\tLCP=${m.lcp?.toFixed?.(0)}\tCLS=${m.cls?.toFixed?.(3)}\tTBT~=${m.tbtProxy?.toFixed?.(0)}\tJS=${Math.round((m.jsBytes || 0) / 1024)}k\twall=${m.wallMs?.toFixed?.(0)}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
