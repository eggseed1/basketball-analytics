/**
 * Run: npx tsx --test src/lib/player-role.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { PlayerSeason } from "@/data/types";
import {
  assignPlayerRole,
  resolveRoleShell,
  resolveShotDiet,
} from "@/lib/player-role";

function base(over: Partial<PlayerSeason> = {}): PlayerSeason {
  return {
    playerId: "p1",
    playerName: "Test",
    teamId: "1",
    teamName: "Test",
    season: "2025-26",
    gamesPlayed: 60,
    gamesStarted: 60,
    minutes: 2000,
    fieldGoalsMade: 400,
    fieldGoalsAttempted: 900,
    threePointersMade: 100,
    threePointersAttempted: 300,
    freeThrowsMade: 200,
    freeThrowsAttempted: 250,
    offensiveRebounds: 40,
    defensiveRebounds: 200,
    rebounds: 240,
    assists: 300,
    steals: 60,
    blocks: 20,
    turnovers: 120,
    personalFouls: 100,
    points: 1100,
    plusMinus: 0,
    fieldGoalPct: 0.44,
    twoPointPct: 0.5,
    threePointPct: 0.33,
    freeThrowPct: 0.8,
    threePointAttemptRate: 0.33,
    freeThrowRate: 0.28,
    turnoverPct: 0.12,
    usagePct: 0.24,
    assistPct: 0.2,
    offensiveReboundPct: 0.04,
    defensiveReboundPct: 0.14,
    reboundPct: 0.09,
    stealPct: 0.015,
    blockPct: 0.01,
    pie: 0.12,
    per: 15,
    ows: 2,
    dws: 2,
    winShares: 4,
    winSharesPer48: 0.1,
    obpm: 0,
    dbpm: 0,
    bpm: 0,
    vorp: 1,
    dpm: 0,
    oDpm: 0,
    dDpm: 0,
    boxDpm: 0,
    onOffDpm: 0,
    drbl100: 0,
    drblP: 0,
    drblLn: 0,
    drblB: 0,
    drblO: 0,
    drblD: 0,
    sdv100: 0,
    shotMaking100: 0,
    epvShootMean: 0,
    vContMean: 0,
    r1Points: null,
    r1WinEquivalents: null,
    drblWar: 0,
    drblSeasonalImpact: 0,
    drblL: 0,
    drblMeanLeverage: 0,
    drblDisagreement: 0,
    drblUncertainty: 0,
    drblIntervalLo: 0,
    drblIntervalHi: 0,
    ...over,
  };
}

test("shell treats centers as bigs", () => {
  assert.equal(resolveRoleShell("C", 0.1), "big");
  assert.equal(resolveRoleShell("PG", 0.05), "guard");
  assert.equal(resolveRoleShell("SF", 0.08), "wing");
});

test("engine vs volume scorer from usage × assist", () => {
  const engine = assignPlayerRole({
    row: base({ usagePct: 0.31, assistPct: 0.4, threePointAttemptRate: 0.35 }),
  });
  assert.equal(engine?.id, "half_court_engine");

  const volume = assignPlayerRole({
    row: base({ usagePct: 0.32, assistPct: 0.12, threePointAttemptRate: 0.3 }),
  });
  assert.equal(volume?.id, "volume_scorer");
});

test("stretch big vs paint big", () => {
  const stretch = assignPlayerRole({
    row: base({
      position: "C",
      usagePct: 0.2,
      assistPct: 0.1,
      reboundPct: 0.16,
      threePointAttemptRate: 0.38,
    }),
  });
  assert.equal(stretch?.id, "stretch_big");

  const paint = assignPlayerRole({
    row: base({
      position: "C",
      usagePct: 0.18,
      assistPct: 0.08,
      reboundPct: 0.18,
      threePointAttemptRate: 0.05,
    }),
    zones: [
      { zone: "RIM", frequency: 0.5 },
      { zone: "PAINT_NON_RIM", frequency: 0.25 },
      { zone: "ABOVE_BREAK_3", frequency: 0.05 },
    ],
  });
  assert.equal(paint?.id, "post_paint_big");
});

test("spacer from low usage + high 3PAr", () => {
  const spacer = assignPlayerRole({
    row: base({
      position: "SF",
      usagePct: 0.14,
      assistPct: 0.08,
      threePointAttemptRate: 0.55,
    }),
  });
  assert.equal(spacer?.id, "catch_and_shoot_spacer");
});

test("diet prefers zone shares when present", () => {
  const diet = resolveShotDiet(
    base({ threePointAttemptRate: 0.5 }),
    [
      { zone: "RIM", frequency: 0.55 },
      { zone: "ABOVE_BREAK_3", frequency: 0.2 },
    ]
  );
  assert.equal(diet, "rim");
});

test("does not use impact fields — high DRBL still spacer when shape says so", () => {
  const spacer = assignPlayerRole({
    row: base({
      usagePct: 0.13,
      assistPct: 0.07,
      threePointAttemptRate: 0.58,
      drbl100: 5,
      drblO: 3,
      drblD: 2,
    } as Partial<PlayerSeason>),
  });
  assert.equal(spacer?.id, "catch_and_shoot_spacer");
});
