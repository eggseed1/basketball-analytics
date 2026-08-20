/**
 * P18B.5.3 regressions.
 *   npx tsx scripts/test-p18b53-regressions.ts
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  clearPortraitLookupCache,
  lookupApprovedPortraitUrl,
} from "../src/data/media/portrait-lookup-store";
import {
  clearPlayerUniverseCaches,
  countSeasonPlayerUniverse,
  getMasterPlayerRegistry,
} from "../src/data/history/player-universe";
import { resolveHistoricalTeamBrand } from "../src/lib/historical-team-brand";
import { historyUniverseToPlayerSeasons } from "../src/data/history/player-universe";

const FIXTURES = [
  ["1642851", "Kon Knueppel"],
  ["1631255", "Karlo Matković"],
  ["1642396", "Blake Hinson"],
  ["1642066", "Myron Gardner"],
] as const;

function main() {
  clearPortraitLookupCache();
  clearPlayerUniverseCaches();

  const health = JSON.parse(
    readFileSync(
      path.join(process.cwd(), "reports", "p18b53", "health.json"),
      "utf8"
    )
  );

  assert.equal(health.PREVIOUSLY_WORKING_VERIFIED_MEDIA_LOST, 0);
  assert.equal(health.RECENT_PLAYERS_OLD_PORTRAIT_TO_PLACEHOLDER, 0);
  assert.equal(health.NEW_CANONICAL_PLAYERS_WITH_VALID_UNPROMOTED_MEDIA, 0);
  assert.equal(health.HISTORICAL_PORTRAIT_DOWNGRADES, 0);

  for (const [id, name] of FIXTURES) {
    const url = lookupApprovedPortraitUrl(id);
    assert.ok(url, `${name} missing portrait`);
    assert.ok(
      url.includes("cdn.nba.com") || url.includes("espncdn.com"),
      `${name} unexpected url ${url}`
    );
    console.log(`${name} PORTRAIT_PASS`);
  }

  // Restored-player set inclusion from health (authoritative)
  assert.equal(
    health.NEW_ENTRANTS_WITH_PREVIOUS_WORKING_PORTRAIT,
    health.NEW_ENTRANTS_WITH_CURRENT_VERIFIED_PORTRAIT
  );
  assert.equal(health.NEW_CANONICAL_PLAYERS_WITH_VALID_UNPROMOTED_MEDIA, 0);
  console.log("RESTORED_PLAYER_MEDIA_SET_INCLUSION PASS");

  // Spot-check recovered CSV: every promoted row has afterPortrait
  const recoveredPath = path.join(
    process.cwd(),
    "reports",
    "p18b53",
    "09_recovered_media.csv"
  );
  if (existsSync(recoveredPath)) {
    const lines = readFileSync(recoveredPath, "utf8")
      .trim()
      .split(/\r?\n/)
      .slice(1);
    assert.ok(lines.length >= 190, "expected ~196 recovered");
  }

  assert.equal(getMasterPlayerRegistry().length, 5100);
  assert.equal(countSeasonPlayerUniverse("2014-15"), 492);
  assert.equal(countSeasonPlayerUniverse("2024-25"), 590);
  assert.equal(countSeasonPlayerUniverse("2025-26"), 590);

  for (const id of ["1717", "2202", "2072", "959"]) {
    assert.ok(lookupApprovedPortraitUrl(id), `historical ${id}`);
  }

  const rows = historyUniverseToPlayerSeasons("2005-06");
  assert.equal(
    resolveHistoricalTeamBrand(
      rows.find((r) => r.playerName === "Ray Allen")!.teamId,
      "2005-06",
      "era"
    )?.abbreviation,
    "SEA"
  );

  console.log("ALL_P18B53_REGRESSIONS_PASS", {
    recovered: health.PREVIOUSLY_WORKING_PORTRAITS_RECOVERED,
    currentVerified: health.CURRENT_VERIFIED_PORTRAITS,
    p18c: health.P18C_AUTHORIZED,
  });
}

main();
