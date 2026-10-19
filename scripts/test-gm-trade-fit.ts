/**
 * CPU trades must fill roster holes, not swap peers.
 * Run: npx tsx scripts/test-gm-trade-fit.ts
 */
import assert from "node:assert/strict";

import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { considerIncomingOffer, offerDay } from "../src/gm/engine/offers";
import { cpuDeadlineTrades } from "../src/gm/engine/trades";
import {
  dealImprovesFit,
  rosterProfile,
  wantScore,
} from "../src/gm/engine/roster-fit";
import { overallOf } from "../src/gm/engine/lineup";
import { tradeStance } from "../src/gm/engine/value";
import type { GmLeagueState, GmPlayer, GmTeam } from "../src/gm/types";

function forceRecord(
  league: GmLeagueState,
  teamId: string,
  wins: number,
  losses: number
): GmLeagueState {
  return {
    ...league,
    standings: {
      ...league.standings,
      [teamId]: {
        ...(league.standings[teamId] ?? {
          teamId,
          wins: 0,
          losses: 0,
          confWins: 0,
          confLosses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
        }),
        wins,
        losses,
      },
    },
  };
}

function withOverall(player: GmPlayer, overall: number): GmPlayer {
  const sheet = player.sheet
    ? { ...player.sheet, overall }
    : {
        overall,
        attributes: {} as never,
        tendencies: {} as never,
        potential: {} as never,
        version: 1,
      };
  return {
    ...player,
    sheet,
    ratings: {
      ...player.ratings,
      impact: (overall - 68) / 3.2,
    },
  };
}

function boostPos(
  league: GmLeagueState,
  teamId: string,
  position: GmPlayer["position"],
  ovrBump: number
): GmLeagueState {
  return {
    ...league,
    players: league.players.map((player) => {
      if (player.teamId !== teamId || player.position !== position) return player;
      return withOverall(player, Math.min(92, overallOf(player) + ovrBump));
    }),
  };
}

function gutPos(
  league: GmLeagueState,
  teamId: string,
  position: GmPlayer["position"]
): GmLeagueState {
  return {
    ...league,
    players: league.players.map((player) => {
      if (player.teamId !== teamId || player.position !== position) return player;
      return withOverall(player, Math.min(overallOf(player), 68));
    }),
  };
}

let league = createGeneratedLeague({
  userTeamId: "bos",
  season: 2026,
  seed: 19,
});

// Make BOS a buyer with a center hole; CHA a seller stacked at C.
league = forceRecord(league, "bos", 28, 12);
league = forceRecord(league, "cha", 9, 31);
league = {
  ...league,
  teams: league.teams.map((team: GmTeam) => {
    if (team.id === "bos") return { ...team, ownerGoal: "contend" as const };
    if (team.id === "cha") return { ...team, ownerGoal: "tank" as const };
    return team;
  }),
};
league = gutPos(league, "bos", "C");
league = boostPos(league, "bos", "PG", 4);
league = boostPos(league, "bos", "SG", 4);
league = boostPos(league, "bos", "SF", 4);
league = boostPos(league, "bos", "PF", 4);
league = boostPos(league, "cha", "C", 10);
league = {
  ...league,
  phase: "regular",
  day: 14,
  tradeDeadlinePassed: false,
  incomingOffer: undefined,
};

assert.equal(tradeStance(league, "bos"), "buy");
assert.equal(tradeStance(league, "cha"), "sell");

const bosProfile = rosterProfile(league, "bos");
assert.equal(bosProfile.needs[0], "C", "BOS should need a center");

const chaCenters = league.players
  .filter((p) => p.teamId === "cha" && p.position === "C" && p.contract)
  .sort((a, b) => overallOf(b) - overallOf(a));
assert.ok(chaCenters.length >= 1, "CHA has a center");
const target = chaCenters[0]!;
assert.ok(wantScore(bosProfile, target) > 20, "BOS should want CHA's center");

// Lateral same-position peers are rejected.
const peerA = league.players.find(
  (p) => p.teamId === "bos" && p.position === "SG" && p.contract
)!;
const peerB = league.players.find(
  (p) => p.teamId === "nyk" && p.position === "SG" && p.contract
)!;
assert.equal(
  dealImprovesFit(league, "bos", "nyk", [peerA], [peerB]),
  false,
  "peer SG swap is not a fit win"
);

assert.equal(offerDay(14, false), true);
const offered = considerIncomingOffer(league);
assert.ok(offered.incomingOffer, "CPU should call with a fit-based offer");

const offer = offered.incomingOffer!;
const fromPlayers = offer.fromAssets
  .filter((a) => a.type === "player")
  .map((a) => league.players.find((p) => p.id === a.id)!)
  .filter(Boolean);
const toPlayers = offer.toAssets
  .filter((a) => a.type === "player")
  .map((a) => league.players.find((p) => p.id === a.id)!)
  .filter(Boolean);
const hasPick =
  offer.fromAssets.some((a) => a.type === "pick") ||
  offer.toAssets.some((a) => a.type === "pick");

const purePeerSwap =
  fromPlayers.length === 1 &&
  toPlayers.length === 1 &&
  fromPlayers[0]!.position === toPlayers[0]!.position &&
  Math.abs(overallOf(fromPlayers[0]!) - overallOf(toPlayers[0]!)) <= 2 &&
  !hasPick;
assert.equal(purePeerSwap, false, "incoming offer must not be a peer swap");

// Deadline deals: buyers fill holes with packages, not empty swaps.
const deadlineBase = {
  ...league,
  day: 200,
  incomingOffer: undefined,
};
const after = cpuDeadlineTrades(deadlineBase);
const newDeals = after.tradeLog.length - deadlineBase.tradeLog.length;
assert.ok(newDeals >= 1, `expected deadline deals, got ${newDeals}`);

for (const deal of after.tradeLog.slice(0, newDeals)) {
  const buyerPlayers = deal.fromAssets
    .filter((a) => a.type === "player")
    .map((a) => deadlineBase.players.find((p) => p.id === a.id)!)
    .filter(Boolean);
  const sellerPlayers = deal.toAssets
    .filter((a) => a.type === "player")
    .map((a) => deadlineBase.players.find((p) => p.id === a.id)!)
    .filter(Boolean);
  const pickInvolved =
    deal.fromAssets.some((a) => a.type === "pick") ||
    deal.toAssets.some((a) => a.type === "pick");
  const lateral =
    buyerPlayers.length === 1 &&
    sellerPlayers.length === 1 &&
    buyerPlayers[0]!.position === sellerPlayers[0]!.position &&
    Math.abs(overallOf(buyerPlayers[0]!) - overallOf(sellerPlayers[0]!)) <= 2 &&
    !pickInvolved;
  assert.equal(lateral, false, `deadline deal ${deal.id} is a peer swap`);

  // Acquired player should help a buyer need.
  const acquired = sellerPlayers[0];
  if (acquired) {
    const buyerId = deal.fromTeamId;
    const beforeNeed = rosterProfile(deadlineBase, buyerId).needs.indexOf(
      acquired.position
    );
    assert.ok(
      beforeNeed <= 2 || pickInvolved,
      `${acquired.name} should fill a top need for ${buyerId}`
    );
  }
}

console.log("gm trade fit: ok");
console.log(
  `  offer: ${offer.note}`,
  `\n  deadline deals: ${newDeals}`
);
