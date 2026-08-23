import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { resolvePlayerIdentity } from "@/data/identity/player-identity";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { fetchEspnLeagueRosterPlayers } from "@/data/providers/nba/espn-roster-client";
import { normalizePlayerName } from "@/data/providers/salaries/salary-store";
import type { PlayerSeason } from "@/data/types";
import {
  aggregateObservationsToProfiles,
  type SentimentObservationBatch,
} from "@/sentiment/aggregate-observations";
import type {
  LeagueSentimentSnapshot,
  PlayerSentimentProfile,
  SentimentCuratedSnapshot,
  SentimentProfileProvenance,
} from "@/sentiment/curated-types";
import {
  expandPilotProfilesFromRoster,
  profileKey,
  type PilotRosterSeed,
} from "@/sentiment/generate-pilot-profile";
import { hydrateLeagueNarrativeHygiene } from "@/sentiment/narrative-hygiene";
import { enrichProfilesWithMovementAssociations } from "@/sentiment/movement-associations";
import { computeSentimentMovers } from "@/sentiment/movers";

export type SentimentSeedManifest = {
  methodologyVersion: string;
  status: string;
  disclaimer: string;
  pilotWindow: string;
  moverLimit: number;
  moverLookbackDays: number;
  coverageFloor: {
    mentionVolume: number;
    coverageConfidence: number;
  };
};

const SEEDS_DIR = path.join(process.cwd(), "data", "sentiment", "seeds", "v1");
const OBSERVATIONS_DIR = path.join(
  process.cwd(),
  "data",
  "sentiment",
  "observations",
  "v1"
);
const SNAPSHOT_PATH = path.join(
  process.cwd(),
  "data",
  "sentiment",
  "v1",
  "snapshot.json"
);

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

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

function playerIdSet(
  playerIds: string[],
  identity: Awaited<ReturnType<typeof resolvePlayerIdentity>> | null
): Set<string> {
  const ids = new Set(playerIds);
  if (identity?.nbaId) ids.add(identity.nbaId);
  if (identity?.espnId) ids.add(identity.espnId);
  if (identity?.routeId) ids.add(identity.routeId);
  return ids;
}

async function findRosterRow(
  profile: PlayerSentimentProfile,
  rosterIndex: ReturnType<typeof buildRosterIndex>
): Promise<PlayerSeason | null> {
  for (const id of profile.playerIds) {
    const identity = await resolvePlayerIdentity(id);
    const ids = playerIdSet(profile.playerIds, identity);
    for (const candidate of ids) {
      const hit = rosterIndex.byId.get(candidate);
      if (hit) return hit;
    }
    if (identity?.displayName) {
      const byName = rosterIndex.byName.get(
        normalizePlayerName(identity.displayName)
      );
      if (byName) return byName;
    }
  }
  if (profile.displayName) {
    return rosterIndex.byName.get(normalizePlayerName(profile.displayName)) ?? null;
  }
  return null;
}

function syncProfileTeamFromRoster(
  profile: PlayerSentimentProfile,
  rosterRow: PlayerSeason
): PlayerSentimentProfile {
  return {
    ...profile,
    displayName: rosterRow.playerName || profile.displayName,
    teamKey: rosterRow.teamId,
  };
}

function passesCoverageFloor(
  profile: PlayerSentimentProfile,
  floor: SentimentSeedManifest["coverageFloor"]
): boolean {
  return (
    profile.fan.mentionVolume >= floor.mentionVolume &&
    profile.fan.coverageConfidence >= floor.coverageConfidence &&
    profile.media.mentionVolume >= floor.mentionVolume &&
    profile.media.coverageConfidence >= floor.coverageConfidence
  );
}

function loadObservationBatches(): SentimentObservationBatch[] {
  if (!existsSync(OBSERVATIONS_DIR)) return [];
  const files = readdirSync(OBSERVATIONS_DIR).filter(
    (name) => name.endsWith(".json")
  );
  const batches: SentimentObservationBatch[] = [];
  for (const file of files) {
    try {
      batches.push(
        readJson<SentimentObservationBatch>(path.join(OBSERVATIONS_DIR, file))
      );
    } catch {
      // skip malformed batch files during scaffold phase
    }
  }
  return batches;
}

function mergeObservationProfiles(
  seedProfiles: PlayerSentimentProfile[],
  observationProfiles: PlayerSentimentProfile[],
  floor: SentimentSeedManifest["coverageFloor"]
): { profiles: PlayerSentimentProfile[]; observationKeys: Set<string> } {
  const observationKeys = new Set<string>();
  if (!observationProfiles.length) {
    return { profiles: seedProfiles, observationKeys };
  }
  const byId = new Map<string, PlayerSentimentProfile>();
  for (const profile of seedProfiles) {
    for (const id of profile.playerIds) byId.set(id, profile);
  }

  const lanePasses = (lane: PlayerSentimentProfile["fan"]) =>
    lane.mentionVolume >= floor.mentionVolume &&
    lane.coverageConfidence >= floor.coverageConfidence;

  const profileDedupeKey = (profile: PlayerSentimentProfile) =>
    profile.playerIds.slice().sort().join("|");

  for (const profile of observationProfiles) {
    for (const id of profile.playerIds) {
      const existing = byId.get(id);
      if (existing) {
        const fanFromObs = lanePasses(profile.fan);
        const mediaFromObs = lanePasses(profile.media);
        const merged = {
          ...existing,
          fan: fanFromObs ? profile.fan : existing.fan,
          media: mediaFromObs ? profile.media : existing.media,
          series: profile.series ?? existing.series,
        };
        if (fanFromObs || mediaFromObs) {
          observationKeys.add(profileDedupeKey(merged));
        }
        for (const aliasId of existing.playerIds) byId.set(aliasId, merged);
        for (const aliasId of profile.playerIds) byId.set(aliasId, merged);
      } else if (lanePasses(profile.fan) && lanePasses(profile.media)) {
        byId.set(id, profile);
        observationKeys.add(profileDedupeKey(profile));
      }
    }
  }
  const merged = new Map<string, PlayerSentimentProfile>();
  for (const profile of byId.values()) {
    const key = profileDedupeKey(profile);
    if (!merged.has(key)) merged.set(key, profile);
  }
  return { profiles: [...merged.values()], observationKeys };
}

