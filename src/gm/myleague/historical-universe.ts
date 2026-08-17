/**
 * Immutable HistoricalUniverse helpers.
 * Snapshots are frozen after attach - never mutate in place.
 */

import type {
  DataProvenance,
  HistoricalSeasonSnapshot,
  HistoricalUniverse,
  SeasonYear,
} from "@/gm/myleague/types";
import { uid } from "@/gm/engine/rng";

export function createEmptyHistoricalUniverse(opts?: {
  id?: string;
  realDataHorizon?: SeasonYear;
}): HistoricalUniverse {
  return {
    id: opts?.id ?? uid("hu"),
    label: "reality",
    seasons: {},
    snapshots: {},
    realDataHorizon: opts?.realDataHorizon ?? 0,
  };
}

export function makeProvenance(
  season: SeasonYear,
  source = "franchise-lab-scaffold",
  quality: DataProvenance["dataQuality"] = "synthetic"
): DataProvenance {
  return {
    source,
    sourceVersion: "m2",
    retrievedAt: new Date().toISOString(),
    season,
    dataQuality: quality,
  };
}

/**
 * Build a minimal immutable snapshot placeholder.
 * Milestone 3 replaces placeholder snapshots with RealNBADataProvider ingest.
 */
export function createPlaceholderSnapshot(
  season: SeasonYear,
  opts?: { label?: string; id?: string }
): HistoricalSeasonSnapshot {
  const provenance = makeProvenance(season);
  return {
    id: opts?.id ?? uid(`snap-${season}`),
    season,
    teams: [],
    players: [],
    rosters: [],
    contracts: [],
    salaryCap: {
      season,
      salaryCapM: 0,
      provenance,
    },
    transactions: [],
    leagueRules: {
      season,
      rules: {
        season,
        salaryCapM: 0,
        luxuryTaxM: 0,
        minSalaryM: 0,
        maxSalaryM: 0,
        birdRights: true,
        restrictedFreeAgency: true,
        signAndTrade: true,
        tradeMatching: "era_specific",
        maxContractYears: 5,
        maxRoster: 15,
        minRoster: 14,
        twoWayContracts: false,
        draftRounds: 2,
        lotteryModel: "none",
        notes: "Placeholder CBA - Milestone 5 fills era rules.",
      },
      provenance,
    },
    provenance,
    immutable: true,
  };
}

/**
 * Attach a snapshot. Returns a new universe; original is untouched.
 * Rejects if season already mapped (reality is append-only by season).
 */
export function attachHistoricalSnapshot(
  universe: HistoricalUniverse,
  snapshot: HistoricalSeasonSnapshot
): HistoricalUniverse {
  if (universe.seasons[snapshot.season]) {
    throw new Error(
      `HistoricalUniverse ${universe.id} already has season ${snapshot.season}`
    );
  }
  // Freeze at attach boundary (shallow).
  const frozen: HistoricalSeasonSnapshot = Object.freeze({
    ...snapshot,
    immutable: true as const,
  });
  return {
    ...universe,
    seasons: { ...universe.seasons, [snapshot.season]: frozen.id },
    snapshots: { ...universe.snapshots, [frozen.id]: frozen },
    realDataHorizon: Math.max(universe.realDataHorizon, snapshot.season),
  };
}

export function getHistoricalSnapshot(
  universe: HistoricalUniverse,
  season: SeasonYear
): HistoricalSeasonSnapshot | null {
  const id = universe.seasons[season];
  if (!id) return null;
  return universe.snapshots[id] ?? null;
}

export function listHistoricalSeasons(
  universe: HistoricalUniverse
): SeasonYear[] {
  return Object.keys(universe.seasons)
    .map(Number)
    .sort((a, b) => a - b);
}
