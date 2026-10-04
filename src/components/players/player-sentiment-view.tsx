"use client";

import type { ReactNode } from "react";

import {
  GlassSurface,
  type GlassSurfaceHonor,
} from "@/components/brand/glass-surface";
import { MovementRumorPanel } from "@/components/players/movement-rumor-panel";
import { PlayerSentimentGraph } from "@/components/players/player-sentiment-graph";
import { SentimentFanMediaGap } from "@/components/sentiment/sentiment-fan-media-gap";
import {
  formatSentimentDate,
  LaneOriginTag,
  laneOriginLabel,
  ratingLabel,
  sentimentPct,
} from "@/components/sentiment/sentiment-source";
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
  disclaimer,
  historicalBrand,
  honor,
  gamesSlot,
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
  /** Server-streamed "Sentiment by game" section. */
  gamesSlot?: ReactNode;
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
          Fan and media perception alongside movement context, tracked
          separately from performance percentiles.
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
              {sentimentProfile.fan ? (
                <div className="flex flex-col gap-1.5">
                  <LaneOriginTag lane={sentimentProfile.fan} className="self-start" />
                  <SentimentTrendChart
                    label="Fan sentiment"
                    color="rgb(59 130 246)"
                    points={sentimentProfile.series?.fan ?? []}
                    countLabel="posts"
                  />
                </div>
              ) : null}
              {sentimentProfile.media ? (
                <div className="flex flex-col gap-1.5">
                  <LaneOriginTag lane={sentimentProfile.media} className="self-start" />
                  <SentimentTrendChart
                    label="Media sentiment"
                    color="rgb(168 85 247)"
                    points={sentimentProfile.series?.media ?? []}
                    countLabel="headlines"
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {sentimentProfile ? (
            <>
              {sentimentProfile.fan &&
              sentimentProfile.media &&
              (sentimentProfile.fan.origin === "curated") ===
                (sentimentProfile.media.origin === "curated") ? (
                <SentimentFanMediaGap
                  fanScore={sentimentProfile.fan.score}
                  mediaScore={sentimentProfile.media.score}
                />
              ) : sentimentProfile.fan && sentimentProfile.media ? (
                <p className={cn(type.caption, "text-muted-foreground")}>
                  No fan vs media gap here. The fan lane is{" "}
                  {laneOriginLabel(sentimentProfile.fan.origin).toLowerCase()} and the media lane
                  comes from {laneOriginLabel(sentimentProfile.media.origin).toLowerCase()}. They
                  cover different periods and methods, so subtracting them would mislead.
                </p>
              ) : null}
              <PlayerSentimentGraph
                playerName={playerName}
                profile={sentimentProfile}
                detailed
              />
              {sentimentProfile.headlines?.length ? (
                <div className="flex flex-col gap-2">
                  <h3 className={cn(type.bodySm, "font-bold")}>Headlines behind the media score</h3>
                  <ul className="flex flex-col gap-1.5">
                    {sentimentProfile.headlines.map((headline) => (
                      <li key={headline.url} className="flex items-start gap-2">
                        <span
                          className={cn(
                            type.caption,
                            "w-16 shrink-0 text-right font-semibold tabular-nums",
                            (headline.rating ?? headline.score) >= 0.2
                              ? "text-delta-up"
                              : (headline.rating ?? headline.score) <= -0.2
                                ? "text-delta-down"
                                : "text-muted-foreground"
                          )}
                          title={
                            headline.rating !== undefined
                              ? `Language model rating of this headline toward ${playerName}`
                              : "Word-list tone of the headline and summary, 50% is neutral"
                          }
                        >
                          {headline.rating !== undefined
                            ? ratingLabel(headline.rating)
                            : sentimentPct(headline.score)}
                        </span>
                        <a
                          href={headline.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(type.caption, "hover:underline")}
                        >
                          {headline.title}
                          <span className="text-muted-foreground">
                            {" "}
                            · {headline.outlet}, {formatSentimentDate(headline.publishedAt)}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : (
            <p className={cn(type.bodySm, "text-muted-foreground")}>
              No sentiment coverage for {playerName} yet. Media tone appears once 3 headlines name
              him in a week. Trade track still pulls Movement Center evidence when available.
            </p>
          )}

          {disclaimer ? (
            <p className={cn(type.caption, "text-muted-foreground")}>{disclaimer}</p>
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

      {gamesSlot ? (
        <GlassSurface
          accentColor={wash?.colorA}
          accentColorB={wash?.colorB}
          className="min-w-0 p-4"
          effect="css"
          honor={honor}
        >
          {gamesSlot}
        </GlassSurface>
      ) : null}
    </section>
  );
}
