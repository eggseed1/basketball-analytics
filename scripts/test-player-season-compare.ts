/**
 * Deterministic Best Season Lab / same-player season comparison tests.
 * Run: npx tsx scripts/test-player-season-compare.ts
 */
import assert from "node:assert/strict";

import {
  comparePlayerSeasons,
  seasonComparePath,
} from "../src/analytics/compare-player-seasons";
import { comparePlayerSeasonSet } from "../src/analytics/rank-player-seasons";
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
    ...partial,
  };
}

function main() {
  const base = {
    playerId: "test-lebron",
    playerName: "Test Player",
  };

  // A clearly better production
  {
    const a = row({
      ...base,
      season: "2008-09",
      points: 70 * 30,
      assists: 70 * 8,
      rebounds: 70 * 8,
      trueShootingPct: 0.55,
      effectiveFieldGoalPct: 0.5,
    });
    const b = row({
      ...base,
      season: "2012-13",
      points: 70 * 22,
      assists: 70 * 5,
      rebounds: 70 * 5,
      trueShootingPct: 0.62,
      effectiveFieldGoalPct: 0.58,
      offensiveRating: 120,
      defensiveRating: 100,
    });
    const result = comparePlayerSeasons({
      ...base,
      seasonA: a,
      seasonB: b,
      nowSeason: "2025-26",
    });
    const prod = result.categories.find((c) => c.id === "production");
    const eff = result.categories.find((c) => c.id === "efficiency");
    assert.equal(prod?.edge, "a");
    assert.equal(eff?.edge, "b");
    assert.ok(result.howDifferent.aStronger.length >= 1);
    assert.ok(result.howDifferent.bStronger.length >= 1);
    assert.equal(result.scope, "regular_season");
  }

  // Negligible / tie
  {
    const a = row({ ...base, season: "2015-16", points: 70 * 25.0 });
    const b = row({ ...base, season: "2016-17", points: 70 * 25.2 });
    const result = comparePlayerSeasons({
      ...base,
      seasonA: a,
      seasonB: b,
      nowSeason: "2025-26",
    });
    const ppg = result.metrics.find((m) => m.id === "ppg");
    assert.equal(ppg?.edge, "even");
  }

  // Missing metric one side
  {
    const a = row({
      ...base,
      season: "2008-09",
      trueShootingPct: 0,
      effectiveFieldGoalPct: 0,
    });
    const b = row({ ...base, season: "2012-13", trueShootingPct: 0.6 });
    const result = comparePlayerSeasons({
      ...base,
      seasonA: a,
      seasonB: b,
      nowSeason: "2025-26",
    });
    const ts = result.metrics.find((m) => m.id === "ts");
    assert.equal(ts?.edge, "unavailable");
  }

  // Impact only one season → unavailable head-to-head
  {
    const a = row({ ...base, season: "2008-09" });
    const b = row({ ...base, season: "2012-13" });
    const result = comparePlayerSeasons({
      ...base,
      seasonA: a,
      seasonB: b,
      impactA: null,
      impactB: {
        metricId: "darko_dpm",
        label: "DARKO DPM",
        value: 3.2,
        source: "darko",
      },
      nowSeason: "2025-26",
    });
    const impact = result.metrics.find((m) => m.id === "impact");
    assert.ok(impact);
    assert.equal(impact!.edge, "unavailable");
    assert.equal(result.coverage.a.historicalImpact, false);
    assert.equal(result.coverage.b.historicalImpact, true);
  }

  // Both seasons with matching impact
  {
    const a = row({ ...base, season: "2021-22" });
    const b = row({ ...base, season: "2023-24" });
    const result = comparePlayerSeasons({
      ...base,
      seasonA: a,
      seasonB: b,
      impactA: {
        metricId: "darko_dpm",
        label: "DARKO DPM",
        value: 2.0,
        source: "darko",
      },
      impactB: {
        metricId: "darko_dpm",
        label: "DARKO DPM",
        value: 4.0,
        source: "darko",
      },
      nowSeason: "2025-26",
    });
    const impact = result.metrics.find((m) => m.id === "impact");
    assert.equal(impact?.edge, "b");
    const cat = result.categories.find((c) => c.id === "impact");
    assert.equal(cat?.edge, "b");
  }

  // Mismatched impact metrics → unavailable
  {
    const a = row({ ...base, season: "2021-22" });
    const b = row({ ...base, season: "2023-24" });
    const result = comparePlayerSeasons({
      ...base,
      seasonA: a,
      seasonB: b,
      impactA: {
        metricId: "darko_dpm",
        label: "DARKO DPM",
        value: 2.0,
        source: "darko",
      },
      impactB: {
        metricId: "lebron",
        label: "LEBRON",
        value: 4.0,
        source: "lebron",
      },
      nowSeason: "2025-26",
    });
    assert.equal(result.metrics.find((m) => m.id === "impact")?.edge, "unavailable");
  }

  // Insufficient season
  {
    const a = row({ ...base, season: "2020-21", gamesPlayed: 5, minutes: 100 });
    const b = row({ ...base, season: "2021-22" });
    const result = comparePlayerSeasons({
      ...base,
      seasonA: a,
      seasonB: b,
      nowSeason: "2025-26",
    });
    assert.equal(result.coverage.a.qualifying, false);
    assert.equal(result.overall.edge, "unavailable");
    assert.ok(result.insufficientReason);
  }

  // Incomplete current season
  {
    const a = row({
      ...base,
      season: "2025-26",
      gamesPlayed: 12,
      minutes: 12 * 34,
    });
    const b = row({ ...base, season: "2024-25" });
    const result = comparePlayerSeasons({
      ...base,
      seasonA: a,
      seasonB: b,
      nowSeason: "2025-26",
    });
    assert.equal(result.coverage.a.incomplete, true);
    assert.ok(result.insufficientReason?.toLowerCase().includes("progress"));
  }

  // Season path helper
  {
    assert.equal(
      seasonComparePath("1966", "2008-09", "2012-13"),
      "/players/1966/season-compare?a=2008-09&b=2012-13"
    );
  }

  // Set ranking provisional CPI appendix (not the ranking model)
  {
    const seasons = [
      row({ ...base, season: "2010-11", points: 70 * 20 }),
      row({ ...base, season: "2012-13", points: 70 * 28 }),
      row({ ...base, season: "2015-16", points: 70 * 24 }),
    ];
    const set = comparePlayerSeasonSet({ ...base, seasons });
    assert.equal(set.error, null);
    assert.equal(set.ranking[0]?.season, "2012-13");
    assert.equal(set.provisionalProductionRank[0]?.season, "2012-13");
    assert.ok(set.matrix.length === 3);
  }

  // Overall plurality
  {
    const a = row({
      ...base,
      season: "2008-09",
      points: 70 * 30,
      trueShootingPct: 0.52,
      effectiveFieldGoalPct: 0.48,
      offensiveRating: 110,
      defensiveRating: 110,
    });
    const b = row({
      ...base,
      season: "2012-13",
      points: 70 * 24,
      trueShootingPct: 0.62,
      effectiveFieldGoalPct: 0.58,
      offensiveRating: 118,
      defensiveRating: 100,
      assists: 70 * 8,
    });
    const result = comparePlayerSeasons({
      ...base,
      seasonA: a,
      seasonB: b,
      teamA: { avgDiff: 2, abbreviation: "CLE" },
      teamB: { avgDiff: 8, abbreviation: "MIA" },
      nowSeason: "2025-26",
    });
    assert.ok(["a", "b", "even"].includes(result.overall.edge));
    assert.ok(result.methodology.version);
    assert.ok(result.categories.some((c) => c.id === "team_context"));
  }

  console.log("player-season-compare checks passed");
}

main();
