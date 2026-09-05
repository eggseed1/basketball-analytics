import { PlayerSentimentView } from "@/components/players/player-sentiment-view";
import { PlayerPanelUnavailable } from "@/components/players/player-page-skeletons";
import type { GlassSurfaceHonor } from "@/components/brand/glass-surface";
import { slimEdgeProductEnabled } from "@/data/providers/nba/runtime-policy";
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
  try {
    // Slim edge: skip movement-center disk/scoring path. Paid Workers load it.
    const constrained = slimEdgeProductEnabled();
    const [sentimentProfile, snapshot, movementBundle, currentSeasonTeamKey] =
      await Promise.all([
        getPlayerSentimentBundle(playerId).catch(() => null),
        Promise.resolve(loadSentimentSnapshot()),
        constrained
          ? Promise.resolve(null)
          : import("@/data/queries/movement-center.server")
              .then((m) => m.getPlayerMovementBundle(playerId))
              .catch(() => null),
        constrained
          ? Promise.resolve(null)
          : import("@/data/queries/player-current-team")
              .then((m) => m.resolvePlayerCurrentSeasonTeamKey(playerId))
              .catch(() => null),
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
  } catch {
    return (
      <PlayerPanelUnavailable
        label="Sentiment unavailable"
        detail="Player sentiment could not be loaded for this request."
        className="min-h-[16rem]"
      />
    );
  }
}
