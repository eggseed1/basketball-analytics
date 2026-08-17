/**
 * P17.2 screenshot capture against localhost:3000
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("reports/product_completeness_v1_2/screenshots");
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.P17_BASE_URL || "http://localhost:3000";

const shots = [
  {
    name: "explore-players-team-identity-fixed",
    url: "/explore/players?season=2025-26",
    viewport: { width: 1440, height: 1000 },
  },
  {
    name: "explore-players-team-identity-fixed-mobile",
    url: "/explore/players?season=2025-26",
    viewport: { width: 390, height: 844 },
  },
  {
    name: "game-from-scores",
    url: "/games/401584893",
    viewport: { width: 1440, height: 1000 },
  },
  {
    name: "game-from-home",
    url: "/games/401584893",
    viewport: { width: 1440, height: 1000 },
  },
  {
    name: "player-page-team-identity",
    url: "/players/1631095",
    viewport: { width: 1440, height: 1000 },
  },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const index = [];
  for (const shot of shots) {
    const context = await browser.newContext({
      viewport: shot.viewport,
      deviceScaleFactor: shot.viewport.width < 500 ? 2 : 1,
    });
    const page = await context.newPage();
    let status = "ok";
    let note = "";
    try {
      await page.goto(BASE + shot.url, { waitUntil: "commit", timeout: 60000 });
      await page.waitForLoadState("domcontentloaded", { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(3500);
      const body = await page.locator("body").innerText().catch(() => "");
      const leaked = /16106127\d{2}/.test(body);
      const is404 = /404|This page could not be found/i.test(body);
      note = `leakedNbaTeamId=${leaked};page404=${is404}`;
      if (leaked) status = "leak";
      if (is404) status = "404";
      const file = `${shot.name}.png`;
      await page.screenshot({ path: path.join(OUT, file), fullPage: false });
      index.push({ file, url: shot.url, status, note });
      console.log(status.toUpperCase(), file, note);
    } catch (e) {
      status = "fail";
      note = String(e?.message || e);
      index.push({ file: `${shot.name}.png`, url: shot.url, status, note });
      console.error("FAIL", shot.name, note);
    }
    await context.close();
  }
  await browser.close();
  fs.writeFileSync(
    path.join(OUT, "index.json"),
    JSON.stringify(index, null, 2)
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
