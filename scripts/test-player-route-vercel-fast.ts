/**
 * Regression guard for the Vercel player-route critical path.
 *
 * This test is network-free: production must use the same NBA Stats provider
 * graph as local/Cursor, while roster fan-out remains disabled and dynamic
 * player links do not auto-prefetch destinations.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  leagueRosterDiscoveryEnabled,
  runtimeTimeoutMs,
  statsNbaNetworkEnabled,
} from "../src/data/providers/nba/runtime-policy";
import {
  clearStatsNbaCache,
  statsNbaFetch,
} from "../src/data/providers/nba/stats-nba-client";

async function main() {
  // Vercel itself must never force a different provider graph.
  assert.equal(statsNbaNetworkEnabled({ VERCEL: "1" }), true);
  assert.equal(statsNbaNetworkEnabled({}), true);
  assert.equal(
    statsNbaNetworkEnabled({
      VERCEL: "1",
      DISABLE_STATS_NBA_NETWORK: "1",
    }),
    false
  );

  assert.equal(leagueRosterDiscoveryEnabled({ VERCEL: "1" }), false);
  assert.equal(
    leagueRosterDiscoveryEnabled({
      VERCEL: "1",
      ALLOW_PLAYER_LEAGUE_ROSTER_ON_VERCEL: "1",
    }),
    true
  );
  assert.equal(runtimeTimeoutMs(8_000, 1_000, { VERCEL: "1" }), 1_000);
  assert.equal(runtimeTimeoutMs(8_000, 1_000, {}), 8_000);

  // Prove the Vercel path actually reaches the NBA Stats fetch rather than
  // failing solely because VERCEL=1. The mocked network fails immediately so
  // this remains deterministic and offline.
  const oldVercel = process.env.VERCEL;
  const oldDisable = process.env.DISABLE_STATS_NBA_NETWORK;
  const oldFetch = globalThis.fetch;
  let fetchCalled = false;

  process.env.VERCEL = "1";
  delete process.env.DISABLE_STATS_NBA_NETWORK;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error("mock upstream failure");
  }) as typeof fetch;

  clearStatsNbaCache();
  await assert.rejects(
    () => statsNbaFetch("commonplayerinfo", { PlayerID: "2544" }),
    /mock upstream failure/
  );
  assert.equal(fetchCalled, true, "Vercel must attempt the same NBA Stats path as local");

  clearStatsNbaCache();
  globalThis.fetch = oldFetch;
  if (oldVercel == null) delete process.env.VERCEL;
  else process.env.VERCEL = oldVercel;
  if (oldDisable == null) delete process.env.DISABLE_STATS_NBA_NETWORK;
  else process.env.DISABLE_STATS_NBA_NETWORK = oldDisable;

  const queryNav = readFileSync(
    join(process.cwd(), "src/components/continuity/query-nav.tsx"),
    "utf8"
  );
  assert.match(queryNav, /target\.startsWith\("\/players\/"\) \? false/);

  const requestCache = readFileSync(
    join(process.cwd(), "src/data/queries/request-cache.ts"),
    "utf8"
  );
  assert.match(requestCache, /getPlayerCriticalCareerSeasons/);
  assert.doesNotMatch(requestCache, /getPlayerCareerSeasonsUncached/);

  const rosterOverlay = readFileSync(
    join(process.cwd(), "src/data/queries/player-roster-overlay.server.ts"),
    "utf8"
  );
  assert.match(rosterOverlay, /leagueRosterDiscoveryEnabled/);

  console.log("test-player-route-vercel-fast: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
