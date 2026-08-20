import { PlayerPercentilePanel } from "@/components/players/player-percentile-panel";
import type { PlayerSeason } from "@/data/types";
import { loadPlayerPercentileMetrics } from "@/lib/player-percentile-load";
import { cardStintsForSeason } from "@/lib/player-team-context";

export async function PlayerPercentileIsland({
  playerId,
  displayName,
  season,
  career,
  seasonOptions,
  seasonTeams,
  identityTeamKey,
}: {
  playerId: string;
  displayName: string;
  season: string;
  career: PlayerSeason[];
  seasonOptions: string[];
  seasonTeams: Record<string, string>;
  identityTeamKey?: string | null;
}) {
  const { metrics, teamKey } = await loadPlayerPercentileMetrics(
    playerId,
    season,
    career,
    identityTeamKey
  );
  const stintsBySeason = Object.fromEntries(
    seasonOptions.map((option) => [option, cardStintsForSeason(career, option)])
  );

  return (
    <PlayerPercentilePanel
      season={season}
      seasons={seasonOptions}
      playerId={playerId}
      playerName={displayName}
      teamKey={teamKey}
      seasonTeams={seasonTeams}
      stintsBySeason={stintsBySeason}
      metrics={metrics}
    />
  );
}
