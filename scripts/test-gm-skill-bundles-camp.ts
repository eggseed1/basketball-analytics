/** Synthetic skill correlation and camp OVR regression.
 * Run: npx tsx scripts/test-gm-skill-bundles-camp.ts
 */
import assert from "node:assert/strict";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { simulationRates } from "../src/gm/engine/player-profile";
import { prepareFranchise, exportFranchise, parseFranchise } from "../src/gm/engine/franchise";
import { applyTrainingCamp, assignCamp, campSkillChanges, CAMP_FOCUSES } from "../src/gm/engine/season-development";
import {
  SHEET_VERSION, bundleGeneratedAttributes, ensurePlayerSheet, overallFromAttributes,
} from "../src/gm/engine/attributes";
import type { GmAttributes, GmLeagueState, GmPlayer, GmOffseasonStage } from "../src/gm/types";

const extras = (player: GmPlayer) => ({
  impact: player.ratings.impact,
  offense: player.ratings.offense,
  defense: player.ratings.defense,
});
const skills = (player: GmPlayer) => player.sheet!.attributes;
const verify = (a: GmAttributes, note: string) => {
  assert.ok(a.threePoint < 78 || a.midrange >= Math.round(a.threePoint * 0.85 - 2),
    note + ": high 3PT needs credible midrange touch");
  assert.ok(a.threePoint < 84 || a.freeThrow >= Math.round(a.threePoint * 0.8),
    note + ": high 3PT needs credible FT touch");
  assert.ok(a.midrange < 86 || a.freeThrow >= Math.round(a.midrange * 0.79),
    note + ": high midrange requires FT fundamentals");
  assert.ok(a.ballHandle < 84 || a.speedWithBall >= Math.round(a.ballHandle * 0.72 + 3),
    note + ": elite handling requires some moving-ball skill");
  assert.ok(a.drivingDunk < 84 || (a.drivingLayup >= Math.round(a.drivingDunk * 0.76) &&
    a.vertical >= Math.round(a.drivingDunk * 0.73)), note + ": explosive dunking needs a physical foundation");
  assert.ok(a.standingDunk < 85 || a.closeShot >= Math.round(a.standingDunk * 0.77),
    note + ": standing dunk requires competent close finishing");
  assert.ok(a.offReb < 85 || a.defReb >= a.offReb - 24, note + ": offensive rebounding shares instincts");
  assert.ok(a.defReb < 88 || a.offReb >= a.defReb - 30, note + ": defensive rebounding shares instincts");
};

assert.equal(SHEET_VERSION, 9);
const loose = {
  closeShot: 55, drivingLayup: 52, drivingDunk: 91, standingDunk: 89, postControl: 52,
  midrange: 60, threePoint: 90, freeThrow: 60, passAccuracy: 45, ballHandle: 91,
  speedWithBall: 50, interiorDefense: 50, perimeterDefense: 55, steal: 55, block: 55,
  offReb: 91, defReb: 43, speed: 60, agility: 65, strength: 67, vertical: 50,
  stamina: 70,
} satisfies GmAttributes;
const bundled = bundleGeneratedAttributes(loose);
verify(bundled, "extreme synthetic archetype");
assert.equal(bundled.threePoint, 90, "correction cannot delete a rare signature strength");
assert.equal(bundled.midrange, 75, "a 90 three can remain a specialist rather than a 90 mid shooter");
assert.deepEqual(bundleGeneratedAttributes(bundled), bundled, "correction is idempotent");
assert.equal(bundleGeneratedAttributes({ ...loose, threePoint: 32, midrange: 91 }).threePoint, 32,
  "midrange-first scorers are not forced to be deep shooters");

let sampled = 0;
for (const seed of [17, 71, 116]) {
  const league = prepareFranchise(createGeneratedLeague({ userTeamId: "bos", season: 2027, seed }));
  const generated = league.players.filter(player =>
    player.id.startsWith("p_") || player.id.startsWith("prospect-") || player.draftModel === 2);
  assert.ok(generated.length > 300, "include roster players, undrafted talent and the new draft class");
  for (const player of generated) {
    verify(skills(player), player.id);
    assert.equal(player.sheet?.version, 9);
    sampled++;
  }
}
assert.ok(sampled > 1200, "test a wide spread of generated archetypes");

