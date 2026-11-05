/**
 * Madden-style traits + fogged scout comps.
 * Run: npx tsx scripts/test-gm-dev-traits.ts
 */
import assert from "node:assert/strict";

import { playerSheet } from "../src/gm/engine/attributes";
import { developmentProfileOf } from "../src/gm/engine/development-profile";
import { annualTraitDecision, reviewDevelopmentTrait, advanceDynamicProgression } from "../src/gm/engine/dynamic-progression";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { prepareFranchise } from "../src/gm/engine/franchise";
import {
  playerDevTrait,
  generatedLearningTrait,
  abilityTraitFloor,
  rollDevTrait,
  traitGrowthMul,
  traitLabel,
} from "../src/gm/engine/dev-traits";
import { createRng } from "../src/gm/engine/rng";
import { buildScoutProfile } from "../src/gm/engine/scouting";
import { createDraftClass } from "../src/gm/seed/prospect-identities";
import type { GmScout } from "../src/gm/seed/scouts";
import type { GmPlayer } from "../src/gm/types";

const rng = createRng(7);
const klass = createDraftClass({
  count: 60,
  seasonEndYear: 2027,
  scoutLevel: 2,
  rng,
  seal: (player) => player,
});

const traits = klass.map((p) => playerDevTrait(p));
const rare = traits.filter((t) => t === "xfactor" || t === "superstar").length;
assert.ok(rare >= 1, "class should roll at least one Star+ jackpot over 60");
assert.ok(rare <= 20, "jackpots stay rare");

const weakScout: GmScout = {
  id: "scout-weak",
  name: "Tape Guy",
  yearsExperience: 1,
  expertise: "general",
  eye: 1,
  salaryM: 0.4,
  bio: "Still learning film room shorthand.",
};
const sharpScout: GmScout = {
  ...weakScout,
  id: "scout-sharp",
  name: "Film Ace",
  yearsExperience: 18,
  eye: 5,
};
const kid = klass[0]!;
const foggy = buildScoutProfile(kid, 1, 0, createRng(99), weakScout);
const sharp = buildScoutProfile(kid, 5, 0, createRng(99), sharpScout);
assert.ok(foggy.comps.length || foggy.compCeiling);
assert.ok(sharp.grades.athleticism && sharp.grades.shooting, "elite scout fills grades");
assert.ok(sharp.compCeiling && sharp.compFloor, "elite scout names ceiling and floor");

const vet: GmPlayer = {
  ...kid,
  id: "vet-star",
  age: 27,
  ratings: { ...kid.ratings, impact: 5.2, potential: 6 },
  darko: 3.1,
  sheet: undefined,
};
const sheet = playerSheet(vet);
assert.ok(sheet.potential.trait);
assert.equal(traitLabel(sheet.potential.trait!), traitLabel(playerDevTrait({ ...vet, sheet })));
assert.ok(traitGrowthMul("xfactor") > traitGrowthMul("superstar"));
assert.ok(traitGrowthMul("superstar") > traitGrowthMul("normal"));
assert.ok(traitGrowthMul("bust") < traitGrowthMul("normal"));

const youngStar = rollDevTrait(
  { ...kid, age: 20, ratings: { ...kid.ratings, impact: 4.5, potential: 9 } },
  90,
  9,
  createRng(1)
);
assert.ok(["xfactor", "superstar", "star", "normal", "bust"].includes(youngStar));

const named = rollDevTrait(
  {
    ...kid,
    id: "sga-test",
    name: "Shai Gilgeous-Alexander",
    age: 26,
    ratings: { ...kid.ratings, impact: 5, potential: 7 },
  },
  90,
  7,
  createRng(99)
);
assert.ok(
  named === "superstar" || named === "xfactor",
  "named stars should floor at Superstar+"
);

const cadeLike: GmPlayer = {
  ...kid,
  id: "cade-test",
  name: "Cade Cunningham",
  age: 24,
  teamId: "det",
  draftYear: undefined,
  ratings: { ...kid.ratings, impact: 4.5, potential: 8 },
  nbaSeason: {
    season: "2025-26",
    team: "DET",
    gp: 64,
    gs: 64,
    min: 2170,
    pts: 1531,
    reb: 355,
    ast: 634,
    stl: 92,
    blk: 54,
    tov: 236,
    fgm: 548,
    fga: 1189,
    tpm: 125,
    tpa: 366,
    ftm: 310,
    fta: 382,
    orb: 56,
    drb: 299,
  },
  sheet: undefined,
};
const cadeTrait = playerDevTrait({
  ...cadeLike,
  sheet: playerSheet(cadeLike),
});
assert.ok(
  cadeTrait === "superstar" || cadeTrait === "xfactor",
  `MVP-ballot producers should not be Normal (got ${cadeTrait})`
);


