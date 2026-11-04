/**
 * Trade-market signals, rival pricing, CPU calendar windows, and save/reload.
 * Run: npx tsx scripts/test-gm-trade-market.ts
 */
import assert from "node:assert/strict";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import {
  advanceTradeMarket, evaluateTrade, findPlayerPackages, refreshTradeBlocks,
} from "../src/gm/engine/trades";
import {
  buildTradeMarket, marketForDisplay, tradeCompetitionMultiplier,
  tradeWindowDeadline, wantsTrade,
} from "../src/gm/engine/trade-market";
import type { GmLeagueState, GmPlayer, GmTradeAsset } from "../src/gm/types";
import { findSelectedTradePackages } from "../src/gm/engine/trade-finder";

const seeded = createGeneratedLeague({
  userTeamId: "bos", season: 2026, seed: 19,
});
const mine = seeded.players.find(p => p.teamId === "bos" && p.contract)!;
const partner = seeded.players.find(p => p.teamId === "nyk" && p.contract)!;
const userBlocks = seeded.teams.map(team =>
  team.id === "bos" ? { ...team, tradeBlock: [mine.id], untouchables: [] } : team);
const league: GmLeagueState = {
  ...seeded, phase: "regular", day: 55, tradeDeadlinePassed: false,
  teams: userBlocks, tradeMarket: undefined,
};
const pulse = buildTradeMarket(league);
assert.equal(pulse.season, league.season);
assert.ok(pulse.rumors.some(row => row.playerId === mine.id && row.signal === "listed"),
  "the human GM's trade block should surface in market intel");
for (const rumor of pulse.rumors) {
  assert.ok(league.players.some(p => p.id === rumor.playerId && p.teamId === rumor.teamId),
    "rumors must belong to currently rostered players");
  assert.ok(rumor.interestedTeamIds.every(id => id !== rumor.teamId && id !== league.userTeamId),
    "rival interest is from other CPU front offices");
  assert.ok(new Set(rumor.interestedTeamIds).size === rumor.interestedTeamIds.length);
}

const request = {
  ...mine, morale: 12,
  seasonLine: { gp: 28 } as NonNullable<GmPlayer["seasonLine"]>,
};
assert.equal(wantsTrade(request), true, "genuinely unhappy players can request a trade");
assert.equal(wantsTrade({ ...request, seasonLine: { gp: 5 } as NonNullable<GmPlayer["seasonLine"]> }), false,
  "new arrivals do not make trade requests after just five games");
const requestLeague: GmLeagueState = {
  ...league,
  teams: league.teams.map(team =>
    team.id === "bos" ? { ...team, tradeBlock: [] } : team),
  players: league.players.map(p => p.id === mine.id ? request : p),
};
assert.equal(buildTradeMarket(requestLeague).rumors.find(row => row.playerId === mine.id)?.signal,
  "request", "an actual request should be distinct from front-office shopping");

const preserved = refreshTradeBlocks(league);
assert.deepEqual(preserved.teams.find(t => t.id === "bos")?.tradeBlock, [mine.id],
  "CPU routines cannot overwrite the human GM's trade block");

const rivalMarket: GmLeagueState = {
  ...league,
  tradeMarket: {
    season: league.season, lastPulseDay: league.day,
    rumors: [{
      playerId: partner.id, teamId: "nyk", signal: "listed",
      interestedTeamIds: ["chi", "dal", "cle"], urgency: "active",
    }],
  },
};
assert.equal(tradeCompetitionMultiplier(rivalMarket, partner.id, "nyk") > 1, true);
assert.equal(tradeCompetitionMultiplier({
  ...rivalMarket, day: rivalMarket.day + 19,
}, partner.id, "nyk"), 1, "outdated rumors cannot raise asking prices");
const quietLeague: GmLeagueState = {
  ...league,
  tradeMarket: {
    season: league.season, lastPulseDay: league.day, rumors: [],
  },
};
const possible = findPlayerPackages(quietLeague, "bos", partner.id)[0];
if (possible) {
  const base = evaluateTrade(quietLeague, "bos", "nyk", possible.youSend, possible.youReceive);
  const contested = evaluateTrade(rivalMarket, "bos", "nyk", possible.youSend, possible.youReceive);
  assert.ok(contested.toValue > base.toValue,
    "competing scouting interest must affect the actual acceptance evaluator");
}
assert.deepEqual(marketForDisplay({ ...league, tradeMarket: pulse }), pulse,
  "a current market snapshot remains stable through save/reload");

