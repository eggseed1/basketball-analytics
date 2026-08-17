/**
 * Team Arc + ASK teamId deep-link checks.
 * Run: npx tsx scripts/test-team-arc.ts
 */
import assert from "node:assert/strict";

import { analyzeTeamProfile } from "../src/analytics";
import type { TeamSeasonStats } from "../src/data/types";
import {
  TEAM_ARC_DEFAULT_WINDOW,
  TEAM_ARC_EARLIEST_SEASON,
  listTeamArcCandidateSeasons,
  teamArcDefaultWindow,
} from "../src/data/queries/team-arc";
import {
  buildTeamArcModel,
  buildTeamArcTransitions,
  teamArcEvidenceHref,
  teamArcFullHref,
  teamArcGamesHref,
  teamArcSeasonHref,
  toTeamArcSeasonRow,
} from "../src/lib/team-arc";
import { askDrblTeamHref, buildTeamAskLinks } from "../src/lib/team-explorer";

function team(
  partial: Partial<TeamSeasonStats> &
    Pick<TeamSeasonStats, "teamId" | "abbreviation" | "fullName" | "season">
): TeamSeasonStats {
  return {
    conference: "East",
    gamesPlayed: 82,
    ppg: 110,
    oppPpg: 105,
    avgDiff: 5,
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
    points: 5500,
    fieldGoalsMade: 2000,
    fieldGoalsAttempted: 4200,
    threePointersMade: 700,
    threePointersAttempted: 1900,
    freeThrowsMade: 800,
    freeThrowsAttempted: 1000,
    assists: 1300,
    turnovers: 650,
    ...partial,
  };
}

// --- season normalization / window ---
{
  const window = teamArcDefaultWindow("2025-26", 6);
  assert.equal(window.length, TEAM_ARC_DEFAULT_WINDOW);
  assert.equal(window[0], "2025-26");
  assert.equal(window[5], "2020-21");
  assert.ok(window.every((s) => /^\d{4}-\d{2}$/.test(s)));
  assert.equal(TEAM_ARC_EARLIEST_SEASON, "2001-02");
  const candidates = listTeamArcCandidateSeasons({
    earliest: "2001-02",
    latest: "2003-04",
  });
  assert.deepEqual(candidates, ["2003-04", "2002-03", "2001-02"]);
}

// --- multi-season ordering + missing ---
{
  const rows = [
    team({
      teamId: "2",
      abbreviation: "BOS",
      fullName: "Boston Celtics",
      season: "2023-24",
      avgDiff: 8,
      trueShootingPct: 0.6,
    }),
    team({
      teamId: "2",
      abbreviation: "BOS",
      fullName: "Boston Celtics",
      season: "2025-26",
      avgDiff: 6,
      trueShootingPct: 0.58,
    }),
    team({
      teamId: "2",
      abbreviation: "BOS",
      fullName: "Boston Celtics",
      season: "2024-25",
      avgDiff: 11,
      trueShootingPct: 0.61,
      gamesPlayed: 12,
    }),
  ];
  const model = buildTeamArcModel({
    rows,
    viewingSeason: "2025-26",
    showingFull: true,
    fullCandidateCount: 10,
  });
  assert.deepEqual(
    model.rows.map((r) => r.season),
    ["2025-26", "2024-25", "2023-24"]
  );
  assert.equal(model.rows[1]?.thin, true);
  assert.equal(model.label, "Team Arc");
  assert.ok(model.coverageNote.includes("2001-02"));
  assert.ok(model.continuityNote.toLowerCase().includes("espn"));
  assert.equal(model.showingFull, true);
  assert.equal(model.hasMoreHistory, false);

  const compact = buildTeamArcModel({
    rows,
    viewingSeason: "2025-26",
    showingFull: false,
    fullCandidateCount: 20,
  });
  assert.equal(compact.hasMoreHistory, true);
  assert.ok(compact.rows.length <= TEAM_ARC_DEFAULT_WINDOW);
}

