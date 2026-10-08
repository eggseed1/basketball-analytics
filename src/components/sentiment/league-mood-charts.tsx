"use client";

import { useState } from "react";

import { SentimentTrendChartLazy as SentimentTrendChart } from "@/components/charts/recharts-lazy";
import {
  LaneOriginTag,
  laneUnit,
  sentimentPct,
} from "@/components/sentiment/sentiment-source";
import {
  SENTIMENT_WINDOW_OPTIONS,
  type CuratedSentimentLane,
  type SentimentMoodSeries,
  type SentimentWindowId,
} from "@/sentiment/curated-types";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function WindowChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        type.caption,
        "glass-pill rounded-md px-2.5 py-1 font-semibold transition-colors",
        active
          ? "glass-pill-active"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function MoodPanel({
  title,
  color,
  lane,
  points,
  windowId,
}: {
  title: string;
  color: string;
  lane?: CuratedSentimentLane;
  points: SentimentMoodSeries["fan"];
  windowId: SentimentWindowId;
}) {
  const total = points.reduce((sum, p) => sum + (p.count ?? 0), 0);
  return (
    <div className="sports-card flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className={cn(type.caption, "font-semibold text-foreground")}>{title}</h3>
          <LaneOriginTag lane={lane} />
        </div>
        <span className={cn(type.caption, "tabular-nums text-muted-foreground")}>
          {lane ? sentimentPct(lane.score) : "—"}
          {lane && total ? ` · ${total.toLocaleString()} ${laneUnit(lane.origin)}` : ""}
        </span>
      </div>
      {lane && points.length ? (
        <SentimentTrendChart
          key={windowId}
          label={title}
          color={color}
          points={points}
          countLabel={laneUnit(lane.origin)}
          showLabel={false}
        />
      ) : (
        <p className={cn(type.caption, "text-muted-foreground")}>
          No measured data in this window yet, so this side is left blank.
        </p>
      )}
    </div>
  );
}

export function LeagueMoodCharts({
  moodSeriesByWindow,
  moodLanes,
  defaultWindow = "7d",
}: {
  moodSeriesByWindow: Record<SentimentWindowId, SentimentMoodSeries>;
  moodLanes: { fan?: CuratedSentimentLane; media?: CuratedSentimentLane };
  defaultWindow?: SentimentWindowId;
}) {
  const [window, setWindow] = useState<SentimentWindowId>(defaultWindow);
  const series = moodSeriesByWindow[window];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className={cn(type.bodySm, "font-bold")}>League mood · {window}</h2>
          <p className={cn(type.caption, "text-muted-foreground")}>
            50% is neutral. The thick line is a 3-day average once there are enough days.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Time window">
          {SENTIMENT_WINDOW_OPTIONS.map((option) => (
            <WindowChip
              key={option.id}
              active={window === option.id}
              onClick={() => setWindow(option.id)}
            >
              {option.label}
            </WindowChip>
          ))}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <MoodPanel
          title="Fan mood"
          color="rgb(59 130 246)"
          lane={moodLanes.fan}
          points={series.fan}
          windowId={window}
        />
        <MoodPanel
          title="Media mood"
          color="rgb(168 85 247)"
          lane={moodLanes.media}
          points={series.media}
          windowId={window}
        />
      </div>
    </section>
  );
}
