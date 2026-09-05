"use client";

import {
  GlassSurface,
  type GlassSurfaceHonor,
} from "@/components/brand/glass-surface";
import { MovementRumorPanel } from "@/components/players/movement-rumor-panel";
import { PlayerSentimentGraph } from "@/components/players/player-sentiment-graph";
import { SentimentFanMediaGap } from "@/components/sentiment/sentiment-fan-media-gap";
import { SentimentTrendChartLazy as SentimentTrendChart } from "@/components/charts/recharts-lazy";
import type { PlayerMovementBundle } from "@/movement-center/types";
import type { PlayerSentimentProfile } from "@/sentiment/curated-types";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import type { HistoricalTeamBrand } from "@/lib/historical-team-brand";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export function PlayerSentimentView({
  playerId,
  playerName,
  teamKey,
  sentimentProfile,
  movementBundle,
  snapshotStatus,
  disclaimer,
  historicalBrand,
  honor,
}: {
  playerId: string;
  playerName: string;
  teamKey?: string | null;
  sentimentProfile?: (PlayerSentimentProfile & { disclaimer: string }) | null;
  movementBundle?: PlayerMovementBundle | null;
  snapshotStatus?: string;
  disclaimer?: string;
  historicalBrand?: HistoricalTeamBrand | null;
  honor?: GlassSurfaceHonor;
}) {
  const modernBrand = resolveTeamBrand(teamKey);
  const wash = brandAtmosphereColors(
    historicalBrand?.palette?.primary ?? modernBrand?.primary,
    historicalBrand?.palette?.secondary ?? modernBrand?.secondary
  );
  const hasSeries = Boolean(
    sentimentProfile?.series?.fan.length || sentimentProfile?.series?.media.length
  );

  return (
    <section
      id="sentiment"
      className="scroll-mt-16 flex flex-col gap-4"
      aria-label="Sentiment"
    >
      <header className="flex flex-col gap-1">
        <h2 className={type.heading}>Sentiment & trade track</h2>
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          Fan and media perception with movement context playing alongside —
          separate from performance percentiles.
        </p>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(14rem,18rem)]">
        <GlassSurface
          accentColor={wash?.colorA}
          accentColorB={wash?.colorB}
          className="flex min-w-0 flex-col gap-4 p-4"
          effect="css"
          honor={honor}
        >
          {sentimentProfile && hasSeries ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <SentimentTrendChart
                label="Fan sentiment"
                color="rgb(59 130 246)"
                points={sentimentProfile.series?.fan ?? []}
              />
              <SentimentTrendChart
                label="Media sentiment"
                color="rgb(168 85 247)"
                points={sentimentProfile.series?.media ?? []}
              />
            </div>
          ) : null}

          {sentimentProfile ? (
            <>
              <SentimentFanMediaGap
                fanScore={sentimentProfile.fan.score}
                mediaScore={sentimentProfile.media.score}
              />
              <PlayerSentimentGraph
                playerName={playerName}
                profile={sentimentProfile}
                detailed
              />
            </>
          ) : (
            <p className={cn(type.bodySm, "text-muted-foreground")}>
              No sentiment coverage for {playerName} in the current prototype
              snapshot. Trade track still pulls Movement Center evidence when
              available.
            </p>
          )}

          {disclaimer ? (
            <p className={cn(type.caption, "text-muted-foreground")}>
              {snapshotStatus === "CURATED_PROTOTYPE" ? "Prototype · " : ""}
              {disclaimer}
              {!sentimentProfile
                ? " Deep charts load for players in the illustrative M1 seed."
                : ""}
            </p>
          ) : null}
        </GlassSurface>

        <GlassSurface
          accentColor={wash?.colorA}
          accentColorB={wash?.colorB}
          className="min-w-0 p-4"
          effect="css"
          honor={honor}
        >
          <div className="mb-3 flex flex-col gap-0.5">
            <h3 className={cn(type.bodySm, "font-bold")}>Trade track</h3>
            <p className={cn(type.caption, "text-muted-foreground")}>
              Rumor mill & movement evidence alongside sentiment
            </p>
          </div>
          <MovementRumorPanel
            playerId={playerId}
            playerName={playerName}
            bundle={movementBundle}
          />
        </GlassSurface>
      </div>
    </section>
  );
}
