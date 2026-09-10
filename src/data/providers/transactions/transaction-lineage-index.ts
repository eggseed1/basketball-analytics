/**
 * Transaction / asset lineage index.
 *
 * Production loads the on-disk ESPN free-text archive when present.
 * Graph traversal is implemented; ownership edges remain empty until a
 * structured trade/pick ledger is ingested.
 * Synthetic fixtures never unlock genealogyUiReady.
 */

import {
  TRANSACTION_LINEAGE_METHODOLOGY_VERSION,
  type CanonicalAsset,
  type CanonicalTransaction,
  type GenealogyReadinessCriteria,
  type LineageEdge,
  type LineageNode,
  type LineagePath,
  type OwnershipEdge,
  type TransactionLineageCoverageReport,
} from "@/data/types/transaction-lineage";
import { loadTransactionArchive } from "@/data/providers/transactions/transaction-archive-store";
import { ESPN_TEAM_META } from "@/data/providers/nba/team-meta";

export type TransactionLineageIndex = {
  builtAt: string;
  transactions: CanonicalTransaction[];
  assets: Map<string, CanonicalAsset>;
  ownershipEdges: OwnershipEdge[];
  edgesByTransaction: Map<string, OwnershipEdge[]>;
  edgesByAsset: Map<string, OwnershipEdge[]>;
  duplicateTransactionIds: number;
  brokenEdgeCount: number;
  notes: string[];
  validationIssueCounts: Record<string, number>;
  /** True when loaded from fixtures (tests only). */
  isSynthetic: boolean;
  archiveSource: string | null;
  archiveDatasetVersion: string | null;
};

export type BuildTransactionLineageIndexOptions = {
  /** Synthetic / test rows. Production callers omit this. */
  fixtures?: {
    transactions?: CanonicalTransaction[];
    ownershipEdges?: OwnershipEdge[];
  };
  force?: boolean;
  now?: string;
  cwd?: string;
};

let memoryIndex: { expiresAt: number; value: TransactionLineageIndex } | null =
  null;
const INDEX_TTL_MS = 1000 * 60 * 30;

const NO_STRUCTURED_LINEAGE_NOTE =
  "ESPN archive is free-text team blurbs only — no ownership edges or structured pick/player assets for genealogy.";

export const MISSING_REQUIREMENTS = [
  "Structured multi-asset trade graph (players + picks) with athlete/pick ids — ESPN blurbs alone are insufficient",
  "Draft results archive (year × round × pick × drafting team × player id)",
  "Owned/future pick ledger with protections/swaps only when source-known",
  "Ownership edges derived from structured transfers (not description parsing)",
  "High-confidence player identity on transaction parties (ESPN athlete ids or mapped aliases)",
];

/** Conservative genealogy UI gate — fixtures can never pass. */
export const GENEALOGY_READINESS_THRESHOLDS = {
  minTransactions: 1_000,
  minOwnershipEdges: 500,
  minDraftPickAssets: 100,
  minPlayerAssetsWithIds: 500,
  maxBrokenEdgeRate: 0.02,
} as const;

function emptyIndex(
  now: string,
  notes: string[],
  extra: Partial<TransactionLineageIndex> = {}
): TransactionLineageIndex {
  return {
    builtAt: now,
    transactions: [],
    assets: new Map(),
    ownershipEdges: [],
    edgesByTransaction: new Map(),
    edgesByAsset: new Map(),
    duplicateTransactionIds: 0,
    brokenEdgeCount: 0,
    notes,
    validationIssueCounts: {},
    isSynthetic: false,
    archiveSource: null,
    archiveDatasetVersion: null,
    ...extra,
  };
}

