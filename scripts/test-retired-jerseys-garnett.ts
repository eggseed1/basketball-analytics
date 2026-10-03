/**
 * Retired jersey resolution smoke test (Garnett legacy ids, name routes,
 * shared names, honorary banners).
 * Run: npx tsx --conditions=react-server scripts/test-retired-jerseys-garnett.ts
 */
import assert from "node:assert/strict";

import {
  getRetiredJerseysByName,
  retiredBannerCount,
} from "../src/content/awards/retired-jerseys";
import { getPlayerRetiredJerseys } from "../src/data/queries/player-retired-jerseys";
import {
  LEGEND_BREF_TO_NBA,
  remapLegendNbaIdToBref,
  resolveLegacyNbaPersonId,
} from "../src/data/runtime/legend-nba-to-bref";

function resolvePublicPlayerId(raw: string): string {
  let id = raw;
  if (/^\d+$/.test(id)) {
    id = resolveLegacyNbaPersonId(id) ?? id;
  }
  return remapLegendNbaIdToBref(id) ?? id;
}

async function banners(rawId: string, pageName?: string) {
  const rows = await getPlayerRetiredJerseys(resolvePublicPlayerId(rawId), pageName);
  return rows.map((r) => `${r.teamKey}#${r.number}`).sort();
}

async function main() {
  assert.equal(LEGEND_BREF_TO_NBA["garneke01"], "708");

  // Minnesota has announced #21 but not raised it yet, so Boston only.
  for (const rawId of ["708", "261", "1563", "bref:garneke01"]) {
    assert.deepEqual(await banners(rawId), ["bos#5"], `${rawId} → Garnett`);
  }

  // ESPN athlete routes resolve through identity.
  assert.deepEqual(await banners("1977"), ["mia#1"], "Chris Bosh");
  assert.deepEqual(await banners("63"), ["det#1"], "Chauncey Billups");
  assert.deepEqual(await banners("136"), ["bkn#15", "tor#15"], "Vince Carter");

  // BRef name routes carry no NBA id; unique names still match.
  assert.deepEqual(await banners("bref:zach randolph"), ["mem#50"]);
  assert.deepEqual(await banners("bref:udonis haslem"), ["mia#40"]);
  assert.deepEqual(await banners("bref:nick collison"), ["okc#4"]);

  // Shared names never match by name: these routes are Ewing Jr. and the 2000s Bobby Jones.
  assert.deepEqual(await banners("bref:patrick ewing"), []);
  assert.deepEqual(await banners("bref:bobby jones"), []);
  assert.deepEqual(getRetiredJerseysByName("Patrick Ewing"), []);
  assert.deepEqual(await banners("bref:ewingpa01"), ["nyk#33"]);

  // Not retired anywhere.
  assert.deepEqual(await banners("bref:paytoga01"), [], "Gary Payton");

  const jordan = await getPlayerRetiredJerseys("893");
  assert.ok(jordan.some((r) => r.teamKey === "mia" && r.honorary), "MJ Miami honorary");

  assert.equal(retiredBannerCount("lac"), 0);
  assert.ok((retiredBannerCount("bos") ?? 0) >= 20);

  console.log("test-retired-jerseys-garnett: ok");
}

main();
