/**
 * Team Intelligence V2 helpers — deterministic assembly tests.
 * Run: npx tsx scripts/test-team-intelligence.ts
 */
import assert from "node:assert/strict";

import { analyzeTeamProfile } from "../src/analytics";
import type { GameSummary, PlayerSeason, TeamSeasonStats } from "../src/data/types";
import {
  assessTeamCoverage,
  buildRosterBuckets,
  buildTeamAskLinks,
  buildTeamIdentityStatements,
  enrichTraitsWithPrior,
  filterTeamGames,
  findStandingRow,
  gameInvolvesTeam,
  groupTraitsForPerformance,
  resolveTeamFromBoard,
  seasonChipHref,
  transactionTeamFilterId,
} from "../src/lib/team-explorer";

function team(partial: Partial<TeamSeasonStats> & Pick<TeamSeasonStats, "teamId" | "abbreviation" | "fullName">): TeamSeasonStats {
  return {
    season: "2025-26",
    conference: "East",
    gamesPlayed: 50,
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

const bos = team({
  teamId: "2",
  abbreviation: "BOS",
  fullName: "Boston Celtics",
  avgDiff: 9.2,
  trueShootingPct: 0.61,
  effectiveFieldGoalPct: 0.58,
  threePointPct: 0.39,
  topg: 11,
  oppPpg: 102,
  threePointersAttempted: 2200,
  fieldGoalsAttempted: 4200,
});

const weak = team({
  teamId: "99",
  abbreviation: "WK",
  fullName: "Weak Team",
  avgDiff: -8,
  trueShootingPct: 0.5,
  effectiveFieldGoalPct: 0.48,
  threePointPct: 0.32,
  topg: 16,
  oppPpg: 118,
  threePointersAttempted: 1200,
  fieldGoalsAttempted: 4200,
  offensiveReboundPct: 0.2,
  assistToTurnover: 1.4,
  spg: 5,
  bpg: 3,
});

const league = [
  bos,
  weak,
  team({
    teamId: "3",
    abbreviation: "NY",
    fullName: "New York Knicks",
    avgDiff: 3,
    trueShootingPct: 0.56,
  }),
  team({
    teamId: "4",
    abbreviation: "PHI",
    fullName: "Philadelphia 76ers",
    avgDiff: 1,
    trueShootingPct: 0.54,
  }),
  team({
    teamId: "5",
    abbreviation: "MIL",
    fullName: "Milwaukee Bucks",
    avgDiff: 2,
    trueShootingPct: 0.55,
  }),
];

// --- resolve / season ---
assert.equal(resolveTeamFromBoard(league, "BOS")?.teamId, "2");
assert.equal(resolveTeamFromBoard(league, "boston celtics")?.abbreviation, "BOS");
assert.equal(resolveTeamFromBoard(league, "2")?.fullName, "Boston Celtics");
// Season chips write canonical ESPN team ids into the public URL.
assert.equal(seasonChipHref("bos", "2024-25"), "/teams/2?season=2024-25");
assert.equal(seasonChipHref("BOS", "2024-25"), "/teams/2?season=2024-25");

// --- profile + strengths / trends ---
const prior = team({
  ...bos,
  season: "2024-25",
  avgDiff: 6,
  trueShootingPct: 0.58,
  topg: 13,
});
const analysis = analyzeTeamProfile({ team: bos, league, prior });
assert.ok(analysis.traits.length >= 5);
assert.ok(analysis.howTheyWin.length >= 1);
assert.ok(analysis.vsPrior);
assert.ok(analysis.vsPrior!.changes.length >= 1);

const enriched = enrichTraitsWithPrior(analysis.traits, bos, prior);
const diffTrait = enriched.find((t) => t.id === "diff");
assert.ok(diffTrait?.context.vsPrior != null);
assert.ok(Math.abs((diffTrait!.context.vsPrior as number) - 3.2) < 1e-6);

// Noise floor: tiny TS change should not appear when below 0.008
const tinyPrior = team({ ...bos, season: "2024-25", trueShootingPct: 0.6095 });
const tiny = analyzeTeamProfile({ team: bos, league, prior: tinyPrior });
assert.ok(!tiny.vsPrior?.changes.some((c) => c.id === "ts"));

// --- identity ---
const identity = buildTeamIdentityStatements(enriched);
assert.ok(identity.every((s) => /Top|Bottom/.test(s.text)));
assert.ok(!identity.some((s) => /switch-heavy|5-out/i.test(s.text)));

// --- performance grouping ---
const grouped = groupTraitsForPerformance(enriched);
assert.ok(grouped.overall.every((t) => t.id === "diff"));
assert.ok(grouped.defense.every((t) => ["opp", "stl", "blk"].includes(t.id)));

// --- roster ordering ---
const roster = [
  {
    playerId: "a",
    playerName: "A",
    teamId: "2",
    season: "2025-26",
    gamesPlayed: 40,
    minutes: 1200,
    points: 800,
    darkoDpm: 1.2,
  },
  {
    playerId: "b",
    playerName: "B",
    teamId: "2",
    season: "2025-26",
    gamesPlayed: 40,
    minutes: 800,
    points: 1000,
    darkoDpm: 3.5,
  },
  {
    playerId: "c",
    playerName: "C",
    teamId: "2",
    season: "2025-26",
    gamesPlayed: 40,
    minutes: 1400,
    points: 400,
  },
] as PlayerSeason[];

const buckets = buildRosterBuckets(roster, { listLimit: 2, rotationLimit: 2 });
assert.equal(buckets.leadingScorers[0]?.playerId, "b");
assert.equal(buckets.highestValue[0]?.playerId, "b");
assert.equal(buckets.rotation[0]?.playerId, "c");
assert.equal(buckets.highestValue.length, 2);

// --- games ---
const games: GameSummary[] = [
  {
    id: "g1",
    season: "2025-26",
    gameDate: "2025-11-02",
    homeTeamId: "2",
    awayTeamId: "3",
    homeTeamAbbr: "BOS",
    awayTeamAbbr: "NY",
    homeScore: 120,
    awayScore: 100,
    gameType: "regular",
    status: "final",
    totalPoints: 220,
    margin: 20,
    absMargin: 20,
  },
  {
    id: "g2",
    season: "2025-26",
    gameDate: "2025-11-01",
    homeTeamId: "4",
    awayTeamId: "5",
    homeTeamAbbr: "PHI",
    awayTeamAbbr: "MIL",
    homeScore: 99,
    awayScore: 98,
    gameType: "regular",
    status: "final",
    totalPoints: 197,
    margin: 1,
    absMargin: 1,
  },
];
assert.equal(gameInvolvesTeam(games[0]!, bos), true);
assert.equal(gameInvolvesTeam(games[1]!, bos), false);
assert.equal(filterTeamGames(games, bos, null, 5).length, 1);

// ESPN PHX (21) must not match OKC; BDL OKC is also 21 on provider ids only.
{
  const okc = team({
    teamId: "25",
    abbreviation: "OKC",
    fullName: "Oklahoma City Thunder",
  });
  const phxEspn: GameSummary = {
    id: "phx-espn",
    season: "2025-26",
    gameDate: "2025-11-03",
    homeTeamId: "21",
    awayTeamId: "2",
    homeTeamAbbr: "PHX",
    awayTeamAbbr: "BOS",
    homeScore: 110,
    awayScore: 108,
    gameType: "regular",
    status: "final",
    totalPoints: 218,
    margin: 2,
    absMargin: 2,
  };
  const okcEspn: GameSummary = {
    ...phxEspn,
    id: "okc-espn",
    homeTeamId: "25",
    homeTeamAbbr: "OKC",
  };
  const okcViaBdlProvider: GameSummary = {
    ...okcEspn,
    id: "okc-bdl-provider",
    homeProviderTeamId: "21",
  };
  assert.equal(gameInvolvesTeam(phxEspn, okc), false);
  assert.equal(gameInvolvesTeam(okcEspn, okc), true);
  assert.equal(gameInvolvesTeam(okcViaBdlProvider, okc), true);
}

// --- standings match ---
const row = findStandingRow(
  [
    {
      teamId: "2",
      abbreviation: "BOS",
      displayName: "Boston",
      conference: "East",
      rank: 1,
      wins: 40,
      losses: 10,
      winPct: 0.8,
      gamesBehind: 0,
      differential: 9,
      ppg: 118,
      oppPpg: 109,
      streak: "W3",
      homeRecord: "20-5",
      roadRecord: "20-5",
      lastTen: "8-2",
      playoffSeed: 1,
    },
  ],
  bos
);
assert.equal(row?.rank, 1);

// --- transactions filter id ---
assert.equal(
  transactionTeamFilterId(bos, {
    id: "bos",
    abbr: "BOS",
    logoSlug: "bos",
    espnTeamId: "2",
    primary: "#000",
    secondary: "#fff",
  }),
  "2"
);

// --- ask links ---
const asks = buildTeamAskLinks("Boston Celtics", "2025-26");
assert.equal(asks.length, 6);
assert.ok(asks.every((a) => a.href.startsWith("/ask?q=")));
assert.ok(asks.some((a) => a.href.includes("point+differential")));
assert.ok(asks.some((a) => a.href.includes("offseason")));
assert.ok(asks.some((a) => /best\+season/i.test(a.href) || /Rank/.test(a.label)));
assert.ok(asks.some((a) => /biggest\+wins/i.test(a.href)));
assert.ok(!asks.some((a) => /lineup|possession|shot map/i.test(a.label)));
const withId = buildTeamAskLinks("Boston Celtics", "2025-26", "2");
assert.ok(withId.every((a) => a.href.includes("teamId=2")));

// --- coverage / missing historical ---
const min = assessTeamCoverage({
  hasTeamBoard: true,
  traitCount: 2,
  rosterCount: 0,
  gameCount: 0,
  transactionCount: 0,
});
assert.equal(min.level, "partial");
assert.ok(min.lines.some((l) => l.label.includes("PBP") && l.status === "unavailable"));

const full = assessTeamCoverage({
  hasTeamBoard: true,
  traitCount: 8,
  rosterCount: 10,
  gameCount: 5,
  transactionCount: 2,
});
assert.equal(full.level, "full");

const emptyBoard = assessTeamCoverage({
  hasTeamBoard: false,
  traitCount: 0,
  rosterCount: 0,
  gameCount: 0,
  transactionCount: 0,
});
assert.equal(emptyBoard.level, "minimal");

console.log("canonical team board resolution…");
{
  const okc = team({
    teamId: "25",
    abbreviation: "OKC",
    fullName: "Oklahoma City Thunder",
  });
  assert.equal(resolveTeamFromBoard([okc], "okc")?.abbreviation, "OKC");
  assert.equal(resolveTeamFromBoard([okc], "25")?.abbreviation, "OKC");
  // OKC / POR collision: bare "25" is ESPN OKC, not BDL POR.
  assert.notEqual(resolveTeamFromBoard([okc], "bdl:25")?.abbreviation, "OKC");
}

console.log("test-team-intelligence: all assertions passed");
