import { PlayerArrivalLine } from "@/components/acquisitions/acquisition-story";
import {
  GlassSurface,
  type GlassSurfaceHonor,
} from "@/components/brand/glass-surface";
import { PlayerContractTransactions } from "@/components/players/player-contract-transactions";
import { getPlayerArrival, teamNicknames } from "@/data/queries/acquisition-paths";
import { getPlayerContractSnapshot } from "@/data/queries/player-front-office";
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

/** Salary snapshot and how the team got him; streams under per-game averages. */
export async function PlayerContractTransactionsIsland({
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
  let loaded: [
    Awaited<ReturnType<typeof getPlayerContractSnapshot>>,
    Awaited<ReturnType<typeof loadArrival>>,
  ];
  try {
    loaded = await Promise.all([
      getPlayerContractSnapshot(playerId, teamKey),
      loadArrival(teamKey, [espnId, playerId, nbaId], playerName),
    ]);
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
  const [contract, arrival] = loaded;
  if (!contract && !arrival) return null;

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
      {arrival ? (
        <div className="relative z-[1] px-3 pt-2.5">
          <PlayerArrivalLine
            teamId={arrival.teamId}
            arrival={arrival.arrival}
            player={arrival.player}
            names={teamNicknames()}
          />
        </div>
      ) : null}
      {contract ? <PlayerContractTransactions contract={contract} /> : null}
    </GlassSurface>
  );
}
