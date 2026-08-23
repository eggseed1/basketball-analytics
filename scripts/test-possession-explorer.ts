/**
 * Possession Explorer presentation + identity contract (fixture-safe).
 * Run: npm run test:possession-explorer
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { DrblEvent, DrblPossession } from "../drbl/types";
import { statsBoxScoreV3ToCdnShape } from "../drbl/download/stats-boxscore-adapt";
import {
  clearGamePossessionCache,
  getGamePossessions,
} from "../src/data/queries/game-possessions";
import type {
  GamePossessionAvailable,
  GamePossessionResult,
} from "../src/pbp/product-types";
import { resolveCanonicalTeam } from "../src/data/identity/team-map";
import {
  POSSESSION_EXPLORER_PAGE_SIZE,
  POSSESSION_EXPLORER_SECONDARY_MESSAGE,
  RESULT_FILTER_OPTIONS,
  buildPossessionExplorerModel,
  buildPossessionTeamContext,
  endReasonLabel,
  filterPossessionRows,
  isInvalidPublicTeamAbbreviation,
  legacyBrokenAbbreviationFallback,
  nextVisibleCount,
  periodLabel,
  provenanceSourceLabel,
  resetVisibleCount,
  resultGroupForEndReason,
  resultGroupLabel,
  sliceVisiblePossessions,
  stablePossessionRowId,
  visibleShowingLabel,
} from "../src/lib/possession-explorer";

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
  return JSON.parse(
    readFileSync(path.join(FIXTURE_ROOT, gameId, `${kind}.json`), "utf8")
  ) as unknown;
}

function fixtureLoaders(gameId: string) {
  if (gameId === "0021500001") {
    const statsBoxRaw = loadFixture(gameId, "boxscore-stats-v3");
    assert.ok(statsBoxScoreV3ToCdnShape(statsBoxRaw), "stats box adapts");
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

function boxTeamHints(gameId: string): {
  homeTeamId: string;
  awayTeamId: string;
  homeAbbreviation: string;
  awayAbbreviation: string;
} {
  if (gameId === "0021500001") {
    const adapted = statsBoxScoreV3ToCdnShape(
      loadFixture(gameId, "boxscore-stats-v3")
    ) as {
      game: {
        homeTeam: { teamId: string | number; teamTricode: string };
        awayTeam: { teamId: string | number; teamTricode: string };
      };
    };
    return {
      homeTeamId: String(adapted.game.homeTeam.teamId),
      awayTeamId: String(adapted.game.awayTeam.teamId),
      homeAbbreviation: adapted.game.homeTeam.teamTricode,
      awayAbbreviation: adapted.game.awayTeam.teamTricode,
    };
  }
  const box = loadFixture(gameId, "boxscore") as {
    game: {
      homeTeam: { teamId: string | number; teamTricode: string };
      awayTeam: { teamId: string | number; teamTricode: string };
    };
  };
  return {
    homeTeamId: String(box.game.homeTeam.teamId),
    awayTeamId: String(box.game.awayTeam.teamId),
    homeAbbreviation: box.game.homeTeam.teamTricode,
    awayAbbreviation: box.game.awayTeam.teamTricode,
  };
}

/** Simulates the production bug: ESPN shell ids vs NBA possession ids. */
function espnShellForNbaBox(gameId: string) {
  const hints = boxTeamHints(gameId);
  const home = resolveCanonicalTeam(hints.homeTeamId);
  const away = resolveCanonicalTeam(hints.awayTeamId);
  assert.equal(home.status, "resolved");
  assert.equal(away.status, "resolved");
  if (home.status !== "resolved" || away.status !== "resolved") {
    throw new Error("expected resolved");
  }
  return {
    homeTeamId: home.team.canonicalTeamId,
    awayTeamId: away.team.canonicalTeamId,
    homeAbbreviation: hints.homeAbbreviation,
    awayAbbreviation: hints.awayAbbreviation,
    homeDisplayName: home.team.displayName,
    awayDisplayName: away.team.displayName,
  };
}

