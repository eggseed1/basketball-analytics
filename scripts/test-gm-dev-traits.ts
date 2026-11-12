/**
 * Madden-style traits + fogged scout comps.
 * Run: npx tsx scripts/test-gm-dev-traits.ts
 */
import assert from "node:assert/strict";

import { playerSheet } from "../src/gm/engine/attributes";
import {
  abilityTraitFloor,
  ensurePotentialTrait,
  playerDevTrait,
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

// Loading old saves must not preserve a Normal or Bust label on an elite player.
assert.equal(abilityTraitFloor(89), null);
assert.equal(abilityTraitFloor(90), "star");
assert.equal(abilityTraitFloor(95), "superstar");
assert.equal(abilityTraitFloor(98), "xfactor");
const eliteBase = playerSheet(kid);
for (const [overall, expected] of [[90, "star"], [95, "superstar"], [98, "xfactor"]] as const) {
  const player: GmPlayer = {
    ...kid,
    draftYear: undefined,
    teamId: "bos",
    sheet: { ...eliteBase, overall, potential: { ...eliteBase.potential, trait: "normal", path: "average" } },
    traitHistory: [{ season: 2029, before: "normal", after: "bust", reason: "legacy review" }],
  };
  assert.equal(playerDevTrait(player), expected, `old review must respect ${overall} OVR floor`);
  assert.equal(ensurePotentialTrait(player.sheet!.potential, player).trait, expected);
}
const highCeilingOnly: GmPlayer = {
  ...kid,
  sheet: { ...eliteBase, overall: 70, potential: { ...eliteBase.potential, ceiling: 99, trait: "normal" } },
};
assert.equal(abilityTraitFloor(highCeilingOnly.sheet!.overall), null, "potential is not earned ability");

console.log("dev traits ok", {
  rare,
  sample: sheet.potential.trait,
  named,
  cadeTrait,
  ceiling: sharp.compCeiling,
  fogCeiling: foggy.compCeiling,
});
