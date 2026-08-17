"use client";

import { useId } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import type { ShotDietSlice } from "@/lib/player-stat-views";
import { formatNumber, formatPct } from "@/lib/format";

const SLICE_FILL: Record<string, string> = {
  "2pa": "oklch(0.45 0.08 250)",
  "3pa": "oklch(0.55 0.14 35)",
  fta: "oklch(0.62 0.06 145)",
};

/**
 * Attempt mix chart by shot type / zone share.
 */
export function PlayerShotDiet({ slices }: { slices: ShotDietSlice[] }) {
  const chartId = useId();
  const data = slices.map((s) => ({
    ...s,
    value: s.attempts,
  }));
  const total = slices.reduce((a, s) => a + s.attempts, 0);

  return (
    <figure
      aria-labelledby={`${chartId}-title`}
      aria-describedby={`${chartId}-desc`}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4"
    >
      <div>
        <h2 id={`${chartId}-title`} className="text-lg font-semibold">
          Shot diet
        </h2>
        <p id={`${chartId}-desc`} className="text-sm text-muted-foreground">
          Share of scoring attempts: twos, threes, free throws (BRef FGA/3PA/FTA).
        </p>
      </div>

      {total === 0 ? (
        <p className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          No attempt data for this season.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] sm:items-center">
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="52%"
                  outerRadius="78%"
                  paddingAngle={2}
                  stroke="none"
                >
                  {data.map((slice) => (
                    <Cell
                      key={slice.key}
                      fill={SLICE_FILL[slice.key] ?? "currentColor"}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload as ShotDietSlice;
                    return (
                      <div
                        role="tooltip"
                        className="rounded-lg border border-border bg-popover px-3 py-2 text-sm shadow-md"
                      >
                        <p className="font-medium">{row.label}</p>
                        <p>{formatNumber(row.attempts)} attempts</p>
                        <p>{formatPct(row.share)} of attempts</p>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <ul className="flex flex-col gap-2">
            {slices.map((slice) => (
              <li
                key={slice.key}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="inline-flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-sm"
                    style={{
                      backgroundColor: SLICE_FILL[slice.key] ?? "currentColor",
                    }}
                    aria-hidden
                  />
                  {slice.label}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {formatNumber(slice.attempts)} · {formatPct(slice.share)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </figure>
  );
}
