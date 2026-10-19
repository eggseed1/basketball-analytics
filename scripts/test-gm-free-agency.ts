/**
 * MyNBA-style free agency: moratorium → open → fill, Bird, competing bids.
 * Run: npx tsx scripts/test-gm-free-agency.ts
 */
import assert from "node:assert/strict";

import {
  advanceFaDay,
  askingSalary,
  emptyFaMarket,
  faStageLabel,
  resignOwnFreeAgent,
  runFaPeriod,
  userOfferFreeAgent,
} from "../src/gm/engine/free-agency";
import { enterFreeAgency, startNextSeason } from "../src/gm/engine/offseason";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { getCbaRules } from "../src/gm/myleague/cba-registry";
import { overallOf } from "../src/gm/engine/lineup";
import type { GmLeagueState, GmPlayer } from "../src/gm/types";

function forceExpire(player: GmPlayer, bird: "bird" | "early" | null): GmPlayer {
  if (!player.contract || player.teamId == null) return player;
  return {
    ...player,
    contract: {
      ...player.contract,
      yearsRemaining: 1,
      option: null,
      birdRights: bird ?? "none",
    },
  };
}

const base = createGeneratedLeague({
  userTeamId: "bos",
  season: 2026,
  seed: 77,
});

const bosRoster = base.players.filter((p) => p.teamId === "bos");
assert.ok(bosRoster.length >= 6, "bos roster");

const star = [...bosRoster].sort(
  (a, b) => overallOf(b) - overallOf(a)
)[0]!;
const mid = bosRoster.find((p) => p.id !== star.id)!;

const patched: GmLeagueState = {
  ...base,
  phase: "draft",
  draftPool: [],
  automation: { autoDraft: false, autoFreeAgency: false },
  players: base.players.map((p) => {
    if (p.id === star.id) return forceExpire(p, "bird");
    if (p.id === mid.id) return forceExpire(p, "early");
    // Expire one-year deals so the market is thick.
    if (p.contract && p.contract.yearsRemaining === 1 && p.teamId) {
      return forceExpire(p, p.contract.birdRights === "bird" ? "bird" : null);
    }
    return p;
  }),
};

const summer = enterFreeAgency(patched);
assert.equal(summer.phase, "free_agency");
assert.ok(summer.faMarket, "fa market created");
assert.equal(summer.faMarket!.stage, "moratorium");
assert.equal(summer.faMarket!.day, 0);
assert.match(faStageLabel(summer.faMarket), /Moratorium/);

const freeStar = summer.players.find((p) => p.id === star.id)!;
assert.equal(freeStar.teamId, null, "star hits market");
assert.equal(freeStar.rightsTeamId, "bos");
assert.equal(freeStar.rightsKind, "bird");

const rules = getCbaRules(summer.season);
const ask = askingSalary(freeStar, rules);
assert.ok(ask >= 5, `star ask should be meaningful, got ${ask}`);

// Day 1: CPU interest appears; agreements can form.
let day1 = advanceFaDay(summer);
assert.equal(day1.faMarket!.day, 1);
assert.equal(day1.faMarket!.stage, "moratorium");

// User Bird re-sign during moratorium → agreement, not yet on roster.
const resign = resignOwnFreeAgent(day1, star.id);
assert.equal(resign.ok, true, resign.ok ? "" : resign.reason);
if (resign.ok) {
  day1 = resign.state;
  const agreed = day1.faMarket!.agreements.find((r) => r.playerId === star.id);
  assert.ok(agreed, "bird agreement parked");
  assert.equal(agreed!.teamId, "bos");
  assert.equal(
    day1.players.find((p) => p.id === star.id)?.teamId,
    null,
    "moratorium does not put him on the roster yet"
  );
}

// Advance through moratorium into open.
let clock = day1;
for (let i = 0; i < 6 && clock.faMarket!.stage === "moratorium"; i++) {
  clock = advanceFaDay(clock);
}
assert.equal(clock.faMarket!.stage, "open", "open after moratorium");

