/**
 * Deterministic validation for ingested transaction archives.
 * Does not invent missing links - only counts structural problems.
 */

import { ESPN_TEAM_META } from "@/data/providers/nba/team-meta";
import type {
  CanonicalTransaction,
  OwnershipEdge,
} from "@/data/types/transaction-lineage";

export type TransactionValidationReport = {
  issueCounts: Record<string, number>;
  duplicateTransactionIds: number;
  acceptedTransactions: CanonicalTransaction[];
  acceptedOwnershipEdges: OwnershipEdge[];
};

function bump(counts: Record<string, number>, key: string) {
  counts[key] = (counts[key] ?? 0) + 1;
}

export function validateCanonicalTransactionArchive(
  transactions: CanonicalTransaction[],
  ownershipEdges: OwnershipEdge[] = []
): TransactionValidationReport {
  const issueCounts: Record<string, number> = {};
  const seen = new Set<string>();
  const acceptedTransactions: CanonicalTransaction[] = [];
  let duplicateTransactionIds = 0;

  for (const tx of transactions) {
    if (!tx.id) {
      bump(issueCounts, "missing_transaction_id");
      continue;
    }
    if (seen.has(tx.id)) {
      duplicateTransactionIds += 1;
      bump(issueCounts, "duplicate_transaction_id");
      continue;
    }
    seen.add(tx.id);

    if (!tx.date || !/^\d{4}-\d{2}-\d{2}$/.test(tx.date)) {
      bump(issueCounts, "missing_or_malformed_date");
      continue;
    }
    if (!tx.season || !/^\d{4}-\d{2}$/.test(tx.season)) {
      bump(issueCounts, "missing_or_malformed_season");
      continue;
    }
    if (!tx.teamIds?.length) {
      bump(issueCounts, "missing_team");
      continue;
    }
    for (const teamId of tx.teamIds) {
      if (!ESPN_TEAM_META[teamId]) {
        bump(issueCounts, "unknown_team_id");
      }
    }
    if (tx.status !== "real" && tx.status !== "reported") {
      bump(issueCounts, "non_production_status");
    }
    if (!tx.source) {
      bump(issueCounts, "missing_source");
    }
    if (!tx.provenance?.datasetVersion) {
      bump(issueCounts, "missing_provenance_dataset_version");
    }
    // ESPN blurbs intentionally have zero assets - that is not a validation error.
    acceptedTransactions.push(tx);
  }

  const txIds = new Set(acceptedTransactions.map((t) => t.id));
  const assetIds = new Set(
    acceptedTransactions.flatMap((t) => t.assets.map((a) => a.asset.id))
  );
  const acceptedOwnershipEdges: OwnershipEdge[] = [];
  const edgeKeys = new Set<string>();

  for (const edge of ownershipEdges) {
    const key = `${edge.assetId}|${edge.transactionId}|${edge.fromTeamId}|${edge.toTeamId}|${edge.date}`;
    if (edgeKeys.has(key)) {
      bump(issueCounts, "duplicate_ownership_edge");
      continue;
    }
    edgeKeys.add(key);
    if (!txIds.has(edge.transactionId)) {
      bump(issueCounts, "ownership_edge_unknown_transaction");
      continue;
    }
    if (!assetIds.has(edge.assetId)) {
      bump(issueCounts, "ownership_edge_unknown_asset");
      continue;
    }
    if (edge.fromTeamId && edge.toTeamId && edge.fromTeamId === edge.toTeamId) {
      bump(issueCounts, "ownership_edge_same_team");
    }
    acceptedOwnershipEdges.push(edge);
  }

  return {
    issueCounts,
    duplicateTransactionIds,
    acceptedTransactions,
    acceptedOwnershipEdges,
  };
}
