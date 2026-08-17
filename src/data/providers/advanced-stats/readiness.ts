import type {
  AdvancedMetricCoverage,
  AdvancedSourceInventoryEntry,
  AdvancedStatsProductionReadiness,
} from "@/data/types/advanced-season-stats";

/**
 * Explicit production gate for season-true ORtg / DRtg / NET.
 *
 * A source is NOT production-ready merely because it has some historical rows.
 */
export const ADVANCED_STATS_READINESS_CRITERIA = {
  minSeasons: 5,
  minIdentityResolutionRate: 0.95,
  maxDuplicateRate: 0.01,
  minProvenanceCompleteness: 0.99,
  minLeaguePlayerSeasonCoveragePct: 0.8,
  requiredMetrics: ["ortg", "drtg", "net"] as const,
  requiredGrain: "player_season" as const,
  /** Individual season ratings only — on-court team ratings stay labeled separately. */
  allowedSemantics: ["individual"] as const,
} as const;

export type EvaluateReadinessInput = {
  inventory: AdvancedSourceInventoryEntry[];
  byMetric: AdvancedMetricCoverage[];
  /** From season_averages probe when available. */
  seasonAveragesAccess?: string;
  ratingSemantics?:
    | "compatible"
    | "incompatible"
    | "unverified"
    | "unknown";
  identityLimitation?: string;
  fixtureIdentityOnly?: boolean;
};

function inventoryFor(
  inventory: AdvancedSourceInventoryEntry[],
  source: AdvancedMetricCoverage["source"]
): AdvancedSourceInventoryEntry | undefined {
  return inventory.find((s) => s.source === source);
}

function sourceEligibleForProduction(
  inv: AdvancedSourceInventoryEntry | undefined,
  reasons: string[],
  metric: string
): boolean {
  if (!inv) {
    reasons.push(`${metric}: inventory entry missing for coverage source.`);
    return false;
  }
  if (!inv.seasonTrue) {
    reasons.push(`${metric}/${inv.source}: inventory marks seasonTrue=false.`);
    return false;
  }
  if (inv.grain !== "player_season") {
    reasons.push(`${metric}/${inv.source}: inventory grain is ${inv.grain}.`);
    return false;
  }
  if (inv.semantics !== "individual") {
    reasons.push(
      `${metric}/${inv.source}: inventory semantics ${inv.semantics} (need individual).`
    );
    return false;
  }
  if (!inv.wiredInRepo) {
    reasons.push(`${metric}/${inv.source}: not wired in repo.`);
    return false;
  }
  if (inv.liveAccess === "unauthorized") {
    reasons.push(`${metric}/${inv.source}: live access unauthorized.`);
    return false;
  }
  if (inv.liveAccess === "untested") {
    reasons.push(`${metric}/${inv.source}: live access untested.`);
    return false;
  }
  if (
    (inv.source === "bdl_game_advanced" ||
      inv.source === "bdl_season_averages_advanced") &&
    inv.reliabilityConcerns.some((c) =>
      /alias file is empty|no espn|no nba person/i.test(c)
    )
  ) {
    reasons.push(
      `${metric}/${inv.source}: ESPN↔BDL identity mapping not production-safe.`
    );
    return false;
  }
  if (inv.source === "local_sample") {
    reasons.push(`${metric}/local_sample: never production.`);
    return false;
  }
  if (inv.source === "espn_approx") {
    reasons.push(
      `${metric}/espn_approx: approximate/derived ESPN path is not a production advanced-rating source for DRtg/NET.`
    );
    return false;
  }
  return true;
}

function metricReady(
  byMetric: AdvancedMetricCoverage[],
  inventory: AdvancedSourceInventoryEntry[],
  metric: "ortg" | "drtg" | "net"
): { ready: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const rows = byMetric.filter((m) => m.metric === metric);

  if (rows.length === 0) {
    reasons.push(`${metric}: no coverage rows.`);
    return { ready: false, reasons };
  }

  let anyReady = false;
  for (const c of rows) {
    const local: string[] = [];
    if (c.grain !== ADVANCED_STATS_READINESS_CRITERIA.requiredGrain) {
      local.push(`grain ${c.grain}`);
    }
    if (
      !(ADVANCED_STATS_READINESS_CRITERIA.allowedSemantics as readonly string[])
        .includes(c.semantics)
    ) {
      local.push(`semantics ${c.semantics}`);
    }
    if (c.seasonCount < ADVANCED_STATS_READINESS_CRITERIA.minSeasons) {
      local.push(`seasonCount ${c.seasonCount}`);
    }
    if (
      c.identityResolutionRate <
      ADVANCED_STATS_READINESS_CRITERIA.minIdentityResolutionRate
    ) {
      local.push(`identity ${c.identityResolutionRate.toFixed(3)}`);
    }
    if (c.duplicateRate > ADVANCED_STATS_READINESS_CRITERIA.maxDuplicateRate) {
      local.push(`duplicates ${c.duplicateRate.toFixed(3)}`);
    }
    if (
      c.provenanceCompleteness <
      ADVANCED_STATS_READINESS_CRITERIA.minProvenanceCompleteness
    ) {
      local.push(`provenance ${c.provenanceCompleteness.toFixed(3)}`);
    }
    if (
      c.leaguePlayerSeasonCoveragePct != null &&
      c.leaguePlayerSeasonCoveragePct <
        ADVANCED_STATS_READINESS_CRITERIA.minLeaguePlayerSeasonCoveragePct
    ) {
      local.push(`coverage ${c.leaguePlayerSeasonCoveragePct.toFixed(3)}`);
    }
    if (c.playerSeasonRows === 0) {
      local.push("zero rows");
    }

    const inv = inventoryFor(inventory, c.source);
    const invOk = sourceEligibleForProduction(inv, local, metric);

    if (local.length === 0 && invOk) {
      anyReady = true;
    } else if (c.playerSeasonRows > 0 || c.status !== "insufficient") {
      reasons.push(
        `${metric}/${c.source}: not production-ready (${local.join("; ") || "inventory"}).`
      );
    } else if (c.blockers.length > 0) {
      reasons.push(`${metric}/${c.source}: ${c.blockers[0]}`);
    }
  }

  if (!anyReady && reasons.length === 0) {
    reasons.push(`${metric}: no eligible production source.`);
  }

  return { ready: anyReady, reasons };
}

