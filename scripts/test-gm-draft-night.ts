/**
 * Interactive draft night: names on the board, one-pick pace, sleepers, trade slots.
 * Run: npx tsx scripts/test-gm-draft-night.ts
 */
import assert from "node:assert/strict";

import {
  applyDraftNightTrade,
  classMockBoard,
  draftNightOffers,
  draftPickLog,
  ensureDraftOrder,
  expandDraftOrder,
  fallingProspects,
  pickOwnerAt,
} from "../src/gm/engine/draft-room";
import {
  advanceOneDraftPick,
  runDraftPick,
} from "../src/gm/engine/progression";
import { createRng } from "../src/gm/engine/rng";
import { createDraftClass } from "../src/gm/seed/prospect-identities";
import { displayPlayerName, displayPlayerSubtitle } from "../src/gm/lib/selectors";
import type { GmLeagueState, GmPlayer, GmTeam } from "../src/gm/types";

function club(id: string, abbr: string): GmTeam {
  return {
    id,
    abbr,
    city: abbr,
    name: abbr,
    conference: "East",
    division: "Atlantic",
    starters: { PG: "", SG: "", SF: "", PF: "", C: "" },
    benchOrder: [],
    draftPicks: [
      {
        id: `pick-${id}-fut`,
        season: 2028,
        round: 1,
        originalTeamId: id,
        ownerTeamId: id,
      },
    ],
    staff: { scout: null, trainerLevel: 1, coachLevel: 1 },
    ownerGoal: "compete",
    payrollM: 140,
  } as GmTeam;
}

function leagueFromClass(klass: GmPlayer[]): GmLeagueState {
  const teams = [club("bos", "BOS"), club("det", "DET"), club("cha", "CHA"), club("was", "WAS")];
  const lotteryOrder = teams.map((team) => team.id);
  return {
    id: "test-draft",
    season: 2027,
    day: 200,
    phase: "draft",
    userTeamId: "bos",
    teams,
    players: klass,
    freeAgents: [],
    draftPool: klass.map((player) => player.id),
    schedule: [],
    standings: {},
    boxScores: [],
    news: [],
    tradeLog: [],
    lotteryOrder,
    draftOrder: expandDraftOrder(lotteryOrder),
    draftPickIndex: 0,
    updatedAt: new Date().toISOString(),
  } as GmLeagueState;
}

const rng = createRng(42);
const klass = createDraftClass({
  count: 40,
  seasonEndYear: 2027,
  scoutLevel: 4,
  rng,
  seal: (player) => player,
});

for (const player of klass) {
  assert.ok(player.name && player.name !== "Prospect");
  assert.equal(displayPlayerName(player), player.name);
  if (player.codename) {
    assert.equal(displayPlayerSubtitle(player), player.codename);
  }
}

let state = leagueFromClass(klass);
assert.equal(pickOwnerAt(state, 0), "bos");

// User is on the clock first. CPU next-pick is a no-op.
const stuck = advanceOneDraftPick(state);
assert.equal(stuck.draftPickIndex ?? 0, 0);

// Move BOS off the clock by swapping with DET at slot 0 conceptually: draft DET first via order
state = {
  ...state,
  draftOrder: ["det", "bos", "cha", "was", "det", "bos", "cha", "was"],
  draftPickIndex: 0,
};
const after = advanceOneDraftPick(state);
assert.equal(after.draftPickIndex, 1);
assert.ok(draftPickLog(after).length === 1);
const first = draftPickLog(after)[0]!;
assert.equal(first.teamId, "det");
assert.ok(first.player.name.length > 2);

const mock = classMockBoard(after);
assert.ok(mock.length >= 30);
const fallers = fallingProspects({ ...after, draftPickIndex: 12 }, 3);
assert.ok(Array.isArray(fallers));

// Trade: BOS (slot 1) trades up to slot 0 with DET
state = ensureDraftOrder({
  ...after,
  draftPickIndex: 0,
  draftOrder: ["det", "bos", "cha", "was", "det", "bos", "cha", "was"],
  userTeamId: "bos",
});
const offers = draftNightOffers(state);
assert.ok(offers.some((offer) => offer.direction === "up"), "expected a trade-up call");
const up = offers.find((offer) => offer.direction === "up")!;
const traded = applyDraftNightTrade(state, up);
assert.equal(traded.draftOrder?.[0], "bos");
assert.equal(traded.draftOrder?.[1], "det");

const picked = runDraftPick(traded, "bos", traded.draftPool[0]!);
assert.match(picked.news[0]!.headline, /selects /);
assert.ok(!picked.news[0]!.headline.includes("it's"));

console.log("draft night ok", displayPlayerName(klass[0]!), draftPickLog(after)[0]?.pick);