// Bird agreement should lock once open runs a day (or already locked on transition).
clock = advanceFaDay(clock);
const lockedStar = clock.players.find((p) => p.id === star.id)!;
assert.equal(lockedStar.teamId, "bos", "bird deal locks in open");
assert.ok(lockedStar.contract, "has a contract");

// Competing offer: pick an unsigned free agent and underbid vs overbid.
const target =
  clock.players.find(
    (p) =>
      p.teamId == null &&
      p.rightsTeamId !== "bos" &&
      overallOf(p) >= 76 &&
      overallOf(p) < 84
  ) ?? clock.players.find((p) => p.teamId == null)!;
assert.ok(target, "unsigned FA exists");

const low = userOfferFreeAgent(clock, target.id, Math.max(1, ask * 0.2), 1);
// May fail on cap or player shopping; either is fine, just must not crash.
if (low.ok) {
  clock = low.state;
} else {
  assert.ok(low.reason.length > 0);
}

const fairAsk = askingSalary(target, rules);
const fairYears = Math.max(1, Math.min(3, Math.round(fairAsk / 8) || 2));
const fair = userOfferFreeAgent(clock, target.id, fairAsk, fairYears);
if (fair.ok) {
  clock = fair.state;
  const signed = clock.players.find((p) => p.id === target.id);
  // In open stage a fair offer often sticks; if not, pending interest is ok.
  assert.ok(
    signed?.teamId === "bos" ||
      clock.faMarket!.pending.some((r) => r.playerId === target.id) ||
      clock.faMarket!.agreements.some((r) => r.playerId === target.id),
    "fair offer lands or stays on the board"
  );
}

// Full period leaves every club near min roster.
const quiet = runFaPeriod({
  ...summer,
  faMarket: emptyFaMarket(),
  players: summer.players.map((p) =>
    p.id === star.id
      ? { ...p, teamId: null, rightsTeamId: "bos", rightsKind: "bird" as const }
      : p
  ),
});
assert.ok(quiet.faMarket?.done, "period completes");
for (const team of quiet.teams) {
  const size = quiet.players.filter((p) => p.teamId === team.id).length;
  assert.ok(
    size >= quiet.settings.minRoster - 1,
    `${team.abbr} near min (${size})`
  );
}

const next = startNextSeason(quiet);
assert.equal(next.phase, "regular");
assert.equal(next.season, 2027);
assert.equal(next.faMarket, undefined);

// Pending offer persists when the player keeps shopping.
const shopper = summer.players
  .filter((p) => p.teamId == null && overallOf(p) >= 82)
  .sort((a, b) => overallOf(b) - overallOf(a))[0];
if (shopper) {
  const openBoard = (() => {
    let s = { ...summer, faMarket: emptyFaMarket() };
    for (let i = 0; i < 6; i++) s = advanceFaDay(s);
    return s;
  })();
  const lowBid = userOfferFreeAgent(
    openBoard,
    shopper.id,
    Math.max(1.5, askingSalary(shopper, rules) * 0.55),
    1
  );
  if (!lowBid.ok && lowBid.state) {
    assert.ok(
      lowBid.state.faMarket?.pending.some(
        (row) => row.playerId === shopper.id && row.teamId === "bos"
      ),
      "low offer stays on the board while he shops"
    );
  }
}

// Bird retention across a full period.
const birdPool = summer.players.filter(
  (p) => p.teamId == null && p.rightsTeamId && p.rightsKind === "bird"
);
const retained = birdPool.filter((p) => {
  const after = quiet.players.find((row) => row.id === p.id)!;
  return after.teamId === p.rightsTeamId;
}).length;
assert.ok(
  retained / Math.max(1, birdPool.length) >= 0.85,
  `bird retention ${retained}/${birdPool.length}`
);

console.log("gm free agency: ok");
console.log(
  `  moratorium→open bird lock, FA board ${summer.freeAgents.length}, quiet unsigned ${quiet.freeAgents.length}, bird keep ${retained}/${birdPool.length}`
);
