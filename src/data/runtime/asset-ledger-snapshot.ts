/**
 * Bundle asset ledger for Cloudflare Workers (no node:fs).
 */
import snapshot from "./asset-ledger-snapshot.json";
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

const file = snapshot as unknown as SnapshotFile;

export function getBundledAssetLedger(): AssetLedgerBundle | null {
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
