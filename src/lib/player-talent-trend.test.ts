/**
 * Run: npx tsx --test src/lib/player-talent-trend.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import { buildTalentSeries } from "@/lib/player-talent-trend";

test("impact path starts at the previous season and ends on this season's rate", () => {
  const games = Array.from({ length: 10 }, (_, i) => ({
    date: `2024-11-${String(i + 1).padStart(2, "0")}`,
    minutes: 34,
  }));
  const series = buildTalentSeries({
    kind: "impact",
    seasons: [
      { value: 2, games: [{ date: "2023-11-01", minutes: 30 }] },
      { value: 6, games },
    ],
  });
  assert.ok(series);
  const second = series!.dots.slice(1);
  assert.ok(Math.abs(second[0]!.value - 2) < 1.5);
  assert.equal(second[second.length - 1]!.value, 6);
  assert.deepEqual(
    series!.line.map((point) => point.value),
    [2, 6]
  );
});

test("impact dots move with the box score and stay centered on the season path", () => {
  const games = Array.from({ length: 8 }, (_, i) => ({
    date: `2024-11-${String(i + 1).padStart(2, "0")}`,
    minutes: 34,
    boxScore: i < 4 ? 10 : 30,
  }));
  const series = buildTalentSeries({
    kind: "impact",
    seasons: [{ value: 5, games }],
  });
  assert.ok(series);
  const dots = series!.dots.map((dot) => dot.value);
  assert.ok(dots[0]! < dots[7]!);
  const mean = dots.reduce((sum, value) => sum + value, 0) / dots.length;
  assert.ok(Math.abs(mean - 2.5) < 1.5);
});

test("line marks each season average on the year axis", () => {
  const games = (year: number) =>
    Array.from({ length: 4 }, (_, i) => ({
      date: `${year}-11-${String(i + 1).padStart(2, "0")}`,
      minutes: 30,
    }));
  const series = buildTalentSeries({
    kind: "impact",
    seasons: [
      { season: "2021-22", value: 1, games: games(2021) },
      { season: "2022-23", value: 9, games: games(2022) },
    ],
  });
  assert.ok(series);
  assert.deepEqual(
    series!.line.map((point) => point.value),
    [1, 9]
  );
  assert.ok(series!.line[0]!.year < series!.line[1]!.year);
  assert.ok(series!.dots.length > series!.line.length);
});

test("box series keeps the game value and still draws a line", () => {
  const series = buildTalentSeries({
    kind: "box",
    seasons: [
      {
        value: 25,
        games: [
          { date: "2024-11-01", minutes: 30, box: 20 },
          { date: "2024-11-03", minutes: 30, box: 30 },
          { date: "2024-11-05", minutes: 30, box: 25 },
        ],
      },
    ],
  });
  assert.ok(series);
  assert.deepEqual(
    series!.dots.map((dot) => dot.value),
    [20, 30, 25]
  );
  assert.equal(series!.line.length, 1);
  assert.equal(series!.line[0]!.value, 25);
});

test("a season of zero game boxes keeps the published rate and draws no dots", () => {
  const series = buildTalentSeries({
    kind: "box",
    seasons: [
      {
        season: "2022-23",
        value: 11.8,
        games: [
          { date: "2022-11-01", minutes: 30, box: 10 },
          { date: "2022-11-03", minutes: 30, box: 14 },
        ],
      },
      {
        season: "2023-24",
        value: 12.4,
        games: [
          { date: "2023-11-01", minutes: 34, box: 0 },
          { date: "2024-01-15", minutes: 36, box: 0 },
          { date: "2024-04-10", minutes: 33, box: 0 },
        ],
      },
    ],
  });
  assert.ok(series);
  assert.deepEqual(
    series!.line.map((point) => point.value),
    [12, 12.4]
  );
  assert.deepEqual(
    series!.dots.map((dot) => dot.value),
    [10, 14]
  );
});
