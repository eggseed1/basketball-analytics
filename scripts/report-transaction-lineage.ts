/**
 * Coverage diagnostic for transaction / asset lineage.
 * Run: npx tsx scripts/report-transaction-lineage.ts
 */
import { getTransactionLineageCoverage } from "../src/data/queries/transaction-lineage";

async function main() {
  const report = await getTransactionLineageCoverage({ force: true });
  console.log("=== Transaction / asset lineage coverage ===");
  console.log(`Generated: ${report.generatedAt}`);
  console.log(`Methodology: v${report.methodologyVersion}`);
  console.log(`Genealogy UI ready: ${report.genealogyUiReady ? "YES" : "NO"}`);
  console.log(`Transactions: ${report.transactionCount}`);
  console.log(`Assets: ${report.assetCount}`);
  console.log(`Ownership edges: ${report.ownershipEdgeCount}`);
  console.log(
    `Date range: ${report.earliestDate ?? "—"} → ${report.latestDate ?? "—"}`
  );
  console.log(
    `Season range: ${report.earliestSeason ?? "—"} → ${report.latestSeason ?? "—"}`
  );
  console.log(
    `Draft-pick assets: ${report.draftPickAssetCount} · Player assets: ${report.playerAssetCount}`
  );
  console.log(
    `Unresolved assets: ${report.unresolvedAssetCount} · Broken edges: ${report.brokenEdgeCount} · Dup tx ids: ${report.duplicateTransactionIds}`
  );

  if (report.sources.length) {
    console.log("");
    console.log("Sources:");
    for (const s of report.sources) {
      console.log(
        `- ${s.source} v${s.datasetVersion ?? "?"} · ${s.transactionCount} · ${s.earliestDate} → ${s.latestDate}`
      );
    }
  }

  console.log("");
  console.log("Player identity:", report.playerIdentity);
  console.log("Team identity:", report.teamIdentity);
  console.log("Draft coverage:", report.draftCoverage);
  console.log("Pick coverage:", report.pickCoverage);
  console.log("Graph quality:", report.graphQuality);
  console.log("Readiness failures:", report.readiness.failures);
  console.log("Validation issues:", report.validationIssueCounts);

  console.log("");
  console.log("By type:", report.transactionsByType);

  console.log("");
  console.log("Notes:");
  for (const note of report.notes) console.log(`- ${note}`);
  if (report.missingRequirements.length) {
    console.log("");
    console.log("Missing requirements:");
    for (const req of report.missingRequirements) console.log(`- ${req}`);
  }

  // Machine-readable companion for CI / notebooks
  console.log("");
  console.log("--- JSON ---");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
