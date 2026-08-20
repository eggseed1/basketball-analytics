/**
 * Browser check for /internal/luka (Savant overview on BRef backbone).
 * Requires `npm run dev` on :3000.
 * Run: npx tsx scripts/test-luka-bref-example.ts
 */
import assert from "node:assert/strict";

import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(60_000);

  await page.goto(
    `${BASE}/internal/luka?season=2024-25&seasonType=regular&team=TOT&rate=perGame&tab=overview`,
    { waitUntil: "networkidle" }
  );

  const h1 = page.getByRole("heading", { level: 1 });
  await assert.doesNotReject(() => h1.waitFor());
  const name = (await h1.textContent()) ?? "";
  assert.match(name, /Luka Dončić/);
  assert.doesNotMatch(name, /^uka /);

  const body = await page.locator("main").innerText();
  assert.match(body, /Current/);
  assert.match(body, /Los Angeles Lakers/);
  assert.match(body, /Viewing/);
  assert.match(body, /2024-25 regular season · TOT/);
  assert.match(body, /Primary creator/);
  assert.match(body, /Slovenia/);
  assert.doesNotMatch(body, /Ask DRBL/);
  assert.doesNotMatch(body, /similar players/i);
  assert.match(body, /of \d+ qualified|of \d+/);
  assert.match(body, /lower TOV% is better/);

  await page.getByRole("button", { name: "DAL", exact: true }).click();
  await page.waitForURL(/team=DAL/);
  const dalBody = await page.locator("main").innerText();
  assert.match(dalBody, /Percentiles use combined-season rows/);
  assert.match(dalBody, /Viewing/);
  assert.match(dalBody, /DAL/);
  assert.doesNotMatch(dalBody, /Ask DRBL/);

  await page.getByRole("button", { name: "LAL", exact: true }).click();
  await page.waitForURL(/team=LAL/);

  await page.getByRole("button", { name: "TOT", exact: true }).click();
  await page.waitForURL(/team=TOT/);

  await page.getByRole("button", { name: "2018-19", exact: true }).click();
  await page.waitForURL(/season=2018-19/);
  const hist = await page.locator("main").innerText();
  assert.match(hist, /Current/);
  assert.match(hist, /Los Angeles Lakers/);
  assert.match(hist, /2018-19/);
  assert.match(hist, /DAL/);
  assert.doesNotMatch(hist, /current season vs career/i);

  await page.getByRole("button", { name: "Playoffs", exact: true }).click();
  await page.waitForURL(/seasonType=playoffs/);
  const po = await page.locator("main").innerText();
  assert.match(po, /playoffs/i);
  assert.doesNotMatch(po, /Ask DRBL/);

  await page.getByRole("button", { name: "Regular", exact: true }).click();
  await page.getByRole("button", { name: "All Stats", exact: true }).click();
  await page.waitForURL(/tab=all-stats/);
  const ledger = await page.locator("main").innerText();
  assert.match(ledger, /Season ledger/);
  assert.match(ledger, /TOT/);
  assert.match(ledger, /DAL/);
  assert.doesNotMatch(ledger, /Ask DRBL/);

  await page.getByRole("button", { name: "Trends", exact: true }).click();
  await page.waitForURL(/tab=trends/);
  const trends = await page.locator("main").innerText();
  assert.match(trends, /PTS \/ G/);
  assert.match(trends, /BPM/);

  await browser.close();
  console.log("ok /internal/luka");
}

void main();