function indexEdges(
  state: TransactionLineageIndex,
  edges: OwnershipEdge[]
): void {
  const assetIds = new Set(state.assets.keys());
  const txIds = new Set(state.transactions.map((t) => t.id));

  for (const edge of edges) {
    if (!assetIds.has(edge.assetId) || !txIds.has(edge.transactionId)) {
      state.brokenEdgeCount += 1;
      continue;
    }
    state.ownershipEdges.push(edge);
    const byTx = state.edgesByTransaction.get(edge.transactionId) ?? [];
    byTx.push(edge);
    state.edgesByTransaction.set(edge.transactionId, byTx);
    const byAsset = state.edgesByAsset.get(edge.assetId) ?? [];
    byAsset.push(edge);
    state.edgesByAsset.set(edge.assetId, byAsset);
  }

  for (const [assetId, list] of state.edgesByAsset) {
    list.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    state.edgesByAsset.set(assetId, list);
  }
}

function admitTransactions(
  state: TransactionLineageIndex,
  transactions: CanonicalTransaction[]
): void {
  const seenTx = new Set<string>();
  for (const tx of transactions) {
    if (seenTx.has(tx.id)) {
      state.duplicateTransactionIds += 1;
      continue;
    }
    seenTx.add(tx.id);
    state.transactions.push(tx);
    for (const ref of tx.assets) {
      if (!state.assets.has(ref.asset.id)) {
        state.assets.set(ref.asset.id, ref.asset);
      }
    }
  }
}

/**
 * Build the lineage index from disk archive, or fixtures for tests.
 */
export async function buildTransactionLineageIndex(
  options: BuildTransactionLineageIndexOptions = {}
): Promise<TransactionLineageIndex> {
  const now = options.now ?? new Date().toISOString();

  if (
    !options.force &&
    !options.fixtures &&
    memoryIndex &&
    memoryIndex.expiresAt > Date.now()
  ) {
    return memoryIndex.value;
  }

  if (options.fixtures) {
    const state = emptyIndex(
      now,
      ["Built from synthetic/test fixtures — not production historical claims."],
      { isSynthetic: true }
    );
    admitTransactions(state, options.fixtures.transactions ?? []);
    indexEdges(state, options.fixtures.ownershipEdges ?? []);
    return state;
  }

  const archive = await loadTransactionArchive(options.cwd);
  if (!archive.manifest || archive.transactions.length === 0) {
    const state = emptyIndex(now, [
      "No historical transaction archive is ingested in this repository. Genealogy UI must remain blocked.",
      "Run: npm run ingest:espn-transactions",
      "Franchise Lab tradeLog is simulation-only and is not admitted here.",
    ]);
    memoryIndex = { value: state, expiresAt: Date.now() + INDEX_TTL_MS };
    return state;
  }

  const state = emptyIndex(
    now,
    [
      `Loaded archive ${archive.manifest.source} v${archive.manifest.datasetVersion} (${archive.manifest.transactionCount} transactions).`,
      NO_STRUCTURED_LINEAGE_NOTE,
      ...archive.manifest.limitations,
    ],
    {
      isSynthetic: false,
      archiveSource: archive.manifest.source,
      archiveDatasetVersion: archive.manifest.datasetVersion,
      validationIssueCounts: archive.validationIssueCounts,
      duplicateTransactionIds: 0,
    }
  );
  admitTransactions(state, archive.transactions);

  // Merge verified structured ledger (trades with asset ids + ownership edges).
  try {
    const { loadAssetLedger } = await import("@/data/asset-ledger/load-asset-ledger");
    const ledger = await loadAssetLedger({ cwd: options.cwd, preferBundled: true });
    if (ledger && ledger.structuredTransactions.length > 0) {
      admitTransactions(state, ledger.structuredTransactions);
      indexEdges(state, ledger.ownershipEdges);
      state.notes.push(
        `Merged structured asset ledger v${ledger.manifest.datasetVersion} (${ledger.structuredTransactions.length} verified transactions, ${ledger.ownershipEdges.length} ownership edges).`
      );
    }
  } catch {
    /* optional until first sync */
  }

  indexEdges(state, archive.ownershipEdges);
  memoryIndex = { value: state, expiresAt: Date.now() + INDEX_TTL_MS };
  return state;
}

export function clearTransactionLineageIndexCache(): void {
  memoryIndex = null;
}

function nodeFromAsset(asset: CanonicalAsset): LineageNode {
  return {
    id: `asset:${asset.id}`,
    kind: "asset",
    label: asset.label,
    assetId: asset.id,
    playerId: asset.playerId,
  };
}

