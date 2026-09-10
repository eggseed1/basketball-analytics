import { PlayerAccolades } from "@/components/players/player-accolades";
import { PlayerRetiredJerseys } from "@/components/players/player-retired-jerseys";
import { getPlayerAccolades } from "@/data/queries/player-awards";
import { getPlayerRetiredJerseys } from "@/data/queries/player-retired-jerseys";
import type { GlassSurfaceHonor } from "@/components/brand/glass-surface";
import type { HistoricalTeamBrand } from "@/lib/historical-team-brand";

/** Streams trophy tags + retired jerseys off the player-page critical path. */
export async function PlayerAccoladesIsland({
  playerId,
}: {
  playerId: string;
  teamKey?: string | null;
  historicalBrand?: HistoricalTeamBrand | null;
  honor?: GlassSurfaceHonor;
}) {
  const [badges, jerseys] = await Promise.all([
    getPlayerAccolades(playerId).catch(() => []),
    getPlayerRetiredJerseys(playerId).catch(() => []),
  ]);
  if (!badges.length && !jerseys.length) return null;

  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-2">
      <PlayerAccolades badges={badges} compact />
      <PlayerRetiredJerseys jerseys={jerseys} className="mt-0 justify-center" />
    </div>
  );
}
