/**
 * P18B.5 permanent regressions.
 *   npx tsx scripts/test-p18b5-regressions.ts
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
  getMasterPlayerRegistry,
  historyUniverseToPlayerSeasons,
} from "../src/data/history/player-universe";

const LOOKUP_V2 = path.join(
  process.cwd(),
  "data",
  "drbl",
  "player-media",
  "drbl-player-media-v2",
  "portrait-lookup.json"
);
const LOOKUP_V1 = path.join(
  process.cwd(),
  "data",
  "drbl",
  "player-media",
  "drbl-player-media-v1",
  "portrait-lookup.json"
);

function loadLookup() {
  const p = existsSync(LOOKUP_V2) ? LOOKUP_V2 : LOOKUP_V1;
  assert.ok(existsSync(p), "portrait-lookup.json missing");
  return JSON.parse(readFileSync(p, "utf8")) as {
    portraits: Record<string, string>;
    count: number;
  };
}

function main() {
  const lookup = loadLookup();
  assert.ok(
    (lookup as { canonicalVerifiedCount?: number }).canonicalVerifiedCount
      ?? Object.keys(lookup.portraits).filter((k) => !k.startsWith("espn:")).length
      >= 1590,
    "coverage regressed below P18B.4"
  );

  const master = getMasterPlayerRegistry();
  assert.equal(master.length, 4895);

  // Dirk — verified portrait retained (NBA or dual-key equivalent)
  assert.ok(lookup.portraits["1717"]);
  assert.equal(
    resolvePlayerPortraitCandidates({
      playerId: "1717",
      approvedUrl: lookup.portraits["1717"],
      registryOnly: true,
    })[0],
    lookup.portraits["1717"]
  );
  console.log("DIRK_NOWITZKI PASS");

  // Targets: ESPN secondary when NBA was placeholder
  for (const [id, name, espn] of [
    ["2202", "Jason Richardson", "1018"],
    ["2072", "Michael Redd", "692"],
    ["959", "Steve Nash", "592"],
  ] as const) {
    const url = lookup.portraits[id];
    if (url) {
      assert.ok(
        url.includes(`espncdn.com`) && url.includes(`/${espn}.png`),
        `${name} must use exact ESPN id ${espn}`
      );
      assert.equal(
        getPlayerMedia([id]).get(id)?.state,
        "VERIFIED_PLAYER_GENERIC"
      );
      console.log(`${name.toUpperCase().replace(/ /g, "_")} PASS`);
    } else {
      console.log(`${name.toUpperCase().replace(/ /g, "_")} SAFE_FALLBACK`);
    }
  }

  // Nash: NBA latest remains coach-quarantined; registry may serve ESPN player portrait
  assert.ok(BLOCKED_NBA_LATEST_PLAYER_IDS.has("959"));
  const nashCandidates = resolvePlayerPortraitCandidates({
    playerId: "959",
    nbaId: "959",
    role: "PLAYER",
    registryOnly: true,
    approvedUrl: null,
  });
  assert.ok(
    nashCandidates.every((u) => !u.includes("cdn.nba.com/headshots")),
    "Nash must not use NBA CDN latest"
  );
  if (lookup.portraits["959"]) {
    assert.ok(nashCandidates[0]?.includes("espncdn.com"));
  }

  // Temporal teams (frozen P18B.4)
  const rows = historyUniverseToPlayerSeasons("2005-06");
  const ray = rows.find((r) => r.playerName === "Ray Allen");
  const vince = rows.find((r) => r.playerName === "Vince Carter");
  assert.ok(ray && vince);
  assert.equal(
    resolveHistoricalTeamBrand(ray!.teamId, "2005-06", "era")?.abbreviation,
    "SEA"
  );
  assert.equal(
    resolveHistoricalTeamBrand(vince!.teamId, "2005-06", "era")?.abbreviation,
    "NJN"
  );
  console.log("RAY_ALLEN_2005_06 SEA");
  console.log("VINCE_CARTER_2005_06 NJN");

  assert.equal(countSeasonPlayerUniverse("2014-15"), 492);
  assert.equal(countSeasonPlayerUniverse("2005-06"), 458);

  console.log("ALL_P18B5_REGRESSIONS_PASS", {
    portraits: lookup.count,
    verifiedShare: Number((lookup.count / 4895).toFixed(4)),
  });
}

main();
