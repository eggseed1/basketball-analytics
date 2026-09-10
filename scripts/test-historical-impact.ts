/**
 * Deterministic season-true historical impact checks (fixture-only).
 * Run: npx tsx scripts/test-historical-impact.ts
 *
 * These fixtures are synthetic TEST data — not real RAPTOR/DARKO archives.
 */
import assert from "node:assert/strict";

import {
  buildCoverageReport,
  buildHistoricalImpactIndex,
  queryHistoricalImpact,
} from "../src/data/providers/impact/historical-impact-index";
import {
  isCanonicalImpactSeason,
  normalizeImpactSeason,
  impactObservationKey,
} from "../src/data/providers/impact/historical-impact-normalize";
import {
  HISTORICAL_IMPACT_METHODOLOGY_VERSION,
  type HistoricalPlayerImpact,
} from "../src/data/types/historical-impact";
import {
  getPlayerCareerImpact,
  getPlayerHistoricalImpact,
} from "../src/data/queries/historical-impact";

const importedAt = "2026-01-01T00:00:00.000Z";

function fixture(
  partial: Partial<HistoricalPlayerImpact> &
    Pick<
      HistoricalPlayerImpact,
      "playerName" | "season" | "metric" | "value" | "source"
    >
): HistoricalPlayerImpact {
  return {
    playerId: partial.playerId ?? null,
    nbaPlayerId: partial.nbaPlayerId,
    playerName: partial.playerName,
    season: partial.season,
    metric: partial.metric,
    value: partial.value,
    source: partial.source,
    methodologyVersion:
      partial.methodologyVersion ?? HISTORICAL_IMPACT_METHODOLOGY_VERSION,
    sourceVersion: partial.sourceVersion ?? "test-fixture",
    identityMatch: partial.identityMatch ?? "nba_id",
    provenance: partial.provenance ?? {
      dataset: "test-fixture",
      importedAt,
      notes: "Synthetic test observation — not production impact data.",
    },
  };
}

const FIXTURES: HistoricalPlayerImpact[] = [
  fixture({
    playerId: "espn-1",
    nbaPlayerId: "1001",
    playerName: "Alpha Player",
    season: "2023-24",
    metric: "raptor",
    value: 4.2,
    source: "raptor",
    identityMatch: "alias",
  }),
  fixture({
    playerId: "espn-1",
    nbaPlayerId: "1001",
    playerName: "Alpha Player",
    season: "2023-24",
    metric: "oraptor",
    value: 3.1,
    source: "raptor",
    identityMatch: "alias",
  }),
  fixture({
    playerId: "espn-1",
    nbaPlayerId: "1001",
    playerName: "Alpha Player",
    season: "2024-25",
    metric: "raptor",
    value: 5.0,
    source: "raptor",
    identityMatch: "alias",
  }),
  fixture({
    playerId: "espn-1",
    nbaPlayerId: "1001",
    playerName: "Alpha Player",
    season: "2024-25",
    metric: "darko_dpm",
    value: 2.5,
    source: "darko",
    identityMatch: "alias",
    sourceVersion: "live-snapshot:2024-25",
  }),
  fixture({
    playerId: null,
    nbaPlayerId: "2002",
    playerName: "Beta Player",
    season: "2024-25",
    metric: "raptor",
    value: 1.1,
    source: "raptor",
    identityMatch: "nba_id",
  }),
];

