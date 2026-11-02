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
const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, "utf8"));
const report = { revision: process.env.GITHUB_SHA ?? "local", verify, source: "Bundled 2025-26 NBA rosters", defaults: source.automation, screens: [], observations: [], tasks: [] };
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
    else await page.getByRole("link", { name: "Development", exact: true }).first().waitFor({ timeout: 90000 });
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
  async function exportedLeague() {
    await page.getByRole("button", { name: "My teams and saved franchises", exact: true }).waitFor({ timeout: 90000 });
    const previous = page.url();
    await page.goto("http://127.0.0.1:3108/gm/franchise", { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.getByRole("button", { name: "Settings and saves", exact: true }).click();
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export this franchise", exact: true }).click();
    const downloaded = await pending;
    const league = JSON.parse(readFileSync(await downloaded.path(), "utf8")).league;
    await page.goto(previous, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.locator("main[data-gm]").waitFor();
    return league;
  }
  await load("regular", "/gm");
  await page.getByRole("link", { name: "Development", exact: true }).first().waitFor();
  const regular = await capture("mobile-opening-night");
  report.observations.push({ task: "Find roster and coaching", visibleNavigation: regular.navigation.filter(row => row.inView).map(row => row.text) });
  if (verify) {
    assert.equal(source.automation.autoFreeAgency, false, "Real saves should leave contract decisions to the GM by default");
    assert.ok(regular.navigation.find(row => row.text === "Roster")?.inView, "Roster must be visible on mobile without horizontal searching");
    assert.ok(regular.navigation.find(row => row.text === "Coaching")?.inView, "Coaching must be visible on mobile");
    assert.ok(!regular.buttons.some(row => /Load 2026|Load current/.test(row.text)), "A historic franchise should not be prompted to replace its progress");
    const more = page.getByLabel("All desks", { exact: true });
    await more.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("link", { name: "Contracts and extensions", exact: true }).waitFor();
    await capture("mobile-all-desks");
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".gm-desk-nav details").getAttribute("open"), null);
    assert.equal(await more.evaluate(node => node === document.activeElement), true);
    await more.click();
    await page.getByRole("link", { name: "Contracts and extensions", exact: true }).click();
    await page.getByRole("heading", { name: "Contracts and extensions", exact: true }).waitFor();
    assert.equal(await page.locator(".gm-desk-nav details").getAttribute("open"), null, "navigation closes the menu");
    report.tasks.push("Mobile desks: visible roster/coaching, keyboard menu, Escape, navigation closure");

    // The hub is safe to leave, and a new franchise creates another resumable slot.
    await page.getByRole("button", { name: "My teams and saved franchises", exact: true }).click();
    await page.getByRole("heading", { name: "My Teams", exact: true }).waitFor();
    const slots = await page.getByRole("button", { name: "Continue", exact: true }).count();
    await page.getByRole("button", { name: "Continue", exact: true }).first().click();
    assert.equal((await exportedLeague()).season, source.season, "leaving and resuming preserves the historic season");
    await page.getByRole("button", { name: "My teams and saved franchises", exact: true }).click();
    await page.getByRole("heading", { name: "My Teams", exact: true }).waitFor();
    await page.route("**/api/gm/league", route => route.fulfill({ json: { league: { ...source, day: 1 } } }));
    await page.getByRole("button", { name: "BOS", exact: true }).click();
    await page.getByRole("button", { name: "My teams and saved franchises", exact: true }).waitFor();
    assert.equal((await exportedLeague()).day, 1);
    await page.getByRole("button", { name: "My teams and saved franchises", exact: true }).click();
    await page.getByRole("heading", { name: "My Teams", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Continue", exact: true }).count(), slots + 1);
    await page.getByRole("button", { name: "Continue", exact: true }).nth(1).click();
    assert.equal((await exportedLeague()).day, source.day, "the original save was not overwritten");
    await load("demo", "/gm");
    await page.getByRole("button", { name: "Start a real NBA franchise", exact: true }).click();
    await page.getByRole("button", { name: "My teams and saved franchises", exact: true }).waitFor();
    assert.equal((await exportedLeague()).day, 1);
    await page.getByRole("button", { name: "My teams and saved franchises", exact: true }).click();
    await page.getByRole("heading", { name: "My Teams", exact: true }).waitFor();
    await page.getByRole("button", { name: "Continue", exact: true }).nth(1).click();
    await page.getByRole("button", { name: "Start a real NBA franchise", exact: true }).waitFor();
    assert.equal((await exportedLeague()).day, 0, "starting real rosters preserves the demo save");
    await page.unroute("**/api/gm/league");
    report.tasks.push("Save slots: leave, resume, start another franchise, preserve original and demo-to-real saves");
  }
  for (const name of ["roster-under", "roster-over", "rookies", "camp"]) {
    await load(name);
    await page.getByTestId("season-hub").waitFor();
    const snap = await capture("mobile-" + name);
    report.observations.push({ task: name, disabledActions: snap.buttons.filter(row => row.disabled).map(row => row.text) });
    if (!verify) continue;
    if (name === "roster-under") {
      await page.getByRole("button", { name: "Find free agents", exact: true }).click();
      await page.waitForURL("**/gm/free-agency");
      await page.getByRole("heading", { name: "Free agency", exact: true }).waitFor();
      const opened = await exportedLeague();
      assert.equal(opened.faMarket.stage, "fill");
      assert.equal(opened.faMarket.done, false);
      assert.equal(opened.seasonFlow.returnFromMarket, "roster_check");
      report.tasks.push("Under roster: primary action opens late fill and routes directly to free agents");
    }
    if (name === "roster-over") {
      const before = JSON.parse(readFileSync(`${dir}/roster-over.json`, "utf8")).league;
      await page.getByRole("link", { name: "Make roster cuts", exact: true }).click();
      await page.waitForURL("**/gm/roster");
      await page.getByRole("button", { name: "Waive", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      const title = await dialog.getByRole("heading").innerText();
      const target = before.players.find(player => title === `Waive ${player.name}?`);
      assert.ok(target);
      assert.match(await dialog.innerText(), /remains on your salary sheet/);
      await capture("mobile-waiver-confirmation");
      await page.keyboard.press("Escape");
      assert.equal((await exportedLeague()).players.find(player => player.id === target.id).teamId, "bos");
      await page.getByRole("button", { name: "Waive", exact: true }).click();
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await page.getByRole("button", { name: "Waive", exact: true }).click();
      await dialog.getByRole("button", { name: "Waive player", exact: true }).click();
      const after = await exportedLeague();
      assert.equal(after.players.find(player => player.id === target.id).teamId, null);
      assert.equal(after.players.filter(player => player.teamId === "bos").length, before.players.filter(player => player.teamId === "bos").length - 1);
      assert.ok(after.teams.find(team => team.id === "bos").deadMoney.some(row => row.playerId === target.id));
      report.tasks.push("Over roster: route to cuts, show retained salary, Escape/Cancel preserve roster, confirm cuts one player");
    }
    if (name === "rookies") {
      await page.getByRole("link", { name: "Review rookie contracts", exact: true }).click();
      await page.waitForURL(url => url.hash === "#rookie-contracts");
      assert.equal(await page.evaluate(() => location.hash), "#rookie-contracts");
      const pendingBefore = await page.getByRole("button", { name: "Sign rookie", exact: true }).count();
      await page.getByRole("button", { name: "Release rights", exact: true }).first().click();
      await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(await page.getByRole("button", { name: "Sign rookie", exact: true }).count(), pendingBefore);
      await page.getByRole("button", { name: "Release rights", exact: true }).first().click();
      await page.getByRole("dialog").getByRole("button", { name: "Release rookie rights", exact: true }).click();
      while (await page.getByRole("button", { name: "Sign rookie", exact: true }).count()) {
        await page.getByRole("button", { name: "Sign rookie", exact: true }).first().click();
      }
      await page.getByRole("button", { name: "Continue to contracts and free agency", exact: true }).waitFor();
      const resolved = await exportedLeague();
      assert.equal(resolved.players.some(player => player.teamId === "bos" && player.pendingRookieContract), false);
      assert.equal(resolved.players.find(player => player.id === manifest.rookieId).teamId, null);
      report.tasks.push("Rookie contracts: primary anchor reaches decisions, canceled release keeps rights, release/sign resolves the step");
    }
    if (name === "camp") {
      await page.getByRole("button", { name: "Continue without individual camps", exact: true }).waitFor();
      const select = page.locator('select[id^="camp-"]:enabled').first();
      const manualId = (await select.getAttribute("id")).slice(5);
      await select.selectOption("conditioning");
      await page.getByRole("button", { name: "Suggest remaining camps", exact: true }).click();
      const planned = await exportedLeague();
      assert.equal(planned.seasonFlow.campAssignments[manualId], "conditioning");
      const count = Object.keys(planned.seasonFlow.campAssignments).length;
      assert.ok(count >= 2 && count <= 4);
      await capture("mobile-camp-preview");
      await page.getByRole("button", { name: "Run training camp", exact: true }).click();
      await page.getByRole("heading", { name: "Camp results", exact: true }).waitFor();
      const completed = await exportedLeague();
      assert.equal(completed.seasonFlow.campResults.filter(row => completed.players.some(player => player.id === row.playerId && player.teamId === "bos")).length, count);
      await page.reload();
      await page.getByRole("button", { name: "Check opening-night roster", exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Run training camp", exact: true }).count(), 0);
      await page.getByRole("button", { name: "Check opening-night roster", exact: true }).click();
      await page.getByRole("button", { name: "Start next season", exact: true }).click();
      await page.waitForURL("**/gm");
      await page.getByText("Calendar", { exact: true }).waitFor();
      assert.equal((await exportedLeague()).season, source.season + 1);
      report.tasks.push("Camp: explicit zero-assignment action, suggestions retain manual choice, results persist, next season routes to its calendar");
    }
  }
  await load("own-market", "/gm/free-agency");
  await page.getByRole("heading", { name: "Free agency", exact: true }).waitFor();
  await capture("mobile-own-negotiations");
  if (verify) {
    await page.getByRole("button", { name: `Review offer for ${manifest.ownPlayerName}`, exact: true }).click();
    await page.getByRole("region", { name: `Offer terms for ${manifest.ownPlayerName}`, exact: true }).waitFor();
    const nameAction = page.getByRole("button", { name: `Review terms for ${manifest.ownPlayerName}`, exact: true });
    assert.ok(await nameAction.evaluate(node => node.getBoundingClientRect().left < innerWidth), "the player-name offer action must be reachable without horizontal table searching");
    await page.getByText(/M total over \d+ season/).waitFor();
    const before = await exportedLeague();
    assert.equal(before.players.find(player => player.id === manifest.ownPlayerId).teamId, null);
    assert.equal(before.faMarket.agreements.length, 0, "reviewing terms must not submit an offer");
    // Reloading closes the local draft; reopen the same named offer before submission.
    await page.getByRole("button", { name: `Review offer for ${manifest.ownPlayerName}`, exact: true }).click();
    await capture("mobile-offer-terms");
    await page.getByRole("button", { name: "Request verbal agreement", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Verbal agreement with" }).waitFor();
    const agreed = await exportedLeague();
    assert.equal(agreed.players.find(player => player.id === manifest.ownPlayerId).teamId, null);
    assert.equal(agreed.faMarket.agreements.some(row => row.playerId === manifest.ownPlayerId), true);
    assert.ok(agreed.faMarket.reservations.length > 0);
    report.tasks.push("Own-player negotiation: named terms and total precede submission; verbal agreement reserves space without signing");
    await load("own-market", "/gm/free-agency");
    await page.getByRole("button", { name: "Renounce", exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    assert.match(await dialog.innerText(), /lose his Bird signing path/);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal((await exportedLeague()).players.find(player => player.id === manifest.ownPlayerId).rightsTeamId, "bos");
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.getByRole("button", { name: "Renounce", exact: true }).first().click();
    await capture("mobile-renounce-dark");
    await dialog.getByRole("button", { name: "Renounce rights", exact: true }).click();
    assert.equal((await exportedLeague()).players.find(player => player.id === manifest.ownPlayerId).rightsTeamId, null);
    report.tasks.push("Rights: cap hold and lost signing path explained, cancel preserves rights, confirm renounces, dark-mode dialog");
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  if (verify) {
    const saved = JSON.parse(readFileSync(`${dir}/regular.json`, "utf8"));
    saved.league.franchise = { ...saved.league.franchise, pauses: { offers: false, scouting: false, injuries: false } };
    writeFileSync(`${dir}/calendar.json`, JSON.stringify(saved));
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await load("calendar", "/gm");
      const calendar = page.locator(".gm-cal").first();
      async function calendarDate() {
        const title = await calendar.locator(".gm-cal__title").innerText();
        const day = await calendar.locator(".is-today .gm-cal__num").innerText();
        const value = Date.parse(title + " " + day.trim().split(/\s/)[0]);
        assert.ok(Number.isFinite(value));
        return value;
      }
      let previous = await calendarDate();
      for (let cycle = 0; cycle < 3; cycle++) {
        await calendar.getByRole("button", { name: "Auto season", exact: true }).click();
        assert.ok(await calendarDate() >= previous, "resuming cannot rewind the calendar");
        await page.waitForTimeout(1100);
        const runningDate = await calendarDate();
        await calendar.getByRole("button", { name: "Stop", exact: true }).click();
        previous = await calendarDate();
        assert.ok(previous >= runningDate, "stopping cannot rewind the calendar");
      }
      await page.reload({ waitUntil: "domcontentloaded" });
      await calendar.waitFor({ state: "visible", timeout: 90000 });
      assert.equal(await calendarDate(), previous, "reload keeps the calendar date");
      await capture(`calendar-${width}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    report.tasks.push("Calendar: phone/desktop start, stop, resume and reload preserve forward dates");
  }
  await load("roster-under");
  await page.getByTestId("season-hub").waitFor();
  await capture("desktop-roster-under");
  await load("camp");
  await page.getByTestId("season-hub").waitFor();
  await capture("desktop-camp");
  if (verify) {
    const snapshot = JSON.parse(readFileSync(`${dir}/regular.json`, "utf8"));
    const club = snapshot.league.players.filter(p => p.teamId === snapshot.league.userTeamId && p.contract);
    const pupil = club[0], veteran = club[1];
    snapshot.league.players = snapshot.league.players.map(p => p.id === pupil.id ? { ...p, age: 21, position: "PG", mentorship: undefined } : p.id === veteran.id ? { ...p, age: 32, position: "PG", workEthic: 90 } : p);
    writeFileSync(`${dir}/development-ui.json`, JSON.stringify(snapshot));
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await load("development-ui", "/gm/development");
      await page.getByRole("heading", { name: "Development", exact: true }).waitFor();
      const firstLink = page.locator(".gm-desk-nav__primary > a").first();
      assert.equal(await firstLink.getAttribute("href"), "/gm", "Home is the leftmost navigation destination");
      assert.equal((await page.getByRole("link", { name: "Franchise desk", exact: true }).count()), 0);
      await page.getByLabel(`Development focus for ${pupil.name}`, { exact: true }).selectOption("defense");
      await page.getByLabel(`Development plan for ${pupil.name}`, { exact: true }).selectOption("practice");
      await page.getByLabel(`Mentor for ${pupil.name}`, { exact: true }).selectOption(veteran.id);
      await page.getByLabel("Badge player", { exact: true }).selectOption(pupil.id);
      const emphasis = page.getByLabel(`Badge emphasis for ${pupil.name}`, { exact: true });
      const available = await emphasis.locator("option:not([disabled])").evaluateAll(options => options.map(o=>o.value).filter(Boolean));
      assert.ok(available.length > 0, "at least one badge has room to grow");
      await emphasis.selectOption(available[0]);
      await page.getByTestId("badge-board").scrollIntoViewIfNeeded();
      assert.equal(await page.getByTestId("badge-board").locator("article").count(),10);
      await capture(`badges-${width}`);
      const persisted = await exportedLeague();
      const learner = persisted.players.find(p => p.id === pupil.id);
      assert.equal(learner.developmentFocus, "defense");
      assert.equal(learner.developmentPlan, "practice");
      assert.equal(learner.mentorship.mentorId, veteran.id);
      assert.equal(learner.badgeFocus, available[0]);
      assert.equal(learner.badges.version, 1);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Development", exact: true }).waitFor();
      assert.equal(await page.getByLabel(`Mentor for ${pupil.name}`, { exact: true }).inputValue(), veteran.id);
      await page.getByLabel("Badge player", { exact: true }).selectOption(pupil.id);
      assert.equal(await page.getByLabel(`Badge emphasis for ${pupil.name}`, { exact: true }).inputValue(),available[0]);
      await page.getByRole("link", {name:`Open ${pupil.name}'s player card`,exact:true}).click();
      await page.waitForURL(`**/gm/player/${pupil.id}`);
      await page.getByRole("heading", {name:"Skill badges",exact:true}).waitFor();
      await page.getByLabel(`Skill badges for ${pupil.name}`,{exact:true}).waitFor();
      assert.equal(await page.getByLabel(`Skill badges for ${pupil.name}`,{exact:true}).count(),1);
      await page.goto("http://127.0.0.1:3108/gm/development",{waitUntil:"domcontentloaded"});
      await page.getByRole("heading", {name:"Development",exact:true}).waitFor();
      await capture(`development-${width}`);
      await page.getByRole("link", { name: "League settings", exact: true }).click();
      await page.getByRole("heading", { name: "League settings", exact: true }).waitFor();
      await page.getByRole("button", { name: "Export this franchise", exact: true }).waitFor();
    }
    for (const width of [390,1440]) {
      await page.setViewportSize({width,height:900});
      await load("development-ui","/gm/lineup");
      await page.getByRole("heading",{name:"Tonight's rotation",exact:true}).waitFor();
      assert.equal(await page.locator(".gm-rot__mins .gm-chart__cell.is-on").count(),120,"rotation chart contains 240 actual minutes");
      for (const row of await page.locator(".gm-pos-mins__row").all()) {
        const totals=await row.locator(".tabular-nums").allTextContents();
        assert.equal(totals.reduce((n,v)=>n+Number(v),0),48,"position bars use actual stints");
      }
      const closing=page.getByLabel("Closing PG",{exact:true});
      const previous=await closing.inputValue();
      const choices=await closing.locator("option:not([disabled])").evaluateAll(options=>options.map(o=>o.value));
      const next=choices.find(id=>id!==previous);
      await closing.selectOption(next);
      const saved=await exportedLeague();
      const club=saved.teams.find(t=>t.id===saved.userTeamId);
      assert.equal(club.coaching.closingLineup[0],next);
      assert.equal(new Set(club.coaching.closingLineup).size,5);
      await page.reload({waitUntil:"domcontentloaded"});
      await page.getByRole("heading",{name:"Tonight's rotation",exact:true}).waitFor();
      assert.equal(await closing.inputValue(),next);
      await capture(`rotation-${width}`);
    }
    report.tasks.push("Rotations: 240 preview minutes, 48 per position, unique closing five and reload at phone/desktop widths");
    await page.setViewportSize({ width: 390, height: 900 });
    await load("camp", "/gm/development");
    const campSave = JSON.parse(readFileSync(`${dir}/camp.json`, "utf8")).league;
    const campers = campSave.players.filter(p => p.teamId === campSave.userTeamId && p.contract && !p.injury).slice(0, 2);
    for (const camper of campers) await page.getByLabel(`Camp focus for ${camper.name}`, { exact: true }).selectOption("shooting");
    await page.getByRole("button", { name: "Run individual camp", exact: true }).click();
    const campDialog = page.getByRole("dialog", { name: "Confirm training camp", exact: true });
    await campDialog.getByText(/fatigue/).waitFor();
    await campDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal((await exportedLeague()).seasonFlow.campResults, undefined, "canceling camp preserves the saved season");
    await page.getByRole("button", { name: "Run individual camp", exact: true }).click();
    await campDialog.getByRole("button", { name: "Run camp", exact: true }).click();
    await page.getByText(/Camp fatigue:|Camp soreness:/).first().waitFor();
    const afterCamp = await exportedLeague();
    assert.equal(afterCamp.seasonFlow.campResults.filter(row => campers.some(p => p.id === row.playerId)).length, 2);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText(/Camp fatigue:|Camp soreness:/).first().waitFor();
    assert.deepEqual((await exportedLeague()).seasonFlow.campResults, afterCamp.seasonFlow.campResults, "reloading preserves camp results without rerolling risk");
    assert.equal(await page.getByRole("button", { name: "Run individual camp", exact: true }).count(), 0);
    await capture("development-camp-phone");
    report.tasks.push("Development camp: two choices, risk confirmation, cancel, saved outcome and reload guard");
    await page.getByRole("button", { name: "My teams and saved franchises", exact: true }).click();
    await page.getByRole("button", { name: "League creation settings", exact: true }).click();
    await page.getByLabel("Development speed at creation", { exact: true }).press("End");
    await page.getByLabel("Injury frequency at creation", { exact: true }).press("Home");
    await page.getByLabel("Enable commissioner editing for the new league", { exact: true }).check();
    await capture("creation-settings");
    await page.route("**/api/gm/league", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ league: source }) }));
    await page.getByRole("button", { name: /BOS/ }).first().click();
    await page.getByRole("link", { name: "League settings", exact: true }).waitFor({ timeout: 90000 });
    const created = await exportedLeague();
    assert.equal(created.settings.developmentSpeed, 2);
    assert.equal(created.settings.injuryFrequency, 0);
    assert.equal(created.franchise.commissioner, true);
    await page.unroute("**/api/gm/league");
    report.tasks.push("Badges: ten skills, emphasis export/reload, and player-card display at 390px and 1440px");
    report.tasks.push("Development: Home first, mentorship/focus reloads, settings gear, creation settings persist into the new league");
  }
  for (const screen of report.screens) assert.ok(screen.contentWidth <= screen.viewportWidth + 2, screen.name + " overflows the page");
  assert.deepEqual(errors, [], "Uncaught errors during UX walkthrough");
  console.log("UX walkthrough completed across " + report.screens.length + " NBA franchise screens and " + report.tasks.length + " verified task groups.");
} catch (error) {
  report.error = error.stack ?? String(error);
  if (page) {
    await page.screenshot({ path: `${dir}/failure.png`, fullPage: true });
    writeFileSync(`${dir}/failure.html`, await page.content());
  }
  throw error;
} finally {
  writeFileSync(`${dir}/report.json`, JSON.stringify({ ...report, errors }, null, 2));
  await browser?.close();
  try { process.kill(-server.pid, "SIGTERM"); } catch { /* Server already stopped. */ }
  log.end();
}
