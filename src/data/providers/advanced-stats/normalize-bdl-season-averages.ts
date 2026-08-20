/**
 * Normalize BDL season_averages advanced rows into diagnostic observations.
 *
 * Admits rating metrics ONLY when semantics are rated compatible.
 * Otherwise returns structural notes without inventing production ratings.
 */

import type { BdlSeasonAverageRow } from "@/data/providers/balldontlie/client";
import {
  buildBdlIdentityIndex,
  resolveBdlPlayerIdentity,
  type BdlIdentityFixtureFile,
} from "@/data/providers/advanced-stats/identity";
import { normalizeAdvancedSeason } from "@/data/providers/advanced-stats/normalize";
import type { SeasonAveragesSemanticAssessment } from "@/data/providers/advanced-stats/semantics";
import {
  ADVANCED_STATS_AUDIT_METHODOLOGY_VERSION,
  type AdvancedSeasonMetricId,
  type AdvancedSeasonObservation,
} from "@/data/types/advanced-season-stats";

const FIELD_TO_METRIC: Record<string, AdvancedSeasonMetricId> = {
  offensive_rating: "ortg",
  defensive_rating: "drtg",
  net_rating: "net",
  usage_percentage: "usg_pct",
  true_shooting_percentage: "ts_pct",
  effective_field_goal_percentage: "efg_pct",
};

export type NormalizeSeasonAveragesResult = {
  observations: AdvancedSeasonObservation[];
  skippedBecauseSemantics: number;
  skippedMissingId: number;
  skippedInvalidValue: number;
  notes: string[];
};

function playerIdOf(row: BdlSeasonAverageRow): string | null {
  if (row.player?.id != null) return String(row.player.id);
  if (row.player_id != null) return String(row.player_id);
  return null;
}

function playerNameOf(row: BdlSeasonAverageRow): string {
  if (row.player) {
    return `${row.player.first_name} ${row.player.last_name}`.trim();
  }
  return "Unknown";
}

/**
 * Convert probe rows to AdvancedSeasonObservation[].
 * Default: do not admit ORtg/DRtg/NET while semantics are unverified.
 */
export function normalizeBdlSeasonAveragesAdvanced(
  rows: BdlSeasonAverageRow[],
  options: {
    semantics: SeasonAveragesSemanticAssessment;
    identityFixture: BdlIdentityFixtureFile;
    importedAt?: string;
    sourceVersion?: string;
    /** Test-only: admit rates even when semantics unverified (still not production). */
    admitDespiteUnverifiedSemantics?: boolean;
  }
): NormalizeSeasonAveragesResult {
  const notes: string[] = [];
  const observations: AdvancedSeasonObservation[] = [];
  let skippedBecauseSemantics = 0;
  let skippedMissingId = 0;
  let skippedInvalidValue = 0;

  const allowRatings =
    options.semantics.ratingSemantics === "compatible" ||
    options.admitDespiteUnverifiedSemantics === true;

  if (options.semantics.ratingSemantics !== "compatible") {
    notes.push(
      `Rating metrics not admitted for production path: semantics=${options.semantics.ratingSemantics}.`
    );
  }
  if (options.admitDespiteUnverifiedSemantics) {
    notes.push(
      "admitDespiteUnverifiedSemantics=true - diagnostic fixture path only; not production."
    );
  }

  const index = buildBdlIdentityIndex(options.identityFixture);
  const importedAt = options.importedAt ?? new Date().toISOString();
  const sourceVersion =
    options.sourceVersion ??
    "bdl:nba/v1/season_averages/general?type=advanced";

  for (const row of rows) {
    const bdlId = playerIdOf(row);
    if (!bdlId) {
      skippedMissingId += 1;
      continue;
    }
    const season = normalizeAdvancedSeason(row.season);
    if (!season) {
      skippedInvalidValue += 1;
      continue;
    }

    const identity = resolveBdlPlayerIdentity(bdlId, index);
    const canonical =
      identity.status === "resolved" ? identity.canonicalPlayerId : null;

    const stats = row.stats ?? {};
    for (const [field, raw] of Object.entries(stats)) {
      const metric = FIELD_TO_METRIC[field];
      if (!metric) continue;

      if (!allowRatings) {
        skippedBecauseSemantics += 1;
        continue;
      }

      if (raw == null || typeof raw !== "number" || !Number.isFinite(raw)) {
        skippedInvalidValue += 1;
        continue;
      }

      observations.push({
        playerId: canonical,
        bdlPlayerId: bdlId,
        playerName: playerNameOf(row),
        season,
        metric,
        value: raw,
        source: "bdl_season_averages_advanced",
        grain: "player_season",
        semantics:
          options.semantics.ratingSemantics === "compatible"
            ? "individual"
            : "unknown",
        seasonType:
          row.season_type === "playoffs"
            ? "playoffs"
            : row.season_type === "regular"
              ? "regular"
              : "unknown",
        methodologyVersion: ADVANCED_STATS_AUDIT_METHODOLOGY_VERSION,
        sourceVersion,
        identityMatch: identity.status === "resolved" ? "alias" : "unmatched",
        provenance: {
          dataset: "bdl_season_averages_advanced",
          importedAt,
          retrieval: "/nba/v1/season_averages/general?type=advanced",
          notes:
            identity.status === "resolved"
              ? `identity via fixture (${identity.match})`
              : identity.reason,
        },
      });
    }
  }

  return {
    observations,
    skippedBecauseSemantics,
    skippedMissingId,
    skippedInvalidValue,
    notes,
  };
}
