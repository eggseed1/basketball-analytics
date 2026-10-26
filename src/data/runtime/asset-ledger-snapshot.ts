/**
 * Bundle asset ledger.
 *
 * JSON is copied to public/runtime for Workers Static Assets — do not
 * static-import (inlines into the origin script).
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

import { loadRuntimeJson } from "./load-runtime-json";

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

type Loaded = {
  file: SnapshotFile;
  bundle: AssetLedgerBundle | null;
};

let loaded: Loaded | null = null;
let loadPromise: Promise<Loaded> | null = null;

async function ensureLoaded(): Promise<Loaded> {
  if (loaded) return loaded;
  if (!loadPromise) {
    loadPromise = (async () => {
      const file =
        (await loadRuntimeJson<SnapshotFile>("asset-ledger-snapshot.json")) ??
        {};
      let bundle: AssetLedgerBundle | null = null;
      if (file?.manifest) {
        const draftPicks = (file.draftPicks ?? []).map(normalizeDraftPick);
        bundle = {
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
      loaded = { file, bundle };
      return loaded;
    })();
  }
  return loadPromise;
}

export async function getBundledAssetLedger(): Promise<AssetLedgerBundle | null> {
  const { bundle } = await ensureLoaded();
  return bundle;
}