function tagProfileProvenance(
  profiles: PlayerSentimentProfile[],
  handCraftedKeys: Set<string>,
  observationKeys: Set<string>
): PlayerSentimentProfile[] {
  return profiles.map((profile) => {
    const key = profileKey(profile);
    const dedupeKey = profile.playerIds.slice().sort().join("|");
    let provenance: SentimentProfileProvenance;
    if (observationKeys.has(dedupeKey)) {
      provenance = "observation";
    } else if (handCraftedKeys.has(key)) {
      provenance = "hand_crafted";
    } else {
      provenance = "generated";
    }
    return { ...profile, provenance };
  });
}

export type BuildSentimentSnapshotOptions = {
  now?: Date;
  dryRun?: boolean;
  verbose?: boolean;
};

export type BuildSentimentSnapshotResult = {
  snapshot: SentimentCuratedSnapshot;
  rosterPlayerCount: number;
  syncedTeamCount: number;
  droppedBelowFloor: number;
  observationBatchCount: number;
  generatedProfileCount: number;
  outputPath: string;
};

export async function buildSentimentSnapshot(
  options: BuildSentimentSnapshotOptions = {}
): Promise<BuildSentimentSnapshotResult> {
  const now = options.now ?? new Date();
  const manifest = readJson<SentimentSeedManifest>(
    path.join(SEEDS_DIR, "manifest.json")
  );
  const seedProfiles = readJson<PlayerSentimentProfile[]>(
    path.join(SEEDS_DIR, "pilot-profiles.json")
  );
  const pilotRosterPath = path.join(SEEDS_DIR, "pilot-roster.json");
  const pilotRoster = existsSync(pilotRosterPath)
    ? readJson<PilotRosterSeed>(pilotRosterPath)
    : null;
  const leagueSeed = readJson<LeagueSentimentSnapshot>(
    path.join(SEEDS_DIR, "league.json")
  );
  const league = await hydrateLeagueNarrativeHygiene(leagueSeed);

  const season = canonicalSeasonFromStartYear(currentNbaStartYear(now));
  const snapshotDate = now.toISOString().slice(0, 10);

  const roster = await fetchEspnLeagueRosterPlayers(season).catch(() => []);
  const rosterIndex = buildRosterIndex(roster);

  const handCraftedKeys = new Set(seedProfiles.map((profile) => profileKey(profile)));

  let generatedProfileCount = 0;
  let baseProfiles = seedProfiles;
  if (pilotRoster) {
    const expanded = await expandPilotProfilesFromRoster({
      pilotRoster,
      handCrafted: seedProfiles,
      rosterIndex,
    });
    baseProfiles = expanded.profiles;
    generatedProfileCount = expanded.generated;
  }

  const observationBatches = loadObservationBatches();
  const observationProfiles = observationBatches.flatMap((batch) =>
    aggregateObservationsToProfiles(batch, manifest.pilotWindow)
  );
  const merged = mergeObservationProfiles(
    baseProfiles,
    observationProfiles,
    manifest.coverageFloor
  );
  let profiles = tagProfileProvenance(
    merged.profiles,
    handCraftedKeys,
    merged.observationKeys
  );

  let syncedTeamCount = 0;
  const synced: PlayerSentimentProfile[] = [];
  for (const profile of profiles) {
    const rosterRow = await findRosterRow(profile, rosterIndex);
    const next = rosterRow
      ? syncProfileTeamFromRoster(profile, rosterRow)
      : profile;
    if (rosterRow) syncedTeamCount += 1;
    if (passesCoverageFloor(next, manifest.coverageFloor)) {
      synced.push(next);
    }
  }
  const droppedBelowFloor = profiles.length - synced.length;
  profiles = synced;

  profiles = await enrichProfilesWithMovementAssociations(profiles);

  const movers = computeSentimentMovers(profiles, {
    limit: manifest.moverLimit,
    lookbackDays: manifest.moverLookbackDays,
  });

  const snapshot: SentimentCuratedSnapshot = {
    meta: {
      methodologyVersion: manifest.methodologyVersion,
      status: manifest.status,
      season,
      disclaimer: manifest.disclaimer,
      snapshotDate,
      builtAt: now.toISOString(),
      rosterPlayerCount: roster.length,
      pilotProfileCount: profiles.length,
      observationBatchCount: observationBatches.length,
      observationBatchIds: observationBatches.map((batch) => batch.batchId),
      movers: {
        window: manifest.pilotWindow,
        lookbackDays: manifest.moverLookbackDays,
        risers: movers.risers,
        fallers: movers.fallers,
      },
    },
    players: profiles,
    league,
  };

  if (!options.dryRun) {
    writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
  }

  if (options.verbose) {
    console.log(
      `sentiment:build season=${season} profiles=${profiles.length} generated=${generatedProfileCount} roster=${roster.length} synced=${syncedTeamCount} dropped=${droppedBelowFloor} observations=${observationBatches.length}`
    );
  }

  return {
    snapshot,
    rosterPlayerCount: roster.length,
    syncedTeamCount,
    droppedBelowFloor,
    observationBatchCount: observationBatches.length,
    generatedProfileCount,
    outputPath: SNAPSHOT_PATH,
  };
}
