import {
  GlassSurface,
  type GlassSurfaceHonor,
} from "@/components/brand/glass-surface";
import { PlayerContractTransactions } from "@/components/players/player-contract-transactions";
import { getPlayerContractSnapshot } from "@/data/queries/player-front-office";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import type { HistoricalTeamBrand } from "@/lib/historical-team-brand";
import { resolveTeamBrand } from "@/lib/nba-brand";

/** Salary snapshot — streams under per-game averages in the left column. */
export async function PlayerContractTransactionsIsland({
  playerId,
  teamKey,
  historicalBrand,
  honor,
}: {
  playerId: string;
  playerName: string;
  teamKey?: string | null;
  historicalBrand?: HistoricalTeamBrand | null;
  honor?: GlassSurfaceHonor;
}) {
  try {
    const contract = await getPlayerContractSnapshot(playerId, teamKey);
    if (!contract) return null;

    const modernBrand = resolveTeamBrand(teamKey);
    const wash = brandAtmosphereColors(
      historicalBrand?.palette?.primary ?? modernBrand?.primary,
      historicalBrand?.palette?.secondary ?? modernBrand?.secondary
    );

    return (
      <GlassSurface
        accentColor={wash?.colorA}
        accentColorB={wash?.colorB}
        className="relative min-w-0 p-0"
        effect="css"
        honor={honor}
      >
        <PlayerContractTransactions contract={contract} />
      </GlassSurface>
    );
  } catch (error) {
    // This card is optional. A salary snapshot or roster outage must never
    // reject the player page's streamed RSC response.
    console.error("[player-contract] optional island failed", {
      playerId,
      teamKey,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}