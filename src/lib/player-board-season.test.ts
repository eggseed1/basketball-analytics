/**
 * Run: npx tsx --test src/lib/player-board-season.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultExploreMinimumMinutes,
  shouldUsePriorSeasonBoardStats,
} from "@/lib/player-board-season";

const beforeTip = new Date("2026-10-19T16:00:00.000Z");
const afterTip = new Date("2026-10-21T04:00:00.000Z");

test("empty board before tip still uses prior-season stats", async () => {
  assert.equal(
    await shouldUsePriorSeasonBoardStats("2026-27", [], beforeTip),
    true
  );
});

test("empty board after tip does not force prior-season stats", async () => {
  assert.equal(
    await shouldUsePriorSeasonBoardStats("2026-27", [], afterTip),
    false
  );
});

test("non-current seasons never force prior-season stats", async () => {
  assert.equal(
    await shouldUsePriorSeasonBoardStats(
      "2024-25",
      [{ gamesPlayed: 0 } as never],
      afterTip
    ),
    false
  );
});

test("explore minutes floor is 0 in the first three weeks after tip", async () => {
  assert.equal(await defaultExploreMinimumMinutes("2026-27", afterTip), 0);
});

test("explore All seasons uses the current year's early-week minutes floor", async () => {
  assert.equal(await defaultExploreMinimumMinutes("ALL", afterTip), 0);
  assert.equal(await defaultExploreMinimumMinutes("ALL", beforeTip), 500);
});

test("explore minutes floor stays 500 for finished seasons", async () => {
  assert.equal(await defaultExploreMinimumMinutes("2025-26", afterTip), 500);
});

test("explore minutes floor stays 500 before tip", async () => {
  assert.equal(await defaultExploreMinimumMinutes("2026-27", beforeTip), 500);
});
