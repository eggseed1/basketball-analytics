/**
 * Draft classes: age by slot, rookie talent, and who actually peaks.
 * Run: npx tsx scripts/test-gm-draft-class.ts
 */
import assert from "node:assert/strict";

import { progressSheet, ensurePlayerSheet } from "../src/gm/engine/attributes";
import { createRng } from "../src/gm/engine/rng";
import { createDraftClass } from "../src/gm/seed/prospect-identities";
import type { GmPlayer } from "../src/gm/types";

const CLASSES = 40;

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rate(values: boolean[]): number {
  return values.filter(Boolean).length / values.length;
}

function atPeak(player: GmPlayer): GmPlayer {
  let next = ensurePlayerSheet(player);
  let guard = 0;
  while (next.age < 27 && guard < 10) {
    next = progressSheet(
      { ...next, age: next.age + 1 },
      { minutes: next.minutesPreference, coach: 0.4 }
    );
    guard += 1;
  }
  return next;
}

type Row = { slot: number; age: number; rookie: number; peak: number };

const rows: Row[] = [];
let bestOutsideTop5 = 0;
let secondRoundBest = 0;

for (let seed = 1; seed <= CLASSES; seed++) {
  const rng = createRng(seed * 7919);
  const klass = createDraftClass({
    count: 60,
    seasonEndYear: 2027,
    scoutLevel: 3,
    rng,
    seal: (player) => player,
  }).map((player, index) => {
    const peaked = atPeak(player);
    return {
      slot: index + 1,
      age: player.age,
      rookie: player.ratings.impact,
      peak: peaked.ratings.impact,
    };
  });
  rows.push(...klass);
  const best = [...klass].sort((a, b) => b.peak - a.peak)[0]!;
  if (best.slot > 5) bestOutsideTop5 += 1;
  if (best.slot > 30) secondRoundBest += 1;
}

function band(from: number, to: number): Row[] {
  return rows.filter((row) => row.slot >= from && row.slot <= to);
}

const top = band(1, 1);
const top5 = band(1, 5);
const lottery = band(6, 14);
const lateFirst = band(15, 30);
const second = band(31, 60);
const lateSecond = band(46, 60);

console.log(
  "age",
  mean(top5.map((row) => row.age)).toFixed(2),
  mean(lottery.map((row) => row.age)).toFixed(2),
  mean(lateFirst.map((row) => row.age)).toFixed(2),
  mean(second.map((row) => row.age)).toFixed(2),
  mean(lateSecond.map((row) => row.age)).toFixed(2)
);
console.log(
  "rookie",
  mean(top.map((row) => row.rookie)).toFixed(2),
  mean(top5.map((row) => row.rookie)).toFixed(2),
  mean(lottery.map((row) => row.rookie)).toFixed(2),
  mean(lateFirst.map((row) => row.rookie)).toFixed(2),
  mean(second.map((row) => row.rookie)).toFixed(2)
);
console.log(
  "peak",
  mean(top.map((row) => row.peak)).toFixed(2),
  mean(top5.map((row) => row.peak)).toFixed(2),
  mean(lottery.map((row) => row.peak)).toFixed(2),
  mean(lateFirst.map((row) => row.peak)).toFixed(2),
  mean(second.map((row) => row.peak)).toFixed(2)
);
console.log(
  "pick1 star/bust",
  rate(top.map((row) => row.peak >= 2.5)).toFixed(2),
  rate(top.map((row) => row.peak < 0.5)).toFixed(2)
);
console.log(
  "top5 bust",
  rate(top5.map((row) => row.peak < 0.5)).toFixed(2),
  "second steal",
  rate(second.map((row) => row.peak >= 1.5)).toFixed(2),
  "best outside top5",
  (bestOutsideTop5 / CLASSES).toFixed(2),
  "best in round 2",
  (secondRoundBest / CLASSES).toFixed(2)
);

assert.ok(mean(top5.map((row) => row.age)) > 19.2 && mean(top5.map((row) => row.age)) < 20);
assert.ok(mean(lateFirst.map((row) => row.age)) > 20.4 && mean(lateFirst.map((row) => row.age)) < 21.5);
assert.ok(mean(lateSecond.map((row) => row.age)) > 21.6 && mean(lateSecond.map((row) => row.age)) < 22.8);
assert.ok(mean(top.map((row) => row.rookie)) > 0.3 && mean(top.map((row) => row.rookie)) < 1.8);
assert.ok(mean(second.map((row) => row.rookie)) < -0.45 && mean(second.map((row) => row.rookie)) > -1.8);
assert.ok(rate(top.map((row) => row.peak >= 2.5)) > 0.12);
assert.ok(rate(top.map((row) => row.peak < 0.5)) > 0.05 && rate(top.map((row) => row.peak < 0.5)) < 0.4);
assert.ok(rate(top5.map((row) => row.peak < 0.5)) > 0.08 && rate(top5.map((row) => row.peak < 0.5)) < 0.4);
assert.ok(rate(second.map((row) => row.peak >= 1.5)) > 0.03 && rate(second.map((row) => row.peak >= 1.5)) < 0.16);
assert.ok(bestOutsideTop5 / CLASSES > 0.25 && bestOutsideTop5 / CLASSES < 0.8);
assert.ok(secondRoundBest / CLASSES > 0.02 && secondRoundBest / CLASSES < 0.25);
assert.ok(mean(top.map((row) => row.peak)) > mean(second.map((row) => row.peak)) + 0.8);

console.log("draft class ok", CLASSES);
