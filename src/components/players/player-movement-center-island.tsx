import { PlayerMovementCenterColumn } from "@/components/players/player-movement-center-column";
import type { GlassSurfaceHonor } from "@/components/brand/glass-surface";
import { getPlayerMovementBundle } from "@/data/queries/movement-center.server";
import type { HistoricalTeamBrand } from "@/lib/historical-team-brand";

/** Movement Center column — curated M1 snapshot when available. */
export async function PlayerMovementCenterIsland({
  playerId,
  playerName,
  teamKey,
  showMovementCenter,
  historicalBrand,
  honor,
}: {
  playerId: string;
  playerName: string;
  teamKey?: string | null;
  showMovementCenter: boolean;
  historicalBrand?: HistoricalTeamBrand | null;
  honor?: GlassSurfaceHonor;
}) {
  if (!showMovementCenter) return null;

  const bundle = await getPlayerMovementBundle(playerId);

  return (
    <PlayerMovementCenterColumn
      playerId={playerId}
      playerName={playerName}
      teamKey={teamKey}
      bundle={bundle}
      historicalBrand={historicalBrand}
      honor={honor}
    />
  );
}
