/**
 * Regression: changing a player's skill profile also changes the way he
 * attempts to play, without replacing his unique style or inflating OVR.
 * Run: npm run test:franchise-tendencies
 */
import assert from "node:assert/strict";
import type { GmAttributes, GmPlayer } from "../src/gm/types";
import { evolveTendencies } from "../src/gm/engine/tendency-development";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { advanceDynamicProgression } from "../src/gm/engine/dynamic-progression";
import { applyTrainingCamp } from "../src/gm/engine/season-development";
import { progressSheet } from "../src/gm/engine/attributes";
import { prepareFranchise, exportFranchise, parseFranchise } from "../src/gm/engine/franchise";
import { simulationRates } from "../src/gm/engine/player-profile";

const league = prepareFranchise(createGeneratedLeague({ userTeamId: "bos", season: 2027, seed: 618 }));
const source = league.players.find(p => p.teamId === "bos" && p.contract && p.sheet)!;
assert.ok(source?.sheet, "a contract player with a ratings sheet exists");
const sheet = source.sheet!;
const attrs: GmAttributes = { ...sheet.attributes, closeShot: 70, threePoint: 70,
  midrange: 66, ballHandle: 65, speedWithBall: 64, passAccuracy: 65,
  steal: 65, block: 55, perimeterDefense: 65, interiorDefense: 60,
  drivingLayup: 65, drivingDunk: 60, strength: 65, standingDunk: 55,
  offReb: 55, postControl: 55 };
const chosen = {
  ...sheet, attributes: attrs,
  tendencies: { ...sheet.tendencies, shootThree: 32, shootMid: 62, drive: 38,
    dish: 42, postUp: 24, steal: 45, foul: 52 },
};
const shooting = { ...attrs, threePoint: Math.min(99, attrs.threePoint + 10), midrange: Math.min(99, attrs.midrange + 5) };
const one = evolveTendencies(chosen, shooting, "summer");
assert.ok(one.tendencies.shootThree > chosen.tendencies.shootThree,
  "improved shooting skills should increase outside-shot tendency");
assert.ok(one.tendencies.shootMid > chosen.tendencies.shootMid,
  "improved midrange skill should increase midrange tendency");
assert.ok(one.tendencies.shootMid < one.tendencies.shootThree + 45,
  "better three-point shooting must not force all shot preferences to converge");
assert.equal(one.tendencies.dish, chosen.tendencies.dish,
  "shooting practice cannot silently make a player a point guard");
assert.equal(one.tendencies.postUp, chosen.tendencies.postUp,
  "shooting practice cannot silently make a post scorer");
assert.ok(one.tendencies.shootThree - chosen.tendencies.shootThree <= 6,
  "a summer cannot instantly rewrite a player's entire shot diet");
assert.deepEqual(chosen.tendencies.shootThree, 32, "the input sheet remains immutable");

const previouslyLowVolume = { ...chosen, tendencies: { ...chosen.tendencies, shootThree: 9 } };
const previouslyHighVolume = { ...chosen, tendencies: { ...chosen.tendencies, shootThree: 68 } };
const low = evolveTendencies(previouslyLowVolume, shooting, "summer");
const high = evolveTendencies(previouslyHighVolume, shooting, "summer");
assert.equal(high.tendencies.shootThree - low.tendencies.shootThree, 59,
  "players retain their distinct styles after identical skill progress");

const NBA = evolveTendencies(chosen, shooting, "summer", true);
assert.ok(NBA.tendencies.shootThree <= one.tendencies.shootThree,
  "real NBA shooting habits should be slower to reshape");

const unchanged = evolveTendencies({ ...chosen, tendencyCarry: { shootThree: 0.9 } }, attrs, "summer");
assert.equal(unchanged.tendencies.shootThree, 32, "a no-op checkpoint must not cash in carry");
assert.equal(unchanged.tendencyCarry?.shootThree, 0.9);
const unrelated = evolveTendencies({ ...chosen, tendencyCarry: { shootThree: 0.9 } },
  { ...attrs, perimeterDefense: attrs.perimeterDefense + 2 }, "season");
assert.equal(unrelated.tendencies.shootThree, 32,
  "a defensive workout cannot cash in pending shooting tendency progress");
assert.equal(unrelated.tendencyCarry?.shootThree, 0.9);

const creative = evolveTendencies(chosen, { ...attrs, passAccuracy: Math.min(99, attrs.passAccuracy + 8),
  ballHandle: Math.min(99, attrs.ballHandle + 8), speedWithBall: Math.min(99, attrs.speedWithBall + 6) }, "summer");
assert.ok(creative.tendencies.dish > chosen.tendencies.dish);
assert.ok(creative.tendencies.drive > chosen.tendencies.drive);
assert.ok(creative.tendencies.shootThree <= chosen.tendencies.shootThree,
  "passing and dribbling lessons are not free three-point shooting volume");

const defending = evolveTendencies(chosen, { ...attrs, steal: Math.min(99, attrs.steal + 7),
  block: Math.min(99, attrs.block + 8), perimeterDefense: Math.min(99, attrs.perimeterDefense + 8),
  interiorDefense: Math.min(99, attrs.interiorDefense + 8) }, "summer");
