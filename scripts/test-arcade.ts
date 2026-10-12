/**
 * Arcade games: league file parsing, Higher or Lower pools, 0-82 roster spin
 * and record projection, and teammate chains.
 * Run: npx tsx scripts/test-arcade.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  HIGHER_LOWER_STATS,
  higherLowerPool,
  judgeHigherLower,
  nextHigherLowerRow,
} from "../src/arcade/higher-lower";
import {
  DAILY_EPOCH,
  DAILY_LAST_SEASON,
  DAILY_ROUNDS,
  dailyNumber,
  dailyPuzzle,
  dailyRecordFor,
  dailyResults,
  dailyShareText,
  withGuess,
  type Guess,
} from "../src/arcade/daily";
import { parseLeague, playerLabel } from "../src/arcade/league";
import {
  buildTeammateGraph,
  chainStars,
  pickChainPuzzle,
  sharedStints,
  shortestTeammatePath,
} from "../src/arcade/teammates";
import {
  eligibleRows,
  projectedRecord,
  rosterOffers,
  spinTeamSeason,
  zero82TeamSeasons,
  ZERO_82_SLOTS,
} from "../src/arcade/zero-82";

const league = parseLeague(
  JSON.parse(
    readFileSync(path.join(process.cwd(), "public/runtime/arcade/league-seasons.json"), "utf8")
  )
);

function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 2 ** 32;
    return state / 2 ** 32;
  };
}

function pidOf(name: string): number {
  const matches = league.players.filter((p) => p.name === name);
  assert.equal(matches.length, 1, `${name} should be one player`);
  return matches[0].id;
}

function testLeague() {
  assert.equal(league.seasons[0], "1996-97");
  assert.ok(league.rows.length > 10_000);
  const ewings = league.players.filter((p) => p.name === "Patrick Ewing");
  assert.equal(ewings.length, 2, "father and son stay apart");
  assert.match(playerLabel(league, ewings[0].id), /\(b\. \d{4}\)/);
  assert.equal(playerLabel(league, pidOf("Tim Duncan")), "Tim Duncan");
}

function testHigherLower() {
  const rng = seeded(7);
  for (const stat of HIGHER_LOWER_STATS) {
    const pool = higherLowerPool(league, stat);
    assert.ok(pool.length > 3000, `${stat.id} pool ${pool.length}`);
    const a = nextHigherLowerRow(pool, stat, null, rng);
    const b = nextHigherLowerRow(pool, stat, a, rng);
    assert.notEqual(a.pid, b.pid);
    assert.notEqual(stat.value(a), stat.value(b));
  }
  assert.ok(judgeHigherLower("higher", 2, 3));
  assert.ok(!judgeHigherLower("higher", 3, 2));
  assert.ok(judgeHigherLower("lower", 3, 2));
}

function testZero82() {
  const teamSeasons = zero82TeamSeasons(league);
  assert.ok(teamSeasons.length > 800);
  assert.ok(teamSeasons.every((ts) => !ts.team.endsWith("TM")));
  const rng = seeded(11);
  const used = new Set<number>();
  const open = [...ZERO_82_SLOTS];
  while (open.length) {
    const ts = spinTeamSeason(teamSeasons, open, used, rng);
    const pick = eligibleRows(ts, open, used)[0];
    assert.ok(pick);
    used.add(pick.pid);
    open.splice(open.indexOf(pick.pos as (typeof open)[number]), 1);
  }
  const lakers = teamSeasons.find((ts) => ts.key === "1999-00|LAL")!;
  const shaqRow = lakers.rows.find((r) => r.pid === pidOf("Shaquille O'Neal"))!;
  const offers = rosterOffers(lakers, ["PG", "SG", "SF", "PF"], new Set([shaqRow.pid]));
  assert.equal(offers.length, lakers.rows.length, "the whole rotation shows");
  assert.equal(offers.find((o) => o.row.pid === shaqRow.pid)?.blocked, "on-team");
  for (const o of offers) {
    if (o.row.pid !== shaqRow.pid) assert.equal(o.blocked, o.row.pos === "C" ? "slot-filled" : null);
  }
  const slotOrder = offers.map((o) => ZERO_82_SLOTS.indexOf(o.row.pos as (typeof ZERO_82_SLOTS)[number]));
  assert.deepEqual(slotOrder, [...slotOrder].sort((a, b) => a - b));
  // Average starters with a replacement bench land below .500; stars reach 82.
  assert.equal(projectedRecord([0, 0, 0, 0, 0]).wins, 34);
  assert.equal(projectedRecord([10, 10, 10, 10, 10]).wins, 82);
  assert.equal(projectedRecord([-6, -6, -6, -6, -6]).wins, 0);
  const worst = Math.min(...league.rows.filter((r) => r.mp >= 800 && r.bpm != null).map((r) => r.bpm!));
  assert.ok(projectedRecord(Array(5).fill(worst)).wins === 0, "0-82 is reachable");
}

function testTeammates() {
  const graph = buildTeammateGraph(league);
  const shaq = pidOf("Shaquille O'Neal");
  const kobe = pidOf("Kobe Bryant");
  const lebron = pidOf("LeBron James");
  assert.ok(sharedStints(graph, shaq, kobe).includes("1999-00|LAL"));
  assert.equal(sharedStints(graph, kobe, lebron).length, 0);
  const path = shortestTeammatePath(graph, kobe, lebron);
  assert.ok(path && path.length === 3, "Kobe and LeBron share a teammate");
  const puzzle = pickChainPuzzle(graph, chainStars(league), seeded(3));
  assert.ok(puzzle.best.length >= 3 && puzzle.best.length <= 5);
}

function testDaily() {
  const a = dailyPuzzle(league, "2026-10-12");
  const b = dailyPuzzle(league, "2026-10-12");
  assert.equal(dailyNumber(DAILY_EPOCH), 1);
  assert.equal(dailyNumber("2026-10-21"), 11);
  assert.equal(a.rows.length, DAILY_ROUNDS + 1);
  assert.deepEqual(a.rows.map((r) => `${r.pid}|${r.season}`), b.rows.map((r) => `${r.pid}|${r.season}`));
  assert.equal(new Set(a.rows.map((r) => r.pid)).size, a.rows.length, "no repeat players");
  assert.ok(a.rows.every((r) => r.season <= DAILY_LAST_SEASON));
  const later = { ...league, rows: [...league.rows].reverse() };
  assert.deepEqual(
    dailyPuzzle(later, "2026-10-12").rows.map((r) => r.pid),
    a.rows.map((r) => r.pid),
    "row order in the file doesn't change the puzzle"
  );
  assert.notDeepEqual(dailyPuzzle(league, "2026-10-13").rows.map((r) => r.pid), a.rows.map((r) => r.pid));

  const right = a.rows.slice(1).map((row, i): Guess => (a.stat.value(row)! >= a.stat.value(a.rows[i]!)! ? "higher" : "lower"));
  assert.deepEqual(dailyResults(a, right), Array(DAILY_ROUNDS).fill(true));
  const text = dailyShareText(a, dailyResults(a, right), "https://drbl.io/arcade/daily");
  assert.match(text, /^DRBL Daily #2: 10\/10\n/);

  let rec = dailyRecordFor(null, "2026-10-12");
  for (const g of right) rec = withGuess(rec, g);
  assert.equal(rec.streak, 1);
  rec = dailyRecordFor(rec, "2026-10-13");
  assert.deepEqual(rec.guesses, []);
  for (const g of right) rec = withGuess(rec, g);
  assert.equal(rec.streak, 2);
  assert.equal(dailyRecordFor(rec, "2026-10-15").streak, 0, "a skipped day resets the streak");
}

testLeague();
testHigherLower();
testZero82();
testTeammates();
testDaily();
console.log("arcade: ok");