// Trade Finder supports whole multi-asset packages, picks-only searches, and
// browsing without a starting player. It may only return genuinely accepted deals.
const ownPicks = league.teams.find(t => t.id === "bos")!.draftPicks.filter(p => !p.frozen);
const rivalPicks = league.teams.find(t => t.id === "nyk")!.draftPicks.filter(p => !p.frozen);
assert.ok(ownPicks.length > 0 && rivalPicks.length > 0);
const extraMine = league.players.find(p => p.teamId === "bos" && p.contract && p.id !== mine.id)!;
const relaxed: GmLeagueState = {
  ...quietLeague,
  settings: { ...quietLeague.settings, tradeDifficulty: 0.5 },
  teams: quietLeague.teams.map(t => ({ ...t, untouchables: [] })),
};
const pick = (id: string): GmTradeAsset => ({ type: "pick", id });
const player = (id: string): GmTradeAsset => ({ type: "player", id });
const cases = [
  { name: "no selection", sent: [], received: [], partnerId: undefined },
  { name: "one pick", sent: [pick(ownPicks[0]!.id)], received: [], partnerId: undefined },
  { name: "player and pick", sent: [player(mine.id), pick(ownPicks[0]!.id)], received: [], partnerId: undefined },
  { name: "multiple players and a pick", sent: [player(mine.id), player(extraMine.id), pick(ownPicks[0]!.id)], received: [], partnerId: undefined },
  { name: "request a rival pick", sent: [], received: [pick(rivalPicks[0]!.id)], partnerId: "nyk" },
  { name: "both sides locked", sent: [player(mine.id), pick(ownPicks[0]!.id)], received: [player(partner.id)], partnerId: "nyk" },
];
for (const example of cases) {
  const found = findSelectedTradePackages(relaxed, "bos", example.sent, example.received, example.partnerId);
  assert.ok(found.length <= 8, example.name + ": keep the UI manageable");
  assert.equal(new Set(found.map(pack => pack.partnerId + "|" +
    pack.youSend.map(a => a.id).sort().join(",") + "=>" +
    pack.youReceive.map(a => a.id).sort().join(","))).size, found.length,
    example.name + ": unique packages");
  for (const offer of found) {
    assert.ok(example.sent.every(a => offer.youSend.some(p => p.type === a.type && p.id === a.id)),
      example.name + ": retain every selected outgoing asset");
    assert.ok(example.received.every(a => offer.youReceive.some(p => p.type === a.type && p.id === a.id)),
      example.name + ": retain every selected incoming asset");
    if (example.received.length) assert.equal(offer.partnerId, "nyk",
      "an incoming player or pick belongs to exactly one trade partner");
    assert.equal(evaluateTrade(relaxed, "bos", offer.partnerId, offer.youSend, offer.youReceive).ok, true,
      example.name + ": proposals must clear the actual CPU rules and valuation");
  }
}
assert.ok(findSelectedTradePackages(relaxed, "bos", [], []).length > 0,
  "with an open market the finder should return viable offers even without an anchor");
assert.deepEqual(findSelectedTradePackages({
  ...relaxed, tradeDeadlinePassed: true,
}, "bos", [], []), [], "closed trade windows never recommend deals");
assert.ok(findSelectedTradePackages({ ...relaxed, phase: "offseason", tradeDeadlinePassed: false }, "bos", [], []).length > 0,
  "finder must honor the same open trading window as proposal submission outside the regular season");
assert.deepEqual(findSelectedTradePackages(relaxed, "bos", [],
  [pick(rivalPicks[0]!.id), pick(ownPicks[0]!.id)], "nyk"), [],
  "finder cannot quietly assemble a cross-team package");

const deadline = tradeWindowDeadline(league);
const scheduleWindows = [0.31, 0.55, 0.76].map(p => Math.round(deadline * p));
let next: GmLeagueState = {
  ...league, day: scheduleWindows[0]!, tradeMarket: undefined,
};
const openingUserRoster = new Set(next.players.filter(p => p.teamId === "bos").map(p => p.id));
const first = advanceTradeMarket(next);
assert.equal(first.tradeMarket?.lastCpuDealWindow, 0,
  "the first CPU market window should be recorded, even if no trade clears");
assert.equal(first.tradeLog.length - next.tradeLog.length <= 1, true,
  "each midseason window can complete at most one CPU trade");
assert.deepEqual(
  new Set(first.players.filter(p => p.teamId === "bos").map(p => p.id)),
  openingUserRoster, "CPU-to-CPU activity cannot touch user players");
assert.deepEqual(first.teams.find(t => t.id === "bos")?.tradeBlock, [mine.id]);
const replay = advanceTradeMarket(first);
assert.equal(replay.tradeLog.length, first.tradeLog.length,
  "the market cannot execute its window twice on reload or same-day actions");
assert.equal(replay.tradeMarket?.lastCpuDealWindow, 0);
next = {
  ...replay, day: scheduleWindows[1]!,
};
const second = advanceTradeMarket(next);
assert.equal(second.tradeMarket?.lastCpuDealWindow, 1);
assert.ok(second.tradeLog.length - first.tradeLog.length <= 1);
const resumedLegacy = advanceTradeMarket({
  ...league, day: scheduleWindows[2]! + 2, tradeMarket: undefined,
});
assert.equal(resumedLegacy.tradeMarket?.lastCpuDealWindow, 2,
  "loading an old midseason save cannot replay every earlier CPU window");
const resumedAgain = advanceTradeMarket({
  ...resumedLegacy, day: resumedLegacy.day + 1,
});
assert.equal(resumedAgain.tradeLog.length, resumedLegacy.tradeLog.length,
  "a restored league should not run a burst of delayed trades");
const closed = advanceTradeMarket({
  ...second, day: deadline, tradeDeadlinePassed: true,
});
assert.equal(closed.tradeLog.length, second.tradeLog.length);
assert.deepEqual(buildTradeMarket(closed).rumors, [],
  "deadline-closed leagues should not display active trade leads");

console.log("gm living trade market: ok");
console.log(JSON.stringify({
  firstWindowDeals: first.tradeLog.length - league.tradeLog.length,
  secondWindowDeals: second.tradeLog.length - first.tradeLog.length,
  firstWindow: scheduleWindows[0],
  secondWindow: scheduleWindows[1],
  rumors: pulse.rumors.length,
}));
