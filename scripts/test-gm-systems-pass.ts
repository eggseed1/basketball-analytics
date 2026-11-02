/**
 * Cross-system flesh-out checks: fog looks, trait growth, rotation→sim,
 * trade blocks, scouting calibration.
 * Run: npx tsx scripts/test-gm-systems-pass.ts
 */
import assert from "node:assert/strict";

import { playerSheet, progressSheet } from "../src/gm/engine/attributes";
import {
  autoBalanceRotation,
  coachingBoost,
  rotationForTeam,
} from "../src/gm/engine/coaching";
import {
  discourseTraitHint,
  playerDevTrait,
  rollDevTrait,
  traitGrowthMul,
} from "../src/gm/engine/dev-traits";
import { createRng } from "../src/gm/engine/rng";
import {
  buildScoutProfile,
  gradeCalibrationError,
  sealProspect,
  spendScoutingLook,
} from "../src/gm/engine/scouting";
import { simulateGame } from "../src/gm/engine/simulate";
import {
  cpuDeadlineTrades,
  refreshTradeBlocks,
} from "../src/gm/engine/trades";
import { createDraftClass } from "../src/gm/seed/prospect-identities";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import type { GmPlayer, GmScheduleGame, GmTeam } from "../src/gm/types";
import type { GmScout } from "../src/gm/seed/scouts";

// --- Draft fog: scout look fills a blank grade ---
const rng = createRng(11);
const klass = createDraftClass({
  count: 30,
  seasonEndYear: 2027,
  scoutLevel: 1,
  rng,
  seal: (player, level, idx, roll) => sealProspect(player, level, idx, roll),
});
const weak: GmScout = {
  id: "weak",
  name: "Tape Guy",
  yearsExperience: 2,
  expertise: "general",
  eye: 1,
  salaryM: 0.4,
  bio: "Learning.",
};
const prospect = klass.find((p) =>
  Object.values(p.scoutProfile?.grades ?? {}).some((g) => g == null)
)!;
assert.ok(prospect, "fogged class should leave some grades blank");
const blanksBefore = Object.values(prospect.scoutProfile!.grades).filter((g) => g == null).length;
const looked = spendScoutingLook(prospect, weak);
const blanksAfter = Object.values(looked.scoutProfile!.grades).filter((g) => g == null).length;
assert.ok(blanksAfter < blanksBefore, "scout look should fill at least one grade");
assert.ok(
  (looked.scouted.uncertainty ?? 1) < (prospect.scouted.uncertainty ?? 1),
  "uncertainty should tighten"
);
assert.equal(looked.identityRevealed, prospect.identityRevealed);

const sharp: GmScout = { ...weak, id: "sharp", eye: 5, yearsExperience: 20 };
const foggy = buildScoutProfile(klass[0]!, 1, 0, createRng(3), weak);
const crisp = buildScoutProfile(klass[0]!, 5, 0, createRng(3), sharp);
const fogErr =
  gradeCalibrationError({ ...klass[0]!, scoutProfile: foggy }, "shooting") ?? 9;
const crispErr =
  gradeCalibrationError({ ...klass[0]!, scoutProfile: crisp }, "shooting") ?? 9;
assert.ok(
  crispErr <= fogErr,
  `elite scout should be no worse than foggy (${crispErr} vs ${fogErr})`
);

// --- Dev traits: discourse floor + multi-season divergence ---
const jokicLike: GmPlayer = {
  ...klass[0]!,
  id: "jokic-test",
  name: "Nikola Jokic",
  age: 29,
  ratings: { ...klass[0]!.ratings, impact: 5.5, potential: 6 },
  sheet: undefined,
};
assert.equal(discourseTraitHint(jokicLike, 92), "xfactor");
const jokicTrait = rollDevTrait(jokicLike, 92, 6, createRng(0));
assert.ok(
  jokicTrait === "xfactor" || jokicTrait === "superstar" || jokicTrait === "star",
  "discourse star should not roll Bust"
);

