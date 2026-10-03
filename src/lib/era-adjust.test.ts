/**
 * Run: npx tsx --test src/lib/era-adjust.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import { withPlayerSeasonDefaults } from "@/data/transformers/player-season-defaults";
import type { PlayerSeason } from "@/data/types";
import { buildCareerAverageRow, careerSeasonPool } from "@/lib/career-average-row";
import {
  ERA_REFERENCE_SEASON,
  applyTrackedCareerStats,
  blankUntrackedSeasonStats,
  eraAdjustSeasonRow,
  leagueAveragesFor,
  trackedSince,
} from "@/lib/era-adjust";

function season(over: Partial<PlayerSeason>): PlayerSeason {
  return withPlayerSeasonDefaults({
    playerId: "p1",
    playerName: "Test",
    teamId: "1",
    teamName: "Test",
    season: "1961-62",
    gamesPlayed: 80,
    minutes: 3000,
    points: 2000,
    rebounds: 1600,
    assists: 200,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    fieldGoalsMade: 800,
    fieldGoalsAttempted: 1600,
    fieldGoalPct: 0.5,
    ...over,
  } as PlayerSeason);
}

test("the reference season comes back unchanged", () => {
  const row = season({ season: ERA_REFERENCE_SEASON });
  const { row: out, unadjusted } = eraAdjustSeasonRow(row);
  assert.equal(out, row);
  assert.equal(unadjusted.size, 0);
});

test("counting stats scale by league average and percentages shift by the gap", () => {
  const lg = leagueAveragesFor("1961-62")!;
  const ref = leagueAveragesFor(ERA_REFERENCE_SEASON)!;
  const { row } = eraAdjustSeasonRow(season({}));
  assert.ok(Math.abs(row.rebounds - 1600 * (ref.trb! / lg.trb!)) < 1e-9);
  assert.ok(Math.abs(row.points - 2000 * (ref.pts! / lg.pts!)) < 1e-9);
  assert.ok(Math.abs(row.fieldGoalPct - (0.5 + ref.fgPct! - lg.fgPct!)) < 1e-9);
  const before = season({ threePointersAttempted: 12 });
  assert.equal(eraAdjustSeasonRow(before).row.threePointersAttempted, 12);
});

test("stats the league didn't track yet are blank, not 0", () => {
  const old = blankUntrackedSeasonStats(season({}));
  assert.ok(Number.isNaN(old.steals));
  assert.ok(Number.isNaN(old.turnovers));
  assert.equal(old.rebounds, 1600);
  const modern = season({ season: "1990-91", steals: 120 });
  assert.equal(blankUntrackedSeasonStats(modern), modern);
  assert.equal(trackedSince("stl"), "1973-74");
  assert.equal(trackedSince("tov"), "1977-78");
});

test("a career straddling the tracking start averages only tracked seasons", () => {
  const seasons = [
    season({ season: "1972-73", gamesPlayed: 80, steals: 0 }),
    season({ season: "1973-74", gamesPlayed: 80, steals: 160 }),
  ];
  const built = buildCareerAverageRow(seasons)!;
  const { row, partial } = applyTrackedCareerStats(built, careerSeasonPool(seasons));
  assert.ok(partial.includes("stl"));
  assert.equal(row.steals / row.gamesPlayed, 2);
});
