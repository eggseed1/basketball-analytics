/**
 * P17.1 visual QA screenshot capture - read-only against localhost:3000
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("reports/product_completeness_v1_1/screenshots");
fs.mkdirSync(OUT, { recursive: true });

const BASE = process.env.P17_BASE_URL || "http://localhost:3000";

const desktop = { width: 1440, height: 1000 };
const mobile = { width: 390, height: 844 };

/** @type {{ name: string; url: string; viewport: 'desktop'|'mobile'; fullPage?: boolean }[]} */
const shots = [
  { name: "home-desktop", url: "/", viewport: "desktop" },
  { name: "home-mobile", url: "/", viewport: "mobile" },
  { name: "explore-players-2025-26-desktop", url: "/explore/players?season=2025-26", viewport: "desktop" },
  { name: "explore-players-mobile", url: "/explore/players?season=2025-26", viewport: "mobile" },
  { name: "explore-players-2019-20-unsupported", url: "/explore/players?season=2019-20", viewport: "desktop" },
  { name: "player-jabari-desktop", url: "/players/1631095", viewport: "desktop" },
  { name: "player-jabari-mobile", url: "/players/1631095", viewport: "mobile" },
  { name: "player-season-compare", url: "/players/1631095/season-compare?a=2024-25&b=2025-26", viewport: "desktop" },
  { name: "player-season-rank", url: "/players/1631095/season-rank", viewport: "desktop" },
  { name: "compare-desktop", url: "/compare", viewport: "desktop" },
  { name: "compare-mobile", url: "/compare", viewport: "mobile" },
  { name: "ask-desktop", url: "/ask", viewport: "desktop" },
  { name: "ask-mobile", url: "/ask", viewport: "mobile" },
  { name: "explore-teams-desktop", url: "/explore/teams", viewport: "desktop" },
  { name: "explore-teams-mobile", url: "/explore/teams", viewport: "mobile" },
  { name: "team-okc-desktop", url: "/teams/25", viewport: "desktop" },
  { name: "team-okc-mobile", url: "/teams/25", viewport: "mobile" },
  { name: "history-2023-24", url: "/history?season=2023-24", viewport: "desktop" },
  { name: "learn-drbl-top", url: "/learn/drbl", viewport: "desktop", fullPage: false },
  { name: "learn-drbl-full", url: "/learn/drbl", viewport: "desktop", fullPage: true },
  { name: "learn-drbl-mobile", url: "/learn/drbl", viewport: "mobile" },
  // ESPN id with approved alias (Jokic) if alias maps
  { name: "player-espn-jokic", url: "/players/3112335", viewport: "desktop" },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const index = [];
  for (const shot of shots) {
    const vp = shot.viewport === "mobile" ? mobile : desktop;
    const context = await browser.newContext({
      viewport: vp,
      deviceScaleFactor: shot.viewport === "mobile" ? 2 : 1,
    });
    const page = await context.newPage();
    const url = BASE + shot.url;
    let status = "ok";
    let note = "";
    try {
      await page.goto(url, { waitUntil: "commit", timeout: 45000 });
      await page.waitForLoadState("domcontentloaded", { timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(2500);
      const file = `${shot.name}.png`;
      await page.screenshot({
        path: path.join(OUT, file),
        fullPage: Boolean(shot.fullPage),
      });
      // Heuristic text checks
      const body = await page.locator("body").innerText().catch(() => "");
      const hasDrbl = /DRBL\/100|DRBL Snapshot|R1 Points/i.test(body);
      const hasDarko = /DARKO/i.test(body);
      note = `drblText=${hasDrbl};darkoText=${hasDarko}`;
      index.push({ file, url: shot.url, viewport: shot.viewport, status, note });
      console.log("OK", file, note);
    } catch (e) {
      status = "fail";
      note = String(e?.message || e);
      index.push({ file: `${shot.name}.png`, url: shot.url, viewport: shot.viewport, status, note });
      console.error("FAIL", shot.name, note);
    }
    await context.close();
  }
  await browser.close();
  fs.writeFileSync(
    path.join(OUT, "_index.json"),
    JSON.stringify(index, null, 2)
  );
  console.log("Wrote", index.length, "entries");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
