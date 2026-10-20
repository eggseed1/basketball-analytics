/**
 * Overall is a blend of attributes. Young boom paths gain; old players lose speed.
 * Run: npx tsx scripts/test-gm-attributes.ts
 */
import assert from "node:assert/strict";

import { buildSheet, playerSheet, progressSheet } from "../src/gm/engine/attributes";
import { maybeGrowInSeason } from "../src/gm/engine/progression";
import {
  applyRookieRatings,
  estimateActivePotential,
  rookieOverall,
} from "../src/gm/engine/rookie-ratings";
import { scoutPotentialView } from "../src/gm/engine/scouting";
import { makeScout } from "../src/gm/seed/scouts";
import { createGeneratedLeague } from "../src/gm/seed/create-league";

const league = createGeneratedLeague({
  userTeamId: "bos",
  season: 2026,
  seed: 4,
});
const base = league.players[0]!;
const young = {
  ...base,
  id: "young-boom",
  age: 19,
  position: "PG" as const,
  minutesPreference: 32,
  personality: 20,
  ratings: { ...base.ratings, impact: 1, potential: 9, shooting: 70, playmaking: 74 },
};
const sheet = buildSheet(young, { threeRate: 0.42, threePct: 0.38, apg: 6, spg: 1.4 });
assert.ok(sheet.overall >= 60 && sheet.overall <= 99);
assert.equal(
  sheet.potential.boom + sheet.potential.average + sheet.potential.bust,
  100
);
assert.ok(sheet.tendencies.shootThree > 40);

const boom = {
  ...young,
  sheet: {
    ...sheet,
    potential: {
      ...sheet.potential,
      path: "boom" as const,
      floor: 70,
      ceiling: 92,
      peakStart: 25,
      peakEnd: 32,
    },
  },
};
const grown = progressSheet({ ...boom, age: 20 }, { minutes: 32, coach: 0.5 });
assert.ok(grown.sheet);
assert.ok(grown.sheet.overall >= sheet.overall);
assert.ok(grown.ratings.impact >= young.ratings.impact);

const vet = {
  ...base,
  id: "old-vet",
  age: 36,
  position: "SG" as const,
  ratings: { ...base.ratings, impact: 4, durability: 60 },
};
const vetSheet = buildSheet(vet);
const declining = progressSheet(
  {
    ...vet,
    age: 36,
    sheet: {
      ...vetSheet,
      potential: { ...vetSheet.potential, peakStart: 26, peakEnd: 32 },
    },
  },
  { minutes: 28 }
);
assert.ok(declining.sheet);
assert.ok(declining.sheet.attributes.speed < vetSheet.attributes.speed);
assert.ok(declining.sheet.attributes.threePoint >= vetSheet.attributes.threePoint - 1);
assert.ok(
  vetSheet.attributes.speed - declining.sheet.attributes.speed >
    vetSheet.attributes.threePoint - declining.sheet.attributes.threePoint
);
assert.ok(declining.sheet.overall <= vetSheet.overall);

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** One year at `age`, forced path, room left under the ceiling. */
function yearDelta(age: number, path: "boom" | "average" | "bust", position: "SG" | "C" = "SG"): number {
  const deltas: number[] = [];
  for (let i = 0; i < 40; i++) {
    const player = {
      ...base,
      id: `age-${age}-${path}-${position}-${i}`,
      age,
      position,
      personality: 0,
      minutesPreference: 26,
      ratings: { ...base.ratings, impact: 1.5, potential: 6, durability: 75 },
    };
    const built = buildSheet(player);
    const next = progressSheet(
      {
        ...player,
        sheet: {
          ...built,
          potential: {
            ...built.potential,
            path,
            ceiling: built.overall + 14,
            floor: Math.max(25, built.overall - 10),
          },
        },
      },
      { minutes: 26, coach: 0.4 }
    );
    deltas.push(next.ratings.impact - 1.5);
    assert.ok(Math.abs(next.ratings.impact - 1.5) <= 0.7);
  }
  return mean(deltas);
}

