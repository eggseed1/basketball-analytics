/**
 * Async Franchise Lab league from RealNBADataProvider ingest + CBA registry
 * + official NBA regular-season schedule.
 */

import { getHistoricalGames } from "@/data/queries/historical";
import {
  bundledRosterSeasonRows,
  fetchEspnLeagueRosterPlayers,
} from "@/data/providers/nba/espn-roster-client";
import { normalizePlayerName } from "@/data/providers/salaries/salary-store";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
  startYearFromCanonicalSeason,
} from "@/data/providers/historical/season-range";
import { createPlaceholderSnapshot } from "@/gm/myleague/historical-universe";
import {
  buildLeagueFromPlayerSeasons,
  defaultGmCanonicalSeason,
} from "@/gm/seed/create-real-league";
import { officialSchedule } from "@/gm/engine/schedule";
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
  seasonEndToCanonical,
} from "@/gm/myleague/real-nba-provider";
import { getCbaRules } from "@/gm/myleague/cba-registry";
import { ESPN_PLAYER_SEASON_HORIZON_START } from "@/gm/myleague/constants";
import type { PlayerSeason } from "@/data/types";
import { applyBalancedRotations } from "@/gm/engine/coaching";

export async function createRealSeasonLeague(options: {
  userTeamId: string;
  season?: string;
  seed?: number;
  provider?: SiteRealNBADataProvider;
  /**
   * When set, ratings come only from this season's counting stats (e.g. "2024-25"
   * to forecast "2025-26"). Ignores same-season production for an out-of-sample test.
   */
  statsSeason?: string;
}): Promise<{
  league: GmLeagueState;
  snapshot: HistoricalSeasonSnapshot;
  seasonCanonical: string;
}> {
  const requested = options.season ?? defaultGmCanonicalSeason();
  const provider = options.provider ?? createSiteRealNBADataProvider();
  const current = canonicalSeasonFromStartYear(currentNbaStartYear());
  if (requested === current || options.statsSeason) {
    return buildCurrentRosterLeague(provider, requested, options);
  }
  let lastError: unknown = null;
  for (
    let start = startYearFromCanonicalSeason(requested);
    start >= ESPN_PLAYER_SEASON_HORIZON_START;
    start -= 1
  ) {
    const seasonCanonical = canonicalSeasonFromStartYear(start);
    try {
      return await buildOneSeason(provider, seasonCanonical, options);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : "";
      if (!/not enough|only 0 players|found only/i.test(message)) throw error;
      if (seasonCanonical === requested) continue;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("No real NBA season could be loaded.");
}

async function loadRosterShells(season: string): Promise<PlayerSeason[]> {
  const bundled = bundledRosterSeasonRows(season);
  try {
    const live = await fetchEspnLeagueRosterPlayers(season);
    if (live.length >= 300) return live;
  } catch {
    /* bundled rosters still name the current teams */
  }
  return bundled;
}

function indexByName(rows: PlayerSeason[]): Map<string, PlayerSeason> {
  const map = new Map<string, PlayerSeason>();
  for (const row of rows) {
    const key = normalizePlayerName(row.playerName);
    const prev = map.get(key);
    if (!prev || row.minutes > prev.minutes) map.set(key, row);
  }
  return map;
}

/**
 * Pick the richest counting sample for ratings. Preferring "current" with 1 GP
 * (or an injury-shortened year) sank stars — Tatum looked like a mid-70s card
 * while DARKO / last year's board still had him as a top-10 wing.
 */
function pickRatingSeasonRow(
  current: PlayerSeason | undefined,
  prior: PlayerSeason | undefined
): PlayerSeason | undefined {
  if (current && prior) {
    return current.minutes >= prior.minutes ? current : prior;
  }
  return current ?? prior;
}

/** Current teams from the roster list. Ratings use the fullest season line. */
function placeOnCurrentRoster(
  roster: PlayerSeason[],
  sameSeason: PlayerSeason[],
  prior: PlayerSeason[]
): PlayerSeason[] {
  const currentByName = indexByName(sameSeason.filter((row) => row.gamesPlayed > 0));
  const priorByName = indexByName(prior.filter((row) => row.gamesPlayed > 0));
  return roster.map((slot) => {
    const key = normalizePlayerName(slot.playerName);
    const stats = pickRatingSeasonRow(
      currentByName.get(key),
      priorByName.get(key)
    );
    if (!stats) return slot;
    return {
      ...stats,
      playerName: slot.playerName || stats.playerName,
      teamId: slot.teamId,
      teamName: slot.teamName,
      position: slot.position || stats.position,
      age: slot.age ?? stats.age,
    };
  });
}

async function buildCurrentRosterLeague(
  provider: SiteRealNBADataProvider,
  seasonCanonical: string,
  options: {
    userTeamId: string;
    season?: string;
    seed?: number;
    statsSeason?: string;
  }
): Promise<{
  league: GmLeagueState;
  snapshot: HistoricalSeasonSnapshot;
  seasonCanonical: string;
}> {
  const seasonEnd = canonicalToSeasonEnd(seasonCanonical);
  const priorEnd = options.statsSeason
    ? canonicalToSeasonEnd(options.statsSeason)
    : seasonEnd - 1;
  const priorOnly = Boolean(options.statsSeason);
  const [roster, sameSeason, prior] = await Promise.all([
    loadRosterShells(seasonCanonical),
    priorOnly
      ? Promise.resolve([] as PlayerSeason[])
      : provider.getPlayerSeasonRows(seasonEnd).catch(() => [] as PlayerSeason[]),
    provider.getPlayerSeasonRows(priorEnd).catch(() => [] as PlayerSeason[]),
  ]);
  if (roster.length < 300) {
    throw new Error(
      `${seasonCanonical} roster list is short (${roster.length}). Refusing to use last year's teams.`
    );
  }
  const priorWithStats = prior.filter((row) => row.gamesPlayed > 0);
  if (priorWithStats.length < 50) {
    throw new Error(
      `Franchise Lab needs prior-season counting stats to rate the ${seasonCanonical} roster ` +
        `(only ${priorWithStats.length} rows for ${seasonEndToCanonical(priorEnd)}).`
    );
  }
  const rows = placeOnCurrentRoster(roster, sameSeason, prior);
  const schedule = officialSchedule(seasonEnd);
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
    keepAssignedRoster: true,
  });
  const statsLabel = priorOnly
    ? `Ratings locked to ${options.statsSeason} production (out-of-sample forecast).`
    : `Ratings use each player's fullest recent season line (not a one-game ${seasonCanonical} fluke).`;
  league.news = [
    {
      ...league.news[0]!,
      headline: `${seasonCanonical} rosters loaded`,
      body: `${roster.length} players on this year's teams. ${statsLabel} ${league.news[0]?.body ?? ""}`,
    },
    ...league.news.slice(1),
  ];
  let snapshot: HistoricalSeasonSnapshot;
  try {
    snapshot = await ingestHistoricalSeasonSnapshot(provider, seasonEnd);
  } catch {
    snapshot = createPlaceholderSnapshot(seasonEnd, {
      label: seasonCanonical,
    });
  }
  return {
    league: applyBalancedRotations(league),
    snapshot,
    seasonCanonical,
  };
}

async function buildOneSeason(
  provider: SiteRealNBADataProvider,
  seasonCanonical: string,
  options: {
    userTeamId: string;
    season?: string;
    seed?: number;
  }
): Promise<{
  league: GmLeagueState;
  snapshot: HistoricalSeasonSnapshot;
  seasonCanonical: string;
}> {
  const seasonEnd = canonicalToSeasonEnd(seasonCanonical);

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

  return {
    league: applyBalancedRotations(league),
    snapshot,
    seasonCanonical,
  };
}
