import assert from "node:assert/strict";
import test from "node:test";

import { considerIncomingOffer, offerDay, offerIsFair } from "../src/gm/engine/offers";
import { evaluateTrade } from "../src/gm/engine/trades";
import { contractSurplusM, pickStars, playerStars, projectedSlot, tradeStance } from "../src/gm/engine/value";
import type { GmLeagueState, GmPlayer, GmTeam } from "../src/gm/types";

function player(id: string, teamId: string, overall: number, age: number, salary = 12): GmPlayer {
  return {
    id,
    name: id,
    teamId,
    position: "SF",
    age,
    heightIn: 79,
    weightLbs: 220,
    ratings: {
      impact: 2,
      offense: 2,
      defense: 1,
      shooting: 70,
      finishing: 70,
      playmaking: 70,
      rebounding: 50,
      durability: 80,
      potential: 2,
    },
    sheet: { overall, attributes: {} as never, tendencies: {} as never, potential: {} as never },
    scouted: { impact: 1, offense: 1, defense: 1, uncertainty: 0 },
    contract: { annualSalaryM: salary, yearsRemaining: 3, birdRights: "bird", signedSeason: 2025 },
    injury: null,
    morale: 70,
    personality: 0,
    minutesPreference: 32,
  } as GmPlayer;
}

function team(id: string, goal: "contend" | "tank" = "contend"): GmTeam {
  return {
    id,
    abbr: id.toUpperCase(),
    city: id,
    name: "Club",
    conference: "East",
    division: "Atlantic",
    ownerGoal: goal,
    staff: { headCoach: { name: "Coach", offenseBonus: 0, defenseBonus: 0, developmentBonus: 0 }, scoutLevel: 1, trainerLevel: 1 },
    starters: { PG: null, SG: null, SF: null, PF: null, C: null },
    benchOrder: [],
    draftPicks: [
      { id: `${id}-now`, season: 2027, round: 1, originalTeamId: id, ownerTeamId: id },
      { id: `${id}-next`, season: 2028, round: 1, originalTeamId: id, ownerTeamId: id },
    ],
    tradeExceptionsM: [],
  } as GmTeam;
}

test("stars follow overall and age, and the contract is a separate surplus", () => {
  const star = player("star", "bos", 92, 24, 35);
  const prospect = player("kid", "bos", 78, 20, 8);
  const vet = player("vet", "bos", 78, 35, 40);
  const bench = player("end", "bos", 62, 28, 3);
  assert.equal(playerStars(star), 5);
  assert.equal(playerStars(player("tatum", "bos", 82, 28, 58)), 5);
  assert.ok(playerStars(player("towns", "nyk", 80, 30, 57)) >= 4.5);
  assert.ok(playerStars(prospect) >= 3.5);
  assert.ok(playerStars(vet) < playerStars(prospect));
  assert.ok(playerStars(bench) <= 1.5);
  assert.ok((contractSurplusM(prospect) ?? 0) > (contractSurplusM(vet) ?? 0));
});

test("a bad team's pick projects earlier than a good team's pick", () => {
  const bad = team("bad", "tank");
  const good = team("good");
  const league = {
    season: 2027,
    userTeamId: "bos",
    teams: [bad, good, team("bos")],
    players: [
      player("a", "bad", 68, 24),
      player("b", "good", 88, 26),
      player("c", "bos", 80, 26),
    ],
    standings: {
      bad: { teamId: "bad", wins: 12, losses: 40, confWins: 0, confLosses: 0, pointsFor: 0, pointsAgainst: 0 },
      good: { teamId: "good", wins: 40, losses: 12, confWins: 0, confLosses: 0, pointsFor: 0, pointsAgainst: 0 },
      bos: { teamId: "bos", wins: 26, losses: 26, confWins: 0, confLosses: 0, pointsFor: 0, pointsAgainst: 0 },
    },
    phase: "regular",
    day: 14,
    news: [],
    draftPool: [],
    tradeLog: [],
    settings: { salaryCapM: 165, luxuryTaxM: 180, firstApronM: 190, secondApronM: 200, maxRoster: 15, minRoster: 14, seasonLength: 82 },
  } as unknown as GmLeagueState;
  const badPick = bad.draftPicks[0]!;
  const goodPick = good.draftPicks[0]!;
  assert.ok(projectedSlot(league, badPick) < projectedSlot(league, goodPick));
  assert.ok(pickStars(league, badPick) > pickStars(league, goodPick));
  const protectedPick = { ...badPick, id: "prot", protectionTopN: 4 };
  assert.ok(pickStars(league, protectedPick) < pickStars(league, badPick));

  const even = player("mine", "bos", 80, 26, 20);
  const match = player("theirs", "bad", 80, 26, 20);
  league.players.push(even, match);
  assert.equal(offerDay(14, false), true);
  assert.equal(offerDay(11, false), false);
  const offered = considerIncomingOffer(league);
  assert.ok(offered.incomingOffer, "a fair offer should be waiting");
  assert.equal(
    offerIsFair(
      league,
      offered.incomingOffer.fromTeamId,
      "bos",
      offered.incomingOffer.fromAssets,
      offered.incomingOffer.toAssets
    ).ok,
    true
  );
  assert.equal(considerIncomingOffer(offered).incomingOffer?.id, offered.incomingOffer.id);
  assert.equal(tradeStance(league, "good"), "buy");
  assert.equal(tradeStance(league, "bad"), "sell");

  const vet = player("old", "bad", 74, 36, 30);
  const late = { id: "late", season: 2027, round: 2, originalTeamId: "good", ownerTeamId: "good" };
  const seller = {
    ...league,
    players: [...league.players, vet],
    teams: league.teams.map((entry) =>
      entry.id === "good" ? { ...entry, draftPicks: [...entry.draftPicks, late] } : entry
    ),
  };
  const stayClub = { ...team("mid"), ownerGoal: "retool" as const };
  const stayLeague = {
    ...seller,
    teams: [...seller.teams, stayClub],
    standings: {
      ...seller.standings,
      mid: { teamId: "mid", wins: 26, losses: 26, confWins: 0, confLosses: 0, pointsFor: 0, pointsAgainst: 0 },
    },
  };
  assert.equal(tradeStance(stayLeague, "mid"), "stay");
  const sold = evaluateTrade(
    stayLeague,
    "bos",
    "bad",
    [{ type: "pick", id: late.id }],
    [{ type: "player", id: vet.id }]
  );
  const held = evaluateTrade(
    stayLeague,
    "bos",
    "mid",
    [{ type: "pick", id: late.id }],
    [{ type: "player", id: vet.id }]
  );
  assert.equal(sold.ok, true, sold.reason);
  assert.equal(held.ok, false);
});