const league = prepareFranchise(createGeneratedLeague({ userTeamId: "bos", season: 2027, seed: 709 }));
const base = league.players.find(player => player.teamId === "bos" && player.contract && player.sheet)!;
// Save migration fixes only synthetic skill mismatches. It must not change
// existing overall, potential, hidden development, team or other attributes.
const legacy: GmPlayer = { ...base, sheet: { ...base.sheet!, version: 8,
  overall: 83, overallOffset: -5, attributes: { ...base.sheet!.attributes, threePoint: 90, midrange: 60, freeThrow: 59 } } };
const savedRates = simulationRates(legacy);
const migrated = ensurePlayerSheet(legacy);
assert.deepEqual(simulationRates(migrated), savedRates,
  "old generated players must not gain shooting or rebounding accuracy merely from loading a save");
assert.equal(migrated.sheet!.overall, 83);
verify(skills(migrated), "legacy generated save");
assert.equal(migrated.sheet!.overallOffset,
  83 - overallFromAttributes(migrated.position, skills(migrated), extras(migrated)),
  "OVR offset is recalibrated without modifying the true simulation ratings");
assert.deepEqual(ensurePlayerSheet(migrated), migrated, "second migration never rebalances again");
const real = ensurePlayerSheet({ ...legacy, id: "nba-real-player-001", draftModel: undefined });
assert.equal(real.sheet!.attributes.midrange, 60, "real NBA player profiles remain unaltered");
assert.equal(real.sheet!.attributes.threePoint, 90);

function summer(player: GmPlayer, stage: GmOffseasonStage = "training_camp"): GmLeagueState {
  return { ...league, phase: "offseason", players: league.players.map(p => p.id === base.id ? player : p),
    seasonFlow: { version: 1, season: league.season, stage, completed: [] } };
}
// Reproduce the previous bug: stored offset built against offense+defense,
// but camp applied the same offset to impact-only, dropping OVR permanently.
const splitMismatch: GmPlayer = {
  ...base,
  ratings: { ...base.ratings, impact: -4, offense: 4.0, defense: 2.0 },
  sheet: { ...base.sheet!, overall: 82, priorOverall: 82,
    overallOffset: 82 - overallFromAttributes(base.position, skills(base), {
      impact: -4, offense: 4, defense: 2,
    }) },
};
for (const focus of CAMP_FOCUSES.map(entry => entry.id)) {
  const before = summer(splitMismatch);
  const assigned = assignCamp(before, base.id, focus);
  assert.equal(assigned.ok, true, focus + " should be assignable");
  const result = applyTrainingCamp(assigned.state);
  const trained = result.players.find(p => p.id === base.id)!;
  const row = result.seasonFlow!.campResults!.find(r => r.playerId === base.id)!;
  assert.equal(row.before, 82);
  assert.ok(row.after >= 82, focus + " may not lower OVR when increasing skills");
  assert.equal(row.after, trained.sheet!.overall);
  for (const gain of campSkillChanges(before, splitMismatch, focus)) {
    assert.equal(trained.sheet!.attributes[gain.key], gain.after, focus + " must apply the shown gain");
    assert.ok(gain.after >= gain.before);
  }
  assert.equal(trained.sheet!.overallOffset,
    trained.sheet!.overall - overallFromAttributes(trained.position, skills(trained), extras(trained)),
    "stored camp offset must match the real strength model");
  assert.equal(applyTrainingCamp(result), result, "camp must not apply twice");
  const saved = parseFranchise(exportFranchise(result));
  assert.equal(saved.players.find(p => p.id === base.id)!.sheet!.overall, trained.sheet!.overall,
    "OVR must survive export/reload");
}


