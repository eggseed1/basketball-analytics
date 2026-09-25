/**
 * Run: npx tsx --test src/data/drbl/published-seasons.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  isSeasonInPublishedFile,
  mergeDrblSeasonLists,
  publishedMinGames,
  seasonsFromPublishedFile,
} from "./published-seasons";

test("publishedMinGames defaults to 50", () => {
  assert.equal(publishedMinGames({}), 50);
  assert.equal(publishedMinGames({ minGames: 80 }), 80);
});

test("seasonsFromPublishedFile respects the games floor", () => {
  const seasons = seasonsFromPublishedFile({
    minGames: 50,
    seasons: {
      "2026-27": { gamesProcessed: 49 },
      "2025-26": { gamesProcessed: 1225 },
      "2024-25": { gamesProcessed: 50 },
    },
  });
  assert.deepEqual(seasons, ["2024-25", "2025-26"]);
});

test("isSeasonInPublishedFile gates thin early-season boards", () => {
  const file = {
    minGames: 50,
    seasons: { "2026-27": { gamesProcessed: 12 } },
  };
  assert.equal(isSeasonInPublishedFile(file, "2026-27"), false);
  assert.equal(
    isSeasonInPublishedFile(
      { ...file, seasons: { "2026-27": { gamesProcessed: 50 } } },
      "2026-27"
    ),
    true
  );
});

test("mergeDrblSeasonLists unions registry and runtime publish", () => {
  assert.deepEqual(
    mergeDrblSeasonLists(["2024-25", "2025-26"], ["2026-27", "2025-26"]),
    ["2024-25", "2025-26", "2026-27"]
  );
});
