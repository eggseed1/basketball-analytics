/**
 * Percentile category tabs: one group visible at a time.
 * Requires `npm run dev` on :3000.
 * Run: npx tsx scripts/test-player-percentile-categories.ts
 */
import assert from "node:assert/strict";

import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(90_000);

  await page.goto(`${BASE}/players/3945274`, { waitUntil: "domcontentloaded" });
  const tablist = page.getByRole("tablist", { name: "Percentile categories" });
  await tablist.waitFor();

  const overview = tablist.getByRole("tab", { name: /Overview/ });
  const offense = tablist.getByRole("tab", { name: /^Offense$/ });
  assert.equal(await overview.getAttribute("aria-selected"), "true");

  const panel = page.getByRole("tabpanel");
  await assert.doesNotReject(() => panel.getByText("WAR1").waitFor());

  await offense.click();
  assert.equal(await offense.getAttribute("aria-selected"), "true");
  assert.equal(await overview.getAttribute("aria-selected"), "false");
  await assert.doesNotReject(() => panel.getByText("Assist / turnover").waitFor());
  assert.equal(await panel.getByText("WAR1").count(), 0);

  const legend = page.getByText("POOR", { exact: false }).first();
  const war1Bar = panel.locator("button").filter({ hasText: "WAR1" }).locator("span.relative").first();
  await page.getByRole("tab", { name: /Overview/ }).click();
  await panel.getByText("WAR1").waitFor();

  const legendBox = await legend.boundingBox();
  const tabBox = await tablist.boundingBox();
  const barBox = await war1Bar.boundingBox();
  assert.ok(legendBox && tabBox && barBox);

  assert.ok(
    legendBox.y >= tabBox.y + tabBox.height - 1,
    `legend must sit below tabs, legend.y=${legendBox.y} tabs.bottom=${tabBox.y + tabBox.height}`
  );
  assert.ok(
    Math.abs(legendBox.x - barBox.x) < 8,
    `legend must align with first bar, legend.x=${legendBox.x} bar.x=${barBox.x}`
  );
  const legendToBar = barBox.y - (legendBox.y + legendBox.height);
  assert.ok(
    legendToBar >= -2 && legendToBar < 16,
    `legend should sit on the first bar, gap=${legendToBar}px`
  );

  await browser.close();
  console.log("ok percentile category tabs");
}

void main();