// --- partial coverage / zeros ---
{
  const sparse = team({
    teamId: "2",
    abbreviation: "BOS",
    fullName: "Boston Celtics",
    season: "2001-02",
    trueShootingPct: 0,
    effectiveFieldGoalPct: 0,
    ppg: 0,
    oppPpg: 0,
    avgDiff: -1.2,
  });
  const row = toTeamArcSeasonRow(sparse);
  assert.equal(row.tsDisplay, "—");
  assert.equal(row.efgDisplay, "—");
  assert.equal(row.ppgDisplay, "—");
  assert.equal(row.oppPpgDisplay, "—");
  assert.ok(row.avgDiffDisplay.includes("-1.2") || row.avgDiffDisplay.includes("-1.20") || row.avgDiffDisplay === "-1.2");
}

// --- transitions reuse analyzeTeamProfile floors ---
{
  const prior = team({
    teamId: "2",
    abbreviation: "BOS",
    fullName: "Boston Celtics",
    season: "2023-24",
    avgDiff: 5,
    trueShootingPct: 0.55,
    oppPpg: 110,
  });
  const next = team({
    teamId: "2",
    abbreviation: "BOS",
    fullName: "Boston Celtics",
    season: "2024-25",
    avgDiff: 11,
    trueShootingPct: 0.59,
    oppPpg: 105,
  });
  const viaArc = buildTeamArcTransitions([next, prior]);
  const viaProfile = analyzeTeamProfile({
    team: next,
    league: [next],
    prior,
  });
  assert.ok(viaArc.length >= 1);
  assert.equal(viaArc[0]?.fromSeason, "2023-24");
  assert.equal(viaArc[0]?.toSeason, "2024-25");
  assert.deepEqual(
    viaArc[0]?.changes.map((c) => c.id).sort(),
    (viaProfile.vsPrior?.changes ?? []).map((c) => c.id).sort()
  );

  // Below noise floor — no transition
  const tiny = team({
    ...next,
    avgDiff: 5.2,
    trueShootingPct: 0.5505,
    oppPpg: 110.1,
  });
  const none = buildTeamArcTransitions([tiny, prior]);
  assert.equal(none.length, 0);
}

// --- routing ---
{
  assert.equal(
    teamArcSeasonHref("bos", "2024-25"),
    "/teams/bos?season=2024-25"
  );
  assert.equal(
    teamArcFullHref("bos", "2025-26", true),
    "/teams/bos?season=2025-26&arc=full"
  );
  assert.equal(
    teamArcFullHref("bos", "2025-26", false),
    "/teams/bos?season=2025-26"
  );
  assert.equal(
    teamArcGamesHref("2", "2024-25"),
    "/explore/games?season=2024-25&team=2"
  );
  assert.equal(
    teamArcEvidenceHref("bos", "2023-24"),
    "/teams/bos?season=2023-24#evidence"
  );
}

// --- ASK teamId deep links ---
{
  const href = askDrblTeamHref("Boston Celtics point differential 2025-26", "2");
  assert.ok(href.includes("teamId=2"));
  assert.ok(href.includes("q="));
  const links = buildTeamAskLinks("Boston Celtics", "2025-26", "2");
  assert.ok(links.every((l) => l.href.includes("teamId=2")));
  assert.equal(
    askDrblTeamHref("x", "bos"),
    "/ask?q=x&teamId=bos"
  );
}

// --- identity continuity: different teamIds stay separate ---
{
  const a = team({
    teamId: "2",
    abbreviation: "BOS",
    fullName: "Boston Celtics",
    season: "2024-25",
  });
  const b = team({
    teamId: "25",
    abbreviation: "OKC",
    fullName: "Oklahoma City Thunder",
    season: "2024-25",
  });
  assert.notEqual(a.teamId, b.teamId);
  const model = buildTeamArcModel({
    rows: [a],
    viewingSeason: "2024-25",
    showingFull: false,
    fullCandidateCount: 10,
  });
  assert.ok(!model.rows.some((r) => r.season === "okc"));
  assert.ok(model.continuityNote.includes("not a merged"));
}

console.log("test-team-arc: all assertions passed");
