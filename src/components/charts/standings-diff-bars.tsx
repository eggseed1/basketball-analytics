"use client";

import { useId, useMemo } from "react";
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
import type { StandingRow } from "@/data/types";
import { useChartTheme } from "@/lib/chart-theme";
import { type } from "@/lib/design-system";
import { formatNumber } from "@/lib/format";
import { teamBrandCompareBarFill } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

type DiffPoint = {
  abbr: string;
  name: string;
  differential: number;
  fill: string;
  conference: "East" | "West";
};

/**
 * Point-differential board for standings — who is actually outscoring opponents.
 */
export function StandingsDiffBars({
  season,
  east,
  west,
  className,
}: {
  season: string;
  east: StandingRow[];
  west: StandingRow[];
  className?: string;
}) {
  const chartId = useId();
  const theme = useChartTheme();

  const data = useMemo(() => {
    const mapRow = (row: StandingRow): DiffPoint => ({
      abbr: row.abbreviation,
      name: row.displayName,
      differential: row.differential,
      fill: teamBrandCompareBarFill(row.abbreviation),
      conference: row.conference,
    });
    return [...east.map(mapRow), ...west.map(mapRow)].sort(
      (a, b) => b.differential - a.differential
    );
  }, [east, west]);

  if (data.length < 8) return null;

  const peak = Math.max(
    ...data.map((d) => Math.abs(d.differential)),
    0.5
  );

  return (
    <figure
      aria-labelledby={`${chartId}-title`}
      aria-describedby={`${chartId}-desc`}
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border/70 p-3 sm:p-4",
        className
      )}
    >
      <div>
        <p id={`${chartId}-title`} className={cn(type.heading)}>
          Scoring margin · {season}
        </p>
        <p
          id={`${chartId}-desc`}
          className={cn(type.caption, "text-muted-foreground")}
        >
          Average point differential across both conferences — the race behind
          the W/L table.
        </p>
      </div>
      <div
        className="w-full min-w-0"
        style={{ height: Math.max(280, data.length * 18 + 32) }}
      >
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
      </div>
    </figure>
  );
}
