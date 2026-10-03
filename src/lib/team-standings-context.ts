import { isPreseasonRosterSeason } from "@/data/providers/nba/espn-roster-client";
import { ESPN_TEAM_META } from "@/data/providers/nba/team-meta";
import { getLeagueStandings } from "@/data/queries/standings";
import type { TeamSeasonStats } from "@/data/types";
import type { LeagueStandings, StandingRow } from "@/data/types/standings";
import { isSeasonAwaitingFirstGame } from "@/lib/nba-season-status";
import { shiftCanonicalSeason } from "@/lib/player-stat-comps";
import type { TeamBrand } from "@/lib/nba-brand";
import {
  computeDivisionStanding,
  findStandingRow,
} from "@/lib/team-explorer";

export type TeamDivisionMeta = {
  conference: "East" | "West";
  division: string;
  divisionSize: number;
};

export type TeamStandingsDisplay = {
  standing: StandingRow | null;
  divisionStanding: { division: string; rank: number; of: number } | null;
  divisionMeta: TeamDivisionMeta | null;
  priorSeasonStanding: StandingRow | null;
  priorSeasonLabel: string | null;
  seasonAwaitingGames: boolean;
  standingsEmpty: boolean;
};

function standingRows(data: LeagueStandings | null): StandingRow[] {
  return data?.conferences.flatMap((c) => c.rows) ?? [];
}

export function resolveTeamDivisionMeta(
  brand?: TeamBrand | null,
  teamId?: string
): TeamDivisionMeta | null {
  const espnId = brand?.espnTeamId ?? teamId;
  if (!espnId) return null;
  const meta = ESPN_TEAM_META[espnId];
  if (!meta) return null;
  const divisionSize = Object.values(ESPN_TEAM_META).filter(
    (row) => row.division === meta.division
  ).length;
  return {
    conference: meta.conference,
    division: meta.division,
    divisionSize,
  };
}

export async function resolveTeamStandingsDisplay(input: {
  season: string;
  currentSeason: string;
  team: TeamSeasonStats;
  brand?: TeamBrand | null;
  boardRows: readonly TeamSeasonStats[];
}): Promise<TeamStandingsDisplay> {
  const { season, currentSeason, team, brand, boardRows } = input;
  const seasonAwaitingGames = isSeasonAwaitingFirstGame(season, boardRows);
  const divisionMeta = resolveTeamDivisionMeta(brand, team.teamId);

  // getLeagueStandings serves the prior season's final table before tip-off;
  // never present those rows as this season's record.
  const standings = await getLeagueStandings(season).catch(() => null);
  const sameSeason = standings != null && standings.season === season;
  const seasonRows = sameSeason ? standingRows(standings) : [];
  const rows = seasonRows.some((r) => r.wins + r.losses > 0) ? seasonRows : [];
  const standingsEmpty = rows.length === 0;

  let priorSeasonStanding: StandingRow | null = null;
  let priorSeasonLabel: string | null = null;

  if (standingsEmpty && isPreseasonRosterSeason(season)) {
    const priorSeason = shiftCanonicalSeason(season, -1);
    const priorStandings =
      standings?.season === priorSeason
        ? standings
        : await getLeagueStandings(priorSeason).catch(() => null);
    if (priorStandings?.season === priorSeason) {
      priorSeasonStanding = findStandingRow(
        standingRows(priorStandings),
        team,
        brand
      );
      priorSeasonLabel = priorSeason;
    }
  }

  const standing = findStandingRow(rows, team, brand);
  const divisionStanding =
    standing != null
      ? computeDivisionStanding(standing, rows, brand)
      : null;

  return {
    standing,
    divisionStanding,
    divisionMeta,
    priorSeasonStanding,
    priorSeasonLabel,
    seasonAwaitingGames,
    standingsEmpty: standingsEmpty && season === currentSeason,
  };
}
