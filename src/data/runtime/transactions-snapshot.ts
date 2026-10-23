/**
 * ESPN transaction archive for Cloudflare Workers.
 * Lives under public/runtime (ASSETS) so the 3.7MB JSON stays off the Worker
 * isolate upload; Node reads the same file from disk.
 *
 * Row: [id, date, season, teamId, teamAbbr, description, type, source, sourceUrl, espnYear]
 */
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

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const ASSET_PATH = "/runtime/transactions-snapshot.json";

type TransactionsMeta = {
  version: number;
  generatedAt: string | null;
  count: number;
  earliestDate: string | null;
  latestDate: string | null;
};

let cachedBundle: TransactionArchiveBundle | null | undefined;
let cachedMeta: TransactionsMeta | null = null;

function cloudflareAssets(): AssetsFetcher | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare") as {
      getCloudflareContext: () => { env?: { ASSETS?: AssetsFetcher } };
    };
    return getCloudflareContext()?.env?.ASSETS ?? null;
  } catch {
    return null;
  }
}

/** Node-only disk read — keep `node:fs` off the webpack graph. */
function loadFromPublicDir(): SnapshotFile | null {
  try {
    if (process.env.NEXT_RUNTIME === "edge") return null;
    // eslint-disable-next-line no-eval
    const req = eval("require") as NodeRequire;
    const fs = req("node:fs") as typeof import("node:fs");
    const path = req("node:path") as typeof import("node:path");
    const file = path.join(
      process.cwd(),
      "public",
      "runtime",
      "transactions-snapshot.json"
    );
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as SnapshotFile;
  } catch {
    return null;
  }
}

async function loadFromAssets(): Promise<SnapshotFile | null> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(`https://assets.local${ASSET_PATH}`);
    if (!response.ok) return null;
    return (await response.json()) as SnapshotFile;
  } catch {
    return null;
  }
}

function toCanonical(
  row: SlimRow,
  data: SnapshotFile
): CanonicalTransaction {
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

function bundleFromFile(data: SnapshotFile): TransactionArchiveBundle | null {
  const rows = Array.isArray(data.events) ? data.events : [];
  if (!rows.length) return null;
  const transactions = rows.map((row) => toCanonical(row, data));
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
      limitations: ["Bundled snapshot. No ownership edges on edge runtime."],
    },
    transactions,
    ownershipEdges: [],
    validationIssueCounts: {},
  };
}

/**
 * Load the transaction archive from ASSETS (CF) or public/runtime (Node).
 */
export async function loadBundledTransactionArchive(): Promise<TransactionArchiveBundle | null> {
  if (cachedBundle !== undefined) return cachedBundle;

  const fromDisk = loadFromPublicDir();
  if (fromDisk) {
    cachedBundle = bundleFromFile(fromDisk);
    cachedMeta = {
      version: fromDisk.version ?? 0,
      generatedAt: fromDisk.generatedAt ?? null,
      count: Array.isArray(fromDisk.events) ? fromDisk.events.length : 0,
      earliestDate: fromDisk.earliestDate ?? null,
      latestDate: fromDisk.latestDate ?? null,
    };
    return cachedBundle;
  }

  const fromAssets = await loadFromAssets();
  if (fromAssets) {
    cachedBundle = bundleFromFile(fromAssets);
    cachedMeta = {
      version: fromAssets.version ?? 0,
      generatedAt: fromAssets.generatedAt ?? null,
      count: Array.isArray(fromAssets.events) ? fromAssets.events.length : 0,
      earliestDate: fromAssets.earliestDate ?? null,
      latestDate: fromAssets.latestDate ?? null,
    };
    return cachedBundle;
  }

  cachedBundle = null;
  return null;
}

/** @deprecated Prefer loadBundledTransactionArchive (ASSETS). Sync only after warm. */
export function getBundledTransactionArchive(): TransactionArchiveBundle | null {
  if (cachedBundle !== undefined) return cachedBundle ?? null;
  const fromDisk = loadFromPublicDir();
  if (fromDisk) {
    cachedBundle = bundleFromFile(fromDisk);
    return cachedBundle;
  }
  return null;
}

export function getBundledTransactionRows(): CanonicalTransaction[] {
  return getBundledTransactionArchive()?.transactions ?? [];
}

export function bundledTransactionsMeta(): TransactionsMeta {
  if (cachedMeta) return cachedMeta;
  const fromDisk = loadFromPublicDir();
  if (fromDisk) {
    return {
      version: fromDisk.version ?? 0,
      generatedAt: fromDisk.generatedAt ?? null,
      count: Array.isArray(fromDisk.events) ? fromDisk.events.length : 0,
      earliestDate: fromDisk.earliestDate ?? null,
      latestDate: fromDisk.latestDate ?? null,
    };
  }
  return {
    version: 0,
    generatedAt: null,
    count: 0,
    earliestDate: null,
    latestDate: null,
  };
}
