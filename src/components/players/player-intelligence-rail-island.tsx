import { PlayerIntelligenceRail } from "@/components/players/player-intelligence-rail";
import type { GlassSurfaceHonor } from "@/components/brand/glass-surface";
import { getPlayerMovementBundle } from "@/data/queries/movement-center.server";
import { getPlayerSentimentBundle } from "@/data/queries/player-sentiment";
import type { HistoricalTeamBrand } from "@/lib/historical-team-brand";

export async function PlayerIntelligenceRailIsland({
  playerId,
  playerName,
  teamKey,
  showIntelligence,
  historicalBrand,
  honor,
}: {
  playerId: string;
  playerName: string;
  teamKey?: string | null;
  showIntelligence: boolean;
  historicalBrand?: HistoricalTeamBrand | null;
  honor?: GlassSurfaceHonor;
}) {
  if (!showIntelligence) return null;

  const [movementBundle, sentimentProfile] = await Promise.all([
    getPlayerMovementBundle(playerId),
    getPlayerSentimentBundle(playerId),
  ]);

  return (
    <PlayerIntelligenceRail
      playerId={playerId}
      playerName={playerName}
      teamKey={teamKey}
      movementBundle={movementBundle}
      sentimentProfile={sentimentProfile}
      historicalBrand={historicalBrand}
      honor={honor}
    />
  );
}
