/**
 * Run: npx tsx --test src/analytics/stat-detective-windows.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  playerWindowDeltas,
  regularSeasonGames,
  type StatWindowGame,
} from "./stat-detective-windows";

function game(
  index: number,
  points: number,
  extra: Partial<StatWindowGame> = {}
): StatWindowGame {
  const day = String((index % 28) + 1).padStart(2, "0");
  const month = String(Math.floor(index / 28) + 1).padStart(2, "0");
  return {
    gameId: `g${index}`,
    date: `2026-${month}-${day}`,
    minutesNum: 32,
    points,
    fga: 18,
    fta: 4,
    seasonType: "regular",
    ...extra,
  };
}

test("drops playoff games from regular windows", () => {
  const games = [
    ...Array.from({ length: 20 }, (_, i) => game(i, 10)),
    game(40, 50, { seasonType: "playoffs", date: "2026-06-01" }),
  ];
  assert.equal(regularSeasonGames(games).length, 20);
  const windows = playerWindowDeltas(games);
  assert.ok(windows.last5);
  assert.ok(Math.abs(windows.last5.deltaPpg) < 0.01);
});

test("last 5 vs prior 5 does not overlap the season tail", () => {
  const games = [
    ...Array.from({ length: 15 }, (_, i) => game(i, 10)),
    ...Array.from({ length: 5 }, (_, i) => game(20 + i, 12)),
    ...Array.from({ length: 5 }, (_, i) => game(30 + i, 24)),
  ];
  const windows = playerWindowDeltas(games);
  assert.ok(windows.split5);
  assert.equal(windows.split5.windowGames, 5);
  assert.equal(windows.split5.baselineGames, 5);
  assert.equal(windows.split5.baselinePpg, 12);
  assert.equal(windows.split5.windowPpg, 24);
  assert.equal(windows.split5.deltaPpg, 12);
});

test("omits a window when minutes are too low", () => {
  const games = Array.from({ length: 20 }, (_, i) =>
    game(i, 30, { minutesNum: 10 })
  );
  assert.equal(playerWindowDeltas(games).last5, undefined);
});
