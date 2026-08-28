/**
 * In-memory season-true historical impact index.
 *
 * Admission rules (methodology v1.0):
 * - Observation must have canonical season YYYY-YY.
 * - Observation must have finite numeric value.
 * - DARKO live scrape is admitted ONLY for the season stamped on the snapshot
 *   (not applied to other career years).
 * - RAPTOR CSV/seed rows are admitted when season-keyed.
 * - Missing seasons stay missing (no interpolation).
 * - Duplicate keys: keep first, count as duplicate in coverage.
 */

import { fetchDarkoRatings } from "@/data/providers/impact/darko-client";
import { loadRaptorRatings } from "@/data/providers/impact/raptor-store";
import {
  impactObservationKey,
  isCanonicalImpactSeason,
  isFiniteImpactValue,
  normalizeImpactSeason,
} from "@/data/providers/impact/historical-impact-normalize";
import {
  loadPlayerIdAliases,
  type PlayerIdAliasIndex,
} from "@/data/providers/impact/player-id-aliases";
import { normalizePlayerName } from "@/lib/player-name";
import type { DarkoRating, RaptorRating } from "@/data/types";
import {
  HISTORICAL_IMPACT_METHODOLOGY_VERSION,
  type HistoricalImpactCoverageReport,
  type HistoricalImpactLookupKey,
  type HistoricalImpactMetricCoverage,
  type HistoricalImpactMetricId,
  type HistoricalImpactSourceId,
  type HistoricalPlayerImpact,
} from "@/data/types/historical-impact";

type IndexState = {
  builtAt: string;
  observations: HistoricalPlayerImpact[];
  byKey: Map<string, HistoricalPlayerImpact>;
  aliases: PlayerIdAliasIndex;
  duplicateKeyCount: number;
  invalidValueCount: number;
  notes: string[];
};

let memoryIndex: { expiresAt: number; value: IndexState } | null = null;
const INDEX_TTL_MS = 1000 * 60 * 30; // 30 minutes

export type BuildHistoricalImpactIndexOptions = {
  /** Inject observations (unit tests). When set, skips live source loads. */
  fixtures?: HistoricalPlayerImpact[];
  /** Force rebuild. */
  force?: boolean;
  /** Include live DARKO snapshot for its stamped season (default true). */
  includeLiveDarko?: boolean;
  /** Include RAPTOR CSV/seed (default true). */
  includeRaptor?: boolean;
  now?: string;
};

function emptyMetricCoverage(
  metric: HistoricalImpactMetricId,
  source: HistoricalImpactSourceId
): HistoricalImpactMetricCoverage {
  return {
    metric,
    source,
    observationCount: 0,
    playerKeyCount: 0,
    seasons: [],
    earliestSeason: null,
    latestSeason: null,
    invalidValueCount: 0,
    duplicateKeyCount: 0,
    unmatchedIdentityCount: 0,
  };
}

function pushObservation(
  state: IndexState,
  obs: HistoricalPlayerImpact
): void {
  if (!isCanonicalImpactSeason(obs.season)) return;
  if (!isFiniteImpactValue(obs.value)) {
    state.invalidValueCount += 1;
    return;
  }
  const key = impactObservationKey(obs);
  if (state.byKey.has(key)) {
    state.duplicateKeyCount += 1;
    return;
  }
  state.byKey.set(key, obs);
  state.observations.push(obs);
}

function raptorSourceVersion(fromCsv: boolean): string {
  return fromCsv ? "csv:data/impact/raptor.csv" : "seed:sample-raptor";
}

function fromRaptorRating(
  row: RaptorRating,
  aliases: PlayerIdAliasIndex,
  importedAt: string,
  sourceVersion: string
): HistoricalPlayerImpact[] {
  const season = normalizeImpactSeason(row.season);
  if (!season) return [];

  const nbaPlayerId =
    row.nbaPlayerId && /^\d+$/.test(row.nbaPlayerId)
      ? row.nbaPlayerId
      : row.playerId && /^\d+$/.test(row.playerId)
        ? row.playerId
        : undefined;

  const alias = nbaPlayerId ? aliases.byNba.get(nbaPlayerId) : undefined;
  const playerId = alias?.espnPlayerId ?? null;
  const identityMatch = playerId
    ? ("alias" as const)
    : nbaPlayerId
      ? ("nba_id" as const)
      : ("unmatched" as const);

  const base = {
    playerId,
    nbaPlayerId,
    playerName: row.playerName,
    season,
    source: "raptor" as const,
    methodologyVersion: HISTORICAL_IMPACT_METHODOLOGY_VERSION,
    sourceVersion,
    identityMatch,
    provenance: {
      dataset: "raptor",
      importedAt,
      notes: fromCsvNote(sourceVersion),
    },
  };

  const out: HistoricalPlayerImpact[] = [
    {
      ...base,
      metric: "raptor",
      value: row.impact,
    },
  ];
  if (row.offensive != null && isFiniteImpactValue(row.offensive)) {
    out.push({ ...base, metric: "oraptor", value: row.offensive });
  }
  if (row.defensive != null && isFiniteImpactValue(row.defensive)) {
    out.push({ ...base, metric: "draptor", value: row.defensive });
  }
  if (row.winsAdded != null && isFiniteImpactValue(row.winsAdded)) {
    out.push({ ...base, metric: "wins_added", value: row.winsAdded });
  }
  return out;
}

