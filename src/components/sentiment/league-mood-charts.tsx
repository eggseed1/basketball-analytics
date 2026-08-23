"use client";

import { useState } from "react";

import { SentimentTrendChart } from "@/components/players/sentiment-trend-chart";
import {
  SENTIMENT_WINDOW_OPTIONS,
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

export function LeagueMoodCharts({
  moodSeriesByWindow,
  defaultWindow = "7d",
}: {
  moodSeriesByWindow: Record<SentimentWindowId, SentimentMoodSeries>;
  defaultWindow?: SentimentWindowId;
}) {
  const [window, setWindow] = useState<SentimentWindowId>(defaultWindow);
  const series = moodSeriesByWindow[window];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={cn(type.bodySm, "font-bold")}>League mood · {window}</h2>
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
        <div className="sports-card p-4">
          <SentimentTrendChart
            label="Fan mood"
            color="rgb(59 130 246)"
            points={series.fan}
          />
        </div>
        <div className="sports-card p-4">
          <SentimentTrendChart
            label="Media mood"
            color="rgb(168 85 247)"
            points={series.media}
          />
        </div>
      </div>
    </section>
  );
}
