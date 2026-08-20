/**
 * Player Explore board resilience - never sample under nba; cached real → degraded.
 */
import assert from "node:assert/strict";

import { assessPlayerBoardHealth } from "../src/data/diagnostics/player-board-health";
import { classifyProviderFailure } from "../src/data/diagnostics/provider-failure";
import type { PlayerSeason } from "../src/data/types";
import {
  __resetPlayerBoardCacheForTests,
  __seedPlayerBoardCacheForTests,
  __setPlayerBoardLoaderForTests,
  getPlayerSeasonBoardSnapshot,
} from "../src/data/queries/player-data-health";

function fakeRow(id: string, teamId = "2"): PlayerSeason {
  return {
    playerId: id,
    playerName: `Player ${id}`,
    teamId,
    teamName: teamId === "2" ? "Boston Celtics" : "Oklahoma City Thunder",
    season: "2025-26",
    gamesPlayed: 50,
    minutes: 1500,
    points: 20,
    rebounds: 5,
    assists: 5,
    steals: 1,
    blocks: 1,
    turnovers: 2,
    fieldGoalsMade: 8,
    fieldGoalsAttempted: 16,
    threePointersMade: 2,
    threePointersAttempted: 5,
    freeThrowsMade: 2,
    freeThrowsAttempted: 2,
    trueShootingPct: 0.58,
    usagePct: 0.25,
    effectiveFieldGoalPct: 0.52,
  } as unknown as PlayerSeason;
}

function espnError(status: number) {
  return new Error(
    `ESPN request failed (${status}): https://site.web.api.espn.com/.../byathlete`
  );
}

async function main() {
  assert.equal(classifyProviderFailure(espnError(403)).kind, "http_403");
  assert.equal(classifyProviderFailure(espnError(429)).kind, "http_429");
  assert.equal(
    classifyProviderFailure(new Error("Team metadata request timed out after 6000ms"))
      .kind,
    "timeout"
  );

  // Success
  __resetPlayerBoardCacheForTests();
  __setPlayerBoardLoaderForTests(async () => ({
    rows: [fakeRow("1"), fakeRow("2")],
    error: null,
  }));
  const ok = await getPlayerSeasonBoardSnapshot({ season: "2025-26" });
  assert.equal(ok.source, "live-espn");
  assert.equal(ok.rows.length, 2);
  assert.ok(ok.rows.length === 2);

  // Seed cache from success, then 403 → cached
  __resetPlayerBoardCacheForTests();
  __seedPlayerBoardCacheForTests("2025-26", [
    fakeRow("1"),
    fakeRow("2"),
    fakeRow("3"),
  ]);
  __setPlayerBoardLoaderForTests(async () => ({
    rows: [],
    error: espnError(403),
  }));
  const cached = await getPlayerSeasonBoardSnapshot({ season: "2025-26" });
  assert.equal(cached.source, "cached-espn");
  assert.equal(cached.rows.length, 3);
  assert.equal(cached.health.status, "cached_board");
  assert.ok(cached.warnings[0]?.includes("verified"));

  // Team filter on a seeded board is in-memory - don't wait on a live miss.
  const filtered = await getPlayerSeasonBoardSnapshot({
    season: "2025-26",
    team: "BOS",
  });
  assert.equal(filtered.source, "live-espn");
  assert.ok(filtered.rows.every((r) => r.teamId === "2"));
  assert.equal(filtered.warnings.length, 0);

  // Draft class reuses the season snapshot (no second board fetch).
  let loads = 0;
  __resetPlayerBoardCacheForTests();
  __seedPlayerBoardCacheForTests("2025-26", [
    { ...fakeRow("a"), draftYear: 2018 },
    { ...fakeRow("b"), draftYear: 2022 },
    { ...fakeRow("c") },
  ]);
  __setPlayerBoardLoaderForTests(async () => {
    loads += 1;
    return { rows: [], error: espnError(403) };
  });
  const draft = await getPlayerSeasonBoardSnapshot({
    season: "2025-26",
    draftClass: 2018,
  });
  assert.equal(loads, 0);
  assert.equal(draft.source, "live-espn");
  assert.equal(draft.rows.length, 1);
  assert.equal(draft.rows[0]?.playerId, "a");
  const undrafted = await getPlayerSeasonBoardSnapshot({
    season: "2025-26",
    draftClass: "undrafted",
  });
  assert.equal(loads, 0);
  assert.equal(undrafted.rows.length, 1);
  assert.equal(undrafted.rows[0]?.playerId, "c");

  // Cold draft-class filter loads the season once, then filters in memory.
  let coldLoads = 0;
  __resetPlayerBoardCacheForTests();
  __setPlayerBoardLoaderForTests(async (filters) => {
    coldLoads += 1;
    assert.equal(filters.draftClass, undefined);
    return {
      rows: [
        { ...fakeRow("a"), draftYear: 2018 },
        { ...fakeRow("b"), draftYear: 2022 },
      ],
      error: null,
    };
  });
  const cold = await getPlayerSeasonBoardSnapshot({
    season: "2025-26",
    draftClass: 2018,
  });
  assert.equal(coldLoads, 1);
  assert.equal(cold.rows.length, 1);
  assert.equal(cold.rows[0]?.playerId, "a");

  // 429 with no cache → unavailable degraded (not sample)
  __resetPlayerBoardCacheForTests();
  __setPlayerBoardLoaderForTests(async () => ({
    rows: [],
    error: espnError(429),
  }));
  const unavailable = await getPlayerSeasonBoardSnapshot({ season: "2025-26" });
  assert.equal(unavailable.source, "unavailable");
  assert.equal(unavailable.rows.length, 0);
  assert.equal(unavailable.health.status, "provider_failure");
  assert.match(unavailable.health.message, /temporarily unavailable/i);

  // Timeout + no cache
  __resetPlayerBoardCacheForTests();
  __setPlayerBoardLoaderForTests(async () => ({
    rows: [],
    error: new Error("Team metadata request timed out after 6000ms"),
  }));
  const timed = await getPlayerSeasonBoardSnapshot({ season: "2025-26" });
  assert.equal(timed.source, "unavailable");
  assert.equal(timed.health.status, "provider_failure");

  // Health: cached_board assessment
  const h = assessPlayerBoardHealth({
    providerName: "nba",
    season: "2025-26",
    rowCount: 400,
    error: espnError(403),
    fromCachedRealBoard: true,
  });
  assert.equal(h.status, "cached_board");

  // Sample guard: local provider path stays sample_dataset (via loader override simulating local rows under nba would still mark via provider - skip)
  // Explicit: fromCachedRealBoard never invents sample
  assert.equal(h.isSampleData, false);

  __resetPlayerBoardCacheForTests();
  console.log("test-player-board-resilience: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