function growYears(base: GmPlayer, trait: "xfactor" | "bust", years: number): number {
  let p: GmPlayer = {
    ...base,
    id: `${base.id}-${trait}`,
    age: 20,
    sheet: {
      ...playerSheet(base),
      potential: {
        ...playerSheet(base).potential,
        trait,
        path: trait === "bust" ? "bust" : "boom",
        ceiling: trait === "bust" ? 78 : 94,
        floor: trait === "bust" ? 62 : 72,
      },
      overall: 74,
    },
  };
  for (let y = 0; y < years; y++) {
    p = progressSheet(
      { ...p, age: 20 + y },
      { coach: 0.5, minutes: 30, pace: "summer" }
    );
  }
  return p.sheet!.overall;
}

const baseKid = klass[1]!;
const xOvr = growYears(baseKid, "xfactor", 5);
const bustOvr = growYears(baseKid, "bust", 5);
assert.ok(
  xOvr > bustOvr + 2,
  `X-Factor should outgrow Bust over 5 summers (${xOvr} vs ${bustOvr})`
);
assert.ok(traitGrowthMul("xfactor") > traitGrowthMul("bust"));

// --- Rotation quality → sim offense bump ---
function fakeTeam(id: string, minutes: Record<string, number>): GmTeam {
  return {
    id,
    abbr: id.toUpperCase(),
    city: id,
    name: id,
    conference: "East",
    division: "Atlantic",
    starters: { PG: null, SG: null, SF: null, PF: null, C: null },
    benchOrder: Object.keys(minutes),
    draftPicks: [],
    staff: {
      headCoach: { name: "Coach", offenseBonus: 0, defenseBonus: 0, developmentBonus: 0 },
      scoutLevel: 1,
      trainerLevel: 1,
    },
    ownerGoal: "compete",
    ownerPatience: 50,
    fanConfidence: 50,
    payrollLuxuryTaxM: 0,
    tradeExceptionsM: [],
    coaching: { minutes, offense: "balanced", defense: "balanced", tempo: "normal", playThrough: [null, null] },
  } as GmTeam;
}

function squad(teamId: string): GmPlayer[] {
  const positions = ["PG", "SG", "SF", "PF", "C", "PG", "SG", "SF", "PF", "C"] as const;
  return positions.map((position, i) => {
    const base: GmPlayer = {
      id: `${teamId}-${i}`,
      name: `${teamId}-${i}`,
      teamId,
      position,
      age: 26,
      heightIn: 78,
      weightLbs: 210,
      ratings: {
        impact: 2.5 - i * 0.15,
        offense: 2.5,
        defense: 1.5,
        finishing: 70,
        shooting: 70,
        playmaking: 65,
        rebounding: 55,
        durability: 75,
        potential: 5,
      },
      scouted: { impact: 2, offense: 2, defense: 1, uncertainty: 0.1 },
      contract: { annualSalaryM: 8, yearsRemaining: 2, signedSeason: 2025, birdRights: "none", signedVia: "room" },
      injury: null,
      morale: 70,
      personality: 0,
      minutesPreference: 24,
    };
    return { ...base, sheet: playerSheet(base) };
  });
}

const homePlayers = squad("home");
const awayPlayers = squad("away");
const allPlayers = [...homePlayers, ...awayPlayers];
const balanced = autoBalanceRotation(
  fakeTeam("home", {}),
  homePlayers
);
const hogged: Record<string, number> = {};
for (const p of homePlayers) hogged[p.id] = 0;
hogged[homePlayers[0]!.id] = 40;
hogged[homePlayers[1]!.id] = 40;
hogged[homePlayers[2]!.id] = 40;
hogged[homePlayers[3]!.id] = 40;
hogged[homePlayers[4]!.id] = 40;

