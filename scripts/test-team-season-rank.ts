/**
 * Deterministic Rank Team Seasons tests.
 * Run: npx tsx scripts/test-team-season-rank.ts
 */
import assert from "node:assert/strict";

import {
  TEAM_SEASON_RANK_CLOSE_TOP,
  TEAM_SEASON_RANK_MAX,
  TEAM_SEASON_RANK_MIN,
  buildTeamCategoryLedger,
  defaultTeamRankSeasons,
  rankTeamSeasons,
  teamSeasonRankPath,
} from "../src/analytics/rank-team-seasons";
import { seasonWinGraphHasCycle } from "../src/analytics/rank-player-seasons";
import type { TeamSeasonStats } from "../src/data/types";
import { interpretAskQuery } from "../src/query-engine/interpret";
import { validateBasketballQuery } from "../src/query-engine/validate";

function team(
  partial: Partial<TeamSeasonStats> &
    Pick<
      TeamSeasonStats,
      "teamId" | "abbreviation" | "fullName" | "season"
    >
): TeamSeasonStats {
  return {
    conference: "East",
    gamesPlayed: 82,
    ppg: 112,
    oppPpg: 108,
    avgDiff: 4,
    rpg: 44,
    apg: 26,
    spg: 8,
    bpg: 5,
    topg: 13,
    fieldGoalPct: 0.47,
    threePointPct: 0.37,
    freeThrowPct: 0.8,
    effectiveFieldGoalPct: 0.55,
    trueShootingPct: 0.58,
    assistToTurnover: 2,
    offensiveReboundPct: 0.27,
    points: 9000,
    fieldGoalsMade: 3200,
    fieldGoalsAttempted: 6800,
    threePointersMade: 1200,
    threePointersAttempted: 3300,
    freeThrowsMade: 1400,
    freeThrowsAttempted: 1800,
    assists: 2100,
    turnovers: 1050,
    ...partial,
  };
}

const base = {
  teamId: "2",
  abbreviation: "BOS",
  fullName: "Boston Celtics",
};