async function main() {
  // --- Season normalization ---
  assert.equal(isCanonicalImpactSeason("2024-25"), true);
  assert.equal(isCanonicalImpactSeason("2024"), false);
  assert.equal(normalizeImpactSeason("2024"), "2024-25");
  assert.equal(normalizeImpactSeason("nope"), null);
  assert.equal(normalizeImpactSeason("1999-00"), "1999-00");
  assert.equal(isCanonicalImpactSeason("1999-00"), true);

  // --- Valid player-season lookup ---
  {
    const rows = await getPlayerHistoricalImpact("espn-1", "2023-24", {
      fixtures: FIXTURES,
    });
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.season === "2023-24"));
    assert.ok(rows.some((r) => r.metric === "raptor"));
    assert.ok(rows.some((r) => r.metric === "oraptor"));
  }

  // --- Missing season stays missing ---
  {
    const rows = await getPlayerHistoricalImpact("espn-1", "2020-21", {
      fixtures: FIXTURES,
    });
    assert.equal(rows.length, 0);
  }

  // --- Unknown player ---
  {
    const rows = await getPlayerHistoricalImpact("unknown-espn", "2024-25", {
      fixtures: FIXTURES,
    });
    assert.equal(rows.length, 0);
  }

  // --- Multiple metrics preserved separately (no averaging) ---
  {
    const rows = await getPlayerHistoricalImpact("espn-1", "2024-25", {
      fixtures: FIXTURES,
    });
    const raptor = rows.find((r) => r.metric === "raptor");
    const darko = rows.find((r) => r.metric === "darko_dpm");
    assert.ok(raptor);
    assert.ok(darko);
    assert.equal(raptor!.value, 5.0);
    assert.equal(darko!.value, 2.5);
    assert.notEqual(raptor!.source, darko!.source);
  }

  // --- Career series with gap ---
  {
    const career = await getPlayerCareerImpact("espn-1", {
      fixtures: FIXTURES,
    });
    const seasons = [...new Set(career.map((r) => r.season))].sort();
    assert.deepEqual(seasons, ["2023-24", "2024-25"]);
    assert.ok(!seasons.includes("2022-23"));
  }

  // --- Lookup by NBA id when ESPN id unknown ---
  {
    const index = await buildHistoricalImpactIndex({ fixtures: FIXTURES });
    const rows = queryHistoricalImpact(index, {
      nbaPlayerId: "2002",
      season: "2024-25",
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.playerName, "Beta Player");
  }

  // --- Duplicate observations skipped ---
  {
    const dup = [
      ...FIXTURES,
      fixture({
        playerId: "espn-1",
        nbaPlayerId: "1001",
        playerName: "Alpha Player",
        season: "2023-24",
        metric: "raptor",
        value: 99,
        source: "raptor",
        identityMatch: "alias",
      }),
    ];
    const index = await buildHistoricalImpactIndex({ fixtures: dup });
    assert.equal(index.duplicateKeyCount, 1);
    const rows = queryHistoricalImpact(index, {
      playerId: "espn-1",
      season: "2023-24",
      metric: "raptor",
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.value, 4.2);
  }

  // --- Provenance preserved ---
  {
    const rows = await getPlayerHistoricalImpact("espn-1", "2023-24", {
      fixtures: FIXTURES,
      metric: "raptor",
    });
    assert.equal(rows[0]!.provenance.dataset, "test-fixture");
    assert.equal(
      rows[0]!.methodologyVersion,
      HISTORICAL_IMPACT_METHODOLOGY_VERSION
    );
    assert.ok(rows[0]!.sourceVersion);
  }

  // --- Unsupported / invalid season rejected ---
  {
    assert.equal(normalizeImpactSeason(""), null);
    const bad = fixture({
      playerName: "X",
      season: "not-a-season",
      metric: "raptor",
      value: 1,
      source: "raptor",
    });
    const index = await buildHistoricalImpactIndex({ fixtures: [bad] });
    assert.equal(index.observations.length, 0);
  }

  // --- Invalid values rejected ---
  {
    const bad = fixture({
      playerId: "espn-9",
      playerName: "Bad",
      season: "2024-25",
      metric: "raptor",
      value: Number.NaN,
      source: "raptor",
    });
    const index = await buildHistoricalImpactIndex({ fixtures: [bad] });
    assert.equal(index.observations.length, 0);
    assert.ok(index.invalidValueCount >= 1);
  }

  // --- Observation key stability ---
  {
    const a = impactObservationKey({
      playerId: "espn-1",
      nbaPlayerId: "1001",
      playerName: "Alpha Player",
      season: "2023-24",
      metric: "raptor",
      source: "raptor",
    });
    const b = impactObservationKey({
      playerId: "espn-1",
      nbaPlayerId: "1001",
      playerName: "Alpha Player",
      season: "2023-24",
      metric: "raptor",
      source: "raptor",
    });
    assert.equal(a, b);
  }

  // --- Coverage report ---
  {
    const index = await buildHistoricalImpactIndex({ fixtures: FIXTURES });
    const report = buildCoverageReport(index);
    assert.equal(
      report.methodologyVersion,
      HISTORICAL_IMPACT_METHODOLOGY_VERSION
    );
    assert.ok(report.totalObservations >= 5);
    assert.ok(report.byMetric.some((m) => m.metric === "raptor"));
    assert.ok(report.seasonsRepresented.includes("2023-24"));
  }

  console.log("historical-impact checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
