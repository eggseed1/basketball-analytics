/**
 * Paired current (P17.2) screenshots for design visual regression.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(
  "reports/product_completeness_v1_2/design_reference/current_p17_2"
);
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.P17_BASE_URL || "http://127.0.0.1:3000";

const shots = [
  { name: "home-desktop", url: "/", vp: { width: 1440, height: 1000 } },
  { name: "home-mobile", url: "/", vp: { width: 390, height: 844 } },
  {
    name: "explore-players-desktop",
    url: "/explore/players?season=2025-26",
    vp: { width: 1440, height: 1000 },
  },
  {
    name: "explore-players-mobile",
    url: "/explore/players?season=2025-26",
    vp: { width: 390, height: 844 },
  },
  {
    name: "player-page-desktop",
    url: "/players/1631095",
    vp: { width: 1440, height: 1000 },
  },
  {
    name: "explore-teams-desktop",
    url: "/explore/teams",
    vp: { width: 1440, height: 1000 },
  },
  {
    name: "team-page-desktop",
    url: "/teams/10",
    vp: { width: 1440, height: 1000 },
  },
  {
    name: "game-page-desktop",
    url: "/games/401584893",
    vp: { width: 1440, height: 1000 },
  },
  {
    name: "compare-desktop",
    url: "/compare",
    vp: { width: 1440, height: 1000 },
  },
  { name: "ask-desktop", url: "/ask", vp: { width: 1440, height: 1000 } },
  { name: "learn-desktop", url: "/learn", vp: { width: 1440, height: 1000 } },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const index = [];
  for (const shot of shots) {
    const context = await browser.newContext({
      viewport: shot.vp,
      deviceScaleFactor: shot.vp.width < 500 ? 2 : 1,
    });
    const page = await context.newPage();
    let status = "ok";
    let note = "";
    try {
      await page.goto(BASE + shot.url, {
        waitUntil: "commit",
        timeout: 90000,
      });
      await page
        .waitForLoadState("domcontentloaded", { timeout: 60000 })
        .catch(() => {});
      await page.waitForTimeout(3000);
      const body = await page.locator("body").innerText().catch(() => "");
      const leaked = /16106127\d{2}/.test(body);
      const is404 = /404|This page could not be found/i.test(body);
      note = `leakedNba=${leaked};page404=${is404}`;
      if (leaked) status = "leak";
      if (is404) status = "404";
      const file = `${shot.name}.png`;
      await page.screenshot({
        path: path.join(OUT, file),
        fullPage: false,
      });
      index.push({ file, url: shot.url, status, note, base: BASE });
      console.log(status.toUpperCase(), file, note);
    } catch (e) {
      status = "fail";
      note = String(e?.message || e);
      index.push({
        file: `${shot.name}.png`,
        url: shot.url,
        status,
        note,
        base: BASE,
      });
      console.error("FAIL", shot.name, note);
    }
    await context.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
