/**
 * Product PBP + possession pipeline tests (recorded fixtures only — no live network).
 * Run: npm run test:pbp-product
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { normalizePlayByPlay } from "../drbl/ingest/normalize";
import { normalizeBoxScore } from "../drbl/ingest/normalize";
import { reconstructLineups } from "../drbl/possessions/reconstruct-lineups";
import { reconstructPossessions } from "../drbl/possessions/reconstruct-possessions";
import type { DrblBoxScore, DrblEvent } from "../drbl/types";
import { statsBoxScoreV3ToCdnShape } from "../drbl/download/stats-boxscore-adapt";
import { buildGamePbpCapability } from "../src/pbp/capability";
import { mapRawPbpSource } from "../src/pbp/source-map";
import {
  buildLineupValidationReport,
  lineupValidationFailed,
} from "../src/pbp/validate-lineup-pipeline";
import {
  clearGamePossessionCache,
  getGamePossessions,
} from "../src/data/queries/game-possessions";
import { analyzeGame } from "../src/analytics/game-lab";
import type { Game, PlayerGame } from "../src/data/types";
import type { GamePlayByPlay } from "../src/data/types/play-by-play";
import { transformNbaPlayByPlay } from "../src/data/transformers/play-by-play";

const FIXTURE_ROOT = path.join(
  process.cwd(),
  "scripts",
  "fixtures",
  "pbp",
  "games"
);

const FULL_GAME_FIXTURES = [
  "0022400001",
  "0021900001",
  "0042400101",
  "0021500001",
] as const;

function loadFixture(gameId: string, kind: string): unknown {
  const file = path.join(FIXTURE_ROOT, gameId, `${kind}.json`);
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}

function fixtureLoaders(gameId: string) {
  return {
    fetchPbp: async () => ({
      raw: loadFixture(gameId, "playbyplay"),
      source: "cdn" as const,
    }),
    fetchBox: async () => ({
      raw: loadFixture(gameId, "boxscore"),
      source: "cdn" as const,
    }),
    fetchAdvancedBox: async () => ({
      raw: loadFixture(gameId, "boxscore-advanced-v3"),
      source: "stats" as const,
    }),
  };
}

function statsFallbackLoaders(gameId: string) {
  const statsBoxRaw = loadFixture(gameId, "boxscore-stats-v3");
  const adapted = statsBoxScoreV3ToCdnShape(statsBoxRaw);
  assert.ok(adapted, "stats box score fixture must adapt to CDN shape");
  return {
    fetchPbp: async () => ({
      raw: loadFixture(gameId, "playbyplay"),
      source: "stats" as const,
    }),
    fetchBox: async () => ({
      raw: statsBoxRaw,
      source: "stats" as const,
    }),
    fetchAdvancedBox: async () => ({
      raw: loadFixture(gameId, "boxscore-advanced-v3"),
      source: "stats" as const,
    }),
  };
}

function emptyLoaders() {
  return {
    fetchPbp: async () => null,
    fetchBox: async () => null,
  };
}

async function testRegularSeasonGame() {
  const gameId = "0022400001";
  const result = await getGamePossessions(gameId, {
    loaders: fixtureLoaders(gameId),
    bypassCache: true,
  });
  assert.equal(result.status, "available");
  if (result.status !== "available") return;
  assert.equal(result.gameId, gameId);
  assert.ok(result.events.length > 400);
  assert.ok(result.possessions.length > 50);
  assert.equal(result.capability.rawPbpAvailable, true);
  assert.equal(result.capability.possessionsDerived, true);
  assert.equal(result.capability.lineupsDerived, true);
  assert.equal(result.capability.status, "lineups_available");
  assert.equal(result.provenance.playByPlay, "nba_cdn");
  assert.equal(result.provenance.boxScore, "nba_cdn");
  assert.equal(result.validation.scoreConservationOk, true);
  assert.equal(result.lineupValidation.fatalErrors.length, 0);
  assert.deepEqual(result.validation.periodsObserved, [1, 2, 3, 4]);
  assert.equal(result.validation.fatalErrors.length, 0);
  assert.notEqual(result.officialPossessionComparison, "unavailable");

  const subs = result.events.filter((e) => e.actionType === "substitution");
  assert.ok(subs.length > 50);
  assert.ok(subs.every((e) => e.substitutionSide === "in" || e.substitutionSide === "out"));
}

async function testOvertimeGame() {
  const gameId = "0021900001";
  const result = await getGamePossessions(gameId, {
    loaders: fixtureLoaders(gameId),
    bypassCache: true,
  });
  assert.equal(result.status, "available");
  if (result.status !== "available") return;
  assert.ok(result.validation.periodsObserved.includes(5));
  const techs = result.events.filter((e) =>
    /technical/i.test(e.description)
  );
  assert.ok(techs.length >= 1);
  const reviews = result.events.filter((e) => e.actionType === "instantreplay");
  assert.ok(reviews.length >= 1);
  assert.equal(result.validation.scoreConservationOk, true);
}

async function testPlayoffRichMetadata() {
  const gameId = "0042400101";
  const result = await getGamePossessions(gameId, {
    loaders: fixtureLoaders(gameId),
    bypassCache: true,
  });
  assert.equal(result.status, "available");
  if (result.status !== "available") return;
  const withCoords = result.events.filter(
    (e) => e.x != null && e.y != null && e.isFieldGoal
  );
  assert.ok(withCoords.length > 10);
  assert.equal(result.validation.scoreConservationOk, true);
}

async function testStatsFallbackEndToEnd() {
  const gameId = "0021500001";
  assert.ok(
    existsSync(path.join(FIXTURE_ROOT, gameId, "boxscore-stats-v3.json")),
    "stats box score fixture required"
  );
  const result = await getGamePossessions(gameId, {
    loaders: statsFallbackLoaders(gameId),
    bypassCache: true,
  });
  assert.equal(result.status, "available", JSON.stringify(result));
  if (result.status !== "available") return;
  assert.equal(result.provenance.playByPlay, "stats_nba");
  assert.equal(result.provenance.boxScore, "stats_nba");
  assert.equal(result.source, "stats_nba");
  assert.ok(result.events.length > 400);
  assert.ok(result.possessions.length > 50);
  assert.equal(result.validation.scoreConservationOk, true);
  assert.equal(result.capability.possessionsDerived, true);
  assert.equal(result.capability.lineupsDerived, false);
  assert.equal(result.capability.status, "possessions_available");
  assert.ok(result.lineupValidation.fatalErrors.length > 0);
}

async function testOfficialPossessionComparisonForFixtures() {
  for (const gameId of FULL_GAME_FIXTURES) {
    const loaders =
      gameId === "0021500001"
        ? statsFallbackLoaders(gameId)
        : fixtureLoaders(gameId);
    const result = await getGamePossessions(gameId, {
      loaders,
      bypassCache: true,
    });
    assert.equal(result.status, "available", gameId);
    if (result.status !== "available") continue;
    assert.notEqual(result.officialPossessionComparison, "unavailable", gameId);
    assert.ok(result.officialPossessions);
    console.log(
      `[possession-compare] ${gameId} official=${result.officialPossessions!.home}/${result.officialPossessions!.away} derived=${result.derivedPossessions.home}/${result.derivedPossessions.away} delta=${result.possessionDelta?.home}/${result.possessionDelta?.away} status=${result.officialPossessionComparison} lineups=${result.capability.lineupsDerived}`
    );
  }
}

async function testStatsFallbackNormalization() {
  const gameId = "0021500001";
  const raw = loadFixture(gameId, "playbyplay");
  const events = normalizePlayByPlay(gameId, raw);
  assert.ok(events.length > 400);
  const actionTypes = new Set(events.map((e) => e.actionType));
  assert.ok(actionTypes.has("2pt"));
  assert.ok(actionTypes.has("substitution"));
}

async function testSiteTransformerOrdering() {
  const gameId = "0022400001";
  const raw = loadFixture(gameId, "playbyplay");
  const pbp = transformNbaPlayByPlay(gameId, raw, "cdn");
  assert.ok(pbp.events.length > 400);
  for (let i = 1; i < pbp.events.length; i++) {
    const prev = pbp.events[i - 1]!;
    const cur = pbp.events[i]!;
    const ok =
      cur.period > prev.period ||
      (cur.period === prev.period &&
        (cur.orderNumber > prev.orderNumber ||
          (cur.orderNumber === prev.orderNumber &&
            cur.actionNumber >= prev.actionNumber)));
    assert.ok(ok, `ordering break at index ${i}`);
  }
}

async function testUnavailablePaths() {
  const missing = await getGamePossessions("missing-game", {
    loaders: emptyLoaders(),
    bypassCache: true,
  });
  assert.equal(missing.status, "unavailable");
  if (missing.status === "unavailable") {
    assert.equal(missing.reason, "pbp_fetch_failed");
    assert.equal(missing.capability.rawPbpAvailable, false);
    assert.equal(missing.capability.possessionsDerived, false);
  }

  const empty = await getGamePossessions("empty-game", {
    loaders: {
      fetchPbp: async () => ({ raw: { game: { actions: [] } }, source: "cdn" }),
      fetchBox: async () => null,
    },
    bypassCache: true,
  });
  assert.equal(empty.status, "unavailable");
  if (empty.status === "unavailable") {
    assert.equal(empty.reason, "pbp_empty");
  }
}

async function testDeterministicRepeat() {
  const gameId = "0022400001";
  const a = await getGamePossessions(gameId, {
    loaders: fixtureLoaders(gameId),
    bypassCache: true,
  });
  const b = await getGamePossessions(gameId, {
    loaders: fixtureLoaders(gameId),
    bypassCache: true,
  });
  // elapsedMs in diagnostics is wall-clock; compare stable product fields only.
  const strip = (result: typeof a) => {
    const { diagnostics: _d, ...rest } = result as typeof a & {
      diagnostics?: unknown;
    };
    return rest;
  };
  assert.equal(JSON.stringify(strip(a)), JSON.stringify(strip(b)));
}

function testGameLabCapabilityTruth() {
  const game: Game = {
    id: "g1",
    season: "2024-25",
    gameDate: "2025-01-01",
    homeTeamId: "2",
    awayTeamId: "1",
    homeTeamAbbr: "BOS",
    awayTeamAbbr: "NYK",
    homeTeamName: "Boston",
    awayTeamName: "New York",
    homeScore: 110,
    awayScore: 105,
    homePeriodScores: [28, 27, 30, 25],
    awayPeriodScores: [25, 28, 26, 26],
    gameType: "regular",
    status: "final",
  };
  const playByPlay: GamePlayByPlay = {
    gameId: "g1",
    source: "cdn",
    events: [
      {
        id: "g1-1",
        gameId: "g1",
        actionNumber: 1,
        orderNumber: 1,
        period: 1,
        clockSeconds: 720,
        clock: "12:00",
        actionType: "2pt",
        subType: "Layup",
        description: "score",
        teamId: "2",
        teamTricode: "BOS",
        playerId: "p1",
        playerName: "Player",
        scoreHome: 2,
        scoreAway: 0,
        shotResult: "Made",
        isFieldGoal: true,
        points: 2,
      },
    ],
  };
  const analysis = analyzeGame({
    game,
    players: [] as PlayerGame[],
    homeLabel: "BOS",
    awayLabel: "NYK",
    homeName: "Boston",
    awayName: "New York",
    playByPlay,
  });
  assert.equal(analysis.coverage.pbp.rawPbpAvailable, true);
  assert.equal(analysis.coverage.pbp.rawEventCount, 1);
  assert.equal(analysis.coverage.pbp.possessionsDerived, false);
  assert.equal(analysis.coverage.pbpAvailable, true);
  assert.equal(analysis.coverage.pbpAvailable, analysis.coverage.pbp.rawPbpAvailable);
}

function testCapabilityMapping() {
  assert.equal(mapRawPbpSource("cdn"), "nba_cdn");
  assert.equal(mapRawPbpSource("stats"), "stats_nba");
  assert.equal(mapRawPbpSource("disk"), "disk_cache");
  const cap = buildGamePbpCapability({
    rawEventCount: 10,
    source: "nba_cdn",
    possessionsDerived: true,
  });
  assert.equal(cap.status, "possessions_available");
}

function testCapabilityTruthTable() {
  const cases = [
    {
      raw: 0,
      timeline: false,
      possessions: false,
      lineups: false,
      status: "unavailable",
    },
    {
      raw: 10,
      timeline: false,
      possessions: false,
      lineups: false,
      status: "raw_available",
    },
    {
      raw: 10,
      timeline: true,
      possessions: false,
      lineups: false,
      status: "raw_available",
    },
    {
      raw: 10,
      timeline: true,
      possessions: true,
      lineups: false,
      status: "possessions_available",
    },
    {
      raw: 10,
      timeline: true,
      possessions: true,
      lineups: true,
      status: "lineups_available",
    },
  ] as const;

  for (const c of cases) {
    const cap = buildGamePbpCapability({
      rawEventCount: c.raw,
      source: "nba_cdn",
      scoreTimelineAvailable: c.timeline,
      possessionsDerived: c.possessions,
      lineupsDerived: c.lineups,
    });
    assert.equal(cap.status, c.status, JSON.stringify(c));
    assert.equal(cap.possessionsDerived, c.possessions && c.raw > 0);
    assert.equal(
      cap.lineupsDerived,
      c.lineups && c.possessions && c.raw > 0,
      JSON.stringify(c)
    );
  }
}

const HOME = "1610612738";
const AWAY = "1610612752";

function lineupBox(homeIds: string[], awayIds: string[]): DrblBoxScore {
  return {
    gameId: "lineup-test",
    season: "2024-25",
    gameDate: "2024-11-01",
    homeTeamId: HOME,
    awayTeamId: AWAY,
    homeTeamTricode: "BOS",
    awayTeamTricode: "NYK",
    homeScore: 0,
    awayScore: 0,
    players: [
      ...homeIds.map((id) => ({
        playerId: id,
        playerName: id,
        teamId: HOME,
        starter: true,
        minutes: 12,
        points: 0,
        fieldGoalsMade: 0,
        fieldGoalsAttempted: 0,
        threePointersMade: 0,
        threePointersAttempted: 0,
        freeThrowsMade: 0,
        freeThrowsAttempted: 0,
        offensiveRebounds: 0,
        defensiveRebounds: 0,
        rebounds: 0,
        assists: 0,
        steals: 0,
        blocks: 0,
        turnovers: 0,
        personalFouls: 0,
      })),
      ...awayIds.map((id) => ({
        playerId: id,
        playerName: id,
        teamId: AWAY,
        starter: true,
        minutes: 12,
        points: 0,
        fieldGoalsMade: 0,
        fieldGoalsAttempted: 0,
        threePointersMade: 0,
        threePointersAttempted: 0,
        freeThrowsMade: 0,
        freeThrowsAttempted: 0,
        offensiveRebounds: 0,
        defensiveRebounds: 0,
        rebounds: 0,
        assists: 0,
        steals: 0,
        blocks: 0,
        turnovers: 0,
        personalFouls: 0,
      })),
    ],
  };
}

function ev(
  partial: Partial<DrblEvent> &
    Pick<DrblEvent, "actionNumber" | "actionType" | "period" | "clockSeconds">
): DrblEvent {
  return {
    gameId: "lineup-test",
    orderNumber: partial.actionNumber,
    clockRaw: `PT${Math.floor(partial.clockSeconds / 60)}M${partial.clockSeconds % 60}.00S`,
    subType: "",
    teamId: null,
    playerId: null,
    playerName: null,
    possessionTeamId: null,
    description: "",
    shotResult: null,
    isFieldGoal: false,
    pointsOnAction: 0,
    scoreHome: 0,
    scoreAway: 0,
    x: null,
    y: null,
    qualifiers: [],
    substitutionSide: null,
    ...partial,
  };
}

const H = ["h1", "h2", "h3", "h4", "h5"];
const A = ["a1", "a2", "a3", "a4", "a5"];

function testLineupValidationCases() {
  const validBox = lineupBox(H, A);
  const validEvents = [
    ev({
      actionNumber: 1,
      period: 1,
      clockSeconds: 600,
      actionType: "substitution",
      teamId: HOME,
      playerId: "h1",
      substitutionSide: "out",
    }),
    ev({
      actionNumber: 2,
      period: 1,
      clockSeconds: 600,
      actionType: "substitution",
      teamId: HOME,
      playerId: "h6",
      substitutionSide: "in",
    }),
    ev({
      actionNumber: 3,
      period: 1,
      clockSeconds: 0,
      actionType: "period",
      subType: "end",
    }),
  ];
  validBox.players.push({
    playerId: "h6",
    playerName: "h6",
    teamId: HOME,
    starter: false,
    minutes: 5,
    points: 0,
    fieldGoalsMade: 0,
    fieldGoalsAttempted: 0,
    threePointersMade: 0,
    threePointersAttempted: 0,
    freeThrowsMade: 0,
    freeThrowsAttempted: 0,
    offensiveRebounds: 0,
    defensiveRebounds: 0,
    rebounds: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    personalFouls: 0,
  });
  const validLineups = reconstructLineups(validEvents, validBox);
  const validReport = buildLineupValidationReport({
    events: validEvents,
    box: validBox,
    lineups: validLineups,
  });
  assert.equal(lineupValidationFailed(validReport), false);

  const missingStarters = lineupBox(H.slice(0, 4), A);
  const missingReport = buildLineupValidationReport({
    events: [],
    box: missingStarters,
    lineups: reconstructLineups([], missingStarters),
  });
  assert.equal(missingReport.startersResolvedHome, false);
  assert.equal(lineupValidationFailed(missingReport), true);

  const dupEvents = [
    ev({
      actionNumber: 1,
      period: 1,
      clockSeconds: 600,
      actionType: "substitution",
      teamId: HOME,
      playerId: "h1",
      substitutionSide: "out",
    }),
    ev({
      actionNumber: 2,
      period: 1,
      clockSeconds: 600,
      actionType: "substitution",
      teamId: HOME,
      playerId: "h6",
      substitutionSide: "in",
    }),
    ev({
      actionNumber: 3,
      period: 1,
      clockSeconds: 600,
      actionType: "substitution",
      teamId: HOME,
      playerId: "h6",
      substitutionSide: "in",
    }),
  ];
  const dupBox = lineupBox(H, A);
  dupBox.players.push({
    playerId: "h6",
    playerName: "h6",
    teamId: HOME,
    starter: false,
    minutes: 0,
    points: 0,
    fieldGoalsMade: 0,
    fieldGoalsAttempted: 0,
    threePointersMade: 0,
    threePointersAttempted: 0,
    freeThrowsMade: 0,
    freeThrowsAttempted: 0,
    offensiveRebounds: 0,
    defensiveRebounds: 0,
    rebounds: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    personalFouls: 0,
  });
  const dupReport = buildLineupValidationReport({
    events: dupEvents,
    box: dupBox,
    lineups: reconstructLineups(dupEvents, dupBox),
  });
  assert.ok(dupReport.substitutionInActiveCount > 0);
  assert.equal(lineupValidationFailed(dupReport), true);

  const inactiveSubEvents = [
    ev({
      actionNumber: 1,
      period: 1,
      clockSeconds: 600,
      actionType: "substitution",
      teamId: HOME,
      playerId: "h9",
      substitutionSide: "out",
    }),
  ];
  const inactiveReport = buildLineupValidationReport({
    events: inactiveSubEvents,
    box: lineupBox(H, A),
    lineups: reconstructLineups(inactiveSubEvents, lineupBox(H, A)),
  });
  assert.ok(inactiveReport.substitutionOutInactiveCount > 0);
  assert.equal(lineupValidationFailed(inactiveReport), true);

  const sixPlayerBox = lineupBox([...H, "h6"], A);
  const sixReport = buildLineupValidationReport({
    events: [],
    box: sixPlayerBox,
    lineups: reconstructLineups([], sixPlayerBox),
  });
  assert.equal(sixReport.startersResolvedHome, false);
  assert.equal(lineupValidationFailed(sixReport), true);

  const incompleteSubEvents = [
    ev({
      actionNumber: 1,
      period: 1,
      clockSeconds: 600,
      actionType: "substitution",
      teamId: HOME,
      playerId: "h1",
      substitutionSide: "out",
    }),
  ];
  const incompleteReport = buildLineupValidationReport({
    events: incompleteSubEvents,
    box: lineupBox(H, A),
    lineups: reconstructLineups(incompleteSubEvents, lineupBox(H, A)),
  });
  assert.ok(incompleteReport.unresolvedSubstitutions > 0);
  assert.equal(lineupValidationFailed(incompleteReport), true);
}

async function testPossessionSuccessWithLineupFailure() {
  const box = lineupBox(H, A);
  box.homeScore = 2;
  box.players[0]!.points = 2;
  box.players[0]!.fieldGoalsMade = 1;
  box.players[0]!.fieldGoalsAttempted = 1;
  const events = [
    ev({
      actionNumber: 1,
      period: 1,
      clockSeconds: 700,
      actionType: "2pt",
      teamId: HOME,
      playerId: "h1",
      shotResult: "Made",
      isFieldGoal: true,
      pointsOnAction: 2,
      scoreHome: 2,
    }),
    ev({
      actionNumber: 2,
      period: 1,
      clockSeconds: 600,
      actionType: "substitution",
      teamId: HOME,
      playerId: "h9",
      substitutionSide: "out",
    }),
  ];
  const lineups = reconstructLineups(events, box);
  const possessions = reconstructPossessions(events, box, lineups);
  assert.ok(possessions.length > 0);
  const lineupValidation = buildLineupValidationReport({ events, box, lineups });
  assert.equal(lineupValidationFailed(lineupValidation), true);
  const capability = buildGamePbpCapability({
    rawEventCount: events.length,
    source: "nba_cdn",
    scoreTimelineAvailable: true,
    possessionsDerived: true,
    lineupsDerived: false,
  });
  assert.equal(capability.status, "possessions_available");
  assert.equal(capability.lineupsDerived, false);
}

function runDrblPossessionEdgeTests() {
  const result = spawnSync(
    "npx",
    [
      "tsx",
      "--test",
      "drbl/possessions/__tests__/possession-edge-cases.test.ts",
    ],
    { stdio: "inherit", shell: process.platform === "win32" }
  );
  assert.equal(result.status, 0, "drbl possession edge-case tests failed");
}

function runLineupValidationUnitTests() {
  const result = spawnSync(
    "npx",
    ["tsx", "--test", "src/pbp/__tests__/lineup-validation.test.ts"],
    { stdio: "inherit", shell: process.platform === "win32" }
  );
  assert.equal(result.status, 0, "lineup validation unit tests failed");
}

async function main() {
  clearGamePossessionCache();
  await testRegularSeasonGame();
  await testOvertimeGame();
  await testPlayoffRichMetadata();
  await testStatsFallbackEndToEnd();
  await testOfficialPossessionComparisonForFixtures();
  await testStatsFallbackNormalization();
  await testSiteTransformerOrdering();
  await testUnavailablePaths();
  await testDeterministicRepeat();
  testGameLabCapabilityTruth();
  testCapabilityMapping();
  testCapabilityTruthTable();
  testLineupValidationCases();
  await testPossessionSuccessWithLineupFailure();
  runDrblPossessionEdgeTests();
  runLineupValidationUnitTests();
  console.log("test-pbp-product: all assertions passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