const youngAvg = yearDelta(21, "average");
const youngBoom = yearDelta(21, "boom");
const youngBust = yearDelta(21, "bust");
const peak = yearDelta(28, "average");
const earlyDrop = yearDelta(33, "average");
const lateDrop = yearDelta(36, "average");
const bigDrop = yearDelta(31, "average", "C");
const wingDrop = yearDelta(31, "average", "SG");
// Impact tracks development at a damped rate so long saves stay balanced.
assert.ok(youngAvg > 0.04 && youngAvg < 0.2, `age 21 average ${youngAvg}`);
assert.ok(youngBoom > youngAvg + 0.015, `boom ${youngBoom} avg ${youngAvg}`);
assert.ok(youngBust < 0.08, `bust ${youngBust}`);
assert.ok(peak > -0.08 && peak < 0.1, `age 28 ${peak}`);
assert.ok(earlyDrop < -0.15 && earlyDrop > -0.5, `age 33 ${earlyDrop}`);
assert.ok(lateDrop < earlyDrop, `age 36 ${lateDrop} vs 33 ${earlyDrop}`);
assert.ok(bigDrop > wingDrop, `big ${bigDrop} wing ${wingDrop}`);

let classOf = Array.from({ length: 36 }, (_, i) => {
  const path = i < 12 ? "boom" : i < 28 ? "average" : "bust";
  const player = {
    ...base,
    id: `class-${i}`,
    age: 19,
    position: "SF" as const,
    personality: 0,
    minutesPreference: 24,
    ratings: { ...base.ratings, impact: 0.4, potential: 6, durability: 75 },
  };
  const built = buildSheet(player);
  return {
    ...player,
    sheet: {
      ...built,
      potential: {
        ...built.potential,
        path: path as "boom" | "average" | "bust",
        ceiling: built.overall + 16,
        floor: Math.max(25, built.overall - 8),
      },
    },
  };
});
for (let year = 0; year < 6; year++) {
  classOf = classOf.map((player) => progressSheet({ ...player, age: player.age + 1 }, { minutes: 24, coach: 0.4 }));
}
const classGain = mean(classOf.map((player) => player.ratings.impact)) - 0.4;
assert.ok(classGain > 0.2 && classGain < 1.2, `six-year class gain ${classGain}`);
const boomGain = mean(classOf.slice(0, 12).map((player) => player.ratings.impact)) - 0.4;
const bustGain = mean(classOf.slice(28).map((player) => player.ratings.impact)) - 0.4;
assert.ok(boomGain > bustGain + 0.35, `boom ${boomGain} bust ${bustGain}`);

const glass = playerSheet({
  ...base,
  id: "robinson",
  name: "Mitchell Robinson",
  age: 28,
  position: "C",
  nbaSeason: {
    season: "2025-26",
    team: "NYK",
    gp: 60,
    min: 1176,
    pts: 342,
    reb: 528,
    ast: 54,
    stl: 54,
    blk: 72,
    tov: 42,
    fgm: 147,
    fga: 204,
    tpm: 0,
    tpa: 0,
    ftm: 41,
    fta: 102,
  },
});
assert.ok(glass.attributes.offReb >= 97, `oreb ${glass.attributes.offReb}`);
assert.ok(glass.attributes.block >= 85, `block ${glass.attributes.block}`);
assert.ok(glass.attributes.threePoint <= 40, `three ${glass.attributes.threePoint}`);

const wing = playerSheet({
  ...base,
  id: "tatum",
  name: "Jayson Tatum",
  age: 28,
  position: "SF",
  nbaSeason: {
    season: "2025-26",
    team: "BOS",
    gp: 16,
    min: 522,
    pts: 349,
    reb: 160,
    ast: 85,
    stl: 22,
    blk: 3,
    tov: 38,
    fgm: 118,
    fga: 286,
    tpm: 47,
    tpa: 142,
    ftm: 65,
    fta: 79,
  },
});
assert.ok(wing.attributes.offReb <= 45, `tatum oreb ${wing.attributes.offReb}`);
assert.ok(wing.attributes.defReb >= 90, `tatum dreb ${wing.attributes.defReb}`);

const center = { ...base, id: "glass-center", name: "Glass Center", position: "C" as const };
const ace = makeScout(() => 0.8, { id: "ace", eye: 5, expertise: "bigs", yearsExperience: 20 });
const lost = makeScout(() => 0.2, { id: "lost", eye: 1, expertise: "guards", yearsExperience: 2 });
const tight = scoutPotentialView(center, ace);
const foggy = scoutPotentialView(center, lost);
assert.ok(tight.high - tight.low < foggy.high - foggy.low);
assert.ok(!tight.comment.toLowerCase().includes("boom"));
assert.ok(foggy.comment.length > 10);

