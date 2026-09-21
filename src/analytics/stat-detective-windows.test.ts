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
    rebounds: 8,
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

test("computes RPG deltas and keeps thin TS null", () => {
  const games = [
    ...Array.from({ length: 15 }, (_, i) =>
      game(i, 4, { rebounds: 4, fga: 1, fta: 0 })
    ),
    ...Array.from({ length: 5 }, (_, i) =>
      game(20 + i, 4, { rebounds: 12, fga: 1, fta: 0 })
    ),
  ];
  const windows = playerWindowDeltas(games);
  assert.ok(windows.last5);
  assert.equal(windows.last5.windowRpg, 12);
  assert.ok(windows.last5.baselineRpg != null);
  assert.ok((windows.last5.deltaRpg ?? 0) > 5);
  // Thin shot sample → TS stays null (missing ≠ 0).
  assert.equal(windows.last5.windowTs, null);
  assert.equal(windows.last5.deltaTs, null);
});

test("qualifiesWindow is metric-specific", async () => {
  const { qualifiesWindow } = await import("./stat-detective-windows");
  const games = Array.from({ length: 20 }, (_, i) =>
    game(i, i >= 15 ? 24 : 10, { rebounds: i >= 15 ? 14 : 6 })
  );
  const hit = playerWindowDeltas(games).last5;
  assert.ok(hit);
  assert.equal(qualifiesWindow(hit, "ppg"), true);
  assert.equal(qualifiesWindow(hit, "rpg"), true);
});
