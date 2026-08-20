"use client";

import { useId } from "react";

import type { EfficiencyProfileMetric } from "@/lib/player-stat-views";
import type { PlayerPercentile } from "@/data/queries";
import { percentileColor } from "@/components/player/percentile-rankings";
import { StatTooltip } from "@/components/ui/stat-tooltip";

const KEY_TO_PERCENTILE: Record<string, string> = {
  fg: "fieldGoalPct",
  "2p": "fieldGoalPct",
  "3p": "threePointPct",
  efg: "effectiveFieldGoalPct",
  ts: "trueShootingPct",
  ft: "freeThrowPct",
};

/**
 * Efficiency ladder - shooting and rate metrics stacked for comparison,
 * using BRef shooting percentages.
 */
export function PlayerEfficiencyProfile({
  metrics,
  percentiles,
}: {
  metrics: EfficiencyProfileMetric[];
  percentiles: PlayerPercentile[];
}) {
  const chartId = useId();
  const byKey = new Map(percentiles.map((p) => [p.key, p]));

  return (
    <figure
      aria-labelledby={`${chartId}-title`}
      aria-describedby={`${chartId}-desc`}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4"
    >
      <div>
        <h2 id={`${chartId}-title`} className="text-lg font-semibold">
          Shooting efficiency
        </h2>
        <p id={`${chartId}-desc`} className="text-sm text-muted-foreground">
          BRef FG / 2P / 3P / eFG / TS / FT - bar length is the rate; color is
          league percentile (blue poor → red elite).
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {metrics.map((metric) => {
          const pct = byKey.get(KEY_TO_PERCENTILE[metric.key] ?? metric.key);
          const width = Math.max(4, Math.min(100, metric.value * 100));
          const color = pct
            ? percentileColor(pct.quality)
            : "currentColor";
          return (
            <li key={metric.key} className="grid grid-cols-[3.5rem_1fr_3.5rem] items-center gap-3">
              <span className="text-sm font-medium">
                <StatTooltip nestable stat={metric.label}>
                  {metric.label}
                </StatTooltip>
              </span>
              <div
                className="relative h-4 overflow-hidden rounded-sm bg-muted"
                role="img"
                aria-label={`${metric.label} ${metric.display}${
                  pct ? `, ${pct.percentile}th percentile` : ""
                }`}
              >
                <div
                  className="absolute inset-y-0 left-0 rounded-sm"
                  style={{ width: `${width}%`, backgroundColor: color }}
                />
              </div>
              <span className="text-right text-sm tabular-nums">
                {metric.display}
                {pct ? (
                  <span className="ml-1 text-xs text-muted-foreground">
                    · {pct.percentile}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
