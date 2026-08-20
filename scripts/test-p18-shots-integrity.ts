/**
 * P18 shot + presentation unit tests
 *   npx tsx scripts/test-p18-shots-integrity.ts
 */
import assert from "node:assert/strict";
import {
  isMalformedEmptyFinalShell,
  validateGamePresentation,
  seasonFromNbaGameId,
} from "../src/lib/game-presentation";
import {
  assignShotZone,
  normalizeNbaLegacyCoords,
  isSmallSample,
} from "../src/lib/shots/court-geometry";
import {
  buildShotEventsFromActions,
  upsertShotEvents,
  filterShots,
  shotCoverage,
} from "../src/lib/shots/shot-events";
import { loadRawArchiveBoxScore } from "../src/data/history/raw-archive-box";
import type { Game } from "../src/data/types";

// Presentation
{
  const bad: Game = {
    id: "0022400001",
    season: "2024-25",
    gameDate: "",
    homeTeamId: "",
    awayTeamId: "",
    homeScore: 0,
    awayScore: 0,
    gameType: "regular",
    status: "final",
  };
  assert.equal(isMalformedEmptyFinalShell(bad), true);
  const v = validateGamePresentation(bad);
  assert.equal(v.canRenderScoreHeader, false);
}

{
  const good = loadRawArchiveBoxScore("0020500001");
  assert.ok(good?.game.homeTeamId);
  assert.ok(good!.game.homeScore > 0 || good!.game.awayScore > 0);
  const v = validateGamePresentation(good!.game);
  assert.equal(v.canRenderScoreHeader, true);
}

assert.equal(seasonFromNbaGameId("0022400018"), "2024-25");
assert.equal(seasonFromNbaGameId("0020500001"), "2005-06");

// Coords / zones
{
  assert.equal(normalizeNbaLegacyCoords(0, 0), null);
  const p = normalizeNbaLegacyCoords(50, 50);
  assert.ok(p && Math.abs(p.x - 5) < 1e-9);
  assert.equal(assignShotZone({ x: 0, y: 2 }, "2PT"), "RIM");
  assert.equal(assignShotZone({ x: -23, y: 5 }, "3PT"), "LEFT_CORNER_3");
  assert.equal(isSmallSample(2), true);
  assert.equal(isSmallSample(8), false);
}

// Appendable + stable ids
{
  const actions = [
    {
      actionNumber: 1,
      actionId: 10,
      clock: "PT11M00.00S",
      period: 1,
      teamId: 1,
      personId: 9,
      actionType: "Made Shot",
      shotResult: "Made",
      shotValue: 2,
      scoreHome: "2",
      scoreAway: "0",
      xLegacy: 20,
      yLegacy: 30,
      description: "A 2 PTS",
    },
    {
      actionNumber: 2,
      actionId: 11,
      clock: "PT10M00.00S",
      period: 1,
      teamId: 1,
      personId: 9,
      actionType: "Missed Shot",
      shotResult: "Missed",
      shotValue: 3,
      scoreHome: "2",
      scoreAway: "0",
      xLegacy: 220,
      yLegacy: 50,
      description: "MISS 3PT",
    },
  ];
  const a = buildShotEventsFromActions("g1", actions);
  assert.equal(a.length, 2);
  assert.equal(a[0]!.eventId, "g1:10");
  const b = upsertShotEvents(a, [
    { ...a[0]!, made: true, eventId: "g1:10" },
  ]);
  assert.equal(b.length, 2);
  const cov = shotCoverage(a);
  assert.ok(cov.withCoords >= 1);
  const q1 = filterShots(a, { period: 1 });
  assert.equal(q1.length, 2);
}

// Free throws excluded
{
  const shots = buildShotEventsFromActions("g", [
    {
      actionType: "Free Throw",
      description: "FT 1 of 1",
      scoreHome: "1",
      scoreAway: "0",
      personId: 1,
      teamId: 1,
      actionId: 1,
      period: 1,
      clock: "PT1M00.00S",
    },
  ]);
  assert.equal(shots.length, 0);
}

// Recent + historical archive shells
for (const id of ["0022400018", "0022500001", "0020500001"]) {
  const box = loadRawArchiveBoxScore(id);
  assert.ok(box, `archive box missing ${id}`);
  assert.ok(box!.game.homeTeamId && box!.game.awayTeamId, id);
  assert.equal(isMalformedEmptyFinalShell(box!.game), false, id);
}

console.log("test-p18-shots-integrity: PASS");
