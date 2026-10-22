import { PlayerArrivalLine } from "@/components/acquisitions/acquisition-story";
import {
  GlassSurface,
  type GlassSurfaceHonor,
} from "@/components/brand/glass-surface";
import { PlayerContractTransactions } from "@/components/players/player-contract-transactions";
import { PlayerSalaryPayoff } from "@/components/players/player-salary-payoff";
import { withBudget } from "@/data/queries/budget";
import { getPlayerArrival, teamNicknames } from "@/data/queries/acquisition-paths";
import { getPlayerContractSnapshot } from "@/data/queries/player-front-office";
import { contractValueModel, getContractValue } from "@/data/runtime/contract-value";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import type { HistoricalTeamBrand } from "@/lib/historical-team-brand";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

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
  const { value: arrival } = await withBudget(
    loadArrival(teamKey, [espnId, playerId, nbaId], playerName),
    4_000,
    null
  );
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

/**
 * Contract / salary island.
 * Overview: surplus tiles + deep link. Salary tab: contract years vs cap, surplus, played off.
 */
export async function PlayerContractSectionIsland({
  playerId,
  playerName,
  teamKey,
  nbaId,
  season,
  variant = "full",
}: {
  playerId: string;
  playerName: string;
  teamKey?: string | null;
  nbaId?: string | null;
  /** Season picked in the URL, if any. */
  season?: string | null;
  variant?: "summary" | "full";
}) {
  let contract: Awaited<ReturnType<typeof getPlayerContractSnapshot>>;
  try {
    contract = await getPlayerContractSnapshot(playerId, teamKey, playerName);
  } catch (error) {
    console.error("[player-contract] optional section failed", {
      playerId,
      teamKey,
      error: error instanceof Error ? error.message : String(error),
    });
    if (variant === "full") {
      return (
        <section
          id="salary"
          className="scroll-mt-16 flex flex-col gap-2"
          aria-label="Salary"
        >
          <h2 className={type.heading}>Salary</h2>
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            Contract data is temporarily unavailable.
          </p>
        </section>
      );
    }
    return null;
  }
  if (!contract) {
    if (variant === "full") {
      return (
        <section
          id="salary"
          className="scroll-mt-16 flex flex-col gap-2"
          aria-label="Salary"
        >
          <h2 className={type.heading}>Salary</h2>
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            No current contract on file for this player.
          </p>
          <p className={cn(type.caption, "text-muted-foreground")}>
            Waived deals and some two-ways stay off the baked payroll snapshot.
          </p>
        </section>
      );
    }
    return null;
  }
  return (
    <PlayerContractTransactions
      playerId={playerId}
      contract={contract}
      value={getContractValue(contract.franchiseId, contract.brefId)}
      model={contractValueModel()}
      season={season}
      variant={variant}
    >
      {variant === "full" ? (
        <PlayerSalaryPayoff
          nbaId={nbaId ?? (/^\d+$/.test(playerId) ? playerId : null)}
          playerId={playerId}
          season={season}
        />
      ) : null}
    </PlayerContractTransactions>
  );
}
