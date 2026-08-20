/**
 * P18C browser lab — Playwright against production next start.
 * PERF_BASE_URL=http://127.0.0.1:3000 npx tsx scripts/p18c-browser-lab.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";

const BASE = process.env.PERF_BASE_URL ?? "http://127.0.0.1:3000";
const OUT = path.join(process.cwd(), "reports", "p18c");
mkdirSync(OUT, { recursive: true });

const ROUTES = [
  { key: "team_historical", path: "/teams/25?season=2005-06&from=history" },
  { key: "team_current", path: "/teams/13" },
  { key: "matchup", path: "/teams/13/vs/24" },
  { key: "franchise", path: "/franchises/okc" },
];

const VITALS_SCRIPT = `(async () => {
  await new Promise((r) => setTimeout(r, 2000));
  const navEntries = performance.getEntriesByType("navigation");
  const nav = navEntries[0];
  let lcpValue = null;
  let cls = 0;
  await new Promise((resolve) => {
    let left = 2;
    const done = () => { left -= 1; if (left <= 0) resolve(); };
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) lcpValue = last.startTime;
        done();
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch (e) { done(); }
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (!e.hadRecentInput) cls += e.value || 0;
        }
        done();
      }).observe({ type: "layout-shift", buffered: true });
    } catch (e) { done(); }
    setTimeout(resolve, 600);
  });
  const bag = window.__DRBL_WEB_VITALS__ || [];
  const fromReporter = {};
  for (const m of bag) fromReporter[m.name] = m.value;
  return {
    ttfb: nav ? nav.responseStart : null,
    lcp: fromReporter.LCP != null ? fromReporter.LCP : lcpValue,
    cls: fromReporter.CLS != null ? fromReporter.CLS : cls,
    domNodes: document.getElementsByTagName("*").length,
    links: document.querySelectorAll("a").length,
    gameRows: document.querySelectorAll('a[href*="/games/"]').length,
    htmlBytesApprox: document.documentElement.outerHTML.length,
  };
})()`;

async function measure(page: Page, routePath: string) {
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
    const next = page.getByRole("link", { name: /Next/i }).first();
    if (await next.isVisible({ timeout: 800 }).catch(() => false)) {
      const i0 = Date.now();
      await next.click();
      await page.waitForLoadState("networkidle");
      interactionProxyMs = Date.now() - i0;
    }
  } catch {
    interactionProxyMs = null;
  }
  return {
    status: res?.status() ?? 0,
    navMs,
    interactionProxyMs,
    ...vitals,
  };
}

async function runProfile(profile: "desktop" | "mobile") {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(
    profile === "mobile"
      ? {
          viewport: { width: 390, height: 844 },
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
          isMobile: true,
          hasTouch: true,
        }
      : { viewport: { width: 1440, height: 900 } }
  );
  const page = await context.newPage();
  const out: Record<string, unknown> = {};
  for (const r of ROUTES) {
    out[r.key] = await measure(page, r.path);
  }
  await browser.close();
  return out;
}

async function main() {
  const desktop = await runProfile("desktop");
  const mobile = await runProfile("mobile");
  writeFileSync(
    path.join(OUT, "_browser_lab.json"),
    JSON.stringify({ base: BASE, desktop, mobile }, null, 2)
  );
  writeFileSync(
    path.join(OUT, "23_mobile_qa.md"),
    `# Mobile QA\n\n\`\`\`json\n${JSON.stringify(mobile, null, 2)}\n\`\`\`\n`
  );
  writeFileSync(
    path.join(OUT, "24_desktop_qa.md"),
    `# Desktop QA\n\n\`\`\`json\n${JSON.stringify(desktop, null, 2)}\n\`\`\`\n`
  );
  console.log(JSON.stringify({ desktop, mobile }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
