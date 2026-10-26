/**
 * Slim ESPN transaction archive.
 *
 * JSON is copied to public/runtime for Workers Static Assets — do not
 * static-import (≈3.7 MiB inlined into the origin script).
 *
 * Row: [id, date, season, teamId, teamAbbr, description, type, source, sourceUrl, espnYear]
 */
import type { CanonicalTransaction } from "@/data/types/transaction-lineage";
import type { TransactionArchiveBundle } from "@/data/providers/transactions/transaction-archive-store";

import { loadRuntimeJson } from "./load-runtime-json";

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

type Loaded = {
  data: SnapshotFile;
  rows: SlimRow[];
  cached: CanonicalTransaction[] | null;
};

let loaded: Loaded | null = null;
let loadPromise: Promise<Loaded> | null = null;

function toCanonical(row: SlimRow, data: SnapshotFile): CanonicalTransaction {
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

async function ensureLoaded(): Promise<Loaded> {
  if (loaded) return loaded;
  if (!loadPromise) {
    loadPromise = (async () => {
      const data =
        (await loadRuntimeJson<SnapshotFile>("transactions-snapshot.json")) ??
        {};
      const rows = Array.isArray(data.events) ? data.events : [];
      loaded = { data, rows, cached: null };
      return loaded;
    })();
  }
  return loadPromise;
}

export async function getBundledTransactionRows(): Promise<
  CanonicalTransaction[]
> {
  const state = await ensureLoaded();
  if (state.cached) return state.cached;
  state.cached = state.rows.map((row) => toCanonical(row, state.data));
  return state.cached;
}

export async function getBundledTransactionArchive(): Promise<TransactionArchiveBundle | null> {
  const state = await ensureLoaded();
  const transactions = await getBundledTransactionRows();
  if (!transactions.length) return null;
  return {
    manifest: {
      source: state.data.source ?? "espn-site-v2-transactions",
      datasetVersion: state.data.datasetVersion ?? "bundled-v1",
      methodologyNote:
        "Bundled ESPN free-text transaction archive for Cloudflare Workers.",
      builtAt: state.data.generatedAt ?? new Date().toISOString(),
      espnCalendarYears: [],
      transactionCount: transactions.length,
      ownershipEdgeCount: 0,
      earliestDate: state.data.earliestDate ?? null,
      latestDate: state.data.latestDate ?? null,
      contentHash: state.data.contentHash ?? "",
      limitations: ["Bundled snapshot. No ownership edges on edge runtime."],
    },
    transactions,
    ownershipEdges: [],
    validationIssueCounts: {},
  };
}

export async function bundledTransactionsMeta() {
  const state = await ensureLoaded();
  return {
    version: state.data.version ?? 0,
    generatedAt: state.data.generatedAt ?? null,
    count: state.rows.length,
    earliestDate: state.data.earliestDate ?? null,
    latestDate: state.data.latestDate ?? null,
  };
}