function nodeFromTransaction(tx: CanonicalTransaction): LineageNode {
  return {
    id: `tx:${tx.id}`,
    kind: "transaction",
    label: `${tx.type} · ${tx.date}`,
    transactionId: tx.id,
  };
}

export function traceAssetBackward(
  state: TransactionLineageIndex,
  assetId: string,
  options: { maxDepth?: number } = {}
): LineagePath {
  const maxDepth = options.maxDepth ?? 32;
  const asset = state.assets.get(assetId);
  if (!asset) {
    return {
      assetId,
      direction: "backward",
      nodes: [],
      edges: [],
      truncatedReason: state.assets.size
        ? "Asset not found in the lineage index."
        : state.transactions.length
          ? "Historical lineage unavailable — archive has no structured assets/ownership edges."
          : "Historical lineage unavailable — no transaction archive ingested.",
      methodologyVersion: TRANSACTION_LINEAGE_METHODOLOGY_VERSION,
    };
  }

  const nodes: LineageNode[] = [nodeFromAsset(asset)];
  const edges: LineageEdge[] = [];
  const chronological = [...(state.edgesByAsset.get(assetId) ?? [])].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
  );

  if (!chronological.length) {
    return {
      assetId,
      direction: "backward",
      nodes,
      edges,
      truncatedReason:
        "Historical lineage unavailable beyond this point — no ownership edges.",
      methodologyVersion: TRANSACTION_LINEAGE_METHODOLOGY_VERSION,
    };
  }

  const steps = [...chronological].reverse().slice(0, maxDepth);
  for (const step of steps) {
    const tx = state.transactions.find((t) => t.id === step.transactionId);
    if (!tx) {
      return {
        assetId,
        direction: "backward",
        nodes,
        edges,
        truncatedReason: "Broken lineage edge — transaction missing.",
        methodologyVersion: TRANSACTION_LINEAGE_METHODOLOGY_VERSION,
      };
    }

    const prevId = nodes[nodes.length - 1]!.id;
    const txNode = nodeFromTransaction(tx);
    nodes.push(txNode);
    edges.push({
      id: `le:${step.id}:back`,
      fromNodeId: prevId,
      toNodeId: txNode.id,
      ownershipEdgeId: step.id,
      transactionId: tx.id,
      label: "via",
    });

    if (step.fromTeamId) {
      const teamNode: LineageNode = {
        id: `team:${step.fromTeamId}:${step.id}`,
        kind: "team",
        label: step.fromTeamId,
        teamId: step.fromTeamId,
      };
      nodes.push(teamNode);
      edges.push({
        id: `le:${step.id}:from`,
        fromNodeId: txNode.id,
        toNodeId: teamNode.id,
        ownershipEdgeId: step.id,
        transactionId: tx.id,
        label: "prior owner",
      });
    } else {
      return {
        assetId,
        direction: "backward",
        nodes,
        edges,
        truncatedReason:
          "Lineage origin reached (asset created / entered league).",
        methodologyVersion: TRANSACTION_LINEAGE_METHODOLOGY_VERSION,
      };
    }
  }

  const exhausted = steps.length >= chronological.length;
  return {
    assetId,
    direction: "backward",
    nodes,
    edges,
    truncatedReason: exhausted
      ? "Historical lineage unavailable beyond this point — chain exhausted."
      : `Stopped at max depth (${maxDepth}).`,
    methodologyVersion: TRANSACTION_LINEAGE_METHODOLOGY_VERSION,
  };
}

