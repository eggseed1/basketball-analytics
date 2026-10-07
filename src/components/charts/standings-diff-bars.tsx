"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import { useChartTheme } from "@/lib/chart-theme";
import { formatNumber } from "@/lib/format";

export type DiffPoint = {
  abbr: string;
  name: string;
  differential: number;
  fill: string;
  conference: "East" | "West";
};

/** Bars for the standings scoring-margin board. The frame and its height come from StandingsDiffBoard. */
export function StandingsDiffBars({ data, peak }: { data: DiffPoint[]; peak: number }) {
  const theme = useChartTheme();

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          className="stroke-border"
          horizontal={false}
          strokeOpacity={theme.gridOpacity()}
        />
        <XAxis
          type="number"
          domain={[-peak, peak]}
          tick={{ fontSize: 10 }}
          className="fill-muted-foreground"
          tickFormatter={(v: number) =>
            `${v > 0 ? "+" : ""}${formatNumber(v, 1)}`
          }
        />
        <YAxis
          type="category"
          dataKey="abbr"
          width={36}
          tick={{ fontSize: 10 }}
          className="fill-muted-foreground"
          axisLine={false}
          tickLine={false}
        />
        <ReferenceLine
          x={0}
          stroke="currentColor"
          className="text-foreground/40"
          strokeWidth={1}
        />
        <Tooltip
          cursor={{ fill: "currentColor", fillOpacity: 0.04 }}
          content={({ active, payload }) => {
            const row = payload?.[0]?.payload as DiffPoint | undefined;
            if (!active || !row) return null;
            const signed =
              row.differential > 0
                ? `+${formatNumber(row.differential, 1)}`
                : formatNumber(row.differential, 1);
            return (
              <FrostRechartsTooltip active={active}>
                <p className="text-[12px] font-semibold">{row.name}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {row.conference} · DIFF {signed}
                </p>
              </FrostRechartsTooltip>
            );
          }}
          wrapperStyle={rechartsFrostWrapperStyle}
        />
        <Bar dataKey="differential" radius={[2, 2, 2, 2]} maxBarSize={14}>
          {data.map((row) => (
            <Cell key={row.abbr} fill={row.fill} fillOpacity={0.92} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
