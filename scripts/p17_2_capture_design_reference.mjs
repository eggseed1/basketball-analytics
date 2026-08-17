/**
 * Capture design-reference (7e764ceb) screenshots for P17.2 design audit.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(
  "reports/product_completeness_v1_2/design_reference"
);
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.DESIGN_REF_URL || "http://localhost:3001";

const shots = [
  { name: "home-desktop", url: "/", vp: { width: 1440, height: 1000 } },
  { name: "home-mobile", url: "/", vp: { width: 390, height: 844 } },
  {
    name: "explore-players-desktop",
    url: "/explore/players",
    vp: { width: 1440, height: 1000 },
  },
  {
    name: "explore-players-mobile",
    url: "/explore/players",
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
      const is404 = /404|This page could not be found/i.test(body);
      note = is404 ? "page404=true" : "page404=false";
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
  console.log("wrote", path.join(OUT, "index.json"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
