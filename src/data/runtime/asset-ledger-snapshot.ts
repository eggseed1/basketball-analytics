/**
 * Bundle asset ledger for Cloudflare Workers.
 * Lives under public/runtime (ASSETS) so the ~1MB JSON stays off the
 * Worker isolate; Node reads the same file from disk.
 */
import type { AssetLedgerBundle } from "@/data/types/asset-ledger";
import type { TeamDraftPickAsset } from "@/data/types/team-assets";
import type {
  PlayerContract,
  PlayerContractYear,
} from "@/data/types/front-office";
import type {
  CanonicalTransaction,
  OwnershipEdge,
} from "@/data/types/transaction-lineage";
import {
  normalizeDraftPick,
  toTeamDraftPickAssets,
  type DraftPickWire,
} from "@/data/asset-ledger/load-asset-ledger";

type SnapshotFile = {
  version?: number;
  manifest?: AssetLedgerBundle["manifest"];
  structuredTransactions?: CanonicalTransaction[];
  ownershipEdges?: OwnershipEdge[];
  contracts?: PlayerContract[];
  contractYears?: PlayerContractYear[];
  draftPicks?: DraftPickWire[];
  teamDraftPickAssets?: TeamDraftPickAsset[];
};

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const ASSET_PATH = "/runtime/asset-ledger-snapshot.json";

let cached: AssetLedgerBundle | null | undefined;

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
      "asset-ledger-snapshot.json"
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

function toBundle(file: SnapshotFile): AssetLedgerBundle | null {
  if (!file?.manifest) return null;
  const draftPicks = (file.draftPicks ?? []).map(normalizeDraftPick);
  return {
    manifest: file.manifest,
    structuredTransactions: file.structuredTransactions ?? [],
    ownershipEdges: file.ownershipEdges ?? [],
    contracts: file.contracts ?? [],
    contractYears: file.contractYears ?? [],
    draftPicks,
    tradeExceptions: [],
    teamDraftPickAssets:
      file.teamDraftPickAssets ?? toTeamDraftPickAssets(draftPicks),
  };
}

export async function ensureAssetLedger(): Promise<boolean> {
  if (cached !== undefined) return cached != null;
  const fromDisk = loadFromPublicDir();
  const file = fromDisk ?? (await loadFromAssets());
  cached = file ? toBundle(file) : null;
  return cached != null;
}

export async function getBundledAssetLedger(): Promise<AssetLedgerBundle | null> {
  await ensureAssetLedger();
  return cached ?? null;
}

/** Test helper — drop the in-memory ASSETS cache. */
export function clearBundledAssetLedgerCache(): void {
  cached = undefined;
}
