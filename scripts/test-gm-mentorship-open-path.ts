/**
 * Mentorship cannot set a hard future OVR for model-2 generated prospects.
 * Practice pace is immediate; badge teaching requires co-appearances; rare
 * lasting learning discoveries require twenty actual games together.
 */
import assert from "node:assert/strict";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { prepareFranchise, exportFranchise, parseFranchise } from "../src/gm/engine/franchise";
import { assignMentor, mentorEligible, mentorPositionsOverlap, mentorshipBonus, recordDevelopmentMilestone, reviewPlayerDevelopment, workEthicOf } from "../src/gm/engine/development";
import { developmentProfileOf, softGrowthFactor } from "../src/gm/engine/development-profile";
import { advanceDynamicProgression } from "../src/gm/engine/dynamic-progression";
import type { GmLeagueState, GmPlayer } from "../src/gm/types";

const base = prepareFranchise(createGeneratedLeague({
  userTeamId: "bos", season: 2027, seed: 1245,
}));
const roster = base.players.filter(p => p.teamId === "bos" && p.contract && p.sheet);
const veteran: GmPlayer = {
  ...roster[1]!, position: "PG", age: 32, workEthic: 98,
  sheet: { ...roster[1]!.sheet!, overall: 94 },
};
const starter: GmPlayer = {
  ...roster[0]!, position: "PG", age: 20, draftModel: 2,
  developmentFocus: "shooting", workEthic: 85,
  developmentProfile: undefined, seasonLine: undefined, ceilingGrowth: undefined,
  sheet: {
    ...roster[0]!.sheet!, overall: 72, progressionCarry: 0,
    potential: { ...roster[0]!.sheet!.potential, floor: 60, ceiling: 72, trait: "normal", path: "average" },
  },
};
const league: GmLeagueState = {
  ...base, draftPool: [], players: [starter, veteran],
  schedule: base.schedule.map(g => ({ ...g, played: true })),
};
const secondaryVet: GmPlayer = { ...veteran, position: "SG", secondaryPosition: "PG" };
assert.equal(mentorPositionsOverlap(starter, secondaryVet), true, "a mentor's secondary can match the mentee's primary");
assert.equal(mentorEligible(starter, secondaryVet), true);
const dualMentee: GmPlayer = { ...starter, position: "SG", secondaryPosition: "PG" };
const purePoint: GmPlayer = { ...veteran, position: "PG", secondaryPosition: null };
assert.equal(mentorEligible(dualMentee, purePoint), true, "the mentee's secondary can match the mentor's primary");
assert.equal(mentorEligible({ ...dualMentee, position: "SF", secondaryPosition: null }, purePoint), false,
  "unrelated roles should not be treated as interchangeable");
assert.equal(mentorEligible(starter, { ...secondaryVet, age: 26 }), false, "young veterans still must meet mentor experience rules");
const paired = assignMentor(league, starter.id, veteran.id);
assert.equal(paired.ok, true);
const learner = paired.state.players[0]!;
const savedCap = learner.sheet!.potential.ceiling;
assert.ok(mentorshipBonus(learner, paired.state.players) > 0,
  "active mentor immediately improves practice effectiveness");
assert.equal(workEthicOf(veteran), 98);
const noMentor = advanceDynamicProgression(learner, {
  league: paired.state, checkpoint: "summer", coach: 0.5, staff: 1.0, mentor: 0,
});
const withMentor = advanceDynamicProgression(learner, {
  league: paired.state, checkpoint: "summer", coach: 0.5, staff: 1.0,
  mentor: mentorshipBonus(learner, paired.state.players),
});
assert.ok((withMentor.sheet?.overall ?? 0) >= (noMentor.sheet?.overall ?? 0));
assert.equal(withMentor.sheet?.potential.ceiling, savedCap);
assert.equal(noMentor.sheet?.potential.ceiling, savedCap);

const before = developmentProfileOf(learner);
const insight = recordDevelopmentMilestone(learner, 2, 2027, "mentorship", "Learned from a veteran");
assert.ok((insight.developmentProfile?.discovery ?? 0) > before.discovery);
assert.equal(insight.sheet?.potential.ceiling, savedCap,
  "earned mentor milestone must never edit model-2 hidden overall cap data");
assert.ok(softGrowthFactor(insight, 72) > softGrowthFactor(learner, 72),
  "the permanent benefit must increase a REAL future skill learning multiplier");
assert.equal(recordDevelopmentMilestone(insight, 3, 2027, "mentorship", "Replay"), insight);
assert.deepEqual(
  parseFranchise(exportFranchise({
    ...paired.state, players: [insight, veteran],
  })).players[0]?.developmentProfile, insight.developmentProfile,
  "mentor learning discoveries must survive save and reload"
);

const full = {
  ...paired.state, players: paired.state.players.map(p =>
    p.id === starter.id ? { ...p, seasonLine: undefined, ceilingGrowth: undefined } : p),
};
const twenty = { ...full.players[0]!, mentorship: {
  ...full.players[0]!.mentorship!, season: 2027, sharedGames: 20,
} };
const nineteen = { ...twenty, mentorship: { ...twenty.mentorship!, sharedGames: 19 } };
assert.equal(
  reviewPlayerDevelopment({ ...full, players: [nineteen, veteran] }).players[0]!.ceilingGrowth?.awards.length ?? 0,
  0, "nineteen games cannot unlock a rare persistent mentorship milestone"
);

let breakthroughs = 0;
for (let i = 0; i < 350; i++) {
  const player: GmPlayer = {
    ...twenty, id: "mentorship-model2-" + i, name: "Prospect " + i,
    developmentProfile: undefined, ceilingGrowth: undefined,
  };
  const subject: GmLeagueState = { ...full, players: [player, veteran] };
  const observed = reviewPlayerDevelopment(subject);
  const after = observed.players[0]!;
  assert.equal(after.sheet!.potential.ceiling, savedCap);
  const awarded = after.ceilingGrowth?.awards.find(a => a.source === "mentorship");
  if (awarded) {
    breakthroughs++;
    assert.ok(after.developmentProfile?.discovery &&
      after.developmentProfile.discovery > developmentProfileOf(player).discovery);
    assert.ok(awarded.gain >= 1 && awarded.gain <= 3);
    assert.ok(observed.news.some(n => n.headline.includes("mentoring breakthrough") &&
      n.body.includes("No fixed overall ceiling was raised")));
  }
  assert.equal(reviewPlayerDevelopment(observed), observed,
    "full-season review must remain idempotent after awards or a reload");
}
assert.ok(breakthroughs >= 15 && breakthroughs <= 60,
  "one veteran across 350 seasons should create rare, not guaranteed, persistent discoveries");
console.log("Open-ended mentorship: practice speed, 20 shared-game threshold, learning discovery, replay prevention, no ceiling changes and save safety passed", { breakthroughs });