export function traceAssetForward(
  state: TransactionLineageIndex,
  assetId: string,
  options: { maxDepth?: number } = {}
): LineagePath {
  const maxDepth = options.maxDepth ?? 32;
  const asset = state.assets.get(assetId);
  if (!asset) {
    return {
      assetId,
      direction: "forward",
      nodes: [],
      edges: [],
      truncatedReason: state.assets.size
        ? "Asset not found in the lineage index."
        : state.transactions.length
          ? "Historical lineage unavailable — archive has no structured assets/ownership edges."
          : "Historical lineage unavailable — no transaction archive ingested.",
      methodologyVersion: TRANSACTION_LINEAGE_METHODOLOGY_VERSION,
    };
  }

  const nodes: LineageNode[] = [nodeFromAsset(asset)];
  const edges: LineageEdge[] = [];
  const chronological = [...(state.edgesByAsset.get(assetId) ?? [])].sort(
    (a, b) => a.date.localeCompare(b.date)
  );

  let depth = 0;
  for (const step of chronological) {
    if (depth >= maxDepth) {
      return {
        assetId,
        direction: "forward",
        nodes,
        edges,
        truncatedReason: `Stopped at max depth (${maxDepth}).`,
        methodologyVersion: TRANSACTION_LINEAGE_METHODOLOGY_VERSION,
      };
    }
    const tx = state.transactions.find((t) => t.id === step.transactionId);
    if (!tx) {
      return {
        assetId,
        direction: "forward",
        nodes,
        edges,
        truncatedReason: "Broken lineage edge — transaction missing.",
        methodologyVersion: TRANSACTION_LINEAGE_METHODOLOGY_VERSION,
      };
    }
    const txNode = nodeFromTransaction(tx);
    nodes.push(txNode);
    edges.push({
      id: `le:${step.id}:fwd`,
      fromNodeId: nodes[nodes.length - 2]!.id,
      toNodeId: txNode.id,
      ownershipEdgeId: step.id,
      transactionId: tx.id,
      label: "via",
    });
    if (step.toTeamId) {
      const teamNode: LineageNode = {
        id: `team:${step.toTeamId}:${step.id}`,
        kind: "team",
        label: step.toTeamId,
        teamId: step.toTeamId,
      };
      nodes.push(teamNode);
      edges.push({
        id: `le:${step.id}:to`,
        fromNodeId: txNode.id,
        toNodeId: teamNode.id,
        ownershipEdgeId: step.id,
        transactionId: tx.id,
        label: "new owner",
      });
    } else {
      return {
        assetId,
        direction: "forward",
        nodes,
        edges,
        truncatedReason:
          "Forward lineage ends — asset consumed / left transferable state.",
        methodologyVersion: TRANSACTION_LINEAGE_METHODOLOGY_VERSION,
      };
    }
    depth += 1;
  }

  return {
    assetId,
    direction: "forward",
    nodes,
    edges,
    truncatedReason: chronological.length
      ? null
      : "No forward ownership edges for this asset.",
    methodologyVersion: TRANSACTION_LINEAGE_METHODOLOGY_VERSION,
  };
}

