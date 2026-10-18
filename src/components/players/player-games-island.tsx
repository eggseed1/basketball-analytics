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
  seasonType = "regular",
  teamKey,
}: {
  playerId: string;
  season: string;
  seasonType?: PlayerSeasonKind;
  teamKey?: string | null;
}) {
  try {
    const { slimEdgeProductEnabled } = await import(
      "@/data/providers/nba/runtime-policy"
    );
    if (slimEdgeProductEnabled()) {
      return (
        <section id="games" className="scroll-mt-16">
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            Game logs are temporarily limited on this edge. Overview and career
            stats remain available.
          </p>
        </section>
      );
    }

    const log = await getPlayerGameLogCached(playerId, season).catch(() => []);
    const gameLog = log.filter(
      (g) => (g.seasonType ?? "regular") === seasonType
    );
    const wash = brandAtmosphereColors(
      resolveTeamBrand(teamKey)?.primary,
      resolveTeamBrand(teamKey)?.secondary
    );
    const kindLabel =
      seasonType === "playoffs" ? "playoff" : "regular-season";

    return (
      <section id="games" className="scroll-mt-16 flex flex-col gap-3" aria-label="Game logs">
        <div>
          <h2 className={type.heading}>Game logs</h2>
          <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
            Filter by stat group, home or away, or starter. Date opens
            Game Lab.
          </p>
        </div>
        <PlayerGameLogBoard
          games={gameLog}
          season={season}
          seasonType={seasonType}
          seasonTypeLabel={kindLabel}
          accentColor={wash?.colorA}
          accentColorB={wash?.colorB}
        />
      </section>
    );
  } catch {
    return (
      <section id="games" className="scroll-mt-16">
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          Game logs temporarily unavailable.
        </p>
      </section>
    );
  }
}
