/**
 * Injury return dates + coaching rebalance on out/return.
 * Run: npx tsx scripts/test-gm-injury-schedule.ts
 */
import assert from "node:assert/strict";

import {
  injuryReturnDate,
  injuredOnDate,
  userInjuryMarks,
} from "../src/gm/engine/injury-schedule";
import {
  rebalanceForInjuryChanges,
  teamsNeedingInjuryRebalance,
  injured,
} from "../src/gm/engine/coaching";
import { autoSetLineup } from "../src/gm/engine/lineup";
import type { GmLeagueState, GmPlayer, GmScheduleGame, GmTeam } from "../src/gm/types";

function player(partial: Partial<GmPlayer> & Pick<GmPlayer, "id" | "name">): GmPlayer {
  return {
    teamId: "det",
    position: "PG",
    age: 24,
    heightIn: 75,
    weightLbs: 200,
    ratings: {
      impact: 3,
      offense: 2,
      defense: 1,
      shooting: 70,
      finishing: 70,
      playmaking: 80,
      rebounding: 40,
      durability: 70,
      potential: 7,
    },
    scouted: { impact: 3, offense: 2, defense: 1, uncertainty: 0.2 },
    contract: null,
    injury: null,
    morale: 70,
    personality: 0,
    minutesPreference: 32,
    ...partial,
  };
}

const schedule: GmScheduleGame[] = [
  { id: "g1", season: 2026, day: 10, homeTeamId: "det", awayTeamId: "bos", played: false, gameDate: "2025-11-01" },
  { id: "g2", season: 2026, day: 12, homeTeamId: "nyk", awayTeamId: "det", played: false, gameDate: "2025-11-03" },
  { id: "g3", season: 2026, day: 14, homeTeamId: "det", awayTeamId: "chi", played: false, gameDate: "2025-11-05" },
  { id: "g4", season: 2026, day: 16, homeTeamId: "det", awayTeamId: "atl", played: false, gameDate: "2025-11-07" },
  { id: "g5", season: 2026, day: 18, homeTeamId: "mia", awayTeamId: "det", played: false, gameDate: "2025-11-09" },
];

const cade = player({
  id: "cade",
  name: "Cade Cunningham",
  injury: { type: "Ankle sprain", gamesRemaining: 3, reinjuryRisk: 0.2 },
});

assert.equal(injuryReturnDate(cade, schedule, 10), "2025-11-07");
assert.equal(injuredOnDate(cade, "2025-11-01", schedule, 10), true);
assert.equal(injuredOnDate(cade, "2025-11-05", schedule, 10), true);
assert.equal(injuredOnDate(cade, "2025-11-07", schedule, 10), false);

const league = {
  userTeamId: "det",
  day: 10,
  schedule,
  players: [cade],
} as unknown as GmLeagueState;

const marks = userInjuryMarks(league);
assert.equal(marks.length, 1);
assert.equal(marks[0]!.iso, "2025-11-07");
assert.equal(marks[0]!.kind, "injury");
assert.match(marks[0]!.line, /Cunningham/i);

const healthy = player({ id: "healthy", name: "Jalen Duren", position: "C" });
const wing = player({ id: "wing", name: "Ausar Thompson", position: "SF" });
const backup = player({ id: "backup", name: "Marcus Sasser", position: "PG", minutesPreference: 18 });
const before = [cade, healthy, wing, backup].map((p) => ({ ...p, injury: null }));
const after = [
  { ...cade, injury: { type: "Ankle sprain", gamesRemaining: 4, reinjuryRisk: 0.2 } },
  healthy,
  wing,
  backup,
];
const teams = teamsNeedingInjuryRebalance(before, after);
assert.ok(teams.has("det"));

const team = {
  id: "det",
  abbr: "DET",
  city: "Detroit",
  name: "Pistons",
  conference: "East" as const,
  division: "Central",
  starters: { PG: "cade", SG: null, SF: "wing", PF: null, C: "healthy" },
  benchOrder: ["backup"],
  draftPicks: [],
  tradeExceptionsM: [],
  ownerPatience: 50,
  ownerGoal: "contend" as const,
  fanConfidence: 50,
  payrollLuxuryTaxM: 0,
  staff: {
    headCoach: null as never,
    trainer: null as never,
    dead: [],
    scout: null as never,
    developer: null as never,
    scoutLevel: 3,
    trainerLevel: 3,
  },
} as GmTeam;

const lined = autoSetLineup(team, after);
assert.equal(lined.starters.PG, "backup", "backup steps into the injured star's seat");
assert.equal(lined.coaching?.minutes?.["cade"] ?? 0, 0);

const cleared = after.map((p) =>
  p.id === "cade" ? { ...p, injury: null } : p
);
const onReturn = rebalanceForInjuryChanges(
  { teams: [lined], players: cleared },
  after
);
assert.equal(onReturn.teams[0]!.starters.PG, "cade", "star returns to the starting five");

assert.ok(injured(after[0]!));

console.log("injury schedule ok", {
  returnDate: marks[0]!.iso,
  outStarter: lined.starters.PG,
  backStarter: onReturn.teams[0]!.starters.PG,
});
