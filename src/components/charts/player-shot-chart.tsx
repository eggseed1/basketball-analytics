"use client";

import { useId, useMemo, useState } from "react";

import { NbaHalfCourtLines } from "@/components/charts/nba-half-court-lines";
import type { Shot } from "@/data/types";
import { COURT_SVG, courtX, courtY } from "@/lib/nba-court";
import { cn } from "@/lib/utils";

export interface PlayerShotChartProps {
  shots: Shot[];
  playerName: string;
}

/**
 * Half-court shot chart for made/missed attempts.
 * Made = filled circle; missed = hollow circle (not color-only).
 */
export function PlayerShotChart({ shots, playerName }: PlayerShotChartProps) {
  const chartId = useId();
  const [filter, setFilter] = useState<"ALL" | "2PT" | "3PT" | "MADE" | "MISS">(
    "ALL"
  );

  const filtered = useMemo(() => {
    return shots.filter((shot) => {
      if (filter === "2PT") return shot.shotType === "2PT";
      if (filter === "3PT") return shot.shotType === "3PT";
      if (filter === "MADE") return shot.made;
      if (filter === "MISS") return !shot.made;
      return true;
    });
  }, [filter, shots]);

  const made = filtered.filter((s) => s.made).length;
  const fg = filtered.length ? made / filtered.length : 0;

  return (
    <figure
      aria-labelledby={`${chartId}-title`}
      aria-describedby={`${chartId}-desc`}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id={`${chartId}-title`} className="text-lg font-semibold">
            Shot chart
          </h2>
          <p id={`${chartId}-desc`} className="text-sm text-muted-foreground">
            Spatial shot map for {playerName}. Filled = make, hollow = miss.
          </p>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Shot filters">
          {(
            [
              ["ALL", "All"],
              ["MADE", "Makes"],
              ["MISS", "Misses"],
              ["2PT", "2PT"],
              ["3PT", "3PT"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={cn(
                "rounded-md border px-2 py-1 text-xs",
                filter === value
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background hover:bg-muted"
              )}
              aria-pressed={filter === value}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm tabular-nums text-muted-foreground">
        {filtered.length} shots · {(fg * 100).toFixed(1)}% make
      </p>

      <div className="mx-auto w-full max-w-md">
        {filtered.length === 0 ? (
          <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            No shot locations for this filter.
          </p>
        ) : (
          <svg
            viewBox={`0 0 ${COURT_SVG.width} ${COURT_SVG.height}`}
            className="h-auto w-full rounded-lg bg-[oklch(0.97_0.01_145)] dark:bg-[oklch(0.22_0.02_145)]"
            role="img"
            aria-label={`Shot chart with ${made} makes and ${filtered.length - made} misses`}
          >
            <NbaHalfCourtLines />

            {filtered.map((shot) => {
              const cx = courtX(shot.locX);
              const cy = courtY(shot.locY);
              const isThree = shot.shotType === "3PT";
              return (
                <g key={shot.id}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isThree ? 5 : 4}
                    fill={shot.made ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth="1.5"
                    opacity={0.85}
                  >
                    <title>{`${shot.made ? "Make" : "Miss"} ${shot.shotType} · ${shot.shotDistance.toFixed(1)} ft${shot.shotZoneBasic ? ` · ${shot.shotZoneBasic}` : ""}`}</title>
                  </circle>
                  {isThree ? (
                    <circle
                      cx={cx}
                      cy={cy}
                      r="1.5"
                      fill={shot.made ? "none" : "currentColor"}
                      stroke="none"
                      opacity="0.9"
                      aria-hidden
                    />
                  ) : null}
                </g>
              );
            })}
          </svg>
        )}
      </div>

      <ul className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <li className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full bg-foreground" />
          Make
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full border border-foreground" />
          Miss
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="relative inline-block size-3 rounded-full border border-foreground">
            <span className="absolute inset-[3px] rounded-full bg-foreground" />
          </span>
          Three-point attempt marker
        </li>
      </ul>
    </figure>
  );
}
