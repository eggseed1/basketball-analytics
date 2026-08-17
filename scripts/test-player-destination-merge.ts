/**
 * mergePlayerSeasonStats DRBL peer overlay.
 * Run: npx tsx scripts/test-player-destination-merge.ts
 */
import assert from "node:assert/strict";

import { mergePlayerSeasonStats } from "../src/lib/player-destination";
import type { PlayerSeason } from "../src/data/types";

function base(
  partial: Partial<PlayerSeason> &
    Pick<PlayerSeason, "playerId" | "playerName">
): PlayerSeason {
  return {
    playerId: partial.playerId,
    playerName: partial.playerName,
    teamId: partial.teamId ?? "den",
    teamName: partial.teamName ?? "Nuggets",
    season: partial.season ?? "2024-25",
    gamesPlayed: partial.gamesPlayed ?? 70,
    minutes: partial.minutes ?? 2400,
    points: partial.points ?? 1400,
    assists: partial.assists ?? 600,
    rebounds: partial.rebounds ?? 800,
    steals: partial.steals ?? 80,
    blocks: partial.blocks ?? 50,
    turnovers: partial.turnovers ?? 200,
    fieldGoalPct: partial.fieldGoalPct ?? 0.55,
    threePointPct: partial.threePointPct ?? 0.35,
    freeThrowPct: partial.freeThrowPct ?? 0.8,
    trueShootingPct: partial.trueShootingPct ?? 0.6,
    usagePct: partial.usagePct ?? 0.28,
    drbl100: partial.drbl100 ?? 0,
    rawAbilityRate: partial.rawAbilityRate ?? 0,
    drblPossessions: partial.drblPossessions ?? 0,
    drblP: partial.drblP ?? 0,
    drblLn: partial.drblLn ?? 0,
    drblB: partial.drblB ?? 0,
    drblO: partial.drblO ?? 0,
    drblD: partial.drblD ?? 0,
    r1Points: partial.r1Points ?? null,
    r1WinEquivalents: partial.r1WinEquivalents ?? null,
    r1PointValueVersion: partial.r1PointValueVersion ?? null,
    r1WinEquivalentVersion: partial.r1WinEquivalentVersion ?? null,
    ...partial,
  } as PlayerSeason;
}

const seasonRaw = base({
  playerId: "3112335",
  playerName: "Nikola Jokic",
  // Invalid / missing DRBL on raw season row
  drbl100: 0,
  rawAbilityRate: 0,
  drblPossessions: 0,
  r1Points: null,
  r1WinEquivalents: null,
});

const peer = base({
  playerId: "3112335",
  playerName: "Nikola Jokic",
  drbl100: 4.2,
  rawAbilityRate: 4.8,
  drblPossessions: 9000,
  drblRank: 3,
  drblP: 3.1,
  drblLn: 2.0,
  drblB: 0.5,
  drblO: 2.5,
  drblD: 0.6,
  sdv100: 0.2,
  shotMaking100: 0.3,
  epvShootMean: 1.1,
  vContMean: 1.05,
  abilityModelVersion: "validated-v1",
  r1Points: 220.5,
  r1WinEquivalents: 5.7,
  r1PointValueVersion: "r1pv-v1",
  r1WinEquivalentVersion: "r1we-v1",
});

const merged = mergePlayerSeasonStats(seasonRaw, null, peer);
assert.ok(merged);
assert.equal(merged!.drbl100, 4.2);
assert.equal(merged!.rawAbilityRate, 4.8);
assert.equal(merged!.drblPossessions, 9000);
assert.equal(merged!.drblRank, 3);
assert.equal(merged!.drblO, 2.5);
assert.equal(merged!.drblD, 0.6);
assert.equal(merged!.r1Points, 220.5);
assert.equal(merged!.r1WinEquivalents, 5.7);

// Prefer peer when career also present
const career = base({
  playerId: "3112335",
  playerName: "Nikola Jokic",
  drbl100: 1.0,
  rawAbilityRate: 1.1,
  drblPossessions: 1000,
  r1Points: 10,
});
const merged2 = mergePlayerSeasonStats(seasonRaw, career, peer);
assert.equal(merged2!.drbl100, 4.2);
assert.equal(merged2!.r1Points, 220.5);

// Never invent r1 zeros from missing sources
const noR1 = mergePlayerSeasonStats(
  base({
    playerId: "x",
    playerName: "X",
    r1Points: null,
    r1WinEquivalents: null,
  }),
  null,
  base({
    playerId: "x",
    playerName: "X",
    drbl100: 2,
    rawAbilityRate: 2.2,
    drblPossessions: 2000,
    r1Points: null,
    r1WinEquivalents: null,
  })
);
assert.equal(noR1!.r1Points, null);
assert.equal(noR1!.r1WinEquivalents, null);

console.log("test-player-destination-merge: ok");
