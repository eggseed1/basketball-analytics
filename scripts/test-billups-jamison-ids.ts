/**
 * Billups vs Jamison PERSON_ID regression.
 * Run: npx tsx scripts/test-billups-jamison-ids.ts
 */
import assert from "node:assert/strict";

import { HOF_HISTORY } from "../src/content/awards/history";
import { isHallOfFamePlayerId } from "../src/lib/hall-of-fame-style";
import {
  LEGEND_NBA_TO_BREF,
  nbaPersonIdFromPlayerRoute,
} from "../src/data/runtime/legend-nba-to-bref";
import awards from "../src/data/runtime/player-awards-snapshot.json";
import portraits from "../src/data/media/portrait-lookup.json";

function main() {
  // Canonical NBA PERSON_IDs (DARKO / stats.nba): Billups 1497, Jamison 1712.
  assert.equal(LEGEND_NBA_TO_BREF["1497"], "bref:billuch01");
  assert.equal(LEGEND_NBA_TO_BREF["1712"], "bref:jamisan01");
  assert.notEqual(
    LEGEND_NBA_TO_BREF["1712"],
    "bref:billuch01",
    "Jamison must not remap to Billups slug"
  );

  assert.equal(nbaPersonIdFromPlayerRoute("1497"), "1497");
  assert.equal(nbaPersonIdFromPlayerRoute("1712"), "1712");
  assert.equal(nbaPersonIdFromPlayerRoute("bref:billuch01"), "1497");
  assert.equal(nbaPersonIdFromPlayerRoute("bref:jamisan01"), "1712");

  const awardsNames = (awards as { names?: Record<string, string> }).names ?? {};
  assert.equal(awardsNames["1497"], "Chauncey Billups");
  assert.notEqual(awardsNames["1712"], "Chauncey Billups");

  for (const row of HOF_HISTORY) {
    if (row.winner !== "Chauncey Billups") continue;
    assert.equal(
      row.href,
      "/players/1497",
      `Billups HOF/award history must use PERSON_ID 1497, got ${row.href}`
    );
  }
  for (const row of HOF_HISTORY) {
    if (!row.href?.includes("/players/1712")) continue;
    assert.notEqual(
      row.winner,
      "Chauncey Billups",
      "PERSON_ID 1712 must not be labeled Billups"
    );
  }

  assert.equal(isHallOfFamePlayerId("1497"), true);
  assert.equal(isHallOfFamePlayerId("bref:billuch01"), true);
  assert.equal(isHallOfFamePlayerId("63"), true);
  assert.equal(
    isHallOfFamePlayerId("1712"),
    false,
    "Jamison PERSON_ID must not inherit Billups HOF flag"
  );

  const p =
    (portraits as { portraits?: Record<string, string> }).portraits ??
    (portraits as Record<string, string>);
  assert.match(String(p.billuch01 ?? ""), /\/63\.png$/);
  assert.doesNotMatch(String(p.billuch01 ?? ""), /\/385\.png$/);

  console.log("test-billups-jamison-ids: ok");
}

main();
