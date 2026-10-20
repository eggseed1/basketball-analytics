/**
 * League OVR board should track consensus stars, not thin-sample flukes
 * or rate-only role bigs.
 * Run: npx tsx scripts/test-gm-overalls.ts
 */
import assert from "node:assert/strict";

import { playerSheet, SHEET_VERSION } from "../src/gm/engine/attributes";
import { createRealSeasonLeague } from "../src/gm/seed/create-real-season-league";

async function main() {
  const { league } = await createRealSeasonLeague({ userTeamId: "bos" });

  assert.equal(SHEET_VERSION, 6);

  const ranked = league.players
    .filter((p) => p.teamId)
    .map((p) => ({
      name: p.name,
      ovr: playerSheet(p).overall,
      impact: p.ratings.impact,
    }))
    .sort((a, b) => b.ovr - a.ovr || b.impact - a.impact);

  const top10 = ranked.slice(0, 10).map((r) => r.name);
  const top15 = new Set(ranked.slice(0, 15).map((r) => r.name));

  for (const name of [
    "Nikola Jokic",
    "Shai Gilgeous-Alexander",
    "Giannis Antetokounmpo",
    "Luka Doncic",
    "Victor Wembanyama",
  ]) {
    assert.ok(
      top15.has(name),
      `${name} should be top 15, got: ${top10.join(", ")}`
    );
  }

  assert.equal(ranked[0]?.name, "Nikola Jokic");
  assert.ok((ranked[0]?.ovr ?? 0) >= 90, `Jokic ovr ${ranked[0]?.ovr}`);

  const byName = new Map(ranked.map((r) => [r.name, r]));
  const curry = byName.get("Stephen Curry");
  assert.ok(curry, "Curry on roster");
  assert.ok(
    (curry?.ovr ?? 0) >= 82,
    `Curry ovr ${curry?.ovr} should clear 82 with 25+ ppg`
  );
  const lebron = byName.get("LeBron James");
  assert.ok(lebron, "LeBron on roster");
  assert.ok(
    (lebron?.ovr ?? 0) >= 80,
    `LeBron ovr ${lebron?.ovr} should clear 80`
  );

  const djg = ranked.find((r) => r.name === "David Jones Garcia");
  if (djg) {
    assert.ok(djg.ovr <= 78, `thin-sample fluke ovr ${djg.ovr}`);
    assert.ok(djg.impact < 2, `thin-sample impact ${djg.impact}`);
  }

  const mitch = ranked.findIndex((r) => r.name === "Mitchell Robinson");
  assert.ok(
    mitch < 0 || mitch >= 15,
    `Mitch Robinson should not top-15 (rank ${mitch + 1})`
  );

  console.log("overalls ok", {
    top10,
    jokic: ranked[0]?.ovr,
    curry: curry?.ovr,
    lebron: lebron?.ovr,
    sheet: SHEET_VERSION,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