function fromCsvNote(sourceVersion: string): string | undefined {
  if (sourceVersion.startsWith("seed:")) {
    return "In-repo seed fallback — not a full historical RAPTOR archive.";
  }
  return "Season-keyed CSV row.";
}

function fromDarkoRating(
  row: DarkoRating,
  aliases: PlayerIdAliasIndex,
  importedAt: string
): HistoricalPlayerImpact[] {
  const season = normalizeImpactSeason(row.season);
  if (!season) return [];

  const nbaPlayerId =
    row.nbaPlayerId && /^\d+$/.test(row.nbaPlayerId)
      ? row.nbaPlayerId
      : row.playerId && /^\d+$/.test(row.playerId)
        ? row.playerId
        : undefined;

  const alias = nbaPlayerId ? aliases.byNba.get(nbaPlayerId) : undefined;
  const playerId = alias?.espnPlayerId ?? null;
  const identityMatch = playerId
    ? ("alias" as const)
    : nbaPlayerId
      ? ("nba_id" as const)
      : ("unmatched" as const);

  const sourceVersion = `live-snapshot:${season}`;
  const base = {
    playerId,
    nbaPlayerId,
    playerName: row.playerName,
    season,
    source: "darko" as const,
    methodologyVersion: HISTORICAL_IMPACT_METHODOLOGY_VERSION,
    sourceVersion,
    identityMatch,
    provenance: {
      dataset: "darko.app-live",
      importedAt,
      notes:
        "Live DARKO leaderboard snapshot admitted only for the stamped season — not a multi-year historical archive.",
    },
  };

  const out: HistoricalPlayerImpact[] = [
    { ...base, metric: "darko_dpm", value: row.impact },
  ];
  if (row.offensive != null && isFiniteImpactValue(row.offensive)) {
    out.push({ ...base, metric: "darko_off", value: row.offensive });
  }
  if (row.defensive != null && isFiniteImpactValue(row.defensive)) {
    out.push({ ...base, metric: "darko_def", value: row.defensive });
  }
  return out;
}

