/**
 * Run: npx tsx --test src/data/providers/nba/espn-board-season.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import { playerBoardAwaitingTip } from "@/lib/player-board-tip";

const schedule = [
  {
    season: "2026-27",
    gameType: "regular",
    gameDate: "2026-10-20",
    homeTeamId: "8",
    awayTeamId: "2",
  },
];

const openingNight = new Date("2026-10-20T20:00:00.000Z");

test("leftover 70-GP ESPN feed is treated as tip-awaiting after opener", () => {
  assert.equal(
    playerBoardAwaitingTip(
      "2026-27",
      [{ gamesPlayed: 70 }, { gamesPlayed: 65 }],
      openingNight,
      schedule
    ),
    true
  );
});

test("real opening-night GP is not tip-awaiting", () => {
  assert.equal(
    playerBoardAwaitingTip(
      "2026-27",
      [{ gamesPlayed: 1 }, { gamesPlayed: 0 }],
      openingNight,
      schedule
    ),
    false
  );
});
