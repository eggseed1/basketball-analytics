/**
 * Focused advanced-stats source audit tests (fixture-only; no UI exposure).
 * Run: npm run test:advanced-stats-audit
 */
import assert from "node:assert/strict";

import {
  admitAdvancedObservations,
} from "../src/data/providers/advanced-stats/admit";
import {
  buildAdvancedMetricCoverage,
  buildAdvancedStatsCoverageReport,
} from "../src/data/providers/advanced-stats/coverage";
import {
  buildBdlIdentityIndex,
  loadBdlIdentityFixture,
  resolveBdlIdentityByName,
  resolveBdlPlayerIdentity,
} from "../src/data/providers/advanced-stats/identity";
import {
  advancedObservationKey,
  isCanonicalAdvancedSeason,
  normalizeAdvancedSeason,
  provenanceIsComplete,
} from "../src/data/providers/advanced-stats/normalize";
import { normalizeBdlSeasonAveragesAdvanced } from "../src/data/providers/advanced-stats/normalize-bdl-season-averages";
import { inspectSeasonAverageRows } from "../src/data/providers/advanced-stats/quality";
import {
  ADVANCED_STATS_READINESS_CRITERIA,
  evaluateAdvancedStatsReadiness,
} from "../src/data/providers/advanced-stats/readiness";
import { probeSeasonAveragesAdvanced } from "../src/data/providers/advanced-stats/season-averages-probe";
import {
  assessBdlSeasonAveragesAdvancedSemantics,
} from "../src/data/providers/advanced-stats/semantics";
import {
  ADVANCED_STATS_AUDIT_METHODOLOGY_VERSION,
  type AdvancedSeasonObservation,
} from "../src/data/types/advanced-season-stats";
import type { BdlSeasonAverageRow } from "../src/data/providers/balldontlie/client";

const importedAt = "2026-08-16T00:00:00.000Z";

function obs(
  partial: Partial<AdvancedSeasonObservation> &
    Pick<
      AdvancedSeasonObservation,
      "playerName" | "season" | "metric" | "value" | "source"
    >
): AdvancedSeasonObservation {
  return {
    playerId: "playerId" in partial ? (partial.playerId ?? null) : "espn-1",
    nbaPlayerId:
      "nbaPlayerId" in partial ? partial.nbaPlayerId : "203999",
    bdlPlayerId:
      "bdlPlayerId" in partial ? partial.bdlPlayerId : "246",
    playerName: partial.playerName,
    season: partial.season,
    metric: partial.metric,
    value: partial.value,
    source: partial.source,
    grain: partial.grain ?? "player_season",
    semantics: partial.semantics ?? "individual",
    seasonType: partial.seasonType ?? "regular",
    methodologyVersion:
      partial.methodologyVersion ?? ADVANCED_STATS_AUDIT_METHODOLOGY_VERSION,
    sourceVersion: partial.sourceVersion ?? "test-fixture",
    identityMatch: partial.identityMatch ?? "alias",
    provenance: partial.provenance ?? {
      dataset: "test-fixture",
      importedAt,
      retrieval: "fixture",
      notes: "Synthetic — not production advanced stats.",
    },
  };
}

function seasonSeries(
  start: number,
  count: number,
  metric: AdvancedSeasonObservation["metric"],
  source: AdvancedSeasonObservation["source"],
  extra: Partial<AdvancedSeasonObservation> = {}
): AdvancedSeasonObservation[] {
  const rows: AdvancedSeasonObservation[] = [];
  for (let i = 0; i < count; i++) {
    const y = start + i;
    const end = String((y + 1) % 100).padStart(2, "0");
    rows.push(
      obs({
        playerName: "Test Player",
        season: `${y}-${end}`,
        metric,
        value: 110 + i,
        source,
        ...extra,
      })
    );
  }
  return rows;
}

function sampleSeasonRow(
  overrides: Partial<BdlSeasonAverageRow> = {}
): BdlSeasonAverageRow {
  return {
    player: {
      id: 246,
      first_name: "Nikola",
      last_name: "Jokic",
    },
    season: 2024,
    season_type: "regular",
    stats: {
      offensive_rating: 120.1,
      defensive_rating: 108.2,
      net_rating: 11.9,
      usage_percentage: 0.28,
      true_shooting_percentage: 0.62,
      effective_field_goal_percentage: 0.58,
    },
    ...overrides,
  };
}

