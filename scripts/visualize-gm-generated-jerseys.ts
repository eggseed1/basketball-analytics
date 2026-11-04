/**
 * Render ACTUAL React SVG portraits into a browser QA contact sheet.
 * Archived with the Franchise Lab browser screenshot artifacts. No images,
 * networking, screenshot-service fees, or simulation changes.
 */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { GmGeneratedPortrait } from "../src/gm/ui/gm-generated-portrait";
import { portraitSeedForId } from "../src/gm/lib/generated-player-identity";
import type { GmPlayer } from "../src/gm/types";

const players = [
  { id: "prospect-2038-8-studio", name: "Malik Adeyemi" },
  { id: "prospect-2038-15-studio", name: "Aleksandar Petrović" },
  { id: "prospect-2038-24-studio", name: "Diego Navarro" },
  { id: "prospect-2038-33-studio", name: "Marcus Haynes" },
  { id: "prospect-2038-42-studio", name: "Daniel Kim" },
];
const teams: Array<{ id: string | null; label: string }> = [
  { id: "bos", label: "Boston" },
  { id: "lal", label: "Lakers" },
  { id: "nyk", label: "New York" },
  { id: "bkn", label: "Brooklyn" },
  { id: null, label: "Free agent" },
];
function playerFor(id: string, name: string, teamId: string | null): GmPlayer {
  return {
    id, name, teamId, age: 24,
    identity: {
      version: 1, countryCode: "US", hometown: "Chicago, IL",
      portraitSeed: portraitSeedForId(id), temperament: "Team-first",
      interest: "Film room regular",
    },
  } as GmPlayer;
}
function markup(p: GmPlayer, size: "xs" | "sm" | "md" | "lg" | "xl" = "xl"): string {
  return renderToStaticMarkup(createElement(GmGeneratedPortrait, {
    player: p, name: p.name, size,
  }));
}
const header = teams.map(t => `<div class="column-label">${t.label}</div>`).join("");
const cards = players.flatMap(p => teams.map(team => {
  const identity = playerFor(p.id, p.name, team.id);
  return `<div class="portrait-card">${markup(identity)}<strong>${p.name}</strong><span>${team.label}</span></div>`;
})).join("");
const scaled = (["xs", "sm", "md", "lg", "xl"] as const).map(size => {
  const player = playerFor(players[0]!.id, players[0]!.name, "bos");
  return `<div class="scale-cell">${markup(player, size)}<span>${size.toUpperCase()}</span></div>`;
}).join("");
const html = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"/><title>Franchise Lab portraits</title>
<style>
  * { box-sizing:border-box } body { margin:0; padding:36px 42px 46px;
    font-family:Inter,Arial,sans-serif; background:#0d121b; color:#f8fafc; }
  h1 { margin:0 0 6px; font-size:28px; letter-spacing:-.03em; }
  .sub { margin:0 0 28px; color:#9ca3af; font-size:14px; }
  .grid { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:14px; }
  .column-label { color:#9ca3af; font-size:12px; font-weight:700;
    text-transform:uppercase; letter-spacing:.11em; text-align:center; margin-bottom:2px; }
  .portrait-card { min-height:205px; border:1px solid #303949;
    background:#181f2c; border-radius:16px; display:flex;
    flex-direction:column; align-items:center; justify-content:center; padding:14px 4px; gap:5px; }
  .portrait-card strong { font-size:13px; font-weight:700; margin-top:6px; }
  .portrait-card>span:last-child { font-size:11px; color:#94a3b8; }
  [data-generated-portrait] { display:inline-flex; align-items:center; justify-content:center;
    position:relative; flex-shrink:0; overflow:hidden; border-radius:999px; }
  [data-avatar="xs"] { width:28px;height:28px; }
  [data-avatar="sm"] { width:36px;height:36px; }
  [data-avatar="md"] { width:56px;height:56px; }
  [data-avatar="lg"] { width:96px;height:96px; }
  [data-avatar="xl"] { width:140px;height:140px; }
  [data-generated-portrait] svg { width:100%;height:100%; }
  h2 { font-size:17px; margin:28px 0 12px; }
  .scales { display:flex; align-items:center; gap:22px; border:1px solid #303949;
    background:#181f2c; border-radius:16px; padding:18px 30px; }
  .scale-cell { display:flex; flex-direction:column; align-items:center; justify-content:flex-end;
    min-height:160px; gap:12px; color:#94a3b8; font-size:11px; }
</style></head><body>
  <h1>Franchise Lab · portrait studio</h1>
  <p class="sub">Same face across teams. New club colors, chest lettering, shoulder trim; neutral kit in free agency.</p>
  <div class="grid">${header}${cards}</div>
  <h2>Roster list to player profile · size check</h2>
  <div class="scales">${scaled}</div>
</body></html>`;

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1250, height: 1280 }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load" });
    assert.equal(await page.locator(".portrait-card [data-generated-portrait]").count(), 25);
    for (const team of teams) {
      const key = team.id ?? "free-agent";
      assert.equal(await page.locator(`[data-jersey-team="${key}"]`).count(), 5 + (key === "bos" ? 5 : 0));
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2),
      "visual gallery must not overflow viewport");
    mkdirSync("/tmp/franchise-qa", { recursive: true });
    await page.screenshot({
      path: "/tmp/franchise-qa/generated-jersey-portrait-review.png",
      fullPage: true,
      animations: "disabled",
    });
    console.log("Generated portrait visual QA: 25 actual component renders, all jerseys, and five display sizes passed");
  } finally {
    await browser.close();
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
