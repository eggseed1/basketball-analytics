/**
 * Repeatable ESPN transaction archive rebuild.
 *
 * Fetches calendar-year blurbs from ESPN site.api, normalizes to
 * CanonicalTransaction (no invented player/pick assets), writes:
 *   data/transactions/espn-site-v2/v1/
 *
 * Usage:
 *   npx tsx scripts/ingest-espn-transactions.ts
 *   npx tsx scripts/ingest-espn-transactions.ts --from 2024 --to 2026
 *   npx tsx scripts/ingest-espn-transactions.ts --from-raw  # rebuild canonical from raw only
 */
import {
  ESPN_TRANSACTIONS_EARLIEST_YEAR,
  espnTransactionsLatestCalendarYear,
  fetchEspnTransactionsCalendarYear,
} from "../src/data/providers/transactions/espn-transactions-client";
import {
  listRawEspnYearFiles,
  readEspnYearRawDump,
  writeEspnYearRawDump,
  writeTransactionArchive,
} from "../src/data/providers/transactions/transaction-archive-store";
import { validateCanonicalTransactionArchive } from "../src/data/providers/transactions/transaction-validation";
import { normalizeEspnTransactionRow } from "../src/data/transformers/espn-transactions";
import type { CanonicalTransaction } from "../src/data/types/transaction-lineage";
import { clearTransactionLineageIndexCache } from "../src/data/providers/transactions/transaction-lineage-index";

function parseArgs(argv: string[]) {
  let from = ESPN_TRANSACTIONS_EARLIEST_YEAR;
  let to = espnTransactionsLatestCalendarYear();
  let fromRaw = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--from") from = Number(argv[++i]);
    else if (a === "--to") to = Number(argv[++i]);
    else if (a === "--from-raw") fromRaw = true;
  }
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) {
    throw new Error(`Invalid year range ${from}-${to}`);
  }
  return { from, to, fromRaw };
}

async function main() {
  const { from, to, fromRaw } = parseArgs(process.argv.slice(2));
  const ingestedAt = new Date().toISOString();
  const years: number[] = [];
  const normalizeIssues: Record<string, number> = {};

  if (!fromRaw) {
    for (let year = from; year <= to; year++) {
      process.stdout.write(`Fetching ESPN transactions ${year}… `);
      const dump = await fetchEspnTransactionsCalendarYear(year, {
        delayMs: 120,
      });
      await writeEspnYearRawDump(dump);
      years.push(year);
      console.log(`apiCount=${dump.apiCount} rows=${dump.rows.length}`);
    }
  } else {
    const available = await listRawEspnYearFiles();
    const selected = available.filter((y) => y >= from && y <= to);
    if (!selected.length) {
      throw new Error(
        `No raw dumps in range ${from}-${to}. Run without --from-raw first.`
      );
    }
    years.push(...selected);
    console.log(`Rebuilding from raw years: ${selected.join(", ")}`);
  }

  const transactions: CanonicalTransaction[] = [];
  for (const year of years) {
    const dump = await readEspnYearRawDump(year);
    if (!dump) {
      console.warn(`Missing raw dump for ${year}, skipping`);
      continue;
    }
    for (const row of dump.rows) {
      const { transaction, issues } = normalizeEspnTransactionRow(row, {
        espnCalendarYear: year,
        ingestedAt,
      });
      for (const issue of issues) {
        normalizeIssues[issue] = (normalizeIssues[issue] ?? 0) + 1;
      }
      if (transaction) transactions.push(transaction);
    }
  }

  const validated = validateCanonicalTransactionArchive(transactions, []);
  for (const [k, v] of Object.entries(validated.issueCounts)) {
    normalizeIssues[k] = (normalizeIssues[k] ?? 0) + v;
  }

  const manifest = await writeTransactionArchive({
    transactions: validated.acceptedTransactions,
    ownershipEdges: validated.acceptedOwnershipEdges,
    espnCalendarYears: years,
    validationIssueCounts: normalizeIssues,
    builtAt: ingestedAt,
  });

  clearTransactionLineageIndexCache();

  console.log("");
  console.log("=== ESPN transaction ingest complete ===");
  console.log(`Source: ${manifest.source} v${manifest.datasetVersion}`);
  console.log(`Years: ${manifest.espnCalendarYears[0]}-${manifest.espnCalendarYears.at(-1)}`);
  console.log(`Transactions: ${manifest.transactionCount}`);
  console.log(`Ownership edges: ${manifest.ownershipEdgeCount}`);
  console.log(`Date range: ${manifest.earliestDate} → ${manifest.latestDate}`);
  console.log(`Content hash: ${manifest.contentHash}`);
  console.log("Issue counts:", normalizeIssues);
  console.log("");
  console.log(
    "genealogyUiReady remains false until structured assets + ownership edges exist."
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
