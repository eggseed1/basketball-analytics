/**
 * Canonical transaction + asset lineage types.
 *
 * Shared by future real-world Offseason Tracker and historical genealogy.
 * Distinct from Franchise Lab sim trade models (`src/gm`).
 *
 * Methodology v1.0: types + ESPN free-text archive ingest + empty-safe lineage queries.
 * Structured ownership/pick genealogy remains blocked — see docs/transaction-lineage.md.
 */

import type {
  TransactionEvent,
  TransactionStatus,
  TransactionType,
} from "@/offseason";

/** Bump when admission / identity rules for lineage change. */
export const TRANSACTION_LINEAGE_METHODOLOGY_VERSION = "1.0";

export type AssetType =
  | "player"
  | "draft_pick"
  | "draft_rights"
  | "cash"
  | "other";

/**
 * Structured draft-pick identity when the source provides it.
 * Free-text pick strings alone are not sufficient for lineage IDs.
 */
export type DraftPickIdentity = {
  /** Calendar draft year (e.g. 2017). */
  draftYear: number;
  round?: 1 | 2;
  /** Franchise that originally held the pick, when known. */
  originalTeamId?: string;
  /** Owner at the moment this asset snapshot was recorded. */
  currentOwnerTeamId?: string;
  /** Absolute pick number after lottery/order known. */
  pickNumber?: number;
  /** Only set when the source explicitly states protection. */
  protected?: boolean;
  protectionNotes?: string;
  /** Only set when the source explicitly states a swap. */
  swap?: boolean;
  /** True when the pick has been conveyed / used. */
  conveyed?: boolean;
};

/**
 * A transferable unit in the transaction graph.
 * Player assets use the site's canonical playerId (ESPN athlete id on public routes).
 */
export type CanonicalAsset = {
  id: string;
  type: AssetType;
  /** Display label (never used as the sole identity key). */
  label: string;
  playerId?: string;
  playerName?: string;
  draftPick?: DraftPickIdentity;
  /** Optional opaque metadata from the source — not interpreted as lineage. */
  metadata?: Record<string, string | number | boolean | null>;
  methodologyVersion: string;
};

export type TransactionAssetDirection = "incoming" | "outgoing" | "involved";

export type TransactionAssetRef = {
  asset: CanonicalAsset;
  /** Relative to the party.teamId when present. */
  direction: TransactionAssetDirection;
  teamId?: string;
};

/**
 * Provenance for a production transaction / edge.
 * Required for any ingested REAL archive row.
 */
export type TransactionProvenance = {
  source: string;
  sourceRecordId?: string;
  datasetVersion: string;
  ingestedAt: string;
  /** ESPN transactions endpoint uses calendar year, not NBA season. */
  espnCalendarYear?: number;
  /** Controlled-vocab guess when the source has no typed enum. */
  rawTypeGuess?: string;
};

/**
 * Lineage-ready transaction — extends the offseason TransactionEvent contract
 * with explicit multi-team + asset lists when ingest can supply them.
 */
export type CanonicalTransaction = TransactionEvent & {
  /** All team ids in the deal (2+ for multi-team). */
  teamIds: string[];
  assets: TransactionAssetRef[];
  /** Dataset / feed version marker. */
  sourceVersion?: string;
  methodologyVersion: string;
  /** Free-text body when the source is a blurb (e.g. ESPN). */
  description?: string;
  provenance?: TransactionProvenance;
};

/**
 * One ownership / state change for an asset, backed by a transaction.
 */
export type OwnershipEdge = {
  id: string;
  assetId: string;
  fromTeamId: string | null;
  toTeamId: string | null;
  transactionId: string;
  date: string;
  season: string;
  /** Why we believe this edge exists. */
  source: string;
  sourceVersion?: string;
  confidence: "high" | "medium" | "unmatched";
  notes?: string;
};

export type LineageNodeKind = "asset" | "transaction" | "team" | "draft_selection";

export type LineageNode = {
  id: string;
  kind: LineageNodeKind;
  label: string;
  assetId?: string;
  transactionId?: string;
  teamId?: string;
  playerId?: string;
};

export type LineageEdge = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  ownershipEdgeId?: string;
  transactionId?: string;
  label: string;
};

export type LineagePath = {
  assetId: string;
  direction: "backward" | "forward";
  nodes: LineageNode[];
  edges: LineageEdge[];
  /** Present when traversal stopped for a documented reason. */
  truncatedReason: string | null;
  methodologyVersion: string;
};

export type TransactionSourceCoverage = {
  source: string;
  datasetVersion: string | null;
  earliestDate: string | null;
  latestDate: string | null;
  transactionCount: number;
};

export type IdentityResolutionStats = {
  resolved: number;
  unresolved: number;
  ambiguous: number;
};

export type DraftCoverageStats = {
  earliestDraftYear: number | null;
  latestDraftYear: number | null;
  draftSelectionTransactions: number;
  structuredDraftPickAssets: number;
  missingSelectionsNote: string | null;
};

export type PickCoverageStats = {
  structuredPicks: number;
  ownershipEdges: number;
  withProtectionData: number;
  withSwapData: number;
};

export type GraphQualityStats = {
  resolvableLineagePaths: number;
  brokenChains: number;
  missingLinks: number;
  duplicateEdges: number;
  cyclesOrAnomalies: number;
};

export type GenealogyReadinessCriteria = {
  hasRealNonSyntheticArchive: boolean;
  minTransactions: number;
  minOwnershipEdges: number;
  minDraftPickAssets: number;
  minPlayerAssetsWithIds: number;
  maxBrokenEdgeRate: number;
  observed: {
    transactionCount: number;
    ownershipEdgeCount: number;
    draftPickAssetCount: number;
    playerAssetsWithIds: number;
    brokenEdgeRate: number;
  };
  failures: string[];
};

export type TransactionLineageCoverageReport = {
  generatedAt: string;
  methodologyVersion: string;
  transactionCount: number;
  assetCount: number;
  ownershipEdgeCount: number;
  earliestDate: string | null;
  latestDate: string | null;
  earliestSeason: string | null;
  latestSeason: string | null;
  transactionsByType: Partial<Record<TransactionType, number>>;
  transactionsByStatus: Partial<Record<TransactionStatus, number>>;
  draftPickAssetCount: number;
  playerAssetCount: number;
  unresolvedAssetCount: number;
  duplicateTransactionIds: number;
  brokenEdgeCount: number;
  /** True only when a real archive meets conservative readiness criteria. */
  genealogyUiReady: boolean;
  notes: string[];
  missingRequirements: string[];
  sources: TransactionSourceCoverage[];
  playerIdentity: IdentityResolutionStats;
  teamIdentity: IdentityResolutionStats;
  draftCoverage: DraftCoverageStats;
  pickCoverage: PickCoverageStats;
  graphQuality: GraphQualityStats;
  readiness: GenealogyReadinessCriteria;
  validationIssueCounts: Record<string, number>;
};

export type { TransactionEvent, TransactionStatus, TransactionType };