function classifyGate(
  input: EvaluateReadinessInput,
  requiredMetricsReady: Record<"ortg" | "drtg" | "net", boolean>
): AdvancedStatsProductionReadiness["gate"] {
  const bdlSeason = input.inventory.find(
    (s) => s.source === "bdl_season_averages_advanced"
  );
  const access =
    input.seasonAveragesAccess ?? bdlSeason?.liveAccess ?? "untested";

  if (
    access === "unauthorized" ||
    access === "no_api_key" ||
    bdlSeason?.liveAccess === "unauthorized"
  ) {
    return "accessBlocked";
  }

  if (input.ratingSemantics === "incompatible") {
    return "semanticsIncompatible";
  }

  if (
    input.ratingSemantics === "unverified" ||
    input.ratingSemantics === "unknown" ||
    bdlSeason?.semantics === "unknown"
  ) {
    // If we never observed a valid schema/response, prefer schemaUnknown.
    if (
      access === "untested" ||
      access === "skipped" ||
      access === "malformed_response" ||
      access === "endpoint_unavailable"
    ) {
      return "schemaUnknown";
    }
    return "semanticsUnverified";
  }

  if (
    input.fixtureIdentityOnly !== false &&
    (input.identityLimitation ||
      input.inventory.some((s) =>
        s.reliabilityConcerns.some((c) =>
          /alias file is empty|no espn|identity/i.test(c)
        )
      ))
  ) {
    // Full-league identity still blocked even if a small fixture exists.
    if (
      !requiredMetricsReady.ortg ||
      !requiredMetricsReady.drtg ||
      !requiredMetricsReady.net
    ) {
      return "identityBlocked";
    }
  }

  if (
    requiredMetricsReady.ortg &&
    requiredMetricsReady.drtg &&
    requiredMetricsReady.net
  ) {
    return "productionReady";
  }

  return "insufficientCoverage";
}

export function evaluateAdvancedStatsReadiness(
  input: EvaluateReadinessInput
): AdvancedStatsProductionReadiness {
  const reasons: string[] = [];
  const requiredMetricsReady = {
    ortg: false,
    drtg: false,
    net: false,
  };

  for (const metric of ADVANCED_STATS_READINESS_CRITERIA.requiredMetrics) {
    const result = metricReady(input.byMetric, input.inventory, metric);
    requiredMetricsReady[metric] = result.ready;
    reasons.push(...result.reasons);
  }

  const espn = input.inventory.find((s) => s.source === "espn_approx");
  if (espn) {
    reasons.push(
      "Inventory: ESPN keeps DRtg/NET missing; ORtg remains approximate derived only."
    );
  }
  const bdlSeason = input.inventory.find(
    (s) => s.source === "bdl_season_averages_advanced"
  );
  if (bdlSeason?.liveAccess === "unauthorized") {
    reasons.push(
      "Inventory: BallDontLie season_averages/advanced unauthorized on configured key (GOAT required)."
    );
    reasons.push(
      "Access remains the sole blocker to semantic verification of live season_averages advanced field keys."
    );
  }
  const bdlGame = input.inventory.find((s) => s.source === "bdl_game_advanced");
  if (bdlGame?.liveAccess === "unauthorized") {
    reasons.push(
      "Inventory: BallDontLie game advanced unauthorized on configured key (GOAT required)."
    );
  }
  if (input.identityLimitation) {
    reasons.push(`Identity: ${input.identityLimitation}`);
  } else if (
    input.inventory.some((s) =>
      s.reliabilityConcerns.some((c) =>
        c.toLowerCase().includes("alias file is empty")
      )
    )
  ) {
    reasons.push(
      "Inventory: ESPN↔BDL/NBA player-id alias file is empty — identity join blocked for full league."
    );
  }

  const gate = classifyGate(input, requiredMetricsReady);
  const productionReady = gate === "productionReady";

  const accessLabel =
    input.seasonAveragesAccess ??
    bdlSeason?.liveAccess ??
    "untested";
  const semanticsLabel =
    input.ratingSemantics ?? bdlSeason?.semantics ?? "unknown";
  const identityLabel = input.identityLimitation
    ? "unresolved / fixture-only"
    : "unresolved";
  const coverageLabel = `${input.byMetric
    .filter((m) => m.source === "bdl_season_averages_advanced")
    .reduce((n, m) => n + m.playerSeasonRows, 0)} admitted player-season metric rows`;

  return {
    productionReady,
    gate,
    access: String(accessLabel),
    semantics: String(semanticsLabel),
    identity: identityLabel,
    coverage: coverageLabel,
    reasons: productionReady
      ? [
          "productionReady: YES — all readiness gates passed.",
          ...reasons.filter((r) => r.startsWith("Inventory:")),
        ]
      : [
          `productionReady: NO — gate=${gate}`,
          ...reasons,
        ],
    requiredMetricsReady,
  };
}
