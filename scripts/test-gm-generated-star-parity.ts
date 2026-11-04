/**
 * Generated prospects must earn genuine shot volume and elite peaks.
 * Changes must be skill/OVR linked and must not rewrite NBA observed priors.
 */
import assert from "node:assert/strict";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { prepareFranchise } from "../src/gm/engine/franchise";
import { simulationRates } from "../src/gm/engine/player-profile";
import { simulateGame } from "../src/gm/engine/simulate";
import { developmentProfileOf, softGrowthFactor } from "../src/gm/engine/development-profile";
import { advanceDynamicProgression } from "../src/gm/engine/dynamic-progression";

const league = prepareFranchise(createGeneratedLeague({ userTeamId: "bos", season: 2033, seed: 231 }));
const subject = league.players.find(p => p.teamId && p.contract && p.sheet && p.simProfile)!;
assert.ok(subject, "a generated roster player with a saved profile is required");
const baseline = { ...subject, age: 20, draftModel: 2 as const,
  sheet: { ...subject.sheet!, overall: 76,
    attributes: { ...subject.sheet!.attributes, threePoint: 73, midrange: 74, ballHandle: 72, drivingLayup: 73 } },
  ratings: { ...subject.ratings, impact: 2.5, offense: 3.5 },
  simProfile: { ...subject.simProfile!, version: 2 as const, source: "estimated" as const,
    impact: 2.5, offense: 3.5, rates: { ...subject.simProfile!.rates, fga: 0.46 },
    baseline: { ...subject.sheet!.attributes, threePoint: 73, midrange: 74, ballHandle: 72, drivingLayup: 73 } },
};
const low = simulationRates(baseline);
const elite = { ...baseline, age: 25,
  sheet: { ...baseline.sheet, overall: 94,
    attributes: { ...baseline.sheet.attributes, threePoint: 95, midrange: 90, ballHandle: 90, drivingLayup: 87 } },
  ratings: { ...baseline.ratings, impact: 7.0, offense: 7.5 },
};
const high = simulationRates(elite);
assert.ok(high.fga > low.fga * 1.55,
  "genuine generated superstars should take materially more shots than their rookie selves");
assert.ok(high.fga > 0.64 && high.fga < 1.15,
  "high-OVR generated star FGA/min must reach real top-scorer territory without absurd usage");
const observedReal = { ...elite, draftModel: undefined,
  nbaPlayerId: "synthetic-usage-control",
  simProfile: { ...elite.simProfile, source: "nba" as const,
    rates: { ...elite.simProfile.rates, fga: 0.70 } },
};
assert.ok(high.fga >= simulationRates(observedReal).fga * 0.7,
  "elite drafted scorers should not be permanently stuck at half a real NBA star's shot volume");
const tinyRookiePrior = { ...elite, simProfile: { ...elite.simProfile,
  rates: { ...elite.simProfile.rates, fga: 0.27 } } };
assert.ok(simulationRates(tinyRookiePrior).fga > 0.62,
  "a former low-volume rookie who earns 94 OVR can become an elite scorer");
assert.equal(simulationRates(observedReal).fga,
  simulationRates({ ...observedReal, draftModel: undefined }).fga,
  "NBA observed profiles remain unchanged by a generated-player-only curve");
const profile = developmentProfileOf(baseline);
const ordinary = { ...elite, developmentProfile: { ...profile, learningSurge: 1 } };
const exceptional = { ...elite, developmentProfile: { ...profile, learningSurge: 2.45 } };
assert.ok(softGrowthFactor(exceptional, 91) > softGrowthFactor(ordinary, 91) * 1.8,
  "exceptional learners have a genuine, but rare, path beyond 90 OVR");
const context = { league, checkpoint: "summer" as const, coach: 0.65, staff: 1.25 };
const first = advanceDynamicProgression(exceptional, context);
assert.equal(first.sheet!.overall - exceptional.sheet.overall <= 5, true,
  "elite growth remains bounded per offseason");
assert.deepEqual(advanceDynamicProgression(exceptional, context), first,
  "elite progression remains deterministic for saved franchises");
// Confirm the same skill level yields a comparable simulated box-score
// scoring rate, not merely a higher unused FGA/min profile field.
const clubs = league.teams.filter(team => league.players.filter(p => p.teamId === team.id).length >= 8).slice(0, 2);
assert.equal(clubs.length, 2);
const starters = clubs.map(team => league.players.filter(p => p.teamId === team.id && p.contract)
  .sort((a, b) => (b.sheet?.overall ?? 0) - (a.sheet?.overall ?? 0))[0]!);
assert.ok(starters.every(Boolean));
const built = starters.map((p, index) => ({ ...p, age: 25,
  draftModel: index === 0 ? 2 as const : undefined,
  nbaPlayerId: index === 1 ? "simulated-nba-usage-control" : undefined,
  sheet: { ...elite.sheet, attributes: { ...elite.sheet.attributes } },
  ratings: { ...elite.ratings },
  simProfile: { ...elite.simProfile, source: index === 0 ? "estimated" as const : "nba" as const,
    rates: { ...elite.simProfile.rates, fga: index === 0 ? 0.27 : 0.70 } },
}));
const players = league.players.map(p => built.find(star => star.id === p.id) ?? p);
const tallies = [ { pts: 0, min: 0 }, { pts: 0, min: 0 } ];
for (let i = 0; i < 24; i++) {
  const fixture = { ...league.schedule[0]!, id: "elite-generated-parity-" + i,
    homeTeamId: clubs[i % 2]!.id, awayTeamId: clubs[1 - (i % 2)]!.id,
    played: false, neutral: i % 3 === 0 };
  const box = simulateGame(fixture, league.teams, players, 25000 + i, undefined, league.settings).box;
  built.forEach((star, index) => {
    const row = box.players.find(p => p.playerId === star.id)!;
    tallies[index]!.pts += row?.points ?? 0;
    tallies[index]!.min += row?.minutes ?? 0;
  });
}
assert.ok(tallies.every(row => row.min > 400), "both stars must receive a real rotation role");
const genP36 = tallies[0]!.pts / tallies[0]!.min * 36;
const realP36 = tallies[1]!.pts / tallies[1]!.min * 36;
assert.ok(genP36 >= realP36 * 0.70 && genP36 <= realP36 * 1.50,
  "equal-skill generated scorers must produce similar PPG to real-profile players, not half their points: " +
  JSON.stringify({ genP36, realP36 }));
console.log("Generated superstar usage and rare earned elite progression and actual scoring parity passed.");
