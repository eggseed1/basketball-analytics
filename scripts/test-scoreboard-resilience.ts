/**
 * Scoreboard soft-fail: live → stale cache → unavailable (never fake live).
 */
import assert from "node:assert/strict";

import type { Game } from "../src/data/types";
import {
  __resetScoreboardFeedCachesForTests,
  __seedScoreboardCacheForTests,
  __setScoreboardDayLoaderForTests,
  __setScoreboardMonthLoaderForTests,
  getLiveScoreboardFeed,
  getScoreboardMonthFeed,
} from "../src/data/queries/scoreboard-feed";

function fakeGame(id: string): Game {
  return {
    id,
    season: "2025-26",
    gameDate: "2026-01-15",
    status: "final",
    homeTeamId: "2",
    awayTeamId: "25",
    homeTeamAbbr: "BOS",
    awayTeamAbbr: "OKC",
    homeScore: 110,
    awayScore: 105,
  } as Game;
}

function espnError(status: number) {
  return new Error(
    `ESPN request failed (${status}): https://site.api.espn.com/.../scoreboard`
  );
}

async function main() {
  // Success
  __resetScoreboardFeedCachesForTests();
  __setScoreboardMonthLoaderForTests(async () => [fakeGame("1"), fakeGame("2")]);
  const live = await getScoreboardMonthFeed({
    monthKey: "2026-01",
    season: "2025-26",
  });
  assert.equal(live.source, "live-espn");
  assert.equal(live.isStale, false);
  assert.equal(live.data.games.length, 2);

  // 403 → cached stale
  __resetScoreboardFeedCachesForTests();
  __seedScoreboardCacheForTests(
    "month",
    "2025-26:2026-01",
    [fakeGame("cached")],
    "2026-01-01T12:00:00.000Z"
  );
  __setScoreboardMonthLoaderForTests(async () => {
    throw espnError(403);
  });
  const stale = await getScoreboardMonthFeed({
    monthKey: "2026-01",
    season: "2025-26",
  });
  assert.equal(stale.source, "cached-espn");
  assert.equal(stale.isStale, true);
  assert.equal(stale.data.games.length, 1);
  assert.match(stale.warnings[0] ?? "", /not a live update/i);
  assert.equal(stale.retrievedAt, "2026-01-01T12:00:00.000Z");

  // Timeout → no cache → unavailable
  __resetScoreboardFeedCachesForTests();
  __setScoreboardMonthLoaderForTests(async () => {
    throw new Error("timed out");
  });
  const down = await getScoreboardMonthFeed({
    monthKey: "2026-01",
    season: "2025-26",
  });
  assert.equal(down.source, "unavailable");
  assert.equal(down.data.games.length, 0);
  assert.match(down.warnings[0] ?? "", /temporarily unavailable/i);

  // Live day scoreboard same contract
  __resetScoreboardFeedCachesForTests();
  __seedScoreboardCacheForTests("day", "2025-26:day", [fakeGame("day1")]);
  __setScoreboardDayLoaderForTests(async () => {
    throw espnError(403);
  });
  const day = await getLiveScoreboardFeed({ season: "2025-26" });
  assert.equal(day.source, "cached-espn");
  assert.equal(day.isStale, true);
  assert.equal(day.data.games.length, 1);

  __resetScoreboardFeedCachesForTests();
  console.log("test-scoreboard-resilience: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
