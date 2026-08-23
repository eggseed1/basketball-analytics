import { PlayerSentimentColumn } from "@/components/players/player-sentiment-column";
import type { GlassSurfaceHonor } from "@/components/brand/glass-surface";
import { getPlayerSentimentBundle } from "@/data/queries/player-sentiment";
import type { HistoricalTeamBrand } from "@/lib/historical-team-brand";

export async function PlayerSentimentIsland({
  playerId,
  playerName,
  teamKey,
  showSentiment,
  historicalBrand,
  honor,
}: {
  playerId: string;
  playerName: string;
  teamKey?: string | null;
  showSentiment: boolean;
  historicalBrand?: HistoricalTeamBrand | null;
  honor?: GlassSurfaceHonor;
}) {
  if (!showSentiment) return null;
  const profile = await getPlayerSentimentBundle(playerId);
  return (
    <PlayerSentimentColumn
      playerName={playerName}
      teamKey={teamKey}
      profile={profile}
      historicalBrand={historicalBrand}
      honor={honor}
    />
  );
}
