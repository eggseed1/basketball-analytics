import { GlassSurface } from "@/components/brand/glass-surface";
import { PriorSeasonStatsNotice } from "@/components/explore/season-not-started-notice";
import { PlayerGameLogBoard } from "@/components/players/player-game-log-board";
import {
  getPlayerCareerSeasonsCached,
  getPlayerGameLogCached,
} from "@/data/queries/request-cache";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { resolvePlayerStatsSeason } from "@/lib/player-board-season";
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
  const career = await getPlayerCareerSeasonsCached(playerId).catch(() => []);
  const statsCtx = resolvePlayerStatsSeason(career, season);
  const effectiveSeason = statsCtx.statsSeason;
  const log = await getPlayerGameLogCached(playerId, effectiveSeason);
  const gameLog = log.filter(
    (game) => (game.seasonType ?? "regular") === seasonType
  );
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
        {statsCtx.usingPriorSeasonStats ? (
          <PriorSeasonStatsNotice
            requestSeason={statsCtx.requestSeason}
            statsSeason={effectiveSeason}
          />
        ) : null}
        <PlayerGameLogBoard
          games={gameLog}
          season={effectiveSeason}
          seasons={seasons}
          seasonType={seasonType}
          seasonTypeLabel={kindLabel}
        />
      </GlassSurface>
    </section>
  );
}
