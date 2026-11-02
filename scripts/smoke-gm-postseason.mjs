import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, createWriteStream } from "node:fs";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { createGeneratedLeague } from "../src/gm/seed/create-league.ts";
import { prepareFranchise, exportFranchise } from "../src/gm/engine/franchise.ts";
import { createPlayInBoard } from "../src/gm/engine/play-in.ts";

const dir = "/tmp/franchise-postseason";
mkdirSync(dir, { recursive: true });
const fixture = prepareFranchise(createGeneratedLeague({ userTeamId: "bos", season: 2028, seed: 41 }));
fixture.phase = "play_in";
fixture.playIn = createPlayInBoard(fixture);
fixture.settings.injuryFrequency = 0;
fixture.homeFlow = { awardsSeen: true };
const base = process.env.DRBL_VERIFY_BASE_URL ?? "http://127.0.0.1:3109";
let server, browser, activePage;
const report = { base, revision: process.env.GITHUB_SHA, widths: [], errors: [] };
if (!process.env.DRBL_VERIFY_BASE_URL) {
  const log = createWriteStream(`${dir}/next.log`);
  server = spawn("npm", ["run", "dev", "--", "--hostname", "127.0.0.1"], { detached: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PORT: "3109", NEXT_TELEMETRY_DISABLED: "1" } });
  server.stdout.pipe(log); server.stderr.pipe(log);
}
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + "/gm")).ok) { ready = true; break; } } catch { /* Server starts here. */ }
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  assert.ok(ready, "Franchise Lab did not become ready");
  browser = await chromium.launch({ headless: true });
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    activePage = page;
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(base + "/gm", { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.getByLabel("Import a franchise save", { exact: true }).setInputFiles({ name: "postseason.json", mimeType: "application/json", buffer: Buffer.from(exportFranchise(fixture)) });
    await page.getByRole("link", { name: "Development", exact: true }).first().waitFor({ timeout: 90000 });
    await page.goto(base + "/gm/schedule", { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.getByRole("heading", { name: "Play-in tournament", exact: true }).waitFor();
    await page.getByRole("button", { name: "Sim tonight", exact: true }).click();
    await page.getByRole("link", { name: /^Box score:/ }).first().waitFor();
    assert.equal(await page.getByRole("link", { name: /^Box score:/ }).count(), 4, "play-in button plays four games with real phase guard");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: /^Box score:/ }).first().waitFor();
    assert.equal(await page.getByRole("link", { name: /^Box score:/ }).count(), 4, "play-in results persist after reload");
    await page.screenshot({ path: `${dir}/play-in-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: /^Watch:/ }).first().click();
    await page.waitForURL("**/gm/game/**?watch=1");
    // Reduced motion skips automatic chart playback; explicit Replay remains available.
    await page.getByRole("button", { name: "Replay", exact: true }).click();
    await page.getByRole("button", { name: "Pause", exact: true }).waitFor({ timeout: 30000 });
    await page.getByTestId("gm-game-score").waitFor();
    const watchPath = new URL(page.url()).pathname;
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    const pausedScore = await page.getByTestId("gm-game-score").innerText();
    await page.waitForTimeout(300);
    assert.equal(await page.getByTestId("gm-game-score").innerText(), pausedScore, "watch mode pauses its scoreboard");
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    assert.ok(Number(await page.getByRole("slider", { name: "Game time", exact: true }).inputValue()) > 0, "playback resumes and advances the game clock");
    await page.screenshot({ path: `${dir}/watch-${width}.png`, fullPage: true });
    await page.getByRole("link", { name: "View final box score", exact: true }).click();
    await page.waitForURL(url => url.pathname === watchPath && !url.search);
    const finalScore = await page.getByTestId("gm-game-score").innerText();
    assert.notEqual(finalScore, pausedScore, "box-score view shows the actual final result");
    await page.waitForTimeout(300);
    assert.equal(await page.getByTestId("gm-game-score").innerText(), finalScore, "box-score stats stay final while the chart previews");
    assert.equal(await page.locator(".gm-club-panel tbody tr").count() >= 10, true);
    const points = [];
    for (const panel of await page.locator(".gm-club-panel").all()) points.push((await panel.locator("tbody tr td:nth-child(3)").allTextContents()).reduce((sum, value) => sum + Number(value), 0));
    assert.deepEqual(points, [...finalScore.matchAll(/\d+/g)].map(match => Number(match[0])), "individual final statistics add up to each final score");
    await page.getByRole("link", { name: "Back to postseason", exact: true }).click();
    await page.getByRole("button", { name: "Finish the play-in", exact: true }).click();
    await page.getByRole("heading", { name: "Playoff bracket", exact: true }).waitFor();
    const tree = page.getByTestId("playoff-bracket-tree");
    assert.equal(await tree.locator(".gm-bracket-node").count(), 7);
    assert.equal(await tree.locator(".has-next").count(), 6);
    await tree.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${dir}/bracket-${width}.png`, fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), "bracket uses local scrolling without page overflow");
    await page.getByRole("button", { name: "West", exact: true }).click();
    await page.getByRole("region", { name: /^West playoff bracket/ }).waitFor();
    const detail = page.getByTestId("postseason-series-details");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await detail.getByRole("button", { name: /^Watch:/ }).click();
    await page.waitForURL("**/gm/game/**?watch=1");
    await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("link", { name: "Back to postseason", exact: true }).click();
    await page.getByRole("button", { name: "West", exact: true }).click();
    const gameLink = detail.getByRole("link", { name: /^Box score:/ });
    await gameLink.first().waitFor();
    const gameHref = await gameLink.first().getAttribute("href");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "West", exact: true }).click();
    assert.equal(await detail.getByRole("link", { name: /^Box score:/ }).first().getAttribute("href"), gameHref, "individual playoff game link survives reload");
    await page.getByText("Play-in results", { exact: true }).click();
    assert.equal(await page.getByRole("link", { name: /^Box score:/ }).count(), 7, "all six play-in boxes remain available after playoffs start");
    await page.getByRole("button", { name: "Finish playoffs", exact: true }).click();
    await page.getByText(/won the Finals\./).waitFor({ timeout: 120000 });
    await page.goto(base + "/gm/settings", { waitUntil: "domcontentloaded" });
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export this franchise", exact: true }).click();
    const save = JSON.parse(readFileSync(await (await pending).path(), "utf8")).league;
    assert.ok(save.champion, JSON.stringify({ phase: save.phase, day: save.day, final: save.playoffBracket?.find(s => s.conf === "Finals"), finalBoxes: save.boxScores?.filter(b => b.postseason === "playoffs").length, players: save.players?.length, winnerRoster: save.players?.filter(p => p.teamId === save.playoffBracket?.find(s => s.conf === "Finals")?.winnerId).length, homeFlow: save.homeFlow }));
    assert.equal(save.playoffBracket.length, 15);
    assert.ok(save.playoffBracket.every(series => series.done));
    assert.equal(save.boxScores.filter(box => box.postseason === "play_in").length, 6);
    assert.ok(save.boxScores.filter(box => box.postseason).every(box => box.events?.length));
    assert.deepEqual(save.standings, fixture.standings);
    assert.deepEqual(errors, []);
    report.widths.push({ width, champion: save.champion.teamId, games: save.boxScores.length, errors });
    writeFileSync(`${dir}/report.json`, JSON.stringify(report, null, 2));
    await page.close();
  }
  console.log("Postseason browser passed at 390px and 1440px: play-in clicks, reload, connected bracket, individual game stats/watch, pause, retained results, official feeds and Finals.");
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: `${dir}/failure.png`, fullPage: true }).catch(() => {});
    writeFileSync(`${dir}/failure.html`, await activePage.content());
  }
  report.errors.push(String(error));
  writeFileSync(`${dir}/report.json`, JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser?.close();
  if (server?.pid) { try { process.kill(-server.pid, "SIGTERM"); } catch { /* Process already stopped. */ } }
}
