/**
 * Career board SSR slim: null metric keys must be omitted.
 * Run: npx tsx --require ./scripts/lib/stub-server-only.cjs scripts/test-career-board-ssr-slim.ts
 */
import assert from "node:assert/strict";

import { toCareerBoardRows } from "../src/components/players/player-career-island";
import type { PlayerSeason } from "../src/data/types";

const base: PlayerSeason = {
  playerId: "1",
  playerName: "Test",
  teamId: "13",
  teamName: "LAL",
  teamAbbreviation: "LAL",
  season: "2024-25",
  gamesPlayed: 70,
  gamesStarted: 70,
  minutes: 2400,
  points: 1400,
  rebounds: 500,
  assists: 400,
  steals: 70,
  blocks: 30,
  turnovers: 200,
  fieldGoalsMade: 500,
  fieldGoalsAttempted: 1000,
  threePointersMade: 100,
  threePointersAttempted: 300,
  freeThrowsMade: 300,
  freeThrowsAttempted: 400,
  offensiveRebounds: 50,
  defensiveRebounds: 450,
  personalFouls: 140,
  fieldGoalPct: 0.5,
  threePointPct: 0.33,
  freeThrowPct: 0.75,
};

const rows = toCareerBoardRows([base]);
assert.equal(rows.length, 1);
const row = rows[0]!;
assert.equal("raptor" in row, false, "omit null raptor");
assert.equal("war1" in row, false, "omit null war1");
assert.equal("drbl100" in row, false, "omit null drbl");
assert.equal("ppg" in row, true);
assert.ok(typeof row.ppg === "number");
assert.ok(Object.keys(row).length < 40, "should drop most null advanced fields");

console.log("test-career-board-ssr-slim: ok");
