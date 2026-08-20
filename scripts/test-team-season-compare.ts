/**
 * Team season / team-vs-team compare methodology tests.
 * Run: npx tsx scripts/test-team-season-compare.ts
 */
import assert from "node:assert/strict";

import {
  TEAM_COMPARE_MIN_GAMES,
  TEAM_SEASON_COMPARE_TOLERANCE,
  TEAM_SEASON_COMPARE_VERSION,
  compareTeamSeasons,
  teamComparePath,
} from "../src/analytics/compare-team-seasons";
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

const bos24 = team({
  teamId: "2",
  abbreviation: "BOS",
  fullName: "Boston Celtics",
  season: "2024-25",
  avgDiff: 9,
  ppg: 118,
  oppPpg: 109,
  trueShootingPct: 0.6,
  effectiveFieldGoalPct: 0.57,
  threePointPct: 0.38,
  offensiveReboundPct: 0.28,
  topg: 12,
  assistToTurnover: 2.1,
});

const bos25 = team({
  teamId: "2",
  abbreviation: "BOS",
  fullName: "Boston Celtics",
  season: "2025-26",
  avgDiff: 5,
  ppg: 114,
  oppPpg: 109,
  trueShootingPct: 0.57,
  effectiveFieldGoalPct: 0.54,
  threePointPct: 0.36,
  offensiveReboundPct: 0.26,
  topg: 13.5,
  assistToTurnover: 1.9,
  gamesPlayed: 40,
});

const okc25 = team({
  teamId: "25",
  abbreviation: "OKC",
  fullName: "Oklahoma City Thunder",
  season: "2025-26",
  conference: "West",
  avgDiff: 12,
  ppg: 120,
  oppPpg: 108,
  trueShootingPct: 0.61,
  effectiveFieldGoalPct: 0.58,
  threePointPct: 0.39,
  gamesPlayed: 50,
});

// --- same team, two seasons ---
{
  const r = compareTeamSeasons({
    teamA: bos24,
    teamB: bos25,
    nowSeason: "2025-26",
  });
  assert.equal(r.mode, "same_team");
  assert.equal(r.methodology.version, TEAM_SEASON_COMPARE_VERSION);
  assert.ok(r.metrics.some((m) => m.id === "diff"));
  assert.ok(r.categories.some((c) => c.id === "performance"));
  assert.equal(r.coverage.b.incomplete, true);
  assert.ok(r.overall.edge === "a" || r.overall.edge === "b" || r.overall.edge === "even");
  // 2024-25 stronger on diff (+9 vs +5) beyond 0.8
  const diff = r.metrics.find((m) => m.id === "diff")!;
  assert.equal(diff.edge, "a");
}

// --- two teams, same season ---
{
  const r = compareTeamSeasons({ teamA: bos25, teamB: okc25, nowSeason: "2025-26" });
  assert.equal(r.mode, "cross_team");
  const diff = r.metrics.find((m) => m.id === "diff")!;
  assert.equal(diff.edge, "b"); // OKC +12 vs BOS +5
}

// --- two teams, different seasons ---
{
  const r = compareTeamSeasons({ teamA: bos24, teamB: okc25 });
  assert.equal(r.mode, "cross_team");
  assert.equal(r.sideA.season, "2024-25");
  assert.equal(r.sideB.season, "2025-26");
}

// --- missing metrics ≠ zero ---
{
  const thinA = team({
    ...bos24,
    trueShootingPct: 0,
    effectiveFieldGoalPct: 0,
  });
  const r = compareTeamSeasons({ teamA: thinA, teamB: bos25 });
  const ts = r.metrics.find((m) => m.id === "ts")!;
  assert.equal(ts.edge, "unavailable");
  assert.equal(ts.aDisplay, "-");
  assert.ok(ts.note?.toLowerCase().includes("missing"));
}

// --- thin / incomplete ---
{
  const thin = team({ ...bos25, gamesPlayed: 10 });
  const r = compareTeamSeasons({
    teamA: bos24,
    teamB: thin,
    nowSeason: "2025-26",
  });
  assert.equal(r.coverage.b.thin, true);
  assert.equal(r.coverage.b.qualifying, false);
  assert.equal(r.overall.edge, "unavailable");
  assert.ok(r.insufficientReason);
  assert.ok(TEAM_COMPARE_MIN_GAMES === 20);
}

// --- ties / tolerance ---
{
  const near = team({
    ...bos25,
    avgDiff: bos24.avgDiff + 0.3, // inside 0.8
    trueShootingPct: bos24.trueShootingPct,
    effectiveFieldGoalPct: bos24.effectiveFieldGoalPct,
    ppg: bos24.ppg,
    oppPpg: bos24.oppPpg,
    threePointPct: bos24.threePointPct,
    threePointersAttempted: bos24.threePointersAttempted,
    fieldGoalsAttempted: bos24.fieldGoalsAttempted,
    offensiveReboundPct: bos24.offensiveReboundPct,
    topg: bos24.topg,
    assistToTurnover: bos24.assistToTurnover,
    gamesPlayed: 82,
  });
  const r = compareTeamSeasons({ teamA: bos24, teamB: near, nowSeason: "2099-00" });
  const diff = r.metrics.find((m) => m.id === "diff")!;
  assert.equal(diff.edge, "even");
  assert.ok(Math.abs(TEAM_SEASON_COMPARE_TOLERANCE.diff - 0.8) < 1e-9);
}

// --- path serialization ---
{
  assert.equal(
    teamComparePath({
      teamA: "2",
      teamB: "25",
      seasonA: "2025-26",
      seasonB: "2025-26",
    }),
    "/compare?mode=teams&teamA=2&teamB=25&seasonA=2025-26&seasonB=2025-26"
  );
  assert.equal(
    teamComparePath({
      teamA: "2",
      teamB: "2",
      seasonA: "2024-25",
      seasonB: "2025-26",
    }),
    "/compare?mode=teams&teamA=2&teamB=2&seasonA=2024-25&seasonB=2025-26"
  );
}

// --- ASK interpret ---
{
  const same = interpretAskQuery(
    "Compare Boston's 2024-25 and 2025-26 seasons"
  );
  assert.equal(same.operation, "team_season_compare");
  assert.equal(same.entities.filter((e) => e.kind === "team").length, 2);
  assert.deepEqual(same.when?.seasons, ["2024-25", "2025-26"]);
  assert.equal(validateBasketballQuery(same).ok, true);

  const cross = interpretAskQuery(
    "Compare Boston and Oklahoma City in 2025-26"
  );
  assert.equal(cross.operation, "team_season_compare");
  const crossTeams = cross.entities.filter((e) => e.kind === "team");
  assert.equal(crossTeams.length, 2);
  assert.notEqual(crossTeams[0]?.id, crossTeams[1]?.id);
  assert.equal(validateBasketballQuery(cross).ok, true);

  // Player compare still works
  const player = interpretAskQuery(
    "Compare LeBron's 2008-09 and 2012-13 seasons"
  );
  assert.equal(player.operation, "season_compare");
}

console.log("test-team-season-compare: all assertions passed");
