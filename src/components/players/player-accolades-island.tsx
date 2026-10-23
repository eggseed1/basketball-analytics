import { PlayerAccolades } from "@/components/players/player-accolades";
import { PlayerRetiredJerseys } from "@/components/players/player-retired-jerseys";
import { withBudget } from "@/data/queries/budget";
import { getPlayerAccolades } from "@/data/queries/player-awards";
import { getPlayerRetiredJerseys } from "@/data/queries/player-retired-jerseys";
import type { GlassSurfaceHonor } from "@/components/brand/glass-surface";
import type { HistoricalTeamBrand } from "@/lib/historical-team-brand";

/** Streams trophy tags + retired jerseys off the player-page critical path. */
export async function PlayerAccoladesIsland({
  playerId,
  playerName,
}: {
  playerId: string;
  playerName?: string | null;
  teamKey?: string | null;
  historicalBrand?: HistoricalTeamBrand | null;
  honor?: GlassSurfaceHonor;
}) {
  const { value } = await withBudget(
    Promise.all([
      getPlayerAccolades(playerId).catch(() => [] as Awaited<
        ReturnType<typeof getPlayerAccolades>
      >),
      getPlayerRetiredJerseys(playerId, playerName).catch(() => [] as Awaited<
        ReturnType<typeof getPlayerRetiredJerseys>
      >),
    ]),
    4_000,
    [[], []] as const
  );
  const [badges, jerseys] = value;
  if (!badges.length && !jerseys.length) return null;

  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-2">
      <PlayerAccolades badges={badges} compact />
      <PlayerRetiredJerseys jerseys={jerseys} className="mt-0 justify-center" />
    </div>
  );
}