export function evaluateGenealogyReadiness(
  state: TransactionLineageIndex
): GenealogyReadinessCriteria {
  let playerAssetsWithIds = 0;
  let draftPickAssetCount = 0;
  for (const asset of state.assets.values()) {
    if (asset.type === "player" && asset.playerId) playerAssetsWithIds += 1;
    if (asset.type === "draft_pick") draftPickAssetCount += 1;
  }
  const edgeDenom = Math.max(1, state.ownershipEdges.length + state.brokenEdgeCount);
  const brokenEdgeRate = state.brokenEdgeCount / edgeDenom;

  const failures: string[] = [];
  if (state.isSynthetic) {
    failures.push("Archive is synthetic/test fixtures");
  }
  if (!state.archiveSource && !state.isSynthetic) {
    // empty production
    if (state.transactions.length === 0) {
      failures.push("No real archive loaded");
    }
  }
  if (state.transactions.length < GENEALOGY_READINESS_THRESHOLDS.minTransactions) {
    failures.push(
      `transactions ${state.transactions.length} < ${GENEALOGY_READINESS_THRESHOLDS.minTransactions}`
    );
  }
  if (state.ownershipEdges.length < GENEALOGY_READINESS_THRESHOLDS.minOwnershipEdges) {
    failures.push(
      `ownershipEdges ${state.ownershipEdges.length} < ${GENEALOGY_READINESS_THRESHOLDS.minOwnershipEdges}`
    );
  }
  if (draftPickAssetCount < GENEALOGY_READINESS_THRESHOLDS.minDraftPickAssets) {
    failures.push(
      `draftPickAssets ${draftPickAssetCount} < ${GENEALOGY_READINESS_THRESHOLDS.minDraftPickAssets}`
    );
  }
  if (playerAssetsWithIds < GENEALOGY_READINESS_THRESHOLDS.minPlayerAssetsWithIds) {
    failures.push(
      `playerAssetsWithIds ${playerAssetsWithIds} < ${GENEALOGY_READINESS_THRESHOLDS.minPlayerAssetsWithIds}`
    );
  }
  if (brokenEdgeRate > GENEALOGY_READINESS_THRESHOLDS.maxBrokenEdgeRate) {
    failures.push(
      `brokenEdgeRate ${brokenEdgeRate.toFixed(4)} > ${GENEALOGY_READINESS_THRESHOLDS.maxBrokenEdgeRate}`
    );
  }

  // Free-text ESPN archive can never satisfy structured lineage requirements
  // even when transaction count is high.
  if (
    state.archiveSource === "espn-site-v2-transactions" &&
    state.ownershipEdges.length === 0
  ) {
    if (!failures.some((f) => f.includes("ownershipEdges"))) {
      failures.push("ESPN free-text archive has zero ownership edges");
    }
  }

  return {
    hasRealNonSyntheticArchive: !state.isSynthetic && state.transactions.length > 0,
    minTransactions: GENEALOGY_READINESS_THRESHOLDS.minTransactions,
    minOwnershipEdges: GENEALOGY_READINESS_THRESHOLDS.minOwnershipEdges,
    minDraftPickAssets: GENEALOGY_READINESS_THRESHOLDS.minDraftPickAssets,
    minPlayerAssetsWithIds: GENEALOGY_READINESS_THRESHOLDS.minPlayerAssetsWithIds,
    maxBrokenEdgeRate: GENEALOGY_READINESS_THRESHOLDS.maxBrokenEdgeRate,
    observed: {
      transactionCount: state.transactions.length,
      ownershipEdgeCount: state.ownershipEdges.length,
      draftPickAssetCount,
      playerAssetsWithIds,
      brokenEdgeRate,
    },
    failures,
  };
}

