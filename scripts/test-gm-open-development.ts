/**
 * Open-ended player-development regression. Run: npx tsx scripts/test-gm-open-development.ts
 * Generated draft-model-2 players learn skills without immutable final OVR
 * targets. Existing NBA player sheets retain historical-growth handling.
 */
import assert from "node:assert/strict";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { prepareFranchise, exportFranchise, parseFranchise } from "../src/gm/engine/franchise";
import { advanceDynamicProgression } from "../src/gm/engine/dynamic-progression";
import {
  developmentProfileOf, developmentOutlook, developmentSkillKeys,
  softGrowthFactor,
} from "../src/gm/engine/development-profile";
import { raiseCeiling, breakoutEvidence, reviewPlayerCeilings } from "../src/gm/engine/development";
import { simulationRates } from "../src/gm/engine/player-profile";
import type { GmDevelopmentProfile, GmLeagueState, GmPlayer } from "../src/gm/types";

const league = prepareFranchise(createGeneratedLeague({
  userTeamId: "bos", season: 2027, seed: 1302,
}));
const base = league.players.find(row => row.teamId === "bos" && row.contract && row.sheet)!;
assert.ok(base);
const strong: GmDevelopmentProfile = {
  version: 1,
  learning: 1.3,
  adaptability: 1.2,
  aptitudes: { shooting: 1.25, creation: 1.05, defense: 1.1, rebounding: 0.9 },
  discovery: 0.1,
};
const rookie: GmPlayer = {
  ...base,
  age: 20,
  workEthic: 94,
  draftModel: 2,
  developmentFocus: "shooting",
  developmentProfile: strong,
  developmentBaseline: { season: 2027, overall: 75 },
  sheet: {
    ...base.sheet!,
    overall: 75,
    progressionCarry: 0,
    potential: {
      ...base.sheet!.potential,
      floor: 65,
      ceiling: 75,
      trait: "normal",
      path: "average",
      peakStart: 26,
      peakEnd: 31,
    },
  },
};
const context = (p: GmPlayer, season = 2027): GmLeagueState => ({
  ...league,
  season,
  draftPool: [],
  players: league.players.map(row => row.id === p.id ? p : row),
});
const grown = advanceDynamicProgression(rookie, {
  league: context(rookie), checkpoint: "summer", coach: 0.3, staff: 1.1,
});
assert.ok(grown.sheet!.overall > rookie.sheet!.potential.ceiling,
  "a rookie must be able to surpass his obsolete fixed overall ceiling");
assert.equal(grown.sheet?.potential.ceiling, rookie.sheet?.potential.ceiling,
  "new growth must not secretly increase a preordained ceiling");
assert.deepEqual(advanceDynamicProgression(rookie, {
  league: context(rookie), checkpoint: "summer", coach: 0.3, staff: 1.1,
}), grown, "season growth is stable for the same player and checkpoint");
assert.ok((grown.sheet?.attributes.threePoint ?? 0) > (rookie.sheet?.attributes.threePoint ?? 0),
  "shooting focus must improve an actual basketball skill");
assert.deepEqual(grown.developmentProfile, strong,
  "hidden player profile persists through individual skill progression");
assert.ok(simulationRates(grown).threeShare > simulationRates(rookie).threeShare,
  "developing a shooter must change his simulated shot mix, not only his OVR");

const defender = { ...rookie, developmentFocus: "defense" as const };
const defended = advanceDynamicProgression(defender, {
  league: context(defender), checkpoint: "summer", coach: 0.3, staff: 1.1,
});
const defenseSkills = developmentSkillKeys(defender.position, "defense");
assert.ok(defenseSkills.some(key => defended.sheet!.attributes[key] > defender.sheet!.attributes[key]),
  "defensive development must improve position-appropriate defensive skills");
assert.equal(defended.sheet?.attributes.threePoint, defender.sheet?.attributes.threePoint,
  "focused defensive work does not silently grant the same shooting gains");
const shootingOffShare = (grown.ratings.offense - rookie.ratings.offense) /
  Math.max(0.01, grown.ratings.impact - rookie.ratings.impact);
const defenseOffShare = (defended.ratings.offense - defender.ratings.offense) /
  Math.max(0.01, defended.ratings.impact - defender.ratings.impact);
assert.ok(shootingOffShare > defenseOffShare,
  "skill direction must change latent offense/defense, not just card attributes");

const insufficient = { ...rookie, developmentProfile: undefined };
const natural = developmentProfileOf(insufficient);
assert.deepEqual(developmentProfileOf(insufficient), natural,
  "missing old-save profiles are recreated without nondeterministic rerolls");
assert.ok(natural.learning >= 0.72 && natural.learning <= 1.4);
assert.ok(softGrowthFactor(rookie, 95) < softGrowthFactor(rookie, 75),
  "elite OVR growth must be strongly self-limiting, not forbidden by a cap");

const first = raiseCeiling(rookie, 2, 2027, "breakout", "First great year");
assert.ok((first.developmentProfile?.discovery ?? 0) > strong.discovery);
assert.equal(first.sheet?.potential.ceiling, 75,
  "breakout recognition enhances learning rather than increasing an OVR cap");
