/**
 * Build immutable HistoricalSeasonSnapshot via RealNBADataProvider.
 */

import type {
  HistoricalSeasonSnapshot,
  RealNBADataProvider,
  SeasonYear,
} from "@/gm/myleague/types";
import { makeProvenance } from "@/gm/myleague/historical-universe";
import { uid } from "@/gm/engine/rng";
import { ESPN_PLAYER_SEASON_HORIZON_START } from "@/gm/myleague/constants";
import { seasonEndToCanonical } from "@/gm/myleague/real-nba-provider";

export async function ingestHistoricalSeasonSnapshot(
  provider: RealNBADataProvider,
  seasonEndYear: SeasonYear
): Promise<HistoricalSeasonSnapshot> {
  const startYear = seasonEndYear - 1;
  if (startYear < ESPN_PLAYER_SEASON_HORIZON_START) {
    throw new Error(
      `Player-season ingest via ESPN starts at ${ESPN_PLAYER_SEASON_HORIZON_START}. ` +
        `Requested ${seasonEndToCanonical(seasonEndYear)}.`
    );
  }

  const [
    teams,
    players,
    rosters,
    contracts,
    salaryCap,
    leagueRules,
    awards,
    stats,
    draft,
  ] = await Promise.all([
    provider.getTeams(seasonEndYear),
    provider.getPlayers(seasonEndYear),
    provider.getRosters(seasonEndYear),
    provider.getContracts(seasonEndYear),
    provider.getSalaryCap(seasonEndYear),
    provider.getLeagueRules(seasonEndYear),
    provider.getAwards(seasonEndYear),
    provider.getStats(seasonEndYear),
    provider.getDraft(seasonEndYear),
  ]);

  if (players.length < 50) {
    throw new Error(
      `Historical ingest found only ${players.length} players for ${seasonEndToCanonical(seasonEndYear)}.`
    );
  }

  const provenance = makeProvenance(
    seasonEndYear,
    "real-nba-ingest",
    "mixed"
  );

  return Object.freeze({
    id: uid(`snap-${seasonEndYear}`),
    season: seasonEndYear,
    teams,
    players,
    rosters,
    contracts,
    salaryCap,
    luxuryTax: salaryCap,
    draft,
    transactions: [],
    awards,
    leagueRules,
    statistics: stats,
    provenance: {
      ...provenance,
      sourceVersion: "m3",
    },
    immutable: true as const,
  });
}
