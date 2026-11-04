/** Exact statistical/physical draw audit for the 2027 NBA 3-2-1 lottery. */
import assert from "node:assert/strict";
import { createRng } from "../src/gm/engine/rng";
import { draw321PhysicalUrn, build321BallPool } from "../src/gm/engine/lottery-balls";
import { drawDraftLottery } from "../src/gm/engine/standings";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { prepareFranchise, parseFranchise, exportFranchise } from "../src/gm/engine/franchise";
import { createPlayInBoard } from "../src/gm/engine/play-in";

const teams = Array.from({ length: 16 }, (_, i) => "team-" + (i + 1));
const weight = new Map(teams.map((id, i) => [id, i < 3 ? 2 : i < 10 ? 3 : i < 14 ? 2 : 1]));
const relegated = new Set(teams.slice(0, 3));
const pool = build321BallPool(teams, weight);
assert.equal(pool.length, 37);
assert.equal(new Set(pool.map(ball => ball.id)).size, 37);
assert.deepEqual(pool.map(ball => ball.id), Array.from({ length: 37 }, (_, i) => i + 1));
assert.deepEqual(teams.map(id => pool.filter(ball => ball.teamId === id).length),
  [2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 1, 1]);

const one = (seed: number, previousWinner?: string, previousTopFive = new Set<string>()) =>
  draw321PhysicalUrn({ eligible: teams, weights: weight, relegated,
    previousWinner, previousTopFive, random: createRng(seed) });
const first = one(99);
assert.deepEqual(one(99), first, "a seed must reproduce the physical ball trace");
assert.equal(first.draws.length, 16);
assert.deepEqual(first.ballPool, pool);
assert.equal(new Set(first.draws.map(draw => draw.teamId)).size, 16);
assert.ok(first.draws.every(draw => {
  const last = draw.attempts.at(-1);
  return last?.accepted && draw.balls[0] === last.ballId &&
    pool.some(ball => ball.id === last.ballId && ball.teamId === draw.teamId);
}), "a drawn ball must be real, uniquely owned, and the final accepted attempt");
assert.ok(first.draws.every(draw => draw.attempts.every(event =>
  pool.some(ball => ball.id === event.ballId && ball.teamId === event.teamId)
)), "all rejected and accepted balls originate in the physical urn");
assert.ok(first.draws.slice(12).every(draw => !relegated.has(draw.teamId)),
  "the bottom three must never be selected #13–16");

const restricted = one(99, first.draws[0]!.teamId,
  new Set(first.draws.slice(0, 5).map(draw => draw.teamId)));
assert.notEqual(restricted.draws[0]!.teamId, first.draws[0]!.teamId);
assert.ok(restricted.draws.slice(0, 5).every(draw => !new Set(first.draws.slice(0,5).map(x => x.teamId)).has(draw.teamId)));
assert.ok(restricted.draws.slice(12).every(draw => !relegated.has(draw.teamId)));
const used = new Set<string>();
for (const draw of restricted.draws) {
  for (const attempt of draw.attempts) {
    assert.ok(!used.has(attempt.teamId), "winning teams must leave the urn");
    if (attempt.accepted) assert.equal(attempt.teamId, draw.teamId);
  }
  used.add(draw.teamId);
}
assert.ok(restricted.draws.every(draw => draw.attempts.length >= 1));

const counts = new Map(teams.map(id => [id, 0]));
const samples = 8000;
for (let i = 1; i <= samples; i++) {
  const result = one(i * 1664525 + 1013904223);
  const winner = result.draws[0]!.teamId;
  counts.set(winner, counts.get(winner)! + 1);
}
// Without prior-year restrictions, exact first-draw theoretical odds are
// proportional to physical balls: 2/37, 3/37 or 1/37.
for (const id of teams) {
  const expected = weight.get(id)! / 37;
  const observed = counts.get(id)! / samples;
  assert.ok(Math.abs(observed - expected) < 0.015,
    "first-pick distribution must track the actual ball weights: " +
    JSON.stringify({ team: id, expected, observed }));
}
assert.ok(counts.get(teams[3]!)! > counts.get(teams[15]!)! * 1.9,
  "three balls must be materially better than one");

const league = prepareFranchise(createGeneratedLeague({ userTeamId: "bos", season: 2028, seed: 424 }));
const state = { ...league, playIn: createPlayInBoard(league) ?? undefined };
const draw = drawDraftLottery(state);
assert.equal(draw.format, "321");
assert.equal(draw.lotteryCount, 16);
assert.equal(draw.ballPool?.length, 37);
assert.equal(draw.draws.length, 16);
assert.deepEqual(drawDraftLottery(state), draw);
assert.equal(new Set(draw.draws.map(x => x.balls[0])).size, 16,
  "each pick must come from a unique extracted ball");
const persisted = parseFranchise(exportFranchise({
  ...state, lotteryOrder: draw.order, lotteryDraws: draw.draws,
  lotteryBallPool: draw.ballPool, lotteryCount: draw.lotteryCount, lotteryFormat: draw.format,
}));
assert.deepEqual(persisted.lotteryDraws, draw.draws, "saved pulls and rerolls survive reload");
assert.deepEqual(persisted.lotteryBallPool, draw.ballPool, "all physical balls survive reload");

// Classic format must still use four distinct physical numbers per pick and
// return the balls for the next selection, independent of modern rules.
const classicLeague = prepareFranchise(createGeneratedLeague({ userTeamId:"bos",season:2026,seed:124 }));
const classic = drawDraftLottery(classicLeague);
assert.equal(classic.format, "classic");
assert.equal(classic.draws.length, 4);
assert.ok(classic.draws.every(d => d.balls.length === 4 &&
  new Set(d.balls).size === 4 && d.balls.every(n => n >= 1 && n <= 14)));
console.log("37-ball urn: exact weights, 8000-draw first-pick odds, individual ball traces, eligibility, relegation floor, no repeat winners, classic combinations and save reload passed.");