export function buildTransactionLineageCoverageReport(
  state: TransactionLineageIndex
): TransactionLineageCoverageReport {
  const dates = state.transactions.map((t) => t.date).filter(Boolean).sort();
  const seasons = state.transactions
    .map((t) => t.season)
    .filter(Boolean)
    .sort();
  const byType: TransactionLineageCoverageReport["transactionsByType"] = {};
  const byStatus: TransactionLineageCoverageReport["transactionsByStatus"] = {};
  for (const tx of state.transactions) {
    byType[tx.type] = (byType[tx.type] ?? 0) + 1;
    byStatus[tx.status] = (byStatus[tx.status] ?? 0) + 1;
  }

  let draftPickAssetCount = 0;
  let playerAssetCount = 0;
  let unresolvedAssetCount = 0;
  let playerResolved = 0;
  let withProtection = 0;
  let withSwap = 0;
  for (const asset of state.assets.values()) {
    if (asset.type === "draft_pick") {
      draftPickAssetCount += 1;
      if (asset.draftPick?.protected != null) withProtection += 1;
      if (asset.draftPick?.swap != null) withSwap += 1;
      if (!asset.draftPick?.draftYear) unresolvedAssetCount += 1;
    }
    if (asset.type === "player") {
      playerAssetCount += 1;
      if (asset.playerId) playerResolved += 1;
      else unresolvedAssetCount += 1;
    }
  }

  // Party-level player identity (ESPN blurbs have none)
  let partyPlayerResolved = 0;
  let partyPlayerUnresolved = 0;
  let teamResolved = 0;
  let teamUnresolved = 0;
  const seenTeams = new Set<string>();
  for (const tx of state.transactions) {
    for (const party of tx.parties) {
      if (party.playerId) partyPlayerResolved += 1;
      else if (party.playerName || tx.description) partyPlayerUnresolved += 1;
    }
    for (const teamId of tx.teamIds) {
      if (seenTeams.has(teamId)) continue;
      seenTeams.add(teamId);
      if (ESPN_TEAM_META[teamId]) teamResolved += 1;
      else teamUnresolved += 1;
    }
  }

  const readiness = evaluateGenealogyReadiness(state);
  const genealogyUiReady =
    !state.isSynthetic && readiness.failures.length === 0;

  const sourceMap = new Map<
    string,
    { source: string; datasetVersion: string | null; dates: string[]; count: number }
  >();
  for (const tx of state.transactions) {
    const key = tx.source ?? "unknown";
    const entry = sourceMap.get(key) ?? {
      source: key,
      datasetVersion: tx.sourceVersion ?? tx.provenance?.datasetVersion ?? null,
      dates: [],
      count: 0,
    };
    entry.count += 1;
    entry.dates.push(tx.date);
    sourceMap.set(key, entry);
  }

  const sources = [...sourceMap.values()].map((s) => {
    const sorted = [...s.dates].sort();
    return {
      source: s.source,
      datasetVersion: s.datasetVersion,
      earliestDate: sorted[0] ?? null,
      latestDate: sorted[sorted.length - 1] ?? null,
      transactionCount: s.count,
    };
  });

  const draftTx = byType.draft ?? 0;

  return {
    generatedAt: state.builtAt,
    methodologyVersion: TRANSACTION_LINEAGE_METHODOLOGY_VERSION,
    transactionCount: state.transactions.length,
    assetCount: state.assets.size,
    ownershipEdgeCount: state.ownershipEdges.length,
    earliestDate: dates[0] ?? null,
    latestDate: dates[dates.length - 1] ?? null,
    earliestSeason: seasons[0] ?? null,
    latestSeason: seasons[seasons.length - 1] ?? null,
    transactionsByType: byType,
    transactionsByStatus: byStatus,
    draftPickAssetCount,
    playerAssetCount,
    unresolvedAssetCount,
    duplicateTransactionIds: state.duplicateTransactionIds,
    brokenEdgeCount: state.brokenEdgeCount,
    genealogyUiReady,
    notes: [
      ...state.notes,
      genealogyUiReady
        ? "Genealogy readiness criteria met — UI may be considered."
        : `Genealogy UI blocked (${readiness.failures.join("; ") || "criteria unmet"}).`,
    ],
    missingRequirements: genealogyUiReady ? [] : [...MISSING_REQUIREMENTS],
    sources,
    playerIdentity: {
      resolved: playerResolved + partyPlayerResolved,
      unresolved: Math.max(
        unresolvedAssetCount,
        partyPlayerUnresolved,
        state.transactions.length > 0 && playerAssetCount === 0
          ? state.transactions.length
          : 0
      ),
      ambiguous: 0,
    },
    teamIdentity: {
      resolved: teamResolved,
      unresolved: teamUnresolved,
      ambiguous: 0,
    },
    draftCoverage: {
      earliestDraftYear: null,
      latestDraftYear: null,
      draftSelectionTransactions: draftTx,
      structuredDraftPickAssets: draftPickAssetCount,
      missingSelectionsNote:
        draftPickAssetCount === 0
          ? "No structured draft-pick assets. Keyword-classified 'draft' blurbs are not draft-selection records."
          : null,
    },
    pickCoverage: {
      structuredPicks: draftPickAssetCount,
      ownershipEdges: state.ownershipEdges.length,
      withProtectionData: withProtection,
      withSwapData: withSwap,
    },
    graphQuality: {
      resolvableLineagePaths: 0,
      brokenChains: state.brokenEdgeCount,
      missingLinks: state.ownershipEdges.length === 0 ? state.transactions.length : 0,
      duplicateEdges: state.validationIssueCounts.duplicate_ownership_edge ?? 0,
      cyclesOrAnomalies: 0,
    },
    readiness,
    validationIssueCounts: state.validationIssueCounts,
  };
}

export { NO_STRUCTURED_LINEAGE_NOTE };
