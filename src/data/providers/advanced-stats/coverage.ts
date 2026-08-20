import { admitAdvancedObservations } from "@/data/providers/advanced-stats/admit";
import { provenanceIsComplete } from "@/data/providers/advanced-stats/normalize";
import {
  ADVANCED_STATS_AUDIT_METHODOLOGY_VERSION,
  type AdvancedMetricCoverage,
  type AdvancedSeasonMetricId,
  type AdvancedSeasonObservation,
  type AdvancedSeasonSourceId,
  type AdvancedStatsCoverageReport,
} from "@/data/types/advanced-season-stats";
import { evaluateAdvancedStatsReadiness } from "@/data/providers/advanced-stats/readiness";
import { buildAdvancedSourceInventory } from "@/data/providers/advanced-stats/inventory";

const ALL_METRICS: AdvancedSeasonMetricId[] = [
  "ortg",
  "drtg",
  "net",
  "usg_pct",
  "ts_pct",
  "efg_pct",
];

function sortSeasons(seasons: string[]): string[] {
  return [...seasons].sort((a, b) => a.localeCompare(b));
}

function playerKey(obs: AdvancedSeasonObservation): string {
  return (
    obs.playerId ??
    (obs.nbaPlayerId
      ? `nba:${obs.nbaPlayerId}`
      : obs.bdlPlayerId
        ? `bdl:${obs.bdlPlayerId}`
        : `name:${obs.playerName}`)
  );
}

function resolvedIdentity(obs: AdvancedSeasonObservation): boolean {
  return (
    obs.identityMatch === "espn_id" ||
    obs.identityMatch === "nba_id" ||
    obs.identityMatch === "bdl_id" ||
    obs.identityMatch === "alias"
  );
}

export type BuildAdvancedCoverageOptions = {
  observations?: AdvancedSeasonObservation[];
  /** Expected league player-season denominator for coverage % (optional). */
  leaguePlayerSeasonDenominator?: number;
  /** Override live BDL access probe result. */
  bdlLiveAccess?: "ok" | "unauthorized" | "untested" | "n/a";
  /** Embedded season_averages probe (from report script). */
  seasonAveragesProbe?: {
    access: string;
    endpoint: string;
    seasonsProbed: number[];
    admittedObservationCount: number;
    ratingSemantics: string;
    identityLimitation: string;
  };
  now?: string;
};

function emptyCoverage(
  metric: AdvancedSeasonMetricId,
  source: AdvancedSeasonSourceId
): AdvancedMetricCoverage {
  return {
    metric,
    source,
    status: "insufficient",
    earliestSeason: null,
    latestSeason: null,
    seasonCount: 0,
    playerSeasonRows: 0,
    uniquePlayers: 0,
    leaguePlayerSeasonCoveragePct: null,
    identityResolutionRate: 0,
    missingValueRate: 1,
    duplicateRate: 0,
    provenanceCompleteness: 0,
    grain: "player_season",
    semantics: "unknown",
    blockers: ["No observations admitted for this source/metric."],
  };
}

function statusForPair(
  cov: Omit<AdvancedMetricCoverage, "status" | "blockers">,
  blockers: string[]
): AdvancedMetricCoverage["status"] {
  if (blockers.length > 0) return "insufficient";
  if (
    cov.grain === "player_season" &&
    (cov.semantics === "individual" || cov.semantics === "on_court_team") &&
    cov.seasonCount >= 5 &&
    cov.identityResolutionRate >= 0.95 &&
    cov.duplicateRate <= 0.01 &&
    cov.provenanceCompleteness >= 0.99
  ) {
    // Candidate until live access + league coverage also pass the global gate.
    return "candidate";
  }
  return "insufficient";
}