export async function buildHistoricalImpactIndex(
  options: BuildHistoricalImpactIndexOptions = {}
): Promise<IndexState> {
  const now = options.now ?? new Date().toISOString();
  if (
    !options.force &&
    !options.fixtures &&
    memoryIndex &&
    memoryIndex.expiresAt > Date.now()
  ) {
    return memoryIndex.value;
  }

  const aliases = options.fixtures
    ? { byEspn: new Map(), byNba: new Map() }
    : await loadPlayerIdAliases();

  const state: IndexState = {
    builtAt: now,
    observations: [],
    byKey: new Map(),
    aliases,
    duplicateKeyCount: 0,
    invalidValueCount: 0,
    notes: [],
  };

  if (options.fixtures) {
    for (const obs of options.fixtures) {
      pushObservation(state, obs);
    }
    state.notes.push("Built from synthetic/test fixtures.");
    return state;
  }

  if (options.includeRaptor !== false) {
    try {
      // Detect csv vs seed by comparing to a forced path — loadRaptorRatings
      // already prefers CSV. Annotate via file presence check in notes.
      const rows = await loadRaptorRatings();
      const { access } = await import("node:fs/promises");
      const path = await import("node:path");
      let fromCsv = false;
      try {
        await access(path.join(process.cwd(), "data", "impact", "raptor.csv"));
        fromCsv = true;
      } catch {
        fromCsv = false;
      }
      const sourceVersion = raptorSourceVersion(fromCsv);
      for (const row of rows) {
        for (const obs of fromRaptorRating(
          row,
          aliases,
          now,
          sourceVersion
        )) {
          pushObservation(state, obs);
        }
      }
      state.notes.push(
        fromCsv
          ? "RAPTOR loaded from data/impact/raptor.csv (season-keyed)."
          : "RAPTOR loaded from in-repo seed (season-keyed, illustrative coverage)."
      );
    } catch (err) {
      state.notes.push(
        `RAPTOR load failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  if (options.includeLiveDarko !== false) {
    try {
      const rows = await fetchDarkoRatings();
      for (const row of rows) {
        for (const obs of fromDarkoRating(row, aliases, now)) {
          pushObservation(state, obs);
        }
      }
      state.notes.push(
        "DARKO live snapshot admitted only for its stamped canonical season."
      );
    } catch (err) {
      state.notes.push(
        `DARKO live load failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  if (!options.fixtures) {
    memoryIndex = {
      value: state,
      expiresAt: Date.now() + INDEX_TTL_MS,
    };
  }
  return state;
}

export function clearHistoricalImpactIndexCache(): void {
  memoryIndex = null;
}

function matchesLookup(
  obs: HistoricalPlayerImpact,
  key: HistoricalImpactLookupKey,
  aliases: PlayerIdAliasIndex
): boolean {
  if (key.season && obs.season !== key.season) return false;
  if (key.metric && obs.metric !== key.metric) return false;
  if (key.source && obs.source !== key.source) return false;

  const wantsIdentity =
    key.playerId != null || key.nbaPlayerId != null || key.playerName != null;
  if (!wantsIdentity) return true;

  if (key.playerId && obs.playerId === key.playerId) return true;

  if (key.playerId) {
    const alias = aliases.byEspn.get(key.playerId);
    if (alias && obs.nbaPlayerId && obs.nbaPlayerId === alias.nbaPlayerId) {
      return true;
    }
  }

  if (key.nbaPlayerId && obs.nbaPlayerId === key.nbaPlayerId) return true;

  if (key.playerId && /^\d+$/.test(key.playerId) && obs.nbaPlayerId === key.playerId) {
    // Caller passed an NBA id in the playerId slot.
    return true;
  }

  if (key.playerName) {
    return (
      normalizePlayerName(obs.playerName) ===
      normalizePlayerName(key.playerName)
    );
  }

  return false;
}

/**
 * Pure filter over an index — used by queries and tests.
 * Does not invent missing seasons.
 */
export function queryHistoricalImpact(
  state: IndexState,
  key: HistoricalImpactLookupKey = {}
): HistoricalPlayerImpact[] {
  return state.observations
    .filter((obs) => matchesLookup(obs, key, state.aliases))
    .sort((a, b) => {
      const seasonCmp = b.season.localeCompare(a.season);
      if (seasonCmp !== 0) return seasonCmp;
      return a.metric.localeCompare(b.metric);
    });
}

export function buildCoverageReport(
  state: IndexState
): HistoricalImpactCoverageReport {
  const metricSources: Array<{
    metric: HistoricalImpactMetricId;
    source: HistoricalImpactSourceId;
  }> = [
    { metric: "darko_dpm", source: "darko" },
    { metric: "darko_off", source: "darko" },
    { metric: "darko_def", source: "darko" },
    { metric: "raptor", source: "raptor" },
    { metric: "oraptor", source: "raptor" },
    { metric: "draptor", source: "raptor" },
    { metric: "wins_added", source: "raptor" },
  ];

  const byMetric = metricSources.map(({ metric, source }) => {
    const rows = state.observations.filter(
      (o) => o.metric === metric && o.source === source
    );
    const seasons = [...new Set(rows.map((r) => r.season))].sort();
    const playerKeys = new Set(
      rows.map(
        (r) =>
          r.playerId ??
          (r.nbaPlayerId ? `nba:${r.nbaPlayerId}` : `name:${r.playerName}`)
      )
    );
    const coverage = emptyMetricCoverage(metric, source);
    coverage.observationCount = rows.length;
    coverage.playerKeyCount = playerKeys.size;
    coverage.seasons = seasons;
    coverage.earliestSeason = seasons[0] ?? null;
    coverage.latestSeason = seasons[seasons.length - 1] ?? null;
    coverage.unmatchedIdentityCount = rows.filter(
      (r) => r.identityMatch === "unmatched" || r.playerId == null
    ).length;
    coverage.invalidValueCount = 0;
    coverage.duplicateKeyCount = 0;
    return coverage;
  });

  // Attach global invalid/duplicate counts on the first metric row notes via report notes.
  const seasonsRepresented = [
    ...new Set(state.observations.map((o) => o.season)),
  ].sort();

  return {
    generatedAt: state.builtAt,
    methodologyVersion: HISTORICAL_IMPACT_METHODOLOGY_VERSION,
    totalObservations: state.observations.length,
    byMetric: byMetric.filter((m) => m.observationCount > 0),
    seasonsRepresented,
    notes: [
      ...state.notes,
      state.invalidValueCount
        ? `Rejected ${state.invalidValueCount} invalid values during build.`
        : "No invalid values rejected during build.",
      state.duplicateKeyCount
        ? `Skipped ${state.duplicateKeyCount} duplicate observation keys.`
        : "No duplicate observation keys.",
      "DARKO is not a multi-season historical archive in this repository.",
      "Career Resume CPI remains the production lens; this index is impact-only.",
    ],
  };
}

/** Test helper: expose IndexState typing without exporting internals widely. */
export type HistoricalImpactIndexState = IndexState;
