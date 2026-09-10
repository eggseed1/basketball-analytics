/**
 * Full-league race field must not leave a hole around replacement level.
 * Run: npx tsx scripts/test-player-race-tracker.ts
 */
import assert from "node:assert/strict";

import {
  buildPlayerRaceOverlayPlayer,
  samplePlayerRaceFieldEvenly,
  takePlayerRaceFieldSlice,
} from "../src/lib/player-race-tracker";

function main() {
  const pool = Array.from({ length: 500 }, (_, i) => ({
    id: `p${i}`,
    war: 5 - i * 0.02,
  }));
  const keyOf = (row: (typeof pool)[number]) => row.id;

  const bothEnds = takePlayerRaceFieldSlice(pool, 120, "both", keyOf);
  assert.equal(bothEnds.length, 120);
  const nearZero = bothEnds.filter((row) => Math.abs(row.war) < 0.75);
  assert.equal(
    nearZero.length,
    0,
    "both-ends slice should skip replacement-level players"
  );

  const spread = samplePlayerRaceFieldEvenly(pool, 120, keyOf);
  assert.ok(
    spread.filter((row) => Math.abs(row.war) < 0.75).length >= 8,
    "even spread should include middle players"
  );

  const overlay = buildPlayerRaceOverlayPlayer({
    playerId: "708",
    displayName: "Test",
    teamId: "2",
    teamAbbr: "BOS",
    metric: "war1",
    seasonTotal: 8.5,
    startDate: "2025-10-15",
    endDate: "2026-04-15",
    gamesPlayed: 70,
    minutesPlayed: 2400,
  });
  assert.ok(overlay, "season_total overlay should build");
  assert.ok((overlay?.points.length ?? 0) >= 16);
  const last = overlay!.points[overlay!.points.length - 1]!;
  assert.ok(
    Math.abs(last.value - 8.5) < 0.6,
    `overlay should settle near season total (got ${last.value})`
  );

  const countingOverlay = buildPlayerRaceOverlayPlayer({
    playerId: "201939",
    displayName: "Counter",
    teamId: "9",
    teamAbbr: "GSW",
    metric: "points",
    seasonTotal: 2100,
    startDate: "2025-10-15",
    endDate: "2026-04-15",
    gamesPlayed: 74,
    minutesPlayed: 2500,
  });
  assert.ok(countingOverlay, "counting overlay should build for full-field path");
  assert.ok(
    Math.abs((countingOverlay!.points.at(-1)?.value ?? 0) - 2100) < 1,
    "counting overlay should settle on season total"
  );

  console.log("test-player-race-tracker: ok");
}

main();
