import type {
  MovementClaim,
  MovementCuratedSnapshot,
  MovementResolution,
  MovementStoryCluster,
} from "@/movement-center/types";

const TRADE_CLAIM_TYPES = new Set<MovementClaim["claimType"]>([
  "trade_interest",
  "trade_request",
]);

function clusterTradeClaims(
  snapshot: MovementCuratedSnapshot,
  cluster: MovementStoryCluster
): MovementClaim[] {
  return snapshot.claims.filter(
    (claim) =>
      claim.clusterId === cluster.id && TRADE_CLAIM_TYPES.has(claim.claimType)
  );
}

function resolutionSuppressesTradeSpec(resolution: MovementResolution): boolean {
  if (resolution.suppressTradeSpeculation === false) return false;
  return (
    resolution.outcome === "materialized" ||
    resolution.outcome === "partially_materialized"
  );
}

/** Player ids that should not appear in unresolved trade-speculation narratives. */
export function completedTradePlayerIds(
  snapshot: MovementCuratedSnapshot | null
): Set<string> {
  const ids = new Set<string>();
  if (!snapshot) return ids;

  for (const resolution of snapshot.resolutions ?? []) {
    if (!resolutionSuppressesTradeSpec(resolution)) continue;
    for (const playerId of resolution.playerIds) ids.add(playerId);
  }

  for (const cluster of snapshot.clusters) {
    if (cluster.state !== "completed" && cluster.state !== "official") continue;
    const tradeClaims = clusterTradeClaims(snapshot, cluster);
    if (!tradeClaims.length) continue;
    for (const playerId of cluster.linkedPlayerIds) ids.add(playerId);
  }

  return ids;
}
