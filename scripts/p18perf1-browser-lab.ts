/**
 * P18PERF.1 browser lab — Playwright against production next start.
 * page.evaluate bodies are strings to avoid tsx/esbuild __name injection.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page, type Browser } from "playwright";

const BASE = process.env.PERF_BASE_URL ?? "http://127.0.0.1:3000";
const OUT = path.join(process.cwd(), "reports", "p18perf1");
mkdirSync(OUT, { recursive: true });

const ROUTES = [
  { key: "home", path: "/" },
  { key: "players_current", path: "/explore/players" },
  { key: "players_2005_06", path: "/explore/players?season=2005-06" },
  { key: "player_knueppel", path: "/players/1642851" },
  { key: "player_dirk", path: "/players/1717" },
  { key: "history_home", path: "/history" },
  { key: "history_2005_06", path: "/history/2005-06" },
  {
    key: "game_historical",
    path: "/games/0020500001?from=history&season=2005-06",
  },
];

type Profile = "desktop" | "mobile";

const VITALS_SCRIPT = `(async () => {
  await new Promise((r) => setTimeout(r, 2000));
  const navEntries = performance.getEntriesByType("navigation");
  const nav = navEntries[0];
  let lcpValue = null;
  let lcpElement = null;
  let cls = 0;
  const paint = performance.getEntriesByType("paint");
  const fcpEntry = paint.find((p) => p.name === "first-contentful-paint");
  const fcp = fcpEntry ? fcpEntry.startTime : null;

  await new Promise((resolve) => {
    let left = 2;
    const done = () => {
      left -= 1;
      if (left <= 0) resolve();
    };
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) {
          lcpValue = last.startTime;
          lcpElement = last.element ? last.element.tagName : last.name;
        }
        done();
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch (e) {
      done();
    }
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (!e.hadRecentInput) cls += e.value || 0;
        }
        done();
      }).observe({ type: "layout-shift", buffered: true });
    } catch (e) {
      done();
    }
    setTimeout(resolve, 600);
  });

  const bag = window.__DRBL_WEB_VITALS__ || [];
  const fromReporter = {};
  for (const m of bag) fromReporter[m.name] = m.value;

  return {
    ttfb: nav ? nav.responseStart : null,
    fcp: fromReporter.FCP != null ? fromReporter.FCP : fcp,
    lcp: fromReporter.LCP != null ? fromReporter.LCP : lcpValue,
    lcpElement: lcpElement,
    cls: fromReporter.CLS != null ? fromReporter.CLS : cls,
    inp: fromReporter.INP != null ? fromReporter.INP : null,
    domNodes: document.getElementsByTagName("*").length,
    links: document.querySelectorAll("a").length,
    gameRows: document.querySelectorAll('a[href*="/games/"]').length,
    htmlBytesApprox: document.documentElement.outerHTML.length,
  };
})()`;

async function measure(page: Page, routePath: string) {
  const imageUrls: string[] = [];
  const onReq = (req: { resourceType: () => string; url: () => string }) => {
    if (req.resourceType() === "image") imageUrls.push(req.url());
  };
  page.on("request", onReq);

  const t0 = Date.now();
  const res = await page.goto(`${BASE}${routePath}`, {
    waitUntil: "networkidle",
    timeout: 120_000,
  });
  const navMs = Date.now() - t0;

  const vitals = (await page.evaluate(VITALS_SCRIPT)) as Record<
    string,
    unknown
  >;

  let interactionProxyMs: number | null = null;
  try {
    const next = page.getByRole("link", { name: /^Next$/i }).first();
    if (await next.isVisible({ timeout: 800 }).catch(() => false)) {
      const i0 = Date.now();
      await next.click();
      await page.waitForLoadState("networkidle");
      interactionProxyMs = Date.now() - i0;
    }
  } catch {
    interactionProxyMs = null;
  }

  page.off("request", onReq);

  return {
    status: res?.status() ?? 0,
    navMs,
    imageRequestCount: imageUrls.length,
    nbaEspnImageRequests: imageUrls.filter(
      (u) => u.includes("cdn.nba.com") || u.includes("espncdn.com")
    ).length,
    interactionProxyMs,
    ...vitals,
  };
}

async function runProfile(browser: Browser, profile: Profile) {
  const context = await browser.newContext(
    profile === "mobile"
      ? {
          viewport: { width: 390, height: 844 },
          isMobile: true,
          hasTouch: true,
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        }
      : { viewport: { width: 1280, height: 800 } }
  );
  const page = await context.newPage();
  const rows: Array<Record<string, unknown>> = [];
  for (const route of ROUTES) {
    const samples = [];
    for (let run = 1; run <= 2; run++) {
      const m = await measure(page, route.path);
      samples.push({ run, ...m });
      console.log(
        `[${profile}] ${route.key} run${run} LCP=${m.lcp} CLS=${m.cls} DOM=${m.domNodes} imgs=${m.imageRequestCount}`
      );
    }
    const med = (key: string) => {
      const vals = samples
        .map((s) => Number((s as Record<string, unknown>)[key]))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);
      if (!vals.length) return null;
      return vals[Math.floor(vals.length / 2)];
    };
    rows.push({
      route: route.key,
      path: route.path,
      profile,
      LCP_median: med("lcp"),
      CLS_median: med("cls"),
      FCP_median: med("fcp"),
      TTFB_median: med("ttfb"),
      DOM_median: med("domNodes"),
      links_median: med("links"),
      gameRows_median: med("gameRows"),
      images_median: med("imageRequestCount"),
      interactionProxy_median: med("interactionProxyMs"),
      INP: samples.map((s) => s.inp).find((v) => v != null) ?? null,
      samples,
    });
  }
  await context.close();
  return rows;
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  const cols = [
    "route",
    "path",
    "profile",
    "LCP_median",
    "CLS_median",
    "FCP_median",
    "TTFB_median",
    "DOM_median",
    "links_median",
    "gameRows_median",
    "images_median",
    "interactionProxy_median",
    "INP",
  ];
  return [
    cols.join(","),
    ...rows.map((r) => cols.map((c) => String(r[c] ?? "")).join(",")),
  ].join("\n");
}

async function main() {
  const health = await fetch(`${BASE}/`).catch(() => null);
  if (!health) {
    console.error("Server not up at", BASE);
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const desktop = await runProfile(browser, "desktop");
  const mobile = await runProfile(browser, "mobile");
  await browser.close();

  writeFileSync(path.join(OUT, "12_desktop_lab.csv"), toCsv(desktop) + "\n");
  writeFileSync(path.join(OUT, "13_mobile_lab.csv"), toCsv(mobile) + "\n");

  writeFileSync(
    path.join(OUT, "14_lcp_attribution.csv"),
    [
      "route,profile,LCP_ms,note",
      ...[...desktop, ...mobile].map(
        (r) => `${r.route},${r.profile},${r.LCP_median},web_vitals_or_PO`
      ),
    ].join("\n") + "\n"
  );

  writeFileSync(
    path.join(OUT, "15_cls_audit.csv"),
    [
      "route,profile,CLS_median",
      ...[...desktop, ...mobile].map(
        (r) => `${r.route},${r.profile},${r.CLS_median}`
      ),
    ].join("\n") + "\n"
  );

  writeFileSync(
    path.join(OUT, "16_interaction_latency.csv"),
    [
      "route,profile,interactionProxyMs_median,INP",
      ...[...desktop, ...mobile].map(
        (r) =>
          `${r.route},${r.profile},${r.interactionProxy_median},${r.INP ?? "INP_LAB_UNAVAILABLE"}`
      ),
    ].join("\n") + "\n"
  );

  writeFileSync(
    path.join(OUT, "17_image_request_audit.csv"),
    [
      "route,profile,imageRequests_median",
      ...[...desktop, ...mobile]
        .filter((r) => String(r.route).startsWith("players"))
        .map((r) => `${r.route},${r.profile},${r.images_median}`),
    ].join("\n") + "\n"
  );

  writeFileSync(
    path.join(OUT, "lab_raw.json"),
    JSON.stringify({ base: BASE, desktop, mobile }, null, 2)
  );

  console.log(
    "Lab complete",
    createHash("sha256")
      .update(JSON.stringify({ desktop, mobile }))
      .digest("hex")
      .slice(0, 16)
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
