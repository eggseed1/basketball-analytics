/**
 * Regression guard for the Vercel player-route critical path.
 *
 * This test is network-free: it verifies that blocked NBA Stats egress fails
 * before fetch, that 30-team roster discovery is disabled, and that dense
 * player links do not auto-prefetch dynamic destinations.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  leagueRosterDiscoveryEnabled,
  runtimeTimeoutMs,
  statsNbaNetworkEnabled,
} from "../src/data/providers/nba/runtime-policy";
import { statsNbaFetch } from "../src/data/providers/nba/stats-nba-client";

async function main() {
  assert.equal(statsNbaNetworkEnabled({ VERCEL: "1" }), false);
  assert.equal(
    statsNbaNetworkEnabled({
      VERCEL: "1",
      ALLOW_STATS_NBA_ON_VERCEL: "1",
    }),
    true
  );
  assert.equal(statsNbaNetworkEnabled({}), true);

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

  const oldVercel = process.env.VERCEL;
  const oldAllow = process.env.ALLOW_STATS_NBA_ON_VERCEL;
  const oldFetch = globalThis.fetch;
  let fetchCalled = false;

  process.env.VERCEL = "1";
  delete process.env.ALLOW_STATS_NBA_ON_VERCEL;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error("network should not be reached");
  }) as typeof fetch;

  const started = Date.now();
  await assert.rejects(
    () => statsNbaFetch("commonplayerinfo", { PlayerID: "2544" }),
    /disabled on Vercel critical path/
  );
  assert.equal(fetchCalled, false);
  assert.ok(Date.now() - started < 250, "NBA Stats guard must fail immediately");

  globalThis.fetch = oldFetch;
  if (oldVercel == null) delete process.env.VERCEL;
  else process.env.VERCEL = oldVercel;
  if (oldAllow == null) delete process.env.ALLOW_STATS_NBA_ON_VERCEL;
  else process.env.ALLOW_STATS_NBA_ON_VERCEL = oldAllow;

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
    join(process.cwd(), "src/data/queries/player-roster-overlay\.server.ts"),
    "utf8"
  );
  assert.match(rosterOverlay, /leagueRosterDiscoveryEnabled/);

  console.log("test-player-route-vercel-fast: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
