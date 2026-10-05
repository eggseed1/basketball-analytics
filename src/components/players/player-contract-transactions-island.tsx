import { PlayerArrivalLine } from "@/components/acquisitions/acquisition-story";
import {
  GlassSurface,
  type GlassSurfaceHonor,
} from "@/components/brand/glass-surface";
import { PlayerContractTransactions } from "@/components/players/player-contract-transactions";
import { getPlayerArrival, teamNicknames } from "@/data/queries/acquisition-paths";
import { getPlayerContractSnapshot } from "@/data/queries/player-front-office";
import { contractValueModel, getContractValue } from "@/data/runtime/contract-value";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import type { HistoricalTeamBrand } from "@/lib/historical-team-brand";
import { resolveTeamBrand } from "@/lib/nba-brand";

async function loadArrival(
  teamKey: string | null | undefined,
  playerIds: Array<string | null | undefined>,
  name: string
) {
  const teamId = resolveTeamBrand(teamKey)?.espnTeamId;
  if (!teamId) return null;
  const hit = await getPlayerArrival({ teamId, playerIds, name }).catch(() => null);
  return hit ? { teamId, ...hit } : null;
}

/** How the team got him; sits in the identity column. */
export async function PlayerArrivalIsland({
  playerId,
  espnId,
  nbaId,
  playerName,
  teamKey,
  historicalBrand,
  honor,
}: {
  playerId: string;
  espnId?: string | null;
  nbaId?: string | null;
  playerName: string;
  teamKey?: string | null;
  historicalBrand?: HistoricalTeamBrand | null;
  honor?: GlassSurfaceHonor;
}) {
  const arrival = await loadArrival(teamKey, [espnId, playerId, nbaId], playerName);
  if (!arrival) return null;

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
      <div className="relative z-[1] px-3 py-2.5">
        <PlayerArrivalLine
          teamId={arrival.teamId}
          arrival={arrival.arrival}
          player={arrival.player}
          names={teamNicknames()}
        />
      </div>
    </GlassSurface>
  );
}

/** Contract years with the surplus estimate; its own section in the main column. */
export async function PlayerContractSectionIsland({
  playerId,
  playerName,
  teamKey,
}: {
  playerId: string;
  playerName: string;
  teamKey?: string | null;
}) {
  let contract: Awaited<ReturnType<typeof getPlayerContractSnapshot>>;
  try {
    contract = await getPlayerContractSnapshot(playerId, teamKey, playerName);
  } catch (error) {
    // Optional section. A salary snapshot outage must never reject the
    // player page's streamed RSC response.
    console.error("[player-contract] optional section failed", {
      playerId,
      teamKey,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
  if (!contract) return null;
  return (
    <PlayerContractTransactions
      contract={contract}
      value={getContractValue(contract.franchiseId, contract.brefId)}
      model={contractValueModel()}
    />
  );
}
