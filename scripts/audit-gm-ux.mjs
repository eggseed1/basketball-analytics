import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, createWriteStream } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";
const dir = "/tmp/franchise-ux";
const verify = process.argv.includes("--verify");
mkdirSync(dir, { recursive: true });
const fixture = spawnSync(process.execPath, ["--import", "tsx", "--require", "./scripts/lib/stub-server-only.cjs", "scripts/fixture-gm-ux.ts", dir], { encoding: "utf8" });
assert.equal(fixture.status, 0, fixture.stderr);
const source = JSON.parse(readFileSync(`${dir}/regular.json`, "utf8")).league;
const report = { revision: process.env.GITHUB_SHA ?? "local", verify, source: "Bundled 2025-26 NBA rosters", defaults: source.automation, screens: [], observations: [] };
const log = createWriteStream(`${dir}/next.log`);
const server = spawn("npm", ["run", "dev", "--", "--hostname", "127.0.0.1"], { detached: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PORT: "3108", NEXT_TELEMETRY_DISABLED: "1" } });
server.stdout.pipe(log); server.stderr.pipe(log);
let browser, page;
const errors = [];
try {
  let ready = false;
  for (let index = 0; index < 100; index++) {
    try { if ((await fetch("http://127.0.0.1:3108/gm")).ok) { ready = true; break; } } catch { /* Wait for Next.js. */ }
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  assert.ok(ready, "UX audit server did not start");
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  let imported = false;
  async function load(name, route = "/gm/offseason") {
    if (imported) {
      await page.goto("http://127.0.0.1:3108/gm/franchise", { waitUntil: "domcontentloaded", timeout: 120000 });
      await page.getByRole("button", { name: "Settings and saves", exact: true }).click();
    } else await page.goto("http://127.0.0.1:3108/gm", { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.getByLabel("Import a franchise save", { exact: true }).setInputFiles(`${dir}/${name}.json`);
    if (imported) await page.getByText("Franchise opened in a new save slot.", { exact: true }).waitFor();
    else await page.getByRole("link", { name: "Franchise desk", exact: true }).waitFor({ timeout: 90000 });
    imported = true;
    await page.goto("http://127.0.0.1:3108" + route, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.locator("main[data-gm]").waitFor();
    await page.getByRole("navigation").filter({ has: page.getByRole("link", { name: "Season hub", exact: true }) }).waitFor();
  }
  async function capture(name) {
    await page.evaluate(() => scrollTo(0, 0));
    const snapshot = await page.locator("main[data-gm]").evaluate(root => {
      const nav = root.querySelector("nav");
      const navRect = nav?.getBoundingClientRect();
      return {
        text: root.innerText,
        buttons: [...root.querySelectorAll("button")].map(button => ({ text: button.innerText.trim(), disabled: button.disabled, label: button.getAttribute("aria-label") })),
        links: [...root.querySelectorAll("a")].map(link => ({ text: link.innerText.trim(), href: link.getAttribute("href") })),
        navigation: nav ? [...nav.querySelectorAll("a,summary")].map(link => { const rect = link.getBoundingClientRect(); return { text: link.textContent?.trim(), inView: rect.width > 0 && rect.left >= (navRect?.left ?? 0) - 1 && rect.right <= Math.min(innerWidth, navRect?.right ?? innerWidth) + 1 }; }) : [],
        viewportWidth: innerWidth, contentWidth: document.documentElement.scrollWidth,
      };
    });
    report.screens.push({ name, ...snapshot });
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true, animations: "disabled" });
    writeFileSync(`${dir}/${name}.html`, await page.content());
    return snapshot;
  }
  await load("regular", "/gm");
  await page.getByRole("link", { name: "Franchise desk", exact: true }).waitFor();
  const regular = await capture("mobile-opening-night");
  report.observations.push({ task: "Find roster and coaching", visibleNavigation: regular.navigation.filter(row => row.inView).map(row => row.text) });
  if (verify) {
    assert.equal(source.automation.autoFreeAgency, false, "Real saves should leave contract decisions to the GM by default");
    assert.ok(regular.navigation.find(row => row.text === "Roster")?.inView, "Roster must be visible on mobile without horizontal searching");
    assert.ok(regular.navigation.find(row => row.text === "Coaching")?.inView, "Coaching must be visible on mobile");
    assert.ok(!regular.buttons.some(row => /Load 2026|Load current/.test(row.text)), "A historic franchise should not be prompted to replace its progress");
  }
  for (const name of ["roster-under", "roster-over", "rookies", "camp"]) {
    await load(name);
    await page.getByTestId("season-hub").waitFor();
    const snap = await capture("mobile-" + name);
    report.observations.push({ task: name, disabledActions: snap.buttons.filter(row => row.disabled).map(row => row.text) });
  }
  await load("own-market", "/gm/free-agency");
  await page.getByRole("heading", { name: "Free agency", exact: true }).waitFor();
  await capture("mobile-own-negotiations");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await load("roster-under");
  await page.getByTestId("season-hub").waitFor();
  await capture("desktop-roster-under");
  await load("camp");
  await page.getByTestId("season-hub").waitFor();
  await capture("desktop-camp");
  for (const screen of report.screens) assert.ok(screen.contentWidth <= screen.viewportWidth + 2, screen.name + " overflows the page");
  assert.deepEqual(errors, [], "Uncaught errors during UX walkthrough");
  console.log("UX walkthrough completed across " + report.screens.length + " NBA franchise screens.");
} catch (error) {
  report.error = error.stack ?? String(error);
  if (page) await page.screenshot({ path: `${dir}/failure.png`, fullPage: true });
  throw error;
} finally {
  writeFileSync(`${dir}/report.json`, JSON.stringify({ ...report, errors }, null, 2));
  await browser?.close();
  try { process.kill(-server.pid, "SIGTERM"); } catch { /* Server already stopped. */ }
  log.end();
}
