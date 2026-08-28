import {
  GlassSurface,
  type GlassSurfaceHonor,
} from "@/components/brand/glass-surface";
import { PlayerAccolades } from "@/components/players/player-accolades";
import { PlayerRetiredJerseys } from "@/components/players/player-retired-jerseys";
import { getPlayerAccolades } from "@/data/queries/player-awards";
import { getPlayerRetiredJerseys } from "@/data/queries/player-retired-jerseys";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import type { HistoricalTeamBrand } from "@/lib/historical-team-brand";
import { resolveTeamBrand } from "@/lib/nba-brand";

/** Streams trophy row + retired jerseys off the player-page critical path. */
export async function PlayerAccoladesIsland({
  playerId,
  teamKey,
  historicalBrand,
  honor,
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
      effect="liquid"
      backdropBlur={28}
      honor={honor}
    >
      <div className="relative z-[1] flex flex-col items-stretch gap-2.5 px-3 py-3">
        <PlayerRetiredJerseys jerseys={jerseys} className="mt-0 justify-start" />
        <PlayerAccolades badges={badges} compact className="max-w-none" />
      </div>
    </GlassSurface>
  );
}
