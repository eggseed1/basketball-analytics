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

export function SentimentTrendChart({
  label,
  color,
  points,
  height = 160,
}: {
  label: string;
  color: string;
  points: SentimentSeriesPoint[];
  height?: number;
}) {
  if (!points.length) {
    return (
      <p className={cn(type.caption, "text-muted-foreground")}>
        No trend data for {label.toLowerCase()} yet.
      </p>
    );
  }

  const rows = points.map((p) => ({
    ...p,
    label: formatAxisDate(p.date),
  }));

  return (
    <div className="flex flex-col gap-1.5">
      <p className={cn(type.caption, "font-semibold text-foreground")}>{label}</p>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10 }}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[-1, 1]}
              ticks={[-1, -0.5, 0, 0.5, 1]}
              tickFormatter={(v) => formatScore(Number(v))}
              width={36}
              tick={{ fontSize: 10 }}
            />
            <ReferenceLine y={0} stroke="rgba(0,0,0,0.15)" />
            <Tooltip
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as
                  | { date?: string; score?: number }
                  | undefined;
                if (!active || !row?.date) return null;
                return (
                  <FrostRechartsTooltip active className="w-max">
                    <p className={cn(type.caption, "font-semibold")}>
                      {formatAxisDate(row.date)}
                    </p>
                    <p className={cn(type.caption, "tabular-nums text-muted-foreground")}>
                      {label} {formatScore(row.score ?? 0)}
                    </p>
                  </FrostRechartsTooltip>
                );
              }}
              wrapperStyle={rechartsFrostWrapperStyle}
            />
            <Line
              type="monotone"
              dataKey="score"
              stroke={color}
              strokeWidth={2}
              dot={{ r: 2, fill: color }}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
