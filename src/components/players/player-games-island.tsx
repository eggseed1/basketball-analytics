import { GlassSurface } from "@/components/brand/glass-surface";
import { PlayerGameLogBoard } from "@/components/players/player-game-log-board";
import { getPlayerGameLogCached } from "@/data/queries/request-cache";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import { resolveTeamBrand } from "@/lib/nba-brand";
import type { PlayerSeasonKind } from "@/lib/player-destination";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export async function PlayerGamesIsland({
  playerId,
  season,
  seasons,
  seasonType = "regular",
  teamKey,
}: {
  playerId: string;
  season: string;
  seasons: string[];
  seasonType?: PlayerSeasonKind;
  teamKey?: string | null;
}) {
  const log = await getPlayerGameLogCached(playerId, season);
  const gameLog = log.filter((g) => (g.seasonType ?? "regular") === seasonType);
  const wash = brandAtmosphereColors(
    resolveTeamBrand(teamKey)?.primary,
    resolveTeamBrand(teamKey)?.secondary
  );
  const kindLabel =
    seasonType === "playoffs" ? "playoff" : "regular-season";

  return (
    <section id="games" className="scroll-mt-16" aria-label="Game logs">
      <GlassSurface
        effect="css"
        accentColor={wash?.colorA}
        accentColorB={wash?.colorB}
        className="flex flex-col gap-3 p-4 sm:p-5"
      >
        <div>
          <h2 className={type.heading}>Game logs</h2>
          <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
            Filter by season, stat group, home/away, or starter. Date opens
            Game Lab.
          </p>
        </div>
        <PlayerGameLogBoard
          games={gameLog}
          season={season}
          seasons={seasons}
          seasonType={seasonType}
          seasonTypeLabel={kindLabel}
        />
      </GlassSurface>
    </section>
  );
}
