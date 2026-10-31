/**
 * Run: npx tsx --test src/lib/player-board-tip.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import { playerBoardAwaitingTip } from "@/lib/player-board-tip";

const schedule = [
  {
    season: "2026-27",
    gameType: "preseason",
    gameDate: "2026-10-08",
    homeTeamId: "2",
    awayTeamId: "8",
  },
  {
    season: "2026-27",
    gameType: "regular",
    gameDate: "2026-10-20",
    homeTeamId: "8",
    awayTeamId: "2",
  },
  {
    season: "2026-27",
    gameType: "regular",
    gameDate: "2026-10-22",
    homeTeamId: "2",
    awayTeamId: "8",
  },
];

const rows = [{ gamesPlayed: 65 }, { gamesPlayed: 64 }];
const beforeTip = new Date("2026-10-19T16:00:00.000Z");
const openingNight = new Date("2026-10-20T16:00:00.000Z");

test("a full season of games played is still pre-tip the day before opening night", async () => {
  assert.equal(
    await playerBoardAwaitingTip("2026-27", rows, beforeTip, schedule),
    true
  );
});

test("opening night with only a couple of real games is not a leftover season", async () => {
  assert.equal(
    await playerBoardAwaitingTip("2026-27", [{ gamesPlayed: 1 }], openingNight, schedule),
    false
  );
});

test("opening night still rejects last year's 65-game table", async () => {
  assert.equal(
    await playerBoardAwaitingTip("2026-27", rows, openingNight, schedule),
    true
  );
});

test("a finished season is left alone", async () => {
  assert.equal(
    await playerBoardAwaitingTip("2025-26", rows, beforeTip, schedule),
    false
  );
});