async function main() {
  // Season normalization
  assert.equal(normalizeAdvancedSeason("2024"), "2024-25");
  assert.equal(normalizeAdvancedSeason("2024-25"), "2024-25");
  assert.equal(normalizeAdvancedSeason("2024-26"), null);
  assert.equal(isCanonicalAdvancedSeason("1996-97"), true);
  assert.equal(isCanonicalAdvancedSeason("not-a-season"), false);

  // Missing / invalid values rejected
  const invalid = admitAdvancedObservations([
    obs({
      playerName: "Bad",
      season: "2024-25",
      metric: "ortg",
      value: Number.NaN,
      source: "bdl_season_averages_advanced",
    }),
    obs({
      playerName: "BadSeason",
      season: "2024-26",
      metric: "ortg",
      value: 110,
      source: "bdl_season_averages_advanced",
    }),
  ]);
  assert.equal(invalid.observations.length, 0);
  assert.equal(invalid.invalidValueCount, 1);
  assert.equal(invalid.invalidSeasonCount, 1);

  // Duplicates
  const dup = admitAdvancedObservations([
    obs({
      playerName: "Dup",
      season: "2024-25",
      metric: "drtg",
      value: 108,
      source: "bdl_season_averages_advanced",
    }),
    obs({
      playerName: "Dup",
      season: "2024-25",
      metric: "drtg",
      value: 109,
      source: "bdl_season_averages_advanced",
    }),
  ]);
  assert.equal(dup.observations.length, 1);
  assert.equal(dup.duplicateKeyCount, 1);

  // Source/season mismatch keying
  const keyA = advancedObservationKey(
    obs({
      playerName: "A",
      season: "2023-24",
      metric: "net",
      value: 5,
      source: "bdl_season_averages_advanced",
    })
  );
  const keyB = advancedObservationKey(
    obs({
      playerName: "A",
      season: "2024-25",
      metric: "net",
      value: 5,
      source: "bdl_season_averages_advanced",
    })
  );
  assert.notEqual(keyA, keyB);

  // Identity collisions
  const collide = admitAdvancedObservations([
    obs({
      playerId: "espn-1",
      bdlPlayerId: "246",
      playerName: "Same Espn",
      season: "2023-24",
      metric: "ortg",
      value: 110,
      source: "bdl_season_averages_advanced",
    }),
    obs({
      playerId: "espn-1",
      bdlPlayerId: "999",
      playerName: "Same Espn",
      season: "2024-25",
      metric: "ortg",
      value: 111,
      source: "bdl_season_averages_advanced",
    }),
  ]);
  assert.equal(collide.identityCollisionCount, 1);

  // Provenance completeness
  const complete = obs({
    playerName: "Prov",
    season: "2024-25",
    metric: "ortg",
    value: 112,
    source: "bdl_season_averages_advanced",
  });
  assert.equal(provenanceIsComplete(complete), true);
  const incomplete = obs({
    playerId: null,
    nbaPlayerId: undefined,
    bdlPlayerId: undefined,
    playerName: "NoId",
    season: "2024-25",
    metric: "ortg",
    value: 112,
    source: "bdl_season_averages_advanced",
    identityMatch: "unmatched",
  });
  assert.equal(provenanceIsComplete(incomplete), false);

  // Game-grain on-court BDL rows are insufficient
  const gameRows = [
    ...seasonSeries(2010, 6, "ortg", "bdl_game_advanced", {
      grain: "player_game",
      semantics: "on_court_team",
    }),
    ...seasonSeries(2010, 6, "drtg", "bdl_game_advanced", {
      grain: "player_game",
      semantics: "on_court_team",
    }),
    ...seasonSeries(2010, 6, "net", "bdl_game_advanced", {
      grain: "player_game",
      semantics: "on_court_team",
    }),
  ];
  const gameCov = buildAdvancedMetricCoverage(gameRows);
  for (const m of ["ortg", "drtg", "net"] as const) {
    const row = gameCov.find(
      (c) => c.metric === m && c.source === "bdl_game_advanced"
    );
    assert.ok(row);
    assert.equal(row!.status, "insufficient");
  }

  // Empty store → productionReady NO / accessBlocked when unauthorized
  const emptyReport = await buildAdvancedStatsCoverageReport({
    observations: [],
    bdlLiveAccess: "unauthorized",
    seasonAveragesProbe: {
      access: "unauthorized",
      endpoint: "/nba/v1/season_averages/general?type=advanced",
      seasonsProbed: [2024, 1996],
      admittedObservationCount: 0,
      ratingSemantics: "unverified",
      identityLimitation: "No ESPN id on BDL player payload",
    },
    now: importedAt,
  });
  assert.equal(emptyReport.productionReady, false);
  assert.equal(emptyReport.readiness.gate, "accessBlocked");
  assert.ok(
    emptyReport.readiness.reasons.some((r) =>
      /Access remains the sole blocker/i.test(r)
    )
  );

  // Semantics assessment: unverified for season averages ratings
  const sem = assessBdlSeasonAveragesAdvancedSemantics({
    access: "unauthorized",
  });
  assert.equal(sem.rowGrain, "player-season");
  assert.equal(sem.ratingSemantics, "unverified");
  assert.ok(
    sem.table.some((r) =>
      r.field.includes("season_averages") && r.candidateDrblUse === "unverified"
    )
  );

  // Identity fixture
  const fixture = await loadBdlIdentityFixture();
  const index = buildBdlIdentityIndex(fixture);
  const jokic = resolveBdlPlayerIdentity("246", index);
  assert.equal(jokic.status, "resolved");
  if (jokic.status === "resolved") {
    assert.equal(jokic.canonicalPlayerId, "3112335");
  }
  const unresolved = resolveBdlPlayerIdentity("999999001", index);
  assert.equal(unresolved.status, "unresolved");
  const missing = resolveBdlPlayerIdentity("424242", index);
  assert.equal(missing.status, "unresolved");
  const ambiguous = resolveBdlIdentityByName("Chris Smith", fixture);
  assert.equal(ambiguous.status, "ambiguous");
  const nameOnly = resolveBdlIdentityByName("Nikola Jokic", fixture);
  assert.equal(nameOnly.status, "ambiguous"); // unique name still not production key

  // Probe: 401
  const unauthorizedProbe = await probeSeasonAveragesAdvanced({
    seasonStartYears: [2024, 1996],
    fetchPage: async () => ({ status: 401, payload: null, rawText: "Unauthorized" }),
    identityFixture: fixture,
    now: importedAt,
  });
  assert.equal(unauthorizedProbe.access, "unauthorized");
  assert.equal(unauthorizedProbe.admittedObservationCount, 0);
  assert.ok(
    unauthorizedProbe.notes.some((n) =>
      /Access remains the sole blocker/i.test(n)
    )
  );
  for (const s of unauthorizedProbe.seasons) {
    assert.equal(s.access, "unauthorized");
    assert.equal(s.httpStatus, 401);
    assert.equal(s.rowCount, 0);
  }

  // Probe: valid response with player-season row
  const validProbe = await probeSeasonAveragesAdvanced({
    seasonStartYears: [2024],
    fetchPage: async () => ({
      status: 200,
      payload: {
        data: [sampleSeasonRow()],
        meta: { per_page: 5 },
      },
    }),
    identityFixture: fixture,
    now: importedAt,
  });
  assert.equal(validProbe.access, "valid_response");
  assert.equal(validProbe.seasons[0]!.rowCount, 1);
  assert.ok(
    validProbe.seasons[0]!.advancedMetricFields.includes("offensive_rating")
  );
  // Semantics still unverified → ratings not admitted by default
  assert.equal(validProbe.admittedObservationCount, 0);
  assert.equal(validProbe.semantics.ratingSemantics, "unverified");

  // Probe: valid zero rows
  const zeroProbe = await probeSeasonAveragesAdvanced({
    seasonStartYears: [1996],
    fetchPage: async () => ({
      status: 200,
      payload: { data: [], meta: { per_page: 5 } },
    }),
    identityFixture: fixture,
    now: importedAt,
  });
  assert.equal(zeroProbe.access, "valid_response_zero_rows");
  assert.equal(zeroProbe.seasons[0]!.access, "valid_response_zero_rows");

  // Probe: malformed
  const malformed = await probeSeasonAveragesAdvanced({
    seasonStartYears: [2024],
    fetchPage: async () => ({
      status: 200,
      payload: { data: null as unknown as [], meta: {} },
    }),
    identityFixture: fixture,
    now: importedAt,
  });
  assert.equal(malformed.access, "malformed_response");

  // Quality: duplicate / multi-row / null rating / impossible pct
  const quality = inspectSeasonAverageRows([
    sampleSeasonRow(),
    sampleSeasonRow(),
    sampleSeasonRow({
      player: { id: 246, first_name: "Nikola", last_name: "Jokic" },
      team: {
        id: 8,
        full_name: "Denver Nuggets",
        abbreviation: "DEN",
      },
      stats: {
        offensive_rating: null,
        usage_percentage: 9.5,
      },
    }),
  ]);
  assert.ok(quality.issues.some((i) => i.code === "duplicate_player_season"));
  assert.ok(quality.issues.some((i) => i.code === "multi_row_player"));
  assert.ok(quality.issues.some((i) => i.code === "null_rating"));
  assert.ok(quality.issues.some((i) => i.code === "impossible_percentage"));

  // Normalize: missing metric skipped; invalid skipped; semantics block ratings
  const normBlocked = normalizeBdlSeasonAveragesAdvanced(
    [
      sampleSeasonRow({
        stats: {
          offensive_rating: 120,
          defensive_rating: Number.NaN,
          // net_rating missing
          usage_percentage: 0.3,
        },
      }),
    ],
    {
      semantics: assessBdlSeasonAveragesAdvancedSemantics({ access: "ok" }),
      identityFixture: fixture,
      importedAt,
    }
  );
  assert.equal(normBlocked.observations.length, 0);
  assert.ok(normBlocked.skippedBecauseSemantics > 0);

  const normDiag = normalizeBdlSeasonAveragesAdvanced(
    [sampleSeasonRow()],
    {
      semantics: assessBdlSeasonAveragesAdvancedSemantics({ access: "ok" }),
      identityFixture: fixture,
      importedAt,
      admitDespiteUnverifiedSemantics: true,
    }
  );
  assert.ok(normDiag.observations.length >= 3);
  assert.ok(normDiag.observations.every((o) => o.provenance.dataset));
  assert.equal(
    normDiag.observations.find((o) => o.metric === "ortg")?.playerId,
    "3112335"
  );

  // Strong fixture still NO while access/semantics/identity blocked
  const strong = [
    ...seasonSeries(2010, 8, "ortg", "bdl_season_averages_advanced"),
    ...seasonSeries(2010, 8, "drtg", "bdl_season_averages_advanced"),
    ...seasonSeries(2010, 8, "net", "bdl_season_averages_advanced"),
  ];
  const strongReport = await buildAdvancedStatsCoverageReport({
    observations: strong,
    leaguePlayerSeasonDenominator: 8,
    bdlLiveAccess: "unauthorized",
    seasonAveragesProbe: {
      access: "unauthorized",
      endpoint: "/nba/v1/season_averages/general?type=advanced",
      seasonsProbed: [2024, 1996],
      admittedObservationCount: 0,
      ratingSemantics: "unverified",
      identityLimitation: fixture.notes[0] ?? "fixture-only",
    },
    now: importedAt,
  });
  assert.equal(strongReport.productionReady, false);
  assert.equal(strongReport.readiness.gate, "accessBlocked");

  assert.equal(ADVANCED_STATS_READINESS_CRITERIA.minSeasons, 5);
  const readiness = evaluateAdvancedStatsReadiness({
    inventory: strongReport.inventory,
    byMetric: strongReport.byMetric,
    seasonAveragesAccess: "unauthorized",
    ratingSemantics: "unverified",
    identityLimitation: "fixture-only",
  });
  assert.equal(readiness.productionReady, false);
  assert.equal(readiness.gate, "accessBlocked");

  // Name-only identity insufficient
  const nameOnlyCov = buildAdvancedMetricCoverage(
    seasonSeries(2015, 6, "ortg", "bdl_season_averages_advanced", {
      playerId: null,
      nbaPlayerId: undefined,
      bdlPlayerId: undefined,
      identityMatch: "normalized_name",
    })
  ).find((m) => m.metric === "ortg");
  assert.ok(nameOnlyCov);
  assert.equal(nameOnlyCov!.status, "insufficient");

  console.log("test-advanced-stats-audit: ok");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