function main() {
  // Two seasons
  {
    const seasons = [
      team({ ...base, season: "2023-24", avgDiff: 11, trueShootingPct: 0.61 }),
      team({ ...base, season: "2024-25", avgDiff: 5, trueShootingPct: 0.56 }),
    ];
    const result = rankTeamSeasons({
      ...base,
      seasons,
      nowSeason: "2099-00",
    });
    assert.equal(result.error, null);
    assert.equal(result.ranking.length, 2);
    assert.equal(result.pairwise.length, 1);
    assert.equal(result.matrix.length, 2);
    assert.equal(result.ranking[0]?.season, "2023-24");
    assert.equal(result.ranking[0]?.rank, 1);
  }

  // Three seasons — clear winner
  {
    const seasons = [
      team({ ...base, season: "2021-22", avgDiff: 2 }),
      team({
        ...base,
        season: "2022-23",
        avgDiff: 10,
        trueShootingPct: 0.61,
        effectiveFieldGoalPct: 0.58,
        threePointPct: 0.4,
        ppg: 118,
        oppPpg: 108,
      }),
      team({ ...base, season: "2023-24", avgDiff: 4 }),
    ];
    const result = rankTeamSeasons({
      ...base,
      seasons,
      nowSeason: "2099-00",
    });
    assert.equal(result.error, null);
    assert.equal(result.ranking[0]?.season, "2022-23");
    assert.ok((result.ranking[0]?.pairwiseWins ?? 0) >= 2);
    assert.ok(result.topSeasonWhy.length >= 1);
    assert.ok(result.topCategorySummary);
  }

  // Four+ seasons
  {
    const seasons = [
      team({ ...base, season: "2020-21", avgDiff: 1 }),
      team({ ...base, season: "2021-22", avgDiff: 3 }),
      team({ ...base, season: "2022-23", avgDiff: 8, trueShootingPct: 0.6 }),
      team({ ...base, season: "2023-24", avgDiff: 4 }),
    ];
    const result = rankTeamSeasons({
      ...base,
      seasons,
      nowSeason: "2099-00",
    });
    assert.equal(result.error, null);
    assert.equal(result.ranking.length, 4);
    assert.equal(result.pairwise.length, 6);
    assert.equal(result.ranking[0]?.season, "2022-23");
  }

  // Tie / close top
  {
    const seasons = [
      team({
        ...base,
        season: "2022-23",
        avgDiff: 6,
        trueShootingPct: 0.58,
        effectiveFieldGoalPct: 0.55,
        threePointPct: 0.37,
        offensiveReboundPct: 0.27,
        topg: 13,
        assistToTurnover: 2,
      }),
      team({
        ...base,
        season: "2023-24",
        avgDiff: 6.2,
        trueShootingPct: 0.581,
        effectiveFieldGoalPct: 0.551,
        threePointPct: 0.371,
        offensiveReboundPct: 0.271,
        topg: 13.1,
        assistToTurnover: 2.05,
      }),
      team({
        ...base,
        season: "2024-25",
        avgDiff: 6.1,
        trueShootingPct: 0.579,
        effectiveFieldGoalPct: 0.549,
        threePointPct: 0.369,
        offensiveReboundPct: 0.269,
        topg: 12.9,
        assistToTurnover: 1.98,
      }),
    ];
    const result = rankTeamSeasons({
      ...base,
      seasons,
      nowSeason: "2099-00",
    });
    assert.equal(result.error, null);
    assert.ok(
      result.closeTop ||
        Math.abs(
          (result.ranking[0]?.copelandPoints ?? 0) -
            (result.ranking[1]?.copelandPoints ?? 0)
        ) <= TEAM_SEASON_RANK_CLOSE_TOP + 0.01
    );
  }

  // Contested cycle detector reuse
  {
    const beats = new Map<string, Set<string>>([
      ["A", new Set(["B"])],
      ["B", new Set(["C"])],
      ["C", new Set(["A"])],
    ]);
    assert.equal(seasonWinGraphHasCycle(["A", "B", "C"], beats), true);
  }

  // Constructed cycle via rotated category strengths
  {
    // A beats B on performance; B beats C on efficiency; C beats A on shooting
    // — plus secondary edges so overall flips in a cycle when possible.
    const A = team({
      ...base,
      season: "2019-20",
      avgDiff: 12,
      ppg: 120,
      oppPpg: 108,
      trueShootingPct: 0.54,
      effectiveFieldGoalPct: 0.51,
      threePointPct: 0.33,
      threePointersAttempted: 2000,
      fieldGoalsAttempted: 7000,
      offensiveReboundPct: 0.25,
      topg: 14,
      assistToTurnover: 1.7,
    });
    const B = team({
      ...base,
      season: "2020-21",
      avgDiff: 4,
      ppg: 110,
      oppPpg: 106,
      trueShootingPct: 0.62,
      effectiveFieldGoalPct: 0.59,
      threePointPct: 0.35,
      threePointersAttempted: 2500,
      fieldGoalsAttempted: 7000,
      offensiveReboundPct: 0.26,
      topg: 13,
      assistToTurnover: 1.9,
    });
    const C = team({
      ...base,
      season: "2021-22",
      avgDiff: 5,
      ppg: 112,
      oppPpg: 107,
      trueShootingPct: 0.55,
      effectiveFieldGoalPct: 0.52,
      threePointPct: 0.42,
      threePointersAttempted: 3800,
      fieldGoalsAttempted: 7000,
      offensiveReboundPct: 0.3,
      topg: 11,
      assistToTurnover: 2.3,
    });
    const result = rankTeamSeasons({
      ...base,
      seasons: [A, B, C],
      nowSeason: "2099-00",
    });
    assert.equal(result.error, null);
    assert.equal(result.ranking.filter((r) => r.eligible).length, 3);
    // Contested may or may not fire depending on overall edges; order is still deterministic
    assert.ok(result.ranking[0]?.rank === 1);
    assert.ok(result.contestedNote === null || result.contested);
  }

  // Missing metric — unavailable does NOT become a loss
  {
    const strong = team({
      ...base,
      season: "2023-24",
      avgDiff: 9,
      trueShootingPct: 0.6,
      effectiveFieldGoalPct: 0.57,
      threePointPct: 0.39,
      offensiveReboundPct: 0, // missing rebounding
    });
    const weak = team({
      ...base,
      season: "2022-23",
      avgDiff: 1,
      trueShootingPct: 0.54,
      effectiveFieldGoalPct: 0.51,
      threePointPct: 0.34,
      offensiveReboundPct: 0.28,
    });
    const result = rankTeamSeasons({
      ...base,
      seasons: [strong, weak],
      nowSeason: "2099-00",
    });
    assert.equal(result.error, null);
    const match = result.pairwise[0]!;
    const orb = match.comparison.metrics.find((m) => m.id === "orb");
    assert.equal(orb?.edge, "unavailable");
    // Seasons sort ascending: A=2022-23 (weak), B=2023-24 (strong)
    assert.equal(match.seasonA, "2022-23");
    assert.equal(match.seasonB, "2023-24");
    assert.equal(match.overallEdge, "b");
    const top = result.ranking[0]!;
    assert.equal(top.season, "2023-24");
    assert.equal(top.pairwiseLosses, 0);
    // Unavailable overall would increment pairwiseUnavailable — a decisive win must not.
    assert.equal(top.pairwiseUnavailable, 0);
    assert.equal(top.pairwiseWins, 1);
  }

  // Overall unavailable (thin sample) does not count as a pairwise loss
  {
    const thin = team({
      ...base,
      season: "2020-21",
      gamesPlayed: 10,
      avgDiff: 20,
    });
    const full = team({
      ...base,
      season: "2021-22",
      gamesPlayed: 82,
      avgDiff: 2,
    });
    const result = rankTeamSeasons({
      ...base,
      seasons: [thin, full],
      nowSeason: "2099-00",
    });
    const match = result.pairwise[0]!;
    assert.equal(match.overallEdge, "unavailable");
    const fullEntry = result.ranking.find((r) => r.season === "2021-22")!;
    assert.equal(fullEntry.pairwiseLosses, 0);
    assert.equal(fullEntry.pairwiseWins, 0);
    assert.equal(fullEntry.pairwiseUnavailable, 1);
    assert.equal(fullEntry.copelandPoints, 0);
  }

  // One-sided / thin season ineligible
  {
    const seasons = [
      team({ ...base, season: "2020-21", gamesPlayed: 8, avgDiff: 15 }),
      team({ ...base, season: "2021-22", avgDiff: 3 }),
      team({ ...base, season: "2022-23", avgDiff: 5 }),
    ];
    const result = rankTeamSeasons({
      ...base,
      seasons,
      nowSeason: "2099-00",
    });
    const thin = result.ranking.find((r) => r.season === "2020-21");
    assert.equal(thin?.eligible, false);
    assert.equal(thin?.rank, null);
    assert.ok(thin?.eligibilityNote);
  }

  // Incomplete current season
  {
    const seasons = [
      team({
        ...base,
        season: "2025-26",
        gamesPlayed: 25,
        avgDiff: 12,
      }),
      team({ ...base, season: "2023-24", avgDiff: 6 }),
      team({ ...base, season: "2024-25", avgDiff: 7 }),
    ];
    const result = rankTeamSeasons({
      ...base,
      seasons,
      nowSeason: "2025-26",
    });
    const cur = result.ranking.find((r) => r.season === "2025-26");
    assert.equal(cur?.coverage.incomplete, true);
    assert.equal(cur?.eligible, false);
    assert.ok(/in progress/i.test(cur?.eligibilityNote ?? ""));
  }

  // Season normalization / set limits
  {
    const tooFew = rankTeamSeasons({
      ...base,
      seasons: [team({ ...base, season: "2024-25" })],
      nowSeason: "2099-00",
    });
    assert.ok(tooFew.error);

    const many = Array.from({ length: TEAM_SEASON_RANK_MAX + 1 }, (_, i) => {
      const start = 2010 + i;
      const end = String((start + 1) % 100).padStart(2, "0");
      return team({
        ...base,
        season: `${start}-${end}`,
      });
    });
    const tooMany = rankTeamSeasons({
      ...base,
      seasons: many,
      nowSeason: "2099-00",
    });
    assert.ok(tooMany.error);
    assert.ok(TEAM_SEASON_RANK_MIN === 2);
  }

  // Pairwise matrix + Copeland aggregation
  {
    const seasons = [
      team({ ...base, season: "2021-22", avgDiff: 2 }),
      team({ ...base, season: "2022-23", avgDiff: 9, trueShootingPct: 0.6 }),
      team({ ...base, season: "2023-24", avgDiff: 4 }),
    ];
    const result = rankTeamSeasons({
      ...base,
      seasons,
      nowSeason: "2099-00",
    });
    const top = result.ranking[0]!;
    assert.equal(top.season, "2022-23");
    assert.equal(top.copelandPoints, top.pairwiseWins + 0.5 * top.pairwiseEvens);
    const cell = result.matrix
      .flat()
      .find((c) => c.rowSeason === "2022-23" && c.colSeason === "2021-22");
    assert.equal(cell?.result, "win");
    assert.ok(cell?.href?.includes("mode=teams"));
    assert.ok(cell?.href?.includes("seasonA="));
  }

  // Deterministic ordering
  {
    const seasons = [
      team({ ...base, season: "2023-24", avgDiff: 5 }),
      team({ ...base, season: "2021-22", avgDiff: 5 }),
      team({ ...base, season: "2022-23", avgDiff: 5 }),
    ];
    const a = rankTeamSeasons({ ...base, seasons, nowSeason: "2099-00" });
    const b = rankTeamSeasons({
      ...base,
      seasons: [...seasons].reverse(),
      nowSeason: "2099-00",
    });
    assert.deepEqual(
      a.ranking.map((r) => r.season),
      b.ranking.map((r) => r.season)
    );
  }

  // Category ledger
  {
    const seasons = [
      team({
        ...base,
        season: "2023-24",
        avgDiff: 10,
        trueShootingPct: 0.6,
        effectiveFieldGoalPct: 0.57,
      }),
      team({
        ...base,
        season: "2022-23",
        avgDiff: 2,
        trueShootingPct: 0.54,
        effectiveFieldGoalPct: 0.5,
      }),
    ];
    const result = rankTeamSeasons({
      ...base,
      seasons,
      nowSeason: "2099-00",
    });
    const ledger = buildTeamCategoryLedger("2023-24", result.pairwise);
    assert.ok(ledger.wins.length >= 1);
  }

  // Default season selection
  {
    const rows = [
      team({ ...base, season: "2025-26", gamesPlayed: 20, avgDiff: 3 }),
      team({ ...base, season: "2024-25", avgDiff: 6 }),
      team({ ...base, season: "2023-24", avgDiff: 5 }),
      team({ ...base, season: "2022-23", avgDiff: 4 }),
      team({ ...base, season: "2021-22", avgDiff: 2 }),
      team({ ...base, season: "2020-21", avgDiff: 1 }),
    ];
    const picked = defaultTeamRankSeasons(rows, {
      nowSeason: "2025-26",
      limit: 5,
    });
    assert.ok(picked.length >= TEAM_SEASON_RANK_MIN);
    assert.ok(picked.length <= 5);
    assert.ok(!picked.includes("2025-26")); // incomplete current skipped by default
  }

  // Path serialization
  {
    assert.equal(
      teamSeasonRankPath("2", ["2021-22", "2022-23", "2023-24"]),
      "/compare?mode=teams&view=rank&teamId=2&seasons=2021-22%2C2022-23%2C2023-24"
    );
  }

  // Data coverage disclosure
  {
    const seasons = [
      team({ ...base, season: "2023-24", offensiveReboundPct: 0 }),
      team({ ...base, season: "2022-23" }),
    ];
    const result = rankTeamSeasons({
      ...base,
      seasons,
      nowSeason: "2099-00",
    });
    const cov = result.ranking.find((r) => r.season === "2023-24")!.dataCoverage;
    assert.equal(cov.rebounding, false);
    assert.equal(cov.performance, true);
  }

  // ASK DRBL integration
  {
    const best = interpretAskQuery("Which was Boston's best season?");
    assert.equal(best.operation, "team_season_rank");
    assert.equal(best.entities[0]?.kind, "team");
    assert.ok(
      best.interpretation?.some((l) =>
        /Team Season Ranking methodology/i.test(l)
      )
    );
    assert.equal(validateBasketballQuery(best).ok, true);

    const range = interpretAskQuery(
      "Rank Boston's best seasons from 2018-19 to 2025-26."
    );
    assert.equal(range.operation, "team_season_rank");
    assert.ok((range.when?.seasons?.length ?? 0) >= 2);

    const okc = interpretAskQuery(
      "What was Oklahoma City's best season from 2020-21 through 2025-26?"
    );
    assert.equal(okc.operation, "team_season_rank");

    // Player best season still routes to player rank
    const raptor = interpretAskQuery("What was LeBron's best season?");
    assert.equal(raptor.operation, "season_rank");
  }

  console.log("test-team-season-rank: all assertions passed");
}

main();
