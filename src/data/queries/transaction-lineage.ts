/**
 * Query layer for historical transaction / asset lineage.
 * Production returns empty / truncated results until an archive is ingested.
 */

import {
  buildTransactionLineageCoverageReport,
  buildTransactionLineageIndex,
  clearTransactionLineageIndexCache,
  traceAssetBackward,
  traceAssetForward,
  type BuildTransactionLineageIndexOptions,
} from "@/data/providers/transactions/transaction-lineage-index";
import type {
  CanonicalAsset,
  CanonicalTransaction,
  LineagePath,
  OwnershipEdge,
  TransactionLineageCoverageReport,
} from "@/data/types/transaction-lineage";

export type {
  CanonicalAsset,
  CanonicalTransaction,
  LineagePath,
  OwnershipEdge,
  TransactionLineageCoverageReport,
};

export { clearTransactionLineageIndexCache };

export type TransactionLineageQueryOptions = BuildTransactionLineageIndexOptions;

export async function getTransactionLineageCoverage(
  options: TransactionLineageQueryOptions = {}
): Promise<TransactionLineageCoverageReport> {
  const index = await buildTransactionLineageIndex({
    ...options,
    force: options.force ?? true,
  });
  return buildTransactionLineageCoverageReport(index);
}

export async function listCanonicalTransactions(
  options: TransactionLineageQueryOptions = {}
): Promise<CanonicalTransaction[]> {
  const index = await buildTransactionLineageIndex(options);
  return [...index.transactions].sort((a, b) =>
    b.date.localeCompare(a.date)
  );
}

export async function getCanonicalAsset(
  assetId: string,
  options: TransactionLineageQueryOptions = {}
): Promise<CanonicalAsset | null> {
  const index = await buildTransactionLineageIndex(options);
  return index.assets.get(assetId) ?? null;
}

export async function getAssetOwnershipHistory(
  assetId: string,
  options: TransactionLineageQueryOptions = {}
): Promise<OwnershipEdge[]> {
  const index = await buildTransactionLineageIndex(options);
  return [...(index.edgesByAsset.get(assetId) ?? [])];
}

export async function traceAssetLineageBackward(
  assetId: string,
  options: TransactionLineageQueryOptions & { maxDepth?: number } = {}
): Promise<LineagePath> {
  const index = await buildTransactionLineageIndex(options);
  return traceAssetBackward(index, assetId, { maxDepth: options.maxDepth });
}

export async function traceAssetLineageForward(
  assetId: string,
  options: TransactionLineageQueryOptions & { maxDepth?: number } = {}
): Promise<LineagePath> {
  const index = await buildTransactionLineageIndex(options);
  return traceAssetForward(index, assetId, { maxDepth: options.maxDepth });
}

/**
 * Player acquisition lineage - blocked until a REAL transaction archive exists.
 * Never invents a draft/trade story from free-text Player.draftInfo.
 */
export async function getPlayerAcquisitionLineage(
  playerId: string,
  options: TransactionLineageQueryOptions = {}
): Promise<{
  playerId: string;
  path: LineagePath | null;
  unavailableReason: string | null;
}> {
  const index = await buildTransactionLineageIndex(options);
  const asset = [...index.assets.values()].find(
    (a) => a.type === "player" && a.playerId === playerId
  );
  if (!asset) {
    return {
      playerId,
      path: null,
      unavailableReason:
        "Historical lineage unavailable - no canonical player-asset / transaction archive for this player.",
    };
  }
  return {
    playerId,
    path: traceAssetBackward(index, asset.id),
    unavailableReason: null,
  };
}

/** Honest gate for future UI. */
export async function isTransactionGenealogyUiReady(
  options: TransactionLineageQueryOptions = {}
): Promise<boolean> {
  const report = await getTransactionLineageCoverage(options);
  return report.genealogyUiReady;
}
