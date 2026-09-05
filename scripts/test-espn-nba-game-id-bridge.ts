/**
 * Regression: ESPN event ids used in Scores/Home links must resolve to NBA
 * GameIDs so CDN play-by-play works on Vercel (stats.nba disabled).
 *
 * Run: npx tsx scripts/test-espn-nba-game-id-bridge.ts
 */
import assert from "node:assert/strict";

import { resolveNbaGameId } from "../src/data/identity/resolve-nba-game-id";
import { fetchRawPlayByPlay } from "../src/data/providers/nba/play-by-play-client";
import { statsNbaNetworkEnabled } from "../src/data/providers/nba/runtime-policy";

async function assertEspnPbp(
  espnId: string,
  expectedNba: string,
  label: string
) {
  const resolved = await resolveNbaGameId(espnId);
  assert.equal(
    resolved,
    expectedNba,
    `expected ${espnId} → ${expectedNba}, got ${resolved}`
  );

  const pbp = await fetchRawPlayByPlay(espnId);
  assert.ok(pbp, `PBP payload required for ${label}`);
  assert.equal(pbp.source, "cdn");
  assert.equal(pbp.nbaGameId, expectedNba);
  const actions = (pbp.raw as { game?: { actions?: unknown[] } }).game
    ?.actions;
  assert.ok(Array.isArray(actions) && actions.length > 100);
  console.log(
    `ok: ${espnId} → ${expectedNba} (${actions.length} CDN actions, ${label})`
  );
}

async function main() {
  assert.equal(statsNbaNetworkEnabled({ VERCEL: "1" }), false);

  // Pass-through for NBA ids.
  assert.equal(await resolveNbaGameId("0022300265"), "0022300265");

  const oldVercel = process.env.VERCEL;
  process.env.VERCEL = "1";
  try {
    // POR @ CLE — P17.2 forensics sample.
    await assertEspnPbp(
      process.env.P17_2_ESPN_GAME_ID?.trim() || "401584893",
      "0022300265",
      "POR-CLE"
    );
    // OKC vs LAL — user-reported ESPN link class.
    await assertEspnPbp("401584899", "0022300271", "OKC-LAL");
  } finally {
    if (oldVercel == null) delete process.env.VERCEL;
    else process.env.VERCEL = oldVercel;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