export function buildAdvancedMetricCoverage(
  observations: AdvancedSeasonObservation[],
  options: BuildAdvancedCoverageOptions = {}
): AdvancedMetricCoverage[] {
  const admitted = admitAdvancedObservations(observations);
  const groups = new Map<string, AdvancedSeasonObservation[]>();

  for (const obs of admitted.observations) {
    const key = `${obs.source}|${obs.metric}`;
    const list = groups.get(key) ?? [];
    list.push(obs);
    groups.set(key, list);
  }

  // Always emit pairs we care about for the report, even when empty.
  const sourcesSeen = new Set<AdvancedSeasonSourceId>(
    observations.map((o) => o.source)
  );
  if (sourcesSeen.size === 0) {
    sourcesSeen.add("espn_approx");
    sourcesSeen.add("bdl_game_advanced");
    sourcesSeen.add("bdl_season_averages_advanced");
  }

  const out: AdvancedMetricCoverage[] = [];
  for (const source of sourcesSeen) {
    for (const metric of ALL_METRICS) {
      const rows = groups.get(`${source}|${metric}`) ?? [];
      if (rows.length === 0) {
        // Only include empty rows for primary rating metrics to keep report focused.
        if (metric === "ortg" || metric === "drtg" || metric === "net") {
          out.push(emptyCoverage(metric, source));
        }
        continue;
      }

      const seasons = sortSeasons([...new Set(rows.map((r) => r.season))]);
      const players = new Set(rows.map(playerKey));
      const playerSeasons = new Set(
        rows.map((r) => `${playerKey(r)}|${r.season}`)
      );
      const resolved = rows.filter(resolvedIdentity).length;
      const completeProv = rows.filter(provenanceIsComplete).length;
      const grain = rows[0]!.grain;
      const semantics = rows[0]!.semantics;

      const blockers: string[] = [];
      if (grain !== "player_season") {
        blockers.push(
          "Grain is not player_season - game rows are not season-true without an approved rollup methodology."
        );
      }
      if (semantics === "derived_approx") {
        blockers.push(
          "Semantics are derived_approx - not provider-published season-true ratings."
        );
      }
      if (semantics === "on_court_team") {
        blockers.push(
          "Semantics are on_court_team ratings - not individual ORtg/DRtg; do not relabel."
        );
      }
      if (semantics === "unknown") {
        blockers.push("Rating semantics are unknown.");
      }
      if (resolved / rows.length < 0.95) {
        blockers.push(
          `Identity resolution ${(resolved / rows.length).toFixed(3)} below 0.95 threshold (name-only matching is not a production key).`
        );
      }
      const dupRate =
        admitted.duplicateKeyCount /
        Math.max(1, admitted.observations.length + admitted.duplicateKeyCount);
      if (admitted.duplicateKeyCount > 0 && dupRate > 0.01) {
        blockers.push(`Duplicate observation rate ${dupRate.toFixed(3)} exceeds 0.01.`);
      }
      if (admitted.identityCollisionCount > 0) {
        blockers.push(
          `Identity collisions detected: ${admitted.identityCollisionCount}.`
        );
      }
      if (completeProv / rows.length < 0.99) {
        blockers.push("Provenance incomplete on one or more rows.");
      }
      if (seasons.length < 5) {
        blockers.push(
          `Only ${seasons.length} seasons represented (minimum 5 for candidate).`
        );
      }

      const denom = options.leaguePlayerSeasonDenominator;
      const coveragePct =
        denom != null && denom > 0
          ? playerSeasons.size / denom
          : null;
      if (coveragePct != null && coveragePct < 0.8) {
        blockers.push(
          `League player-season coverage ${(coveragePct * 100).toFixed(1)}% below 80% threshold.`
        );
      }

      const base: Omit<AdvancedMetricCoverage, "status" | "blockers"> = {
        metric,
        source,
        earliestSeason: seasons[0] ?? null,
        latestSeason: seasons[seasons.length - 1] ?? null,
        seasonCount: seasons.length,
        playerSeasonRows: playerSeasons.size,
        uniquePlayers: players.size,
        leaguePlayerSeasonCoveragePct: coveragePct,
        identityResolutionRate: resolved / rows.length,
        missingValueRate: 0, // present rows only; absences are non-rows
        duplicateRate: dupRate,
        provenanceCompleteness: completeProv / rows.length,
        grain,
        semantics,
      };

      out.push({
        ...base,
        status: statusForPair(base, blockers),
        blockers,
      });
    }
  }

  return out;
}

export async function buildAdvancedStatsCoverageReport(
  options: BuildAdvancedCoverageOptions = {}
): Promise<AdvancedStatsCoverageReport> {
  const observations = options.observations ?? [];
  const inventory = await buildAdvancedSourceInventory({
    bdlLiveAccess: options.bdlLiveAccess,
  });
  const byMetric = buildAdvancedMetricCoverage(observations, options);
  const readiness = evaluateAdvancedStatsReadiness({
    inventory,
    byMetric,
    seasonAveragesAccess: options.seasonAveragesProbe?.access,
    ratingSemantics: options.seasonAveragesProbe?.ratingSemantics as
      | "compatible"
      | "incompatible"
      | "unverified"
      | "unknown"
      | undefined,
    identityLimitation: options.seasonAveragesProbe?.identityLimitation,
    fixtureIdentityOnly: true,
  });
  const admitted = admitAdvancedObservations(observations);

  const notes: string[] = [
    "This report is diagnostic only - metrics are not user-facing.",
    "MISSING ≠ ZERO; SOURCE EXISTS ≠ SOURCE IS TRUSTWORTHY.",
    "FIELD NAME ≠ VERIFIED SEMANTICS; GAME RATING ≠ PLAYER SEASON RATING.",
    "Do not merge advanced ratings into HistoricalPlayerImpact.",
    ...admitted.notes,
  ];
  if (observations.length === 0) {
    notes.push(
      "No admitted season-true advanced observations in the diagnostic store (fixture or import)."
    );
  }
  if (admitted.invalidValueCount > 0) {
    notes.push(`Rejected invalid values: ${admitted.invalidValueCount}.`);
  }
  if (admitted.invalidSeasonCount > 0) {
    notes.push(`Rejected invalid seasons: ${admitted.invalidSeasonCount}.`);
  }
  if (admitted.duplicateKeyCount > 0) {
    notes.push(`Duplicate keys skipped: ${admitted.duplicateKeyCount}.`);
  }
  if (admitted.identityCollisionCount > 0) {
    notes.push(`Identity collisions: ${admitted.identityCollisionCount}.`);
  }

  return {
    generatedAt: options.now ?? new Date().toISOString(),
    methodologyVersion: ADVANCED_STATS_AUDIT_METHODOLOGY_VERSION,
    productionReady: readiness.productionReady,
    readiness,
    inventory,
    byMetric,
    totalObservations: admitted.observations.length,
    seasonAveragesProbe: options.seasonAveragesProbe,
    notes,
  };
}
