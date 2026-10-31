import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, createWriteStream } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";
const dir = "/tmp/franchise-qa";
mkdirSync(dir, { recursive: true });
const fixture = spawnSync(process.execPath, ["--import", "tsx", "scripts/fixture-gm-franchise.ts", `${dir}/franchise.json`], { encoding: "utf8" });
assert.equal(fixture.status, 0, fixture.stderr);
const journeyFixture = spawnSync(process.execPath, ["--import", "tsx", "scripts/fixture-gm-season-journey.ts", dir], { encoding: "utf8" });
assert.equal(journeyFixture.status, 0, journeyFixture.stderr);
const log = createWriteStream(`${dir}/next.log`);
const server = spawn("npm", ["run", "dev", "--", "--hostname", "127.0.0.1"], { detached: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PORT: "3107", NEXT_TELEMETRY_DISABLED: "1" } });
server.stdout.pipe(log); server.stderr.pipe(log);
let browser, page;
const errors = [];
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch("http://127.0.0.1:3107/gm"); if (r.ok) { ready = true; break; } } catch { /* Next.js is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  assert.ok(ready, "Next.js did not become ready");
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.emulateMedia({ reducedMotion: "reduce" });
  page.on("pageerror", error => errors.push(error.stack ?? error.message));
  await page.goto("http://127.0.0.1:3107/gm", { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.getByLabel("Import a franchise save", { exact: true }).setInputFiles(`${dir}/franchise.json`, { timeout: 90000 });
  await page.getByRole("link", { name: "Franchise desk", exact: true }).waitFor({ state: "visible", timeout: 90000 });
  await page.getByRole("link", { name: "Franchise desk", exact: true }).click();
  await page.getByRole("heading", { name: "Development and roles", exact: true }).waitFor();
  await page.screenshot({ path: `${dir}/desktop.png`, fullPage: true });
  await page.getByRole("button", { name: "Settings and saves", exact: true }).click();
  await page.getByLabel("Enable player editing and custom draft classes").check();
  const playerId = await page.getByLabel("Player to edit", { exact: true }).inputValue();
  await page.getByLabel("Attribute to edit", { exact: true }).selectOption("threePoint");
  await page.getByLabel("New attribute rating", { exact: true }).fill("88");
  await page.getByRole("button", { name: "Apply rating", exact: true }).click();
  await page.getByText("Player updated. His abilities will apply in the next game.", { exact: true }).waitFor();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export this franchise", exact: true }).click();
  const download = await downloadPromise;
  const file = await download.path();
  const exported = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(exported.league.players.find(p => p.id === playerId).sheet.attributes.threePoint, 88, "commissioner edit must be in the exported save");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Team plan", exact: true }).click();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), "franchise desk overflows the mobile viewport");
  await page.getByRole("heading", { name: "Development and roles", exact: true }).scrollIntoViewIfNeeded();
  await page.getByRole("heading", { name: "Trade conversations", exact: true }).scrollIntoViewIfNeeded();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: `${dir}/mobile.png`, fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Settings and saves", exact: true }).click();
  await page.getByLabel("Player to edit", { exact: true }).scrollIntoViewIfNeeded();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: `${dir}/mobile-settings.png`, fullPage: true, animations: "disabled" });
  // Contract actions and guided summer handoffs are exercised through the UI.
  const manifest = JSON.parse(readFileSync(`${dir}/journey-manifest.json`, "utf8"));
  async function importJourney(name) {
    await page.goto("http://127.0.0.1:3107/gm/franchise", { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.getByRole("button", { name: "Settings and saves", exact: true }).click();
    await page.getByLabel("Import a franchise save", { exact: true }).setInputFiles(`${dir}/journey-${name}.json`);
    await page.getByText("Franchise opened in a new save slot.", { exact: true }).waitFor({ state: "visible", timeout: 90000 });
  }
  await importJourney("regular");
  await page.getByRole("link", { name: "Contracts", exact: true }).click();
  await page.getByRole("heading", { name: "Contracts and extensions", exact: true }).waitFor();
  await page.getByLabel(`Extension salary for ${manifest.playerName}`, { exact: true }).fill(String(manifest.ask));
  const row = page.getByRole("listitem").filter({ has: page.getByLabel(`Extension salary for ${manifest.playerName}`, { exact: true }) });
  await row.getByRole("button", { name: "Offer extension", exact: true }).click();
  await page.getByText(/Extension signed: 3 added years/).waitFor();
  await page.reload();
  await page.getByText(/Extension signed: 3 added years/).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), "contracts desk overflows mobile");
  await page.screenshot({ path: `${dir}/contracts-mobile.png`, fullPage: true, animations: "disabled" });
  await importJourney("review");
  await page.getByRole("link", { name: "Season hub", exact: true }).click();
  await page.getByRole("heading", { name: "Season review", exact: true }).waitFor();
  await page.getByRole("button", { name: "Continue to staff review", exact: true }).click();
  await page.getByRole("heading", { name: "Staff review", exact: true }).waitFor();
  await page.getByRole("button", { name: "Retain staff and reveal lottery", exact: true }).click();
  await page.getByRole("heading", { name: "Draft lottery", exact: true }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "Draft lottery", exact: true }).waitFor();
  await page.getByRole("button", { name: "Continue to combine and workouts", exact: true }).click();
  await page.getByRole("button", { name: "Run draft combine", exact: true }).click();
  await page.getByRole("button", { name: "Combine complete", exact: true }).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), "season hub overflows mobile");
  await page.screenshot({ path: `${dir}/season-hub-mobile.png`, fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: `${dir}/season-hub-desktop.png`, fullPage: true, animations: "disabled" });
  await importJourney("camp");
  await page.getByRole("link", { name: "Season hub", exact: true }).click();
  await page.getByRole("heading", { name: "Focused camps", exact: true }).waitFor();
  const campSelect = page.locator('select[id^="camp-"]').first();
  await campSelect.selectOption("shooting");
  await page.getByRole("button", { name: "Run training camp", exact: true }).click();
  await page.getByRole("heading", { name: "Camp results", exact: true }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "Camp results", exact: true }).waitFor();
  await page.getByRole("button", { name: "Check opening-night roster", exact: true }).click();
  await page.getByRole("heading", { name: "Opening-night roster", exact: true }).waitFor();
  await page.screenshot({ path: `${dir}/opening-roster-desktop.png`, fullPage: true, animations: "disabled" });
  assert.deepEqual(errors, [], "Franchise screens must not produce uncaught browser errors");
  console.log("Franchise browser checks passed: import/export, commissioner edits, extensions, season handoffs, camp, reloads and mobile layout.");
} catch (error) {
  if (page) {
    await page.screenshot({ path: `${dir}/failure.png`, fullPage: true });
    writeFileSync(`${dir}/failure.html`, await page.content());
  }
  writeFileSync(`${dir}/browser-errors.json`, JSON.stringify(errors, null, 2));
  throw error;
} finally {
  await browser?.close();
  try { process.kill(-server.pid, "SIGTERM"); } catch { /* The server may already have exited. */ }
  log.end();
}
