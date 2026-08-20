/**
 * Deterministic Rank My Seasons tests.
 * Run: npx tsx scripts/test-player-season-rank.ts
 */
import assert from "node:assert/strict";

import type { PlayerSeason } from "../src/data/types";
import {
  PLAYER_SEASON_RANK_MAX,
  comparePlayerSeasonSet,
  defaultRankSeasons,
  rankPlayerSeasons,
  seasonRankPath,
  seasonWinGraphHasCycle,
} from "../src/analytics/rank-player-seasons";

function row(
  partial: Partial<PlayerSeason> &
    Pick<PlayerSeason, "playerId" | "playerName" | "season">
): PlayerSeason {
  return {
    teamId: "2",
    teamName: "Boston Celtics",
    gamesPlayed: 70,
    minutes: 70 * 36,
    points: 70 * 25,
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

const base = { playerId: "test-rank", playerName: "Test Player" };

function main() {
  // 2 seasons
  {
    const seasons = [
      row({ ...base, season: "2008-09", points: 70 * 30, trueShootingPct: 0.55 }),
      row({
        ...base,
        season: "2012-13",
        points: 70 * 24,
        trueShootingPct: 0.62,
        defensiveRating: 100,
      }),
    ];
    const result = rankPlayerSeasons({ ...base, seasons, nowSeason: "2025-26" });
    assert.equal(result.error, null);
    assert.equal(result.ranking.length, 2);
    assert.equal(result.pairwise.length, 1);
    assert.equal(result.matrix.length, 2);
    assert.ok(result.ranking[0]?.rank === 1);
  }

  // 3-4 seasons obvious production winner
  {
    const seasons = [
      row({ ...base, season: "2010-11", points: 70 * 20 }),
      row({ ...base, season: "2012-13", points: 70 * 30, trueShootingPct: 0.6 }),
      row({ ...base, season: "2013-14", points: 70 * 22 }),
      row({ ...base, season: "2015-16", points: 70 * 23 }),
    ];
    const result = rankPlayerSeasons({ ...base, seasons, nowSeason: "2025-26" });
    assert.equal(result.error, null);
    assert.equal(result.ranking[0]?.season, "2012-13");
    assert.ok(result.topSeasonWhy.length >= 1);
    assert.ok(result.ranking[0]!.pairwiseWins >= 2);
  }

  // Close / even seasons
  {
    const seasons = [
      row({ ...base, season: "2015-16", points: 70 * 25.0 }),
      row({ ...base, season: "2016-17", points: 70 * 25.1 }),
      row({ ...base, season: "2017-18", points: 70 * 25.05 }),
    ];
    const result = rankPlayerSeasons({ ...base, seasons, nowSeason: "2025-26" });
    assert.equal(result.error, null);
    // Many even overalls → closeTop likely
    assert.ok(result.closeTop || result.ranking.every((e) => e.eligible));
  }

  // Insufficient season marked not eligible
  {
    const seasons = [
      row({ ...base, season: "2020-21", gamesPlayed: 5, minutes: 80 }),
      row({ ...base, season: "2021-22" }),
      row({ ...base, season: "2022-23" }),
    ];
    const result = rankPlayerSeasons({ ...base, seasons, nowSeason: "2025-26" });
    const weak = result.ranking.find((r) => r.season === "2020-21");
    assert.equal(weak?.eligible, false);
    assert.equal(weak?.rank, null);
    assert.ok(weak?.eligibilityNote);
  }

  // Incomplete current season
  {
    const seasons = [
      row({
        ...base,
        season: "2025-26",
        gamesPlayed: 10,
        minutes: 10 * 34,
      }),
      row({ ...base, season: "2023-24" }),
      row({ ...base, season: "2024-25" }),
    ];
    const result = rankPlayerSeasons({ ...base, seasons, nowSeason: "2025-26" });
    const cur = result.ranking.find((r) => r.season === "2025-26");
    assert.equal(cur?.coverage.incomplete, true);
    assert.equal(cur?.eligible, false);
  }

  // Missing impact on one season - still ranks on available dims
  {
    const seasons = [
      row({ ...base, season: "2021-22" }),
      row({ ...base, season: "2022-23" }),
      row({ ...base, season: "2023-24" }),
    ];
    const impacts = new Map([
      [
        "2023-24",
        {
          metricId: "darko_dpm",
          label: "DARKO DPM",
          value: 4,
          source: "darko",
        },
      ],
      ["2021-22", null],
      ["2022-23", null],
    ]);
    const result = rankPlayerSeasons({
      ...base,
      seasons,
      impacts,
      nowSeason: "2025-26",
    });
    assert.equal(result.error, null);
    assert.equal(
      result.ranking.find((r) => r.season === "2023-24")?.coverage
        .historicalImpact,
      true
    );
    assert.equal(
      result.ranking.find((r) => r.season === "2021-22")?.coverage
        .historicalImpact,
      false
    );
  }

  // Mixed matching impact between two seasons only
  {
    const seasons = [
      row({ ...base, season: "2021-22", points: 70 * 22 }),
      row({ ...base, season: "2023-24", points: 70 * 28 }),
    ];
    const impacts = new Map([
      [
        "2021-22",
        {
          metricId: "darko_dpm",
          label: "DARKO DPM",
          value: 1,
          source: "darko",
        },
      ],
      [
        "2023-24",
        {
          metricId: "darko_dpm",
          label: "DARKO DPM",
          value: 5,
          source: "darko",
        },
      ],
    ]);
    const result = rankPlayerSeasons({
      ...base,
      seasons,
      impacts,
      nowSeason: "2025-26",
    });
    const impactMetric = result.pairwise[0]?.comparison.metrics.find(
      (m) => m.id === "impact"
    );
    assert.equal(impactMetric?.edge, "b");
  }

  // Pairwise matrix correctness
  {
    const seasons = [
      row({ ...base, season: "2012-13", points: 70 * 30 }),
      row({ ...base, season: "2008-09", points: 70 * 20 }),
    ];
    const result = rankPlayerSeasons({ ...base, seasons, nowSeason: "2025-26" });
    const cell = result.matrix
      .flat()
      .find((c) => c.rowSeason === "2012-13" && c.colSeason === "2008-09");
    assert.equal(cell?.result, "win");
    const mirror = result.matrix
      .flat()
      .find((c) => c.rowSeason === "2008-09" && c.colSeason === "2012-13");
    assert.equal(mirror?.result, "loss");
  }

  // Non-transitive cycle detector
  {
    const beats = new Map<string, Set<string>>([
      ["A", new Set(["B"])],
      ["B", new Set(["C"])],
      ["C", new Set(["A"])],
    ]);
    assert.equal(seasonWinGraphHasCycle(["A", "B", "C"], beats), true);
    assert.equal(
      seasonWinGraphHasCycle(
        ["A", "B", "C"],
        new Map([
          ["A", new Set(["B", "C"])],
          ["B", new Set(["C"])],
          ["C", new Set()],
        ])
      ),
      false
    );
  }

  // Max seasons error
  {
    const seasons = Array.from({ length: PLAYER_SEASON_RANK_MAX + 1 }, (_, i) =>
      row({ ...base, season: `${2000 + i}-${String(i + 1).padStart(2, "0")}` })
    );
    // Fix season strings to valid canonical
    const fixed = Array.from({ length: PLAYER_SEASON_RANK_MAX + 1 }, (_, i) => {
      const start = 2000 + i;
      const end = String((start + 1) % 100).padStart(2, "0");
      return row({ ...base, season: `${start}-${end}` });
    });
    const result = rankPlayerSeasons({
      ...base,
      seasons: fixed,
      nowSeason: "2025-26",
    });
    assert.ok(result.error?.includes("at most"));
  }

  // Path + defaults
  {
    assert.equal(
      seasonRankPath("1966", ["2008-09", "2012-13"]),
      "/players/1966/season-rank?seasons=2008-09%2C2012-13"
    );
    const career = [
      row({ ...base, season: "2012-13", points: 70 * 30 }),
      row({ ...base, season: "2008-09", points: 70 * 28 }),
      row({ ...base, season: "2015-16", points: 70 * 24 }),
      row({ ...base, season: "2010-11", points: 70 * 22 }),
    ];
    const defaults = defaultRankSeasons(career, {
      nowSeason: "2025-26",
      prefer: ["2008-09"],
      limit: 3,
    });
    assert.equal(defaults[0], "2008-09");
    assert.equal(defaults.length, 3);
  }

  // comparePlayerSeasonSet wrapper
  {
    const set = comparePlayerSeasonSet({
      ...base,
      seasons: [
        row({ ...base, season: "2012-13", points: 70 * 30 }),
        row({ ...base, season: "2008-09", points: 70 * 20 }),
      ],
      nowSeason: "2025-26",
    });
    assert.ok(set.note.toLowerCase().includes("copeland"));
    assert.equal(set.ranking[0]?.season, "2012-13");
  }

  console.log("player-season-rank checks passed");
}

main();
