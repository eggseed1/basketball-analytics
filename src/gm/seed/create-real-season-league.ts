/**
 * Async Franchise Lab league from RealNBADataProvider ingest + CBA registry
 * + official NBA regular-season schedule.
 */

import { getHistoricalGames } from "@/data/queries/historical";
import {
  buildLeagueFromPlayerSeasons,
  defaultGmCanonicalSeason,
} from "@/gm/seed/create-real-league";
import {
  buildScheduleFromRealGames,
  scheduleLooksComplete,
} from "@/gm/seed/real-schedule";
import type { GmLeagueState } from "@/gm/types";
import type { HistoricalSeasonSnapshot } from "@/gm/myleague/types";
import { ingestHistoricalSeasonSnapshot } from "@/gm/myleague/ingest-snapshot";
import {
  SiteRealNBADataProvider,
  canonicalToSeasonEnd,
  createSiteRealNBADataProvider,
} from "@/gm/myleague/real-nba-provider";
import { getCbaRules } from "@/gm/myleague/cba-registry";
import type { PlayerSeason } from "@/data/types";

export async function createRealSeasonLeague(options: {
  userTeamId: string;
  season?: string;
  seed?: number;
  provider?: SiteRealNBADataProvider;
}): Promise<{
  league: GmLeagueState;
  snapshot: HistoricalSeasonSnapshot;
  seasonCanonical: string;
}> {
  const seasonCanonical = options.season ?? defaultGmCanonicalSeason();
  const seasonEnd = canonicalToSeasonEnd(seasonCanonical);
  const provider = options.provider ?? createSiteRealNBADataProvider();

  const [snapshot, rawGames] = await Promise.all([
    ingestHistoricalSeasonSnapshot(provider, seasonEnd),
    getHistoricalGames({ season: seasonCanonical, maxPages: 25 }),
  ]);

  const stats = snapshot.statistics?.players as PlayerSeason[] | undefined;
  const rows =
    stats && Array.isArray(stats) && stats.length
      ? stats
      : await provider.getPlayerSeasonRows(seasonEnd);

  if (rows.length < 50) {
    throw new Error(
      `Not enough real player seasons for ${seasonCanonical} (${rows.length}). Try a recent season.`
    );
  }

  const schedule = buildScheduleFromRealGames(rawGames, seasonEnd);
  if (!scheduleLooksComplete(schedule)) {
    console.warn(
      `[gm] Real schedule for ${seasonCanonical} looks thin (${schedule.length} games); using what we have.`
    );
  }

  const cba = getCbaRules(seasonEnd);
  const league = buildLeagueFromPlayerSeasons(rows, {
    userTeamId: options.userTeamId,
    seasonCanonical,
    seed: options.seed,
    salaryCapM: cba.salaryCapM || undefined,
    luxuryTaxM: cba.luxuryTaxM || undefined,
    firstApronM: cba.firstApronM,
    secondApronM: cba.secondApronM,
    maxRoster: cba.maxRoster,
    minRoster: cba.minRoster,
    schedule: schedule.length >= 200 ? schedule : undefined,
  });

  return { league, snapshot, seasonCanonical };
}
