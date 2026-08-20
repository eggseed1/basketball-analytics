/**
 * Coverage diagnostic for season-true historical impact.
 * Run: npx tsx scripts/report-historical-impact.ts
 */
import { getHistoricalImpactCoverage } from "../src/data/queries/historical-impact";

async function main() {
  const report = await getHistoricalImpactCoverage({ force: true });
  console.log("=== Season-true historical impact coverage ===");
  console.log(`Generated: ${report.generatedAt}`);
  console.log(`Methodology: v${report.methodologyVersion}`);
  console.log(`Total observations: ${report.totalObservations}`);
  console.log(
    `Seasons represented: ${report.seasonsRepresented.join(", ") || "(none)"}`
  );
  console.log("");
  for (const m of report.byMetric) {
    console.log(
      `${m.source}/${m.metric}: ${m.observationCount} obs · ${m.playerKeyCount} players · ${m.earliestSeason ?? "-"} → ${m.latestSeason ?? "-"} · unmatched/null ESPN id: ${m.unmatchedIdentityCount}`
    );
  }
  console.log("");
  console.log("Notes:");
  for (const note of report.notes) {
    console.log(`- ${note}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