function event(
  partial: Partial<DrblEvent> &
    Pick<DrblEvent, "actionNumber" | "actionType" | "period" | "clockSeconds">
): DrblEvent {
  return {
    gameId: "TEST",
    orderNumber: partial.actionNumber,
    clockRaw: `PT${Math.floor(partial.clockSeconds / 60)}M${partial.clockSeconds % 60}.00S`,
    subType: "",
    teamId: "1610612738",
    playerId: "1",
    playerName: "Player",
    possessionTeamId: "1610612738",
    description: partial.description ?? `${partial.actionType} play`,
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

function possession(
  partial: Partial<DrblPossession> &
    Pick<
      DrblPossession,
      "possessionId" | "period" | "startActionNumber" | "endActionNumber"
    >
): DrblPossession {
  return {
    gameId: "TEST",
    offenseTeamId: "1610612738",
    defenseTeamId: "1610612752",
    startClockSeconds: 600,
    endClockSeconds: 580,
    points: 2,
    endReason: "made_fg",
    offensePlayerIds: [],
    defensePlayerIds: [],
    eventActionNumbers: [partial.startActionNumber, partial.endActionNumber],
    ...partial,
  };
}

function availableResult(
  overrides: Partial<GamePossessionAvailable> & {
    possessions: DrblPossession[];
    events: DrblEvent[];
  }
): GamePossessionAvailable {
  return {
    status: "available",
    gameId: "TEST",
    source: "nba_cdn",
    provenance: { playByPlay: "nba_cdn", boxScore: "stats_nba" },
    validation: {
      rawEventCount: overrides.events.length,
      normalizedEventCount: overrides.events.length,
      derivedPossessionCount: overrides.possessions.length,
      periodsObserved: [1],
      teamsObserved: ["1610612738", "1610612752"],
      unknownEventCount: 0,
      eventsDroppedDuringNormalization: 0,
      duplicateActionNumbers: 0,
      duplicateOrderNumbers: 0,
      nonMonotonicOrdering: false,
      possessionOwnershipFailures: 0,
      unresolvedFreeThrowSequences: 0,
      finalPbpScore: { home: 2, away: 0 },
      officialFinalScore: { home: 2, away: 0 },
      scoreConservationOk: true,
      warnings: [],
      fatalErrors: [],
    },
    lineupValidation: {
      lineupSnapshotCount: 2,
      startersResolvedHome: true,
      startersResolvedAway: true,
      invalidStintCount: 0,
      dualTeamPlayerCount: 0,
      substitutionOutInactiveCount: 0,
      substitutionInActiveCount: 0,
      unresolvedSubstitutions: 0,
      negativeStintDurationCount: 0,
      nonMonotonicStintOrdering: false,
      regulationCoverageOk: true,
      overtimeCoverageOk: true,
      uncoveredGameClockSeconds: 0,
      periodsObserved: [1],
      warnings: [],
      fatalErrors: [],
    },
    capability: {
      rawPbpAvailable: true,
      rawEventCount: overrides.events.length,
      scoreTimelineAvailable: true,
      possessionsDerived: true,
      reconstructedPossessionsAvailable: true,
      officialPossessionTotalsAvailable: true,
      possessionCalibrationGrade: "exact",
      lineupsDerived: true,
      source: "nba_cdn",
      provenance: { playByPlay: "nba_cdn", boxScore: "stats_nba" },
      status: "lineups_available",
    },
    possessionData: {
      officialAggregates: {
        status: "available",
        source: "stats_nba",
        home: 1,
        away: 1,
        definition: "provider_reported",
      },
      reconstructedSequences: {
        status: "available",
        home: 1,
        away: 1,
        possessionCount: overrides.possessions.length,
        definition: "reconstructed_from_pbp",
      },
    },
    officialPossessions: { home: 1, away: 1 },
    derivedPossessions: { home: 1, away: 1 },
    possessionDelta: { home: 0, away: 0 },
    officialPossessionComparison: "matched",
    possessionCalibrationGrade: "exact",
    ...overrides,
  };
}

function testRootCauseReproduction() {
  // Exact pre-fix fallback that rendered "161" in the Offense column.
  assert.equal(legacyBrokenAbbreviationFallback("1610612738"), "161");
  assert.equal(isInvalidPublicTeamAbbreviation("161"), true);
  assert.equal(isInvalidPublicTeamAbbreviation("BOS"), false);

  // ESPN shell id "2" (BOS) / "18" (NYK) vs NBA possession ids — must resolve via crosswalk.
  const ctx = buildPossessionTeamContext({
    homeTeamId: "2",
    awayTeamId: "18",
    homeAbbreviation: "BOS",
    awayAbbreviation: "NYK",
    observedTeamIds: ["1610612738", "1610612752"],
  });
  assert.ok(ctx);
  assert.equal(ctx!.home.abbreviation, "BOS");
  assert.equal(ctx!.away.abbreviation, "NYK");
  assert.equal(ctx!.home.nbaTeamId, "1610612738");
  assert.equal(ctx!.away.nbaTeamId, "1610612752");

  const events = [
    event({
      actionNumber: 1,
      actionType: "2pt",
      period: 1,
      clockSeconds: 600,
      teamId: "1610612738",
      scoreHome: 2,
      scoreAway: 0,
      description: "BOS make",
    }),
    event({
      actionNumber: 2,
      actionType: "2pt",
      period: 1,
      clockSeconds: 580,
      teamId: "1610612752",
      scoreHome: 2,
      scoreAway: 2,
      description: "NYK make",
    }),
  ];
  const possessions = [
    possession({
      possessionId: "a",
      period: 1,
      startActionNumber: 1,
      endActionNumber: 1,
      offenseTeamId: "1610612738",
      defenseTeamId: "1610612752",
      eventActionNumbers: [1],
      points: 2,
    }),
    possession({
      possessionId: "b",
      period: 1,
      startActionNumber: 2,
      endActionNumber: 2,
      offenseTeamId: "1610612752",
      defenseTeamId: "1610612738",
      eventActionNumbers: [2],
      points: 2,
    }),
  ];

  const model = buildPossessionExplorerModel(
    availableResult({ events, possessions }),
    {
      homeTeamId: "2",
      awayTeamId: "18",
      homeAbbreviation: "BOS",
      awayAbbreviation: "NYK",
    }
  );
  assert.equal(model.status, "available");
  if (model.status !== "available") return;
  assert.equal(model.rows[0]!.offenseTeamAbbreviation, "BOS");
  assert.equal(model.rows[1]!.offenseTeamAbbreviation, "NYK");
  assert.ok(
    model.rows.every((r) => r.offenseTeamAbbreviation !== "161")
  );
  assert.ok(
    model.rows.every((r) => !/^\d+$/.test(r.offenseTeamAbbreviation))
  );
}

function testPeriodAndLabels() {
  assert.equal(periodLabel(1), "Q1");
  assert.equal(periodLabel(5), "OT");
  assert.equal(periodLabel(6), "2OT");
  assert.equal(endReasonLabel("made_fg"), "Made shot");
  assert.equal(resultGroupLabel("made_shot"), "Made shot");
  assert.equal(endReasonLabel("made_fg"), resultGroupLabel("made_shot"));
  for (const option of RESULT_FILTER_OPTIONS) {
    if (option.value === "all") continue;
    assert.equal(option.label, resultGroupLabel(option.value));
  }
  assert.equal(endReasonLabel("weird"), "Other");
  assert.equal(resultGroupForEndReason("made_ft"), "free_throws");
}

function testScoreOrdering() {
  const events = [
    event({
      actionNumber: 1,
      actionType: "2pt",
      period: 1,
      clockSeconds: 500,
      teamId: "1610612738",
      scoreHome: 9,
      scoreAway: 2,
    }),
    event({
      actionNumber: 2,
      actionType: "2pt",
      period: 1,
      clockSeconds: 480,
      teamId: "1610612752",
      scoreHome: 9,
      scoreAway: 5,
    }),
  ];
  const possessions = [
    possession({
      possessionId: "home-poss",
      period: 1,
      startActionNumber: 1,
      endActionNumber: 1,
      offenseTeamId: "1610612738",
      eventActionNumbers: [1],
    }),
    possession({
      possessionId: "away-poss",
      period: 1,
      startActionNumber: 2,
      endActionNumber: 2,
      offenseTeamId: "1610612752",
      eventActionNumbers: [2],
    }),
  ];
  const model = buildPossessionExplorerModel(
    availableResult({ events, possessions }),
    {
      homeTeamId: "2",
      awayTeamId: "18",
      homeAbbreviation: "BOS",
      awayAbbreviation: "NYK",
    }
  );
  assert.equal(model.status, "available");
  if (model.status !== "available") return;
  // Away–home order preserved regardless of which team is on offense.
  assert.deepEqual(model.rows[0]!.scoreAfter, { home: 9, away: 2 });
  assert.deepEqual(model.rows[1]!.scoreAfter, { home: 9, away: 5 });
}

function testFiltersPagingAndCopy() {
  const events: DrblEvent[] = [];
  const possessions: DrblPossession[] = [];
  for (let i = 0; i < 30; i++) {
    const offense = i % 2 === 0 ? "1610612738" : "1610612752";
    const action = i + 1;
    events.push(
      event({
        actionNumber: action,
        actionType: "2pt",
        period: i < 20 ? 1 : 5,
        clockSeconds: 600 - i,
        teamId: offense,
        scoreHome: i,
        scoreAway: 0,
      })
    );
    possessions.push(
      possession({
        possessionId: `p-${i}`,
        period: i < 20 ? 1 : 5,
        startActionNumber: action,
        endActionNumber: action,
        offenseTeamId: offense,
        endReason: i % 5 === 0 ? "turnover" : "made_fg",
        eventActionNumbers: [action],
      })
    );
  }
  const model = buildPossessionExplorerModel(
    availableResult({ events, possessions }),
    {
      homeTeamId: "2",
      awayTeamId: "18",
      homeAbbreviation: "BOS",
      awayAbbreviation: "NYK",
    }
  );
  assert.equal(model.status, "available");
  if (model.status !== "available") return;

  const home = filterPossessionRows(model.rows, {
    period: "all",
    offense: "home",
    result: "all",
  });
  assert.ok(home.every((r) => r.offenseSide === "home"));
  assert.ok(home.every((r) => r.offenseTeamAbbreviation === "BOS"));

  const made = filterPossessionRows(model.rows, {
    period: "all",
    offense: "both",
    result: "made_shot",
  });
  assert.ok(made.every((r) => r.endReasonLabel === "Made shot"));

  assert.equal(resetVisibleCount(), POSSESSION_EXPLORER_PAGE_SIZE);
  assert.equal(nextVisibleCount(25, 30), 30);
  assert.match(
    visibleShowingLabel(25, 74, 200),
    /Showing 25 of 74 matches · 200 reconstructed possessions/
  );
}

function testQualityAndUnavailable() {
  const events = [
    event({
      actionNumber: 1,
      actionType: "2pt",
      period: 1,
      clockSeconds: 500,
      scoreHome: 2,
      scoreAway: 0,
    }),
    event({
      actionNumber: 2,
      actionType: "2pt",
      period: 1,
      clockSeconds: 480,
      teamId: "1610612752",
      scoreHome: 2,
      scoreAway: 2,
    }),
  ];
  const possessions = [
    possession({
      possessionId: "h",
      period: 1,
      startActionNumber: 1,
      endActionNumber: 1,
      offenseTeamId: "1610612738",
      eventActionNumbers: [1],
    }),
    possession({
      possessionId: "a",
      period: 1,
      startActionNumber: 2,
      endActionNumber: 2,
      offenseTeamId: "1610612752",
      eventActionNumbers: [2],
    }),
  ];
  const mismatched = buildPossessionExplorerModel(
    availableResult({
      events,
      possessions,
      officialPossessionComparison: "mismatched",
      capability: {
        rawPbpAvailable: true,
        rawEventCount: 2,
        scoreTimelineAvailable: true,
        possessionsDerived: true,
        reconstructedPossessionsAvailable: true,
        officialPossessionTotalsAvailable: true,
        possessionCalibrationGrade: "outside_tolerance",
        lineupsDerived: false,
        source: "nba_cdn",
        provenance: { playByPlay: "nba_cdn", boxScore: "stats_nba" },
        status: "possessions_available",
      },
    }),
    {
      homeTeamId: "2",
      awayTeamId: "18",
      homeAbbreviation: "BOS",
      awayAbbreviation: "NYK",
    }
  );
  assert.equal(mismatched.status, "available");
  if (mismatched.status === "available") {
    assert.ok(mismatched.quality.notices.some((n) => n.kind === "mismatch"));
    assert.ok(
      mismatched.quality.notices.some((n) => n.kind === "lineup_unavailable")
    );
    assert.equal(mismatched.quality.lineupContextAvailable, false);
  }

  const broken = buildPossessionExplorerModel(
    availableResult({
      events: [events[0]!],
      possessions: [
        possession({
          possessionId: "orphan",
          period: 1,
          startActionNumber: 1,
          endActionNumber: 1,
          offenseTeamId: "1610612738",
          eventActionNumbers: [1],
        }),
      ],
    }),
    {
      // Only one side resolves → unavailable rather than `161` labels.
      homeTeamId: "2",
      awayTeamId: "999999",
      homeAbbreviation: "BOS",
      awayAbbreviation: "161",
    }
  );
  assert.equal(broken.status, "unavailable");
  if (broken.status === "unavailable") {
    assert.equal(broken.reason, "identity_unresolved");
    assert.match(broken.userMessage, /could not be resolved/i);
    assert.equal(broken.secondaryMessage, POSSESSION_EXPLORER_SECONDARY_MESSAGE);
  }

  for (const reason of [
    "pbp_fetch_failed",
    "pbp_empty",
    "normalization_failed",
    "validation_failed",
  ] as const) {
    const unavailable = buildPossessionExplorerModel(
      {
        status: "unavailable",
        gameId: "TEST",
        reason,
        message: "internal",
        capability: {
          rawPbpAvailable: false,
          rawEventCount: 0,
          scoreTimelineAvailable: false,
          possessionsDerived: false,
          reconstructedPossessionsAvailable: false,
          officialPossessionTotalsAvailable: false,
          possessionCalibrationGrade: "not_comparable",
          lineupsDerived: false,
          source: null,
          provenance: null,
          status: "unavailable",
        },
      } satisfies GamePossessionResult,
      { homeTeamId: "2", awayTeamId: "18" }
    );
    assert.equal(unavailable.status, "unavailable");
  }
}

async function testFixtureIdentityRegression() {
  clearGamePossessionCache();

  for (const gameId of FULL_GAME_FIXTURES) {
    const result = await getGamePossessions(gameId, {
      loaders: fixtureLoaders(gameId),
      bypassCache: true,
    });
    assert.equal(result.status, "available", gameId);
    if (result.status !== "available") continue;

    const box = boxTeamHints(gameId);
    const shell = espnShellForNbaBox(gameId);

    // Critical path: ESPN shell ids + NBA possession ids (the screenshot bug).
    const model = buildPossessionExplorerModel(result, shell);
    assert.equal(model.status, "available", `${gameId} identity must resolve`);
    if (model.status !== "available") continue;

    assert.ok(model.teams.home.abbreviation);
    assert.ok(model.teams.away.abbreviation);
    assert.equal(
      model.teams.home.abbreviation.toUpperCase(),
      box.homeAbbreviation.toUpperCase(),
      `${gameId} home abbr`
    );
    assert.equal(
      model.teams.away.abbreviation.toUpperCase(),
      box.awayAbbreviation.toUpperCase(),
      `${gameId} away abbr`
    );

    for (const row of model.rows) {
      assert.notEqual(row.offenseTeamAbbreviation, "161");
      assert.doesNotMatch(row.offenseTeamAbbreviation, /^\d+$/);
      assert.ok(
        row.offenseTeamAbbreviation === model.teams.home.abbreviation ||
          row.offenseTeamAbbreviation === model.teams.away.abbreviation
      );
      assert.equal(
        row.endReasonLabel,
        resultGroupLabel(row.resultGroup),
        "filter/table vocabulary must match"
      );
    }

    const sides = new Set(model.rows.map((r) => r.offenseSide));
    assert.ok(sides.has("home") && sides.has("away"), `${gameId} both sides`);

    const homeOnly = filterPossessionRows(model.rows, {
      period: "all",
      offense: "home",
      result: "all",
    });
    assert.ok(homeOnly.every((r) => r.offenseSide === "home"));
    assert.ok(
      homeOnly.every(
        (r) => r.offenseTeamAbbreviation === model.teams.home.abbreviation
      )
    );

    if (gameId === "0021500001") {
      assert.equal(model.quality.officialComparison, "mismatched");
      assert.equal(model.quality.suppressAggregateMetrics, true);
      assert.equal(model.quality.lineupContextAvailable, false);
      assert.equal(model.provenance.playByPlayLabel, "NBA Stats");
    }
    if (gameId === "0021900001") {
      assert.ok(model.periodOptions.some((p) => p > 4));
    }
  }
}

function testSourceInspection() {
  assert.equal(provenanceSourceLabel("nba_cdn"), "NBA CDN");
  assert.equal(
    stablePossessionRowId({
      possessionId: "",
      gameId: "G1",
      period: 3,
      startActionNumber: 9,
      endActionNumber: 12,
      offenseTeamId: "T1",
    }),
    "G1-p3-a9-e12-T1"
  );

  const client = readFileSync(
    path.join(process.cwd(), "src/components/games/possession-explorer.tsx"),
    "utf8"
  );
  assert.doesNotMatch(client, /getGamePossessions/);
  assert.doesNotMatch(client, /slice\(0,\s*3\)/);
  assert.match(client, /Plays ⌄|Hide ⌃/);
  assert.match(client, /POSS/);
  assert.match(client, /NYK|awayAbbr.*score\.away|awayAbbr\} \{score\.away/);
  assert.match(client, /aria-expanded/);
  assert.match(client, /aria-live=\"polite\"/);

  const adapter = readFileSync(
    path.join(process.cwd(), "src/lib/possession-explorer/adapter.ts"),
    "utf8"
  );
  assert.doesNotMatch(adapter, /slice\(0,\s*3\)/);
  assert.match(adapter, /Made shot/);

  const identity = readFileSync(
    path.join(process.cwd(), "src/lib/possession-explorer/team-identity.ts"),
    "utf8"
  );
  assert.match(identity, /161/);
  assert.match(identity, /resolveCanonicalTeam/);
}

async function main() {
  testRootCauseReproduction();
  testPeriodAndLabels();
  testScoreOrdering();
  testFiltersPagingAndCopy();
  testQualityAndUnavailable();
  await testFixtureIdentityRegression();
  testSourceInspection();
  console.log("test-possession-explorer: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
