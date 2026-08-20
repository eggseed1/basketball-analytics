/**
 * Regression: player directory universe ≠ DRBL / sample subset.
 *   npx tsx scripts/test-p18b-player-universe.ts
 */
import assert from "node:assert/strict";

import {
  countSeasonPlayerUniverse,
  getSeasonPlayerUniverse,
  hasPlayerUniverseSeason,
  leftJoinPlayerUniverse,
  searchMasterPlayers,
} from "../src/data/history/player-universe";
import { getFilteredPlayerSeasonsDetailed } from "../src/data/queries/players";
import { withPlayerSeasonDefaults } from "../src/data/transformers/player-season-defaults";

async function main() {
  assert.equal(hasPlayerUniverseSeason("2014-15"), true);

  const sourceCount = countSeasonPlayerUniverse("2014-15");
  assert.ok(
    sourceCount >= 200,
    `2014-15 universe too small: ${sourceCount}`
  );

  const { rows, error } = await getFilteredPlayerSeasonsDetailed({
    season: "2014-15",
  });
  assert.equal(error, null);
  assert.equal(
    rows.length,
    sourceCount,
    `directory ${rows.length} != source ${sourceCount}`
  );

  // Simulate tiny DRBL/sample overlay — universe must not shrink.
  const overlay = rows.slice(0, 14).map((r) =>
    withPlayerSeasonDefaults({
      playerId: r.playerId,
      playerName: r.playerName,
      teamId: r.teamId,
      teamName: r.teamName,
      season: r.season,
      drbl100: 110,
      r1Points: 1,
      r1WinEquivalents: 0.1,
    })
  );
  const joined = leftJoinPlayerUniverse(rows, overlay);
  assert.equal(joined.length, rows.length);

  // Pre-2020 player searchable in master registry.
  const uni = getSeasonPlayerUniverse("2005-06");
  assert.ok(uni.length >= 200);
  const sample = uni[0]!;
  const hits = searchMasterPlayers(sample.playerName.slice(0, 4), {
    limit: 20,
  });
  assert.ok(hits.length > 0, "master search empty");

  // No DRBL required for presence.
  for (const r of uni.slice(0, 50)) {
    assert.equal(r.drblAvailable, false);
    assert.equal(r.drbl100, null);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        "2014-15": { source: sourceCount, directory: rows.length },
        "2005-06": uni.length,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