// Training camp is an actual preseason decision: meaningful targeted skills,
// a badge practice benefit, and diminishing returns for established veterans.
{
  const rookie: GmPlayer = { ...base, age: 20, sheet: { ...base.sheet!, overall: 72,
    attributes: { ...base.sheet!.attributes, threePoint: 64, midrange: 65, freeThrow: 64 } },
    badges: { version: 2, xp: {} } };
  const coached = summer(rookie);
  const gains = campSkillChanges(coached, rookie, "shooting");
  assert.ok(gains[0]!.after - gains[0]!.before >= 3, "young players get a meaningful primary gain");
  assert.ok(gains[1]!.after - gains[1]!.before >= 2, "the supporting skill also grows");
  const selected = assignCamp(coached, base.id, "shooting");
  const trainedLeague = applyTrainingCamp(selected.state);
  const trained = trainedLeague.players.find(p => p.id === base.id)!;
  const result = trainedLeague.seasonFlow!.campResults!.find(row => row.playerId === base.id)!;
  assert.ok(result.after >= result.before + 1 && result.after <= result.before + 2,
    "a strong young prospect camp makes a visible but bounded overall gain");
  assert.ok(trained.ratings.impact > rookie.ratings.impact,
    "the camp improvement must reflect real on-court ability, not a cosmetic OVR bump");
  assert.ok((result.badgeGains?.length ?? 0) > 0, "skill-specific camps provide badge practice");
  assert.ok((trained.badges?.xp.deep_range ?? 0) > 0, "badge practice is persisted");
  assert.ok(trained.sheet!.tendencies.shootThree >= rookie.sheet!.tendencies.shootThree,
    "camp grows playing tendencies alongside actual skills");
  assert.equal(applyTrainingCamp(trainedLeague), trainedLeague, "replay cannot farm badge XP");
  assert.equal(parseFranchise(exportFranchise(trainedLeague)).players.find(p => p.id === base.id)!.badges?.xp.deep_range,
    trained.badges?.xp.deep_range, "camp badge XP survives saving and reloading");
  const older: GmPlayer = { ...rookie, age: 35, sheet: { ...rookie.sheet!, overall: 91,
    attributes: { ...rookie.sheet!.attributes, threePoint: 93 } } };
  const veteranGain = campSkillChanges(summer(older), older, "shooting");
  assert.ok(veteranGain[0]!.after - veteranGain[0]!.before <= 1,
    "an elite veteran cannot gain multiple points of an elite skill every camp");
  const conditioning = applyTrainingCamp(assignCamp(summer(rookie), base.id, "conditioning").state);
  assert.equal(conditioning.players.find(p => p.id === base.id)!.campFatigueGames, 0,
    "conditioning has a distinct opening-night recovery benefit");
}
// An old affected save can be repaired when the stored camp report still
// conclusively identifies the unintended drop; unrelated seasons untouched.
const oldLoss = { ...base, sheet: { ...base.sheet!, overall: 72, priorOverall: 82,
  overallOffset: -9 } };
const damaged: GmLeagueState = { ...summer(oldLoss, "roster_check"),
  seasonFlow: { version: 1, season: league.season, stage: "roster_check", completed: ["training_camp"],
    campResults: [{ playerId: base.id, name: base.name, focus: "shooting",
      before: 82, after: 72, gains: ["threePoint +1"], tradeoff: "Camp fatigue" }] } };
const restored = prepareFranchise(damaged);
assert.equal(restored.players.find(p => p.id === base.id)!.sheet?.overall, 82);
assert.equal(restored.seasonFlow!.campResults![0]!.after, 82);
assert.equal(prepareFranchise(restored).players.find(p => p.id === base.id)!.sheet?.overall, 82,
  "old camp repair is safe to run repeatedly");
const progressedAfterCamp = { ...damaged, phase: "regular" as const };
assert.equal(prepareFranchise(progressedAfterCamp).players.find(p => p.id === base.id)!.sheet?.overall, 72,
  "do not override genuine later development on the basis of an old report");
console.log("Verified " + sampled + " generated profiles, old-save skill repairs, all camp focuses, camp save stability and legacy loss recovery.");
