/**
 * Query layer for season-true historical player impact.
 * Pages should use these helpers - never read impact CSVs directly.
 */

import {
  buildCoverageReport,
  buildHistoricalImpactIndex,
  clearHistoricalImpactIndexCache,
  queryHistoricalImpact,
  type BuildHistoricalImpactIndexOptions,
} from "@/data/providers/impact/historical-impact-index";
import type {
  HistoricalImpactCoverageReport,
  HistoricalImpactLookupKey,
  HistoricalImpactMetricId,
  HistoricalPlayerImpact,
} from "@/data/types/historical-impact";

export type {
  HistoricalImpactCoverageReport,
  HistoricalImpactLookupKey,
  HistoricalImpactMetricId,
  HistoricalPlayerImpact,
};

export { clearHistoricalImpactIndexCache };

export type GetHistoricalImpactOptions = BuildHistoricalImpactIndexOptions & {
  metric?: HistoricalImpactMetricId;
  source?: HistoricalImpactLookupKey["source"];
  nbaPlayerId?: string;
  playerName?: string;
};

/**
 * Season-true impact observations for one player + season.
 * Returns [] when the season has no verified observations (never fabricated).
 */
export async function getPlayerHistoricalImpact(
  playerId: string,
  season: string,
  options: GetHistoricalImpactOptions = {}
): Promise<HistoricalPlayerImpact[]> {
  const index = await buildHistoricalImpactIndex(options);
  return queryHistoricalImpact(index, {
    playerId,
    season,
    metric: options.metric,
    source: options.source,
    nbaPlayerId: options.nbaPlayerId,
    playerName: options.playerName,
  });
}

/**
 * All season-true impact observations for a player (career impact series).
 * Gaps remain gaps - no interpolation between seasons.
 */
export async function getPlayerCareerImpact(
  playerId: string,
  options: GetHistoricalImpactOptions = {}
): Promise<HistoricalPlayerImpact[]> {
  const index = await buildHistoricalImpactIndex(options);
  return queryHistoricalImpact(index, {
    playerId,
    metric: options.metric,
    source: options.source,
    nbaPlayerId: options.nbaPlayerId,
    playerName: options.playerName,
  });
}

/**
 * Generic lookup - useful for diagnostics and multi-metric boards.
 */
export async function lookupHistoricalImpact(
  key: HistoricalImpactLookupKey = {},
  options: BuildHistoricalImpactIndexOptions = {}
): Promise<HistoricalPlayerImpact[]> {
  const index = await buildHistoricalImpactIndex(options);
  return queryHistoricalImpact(index, key);
}

/**
 * Coverage / quality report for operators (not a public product page).
 */
export async function getHistoricalImpactCoverage(
  options: BuildHistoricalImpactIndexOptions = {}
): Promise<HistoricalImpactCoverageReport> {
  const index = await buildHistoricalImpactIndex({
    ...options,
    force: options.force ?? true,
  });
  return buildCoverageReport(index);
}

/**
 * True when at least one observation exists for this player-season.
 */
export async function hasPlayerSeasonImpact(
  playerId: string,
  season: string,
  options: GetHistoricalImpactOptions = {}
): Promise<boolean> {
  const rows = await getPlayerHistoricalImpact(playerId, season, options);
  return rows.length > 0;
}
