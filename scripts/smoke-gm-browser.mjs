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
  await page.getByRole("link", { name: "Development", exact: true }).first().waitFor({ state: "visible", timeout: 90000 });
  await page.getByRole("region", { name: "Next game", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: /Play game|Set lineup/, exact: true }).count(), 1, "one clear primary action");
  const overview = page.getByTestId("gm-home-more");
  assert.equal(await overview.evaluate(node => node.open), false, "secondary content starts closed");
  await overview.locator("summary").click();
  assert.equal(await overview.evaluate(node => node.open), true, "overview remains available");
  // The prominent injury-sim setting must persist with this save.
  const injurySim = page.getByRole("checkbox", { name: /Sim through injuries/ });
  await injurySim.check();
  assert.equal(await injurySim.isChecked(), true);
  await page.reload();
  await page.getByRole("checkbox", { name: /Sim through injuries/ }).waitFor();
  assert.equal(await page.getByRole("checkbox", { name: /Sim through injuries/ }).isChecked(), true,
    "sim-through-injuries preference survives reload");
  await page.getByRole("checkbox", { name: /Sim through injuries/ }).uncheck();

  // The GM atmosphere must use the saved franchise's actual two team colors,
  // not the generic NBA blue/red. This lives in the persistent sports shell.
  const atmosphere = page.locator(".page-atmosphere");
  await page.waitForFunction(() => {
    const orb = document.querySelector(".page-atmosphere");
    return orb && getComputedStyle(orb).getPropertyValue("--atmosphere-a").trim() === "#007A33";
  });
  const initialColors = await atmosphere.evaluate(orb => {
    const style = getComputedStyle(orb);
    return [style.getPropertyValue("--atmosphere-a").trim(),
      style.getPropertyValue("--atmosphere-b").trim()];
  });
  assert.deepEqual(initialColors, ["#007A33", "#BA9653"],
    "Boston's two real team colors must drive GM's existing site orbs");

  // Verify the actual photograph and alpha-masked jersey render in Chromium,
  // not just React static markup. This catches mobile Safari/Chromium CSS
  // regressions and broken production-style static assets.
  await page.goto("http://127.0.0.1:3107/gm/roster", { waitUntil: "domcontentloaded" });
  const largePhoto = page.locator('[data-generated-photo="true"][data-avatar="xl"]').first();
  await largePhoto.waitFor({ state: "visible" });
  assert.equal(await largePhoto.getAttribute("data-jersey-team"), "bos");
  const photoTint = largePhoto.locator('[data-photo-jersey-tint="true"]');
  const tintState = await photoTint.evaluate(el => {
    const style = getComputedStyle(el);
    return { color: style.backgroundColor, opacity: style.opacity,
      mask: style.maskImage || style.webkitMaskImage, blend: style.mixBlendMode };
  });
  assert.equal(tintState.color, "rgb(0, 122, 51)");
  assert.equal(tintState.opacity, "0.88");
  assert.ok(tintState.mask.includes("-jersey-mask.webp"), "jersey must be clipped to fabric alpha mask");
  assert.equal(tintState.blend, "normal", "uniform color must not inherit navy luminance");
  const image = largePhoto.locator("img");
  await image.evaluate(img => img.decode());
  assert.ok(await image.evaluate(img => img.complete && img.naturalWidth > 0), "photo must load");
  const maskUrl = (await photoTint.getAttribute("style")).match(/url\\(['"]?([^'")]+)/)?.[1];
  assert.ok(maskUrl, "fabric mask must resolve to a URL");
  assert.equal((await page.request.get(new URL(maskUrl, page.url()).href)).status(), 200);
  await largePhoto.screenshot({ path: dir + "/photo-jersey-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await largePhoto.waitFor({ state: "visible" });
  assert.equal(await largePhoto.getAttribute("data-jersey-team"), "bos");
  await largePhoto.screenshot({ path: dir + "/photo-jersey-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("http://127.0.0.1:3107/gm", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Fullscreen", exact: true }).waitFor();

  // Unlike the old implementation, native fullscreen belongs to the stable
  // document root. A Next page's <main> unmount during route loading MUST NOT
  // cause a fullscreenchange exit/re-entry or expose the ordinary site header.
  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await page.waitForFunction(() => document.fullscreenElement === document.documentElement);
  await page.evaluate(() => {
    window.__gmFullscreenExits = 0;
    document.addEventListener("fullscreenchange", () => {
      if (!document.fullscreenElement) window.__gmFullscreenExits++;
    });
  });
  await page.getByRole("link", { name: "Development", exact: true }).first().click();
  await page.waitForURL("**/gm/development");
  await page.getByRole("button", { name: "Exit fullscreen", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.fullscreenElement === document.documentElement), true,
    "native fullscreen must remain active after GM tab navigation");
  assert.equal(await page.evaluate(() => window.__gmFullscreenExits), 0,
    "loading between GM tabs must not trigger browser fullscreen exit");
  assert.equal(await atmosphere.evaluate(el => getComputedStyle(el).display !== "none"), true,
    "the team orbs must stay visible in native GM fullscreen");
  await page.getByRole("link", { name: "Home", exact: true }).first().click();
  await page.waitForURL("http://127.0.0.1:3107/gm");
  await page.getByRole("button", { name: "Exit fullscreen", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.fullscreenElement === document.documentElement), true,
    "native fullscreen must remain active on the return navigation");
  assert.equal(await page.evaluate(() => window.__gmFullscreenExits), 0);
  assert.deepEqual(await atmosphere.evaluate(el => {
    const style = getComputedStyle(el);
    return [style.getPropertyValue("--atmosphere-a").trim(),
      style.getPropertyValue("--atmosphere-b").trim()];
  }), initialColors, "team orbs must not reset on a route transition");
  await page.getByRole("button", { name: "Exit fullscreen", exact: true }).click();
  await page.waitForFunction(() => !document.fullscreenElement &&
    document.documentElement.dataset.gmFull !== "1");

  // Fullscreen must paint the exact semantic GM page surface, not inherit the
  // browser's opaque black fullscreen backdrop after the page chrome hides.
  // Drive the CSS fallback during responsive tests: a true native Chromium
  // fullscreen window cannot be resized with Playwright's viewport API.
  const disableNativeFullscreen = () => {
    HTMLElement.prototype.requestFullscreen = async () => {
      throw new Error("Browser fullscreen intentionally unavailable in responsive QA");
    };
  };
  await page.addInitScript(disableNativeFullscreen);
  await page.evaluate(disableNativeFullscreen);
  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.gmFull === "1");
  const checkFullscreenSurface = async () => {
    const appearance = await page.locator("main[data-gm]").evaluate((desk) => {
      const panel = desk.querySelector(".gm-mast");
      const rect = desk.getBoundingClientRect();
      const panelRect = panel?.getBoundingClientRect();
      const orb = document.querySelector(".page-atmosphere");
      return {
        background: getComputedStyle(desk).backgroundColor,
        page: getComputedStyle(document.body).backgroundColor,
        atmosphereDisplay: orb ? getComputedStyle(orb).display : "missing",
        atmosphereTeamColor: orb ? getComputedStyle(orb).getPropertyValue("--atmosphere-a").trim() : "",
        width: rect.width,
        viewport: innerWidth,
        cardWidth: panelRect?.width ?? 0,
        maxCardWidth: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--page-max-standard")) * 16,
      };
    });
    assert.equal(appearance.background, "rgba(0, 0, 0, 0)",
      "GM desk must remain transparent so the animated site orbs show through");
    assert.notEqual(appearance.page, "rgba(0, 0, 0, 0)",
      "the underlying body must paint a solid themed surface");
    assert.equal(appearance.atmosphereDisplay, "block",
      "GM fullscreen must not hide the animated team-color atmosphere");
    assert.equal(appearance.atmosphereTeamColor, "#007A33",
      "fullscreen must retain the active club's atmosphere color");
    assert.ok(Math.abs(appearance.width - appearance.viewport) < 3,
      "fullscreen must fill the viewport");
    assert.ok(appearance.cardWidth > 0 && appearance.cardWidth <= appearance.viewport,
      "fullscreen masthead must remain legible within the viewport");
    assert.ok(appearance.cardWidth <= 1282,
      "fullscreen content should keep the standard GM page width on desktop");
  };
  await checkFullscreenSurface();
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.gmFull === "1");
  await page.getByRole("button", { name: "Exit fullscreen", exact: true }).waitFor();
  await page.waitForFunction(() => {
    const orb = document.querySelector(".page-atmosphere");
    return orb && getComputedStyle(orb).getPropertyValue("--atmosphere-a").trim() === "#007A33";
  });
  await checkFullscreenSurface();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.gmFull), "1",
    "the fullscreen fallback must persist across a page reload");
  await page.setViewportSize({ width: 390, height: 844 });
  await checkFullscreenSurface();
  await page.screenshot({ path: `${dir}/gm-fullscreen-mobile.png`, fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: `${dir}/gm-fullscreen-desktop.png`, fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Exit fullscreen", exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.gmFull !== "1");

  // Fictional social reactions are integrated into the same saved league,
  // accessible on narrow screens, and can be liked/followed without any API.
  await page.goto("http://127.0.0.1:3107/gm/timeline", { waitUntil: "domcontentloaded" });
  const timeline = page.getByTestId("gm-social-timeline");
  await timeline.getByRole("heading", { name: "The Timeline" }).waitFor();
  assert.ok(await timeline.locator("[data-social-post]").count() >= 1);
  assert.ok(await timeline.getByText("Fictional in-game accounts", { exact: false }).count() > 0 ||
    await timeline.getByText("fictional NBA social feed", { exact: false }).count() > 0);
  const reportPost = timeline.locator("[data-social-post]").first();
  const postId = await reportPost.getAttribute("data-social-post");
  await reportPost.getByRole("button", { name: /Like .* post/ }).click();
  assert.equal(await reportPost.getByRole("button", { name: /Unlike .* post/ }).getAttribute("aria-pressed"), "true");
  await reportPost.getByRole("button", { name: "Follow", exact: true }).click();
  await page.reload();
  await timeline.locator('[data-social-post="' + postId + '"]').waitFor();
  const kept = timeline.locator('[data-social-post="' + postId + '"]');
  assert.equal(await kept.getByRole("button", { name: /Unlike .* post/ }).getAttribute("aria-pressed"), "true",
    "likes must survive browser reload");
  assert.equal(await kept.getByRole("button", { name: "Following", exact: true }).getAttribute("aria-pressed"), "true",
    "account follows must survive browser reload");
  await timeline.getByRole("button", { name: "Liked", exact: true }).click();
  assert.ok(await timeline.locator("[data-social-post]").count() >= 1);
  await timeline.getByRole("button", { name: "For you", exact: true }).click();
  const expand = timeline.getByRole("button", { name: /Show replies to/ }).first();
  if (await expand.count()) {
    await expand.click();
    assert.ok(await timeline.locator("[data-social-post]").count() >= 2, "replies should unfold on demand");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2),
    "timeline must fit a narrow mobile screen");
  await page.screenshot({ path: `${dir}/timeline-mobile.png`, fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: `${dir}/timeline-desktop.png`, fullPage: true, animations: "disabled" });

    // Reconcile the linked 240-minute allocator with the same save used by
  // Timeline and mentorship; sliders transfer minutes instead of creating more.
  await page.goto("http://127.0.0.1:3107/gm/lineup", { waitUntil: "domcontentloaded" });
  const minuteBudget = page.getByTestId("rotation-minute-budget");
  await minuteBudget.waitFor();
  assert.match(await minuteBudget.innerText(), /240\s*\/\s*240/,
    "the actual rotation UI must start with one valid 240-minute budget");
  const rotationSliders = page.locator('.gm-rot__slider input[type="range"]:not([disabled])');
  const readMinuteBook = () => page.locator('.gm-rot__slider input[type="range"]:not([disabled])')
    .evaluateAll(nodes => Object.fromEntries(nodes.map(el => [el.getAttribute("aria-label"), Number(el.value)])));
  const beforeMinutes = await readMinuteBook();
  assert.ok(Object.keys(beforeMinutes).length >= 5);
  const firstSlider = rotationSliders.first();
  const editedPlayer = await firstSlider.getAttribute("aria-label");
  assert.ok(editedPlayer);
  assert.ok(beforeMinutes[editedPlayer] >= 2);
  await firstSlider.focus();
  await firstSlider.press("ArrowLeft");
  await page.waitForFunction(({ before, edited }) => {
    const target = [...document.querySelectorAll('.gm-rot__slider input[type="range"]:not([disabled])')]
      .find(el => el.getAttribute("aria-label") === edited);
    return Boolean(target && Number(target.value) === before[edited] - 2);
  }, { before: beforeMinutes, edited: editedPlayer });
  const afterMinutes = await readMinuteBook();
  assert.equal(Object.values(afterMinutes).reduce((sum, n) => sum + n, 0), 240,
    "the minute book cannot gain or lose minutes on an edit");
  assert.equal(afterMinutes[editedPlayer], beforeMinutes[editedPlayer] - 2,
    "the selected player's minutes move by one linked two-minute block");
  assert.ok(Object.entries(afterMinutes).some(([name, minutes]) =>
    name !== editedPlayer && minutes > (beforeMinutes[name] ?? 0)),
    "a teammate must receive the moved minutes");
  assert.match(await minuteBudget.innerText(), /240\s*\/\s*240/);
  await page.reload();
  await minuteBudget.waitFor();
  const savedMinutes = await readMinuteBook();
  assert.deepEqual(savedMinutes, afterMinutes, "linked minute changes survive reload");

  // Development should make one clear skill choice prominent, without
  // exposing a hard-coded final OVR. The focus persists after a page reload.
  await page.goto("http://127.0.0.1:3107/gm/development", { waitUntil: "domcontentloaded" });
  const development = page.getByTestId("development-path");
  await development.getByRole("heading", { name: "Shape a player" }).waitFor();
  const focusSelect = development.getByRole("combobox", { name: /Development focus for/ });
  await focusSelect.selectOption("defense");
  await page.reload();
  const focusReloaded = page.getByTestId("development-path").getByRole("combobox", { name: /Development focus for/ });
  assert.equal(await focusReloaded.inputValue(), "defense",
    "development focus must persist across reloads");
  assert.equal(await page.getByText("Potential ceiling", { exact: true }).count(), 0,
    "the development UI must not promise a fixed OVR destiny");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2),
    "the development screen must fit a narrow mobile viewport");
  await page.screenshot({ path: `${dir}/development-open-mobile.png`, fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 1440, height: 1000 });

  // The regular trade desk should work like a two-sided trade machine,
  // with a clear live response and optional details on a narrow viewport.
  await page.goto("http://127.0.0.1:3107/gm/trade", { waitUntil: "domcontentloaded" });
  const tradeMarket = page.getByTestId("trade-market");
  await tradeMarket.getByRole("heading", { name: "Around the league" }).waitFor();
  assert.ok(await tradeMarket.getByText(/days until the trade deadline/).count(),
    "live market should show the remaining trading window");
  const explore = tradeMarket.getByRole("button", { name: "Explore a deal", exact: true });
  if (await explore.count()) {
    await explore.first().click();
    assert.ok(await page.getByTestId("trade-partner-players").getByRole("checkbox", { checked: true }).count() >= 1,
      "a market lead should load the requested player into the trade builder");
    await page.getByRole("button", { name: "Clear", exact: true }).click();
  }
  const gmRead = page.getByTestId("trade-gm-response");
  await gmRead.getByRole("heading", { name: "Build a two-sided offer" }).waitFor();
  await page.getByTestId("trade-my-players").getByRole("checkbox").first().check();
  await page.getByTestId("trade-partner-players").getByRole("checkbox").first().check();
  assert.equal(await gmRead.getByRole("heading", { name: "Build a two-sided offer" }).count(), 0,
    "adding assets on both sides must update the live trade response");
  await page.getByRole("button", { name: "Find deals", exact: true }).click();
  await page.getByText(/legal packages? found|No CPU team is willing/).first().waitFor();
  assert.equal(await page.getByText("Check one player, on your club or theirs.", { exact: true }).count(), 0,
    "multi-sided selection must no longer be rejected by Trade Finder");
  await page.getByTestId("trade-my-players").getByRole("checkbox").nth(1).check();
  await page.getByRole("button", { name: "Find deals", exact: true }).click();
  await page.getByText(/legal packages? found|No CPU team is willing/).first().waitFor();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByRole("button", { name: "Find deals", exact: true }).click();
  await page.getByText(/legal packages? found|No CPU team is willing/).first().waitFor();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await gmRead.getByRole("heading", { name: "Build a two-sided offer" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Propose trade", exact: true }).isDisabled(), true);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2),
    "trade desk overflows the mobile viewport");
  await page.screenshot({ path: `${dir}/trade-desk-mobile.png`, fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: `${dir}/trade-desk-desktop.png`, fullPage: true, animations: "disabled" });

  await page.goto("http://127.0.0.1:3107/gm/franchise", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Development and roles", exact: true }).waitFor();
  await page.screenshot({ path: `${dir}/desktop.png`, fullPage: true });
  await page.getByRole("button", { name: "Settings and saves", exact: true }).click();
  await page.getByLabel("Enable player editing and custom draft classes").check();
  const playerId = await page.getByLabel("Player to edit", { exact: true }).inputValue();
  await page.getByLabel("Attribute to edit", { exact: true }).selectOption("threePoint");
  await page.getByLabel("New attribute rating", { exact: true }).fill("88");
  await page.getByRole("button", { name: "Apply rating", exact: true }).click();
  await page.getByText("Player updated. His abilities will apply in the next game.", { exact: true }).waitFor();
  const downloadPromise = page.waitForEvent("download", { timeout: 90000 });
  await page.getByRole("button", { name: "Export this franchise", exact: true }).click();
  const download = await downloadPromise.catch(error => {
    throw new Error("Franchise export did not start; browser errors: " + JSON.stringify(errors) + "; " + error.message);
  });
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
  await page.getByLabel("All desks", { exact: true }).click();
  await page.getByRole("link", { name: "Contracts and extensions", exact: true }).click();
  await page.getByRole("heading", { name: "Contracts and extensions", exact: true }).waitFor();
  const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: manifest.playerName, exact: true }) });
  await row.getByRole("link", { name: "Negotiate extension", exact: true }).click();
  await page.waitForURL("**/gm/contracts/offer/**");
  const extensionSlider = page.getByRole("slider", { name: "Annual salary offer", exact: true });
  assert.ok(Math.abs(Number(await extensionSlider.inputValue()) - manifest.ask) < .08, "extension salary should start at asking price");
  assert.ok(Number(await extensionSlider.getAttribute("max")) >= manifest.ask, "salary slider respects legal max");
  await page.getByRole("slider", { name: "Contract length", exact: true }).waitFor();
  const extensionInterestBefore = await page.getByRole("img", { name: /Offer interest:/ }).getAttribute("aria-label");
  const lengthSlider = page.getByRole("slider", { name: "Contract length", exact: true });
  if (Number(await lengthSlider.inputValue()) < Number(await lengthSlider.getAttribute("max"))) {
    await lengthSlider.focus();
    await lengthSlider.press("ArrowRight");
    const extensionInterestAfter = await page.getByRole("img", { name: /Offer interest:/ }).getAttribute("aria-label");
    assert.ok(Number(extensionInterestAfter?.match(/\d+/)?.[0] ?? 0) >
      Number(extensionInterestBefore?.match(/\d+/)?.[0] ?? 0),
      "adding a guaranteed year should improve extension interest");
    await lengthSlider.press("ArrowLeft");
  }
  await page.getByRole("button", { name: "Offer extension", exact: true }).click();
  const signing = page.getByTestId("gm-contract-signed");
  await signing.waitFor();
  assert.equal(await signing.locator(".gm-sign-confetti").count(), 66,
    "confirmed contract shows team-color confetti");
  assert.ok(await signing.getByLabel(manifest.playerName + " fictional signature").isVisible(),
    "signing card must draw the fictional player signature");
  await page.screenshot({ path: `${dir}/contract-signing-mobile.png`, animations: "disabled" });
  await signing.getByRole("button", { name: "Continue franchise" }).click();
  assert.equal(await signing.count(), 0);
  await page.getByRole("status").filter({ hasText: /signed 3 added years/ }).waitFor();
  await page.reload();
  await page.getByRole("link", { name: "Back to contracts" }).first().click();
  await page.getByText(/Extended: 3 added years/).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), "contracts desk overflows mobile");
  await page.screenshot({ path: `${dir}/contracts-mobile.png`, fullPage: true, animations: "disabled" });

  // The FA desk must open a standalone player negotiation with a legal,
  // interactive salary ceiling. A verbal commitment persists and signs only
  // after the moratorium, rather than signing immediately on the offer click.
  const faManifest = JSON.parse(readFileSync(`${dir}/journey-fa-manifest.json`, "utf8"));
  await importJourney("fa");
  await page.goto("http://127.0.0.1:3107/gm/free-agency", { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "Review terms for " + faManifest.playerName, exact: true }).click();
  await page.waitForURL("**/gm/free-agency/offer/**");
  const faSlider = page.getByRole("slider", { name: "Annual salary offer", exact: true });
  assert.ok(Number(await faSlider.getAttribute("max")) <= faManifest.maxSalaryM + 0.01,
    "free-agent salary slider must respect the contract evaluator's legal maximum");
  assert.ok(Number(await faSlider.getAttribute("max")) + 0.05 >= faManifest.ask,
    "fixture club must be able to meet the agent asking price");
  assert.ok(Number(await faSlider.inputValue()) <= Number(await faSlider.getAttribute("max")) + .001);
  await faSlider.focus();
  await faSlider.press("End");
  await page.getByRole("button", { name: "Request verbal agreement", exact: true }).click();
  await page.getByRole("status").filter({ hasText: /Verbal agreement with/ }).waitFor();
  assert.equal(await page.getByTestId("gm-contract-signed").count(), 0,
    "a verbal agreement must not trigger signed-contract celebrations");
  await page.reload();
  await page.getByText(/A verbal agreement is on record with/).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2),
    "free-agent negotiation overflows mobile");
  await page.screenshot({ path: `${dir}/free-agency-offer-mobile.png`, fullPage: true, animations: "disabled" });
  await page.goto("http://127.0.0.1:3107/gm/free-agency", { waitUntil: "domcontentloaded" });
  let witnessedFinalSigning = false;
  for (let day = 0; day < 3; day++) {
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    const ceremony = page.getByTestId("gm-contract-signed");
    await ceremony.waitFor({ timeout: 1600 }).catch(() => undefined);
    if (await ceremony.count()) {
      witnessedFinalSigning = true;
      assert.ok(await ceremony.getByLabel(faManifest.playerName + " fictional signature").isVisible(),
        "moratorium commitment only celebrates once it becomes an actual contract");
      await page.screenshot({ path: `${dir}/free-agency-signing-mobile.png`, animations: "disabled" });
      await ceremony.getByRole("button", { name: "Continue franchise" }).click();
    }
  }
  assert.ok(witnessedFinalSigning, "signed moratorium agreement triggers team-color signing celebration");
  await page.goto("http://127.0.0.1:3107/gm/franchise", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Settings and saves", exact: true }).click();
  const faDownloadPromise = page.waitForEvent("download", { timeout: 90000 });
  await page.getByRole("button", { name: "Export this franchise", exact: true }).click();
  const faDownload = await faDownloadPromise;
  const faExport = JSON.parse(readFileSync(await faDownload.path(), "utf8"));
  const signedFa = faExport.league.players.find(p => p.id === faManifest.playerId);
  assert.equal(signedFa?.teamId, "bos", "verbal agreement must become a signed BOS contract in the open window");
  assert.ok(signedFa.contract?.yearsRemaining >= 1, "accepted FA deal must persist a real contract");

  // NBA exception: an outside restricted offer sheet can be filed during
  // the moratorium, triggering the rights holder's two-day matching window.
  // Close the export drawer before the next save import.
  await page.getByRole("button", { name: "Settings and saves", exact: true }).click();
  await importJourney("rfa");
  await page.goto("http://127.0.0.1:3107/gm/free-agency/offer/" + encodeURIComponent(faManifest.playerId),
    { waitUntil: "domcontentloaded" });
  const sheetButton = page.getByRole("button", { name: "Submit offer sheet", exact: true });
  assert.equal(await sheetButton.isEnabled(), true,
    "a tendered RFA must be allowed to sign a legal offer sheet during the moratorium");
  await sheetButton.click();
  await page.getByRole("status").filter({ hasText: /Offer sheet filed/ }).waitFor();
  await page.reload();
  assert.equal(await page.getByRole("button", { name: "Submit offer sheet", exact: true }).isDisabled(),
    true, "no duplicate sheet should be filed while the rights holder considers matching");
  await page.getByText(/An offer sheet is already awaiting a match decision/).first().waitFor();
  await page.screenshot({ path: `${dir}/restricted-offer-sheet-mobile.png`, fullPage: true, animations: "disabled" });
  await importJourney("review");
  await page.getByRole("link", { name: "Season hub", exact: true }).click();
  await page.getByRole("heading", { name: "Season review", exact: true }).waitFor();
  await page.getByRole("button", { name: "Continue to staff review", exact: true }).click();
  await page.getByRole("heading", { name: "Staff review", exact: true }).waitFor();
  await page.getByRole("button", { name: "Retain staff and reveal lottery", exact: true }).click();
  await page.getByRole("heading", { name: "Draft lottery", exact: true }).waitFor();
  // Mount the Canvas under normal-motion conditions, not after a reduced-
  // motion mount that has already captured the media preference.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.reload();
  await page.getByRole("heading", { name: "Draft lottery", exact: true }).waitFor();
  const ceremony = page.getByTestId("gm-lottery-ceremony");
  await ceremony.waitFor();
  assert.equal(await page.getByTestId("lottery-revealed-order").count(), 0,
    "lottery must not spoil the pick order before the reveal");
  // Test actual animated physics rather than only the reduced-motion fast
  // path: two rendered frames must differ, and the FIRST winner must exit
  // through the hole before the browser reveals its number.
  const chamber = page.getByTestId("lottery-hole-chamber");
  await chamber.waitFor();
  const firstFrame = await chamber.evaluate(canvas => canvas.toDataURL());
  await page.getByTestId("lottery-start").click();
  await page.waitForTimeout(450);
  assert.ok(await page.getByText("Balls in motion", { exact: true }).isVisible(),
    "normal-motion chamber must still be mixing before the 72-frame gate opens");
  const movingFrame = await chamber.evaluate(canvas => canvas.toDataURL());
  assert.notEqual(firstFrame, movingFrame, "the lottery balls must visibly move during the draw");
  await page.getByText(/Valid ball extracted|Invalid draw|Combination in progress/)
    .waitFor({ timeout: 70000 });
  assert.equal(await page.getByRole("alert").filter({hasText: /physical extraction does not match/}).count(), 0,
    "normal-motion canvas physics must reproduce the engine's extracted ball");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByTestId("lottery-skip").click();
  assert.ok((await page.getByTestId("lottery-revealed-order").locator("li").count()) >= 14);
  await page.reload();
  await page.getByText("The lottery is official.").waitFor();
  await page.getByRole("button", { name: "Continue to combine and workouts", exact: true }).click();
  await page.getByRole("button", { name: "Run draft combine", exact: true }).click();
  await page.getByTestId("gm-combine-results").waitFor();
  assert.ok((await page.getByTestId("gm-combine-results").locator("tbody tr").count()) >= 3,
    "combine must reveal ranked athlete measurements instead of silently flipping a flag");
  await page.reload();
  await page.getByTestId("gm-combine-results").waitFor();
  await page.getByRole("button", { name: "Combine complete", exact: true }).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), "season hub overflows mobile");
  await page.screenshot({ path: `${dir}/season-hub-mobile.png`, fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: `${dir}/season-hub-desktop.png`, fullPage: true, animations: "disabled" });
  await importJourney("camp");
  await page.getByRole("link", { name: "Season hub", exact: true }).click();
  await page.getByRole("heading", { name: "Focused camps", exact: true }).waitFor();
  await page.locator("summary").filter({ hasText: "Choose players and skills" }).click();
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
  console.log("Franchise browser checks passed: import/export, commissioner edits, extensions, free-agent offers, RFA gates, signing, season handoffs, reloads and mobile layout.");
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
