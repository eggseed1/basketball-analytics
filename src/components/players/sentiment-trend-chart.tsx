"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  FrostRechartsTooltip,
  rechartsFrostWrapperStyle,
} from "@/components/brand/frost-recharts-tooltip";
import type { SentimentSeriesPoint } from "@/sentiment/curated-types";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function formatAxisDate(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatScore(value: number) {
  const pct = Math.round(((value + 1) / 2) * 100);
  return `${pct}%`;
}

/** Fit the axis to the data, keep neutral (0) in view, stay inside −1..1. */
function fittedDomain(scores: number[]): [number, number] {
  const lo = Math.min(0, ...scores);
  const hi = Math.max(0, ...scores);
  const pad = Math.max(0.1, (hi - lo) * 0.2);
  return [Math.max(-1, Math.floor((lo - pad) * 10) / 10), Math.min(1, Math.ceil((hi + pad) * 10) / 10)];
}

function domainTicks([lo, hi]: [number, number]): number[] {
  const step = hi - lo > 1 ? 0.5 : hi - lo > 0.5 ? 0.25 : 0.1;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
    ticks.push(Math.round(v * 100) / 100);
  }
  return ticks;
}

export function SentimentTrendChart({
  label,
  color,
  points,
  height = 160,
  countLabel = "items",
  showLabel = true,
}: {
  label: string;
  color: string;
  points: SentimentSeriesPoint[];
  height?: number;
  /** Noun for per-point counts in the tooltip (e.g. "headlines"). */
  countLabel?: string;
  /** Hide the caption when the surrounding panel already titles the chart. */
  showLabel?: boolean;
}) {
  if (!points.length) {
    return (
      <p className={cn(type.caption, "text-muted-foreground")}>
        No trend data for {label.toLowerCase()} yet.
      </p>
    );
  }

  const smooth = points.length >= 5;
  const rows = points.map((p, i) => {
    const trailing = points.slice(Math.max(0, i - 2), i + 1);
    return {
      ...p,
      label: formatAxisDate(p.date),
      rolling: smooth
        ? Math.round((trailing.reduce((sum, t) => sum + t.score, 0) / trailing.length) * 100) / 100
        : undefined,
    };
  });
  const domain = fittedDomain(points.map((p) => p.score));

  return (
    <div className="flex flex-col gap-1.5">
      {showLabel ? (
        <p className={cn(type.caption, "font-semibold text-foreground")}>{label}</p>
      ) : null}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              strokeOpacity={0.45}
              className="dark:opacity-70"
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10 }}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={domain}
              ticks={domainTicks(domain)}
              tickFormatter={(v) => formatScore(Number(v))}
              width={36}
              tick={{ fontSize: 10 }}
            />
            <ReferenceLine
              y={0}
              stroke="var(--muted-foreground)"
              strokeOpacity={0.5}
              strokeDasharray="4 3"
            />
            <Tooltip
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as
                  | { date?: string; score?: number; count?: number; rolling?: number }
                  | undefined;
                if (!active || !row?.date) return null;
                return (
                  <FrostRechartsTooltip active className="w-max">
                    <p className={cn(type.caption, "font-semibold")}>
                      {formatAxisDate(row.date)}
                    </p>
                    <p className={cn(type.caption, "tabular-nums text-muted-foreground")}>
                      {label} {formatScore(row.score ?? 0)}
                      {row.count != null ? ` · ${row.count} ${countLabel}` : ""}
                    </p>
                    {row.rolling != null ? (
                      <p className={cn(type.caption, "tabular-nums text-muted-foreground")}>
                        3-day average {formatScore(row.rolling)}
                      </p>
                    ) : null}
                  </FrostRechartsTooltip>
                );
              }}
              wrapperStyle={rechartsFrostWrapperStyle}
            />
            <Line
              type="linear"
              dataKey="score"
              stroke={color}
              strokeWidth={smooth ? 1 : 2}
              strokeOpacity={smooth ? 0.45 : 1}
              dot={{ r: smooth ? 2 : 3, fill: color }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
            {smooth ? (
              <Line
                type="monotone"
                dataKey="rolling"
                stroke={color}
                strokeWidth={2.5}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
