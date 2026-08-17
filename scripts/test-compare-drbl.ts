/**
 * P17.1 Compare / season-compare DRBL presence checks.
 * Run: npx tsx scripts/test-compare-drbl.ts
 */
import assert from "node:assert/strict";

import { buildPlayerComparison } from "../src/analytics/compare-players";
import { comparePlayerSeasons } from "../src/analytics/compare-player-seasons";
import { rankPlayerSeasons } from "../src/analytics/rank-player-seasons";
import { METRIC_PICKERS } from "../src/lib/player-stat-comps";
import type { PlayerSeason } from "../src/data/types";

function row(
  partial: Partial<PlayerSeason> &
    Pick<PlayerSeason, "playerId" | "playerName" | "season">
): PlayerSeason {
  return {
    teamId: "2",
    teamName: "Boston Celtics",
    gamesPlayed: 70,
    minutes: 70 * 36,
    points: 70 * 27,
    assists: 70 * 7,
    rebounds: 70 * 7,
    steals: 70 * 1.5,
    blocks: 70 * 0.8,
    turnovers: 70 * 3,
    fieldGoalPct: 0.5,
    threePointPct: 0.35,
    freeThrowPct: 0.8,
    trueShootingPct: 0.58,
    effectiveFieldGoalPct: 0.54,
    usagePct: 0.3,
    offensiveRating: 115,
    defensiveRating: 105,
    netRating: 10,
    drbl100: 0,
    rawAbilityRate: 0,
    drblPossessions: 0,
    drblO: 0,
    drblD: 0,
    drblP: 0,
    drblLn: 0,
    drblB: 0,
    r1Points: null,
    r1WinEquivalents: null,
    ...partial,
  };
}

function validDrbl(
  partial: Partial<PlayerSeason> &
    Pick<PlayerSeason, "playerId" | "playerName" | "season">
): PlayerSeason {
  return row({
    drbl100: 4.2,
    rawAbilityRate: 4.5,
    drblPossessions: 4000,
    drblO: 2.1,
    drblD: 2.0,
    drblP: 1.5,
    drblLn: 0.4,
    drblB: 0.2,
    r1Points: 120,
    r1WinEquivalents: 4.1,
    drblRank: 3,
    ...partial,
  });
}

{
  assert.ok(METRIC_PICKERS.drbl100);
  assert.ok(METRIC_PICKERS.r1Points);
  assert.ok(METRIC_PICKERS.r1WinEq);
}

{
  const a = validDrbl({
    playerId: "1",
    playerName: "A",
    season: "2024-25",
    darkoDpm: 2,
  });
  const b = validDrbl({
    playerId: "2",
    playerName: "B",
    season: "2024-25",
    drbl100: 3.0,
    darkoDpm: 3,
  });
  const peers = [a, b, validDrbl({ playerId: "3", playerName: "C", season: "2024-25", drbl100: 1 })];
  const result = buildPlayerComparison({ a, b, peers });
  const overall = result.dimensions.find((d) => d.id === "overall");
  assert.ok(overall);
  assert.match(overall!.label, /DRBL/i);
  assert.ok(result.dimensions.some((d) => d.id === "r1_points"));
  assert.ok(result.dimensions.some((d) => d.group === "rate_ability"));
  assert.ok(result.dimensions.some((d) => d.group === "realized_value"));
  assert.ok(result.dimensions.some((d) => d.group === "external"));
}

{
  // Asymmetric DRBL → overall unavailable (not cross-metric with DARKO)
  const a = validDrbl({ playerId: "1", playerName: "A", season: "2024-25" });
  const b = row({
    playerId: "2",
    playerName: "B",
    season: "2024-25",
    darkoDpm: 3,
  });
  const result = buildPlayerComparison({ a, b, peers: [a, b] });
  const overall = result.dimensions.find((d) => d.id === "overall");
  assert.ok(overall);
  assert.equal(overall!.bDisplay, "Unavailable");
  assert.ok(overall!.note);
}

{
  const a = validDrbl({ playerId: "1", playerName: "A", season: "2023-24" });
  const b = validDrbl({
    playerId: "1",
    playerName: "A",
    season: "2024-25",
    drbl100: 5.0,
    r1Points: 150,
  });
  const cmp = comparePlayerSeasons({
    playerId: "1",
    playerName: "A",
    seasonA: a,
    seasonB: b,
    impactA: {
      metricId: "drbl100",
      label: "DRBL/100",
      value: a.drbl100,
      source: "test",
    },
    impactB: {
      metricId: "drbl100",
      label: "DRBL/100",
      value: b.drbl100,
      source: "test",
    },
    teamA: null,
    teamB: null,
    nowSeason: "2025-26",
  });
  assert.ok(cmp.metrics.some((m) => m.id === "drbl100"));
  assert.ok(cmp.metrics.some((m) => m.id === "r1_points"));
  assert.ok(cmp.metrics.some((m) => m.category === "diagnostic"));
  assert.ok(
    cmp.metrics.some(
      (m) => m.note && /not sum|non-additive|do not sum/i.test(m.note)
    )
  );
}

{
  const seasons = [
    validDrbl({ playerId: "1", playerName: "A", season: "2022-23", drbl100: 2, r1Points: 80 }),
    validDrbl({ playerId: "1", playerName: "A", season: "2023-24", drbl100: 4, r1Points: 140 }),
    validDrbl({ playerId: "1", playerName: "A", season: "2024-25", drbl100: 3, r1Points: 100 }),
  ];
  const ranking = rankPlayerSeasons({
    playerId: "1",
    playerName: "A",
    seasons,
    impacts: new Map(
      seasons.map((s) => [
        s.season,
        {
          metricId: "drbl100",
          label: "DRBL/100",
          value: s.drbl100,
          source: "test",
        },
      ])
    ),
    teams: new Map(),
    nowSeason: "2025-26",
  });
  assert.equal(ranking.error, null);
  const withDrbl = ranking.ranking.find((e) => e.season === "2023-24");
  assert.ok(withDrbl);
  assert.equal(withDrbl!.drbl100, 4);
  assert.equal(withDrbl!.drblLeagueRank, 3);
  assert.ok(withDrbl!.r1PointsSelectedRank != null);
  // R1 rank must not be labeled as DRBL in the data model field name
  assert.ok("r1PointsSelectedRank" in withDrbl!);
}

console.log("test-compare-drbl: all assertions passed");
