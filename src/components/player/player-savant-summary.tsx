"use client";

import { useEffect, useMemo, useState } from "react";

import type { SavantFrame, SavantMetric, SavantSection } from "@/lib/player-savant";
import { percentileColor } from "@/components/player/percentile-rankings";
import { StatTooltip } from "@/components/ui/stat-tooltip";
import { cn } from "@/lib/utils";

const FRAME_MS = 750;

function ScaleTrack({
  percentile,
  quality,
  label,
  animate,
}: {
  percentile: number | null;
  quality: number | null;
  label: string;
  animate?: boolean;
}) {
  const pct = percentile ?? 0;
  const color =
    quality != null ? percentileColor(quality) : "var(--muted-foreground)";

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div
        className="relative h-2.5 rounded-sm bg-muted"
        role="img"
        aria-label={
          percentile != null
            ? `${label} ${percentile}th percentile`
            : `${label} unavailable`
        }
      >
        <div
          className="pointer-events-none absolute inset-0 rounded-sm opacity-35"
          style={{
            background:
              "linear-gradient(90deg, rgb(30,80,180), rgb(200,190,120), rgb(230,70,50))",
          }}
        />
        {percentile != null ? (
          <div
            className={cn(
              "absolute top-1/2 z-10 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background shadow-sm",
              animate && "transition-[left,background-color] duration-500 ease-out"
            )}
            style={{
              left: `${Math.max(2, Math.min(98, pct))}%`,
              backgroundColor: color,
            }}
          />
        ) : null}
      </div>
      <div className="flex justify-between text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>Poor</span>
        <span>Average</span>
        <span>Great</span>
      </div>
    </div>
  );
}

function MetricRow({
  metric,
  emphasize,
  animate,
}: {
  metric: SavantMetric;
  emphasize?: boolean;
  animate?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto_2.25rem] items-center gap-x-3 gap-y-1.5 py-2 sm:grid-cols-[minmax(7rem,9rem)_4.5rem_minmax(0,1fr)_2.5rem] sm:gap-3",
        emphasize && "border-b border-border/60"
      )}
    >
      <p className="min-w-0 truncate text-sm font-medium">
        <StatTooltip nestable stat={metric.key}>
          {metric.label}
        </StatTooltip>
      </p>
      <p
        className={cn(
          "text-right text-sm font-semibold tabular-nums tracking-tight",
          animate && "transition-colors duration-500"
        )}
      >
        {metric.display ?? "-"}
      </p>
      <p
        className={cn(
          "text-right text-sm font-semibold tabular-nums sm:col-start-4",
          metric.percentile != null && metric.percentile >= 70
            ? "text-foreground"
            : "text-muted-foreground",
          animate && "transition-colors duration-500"
        )}
      >
        {metric.percentile ?? "-"}
      </p>
      <div className="col-span-3 sm:col-span-1 sm:col-start-3 sm:row-start-1">
        <ScaleTrack
          percentile={metric.percentile}
          quality={metric.quality}
          label={metric.label}
          animate={animate}
        />
      </div>
    </div>
  );
}

