import { PlayerStatsBoard } from "@/components/players/player-stats-board";
import { getPlayerPlayoffCareerSeasons } from "@/data/queries";
import type { PlayerSeason } from "@/data/types";
import { type PlayerSeasonKind } from "@/lib/player-destination";
import {
  isMultiTeamSeasonRow,
  primaryTeamForSeason,
} from "@/lib/player-team-context";

export async function PlayerStatsIsland({
  playerId,
  season,
  seasonType,
  career,
  teamKey,
}: {
  playerId: string;
  season: string;
  seasonType: PlayerSeasonKind;
  career: PlayerSeason[];
  teamKey?: string | null;
}) {
  const source =
    seasonType === "playoffs"
      ? await getPlayerPlayoffCareerSeasons(playerId)
      : career;
  const row =
    primaryTeamForSeason(source, season) ??
    source.find((item) => item.season === season) ??
    null;
  const teamLabel = row
    ? isMultiTeamSeasonRow(row)
      ? "TOT"
      : row.teamAbbreviation ?? row.teamName
    : null;

  return (
    <PlayerStatsBoard
      row={row}
      seasonType={seasonType}
      teamKey={teamKey}
      teamLabel={teamLabel}
    />
  );
}
