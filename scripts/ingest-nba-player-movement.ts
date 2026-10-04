/**
 * Fill gaps in the ESPN transaction archive with NBA.com player movement.
 *
 *   npx tsx --conditions=react-server scripts/ingest-nba-player-movement.ts [--dry-run]
 *
 * Rebuilds data/transactions/nba-player-movement/v1/transactions.jsonl from
 * scratch each run, keeping only moves no ESPN or curated row covers, so a
 * move ESPN adds later drops out here on the next run. Run after the ESPN
 * ingest. If NBA.com can't be reached the previous file is left as is.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildNbaMovementGapTransactions,
  fetchNbaMovementRows,
  NBA_MOVEMENT_DATASET_VERSION,
  NBA_MOVEMENT_PUBLIC_URL,
  NBA_MOVEMENT_SOURCE,
} from "../src/data/providers/transactions/nba-player-movement";
import {
  CURATED_TRANSACTIONS_RELATIVE,
  NBA_MOVEMENT_TRANSACTIONS_RELATIVE,
  TRANSACTION_ARCHIVE_RELATIVE,
} from "../src/data/providers/transactions/transaction-archive-store";
import type { CanonicalTransaction } from "../src/data/types/transaction-lineage";

async function readJsonl(file: string): Promise<CanonicalTransaction[]> {
  try {
    const text = await readFile(file, "utf8");
    return text
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as CanonicalTransaction);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const cwd = process.cwd();
  const ingestedAt = new Date().toISOString();
  const existing = [
    ...(await readJsonl(path.join(cwd, TRANSACTION_ARCHIVE_RELATIVE, "transactions.jsonl"))),
    ...(await readJsonl(path.join(cwd, CURATED_TRANSACTIONS_RELATIVE))),
  ];
  if (!existing.length) throw new Error("No ESPN archive on disk; run the ESPN ingest first.");

  const rows = await fetchNbaMovementRows();
  const result = buildNbaMovementGapTransactions(rows, existing, { ingestedAt });
  const byYear: Record<string, number> = {};
  for (const tx of result.transactions) byYear[tx.date.slice(0, 4)] = (byYear[tx.date.slice(0, 4)] ?? 0) + 1;
  console.log(
    `nba-player-movement rows=${rows.length} events=${result.groupCount} alreadyCovered=${result.coveredCount} gaps=${result.transactions.length}`
  );
  console.log(`  gaps by year: ${JSON.stringify(byYear)}`);
  if (Object.keys(result.skipped).length) console.log(`  skipped: ${JSON.stringify(result.skipped)}`);
  if (dryRun) {
    for (const tx of result.transactions.slice(-12)) {
      console.log(`  ${tx.date} ${tx.parties[0]?.teamAbbr} ${tx.type}: ${tx.description}`);
    }
    return;
  }

  const file = path.join(cwd, NBA_MOVEMENT_TRANSACTIONS_RELATIVE);
  await mkdir(path.dirname(file), { recursive: true });
  const body = result.transactions.map((tx) => JSON.stringify(tx)).join("\n");
  await writeFile(file, body ? `${body}\n` : "", "utf8");
  const dates = result.transactions.map((tx) => tx.date);
  await writeFile(
    path.join(path.dirname(file), "manifest.json"),
    `${JSON.stringify(
      {
        source: NBA_MOVEMENT_SOURCE,
        datasetVersion: NBA_MOVEMENT_DATASET_VERSION,
        sourceUrl: NBA_MOVEMENT_PUBLIC_URL,
        builtAt: ingestedAt,
        sourceRowCount: rows.length,
        eventCount: result.groupCount,
        alreadyCoveredCount: result.coveredCount,
        transactionCount: result.transactions.length,
        earliestDate: dates[0] ?? null,
        latestDate: dates.at(-1) ?? null,
        note: "NBA.com moves (July 2015 on) that no ESPN or curated row covers. Covered means a row for the same team names one of the players within 7 days (10 for trades), or within 30 days with the same kind of verb.",
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  console.log(`  wrote ${result.transactions.length} rows → ${path.relative(cwd, file)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
