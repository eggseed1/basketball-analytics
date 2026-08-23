/**
 * Network-free possession calibration + official-aggregate boundary tests.
 * Run: npm run test:possession-calibration
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { statsBoxScoreV3ToCdnShape } from "../drbl/download/stats-boxscore-adapt";
import {
  clearGamePossessionCache,
  getGamePossessions,
} from "../src/data/queries/game-possessions";
import {
  extractOfficialTeamPossessions,
  resolveOfficialPossessionResult,
  compareOfficialDerivedPossessions,
  calibrationGradeFromDeltas,
} from "../src/pbp/official-possessions";
import {
  aggregateCalibrationStats,
  createSeededRng,
  officialIsNotReconstructedCount,
  sampleDeterministic,
} from "../src/pbp/possession-calibration";
import { runPossessionCalibrationAudit } from "./audit-possession-reconstruction";

const FIXTURE_ROOT = path.join(
  process.cwd(),
  "scripts",
  "fixtures",
  "pbp",
  "games"
);

function loadFixture(gameId: string, kind: string): unknown {
  return JSON.parse(
    readFileSync(path.join(FIXTURE_ROOT, gameId, `${kind}.json`), "utf8")
  ) as unknown;
}

function testEnvelopeNormalizationParity() {
  const liveShaped = loadFixture("0021500001", "boxscore-advanced-v3");
  const fromFixture = extractOfficialTeamPossessions(liveShaped);
  assert.deepEqual(fromFixture, { home: 97, away: 99 });

  const available = resolveOfficialPossessionResult({
    advancedRaw: liveShaped,
    source: "fixture",
    attemptedSources: ["fixture"],
  });
  assert.equal(available.status, "available");
  if (available.status === "available") {
    assert.equal(available.definition, "provider_reported");
    assert.equal(available.source, "fixture");
    assert.equal(available.home, 97);
    assert.equal(available.away, 99);
  }

  const missingField = resolveOfficialPossessionResult({
    advancedRaw: {
      boxScoreAdvanced: {
        homeTeam: { statistics: {} },
        awayTeam: { statistics: { possessions: 90 } },
      },
    },
    source: "stats",
    attemptedSources: ["stats_nba"],
  });
  assert.equal(missingField.status, "unavailable");
  if (missingField.status === "unavailable") {
    assert.equal(missingField.reason, "field_missing");
    assert.deepEqual(missingField.attemptedSources, ["stats_nba"]);
  }

  const invalid = resolveOfficialPossessionResult({
    advancedRaw: { meta: {} },
    source: "stats",
    attemptedSources: ["stats_nba"],
  });
  assert.equal(invalid.status, "unavailable");
  if (invalid.status === "unavailable") {
    assert.equal(invalid.reason, "response_invalid");
  }

  const fetchFailed = resolveOfficialPossessionResult({
    advancedRaw: null,
    source: null,
    attemptedSources: ["stats_nba", "disk_cache"],
    fetchReason: "fetch_failed",
  });
  assert.equal(fetchFailed.status, "unavailable");
  if (fetchFailed.status === "unavailable") {
    assert.equal(fetchFailed.reason, "fetch_failed");
    assert.ok(fetchFailed.attemptedSources.includes("stats_nba"));
  }
}

function testCalibrationGrades() {
  assert.equal(
    calibrationGradeFromDeltas({
      official: { home: 100, away: 100 },
      derived: { home: 100, away: 100 },
    }),
    "exact"
  );
  assert.equal(
    calibrationGradeFromDeltas({
      official: { home: 100, away: 100 },
      derived: { home: 101, away: 99 },
    }),
    "within_one"
  );
  assert.equal(
    calibrationGradeFromDeltas({
      official: { home: 100, away: 100 },
      derived: { home: 103, away: 100 },
    }),
    "outside_tolerance"
  );
  assert.equal(
    calibrationGradeFromDeltas({
      official: null,
      derived: { home: 100, away: 100 },
    }),
    "not_comparable"
  );

  const cmp = compareOfficialDerivedPossessions({
    official: { home: 97, away: 99 },
    derived: { home: 95, away: 95 },
  });
  assert.equal(cmp.officialPossessionComparison, "mismatched");
  assert.equal(cmp.possessionCalibrationGrade, "outside_tolerance");
}

function testOfficialVsReconstructedSeparation() {
  assert.ok(
    officialIsNotReconstructedCount(
      {
        status: "available",
        source: "stats_nba",
        home: 100,
        away: 100,
        definition: "provider_reported",
      },
      {
        status: "available",
        home: 100,
        away: 100,
        possessionCount: 200,
        definition: "reconstructed_from_pbp",
      }
    )
  );
}

function testDeterministicSampling() {
  const items = Array.from({ length: 50 }, (_, i) => `g${i}`);
  const a = sampleDeterministic(items, 10, 42);
  const b = sampleDeterministic(items, 10, 42);
  const c = sampleDeterministic(items, 10, 43);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.equal(a.length, 10);

  const rng = createSeededRng(7);
  const first = rng();
  const rng2 = createSeededRng(7);
  assert.equal(rng2(), first);
}

function testCoverageIncludesFailures() {
  const stats = aggregateCalibrationStats([
    {
      gameId: "a",
      season: "2015-16",
      date: null,
      seasonType: "regular",
      periods: 4,
      pbpSource: "stats_nba",
      boxSource: "stats_nba",
      advancedBoxSource: "stats_nba",
      rawEventCount: 400,
      normalizedEventCount: 400,
      reconstructedHome: 95,
      reconstructedAway: 95,
      officialHome: 97,
      officialAway: 99,
      deltaHome: -2,
      deltaAway: -4,
      absDeltaHome: 2,
      absDeltaAway: 4,
      calibrationGrade: "outside_tolerance",
      scoreConservationOk: true,
      lineupValid: false,
      unknownEventCount: 0,
      droppedEventCount: 0,
      unresolvedFreeThrowCount: 0,
      duplicateActionWarnings: 0,
      duplicateOrderWarnings: 0,
      technicalFtCount: 0,
      flagrantFtCount: 0,
      editedEventCount: 0,
      failureReason: null,
      elapsedMs: 10,
      comparable: true,
    },
    {
      gameId: "b",
      season: "2015-16",
      date: null,
      seasonType: "regular",
      periods: null,
      pbpSource: null,
      boxSource: null,
      advancedBoxSource: null,
      rawEventCount: null,
      normalizedEventCount: null,
      reconstructedHome: null,
      reconstructedAway: null,
      officialHome: null,
      officialAway: null,
      deltaHome: null,
      deltaAway: null,
      absDeltaHome: null,
      absDeltaAway: null,
      calibrationGrade: "fetch_failed",
      scoreConservationOk: null,
      lineupValid: null,
      unknownEventCount: null,
      droppedEventCount: null,
      unresolvedFreeThrowCount: null,
      duplicateActionWarnings: null,
      duplicateOrderWarnings: null,
      technicalFtCount: null,
      flagrantFtCount: null,
      editedEventCount: null,
      failureReason: "pbp_fetch_failed",
      elapsedMs: 5,
      comparable: false,
    },
  ]);
  assert.equal(stats.attemptedGames, 2);
  assert.equal(stats.comparableGames, 1);
  assert.equal(stats.successfullyFetched, 1);
  assert.ok((stats.reconstructionFailureRate ?? 0) > 0);
}

async function testHistoricalOfficialFallbackViaFixture() {
  clearGamePossessionCache();
  const gameId = "0021500001";
  const statsBox = loadFixture(gameId, "boxscore-stats-v3");
  const adapted = statsBoxScoreV3ToCdnShape(statsBox);
  assert.ok(adapted);

  const withOfficial = await getGamePossessions(gameId, {
    bypassCache: true,
    loaders: {
      fetchPbp: async () => ({
        raw: loadFixture(gameId, "playbyplay"),
        source: "stats",
      }),
      fetchBox: async () => ({ raw: adapted!, source: "stats" }),
      fetchAdvancedBox: async () => ({
        raw: loadFixture(gameId, "boxscore-advanced-v3"),
        source: "fixture",
      }),
    },
  });
  assert.equal(withOfficial.status, "available");
  if (withOfficial.status === "available") {
    assert.equal(withOfficial.officialPossessionComparison, "mismatched");
    assert.equal(withOfficial.possessionCalibrationGrade, "outside_tolerance");
    assert.equal(
      withOfficial.capability.officialPossessionTotalsAvailable,
      true
    );
    assert.equal(
      withOfficial.capability.reconstructedPossessionsAvailable,
      true
    );
    assert.equal(withOfficial.provenance.advancedBoxScore, "stats_nba");
    assert.equal(withOfficial.possessionData.officialAggregates.status, "available");
    assert.deepEqual(withOfficial.officialPossessions, { home: 97, away: 99 });
    assert.ok(withOfficial.diagnostics);
  }

  const withoutOfficial = await getGamePossessions(gameId, {
    bypassCache: true,
    loaders: {
      fetchPbp: async () => ({
        raw: loadFixture(gameId, "playbyplay"),
        source: "stats",
      }),
      fetchBox: async () => ({ raw: adapted!, source: "stats" }),
      fetchAdvancedBox: async () => null,
    },
  });
  assert.equal(withoutOfficial.status, "available");
  if (withoutOfficial.status === "available") {
    assert.equal(withoutOfficial.officialPossessionComparison, "unavailable");
    assert.equal(
      withoutOfficial.capability.officialPossessionTotalsAvailable,
      false
    );
    assert.equal(
      withoutOfficial.capability.reconstructedPossessionsAvailable,
      true
    );
    assert.equal(
      withoutOfficial.possessionData.officialAggregates.status,
      "unavailable"
    );
    assert.equal(
      withoutOfficial.possessionCalibrationGrade,
      "not_comparable"
    );
  }
}

async function testOfficialAvailableReconstructionUnavailableShape() {
  // Grade helpers must support official-only / reconstruction-only independently.
  const grade = calibrationGradeFromDeltas({
    official: { home: 90, away: 90 },
    derived: { home: 90, away: 90 },
  });
  assert.equal(grade, "exact");
  assert.equal(
    calibrationGradeFromDeltas({
      official: null,
      derived: { home: 1, away: 1 },
    }),
    "not_comparable"
  );
}

async function testFixtureCalibrationSummary() {
  const outDir = path.join(
    process.cwd(),
    "artifacts",
    "pbp-calibration",
    "fixture-run"
  );
  const { rows } = await runPossessionCalibrationAudit([
    "--fixture-only",
    "--out",
    outDir,
  ]);
  assert.ok(rows.length >= 4);
  assert.ok(rows.every((r) => r.gameId));
  const comparable = rows.filter((r) => r.comparable);
  assert.ok(comparable.length >= 3);
  assert.ok(existsSync(path.join(outDir, "latest.json")));
  assert.ok(existsSync(path.join(outDir, "latest.md")));
  assert.ok(existsSync(path.join(outDir, "games.csv")));

  const stats = aggregateCalibrationStats(rows);
  assert.equal(stats.attemptedGames, rows.length);
  assert.ok((stats.officialTotalAvailabilityRate ?? 0) > 0.5);

  const hist = rows.find((r) => r.gameId === "0021500001");
  assert.ok(hist);
  assert.equal(hist!.officialHome, 97);
  assert.equal(hist!.officialAway, 99);
  assert.equal(hist!.comparable, true);
  assert.equal(hist!.calibrationGrade, "outside_tolerance");
}

async function main() {
  testEnvelopeNormalizationParity();
  testCalibrationGrades();
  testOfficialVsReconstructedSeparation();
  testDeterministicSampling();
  testCoverageIncludesFailures();
  await testHistoricalOfficialFallbackViaFixture();
  await testOfficialAvailableReconstructionUnavailableShape();
  await testFixtureCalibrationSummary();
  console.log("test-possession-calibration: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
