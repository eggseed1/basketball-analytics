import { PlayerSentimentView } from "@/components/players/player-sentiment-view";
import type { GlassSurfaceHonor } from "@/components/brand/glass-surface";
import { getPlayerMovementBundle } from "@/data/queries/movement-center.server";
import { resolvePlayerCurrentSeasonTeamKey } from "@/data/queries/player-current-team";
import { getPlayerSentimentBundle } from "@/data/queries/player-sentiment";
import { loadSentimentSnapshot } from "@/sentiment/load-curated";
import type { HistoricalTeamBrand } from "@/lib/historical-team-brand";

export async function PlayerSentimentTabIsland({
  playerId,
  playerName,
  teamKey,
  historicalBrand,
  honor,
}: {
  playerId: string;
  playerName: string;
  teamKey?: string | null;
  historicalBrand?: HistoricalTeamBrand | null;
  honor?: GlassSurfaceHonor;
}) {
  const [movementBundle, sentimentProfile, snapshot, currentSeasonTeamKey] =
    await Promise.all([
      getPlayerMovementBundle(playerId),
      getPlayerSentimentBundle(playerId),
      Promise.resolve(loadSentimentSnapshot()),
      resolvePlayerCurrentSeasonTeamKey(playerId),
    ]);

  const resolvedTeamKey =
    currentSeasonTeamKey ?? sentimentProfile?.teamKey ?? teamKey;

  return (
    <PlayerSentimentView
      playerId={playerId}
      playerName={playerName}
      teamKey={resolvedTeamKey}
      sentimentProfile={sentimentProfile}
      movementBundle={movementBundle}
      snapshotStatus={snapshot?.meta.status}
      disclaimer={snapshot?.meta.disclaimer}
      historicalBrand={historicalBrand}
      honor={honor}
    />
  );
}
