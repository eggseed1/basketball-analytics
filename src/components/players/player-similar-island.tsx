import { GlassSurface } from "@/components/brand/glass-surface";
import { PlayerCompFuturesPanel } from "@/components/players/player-comp-futures-panel";
import { PlayerSimilarClient } from "@/components/players/player-similar-client";
import type { GlassSurfaceHonor } from "@/components/brand/glass-surface";
import type { PlayerSeason } from "@/data/types";
import { resolvePlayerStatsSeason } from "@/lib/player-board-season";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

/**
 * Similar players section — shell only on the server.
 * Comp lists fetch client-side so player HTML does not wait on peer boards twice.
 */
export async function PlayerSimilarIsland({
  playerId,
  season,
  career,
  identityTeamKey,
  espnId,
  honor,
}: {
  playerId: string;
  season: string;
  career: PlayerSeason[];
  identityTeamKey?: string | null;
  nbaId?: string | null;
  espnId?: string | null;
  honor?: GlassSurfaceHonor;
}) {
  const statsCtx = resolvePlayerStatsSeason(career, season);
  const statsSeason = statsCtx.statsSeason ?? season;
  const futuresFocal =
    career.find((row) => row.season === statsSeason) ?? career[0] ?? null;
  if (!futuresFocal && career.length === 0) return null;

  const focalCompareId = espnId || playerId;
  const compareHref = `/compare?a=${encodeURIComponent(focalCompareId)}&season=${encodeURIComponent(statsSeason)}`;

  return (
    <GlassSurface
      as="section"
      honor={honor}
      id="similar-players"
      className="flex flex-col gap-3 p-4 sm:p-5"
    >
      <div>
        <h2 className={cn(type.heading, "tracking-tight")}>Similar players</h2>
        <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
          Closest {statsSeason} profiles and lookalikes in other seasons. The
          chart below is same-age comps on the impact chip you pick.
        </p>
      </div>
      <PlayerSimilarClient
        playerId={playerId}
        season={statsSeason}
        espnId={espnId}
        focalCompareId={focalCompareId}
        compareHref={compareHref}
      />
      <PlayerCompFuturesPanel
        focal={futuresFocal}
        teamKey={identityTeamKey}
        espnId={espnId}
      />
    </GlassSurface>
  );
}