const rookie = applyRookieRatings({
  ...base,
  id: "5142718",
  name: "AJ Dybantsa",
  age: 19,
  position: "SF",
  draftLabel: "2026: Rd 1, Pk 1 (WSH)",
  college: "BYU",
  nbaSeason: undefined,
  minutesPreference: 18,
  ratings: { ...base.ratings, impact: -1.2, potential: 0, offense: -1, defense: -0.4 },
  sheet: { ...sheet, version: 4, overall: 46 },
});
assert.ok(rookie.sheet!.overall >= 78, `dybantsa ${rookie.sheet!.overall}`);
assert.ok(rookie.ratings.potential >= 8, `potential ${rookie.ratings.potential}`);
assert.ok(rookie.sheet!.potential.ceiling >= 90, `ceiling ${rookie.sheet!.potential.ceiling}`);
assert.equal(rookieOverall(1, 27) >= 68 && rookieOverall(1, 27) < rookieOverall(1, 1), true);
const veteran = applyRookieRatings({
  ...base,
  id: "1628369",
  age: 28,
  draftLabel: "2017: Rd 1, Pk 3 (BOS)",
  nbaSeason: { ...base.nbaSeason!, gp: 70, min: 2400, season: "2025-26" },
  sheet: { ...sheet, version: 4, overall: 86 },
});
  assert.equal(veteran.sheet!.overall, 86);

// Cold Darko on a late first-round kid must not wipe potential / stamp finished.
const hugoPotential = estimateActivePotential({
  impact: -2.1,
  age: 20,
  usagePct: 0.14,
  draftPick: 28,
});
assert.ok(hugoPotential >= 6.5, `hugo potential ${hugoPotential}`);
const hugoLike = applyRookieRatings({
  ...base,
  id: "1642864",
  name: "Hugo González",
  age: 20,
  position: "SG",
  draftLabel: "2025: Rd 1, Pk 28 (BOS)",
  nbaPlayerId: "1642864",
  nbaSeason: {
    season: "2025-26",
    team: "BOS",
    gp: 74,
    min: 1084,
    pts: 400,
    reb: 200,
    ast: 80,
    stl: 40,
    blk: 30,
    tov: 50,
    fgm: 150,
    fga: 320,
    tpm: 40,
    tpa: 140,
    ftm: 60,
    fta: 80,
  },
  ratings: { ...base.ratings, impact: -2.1, potential: 0, offense: -1.9, defense: -0.2 },
  sheet: { ...sheet, version: 4, overall: 70, potential: { ...sheet.potential, ceiling: 74, trait: "bust" } },
});
assert.ok(hugoLike.ratings.potential >= 6.5, `hugo sheet pot ${hugoLike.ratings.potential}`);
assert.ok(
  hugoLike.sheet!.potential.ceiling >= 80,
  `hugo ceiling ${hugoLike.sheet!.potential.ceiling}`
);
assert.notEqual(hugoLike.sheet!.potential.trait, "bust");

const seasonStep = progressSheet(
  {
    ...boom,
    age: 20,
    seasonLine: {
      season: "2027",
      team: "BOS",
      gp: 40,
      min: 40 * 32,
      pts: 40 * 22,
      reb: 40 * 6,
      ast: 40 * 4,
      stl: 40,
      blk: 20,
      tov: 80,
      fgm: 300,
      fga: 640,
      tpm: 80,
      tpa: 220,
      ftm: 120,
      fta: 150,
    },
  },
  { minutes: 32, coach: 0.5, pace: "season", form: 0.04 }
);
assert.ok(seasonStep.sheet!.overall >= sheet.overall, "a young boom takes a step in season");
assert.ok(seasonStep.sheet!.overall - sheet.overall <= 3, "the in-season step stays smaller than a summer leap");
const quiet = progressSheet({ ...boom, age: 20 }, { minutes: 32, coach: 0.5, pace: "season" });
assert.ok(seasonStep.sheet!.overall >= quiet.sheet!.overall);

const januaryLeague = {
  ...league,
  season: 2027,
  phase: "regular" as const,
  schedule: [{ id: "g", season: 2027, day: 40, gameDate: "2027-01-04", homeTeamId: "bos", awayTeamId: "nyk", played: true, homeScore: 110, awayScore: 100 }],
  players: [boom],
  devMarks: undefined,
};
const once = maybeGrowInSeason(januaryLeague as unknown as typeof league);
const twice = maybeGrowInSeason(once);
assert.equal(once.devMarks?.january, true);
assert.equal(twice.players[0]!.sheet!.overall, once.players[0]!.sheet!.overall);

console.log(
  "attributes ok",
  sheet.overall,
  grown.sheet!.overall,
  declining.sheet!.overall,
  glass.attributes.offReb,
  wing.attributes.offReb
);
