/**
 * Run: npx tsx --test src/lib/player-board-season.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultExploreMinimumMinutes,
  qualifyHomeLeaderRows,
  shouldUsePriorSeasonBoardStats,
} from "@/lib/player-board-season";
import type { PlayerSeason } from "@/data/types";

const beforeTip = new Date("2026-10-19T16:00:00.000Z");
const afterTip = new Date("2026-10-21T04:00:00.000Z");

test("empty board before tip still uses prior-season stats", () => {
  assert.equal(
    shouldUsePriorSeasonBoardStats("2026-27", [], beforeTip),
    true
  );
});

test("empty board after tip does not force prior-season stats", () => {
  assert.equal(
    shouldUsePriorSeasonBoardStats("2026-27", [], afterTip),
    false
  );
});

test("non-current seasons never force prior-season stats", () => {
  assert.equal(
    shouldUsePriorSeasonBoardStats(
      "2024-25",
      [{ gamesPlayed: 0 } as never],
      afterTip
    ),
    false
  );
});

test("explore minutes floor is 0 in the first three weeks after tip", () => {
  assert.equal(defaultExploreMinimumMinutes("2026-27", afterTip), 0);
});

test("explore minutes floor stays 500 for finished seasons", () => {
  assert.equal(defaultExploreMinimumMinutes("2025-26", afterTip), 500);
});

test("explore minutes floor stays 500 before tip", () => {
  assert.equal(defaultExploreMinimumMinutes("2026-27", beforeTip), 500);
});

test("home leader qualify drops the 15-game floor before the board has 15 games", () => {
  const early: PlayerSeason[] = [
    {
      playerId: "1",
      playerName: "Star",
      season: "2026-27",
      gamesPlayed: 1,
      minutes: 35,
      trueShootingPct: 0.6,
    } as PlayerSeason,
    {
      playerId: "2",
      playerName: "Bench",
      season: "2026-27",
      gamesPlayed: 1,
      minutes: 8,
      trueShootingPct: 0.9,
    } as PlayerSeason,
  ];
  const out = qualifyHomeLeaderRows(early, 24);
  assert.equal(out.length, 1);
  assert.equal(out[0]?.playerName, "Star");
});

test("home leader qualify keeps the 15-game floor once the board is mid-season", () => {
  const mid: PlayerSeason[] = [
    {
      playerId: "1",
      playerName: "Qualified",
      season: "2025-26",
      gamesPlayed: 40,
      minutes: 1200,
    } as PlayerSeason,
    {
      playerId: "2",
      playerName: "Sample",
      season: "2025-26",
      gamesPlayed: 8,
      minutes: 240,
    } as PlayerSeason,
  ];
  const out = qualifyHomeLeaderRows(mid, 18);
  assert.equal(out.length, 1);
  assert.equal(out[0]?.playerName, "Qualified");
});
