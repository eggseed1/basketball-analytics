/** Exact statistical/physical draw audit for the 2027 NBA 3-2-1 lottery. */
import assert from "node:assert/strict";
import { createRng } from "../src/gm/engine/rng";
import { createLotteryHoleScene, LOTTERY_HOLE, simulateLotteryHoleExit } from "../src/gm/engine/lottery-hole-physics";
import { legalNew321PickProtection } from "../src/gm/engine/lottery-balls";
import { draw321PhysicalUrn, build321BallPool } from "../src/gm/engine/lottery-balls";
import { drawDraftLottery } from "../src/gm/engine/standings";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { prepareFranchise, parseFranchise, exportFranchise } from "../src/gm/engine/franchise";
import { createPlayInBoard } from "../src/gm/engine/play-in";

assert.ok(legalNew321PickProtection(2026,14), "historical pre-2027 lottery protection is unchanged");
for (const topN of [12,13,14,15]) {
  assert.equal(legalNew321PickProtection(2027,topN),false,
    "NBA prohibits attaching new protections from top-12 through top-15");
}
assert.ok(legalNew321PickProtection(2027,4));
assert.ok(legalNew321PickProtection(2027,8));
assert.ok(legalNew321PickProtection(2027,null));
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

// The physical exit, NOT a separate weighted result, must decide every draw.
// Rebuild the same chamber from the saved seed and prove each extraction
// crossed the ball-sized top opening with the same physics frame.
const remainingTeams = new Set(teams);
let totalCollisions = 0;
for (const pick of first.draws) {
  const surviving = pool.filter(ball => remainingTeams.has(ball.teamId));
  for (const attempt of pick.attempts) {
    assert.ok(Number.isInteger(attempt.physicsSeed), "every pull saves its physics seed");
    assert.ok((attempt.exitFrame ?? 0) >= LOTTERY_HOLE.openFrame);
    const replay = simulateLotteryHoleExit(surviving, attempt.physicsSeed!);
    assert.equal(replay.ballId, attempt.ballId, "physics must select the persisted numbered ball");
    assert.equal(replay.frame, attempt.exitFrame, "the exit frame must survive serialization");
    totalCollisions += replay.collisions;
    const scene = createLotteryHoleScene(surviving, attempt.physicsSeed!);
    for (let t = 0; t < replay.frame; t++) scene.step();
    assert.equal(scene.exit?.ballId, attempt.ballId);
    const escaped = scene.particles.find(ball => ball.id === attempt.ballId)!;
    assert.ok(Math.abs(escaped.x - LOTTERY_HOLE.center) <
      LOTTERY_HOLE.gapWidth / 2 - LOTTERY_HOLE.ballRadius + 1,
      "the extracted ball must fit through the actual ball-sized hole");
    assert.ok(Math.hypot(escaped.x - LOTTERY_HOLE.center,
      escaped.y - LOTTERY_HOLE.center) > LOTTERY_HOLE.radius - LOTTERY_HOLE.ballRadius,
      "the ball must really cross the chamber boundary");
  }
  remainingTeams.delete(pick.teamId);
}
assert.ok(totalCollisions > 100, "the draw must actually simulate ball-to-ball collisions");


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
const ballCounts = new Map(pool.map(ball => [ball.id, 0]));
const samples = 8000;
for (let i = 1; i <= samples; i++) {
  const result = one(i * 1664525 + 1013904223);
  const winner = result.draws[0]!.teamId;
  counts.set(winner, counts.get(winner)! + 1);
  const number = result.draws[0]!.balls[0]!;
  ballCounts.set(number, ballCounts.get(number)! + 1);
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
for (const [ballId, count] of ballCounts) {
  assert.ok(Math.abs(count / samples - 1 / 37) < 0.012,
    "ball labels and teams must not bias which physical ball escapes: " +
    JSON.stringify({ ballId, count, samples }));
}


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
console.log("37-ball physics: 8000 full-lottery draws, fair ball odds, actual hole exits, collisions, exact seeded replays, legal restrictions and save compatibility passed.");
