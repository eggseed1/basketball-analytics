/**
 * P18B.5.1 regressions — monotonic coverage + dual-key identity.
 *   npx tsx scripts/test-p18b51-regressions.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  BLOCKED_NBA_LATEST_PLAYER_IDS,
  resolvePlayerPortraitCandidates,
} from "../src/lib/player-media-resolve";
import {
  clearPortraitLookupCache,
  lookupApprovedPortraitUrl,
} from "../src/data/media/portrait-lookup-store";
import { getPlayerMedia } from "../src/data/media/get-player-media";
import { resolveHistoricalTeamBrand } from "../src/lib/historical-team-brand";
import {
  countSeasonPlayerUniverse,
  historyUniverseToPlayerSeasons,
} from "../src/data/history/player-universe";

function main() {
  clearPortraitLookupCache();
  const health = JSON.parse(
    readFileSync(
      path.join(process.cwd(), "reports", "p18b51", "health.json"),
      "utf8"
    )
  );

  assert.equal(health.UNEXPLAINED_MEDIA_DOWNGRADES, 0);
  assert.equal(health.V1_VALID_DOWNGRADED_TO_PLACEHOLDER, 0);
  assert.ok(health.FINAL_VERIFIED_PORTRAITS >= 1863);

  // Set inclusion sample
  assert.ok(lookupApprovedPortraitUrl("1717"));
  assert.ok(lookupApprovedPortraitUrl("2202"));
  assert.ok(lookupApprovedPortraitUrl("2072"));
  assert.ok(lookupApprovedPortraitUrl("959"));

  // Dual-key: ESPN route for Jokic
  const jokicEspn = lookupApprovedPortraitUrl("3112335");
  const jokicNba = lookupApprovedPortraitUrl("203999");
  assert.ok(jokicNba, "Jokic NBA portrait");
  assert.ok(jokicEspn, "Jokic ESPN route key restored");
  assert.equal(jokicEspn, jokicNba);

  // registryOnly without approvedUrl still finds dual-key
  const c = resolvePlayerPortraitCandidates({
    playerId: "3112335",
    registryOnly: true,
  });
  assert.ok(c[0]?.includes("http"), "registryOnly dual-key");

  // Coach NBA blocked but ESPN/registry player portrait remains
  assert.ok(BLOCKED_NBA_LATEST_PLAYER_IDS.has("959"));
  assert.ok(getPlayerMedia(["959"]).get("959")?.sourceUrl);

  // Resolver priority: registry before raw CDN
  const both = resolvePlayerPortraitCandidates({
    nbaId: "1717",
    espnId: "1018",
  });
  assert.ok(both[0]);

  const rows = historyUniverseToPlayerSeasons("2005-06");
  const ray = rows.find((r) => r.playerName === "Ray Allen");
  const vince = rows.find((r) => r.playerName === "Vince Carter");
  assert.equal(
    resolveHistoricalTeamBrand(ray!.teamId, "2005-06", "era")?.abbreviation,
    "SEA"
  );
  assert.equal(
    resolveHistoricalTeamBrand(vince!.teamId, "2005-06", "era")?.abbreviation,
    "NJN"
  );
  assert.equal(countSeasonPlayerUniverse("2014-15"), 492);

  console.log("ALL_P18B51_REGRESSIONS_PASS", {
    verified: health.FINAL_VERIFIED_PORTRAITS,
    dualKeys: health.DUAL_KEYS_ADDED,
    p18c: health.P18C_AUTHORIZED,
  });
}

main();