assert.equal(raiseCeiling(first, 2, 2027, "breakout", "Replay"), first,
  "breakouts cannot be farmed more than once per season");
let sustained = first;
for (let year = 2028; year <= 2036; year++) {
  sustained = raiseCeiling(sustained, 2, year, "breakout", "Sustained excellence");
}
assert.ok((sustained.ceilingGrowth?.total ?? 0) > 4,
  "generated players must no longer share a hard +4 career development limit");
assert.ok((sustained.developmentProfile?.discovery ?? 0) <= 0.55,
  "repeated successes give diminishing returns and cannot create infinite growth");
const reloaded = parseFranchise(exportFranchise(context(sustained))).players.find(
  player => player.id === sustained.id
)!;
assert.deepEqual(reloaded.developmentProfile, sustained.developmentProfile);
assert.deepEqual(reloaded.ceilingGrowth, sustained.ceilingGrowth);

// A productive 28-year-old generated player can still discover a new gear;
// this must not allow ordinary late-career volume to manufacture superstars.
const late = {
  ...rookie,
  age: 28,
  seasonLine: {
    season: "2027", team: "BOS", gp: 65, min: 1950,
    pts: 1900, ast: 450, reb: 300, stl: 100, blk: 40,
    tov: 210, fgm: 690, fga: 1300, tpm: 175, tpa: 480, ftm: 345, fta: 420,
  },
} as GmPlayer;
assert.equal(breakoutEvidence(late, 2027).eligible, true,
  "an exceptional sustained age-28 season should open a late breakout");
assert.equal(breakoutEvidence({ ...late, age: 30 }, 2027).eligible, false,
  "late breakthroughs do not extend indefinitely through a career");
assert.equal(breakoutEvidence({ ...late, draftModel: undefined }, 2027).eligible, false,
  "legacy NBA growth retains its established breakout-age rules");
assert.equal(breakoutEvidence({ ...late, seasonLine: {
  ...late.seasonLine!, gp: 20, min: 600,
} }, 2027).eligible, false,
  "small samples cannot unlock late breakouts");
const lateLeague = {
  ...context(late),
  schedule: league.schedule.map(game => ({ ...game, played: true })),
};
const lateReviewed = reviewPlayerCeilings(lateLeague);
const lateAfter = lateReviewed.players.find(row => row.id === late.id)!;
assert.ok((lateAfter.developmentProfile?.discovery ?? 0) > (late.developmentProfile?.discovery ?? 0),
  "season review must persist late-breakout discovery in the actual league");
assert.equal(reviewPlayerCeilings(lateReviewed), lateReviewed,
  "late-breakout review cannot be reapplied on reload");

const minutes = (mpg: number): GmPlayer => ({
  ...rookie,
  seasonLine: {
    season: "2027", team: "BOS", gp: 70, min: 70 * mpg,
    pts: 700, ast: 140, reb: 200, stl: 60, blk: 20,
    tov: 105, fgm: 300, fga: 640, tpm: 60, tpa: 180, ftm: 40, fta: 50,
  },
});
const standard = advanceDynamicProgression(minutes(30), {
  league: context(minutes(30)), checkpoint: "summer",
});
const inflated = advanceDynamicProgression(minutes(40), {
  league: context(minutes(40)), checkpoint: "summer",
});
assert.ok((inflated.sheet?.overall ?? 0) <= (standard.sheet?.overall ?? 0) + 1,
  "40 MPG must not guarantee a large growth advantage over healthy rotation minutes");

const observed = developmentOutlook(grown, 2027);
assert.ok(observed.label && observed.detail);
assert.ok(!observed.detail.includes("ceiling"),
  "user-facing projections must not reveal a predetermined final OVR");

const sample: number[] = [];
for (let n = 0; n < 100; n++) {
  let p = {
    ...rookie,
    id: "rookie-trial-" + n,
    age: 19,
    workEthic: 45 + (n * 11) % 56,
    developmentProfile: undefined,
    sheet: { ...rookie.sheet!, overall: 69, progressionCarry: 0 },
  };
  let current = p as GmPlayer;
  for (let year = 2027; year < 2033; year++) {
    current = advanceDynamicProgression(current, {
      league: context(current, year), checkpoint: "summer", coach: 0.2, staff: 1,
    });
    current = { ...current, age: current.age + 1 };
  }
  sample.push(current.sheet?.overall ?? 0);
}
const avg = sample.reduce((n, v) => n + v, 0) / sample.length;
assert.ok(avg >= 72 && avg <= 88, "six-year growth should make useful players, not a whole league of superstars");
assert.ok(sample.filter(ovr => ovr >= 90).length < 20,
  "an average 69 OVR class must not produce too many guaranteed superstars");
assert.ok(Math.max(...sample) > Math.min(...sample) + 3,
  "different learning profiles and work ethic should create varied careers");
console.log("Open development: profile persistence, skill focus, soft limits, breakouts, workload and 100-player cohort passed");
console.log(JSON.stringify({
  sixYearMean: +avg.toFixed(2),
  range: [Math.min(...sample), Math.max(...sample)],
  over90: sample.filter(ovr => ovr >= 90).length,
}));
