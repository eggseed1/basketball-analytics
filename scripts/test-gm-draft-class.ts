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

assert.ok(mean(top5.map((row) => row.age)) > 18.8 && mean(top5.map((row) => row.age)) < 20.3);
assert.ok(mean(lateFirst.map((row) => row.age)) > 20.0 && mean(lateFirst.map((row) => row.age)) < 21.6);
assert.ok(mean(lateSecond.map((row) => row.age)) > 21.2 && mean(lateSecond.map((row) => row.age)) < 22.9);
// Pick 1 is often a real prospect now (tier pyramid), not a soft +0.5 consensus stub.
assert.ok(mean(top.map((row) => row.rookie)) > 1.2 && mean(top.map((row) => row.rookie)) < 5.5);
assert.ok(mean(second.map((row) => row.rookie)) < 0.2 && mean(second.map((row) => row.rookie)) > -2.4);
assert.ok(rate(top.map((row) => row.peak >= 2.5)) > 0.3);
assert.ok(rate(top.map((row) => row.peak < 0.5)) < 0.35);
assert.ok(rate(top5.map((row) => row.peak < 0.5)) < 0.4);
assert.ok(rate(second.map((row) => row.peak >= 1.0)) > 0.01 && rate(second.map((row) => row.peak >= 1.0)) < 0.28);
assert.ok(bestOutsideTop5 / CLASSES > 0.1 && bestOutsideTop5 / CLASSES < 0.9);
assert.ok(secondRoundBest / CLASSES < 0.4);
assert.ok(mean(top.map((row) => row.peak)) > mean(second.map((row) => row.peak)) + 1.0);

// Younger prospects carry more upside dial; older ones are more NBA-ready now.
{
  const young = rows.filter((row) => row.age <= 19);
  const old = rows.filter((row) => row.age >= 22);
  assert.ok(young.length > 40 && old.length > 40, "need age samples");
  // Peak growth (peak − rookie) should be larger for the kids on average.
  const youngLift = mean(young.map((row) => row.peak - row.rookie));
  const oldLift = mean(old.map((row) => row.peak - row.rookie));
  assert.ok(
    youngLift > oldLift + 0.15,
    `young lift ${youngLift.toFixed(2)} vs old ${oldLift.toFixed(2)}`
  );
}

console.log("draft class ok", CLASSES);
