/**
 * Peak Impact companion — DARKO / RAPTOR / BPM preference.
 * Run: npx tsx scripts/test-peak-impact.ts
 */
import assert from "node:assert/strict";
import { computePeakImpact } from "../src/analytics/peak-impact";
import type { PlayerSeason } from "../src/data/types";

function row(
  partial: Partial<PlayerSeason> & {
    season: string;
    playerId?: string;
  }
): PlayerSeason {
  return {
    playerId: partial.playerId ?? "1",
    playerName: partial.playerName ?? "Test",
    season: partial.season,
    teamId: partial.teamId ?? "bos",
    teamName: partial.teamName ?? "Boston",
    gamesPlayed: partial.gamesPlayed ?? 70,
    minutes: partial.minutes ?? 70 * 32,
    points: partial.points ?? 1400,
    rebounds: partial.rebounds ?? 400,
    assists: partial.assists ?? 300,
    steals: partial.steals ?? 80,
    blocks: partial.blocks ?? 40,
    turnovers: partial.turnovers ?? 150,
    fieldGoalsMade: 500,
    fieldGoalsAttempted: 1000,
    threePointersMade: 100,
    threePointersAttempted: 300,
    freeThrowsMade: 200,
    freeThrowsAttempted: 250,
    offensiveRebounds: 50,
    defensiveRebounds: 350,
    personalFouls: 100,
    plusMinus: 0,
    trueShootingPct: 0.58,
    usagePct: 0.28,
    darkoDpm: partial.darkoDpm,
    raptor: partial.raptor,
    bpm: partial.bpm,
    ...partial,
  } as PlayerSeason;
}

{
  const career = [
    row({ season: "2018-19", darkoDpm: 2.1, raptor: 4.0, bpm: 3.0 }),
    row({ season: "2019-20", darkoDpm: 3.5, raptor: 3.0, bpm: 4.0 }),
    row({ season: "2022-23", darkoDpm: 2.8, bpm: 5.0 }),
  ];
  const peak = computePeakImpact({ playerId: "1", career });
  assert.equal(peak.primary?.metricId, "darko");
  assert.equal(peak.primary?.season, "2019-20");
  assert.equal(peak.byMetric.raptor?.season, "2018-19");
  assert.equal(peak.byMetric.bpm?.season, "2022-23");
}

{
  const career = [
    row({ season: "2010-11", raptor: 6.2, bpm: 4.0 }),
    row({ season: "2011-12", raptor: 5.0, bpm: 7.0 }),
  ];
  const peak = computePeakImpact({ playerId: "1", career });
  assert.equal(peak.primary?.metricId, "raptor");
  assert.equal(peak.primary?.season, "2010-11");
}

{
  const career = [
    row({ season: "2023-24", bpm: 2.0 }),
    row({ season: "2024-25", bpm: 4.5 }),
  ];
  const peak = computePeakImpact({ playerId: "1", career });
  assert.equal(peak.primary?.metricId, "bpm");
  assert.equal(peak.primary?.season, "2024-25");
}

{
  const career = [row({ season: "2005-06", gamesPlayed: 5, minutes: 40 })];
  const peak = computePeakImpact({ playerId: "1", career });
  assert.equal(peak.primary, null);
}

console.log("peak-impact checks passed");
