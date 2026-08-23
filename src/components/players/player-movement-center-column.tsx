import { MovementRumorPanel } from "@/components/players/movement-rumor-panel";
import {
  GlassSurface,
  type GlassSurfaceHonor,
} from "@/components/brand/glass-surface";
import { resolveMovementPresentation } from "@/movement-center/prominence";
import type { PlayerMovementBundle } from "@/movement-center/types";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import type { HistoricalTeamBrand } from "@/lib/historical-team-brand";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

/**
 * Player overview column for Movement Center / seasonal Rumor Mill.
 * @deprecated Prefer PlayerIntelligenceRail with Rumor Mill tab.
 */
export function PlayerMovementCenterColumn({
  playerId,
  playerName,
  teamKey,
  bundle,
  historicalBrand,
  honor,
}: {
  playerId: string;
  playerName: string;
  teamKey?: string | null;
  bundle?: PlayerMovementBundle | null;
  historicalBrand?: HistoricalTeamBrand | null;
  honor?: GlassSurfaceHonor;
}) {
  const presentation = resolveMovementPresentation();
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
      <div className="relative z-[1] flex w-full flex-col gap-3 px-3 py-2.5">
        <div className="flex flex-col gap-0.5">
          <p
            className={cn(
              type.caption,
              "font-semibold uppercase tracking-wide text-muted-foreground"
            )}
          >
            {presentation.productName}
          </p>
        </div>
        <MovementRumorPanel
          playerId={playerId}
          playerName={playerName}
          bundle={bundle}
        />
      </div>
    </GlassSurface>
  );
}