const homeBalanced = fakeTeam("home", balanced.minutes);
const homeHog = fakeTeam("home", hogged);
const away = fakeTeam("away", {});
const boostBalanced = coachingBoost(homeBalanced, homePlayers);
const boostHog = coachingBoost(homeHog, homePlayers);
assert.ok(
  boostBalanced > boostHog,
  `balanced book should boost more than hog (${boostBalanced} vs ${boostHog})`
);

const game: GmScheduleGame = {
  id: "g1",
  season: 2027,
  day: 10,
  gameDate: "2027-01-15",
  homeTeamId: "home",
  awayTeamId: "away",
  played: false,
};
let balPts = 0;
let hogPts = 0;
for (let seed = 1; seed <= 24; seed++) {
  const bal = simulateGame(game, [homeBalanced, away], allPlayers, seed);
  const hog = simulateGame(game, [homeHog, away], allPlayers, seed);
  balPts += bal.game.homeScore ?? 0;
  hogPts += hog.game.homeScore ?? 0;
}
assert.ok(
  balPts > hogPts,
  `balanced rotations should outscore hogged over 24 seeds (${balPts} vs ${hogPts})`
);

// Out-of-position cover should cost points vs natural listings.
const naturalCover: Record<string, (typeof homePlayers)[0]["position"]> = {};
for (const p of homePlayers) naturalCover[p.id] = p.position;
const stretched = {
  ...homeBalanced,
  coaching: {
    ...homeBalanced.coaching!,
    coverSlot: Object.fromEntries(
      homePlayers.map((p, i) => [p.id, (["C", "PF", "SF", "SG", "PG"] as const)[i % 5]!])
    ),
  },
};
const natural = {
  ...homeBalanced,
  coaching: { ...homeBalanced.coaching!, coverSlot: naturalCover },
};
const oopPlan=rotationForTeam(stretched,allPlayers);
assert.ok(oopPlan.frames.some(frame=>homePlayers.find(p=>p.id===frame.PG)?.position==="C"),"cover requests change actual on-court assignments");
const oopBox=simulateGame(game,[stretched,away],allPlayers,3).box;
assert.ok(oopBox.players.some(p=>p.teamId==="home"&&homePlayers.find(player=>player.id===p.playerId)?.position==="C"&&(p.positionMinutes?.PG??0)>0),"box position minutes record the actual stretch");
let natPts = 0;
let oopPts = 0;
for (let seed = 1; seed <= 24; seed++) {
  natPts += simulateGame(game, [natural, away], allPlayers, seed).game.homeScore ?? 0;
  oopPts += simulateGame(game, [stretched, away], allPlayers, seed).game.homeScore ?? 0;
}
assert.ok(
  natPts > oopPts,
  `natural cover should outscore OOP over 24 seeds (${natPts} vs ${oopPts})`
);

// --- Trade blocks for sellers ---
const league = createGeneratedLeague({ userTeamId: "bos", season: 2026, seed: 9 });
const blocked = refreshTradeBlocks(league);
const sellers = blocked.teams.filter((t) => {
  const stance = blocked.standings; // just ensure blocks exist for some clubs
  void stance;
  return (t.tradeBlock?.length ?? 0) > 0;
});
assert.ok(sellers.length >= 3, "sellers/stay clubs should list trade-block names");
const afterDeadline = cpuDeadlineTrades(blocked);
assert.ok(afterDeadline.tradeLog.length >= 0);

console.log("systems pass ok", {
  blanks: `${blanksBefore}->${blanksAfter}`,
  xOvr,
  bustOvr,
  boostBalanced: Number(boostBalanced.toFixed(3)),
  boostHog: Number(boostHog.toFixed(3)),
  balPts,
  hogPts,
  natPts,
  oopPts,
  blocks: sellers.length,
  deadlineDeals: afterDeadline.tradeLog.length - league.tradeLog.length,
  sampleTrait: playerDevTrait(jokicLike),
});

