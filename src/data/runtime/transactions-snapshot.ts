/**
 * Bundled slim ESPN transaction archive for Cloudflare Workers (no node:fs).
 * Disk jsonl remains the provenance source locally; CF reads this snapshot.
 *
 * Row: [id, date, season, teamId, teamAbbr, description, type, source, sourceUrl, espnYear]
 */
import snapshot from "./transactions-snapshot.json";
import type { CanonicalTransaction } from "@/data/types/transaction-lineage";
import type { TransactionArchiveBundle } from "@/data/providers/transactions/transaction-archive-store";

type SlimRow = [
  string,
  string,
  string,
  string,
  string | null,
  string,
  string,
  string | null,
  string | null,
  number | null,
];

type SnapshotFile = {
  version?: number;
  generatedAt?: string;
  source?: string;
  datasetVersion?: string;
  contentHash?: string;
  earliestDate?: string | null;
  latestDate?: string | null;
  events?: SlimRow[];
};

const data = snapshot as unknown as SnapshotFile;
const rows = Array.isArray(data.events) ? data.events : [];

function toCanonical(row: SlimRow): CanonicalTransaction {
  const [
    id,
    date,
    season,
    teamId,
    teamAbbr,
    description,
    type,
    source,
    sourceUrl,
    espnCalendarYear,
  ] = row;
  return {
    id,
    date,
    season,
    type: (type || "other") as CanonicalTransaction["type"],
    status: "real",
    parties: [
      {
        teamId,
        ...(teamAbbr ? { teamAbbr } : {}),
      },
    ],
    teamIds: [teamId],
    assets: [],
    description,
    source: source ?? data.source ?? "espn-site-v2-transactions",
    sourceUrl: sourceUrl ?? undefined,
    sourceVersion: data.datasetVersion ?? undefined,
    methodologyVersion: "bundled-transactions-v1",
    provenance: {
      source: source ?? data.source ?? "espn-site-v2-transactions",
      datasetVersion: data.datasetVersion ?? "bundled-v1",
      ingestedAt: data.generatedAt ?? new Date(0).toISOString(),
      ...(espnCalendarYear != null ? { espnCalendarYear } : {}),
    },
  };
}

let cached: CanonicalTransaction[] | null = null;

export function getBundledTransactionRows(): CanonicalTransaction[] {
  if (cached) return cached;
  cached = rows.map(toCanonical);
  return cached;
}

export function getBundledTransactionArchive(): TransactionArchiveBundle | null {
  const transactions = getBundledTransactionRows();
  if (!transactions.length) return null;
  return {
    manifest: {
      source: data.source ?? "espn-site-v2-transactions",
      datasetVersion: data.datasetVersion ?? "bundled-v1",
      methodologyNote:
        "Bundled ESPN free-text transaction archive for Cloudflare Workers.",
      builtAt: data.generatedAt ?? new Date().toISOString(),
      espnCalendarYears: [],
      transactionCount: transactions.length,
      ownershipEdgeCount: 0,
      earliestDate: data.earliestDate ?? null,
      latestDate: data.latestDate ?? null,
      contentHash: data.contentHash ?? "",
      limitations: ["Bundled snapshot — no ownership edges on edge runtime."],
    },
    transactions,
    ownershipEdges: [],
    validationIssueCounts: {},
  };
}

export function bundledTransactionsMeta() {
  return {
    version: data.version ?? 0,
    generatedAt: data.generatedAt ?? null,
    count: rows.length,
    earliestDate: data.earliestDate ?? null,
    latestDate: data.latestDate ?? null,
  };
}
