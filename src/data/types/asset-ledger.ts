/**
 * Versioned asset ledger — structured trades, contracts, draft picks, TPEs.
 *
 * Distinct from ESPN free-text archive. Only verified structured rows are admitted.
 * See docs/trade-builder-architecture.md and data/asset-ledger/README.md.
 */

import type {
  CanonicalTransaction,
  OwnershipEdge,
} from "@/data/types/transaction-lineage";
import type {
  DraftAsset,
  FrontOfficeCapabilities,
  PlayerContract,
  PlayerContractYear,
} from "@/data/types/front-office";
import type {
  TeamDraftPickAsset,
  TeamTradeExceptionAsset,
} from "@/data/types/team-assets";

export const ASSET_LEDGER_METHODOLOGY_VERSION = "1.0";

export type AssetLedgerManifest = {
  methodologyVersion: string;
  datasetVersion: string;
  builtAt: string;
  season: string;
  sourceHash: string;
  structuredTransactionCount: number;
  ownershipEdgeCount: number;
  contractCount: number;
  draftPickCount: number;
  tradeExceptionCount: number;
  capabilities: FrontOfficeCapabilities;
  limitations: string[];
  provenance: string[];
};

export type AssetLedgerBundle = {
  manifest: AssetLedgerManifest;
  structuredTransactions: CanonicalTransaction[];
  ownershipEdges: OwnershipEdge[];
  contracts: PlayerContract[];
  contractYears: PlayerContractYear[];
  draftPicks: DraftAsset[];
  tradeExceptions: TeamTradeExceptionAsset[];
  /** Denormalized pick rows for team-assets UI. */
  teamDraftPickAssets: TeamDraftPickAsset[];
};

export type AssetLedgerLoadOptions = {
  cwd?: string;
  /** Prefer bundled runtime snapshot (Cloudflare). */
  preferBundled?: boolean;
};
