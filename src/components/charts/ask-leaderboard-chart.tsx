"use client";

import { useId, useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
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
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export type AskLeaderboardBar = {
  name: string;
  value: number;
  display: string;
};

/**
 * Ranked bars for Ask DRBL leaderboard answers — the number isn't the whole story.
 */
export function AskLeaderboardChart({
  title,
  rows,
  className,
}: {
  title: string;
  rows: AskLeaderboardBar[];
  className?: string;
}) {
  const chartId = useId();
  const theme = useChartTheme();
  const data = useMemo(
    () =>
      rows.slice(0, 8).map((row) => ({
        ...row,
        short:
          row.name.split(/\s+/).slice(-1)[0]?.slice(0, 10) ?? row.name.slice(0, 10),
      })),
    [rows]
  );

  if (data.length < 2) return null;

  return (
    <figure
      aria-labelledby={`${chartId}-title`}
      className={cn("flex flex-col gap-2", className)}
    >
      <p
        id={`${chartId}-title`}
        className={cn(type.caption, "font-semibold text-muted-foreground")}
      >
        {title}
      </p>
      <div className="h-56 w-full min-w-0 sm:h-64">
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
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="short"
              width={68}
              tick={{ fontSize: 11 }}
              className="fill-muted-foreground"
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "currentColor", fillOpacity: 0.04 }}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as
                  | (AskLeaderboardBar & { short: string })
                  | undefined;
                if (!active || !row) return null;
                return (
                  <FrostRechartsTooltip active={active}>
                    <p className="text-[12px] font-semibold">{row.name}</p>
                    <p className="mt-1 text-[12px] tabular-nums">{row.display}</p>
                  </FrostRechartsTooltip>
                );
              }}
              wrapperStyle={rechartsFrostWrapperStyle}
            />
            <Bar
              dataKey="value"
              fill={theme.semantic.info}
              radius={[0, 4, 4, 0]}
              maxBarSize={16}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
