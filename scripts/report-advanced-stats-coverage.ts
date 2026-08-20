/**
 * Advanced stats source coverage + BDL season_averages advanced probe.
 * Diagnostic only - does not expose metrics to users.
 *
 * Run: npm run report:advanced-stats-coverage
 */
import { getAdvancedStatsCoverage } from "../src/data/queries/advanced-stats-audit";
import { probeSeasonAveragesAdvanced } from "../src/data/providers/advanced-stats/season-averages-probe";

async function main() {
  const probe = await probeSeasonAveragesAdvanced({
    // Smallest useful probe: recent + historical start of advanced era.
    seasonStartYears: [2024, 1996],
    playerIds: [246],
    perPage: 5,
  });

  const report = await getAdvancedStatsCoverage({
    observations: [],
    bdlLiveAccess:
      probe.access === "unauthorized"
        ? "unauthorized"
        : probe.access === "valid_response" ||
            probe.access === "valid_response_zero_rows"
          ? "ok"
          : "untested",
    seasonAveragesProbe: {
      access: probe.access,
      endpoint: probe.endpoint,
      seasonsProbed: probe.seasons.map((s) => s.seasonStartYear),
      admittedObservationCount: probe.admittedObservationCount,
      ratingSemantics: probe.semantics.ratingSemantics,
      identityLimitation: probe.identity.limitation,
    },
  });

  console.log("=== Advanced stats source audit ===");
  console.log(`Generated: ${report.generatedAt}`);
  console.log(`Audit methodology: v${report.methodologyVersion}`);
  console.log(`productionReady: ${report.productionReady ? "YES" : "NO"}`);
  console.log(`gate: ${report.readiness.gate}`);
  console.log("");

  console.log("--- Access ---");
  console.log(`  season_averages_advanced = ${probe.access}`);
  console.log(`  endpoint = ${probe.endpoint}`);
  for (const s of probe.seasons) {
    console.log(
      `  season ${s.canonicalSeason}: http=${s.httpStatus ?? "-"} access=${s.access} rows=${s.rowCount}`
    );
  }
  console.log("");

  console.log("--- Semantics ---");
  console.log(`  ratingSemantics = ${probe.semantics.ratingSemantics}`);
  console.log(`  rowGrain = ${probe.semantics.rowGrain}`);
  console.log(
    `  multiTeamRepresentation = ${probe.semantics.multiTeamRepresentation}`
  );
  for (const note of probe.semantics.notes.slice(0, 4)) {
    console.log(`  - ${note}`);
  }
  console.log("");

  console.log("--- Identity ---");
  console.log(
    `  payloadIds = ${probe.identity.deterministicExternalIdsOnBdlPlayerPayload.join(", ")}`
  );
  console.log(`  limitation = ${probe.identity.limitation}`);
  console.log(
    `  fixture resolved/unresolved = ${probe.identity.fixtureResolvedCount}/${probe.identity.fixtureUnresolvedCount}`
  );
  console.log("");

  console.log("--- Coverage ---");
  console.log(
    `  admitted rows from probe normalize = ${probe.admittedObservationCount}`
  );
  console.log(
    `  report admitted observations = ${report.totalObservations}`
  );
  console.log("");

  console.log("--- Readiness ---");
  console.log(`  gate = ${report.readiness.gate}`);
  console.log(`  access = ${report.readiness.access}`);
  console.log(`  semantics = ${report.readiness.semantics}`);
  console.log(`  identity = ${report.readiness.identity}`);
  console.log(`  coverage = ${report.readiness.coverage}`);
  for (const reason of report.readiness.reasons.slice(0, 12)) {
    console.log(`  - ${reason}`);
  }
  console.log("");

  console.log("--- Notes ---");
  for (const note of [...probe.notes, ...report.notes].slice(0, 12)) {
    console.log(`- ${note}`);
  }

  console.log("");
  console.log(
    JSON.stringify(
      {
        productionReady: report.productionReady,
        gate: report.readiness.gate,
        access: probe.access,
        semantics: probe.semantics.ratingSemantics,
        identity: "unresolved / fixture-only",
        admittedObservationCount: probe.admittedObservationCount,
        requiredMetricsReady: report.readiness.requiredMetricsReady,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
