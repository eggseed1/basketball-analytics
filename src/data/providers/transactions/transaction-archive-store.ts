/**
 * On-disk transaction archive (repeatable rebuild target).
 *
 * Layout:
 *   data/transactions/espn-site-v2/v1/manifest.json
 *   data/transactions/espn-site-v2/v1/raw/{year}.json
 *   data/transactions/espn-site-v2/v1/transactions.jsonl
 *   data/transactions/espn-site-v2/v1/ownership-edges.jsonl
 *   data/transactions/espn-site-v2/v1/validation-summary.json
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  CanonicalTransaction,
  OwnershipEdge,
} from "@/data/types/transaction-lineage";
import {
  ESPN_TRANSACTIONS_DATASET_VERSION,
  ESPN_TRANSACTIONS_SOURCE,
} from "@/data/providers/transactions/espn-transactions-client";
import type { EspnTransactionsYearDump } from "@/data/providers/transactions/espn-transactions-types";

export const TRANSACTION_ARCHIVE_RELATIVE = path.join(
  "data",
  "transactions",
  "espn-site-v2",
  "v1"
);

export type TransactionArchiveManifest = {
  source: string;
  datasetVersion: string;
  methodologyNote: string;
  builtAt: string;
  espnCalendarYears: number[];
  transactionCount: number;
  ownershipEdgeCount: number;
  earliestDate: string | null;
  latestDate: string | null;
  contentHash: string;
  limitations: string[];
};

export type TransactionArchiveBundle = {
  manifest: TransactionArchiveManifest | null;
  transactions: CanonicalTransaction[];
  ownershipEdges: OwnershipEdge[];
  validationIssueCounts: Record<string, number>;
};

function archiveRoot(cwd = process.cwd()): string {
  return path.join(cwd, TRANSACTION_ARCHIVE_RELATIVE);
}

export async function ensureTransactionArchiveDirs(
  cwd = process.cwd()
): Promise<string> {
  const root = archiveRoot(cwd);
  await mkdir(path.join(root, "raw"), { recursive: true });
  return root;
}

export async function writeEspnYearRawDump(
  dump: EspnTransactionsYearDump,
  cwd = process.cwd()
): Promise<string> {
  const root = await ensureTransactionArchiveDirs(cwd);
  const file = path.join(root, "raw", `${dump.espnCalendarYear}.json`);
  await writeFile(file, JSON.stringify(dump, null, 2), "utf8");
  return file;
}

export async function writeTransactionArchive(
  options: {
    transactions: CanonicalTransaction[];
    ownershipEdges: OwnershipEdge[];
    espnCalendarYears: number[];
    validationIssueCounts: Record<string, number>;
    builtAt?: string;
  },
  cwd = process.cwd()
): Promise<TransactionArchiveManifest> {
  const root = await ensureTransactionArchiveDirs(cwd);
  const builtAt = options.builtAt ?? new Date().toISOString();
  const sorted = [...options.transactions].sort((a, b) =>
    a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
  );
  const dates = sorted.map((t) => t.date);
  const payload = sorted.map((t) => JSON.stringify(t)).join("\n") + (sorted.length ? "\n" : "");
  const edgesPayload =
    options.ownershipEdges.map((e) => JSON.stringify(e)).join("\n") +
    (options.ownershipEdges.length ? "\n" : "");

  const contentHash = createHash("sha1")
    .update(payload)
    .update("\n---\n")
    .update(edgesPayload)
    .digest("hex");

  const manifest: TransactionArchiveManifest = {
    source: ESPN_TRANSACTIONS_SOURCE,
    datasetVersion: ESPN_TRANSACTIONS_DATASET_VERSION,
    methodologyNote:
      "ESPN free-text transaction blurbs only. No structured player/pick assets or ownership edges.",
    builtAt,
    espnCalendarYears: [...options.espnCalendarYears].sort((a, b) => a - b),
    transactionCount: sorted.length,
    ownershipEdgeCount: options.ownershipEdges.length,
    earliestDate: dates[0] ?? null,
    latestDate: dates[dates.length - 1] ?? null,
    contentHash,
    limitations: [
      "Source rows are team-centric free-text descriptions (date + team + description).",
      "No athlete ids — player identity remains unresolved; no player assets emitted.",
      "No structured draft-pick identity, protections, swaps, or ownership edges.",
      "Multi-team trades are NOT merged into a single graph transaction.",
      "Transaction type is a documented keyword classification of the description.",
      "ESPN calendar-year coverage begins in 2000; earlier years return empty.",
      "Franchise Lab / simulation logs are never admitted.",
    ],
  };

  await writeFile(path.join(root, "transactions.jsonl"), payload, "utf8");
  await writeFile(path.join(root, "ownership-edges.jsonl"), edgesPayload, "utf8");
  await writeFile(
    path.join(root, "validation-summary.json"),
    JSON.stringify(
      {
        builtAt,
        issueCounts: options.validationIssueCounts,
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    path.join(root, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );
  return manifest;
}

function parseJsonl<T>(text: string): T[] {
  const out: T[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    out.push(JSON.parse(trimmed) as T);
  }
  return out;
}

export async function loadTransactionArchive(
  cwd = process.cwd()
): Promise<TransactionArchiveBundle> {
  const root = archiveRoot(cwd);
  try {
    const manifest = JSON.parse(
      await readFile(path.join(root, "manifest.json"), "utf8")
    ) as TransactionArchiveManifest;
    const transactions = parseJsonl<CanonicalTransaction>(
      await readFile(path.join(root, "transactions.jsonl"), "utf8")
    );
    let ownershipEdges: OwnershipEdge[] = [];
    try {
      ownershipEdges = parseJsonl<OwnershipEdge>(
        await readFile(path.join(root, "ownership-edges.jsonl"), "utf8")
      );
    } catch {
      ownershipEdges = [];
    }
    let validationIssueCounts: Record<string, number> = {};
    try {
      const summary = JSON.parse(
        await readFile(path.join(root, "validation-summary.json"), "utf8")
      ) as { issueCounts?: Record<string, number> };
      validationIssueCounts = summary.issueCounts ?? {};
    } catch {
      validationIssueCounts = {};
    }
    return {
      manifest,
      transactions,
      ownershipEdges,
      validationIssueCounts,
    };
  } catch {
    return {
      manifest: null,
      transactions: [],
      ownershipEdges: [],
      validationIssueCounts: {},
    };
  }
}

export async function listRawEspnYearFiles(
  cwd = process.cwd()
): Promise<number[]> {
  const rawDir = path.join(archiveRoot(cwd), "raw");
  try {
    const names = await readdir(rawDir);
    return names
      .map((n) => /^(\d{4})\.json$/.exec(n)?.[1])
      .filter((y): y is string => !!y)
      .map(Number)
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

export async function readEspnYearRawDump(
  year: number,
  cwd = process.cwd()
): Promise<EspnTransactionsYearDump | null> {
  try {
    const text = await readFile(
      path.join(archiveRoot(cwd), "raw", `${year}.json`),
      "utf8"
    );
    return JSON.parse(text) as EspnTransactionsYearDump;
  } catch {
    return null;
  }
}
