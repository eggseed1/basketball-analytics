import {
  fetchLeagueStandings,
  standingsHaveResults,
} from "@/data/providers/nba/standings-client";
import type { Game } from "@/data/types/game";
import type { LeagueStandings } from "@/data/types/standings";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { isPreseasonRosterSeason } from "@/data/providers/nba/espn-roster-client";
import { shiftCanonicalSeason } from "@/lib/player-stat-comps";

export async function getLeagueStandings(
  season?: string
): Promise<LeagueStandings> {
  const resolved =
    season ?? canonicalSeasonFromStartYear(currentNbaStartYear());

  // Offseason / preseason: ESPN often returns empty or remapped boards for the
  // upcoming year — load the completed season first.
  if (isPreseasonRosterSeason(resolved)) {
    const prior = shiftCanonicalSeason(resolved, -1);
    const priorBoard = await fetchLeagueStandings(prior).catch(() => null);
    if (priorBoard && standingsHaveResults(priorBoard)) {
      return priorBoard;
    }
  }

  const board = await fetchLeagueStandings(resolved);
  if (standingsHaveResults(board) || !isPreseasonRosterSeason(resolved)) {
    return board;
  }

  const prior = shiftCanonicalSeason(resolved, -1);
  const priorBoard = await fetchLeagueStandings(prior).catch(() => null);
  return priorBoard && standingsHaveResults(priorBoard) ? priorBoard : board;
}

function standingRecord(wins: number, losses: number): string {
  return `${wins}-${losses}`;
}

/** Fill missing overall W-L from standings. Never overwrite ESPN records. */
export function applyStandingRecords<T extends Game>(
  games: T[],
  standings: LeagueStandings,
  options?: { requireSeasonMatch?: boolean }
): T[] {
  const requireSeasonMatch = options?.requireSeasonMatch ?? true;
  const byId = new Map<string, string>();
  const byAbbr = new Map<string, string>();
  for (const conf of standings.conferences) {
    for (const row of conf.rows) {
      if (row.wins === 0 && row.losses === 0) continue;
      const rec = standingRecord(row.wins, row.losses);
      byId.set(row.teamId, rec);
      if (row.abbreviation) {
        byAbbr.set(row.abbreviation.toUpperCase(), rec);
      }
    }
  }

  const lookup = (id: string, abbr?: string) =>
    byId.get(id) ?? (abbr ? byAbbr.get(abbr.toUpperCase()) : undefined);

  return games.map((game) => {
    if (
      requireSeasonMatch &&
      game.season &&
      game.season !== standings.season
    ) {
      return game;
    }
    const awayRecord =
      game.awayRecord ?? lookup(game.awayTeamId, game.awayTeamAbbr);
    const homeRecord =
      game.homeRecord ?? lookup(game.homeTeamId, game.homeTeamAbbr);
    if (awayRecord === game.awayRecord && homeRecord === game.homeRecord) {
      return game;
    }
    return {
      ...game,
      ...(awayRecord ? { awayRecord } : {}),
      ...(homeRecord ? { homeRecord } : {}),
    };
  });
}

export async function withStandingRecords<T extends Game>(
  games: T[],
  season?: string
): Promise<T[]> {
  if (!games.length) return games;
  if (games.every((game) => game.awayRecord && game.homeRecord)) return games;

  const current = canonicalSeasonFromStartYear(currentNbaStartYear());
  const preferred = season ?? current;

  try {
    let next = applyStandingRecords(
      games,
      await getLeagueStandings(preferred)
    );
    if (
      next.some((game) => !game.awayRecord || !game.homeRecord) &&
      preferred !== current
    ) {
      next = applyStandingRecords(
        next,
        await getLeagueStandings(current),
        { requireSeasonMatch: false }
      );
    }
    return next;
  } catch {
    return games;
  }
}
