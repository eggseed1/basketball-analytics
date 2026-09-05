import "server-only";

import { cache } from "react";

import { getRuntimeMovementSnapshot } from "@/data/runtime/movement-snapshot";
import type {
  MovementCuratedSnapshot,
  MovementFeedItem,
  MovementStoryCluster,
  PlayerMovementBundle,
  PlayerMovementMonitor,
} from "@/movement-center/types";
import {
  activityFromScore,
  scoreMovementCluster,
} from "@/movement-center/scoring";
import { isResolvedMovementState } from "@/movement-center/cluster-state";

function readLocalSnapshot(): MovementCuratedSnapshot | null {
  // Local dev only — data/ is not mounted on Cloudflare Workers.
  if (process.env.NODE_ENV === "production") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { existsSync, readFileSync } = require("node:fs") as typeof import("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("node:path") as typeof import("node:path");
    const filePath = path.join(
      process.cwd(),
      "data",
      "movement-center",
      "v1",
      "snapshot.json"
    );
    if (!existsSync(filePath)) return null;
    return JSON.parse(
      readFileSync(filePath, "utf8")
    ) as MovementCuratedSnapshot;
  } catch {
    return null;
  }
}

function readSnapshot(): MovementCuratedSnapshot | null {
  return getRuntimeMovementSnapshot() ?? readLocalSnapshot();
}

export const loadMovementSnapshot = cache((): MovementCuratedSnapshot | null =>
  readSnapshot()
);

function claimsForCluster(
  snapshot: MovementCuratedSnapshot,
  clusterId: string
) {
  return snapshot.claims.filter((c) => c.clusterId === clusterId);
}

function buildFeed(snapshot: MovementCuratedSnapshot): MovementFeedItem[] {
  return snapshot.clusters
    .map((cluster) => {
      const claims = claimsForCluster(snapshot, cluster.id);
      const score = scoreMovementCluster(
        cluster,
        claims,
        snapshot.sources
      );
      return { cluster, claims, score };
    })
    .sort((a, b) => b.score.total - a.score.total);
}

export const getMovementFeed = cache((): {
  items: MovementFeedItem[];
  season: string;
  disclaimer: string;
  status: string;
} | null => {
  const snapshot = loadMovementSnapshot();
  if (!snapshot) return null;
  return {
    items: buildFeed(snapshot),
    season: snapshot.meta.season,
    disclaimer: snapshot.meta.disclaimer,
    status: snapshot.meta.status,
  };
});

function playerIdMatches(
  linkedIds: string[],
  candidateIds: Set<string>
): boolean {
  return linkedIds.some((id) => candidateIds.has(id));
}

function sortClustersForDisplay(
  clusters: MovementStoryCluster[],
  scoresByCluster: PlayerMovementBundle["scoresByCluster"]
): MovementStoryCluster[] {
  const active = clusters.filter((c) => !isResolvedMovementState(c.state));
  const resolved = clusters.filter((c) => isResolvedMovementState(c.state));
  const byScore = (list: MovementStoryCluster[]) =>
    [...list].sort(
      (a, b) =>
        (scoresByCluster[b.id]?.total ?? 0) -
        (scoresByCluster[a.id]?.total ?? 0)
    );
  return [...byScore(active), ...byScore(resolved)];
}

export function buildPlayerMovementBundle(
  playerIds: Set<string>
): PlayerMovementBundle | null {
  const snapshot = loadMovementSnapshot();
  if (!snapshot || playerIds.size === 0) return null;

  const clusters = snapshot.clusters.filter((c) =>
    playerIdMatches(c.linkedPlayerIds, playerIds)
  );
  if (!clusters.length) return null;

  const claimsByCluster: PlayerMovementBundle["claimsByCluster"] = {};
  const scoresByCluster: PlayerMovementBundle["scoresByCluster"] = {};

  for (const cluster of clusters) {
    const claims = claimsForCluster(snapshot, cluster.id);
    claimsByCluster[cluster.id] = claims;
    scoresByCluster[cluster.id] = scoreMovementCluster(
      cluster,
      claims,
      snapshot.sources
    );
  }

  const sorted = sortClustersForDisplay(clusters, scoresByCluster);
  const activeClusters = sorted.filter(
    (c) => !isResolvedMovementState(c.state)
  );
  const monitorClusters = activeClusters.length ? activeClusters : sorted;
  const topScore = scoresByCluster[monitorClusters[0]!.id]!;
  const teamSet = new Set<string>();
  for (const c of clusters) {
    for (const t of c.linkedTeamIds) teamSet.add(t);
  }

  const lastAt = clusters
    .map((c) => c.lastMeaningfulAt)
    .sort()
    .at(-1) ?? null;

  const monitor: PlayerMovementMonitor = {
    playerId: [...playerIds][0]!,
    activityLevel: activityFromScore(topScore.total, monitorClusters.length),
    linkedTeamIds: [...teamSet],
    direction: activeClusters.length ? "rising" : "stable",
    lastMeaningfulReportAt: lastAt,
    evidenceScore: topScore,
    topClusterIds: monitorClusters.map((c) => c.id),
  };

  return {
    monitor,
    clusters: sorted,
    claimsByCluster,
    scoresByCluster,
    season: snapshot.meta.season,
    disclaimer: snapshot.meta.disclaimer,
  };
}

export function buildTeamMovementFeed(
  teamId: string,
  options?: { activeOnly?: boolean }
): MovementFeedItem[] | null {
  const snapshot = loadMovementSnapshot();
  if (!snapshot) return null;
  let items = buildFeed(snapshot).filter((item) =>
    item.cluster.linkedTeamIds.includes(teamId)
  );
  if (options?.activeOnly !== false) {
    const active = items.filter(
      (item) => !isResolvedMovementState(item.cluster.state)
    );
    if (active.length) items = active;
  }
  return items;
}

export function getMovementCluster(
  clusterId: string
): MovementFeedItem | null {
  const feed = getMovementFeed();
  return feed?.items.find((i) => i.cluster.id === clusterId) ?? null;
}

export function listClustersForPlayer(
  playerIds: Set<string>
): MovementStoryCluster[] {
  const bundle = buildPlayerMovementBundle(playerIds);
  return bundle?.clusters ?? [];
}
