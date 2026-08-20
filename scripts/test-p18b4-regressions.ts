/**
 * P18B.4 permanent regressions.
 *   npx tsx scripts/test-p18b4-regressions.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  BLOCKED_NBA_LATEST_PLAYER_IDS,
  resolvePlayerPortraitCandidates,
} from "../src/lib/player-media-resolve";
import { getPlayerMedia } from "../src/data/media/get-player-media";
import { resolveHistoricalTeamBrand } from "../src/lib/historical-team-brand";
import {
  countSeasonPlayerUniverse,
  historyUniverseToPlayerSeasons,
} from "../src/data/history/player-universe";

const LOOKUP = path.join(
  process.cwd(),
  "data",
  "drbl",
  "player-media",
  "drbl-player-media-v1",
  "portrait-lookup.json"
);

function main() {
  assert.ok(existsSync(LOOKUP), "portrait-lookup.json missing");
  const lookup = JSON.parse(readFileSync(LOOKUP, "utf8")) as {
    portraits: Record<string, string>;
    count: number;
  };
  assert.ok(lookup.count > 100, "coverage not substantially improved");

  // Dirk
  assert.ok(lookup.portraits["1717"]?.includes("/1717."));
  assert.equal(
    resolvePlayerPortraitCandidates({
      playerId: "1717",
      approvedUrl: lookup.portraits["1717"],
      registryOnly: true,
    })[0]?.includes("/1717."),
    true
  );
  console.log("DIRK_NOWITZKI PASS");

  // Richardson / Redd — never serve NBA silhouette CDN as verified.
  // P18B.5 may promote exact ESPN athlete headshots; empty remains SAFE_FALLBACK.
  const jr = lookup.portraits["2202"];
  const redd = lookup.portraits["2072"];
  if (jr) {
    assert.ok(jr.includes("espncdn.com"), "JR must not use NBA CDN placeholder");
  }
  if (redd) {
    assert.ok(redd.includes("espncdn.com"), "Redd must not use NBA CDN placeholder");
  }
  console.log(
    jr ? "JASON_RICHARDSON PASS_ESPN" : "JASON_RICHARDSON SAFE_FALLBACK"
  );
  console.log(
    redd ? "MICHAEL_REDD PASS_ESPN" : "MICHAEL_REDD SAFE_FALLBACK"
  );

  // Nash coach blocked on NBA latest; registry may still serve ESPN player portrait
  assert.ok(BLOCKED_NBA_LATEST_PLAYER_IDS.has("959"));
  const nash = lookup.portraits["959"];
  if (nash) {
    assert.ok(
      nash.includes("espncdn.com"),
      "Nash must not use NBA coach latest"
    );
  }
  console.log(nash ? "STEVE_NASH PASS_ESPN" : "STEVE_NASH SAFE_FALLBACK");

  // registryOnly with null approvedUrl should not invent CDN guesses
  assert.deepEqual(
    resolvePlayerPortraitCandidates({
      playerId: "959",
      nbaId: "959",
      role: "PLAYER",
      registryOnly: true,
      approvedUrl: null,
    }).filter((u) => u.includes("cdn.nba.com")),
    []
  );

  // Temporal teams
  const rows = historyUniverseToPlayerSeasons("2005-06");
  const ray = rows.find((r) => r.playerName === "Ray Allen");
  const vince = rows.find((r) => r.playerName === "Vince Carter");
  assert.ok(ray);
  assert.ok(vince);
  const rayBrand = resolveHistoricalTeamBrand(ray!.teamId, "2005-06", "era");
  const vinceBrand = resolveHistoricalTeamBrand(vince!.teamId, "2005-06", "era");
  assert.equal(rayBrand?.abbreviation, "SEA");
  assert.equal(vinceBrand?.abbreviation, "NJN");
  assert.notEqual(rayBrand?.source, "current");
  assert.notEqual(vinceBrand?.source, "current");
  console.log("RAY_ALLEN_2005_06 SEA");
  console.log("VINCE_CARTER_2005_06 NJN");

  assert.equal(countSeasonPlayerUniverse("2014-15"), 492);
  assert.equal(countSeasonPlayerUniverse("2005-06"), 458);

  const media = getPlayerMedia(["1717", "2202", "959"]);
  assert.equal(media.get("1717")?.state, "VERIFIED_PLAYER_GENERIC");
  if (jr) {
    assert.equal(media.get("2202")?.state, "VERIFIED_PLAYER_GENERIC");
  } else {
    assert.equal(media.get("2202")?.state, "SAFE_PLACEHOLDER");
  }
  if (nash) {
    assert.equal(media.get("959")?.state, "VERIFIED_PLAYER_GENERIC");
  } else {
    assert.equal(media.get("959")?.state, "SAFE_PLACEHOLDER");
  }

  console.log("ALL_P18B4_REGRESSIONS_PASS", {
    portraits: lookup.count,
  });
}

main();