assert.ok(defending.tendencies.steal > chosen.tendencies.steal);
assert.ok(defending.tendencies.block > chosen.tendencies.block);
assert.ok(defending.tendencies.foul < chosen.tendencies.foul,
  "better defensive technique should not create more careless fouls");

const oldVeteran = evolveTendencies(chosen, { ...attrs,
  threePoint: Math.max(25, attrs.threePoint - 10),
  ballHandle: Math.max(25, attrs.ballHandle - 9),
  speedWithBall: Math.max(25, attrs.speedWithBall - 9) }, "summer");
assert.ok(oldVeteran.tendencies.shootThree < chosen.tendencies.shootThree,
  "a real drop in shooting skill should reduce three-point aggression");
assert.ok(oldVeteran.tendencies.drive < chosen.tendencies.drive,
  "a declining creator should drive less");
assert.ok(Object.values(oldVeteran.tendencies).every(v => Number.isInteger(v) && v >= 0 && v <= 100));

let repeated = { ...chosen, tendencyCarry: {} as NonNullable<typeof chosen.tendencyCarry> };
let updatedAttributes: GmAttributes = { ...attrs, threePoint: 70 };
repeated = { ...repeated, attributes: updatedAttributes };
const originalThree = repeated.tendencies.shootThree;
for (let i = 0; i < 6; i++) {
  const after = { ...updatedAttributes, threePoint: updatedAttributes.threePoint + 1 };
  const update = evolveTendencies(repeated, after, "season");
  assert.ok(Math.abs(update.tendencies.shootThree - repeated.tendencies.shootThree) <= 2);
  repeated = { ...repeated, attributes: after, ...update };
  updatedAttributes = after;
}
assert.ok(repeated.tendencies.shootThree > originalThree,
  "small gains must accumulate across season checkpoints");

const novice: GmPlayer = {
  ...source, age: 19, draftModel: 2, developmentFocus: "shooting",
  sheet: {
    ...chosen, overall: 70, progressionCarry: 0,
    attributes: { ...attrs, threePoint: 72, midrange: 70 },
    potential: { ...sheet.potential, floor: 60, ceiling: 70, path: "average", trait: "normal" },
  },
};
const growthLeague = { ...league, draftPool: [],
  players: league.players.map(p => p.id === novice.id ? novice : p) };
const developed = advanceDynamicProgression(novice, { league: growthLeague,
  checkpoint: "summer", coach: 0.6, staff: 1.15 });
assert.ok(developed.sheet!.attributes.threePoint > novice.sheet!.attributes.threePoint,
  "the real progression engine should improve trained shooting skills");
assert.ok(developed.sheet!.tendencies.shootThree >= novice.sheet!.tendencies.shootThree,
  "the real progression engine should preserve tendency growth");
assert.deepEqual(developed, advanceDynamicProgression(novice, {
  league: growthLeague, checkpoint: "summer", coach: 0.6, staff: 1.15,
}), "progression must be deterministic");
assert.equal(developed.sheet!.overall >= novice.sheet!.overall, true);
assert.ok(simulationRates(developed).threeShare >= simulationRates(novice).threeShare,
  "gameplay should still respond to new shooting skill via calibrated shot rates");

const campLeague = {
  ...growthLeague, phase: "offseason" as const,
  seasonFlow: { version: 1 as const, season: league.season,
    stage: "training_camp" as const, completed: [],
    campAssignments: { [source.id]: "shooting" as const } },
};
const camp = applyTrainingCamp(campLeague);
const trained = camp.players.find(p => p.id === source.id)!;
assert.ok(trained.sheet!.attributes.threePoint >= novice.sheet!.attributes.threePoint);
assert.ok(trained.sheet!.tendencies.shootThree >= novice.sheet!.tendencies.shootThree,
  "training camp should feed tendencies from earned skills");
assert.ok(trained.sheet!.overall >= novice.sheet!.overall, "camp must not reduce overall");

const older: GmPlayer = { ...source, age: 36, developmentPlan: undefined, draftModel: undefined,
  sheet: { ...chosen, potential: { ...sheet.potential, peakStart: 26, peakEnd: 30 } } };
const declining = progressSheet(older, { minutes: 26 });
assert.ok(declining.sheet!.overall <= older.sheet!.overall || declining.sheet!.attributes.speed <= attrs.speed,
  "legacy aging remains in place");
assert.ok(Object.values(declining.sheet!.tendencies).every(v => Number.isInteger(v) && v >= 0 && v <= 100));

const restored = parseFranchise(exportFranchise({ ...growthLeague,
  players: growthLeague.players.map(p => p.id === novice.id ? developed : p) }));
const restoredPlayer = restored.players.find(p => p.id === novice.id)!;
assert.deepEqual(restoredPlayer.sheet!.tendencies, developed.sheet!.tendencies,
  "the player's evolved style survives franchise export/reload");
assert.deepEqual(restoredPlayer.sheet!.tendencyCarry, developed.sheet!.tendencyCarry,
  "fractional tendency progress survives save/reload");

console.log("Tendency progression: skill-linked shot mix, creation, defense, aging, idempotency, style preservation, camps, simulation, and save compatibility passed.");
