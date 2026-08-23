import { writeFileSync } from "node:fs";
import path from "node:path";

import { resolvePlayerIdentity } from "@/data/identity/player-identity";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { fetchEspnLeagueRosterPlayers } from "@/data/providers/nba/espn-roster-client";
import { normalizePlayerName } from "@/data/providers/salaries/salary-store";
import type { PlayerSeason } from "@/data/types";
import type {
  MovementClaim,
  MovementCuratedSnapshot,
  MovementResolution,
  MovementStoryCluster,
} from "@/movement-center/types";
import { readJsonFile, SEEDS_DIR, SNAPSHOT_PATH } from "@/movement-center/seed-paths";

export type MovementSeedManifest = {
  methodologyVersion: string;
  status: string;
  disclaimer: string;
};

function buildRosterIndex(roster: PlayerSeason[]): {
  byId: Map<string, PlayerSeason>;
  byName: Map<string, PlayerSeason>;
} {
  const byId = new Map<string, PlayerSeason>();
  const byName = new Map<string, PlayerSeason>();
  for (const row of roster) {
    byId.set(row.playerId, row);
    const key = normalizePlayerName(row.playerName);
    if (key && !byName.has(key)) byName.set(key, row);
  }
  return { byId, byName };
}

async function findRosterRow(
  playerId: string,
  rosterIndex: ReturnType<typeof buildRosterIndex>
): Promise<PlayerSeason | null> {
  const identity = await resolvePlayerIdentity(playerId).catch(() => null);
  const ids = new Set<string>([playerId]);
  if (identity?.nbaId) ids.add(identity.nbaId);
  if (identity?.espnId) ids.add(identity.espnId);
  if (identity?.routeId) ids.add(identity.routeId);
  for (const id of ids) {
    const hit = rosterIndex.byId.get(id);
    if (hit) return hit;
  }
  if (identity?.displayName) {
    return (
      rosterIndex.byName.get(normalizePlayerName(identity.displayName)) ?? null
    );
  }
  return null;
}

async function syncClustersFromRoster(
  clusters: MovementStoryCluster[],
  rosterIndex: ReturnType<typeof buildRosterIndex>
): Promise<number> {
  let synced = 0;
  for (const cluster of clusters) {
    const teamIds = new Set(cluster.linkedTeamIds);
    let changed = false;
    for (const playerId of cluster.linkedPlayerIds) {
      const row = await findRosterRow(playerId, rosterIndex);
      if (!row) continue;
      if (!teamIds.has(row.teamId)) {
        teamIds.add(row.teamId);
        changed = true;
      }
    }
    if (changed) {
      cluster.linkedTeamIds = [...teamIds];
      synced += 1;
    }
  }
  return synced;
}

export type BuildMovementSnapshotOptions = {
  now?: Date;
  dryRun?: boolean;
  verbose?: boolean;
};

export type BuildMovementSnapshotResult = {
  snapshot: MovementCuratedSnapshot;
  clusterCount: number;
  claimCount: number;
  resolutionCount: number;
  syncedClusterCount: number;
  outputPath: string;
};

export async function buildMovementSnapshot(
  options: BuildMovementSnapshotOptions = {}
): Promise<BuildMovementSnapshotResult> {
  const now = options.now ?? new Date();
  const manifest = readJsonFile<MovementSeedManifest>(
    path.join(SEEDS_DIR, "manifest.json")
  );
  const sources = readJsonFile<MovementCuratedSnapshot["sources"]>(
    path.join(SEEDS_DIR, "sources.json")
  );
  const clusters = readJsonFile<MovementStoryCluster[]>(
    path.join(SEEDS_DIR, "clusters.json")
  );
  const claims = readJsonFile<MovementClaim[]>(
    path.join(SEEDS_DIR, "claims.json")
  );
  const resolutions = readJsonFile<MovementResolution[]>(
    path.join(SEEDS_DIR, "resolutions.json")
  );

  const season = canonicalSeasonFromStartYear(currentNbaStartYear(now));
  const roster = await fetchEspnLeagueRosterPlayers(season).catch(() => []);
  const rosterIndex = buildRosterIndex(roster);
  const syncedClusterCount = await syncClustersFromRoster(clusters, rosterIndex);

  const snapshot: MovementCuratedSnapshot = {
    meta: {
      methodologyVersion: manifest.methodologyVersion,
      status: manifest.status,
      season,
      snapshotDate: now.toISOString().slice(0, 10),
      disclaimer: manifest.disclaimer,
      builtAt: now.toISOString(),
      rosterPlayerCount: roster.length,
    },
    sources,
    clusters,
    claims,
    resolutions,
  };

  if (!options.dryRun) {
    writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
  }

  if (options.verbose) {
    console.log(
      `movement:build season=${season} clusters=${clusters.length} claims=${claims.length} resolutions=${resolutions.length} synced=${syncedClusterCount}`
    );
  }

  return {
    snapshot,
    clusterCount: clusters.length,
    claimCount: claims.length,
    resolutionCount: resolutions.length,
    syncedClusterCount,
    outputPath: SNAPSHOT_PATH,
  };
}
