"use client";

import { useId, useMemo } from "react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import {
  FrostRechartsTooltip,
  rechartsFrostWrapperStyle,
} from "@/components/brand/frost-recharts-tooltip";
import { useChartTheme } from "@/lib/chart-theme";
import { type } from "@/lib/design-system";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export type BoardShapePoint = {
  playerId: string;
  playerName: string;
  x: number;
  y: number;
  labelX: string;
  labelY: string;
};

/**
 * Compact “shape of the board” scatter above the Players table —
 * unique to this route: usage vs scoring among the visible board.
 */
export function PlayerBoardShapeChart({
  points,
  season,
  className,
}: {
  points: BoardShapePoint[];
  season: string;
  className?: string;
}) {
  const chartId = useId();
  const theme = useChartTheme();
  const data = useMemo(() => points.slice(0, 80), [points]);

  if (data.length < 8) return null;

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
          Board shape · {season}
        </p>
        <p
          id={`${chartId}-desc`}
          className={cn(type.caption, "text-muted-foreground")}
        >
          Usage vs points among players on this board — find the engines, the
          volume scorers, and the low-usage finishers at a glance.
        </p>
      </div>
      <div className="h-52 w-full min-w-0 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-border"
              strokeOpacity={theme.gridOpacity()}
            />
            <XAxis
              type="number"
              dataKey="x"
              name="Usage"
              tick={{ fontSize: 11 }}
              className="fill-muted-foreground"
              tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
              domain={["auto", "auto"]}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="PPG"
              tick={{ fontSize: 11 }}
              className="fill-muted-foreground"
              tickFormatter={(v: number) => formatNumber(v, 0)}
              width={36}
            />
            <ZAxis range={[28, 28]} />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as BoardShapePoint | undefined;
                if (!active || !row) return null;
                return (
                  <FrostRechartsTooltip active={active}>
                    <p className="text-[12px] font-semibold">{row.playerName}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {row.labelX} · {row.labelY}
                    </p>
                  </FrostRechartsTooltip>
                );
              }}
              wrapperStyle={rechartsFrostWrapperStyle}
            />
            <Scatter
              data={data}
              fill={theme.semantic.info}
              fillOpacity={0.72}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
