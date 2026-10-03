"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
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
import { sentimentPct } from "@/components/sentiment/sentiment-source";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export type SentimentGameChartRow = {
  key: string;
  label: string;
  detail: string;
  stat: number | null;
  fan: number | null;
  fanCount: number;
  media: number | null;
  mediaCount: number;
};

const FAN_COLOR = "rgb(59 130 246)";
const MEDIA_COLOR = "rgb(168 85 247)";

export function SentimentGameChart({
  rows,
  statLabel,
  formatStat,
  height = 220,
}: {
  rows: SentimentGameChartRow[];
  statLabel: string;
  formatStat: (value: number) => string;
  height?: number;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            strokeOpacity={0.45}
            className="dark:opacity-70"
          />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis
            yAxisId="tone"
            domain={[-1, 1]}
            ticks={[-1, -0.5, 0, 0.5, 1]}
            tickFormatter={(v) => sentimentPct(Number(v))}
            width={36}
            tick={{ fontSize: 10 }}
          />
          <YAxis
            yAxisId="stat"
            orientation="right"
            tickFormatter={(v) => formatStat(Number(v))}
            width={36}
            tick={{ fontSize: 10 }}
          />
          <ReferenceLine
            yAxisId="tone"
            y={0}
            stroke="var(--muted-foreground)"
            strokeOpacity={0.5}
            strokeDasharray="4 3"
          />
          <Tooltip
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as SentimentGameChartRow | undefined;
              if (!active || !row) return null;
              return (
                <FrostRechartsTooltip active className="w-max">
                  <p className={cn(type.caption, "font-semibold")}>{row.detail}</p>
                  <p className={cn(type.caption, "tabular-nums text-muted-foreground")}>
                    {statLabel} {row.stat == null ? "—" : formatStat(row.stat)}
                  </p>
                  <p className={cn(type.caption, "tabular-nums text-muted-foreground")}>
                    Fan tone {row.fan == null ? "—" : sentimentPct(row.fan)} · {row.fanCount}{" "}
                    posts
                  </p>
                  <p className={cn(type.caption, "tabular-nums text-muted-foreground")}>
                    Media tone {row.media == null ? "—" : sentimentPct(row.media)} ·{" "}
                    {row.mediaCount} headlines
                  </p>
                </FrostRechartsTooltip>
              );
            }}
            wrapperStyle={rechartsFrostWrapperStyle}
          />
          <Bar
            yAxisId="stat"
            dataKey="stat"
            fill="var(--muted-foreground)"
            fillOpacity={0.28}
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
          />
          <Line
            yAxisId="tone"
            type="linear"
            dataKey="fan"
            stroke={FAN_COLOR}
            strokeWidth={2}
            dot={{ r: 3, fill: FAN_COLOR }}
            isAnimationActive={false}
          />
          <Line
            yAxisId="tone"
            type="linear"
            dataKey="media"
            stroke={MEDIA_COLOR}
            strokeWidth={2}
            dot={{ r: 3, fill: MEDIA_COLOR }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
