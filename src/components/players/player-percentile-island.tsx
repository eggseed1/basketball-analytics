import { PlayerPercentilePanel } from "@/components/players/player-percentile-panel";
import type { GlassSurfaceHonor } from "@/components/brand/glass-surface";
import type { PlayerSeason } from "@/data/types";
import { loadPlayerPercentileMetrics } from "@/lib/player-percentile-load";
import { resolvePlayerStatsSeason } from "@/lib/player-board-season";
import { cardStintsForSeason } from "@/lib/player-team-context";
import { PriorSeasonStatsNotice } from "@/components/explore/season-not-started-notice";

export async function PlayerPercentileIsland({
  playerId,
  displayName,
  season,
  career,
  seasonOptions,
  seasonTeams,
  identityTeamKey,
  honor,
  nbaId,
}: {
  playerId: string;
  displayName: string;
  season: string;
  career: PlayerSeason[];
  seasonOptions: string[];
  seasonTeams: Record<string, string>;
  identityTeamKey?: string | null;
  honor?: GlassSurfaceHonor;
  nbaId?: string | null;
}) {
  const { metrics, teamKey } = await loadPlayerPercentileMetrics(
    playerId,
    season,
    career,
    identityTeamKey,
    { nbaId, mode: "fast" }
  );
  const statsCtx = resolvePlayerStatsSeason(career, season);
  const stintsBySeason = Object.fromEntries(
    seasonOptions.map((option) => [option, cardStintsForSeason(career, option)])
  );

  return (
    <div className="flex flex-col gap-3">
      {statsCtx.usingPriorSeasonStats ? (
        <PriorSeasonStatsNotice
          requestSeason={statsCtx.requestSeason}
          statsSeason={statsCtx.statsSeason}
        />
      ) : null}
      <PlayerPercentilePanel
        season={season}
        seasons={seasonOptions}
        playerId={playerId}
        playerName={displayName}
        teamKey={teamKey}
        seasonTeams={seasonTeams}
        stintsBySeason={stintsBySeason}
        metrics={metrics}
        honor={honor}
      />
    </div>
  );
}
