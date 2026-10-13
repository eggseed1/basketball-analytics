/**
 * Run: npx tsx --test src/lib/player-comp-futures.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCompFutures,
  similarityIndex,
  weightedPercentile,
  type CompFutures,
} from "@/lib/player-comp-futures";
import { compPositionCode, type BundledCompPoolRow } from "@/data/runtime/bref-advanced-snapshot";

function row(
  id: string,
  name: string,
  season: string,
  age: number,
  bpm: number,
  extra: Partial<BundledCompPoolRow> = {}
): BundledCompPoolRow {
  return {
    playerId: id,
    playerName: name,
    season,
    teamId: "1",
    age,
    gamesPlayed: 70,
    minutes: 70 * 32,
    bpm,
    vorp: bpm / 2,
    trueShootingPct: 0.58,
    usagePct: 0.28,
    assistPct: 0.3,
    reboundPct: 0.12,
    drbl100: bpm / 3,
    war1: bpm,
    drblO: bpm / 4,
    drblD: 0.2,
    darko: bpm / 2,
    darkoOff: bpm / 3,
    darkoDef: 0.4,
    raptor: bpm / 2,
    obpm: bpm / 2,
    dbpm: bpm / 2,
    pts36: 20,
    trb36: 6,
    ast36: 5,
    heightInches: 79,
    positionCode: 1,
    experience: 8,
    ...extra,
  };
}

function poolAroundFocal(): BundledCompPoolRow[] {
  const out: BundledCompPoolRow[] = [];
  for (let i = 0; i < 30; i++) {
    const id = `p${i}`;
    const season = `${2000 + (i % 20)}-${String((i % 20) + 1).padStart(2, "0")}`;
    const bpm = 6.5 + (i % 5) * 0.2;
    out.push(row(id, `Player ${i}`, season, 31, bpm));
    out.push(row(id, `Player ${i}`, shift(season, 1), 32, bpm - 0.4));
    out.push(row(id, `Player ${i}`, shift(season, 2), 33, bpm - 0.9));
    out.push(row(id, `Player ${i}`, shift(season, 3), 34, bpm - 1.4));
  }
  return out;
}

function shift(season: string, years: number): string {
  const start = Number(season.slice(0, 4)) + years;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

test("anchor season stays visible and the next calendar season feeds the range", () => {
  const result = buildCompFutures({
    metricId: "bpm",
    focalPlayerId: "focal",
    focalName: "Focal",
    focalSeason: "2025-26",
    focalAge: 31,
    focalValue: 7.4,
    focalTs: 0.58,
    focalUsg: 0.28,
    focalAstPct: 0.3,
    focalRebPct: 0.12,
    career: [
      { age: 29, value: 6.2 },
      { age: 30, value: 6.8 },
      { age: 31, value: 7.4 },
    ],
    pool: poolAroundFocal(),
  });
  assert.ok(result);
  const data = result as CompFutures;
  assert.equal(data.metricLabel, "BPM");
  assert.equal(data.baseline, "0 is average");
  assert.equal(data.table.length, 10);
  assert.equal(data.fanCount, 25);
  assert.equal(new Set(data.fan.map((line) => line.playerId)).size, 25);
  assert.equal(data.ageWindow, 1);
  assert.ok(data.poolSize >= 20);
  assert.ok(data.rank >= 1);
  assert.equal(data.points[0]?.age, 29);
  assert.equal(data.points.at(-1)?.age, 36);
  const at31 = data.points.find((point) => point.age === 31);
  assert.equal(at31?.focal, 7.4);
  assert.equal(at31?.p50, 7.4);
  assert.equal(at31?.p10, 7.4);
  const comp = data.fan[0]!;
  const at31i = data.points.findIndex((point) => point.age === 31);
  const at32i = data.points.findIndex((point) => point.age === 32);
  assert.equal(comp.values[at31i], comp.anchorValue);
  assert.equal(comp.values[at32i], comp.anchorValue - 0.4);
  assert.equal(comp.slots[0]?.kind, "anchor");
  assert.equal(comp.slots[1]?.kind, "qualifying");
  const at32 = data.points.find((point) => point.age === 32);
  assert.equal(at32?.p50, 7);
  assert.equal(at32?.focal, null);
  assert.equal(at32?.suppressed, false);
  assert.equal(at32?.participation, 1);
  assert.equal(data.table[0]?.future.length, 5);
  assert.ok(data.table[0]!.similarity > 0);
  assert.ok(data.table[0]!.similarity < 100);
  assert.equal(data.table[0]?.slots.length, 6);
});

test("a skipped calendar season stays a gap instead of sliding the next year forward", () => {
  const pool = poolAroundFocal()
    .filter((item) => !(item.playerId === "p0" && item.season === shift("2000-01", 1)))
    .map((item) =>
      item.playerId === "p0" && item.age === 31 ? { ...item, bpm: 7.39 } : item
    );
  const result = buildCompFutures({
    metricId: "bpm",
    focalPlayerId: "focal",
    focalName: "Focal",
    focalSeason: "2025-26",
    focalAge: 31,
    focalValue: 7.4,
    focalTs: 0.58,
    focalUsg: 0.28,
    focalAstPct: 0.3,
    focalRebPct: 0.12,
    career: [{ age: 31, value: 7.4 }],
    pool,
  }) as CompFutures;
  const line = result.fan.find((item) => item.playerId === "p0");
  assert.ok(line);
  assert.equal(line.slots[1]?.kind, "missing");
  assert.equal(line.slots[1]?.value, null);
  assert.equal(line.slots[2]?.kind, "qualifying");
  assert.equal(line.slots[2]?.value, 5.6);
});

test("a short season counts as played-against and stays out of the rating range", () => {
  const pool = poolAroundFocal().map((item) => {
    if (item.playerId === "p0" && item.age === 31) return { ...item, bpm: 7.39 };
    if (item.playerId === "p0" && item.age === 32) return { ...item, gamesPlayed: 5 };
    return item;
  });
  const result = buildCompFutures({
    metricId: "bpm",
    focalPlayerId: "focal",
    focalName: "Focal",
    focalSeason: "2025-26",
    focalAge: 31,
    focalValue: 7.4,
    focalTs: 0.58,
    focalUsg: 0.28,
    focalAstPct: 0.3,
    focalRebPct: 0.12,
    career: [{ age: 31, value: 7.4 }],
    pool,
  }) as CompFutures;
  const line = result.fan.find((item) => item.playerId === "p0");
  assert.ok(line);
  assert.equal(line.slots[1]?.kind, "short");
  const at32 = result.points.find((point) => point.age === 32)!;
  assert.equal(at32.playedCount, at32.observedCount - 1);
  assert.ok(at32.participation != null && at32.participation < 1);
  assert.equal(at32.ratingCount, at32.playedCount);
});

test("a zero rating is a real anchor, and the nearest comp is not forced to 100", () => {
  const pool = poolAroundFocal();
  pool.push(row("zero", "Zero", "2010-11", 31, 0, { heightInches: 80 }));
  pool.push(row("zero", "Zero", "2011-12", 32, 0.2, { heightInches: 80 }));
  const result = buildCompFutures({
    metricId: "bpm",
    focalPlayerId: "focal",
    focalName: "Focal",
    focalSeason: "2025-26",
    focalAge: 31,
    focalValue: 0,
    focalTs: 0.58,
    focalUsg: 0.28,
    focalAstPct: 0.3,
    focalRebPct: 0.12,
    profile: {
      off: 0,
      def: 0,
      lag1: null,
      lag2: null,
      pts36: 20,
      trb36: 6,
      ast36: 5,
      heightInches: 79,
      positionCode: 1,
      experience: 8,
    },
    career: [{ age: 31, value: 0 }],
    pool,
  }) as CompFutures;
  assert.equal(result.table[0]?.playerId, "zero");
  assert.equal(result.table[0]?.value, 0);
  assert.ok(result.table[0]!.similarity < 100);
  assert.ok(result.table[0]!.similarity > result.table[1]!.similarity);
});

test("weighted percentile follows cumulative weight, not an unweighted sort", () => {
  const median = weightedPercentile(
    [
      { value: 1, weight: 1 },
      { value: 10, weight: 9 },
    ],
    0.5
  );
  assert.equal(median, 10);
  assert.equal(similarityIndex(0), 100);
  assert.ok(similarityIndex(1) < 100);
});

test("position labels land on one scale from point guard to center", () => {
  assert.equal(compPositionCode("PG"), 0);
  assert.equal(compPositionCode("SG"), 0.5);
  assert.equal(compPositionCode("SF"), 1);
  assert.equal(compPositionCode("PF"), 1.5);
  assert.equal(compPositionCode("C"), 2);
  assert.equal(compPositionCode(""), null);
});

test("returns null when the age window is too small", () => {
  const result = buildCompFutures({
    metricId: "bpm",
    focalPlayerId: "focal",
    focalName: "Focal",
    focalSeason: "2025-26",
    focalAge: 31,
    focalValue: 7.4,
    focalTs: 0.58,
    focalUsg: 0.28,
    focalAstPct: 0.3,
    focalRebPct: 0.12,
    career: [{ age: 31, value: 7.4 }],
    pool: [row("a", "A", "2010-11", 31, 6)],
  });
  assert.equal(result, null);
});

test("two seasons from one player keep only the closer anchor", () => {
  const pool = [
    ...poolAroundFocal(),
    row("twin", "Twin", "2012-13", 30, 1),
    row("twin", "Twin", "2013-14", 31, 7.4),
    row("twin", "Twin", "2014-15", 32, 7),
  ];
  const result = buildCompFutures({
    metricId: "bpm",
    focalPlayerId: "focal",
    focalName: "Focal",
    focalSeason: "2025-26",
    focalAge: 31,
    focalValue: 7.4,
    focalTs: 0.58,
    focalUsg: 0.28,
    focalAstPct: 0.3,
    focalRebPct: 0.12,
    career: [{ age: 31, value: 7.4 }],
    pool,
  }) as CompFutures;
  const hits = result.fan.filter((line) => line.playerId === "twin");
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.anchorSeason, "2013-14");
});
