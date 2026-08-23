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

  let standings = await getLeagueStandings(season).catch(() => null);
  let rows = standingRows(standings);
  let standingsEmpty = rows.length === 0;

  let priorSeasonStanding: StandingRow | null = null;
  let priorSeasonLabel: string | null = null;

  if (standingsEmpty && isPreseasonRosterSeason(season)) {
    const priorSeason = shiftCanonicalSeason(season, -1);
    const priorStandings = await getLeagueStandings(priorSeason).catch(
      () => null
    );
    const priorRows = standingRows(priorStandings);
    priorSeasonStanding = findStandingRow(priorRows, team, brand);
    priorSeasonLabel = priorSeason;
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
