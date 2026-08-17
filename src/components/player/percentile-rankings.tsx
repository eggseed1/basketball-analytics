"use client";

import { useMemo, useState } from "react";

import type { PlayerPercentile, PercentileSide } from "@/data/queries";
import { StatTooltip } from "@/components/ui/stat-tooltip";
import { cn } from "@/lib/utils";

/**
 * Percentile quality color: cool (poor) → neutral → warm (elite).
 * Quality is already direction-adjusted (higher = better).
 */
export function percentileColor(quality: number): string {
  const q = Math.max(0, Math.min(1, quality));
  if (q < 0.5) {
    const t = q / 0.5;
    const r = Math.round(30 + t * 180);
    const g = Math.round(80 + t * 120);
    const b = Math.round(180 - t * 40);
    return `rgb(${r}, ${g}, ${b})`;
  }
  const t = (q - 0.5) / 0.5;
  const r = Math.round(210 + t * 45);
  const g = Math.round(200 - t * 140);
  const b = Math.round(140 - t * 100);
  return `rgb(${r}, ${g}, ${b})`;
}

const TABS: Array<{ id: PercentileSide | "all"; label: string }> = [
  { id: "offense", label: "Offense" },
  { id: "defense", label: "Defense" },
  { id: "overall", label: "Overall" },
  { id: "all", label: "All" },
];

export interface PercentileRankingsProps {
  season: string;
  percentiles: PlayerPercentile[];
  minimumMinutes: number;
}

export function PercentileRankings({
  season,
  percentiles,
  minimumMinutes,
}: PercentileRankingsProps) {
  const [tab, setTab] = useState<PercentileSide | "all">("offense");

  const visible = useMemo(() => {
    if (tab === "all") return percentiles;
    return percentiles.filter((metric) => metric.side === tab);
  }, [percentiles, tab]);

  return (
    <section
      aria-labelledby="percentile-rankings-heading"
      className="rounded-xl border border-border bg-card p-4"
    >
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2
              id="percentile-rankings-heading"
              className="text-lg font-semibold"
            >
              {season} League Percentile Rankings
            </h2>
            <p className="text-sm text-muted-foreground">
              League ranks vs players with {minimumMinutes}+ minutes. Higher
              percentile is better (defensive rating is inverted).
            </p>
          </div>
          <p className="text-xs text-muted-foreground" aria-hidden>
            Poor ← blue · Elite → red
          </p>
        </div>

        <div
          className="flex flex-wrap gap-1"
          role="tablist"
          aria-label="Percentile side"
        >
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs font-medium",
                tab === item.id
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background hover:bg-muted"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No {tab} metrics available for this season.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5" role="tabpanel">
          {visible.map((metric) => (
            <li
              key={metric.key}
              className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-3 sm:grid-cols-[9rem_1fr_3rem]"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  <StatTooltip nestable stat={metric.key}>
                    {metric.shortLabel}
                  </StatTooltip>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {metric.displayValue}
                </p>
              </div>
              <div
                className="relative h-3 overflow-hidden rounded-sm bg-muted"
                role="img"
                aria-label={`${metric.label} ${metric.displayValue}, ${metric.percentile}th percentile`}
              >
                <div
                  className="absolute inset-y-0 left-0 rounded-sm transition-[width]"
                  style={{
                    width: `${metric.percentile}%`,
                    backgroundColor: percentileColor(metric.quality),
                  }}
                />
                {/* Tick marks so color is not the only encoding */}
                <div className="pointer-events-none absolute inset-0 flex justify-between px-0.5 opacity-30">
                  <span className="h-full w-px bg-foreground" />
                  <span className="h-full w-px bg-foreground" />
                  <span className="h-full w-px bg-foreground" />
                  <span className="h-full w-px bg-foreground" />
                  <span className="h-full w-px bg-foreground" />
                </div>
              </div>
              <p
                className={cn(
                  "text-right text-sm font-semibold tabular-nums",
                  metric.percentile >= 70
                    ? "text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {metric.percentile}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
