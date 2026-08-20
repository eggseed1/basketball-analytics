/**
 * Team page URL tabs + ranked metrics (P0 shell).
 * Run: npx tsx scripts/test-team-page-tabs.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  parseTeamPageTab,
  parseTeamRateMode,
  parseTeamSeasonKind,
  teamContextBarVisibility,
  teamPageHref,
} from "../src/lib/team-destination";
import { buildTeamRankedMetrics, ftRate } from "../src/lib/team-page-metrics";
import type { TeamSeasonStats } from "../src/data/types";
import { analyzeTeamProfile } from "../src/analytics";

function row(partial: Partial<TeamSeasonStats> & { teamId: string }): TeamSeasonStats {
  return {
    season: "2025-26",
    abbreviation: partial.abbreviation ?? "ATL",
    fullName: partial.fullName ?? "Atlanta Hawks",
    conference: "East",
    gamesPlayed: 82,
    ppg: 115,
    oppPpg: 112,
    avgDiff: 3,
    rpg: 44,
    apg: 25,
    spg: 8,
    bpg: 5,
    topg: 13,
    fieldGoalPct: 0.47,
    threePointPct: 0.36,
    freeThrowPct: 0.8,
    effectiveFieldGoalPct: 0.54,
    trueShootingPct: 0.58,
    assistToTurnover: 1.9,
    offensiveReboundPct: 0.26,
    points: 9400,
    fieldGoalsMade: 3500,
    fieldGoalsAttempted: 7400,
    threePointersMade: 1000,
    threePointersAttempted: 2800,
    freeThrowsMade: 1400,
    freeThrowsAttempted: 1800,
    assists: 2000,
    turnovers: 1050,
    ...partial,
  };
}

function main() {
  assert.equal(parseTeamPageTab(undefined), "overview");
  assert.equal(parseTeamPageTab("games"), "games");
  assert.equal(parseTeamPageTab("stats"), "stats");
  assert.equal(parseTeamSeasonKind("playoffs"), "playoffs");
  assert.equal(parseTeamRateMode("per100"), "per100");

  assert.deepEqual(teamContextBarVisibility("overview"), {
    seasonType: true,
    rate: true,
  });
  assert.deepEqual(teamContextBarVisibility("games"), {
    seasonType: true,
    rate: false,
  });
  assert.deepEqual(teamContextBarVisibility("history"), {
    seasonType: false,
    rate: false,
  });
  assert.deepEqual(teamContextBarVisibility("organization"), {
    seasonType: false,
    rate: false,
  });
  assert.deepEqual(teamContextBarVisibility("playoffs"), {
    seasonType: false,
    rate: true,
  });

  const href = teamPageHref("atl", {
    season: "2025-26",
    tab: "players",
    seasonType: "playoffs",
    rate: "per100",
  });
  assert.ok(href.includes("tab=players"));
  assert.ok(href.includes("seasonType=playoffs"));
  assert.ok(href.includes("rate=per100"));
  assert.equal(
    teamPageHref("atl", { season: "2025-26" }).includes("tab="),
    false,
    "default overview omits tab"
  );

  const league = [
    row({ teamId: "1", abbreviation: "ATL", avgDiff: 5, oppPpg: 110 }),
    row({ teamId: "2", abbreviation: "BOS", avgDiff: 8, oppPpg: 108 }),
    row({ teamId: "3", abbreviation: "BKN", avgDiff: -2, oppPpg: 118 }),
  ];
  const team = league[0];
  const analysis = analyzeTeamProfile({ team, league, prior: null });
  const metrics = buildTeamRankedMetrics({
    team,
    league,
    prior: null,
    standing: null,
    traits: analysis.traits,
  });
  const pace = metrics.find((m) => m.key === "pace");
  assert.ok(pace?.missingReason, "Pace must stay missing, not zero");
  assert.equal(pace?.formattedValue, "-");
  const diff = metrics.find((m) => m.key === "diff");
  assert.ok(diff && diff.rank != null && diff.rankDenominator === 3);
  assert.ok(ftRate(team)! > 0);

  const page = readFileSync(
    join(process.cwd(), "src/app/teams/[teamId]/page.tsx"),
    "utf8"
  );
  assert.ok(page.includes("TeamPrimaryNav"));
  assert.ok(page.includes("TeamOverviewBoard"));
  assert.ok(page.includes('tab === "stats"'));
  assert.ok(page.includes("TeamTabScaffold"));

  console.log("test-team-page-tabs: ok");
}

main();
