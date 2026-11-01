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
  isDraftComplete,
  pickOwnerAt,
  shouldShowDraftResults,
  userDraftPicks,
} from "../src/gm/engine/draft-room";
import {
  advanceOneDraftPick,
  finishDraftWithAi,
  runDraftPick,
} from "../src/gm/engine/progression";
import { createRng } from "../src/gm/engine/rng";
import { sealProspect } from "../src/gm/engine/scouting";
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
      {
        id: `pick-${id}-fut2`,
        season: 2029,
        round: 1,
        originalTeamId: id,
        ownerTeamId: id,
      },
      {
        id: `pick-${id}-2nd`,
        season: 2028,
        round: 2,
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
  seal: (player, scoutLevel, boardIndex, roll) =>
    sealProspect(player, scoutLevel, boardIndex, roll),
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
assert.ok(up.youSend.length >= 2, "trade-up to #1 must attach future picks");
assert.ok(
  up.youSend.some((line) => line.includes("#2 tonight")),
  `youSend should name tonight's slot: ${up.youSend.join(" | ")}`
);
assert.ok(
  up.youGet.some((line) => line.includes("#1 tonight")),
  `youGet should name #1: ${up.youGet.join(" | ")}`
);
assert.ok(
  up.youSendPoints >= up.youGetPoints * 0.9,
  "package must nearly cover #1 value"
);
assert.ok(up.upSweetenerIds.length >= 1, "sweeteners required to buy #1");
const traded = applyDraftNightTrade(state, up);
assert.equal(traded.draftOrder?.[0], "bos");
assert.equal(traded.draftOrder?.[1], "det");
assert.ok(
  up.youSend.filter(line=>!line.includes("tonight")).every(line=>traded.news[0]?.body.includes(line)),
  "news should list futures moved"
);

// Holding #1: partners must overpay with tonight's later slot + futures.
const onClock = draftNightOffers({
  ...state,
  draftOrder: ["bos", "det", "cha", "was", "bos", "det", "cha", "was"],
  draftPickIndex: 0,
  userTeamId: "bos",
});
assert.ok(onClock.length >= 1, "expected clubs to call for #1");
for (const offer of onClock) {
  assert.equal(offer.direction, "down");
  assert.ok(offer.youSend.some((line) => line.includes("#1 tonight")));
  assert.ok(offer.youGet.length >= 2, "selling #1 returns laterslot + futures");
  assert.ok(offer.youGetPoints + 0.5 >= offer.youSendPoints * 0.9);
}

// Fog: board profiles hide true OVR; comps + grades are what you draft on.
const fogged = traded.players.find((p) => p.id === traded.draftPool[0]!);
assert.ok(fogged?.scoutProfile?.grades);
assert.ok(
  fogged?.scoutProfile?.compCeiling || fogged?.scoutProfile?.comps?.length,
  "expected ceiling/floor comps on the dossier"
);

const picked = runDraftPick(traded, "bos", traded.draftPool[0]!);
assert.match(picked.news[0]!.headline, /selects |lands a Superstar|hits on an X-Factor/);
assert.match(picked.news[0]!.body, /Overall \d+|Dev trait:/);
assert.ok(!picked.news[0]!.headline.includes("it's"));
const drafted = picked.players.find((p) => p.draftPick === 1);
assert.ok(drafted?.sheet?.potential?.trait, "trait stamps on pick");

// Finish a clean board: recap helpers see every pick in order.
const finished = finishDraftWithAi(leagueFromClass(klass));
assert.equal(isDraftComplete(finished), true);
assert.equal(shouldShowDraftResults(finished), true);
const fullLog = draftPickLog(finished);
assert.equal(fullLog.length, 8, "four teams × two rounds");
assert.ok(
  fullLog.every((row, i) => row.pick === i + 1),
  "picks listed 1…N in draft order"
);
const mine = userDraftPicks(finished);
assert.ok(mine.length >= 1, "user should have selections");
assert.ok(mine.every((row) => row.teamId === "bos"));
// After free agency starts, the recap still shows this class.
const summer = { ...finished, phase: "free_agency" as const, draftPool: [] as string[] };
assert.equal(shouldShowDraftResults(summer), true);
assert.equal(isDraftComplete(summer), false);

console.log("draft night ok", displayPlayerName(klass[0]!), draftPickLog(after)[0]?.pick);