// Model-2 players get a real learning tier instead of a hidden/random legacy
// stamp. No scouting rank, projected ceiling, name or country controls it.
const generatedLeague = prepareFranchise(createGeneratedLeague({
  userTeamId: "bos", season: 2027, seed: 91,
}));
const reviewLeague = { ...generatedLeague, draftPool: [] };
const source = generatedLeague.players.find(p => p.draftModel === 2 && p.sheet) ??
  { ...klass[0]!, draftModel: 2 as const, teamId: "bos", draftYear: 2027, sheet: playerSheet(klass[0]!) };
const exemplar = { ...source, teamId: "bos", draftYear: 2027, age: 23, identityRevealed: true,
  sheet: { ...playerSheet(source), overall: 77,
    potential: { ...playerSheet(source).potential, trait: "normal" as const, path: "average" as const } } };
const profile = developmentProfileOf(exemplar);
const tuned = (learning: number, adaptability: number, aptitude: number, surge = 1): GmPlayer => ({
  ...exemplar,
  developmentProfile: {
    ...profile,
    learning, adaptability, learningSurge: surge,
    aptitudes: { shooting: aptitude, creation: aptitude, defense: aptitude, rebounding: aptitude, finishing: aptitude },
    discovery: 0,
  },
});
const slow = tuned(0.76,0.77,0.79);
const steady = tuned(0.98,1.0,0.99);
const starLearner = tuned(1.12,1.12,1.12);
const superstarLearner = tuned(1.21,1.21,1.21);
const rareLearner = tuned(1.1,1.05,1.1,2.45);
assert.equal(generatedLearningTrait(slow), "bust");
assert.equal(generatedLearningTrait(steady), "normal");
assert.equal(generatedLearningTrait(starLearner), "star");
assert.equal(generatedLearningTrait(superstarLearner), "superstar");
assert.equal(generatedLearningTrait(rareLearner), "xfactor");
assert.equal(playerDevTrait(rareLearner), "xfactor", "exceptional learning must be visible after draft");
assert.equal(playerDevTrait({ ...slow, name: "Another Name", draftPick: 60 }), "bust",
  "learning tier must not be scripted by the prospect's name or draft slot");

// Proven ability is a minimum tier, even if an old save stamped Normal, Bust
// or a demoted trait on a high-OVR player.
for (const overall of [95,96,97]) {
  const elite: GmPlayer = { ...slow,
    sheet: { ...slow.sheet!, overall, potential: { ...slow.sheet!.potential, trait: "bust" } },
    traitHistory: [{ season: 2026, before: "normal", after: "bust", reason: "Old save" }],
  };
  assert.equal(playerDevTrait(elite), "superstar", `${overall}+ cannot show a below-superstar label`);
  assert.equal(playerSheet(elite).potential.trait, "superstar",
    "sheet migrations and detail views must agree with the public tier");
  const assessment = annualTraitDecision(reviewLeague, elite);
  assert.equal(assessment.after, "superstar", "annual assessment must preserve proven elite ability");
  const stamped = reviewDevelopmentTrait(reviewLeague, elite);
  assert.equal(stamped.sheet!.potential.trait, "superstar",
    "annual review must persist the visible tier instead of leaving the legacy stamp");
}
assert.equal(playerDevTrait({ ...slow, sheet: { ...slow.sheet!, overall: 98 } }), "xfactor");
assert.equal(abilityTraitFloor(slow, 94), "star");
assert.equal(abilityTraitFloor(slow, 95), "superstar");
assert.equal(abilityTraitFloor(slow, 98), "xfactor");
// For model 2 the ceiling value is a historical compatibility field, never
// a promise that controls the tier or how high a player can eventually grow.
const lowCeiling = { ...starLearner, sheet: { ...starLearner.sheet!,
  potential: { ...starLearner.sheet!.potential, ceiling: 72 } } };
const highCeiling = { ...starLearner, sheet: { ...starLearner.sheet!,
  potential: { ...starLearner.sheet!.potential, ceiling: 99 } } };
assert.equal(playerDevTrait(lowCeiling), playerDevTrait(highCeiling));
assert.equal(playerDevTrait({ ...starLearner, teamId: "lal" }), playerDevTrait(starLearner),
  "trading a prospect does not reroll the learning profile");
assert.equal(playerDevTrait(rareLearner), playerDevTrait(rareLearner), "replays must be deterministic");

// The tier is used in growth, not merely pasted onto the UI. Compare two
// equally skilled rookies with the same id, settings and RNG; only DNA differs.
const ctx = { league: { ...generatedLeague, draftPool: [] }, checkpoint: "summer" as const, coach: .35, staff: 1.05 };
const slowGrowth = advanceDynamicProgression(slow, ctx);
const fastGrowth = advanceDynamicProgression(rareLearner, ctx);
assert.ok((fastGrowth.sheet?.overall ?? 0) >= (slowGrowth.sheet?.overall ?? 0),
  "learning labels and actual in-game growth must point in the same direction");

console.log("dev traits ok", {
  rare,
  sample: sheet.potential.trait,
  named,
  cadeTrait,
  ceiling: sharp.compCeiling,
  fogCeiling: foggy.compCeiling,
});