function PlayIcon({ playing }: { playing: boolean }) {
  if (playing) {
    return (
      <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
        <rect x="6" y="5" width="4" height="14" fill="currentColor" />
        <rect x="14" y="5" width="4" height="14" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path d="M8 5v14l11-7L8 5z" fill="currentColor" />
    </svg>
  );
}

function SectionsBody({
  sections,
  animate,
}: {
  sections: SavantSection[];
  animate?: boolean;
}) {
  const value = sections.find((s) => s.id === "value");
  const rest = sections.filter((s) => s.id !== "value");

  return (
    <>
      {value ? (
        <div className="mb-5">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {value.title}
          </h3>
          <div className="divide-y divide-border/50">
            {value.metrics.map((m, i) => (
              <MetricRow
                key={`${m.key}-${m.label}`}
                metric={m}
                emphasize={i === value.metrics.length - 1}
                animate={animate}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {rest.map((section) => (
          <div key={section.id}>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {section.title}
            </h3>
            <div className="divide-y divide-border/40">
              {section.metrics.map((m) => (
                <MetricRow
                  key={`${m.key}-${m.label}`}
                  metric={m}
                  animate={animate}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function PlayerSavantSummary({
  season,
  sections,
  careerFrames = [],
}: {
  season: string;
  sections: SavantSection[];
  /** Career frames for play-mode growth animation. */
  careerFrames?: SavantFrame[];
}) {
  const canPlay = careerFrames.length >= 2;
  const selectedIndex = useMemo(() => {
    const idx = careerFrames.findIndex((f) => f.season === season);
    return idx >= 0 ? idx : Math.max(0, careerFrames.length - 1);
  }, [careerFrames, season]);

  const [playing, setPlaying] = useState(false);
  const [frameIndex, setFrameIndex] = useState(selectedIndex);
  const [scrubbing, setScrubbing] = useState(false);

  // Keep frame aligned with selected season when not playing/scrubbing.
  useEffect(() => {
    if (!playing && !scrubbing) {
      setFrameIndex(selectedIndex);
    }
  }, [selectedIndex, playing, scrubbing]);

  useEffect(() => {
    if (!playing || !canPlay) return;
    const id = window.setInterval(() => {
      setFrameIndex((prev) => {
        if (prev >= careerFrames.length - 1) {
          setPlaying(false);
          // Return to league-percentile view for the selected season so
          // career ranks are not left sticky after playback ends.
          setScrubbing(false);
          return selectedIndex;
        }
        return prev + 1;
      });
    }, FRAME_MS);
    return () => window.clearInterval(id);
  }, [playing, canPlay, careerFrames.length, selectedIndex]);

  const inTimeline = playing || scrubbing;
  const activeFrame = careerFrames[frameIndex];
  const displaySeason = inTimeline && activeFrame ? activeFrame.season : season;
  const displaySections =
    inTimeline && activeFrame ? activeFrame.sections : sections;

  function togglePlay() {
    if (!canPlay) return;
    if (playing) {
      setPlaying(false);
      return;
    }
    setScrubbing(true);
    setFrameIndex(0);
    setPlaying(true);
  }

  function onScrub(index: number) {
    setPlaying(false);
    setScrubbing(true);
    setFrameIndex(index);
  }

  function resetToSelected() {
    setPlaying(false);
    setScrubbing(false);
    setFrameIndex(selectedIndex);
  }

  return (
    <section
      aria-labelledby="savant-summary-heading"
      className="rounded-xl border border-border bg-card p-4"
    >
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="savant-summary-heading" className="text-lg font-semibold">
              <span
                className={cn(
                  "tabular-nums",
                  inTimeline && "text-foreground transition-opacity duration-300"
                )}
              >
                {displaySeason}
              </span>{" "}
              player card
            </h2>
            <p className="text-sm text-muted-foreground">
              {inTimeline
                ? "Career playback - markers move with this player’s growth or decline."
                : "Savant-style value and skill percentiles - Poor ← Average → Great."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canPlay ? (
              <>
                <button
                  type="button"
                  onClick={togglePlay}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium",
                    playing
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background hover:bg-muted"
                  )}
                  aria-pressed={playing}
                  aria-label={playing ? "Pause career playback" : "Play career timeline"}
                >
                  <PlayIcon playing={playing} />
                  {playing ? "Pause" : "Play"}
                </button>
                {inTimeline ? (
                  <button
                    type="button"
                    onClick={resetToSelected}
                    className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                  >
                    Reset
                  </button>
                ) : null}
              </>
            ) : null}
            <p className="text-xs text-muted-foreground" aria-hidden>
              {inTimeline ? "Marker = career rank" : "Marker = league percentile"}
            </p>
          </div>
        </div>

        {canPlay ? (
          <div className="flex flex-col gap-1.5">
            <input
              type="range"
              min={0}
              max={careerFrames.length - 1}
              step={1}
              value={frameIndex}
              onChange={(event) => onScrub(Number(event.target.value))}
              aria-label="Scrub career seasons"
              className="w-full accent-foreground"
            />
            <div className="flex justify-between text-[12px] tabular-nums text-muted-foreground">
              <span>{careerFrames[0]?.season}</span>
              <span className="font-medium text-foreground">
                {displaySeason}
                {inTimeline ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · {frameIndex + 1}/{careerFrames.length}
                  </span>
                ) : null}
              </span>
              <span>{careerFrames[careerFrames.length - 1]?.season}</span>
            </div>
          </div>
        ) : null}
      </div>

      <SectionsBody sections={displaySections} animate={inTimeline} />
    </section>
  );
}
