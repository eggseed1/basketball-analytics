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
import type { StatDetectiveRow } from "@/data/runtime/stat-detective-windows";
import { useChartTheme } from "@/lib/chart-theme";
import { formatNumber } from "@/lib/format";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

type ChartRow = {
  name: string;
  fullName: string;
  delta: number;
  windowPpg: number;
  baselinePpg: number;
  direction: "up" | "down";
};

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name.slice(0, 12);
  const last = parts[parts.length - 1]!;
  return last.length > 10 ? `${last.slice(0, 9)}…` : last;
}

/**
 * Signature Stat Detective chart — PPG change vs the player's own baseline.
 * Zero = playing like themselves; bars = heating up / cooling off.
 */
export function StatDetectiveDivergenceChart({
  risers,
  fallers,
  className,
}: {
  risers: StatDetectiveRow[];
  fallers: StatDetectiveRow[];
  className?: string;
}) {
  const chartId = useId();
  const theme = useChartTheme();

  const data = useMemo<ChartRow[]>(() => {
    const up = risers.slice(0, 6).map((row) => ({
      name: shortName(row.playerName),
      fullName: row.playerName,
      delta: Number(row.deltaPpg.toFixed(1)),
      windowPpg: row.windowPpg,
      baselinePpg: row.baselinePpg,
      direction: "up" as const,
    }));
    const down = fallers
      .slice(0, 6)
      .map((row) => ({
        name: shortName(row.playerName),
        fullName: row.playerName,
        delta: Number(row.deltaPpg.toFixed(1)),
        windowPpg: row.windowPpg,
        baselinePpg: row.baselinePpg,
        direction: "down" as const,
      }))
      .reverse();
    return [...down, ...up];
  }, [risers, fallers]);

  if (data.length < 2) return null;

  const upColor = theme.semantic.positive;
  const downColor = theme.semantic.negative;

  return (
    <figure
      aria-labelledby={`${chartId}-title`}
      aria-describedby={`${chartId}-desc`}
      className={cn("flex w-full flex-col gap-2", className)}
    >
      <div>
        <p
          id={`${chartId}-title`}
          className={cn(type.caption, "font-semibold text-muted-foreground")}
        >
          Scoring change (PPG)
        </p>
        <p
          id={`${chartId}-desc`}
          className={cn(type.bodySm, "text-muted-foreground")}
        >
          Bars show how far each player is from their own usual scoring — not
          from the league.
        </p>
      </div>
      <div className="h-[22rem] w-full min-w-0 sm:h-[26rem]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
            role="img"
            aria-label="Player scoring change versus their own baseline"
          >
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-border"
              horizontal={false}
              strokeOpacity={theme.gridOpacity()}
            />
            <XAxis
              type="number"
              tick={{ fontSize: 11 }}
              className="fill-muted-foreground"
              tickFormatter={(v: number) =>
                v > 0 ? `+${formatNumber(v, 0)}` : formatNumber(v, 0)
              }
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={72}
              tick={{ fontSize: 11 }}
              className="fill-muted-foreground"
              axisLine={false}
              tickLine={false}
            />
            <ReferenceLine
              x={0}
              stroke="currentColor"
              strokeOpacity={theme.referenceOpacity()}
              strokeDasharray="4 4"
              className="text-muted-foreground"
            />
            <Tooltip
              cursor={{ fill: "currentColor", fillOpacity: 0.04 }}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as ChartRow | undefined;
                if (!active || !row) return null;
                return (
                  <FrostRechartsTooltip active={active}>
                    <p className="text-[12px] font-semibold">{row.fullName}</p>
                    <p className="mt-1 text-[12px] tabular-nums text-muted-foreground">
                      {row.delta > 0 ? "+" : ""}
                      {formatNumber(row.delta, 1)} PPG
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatNumber(row.windowPpg, 1)} in window ·{" "}
                      {formatNumber(row.baselinePpg, 1)} baseline
                    </p>
                  </FrostRechartsTooltip>
                );
              }}
              wrapperStyle={rechartsFrostWrapperStyle}
            />
            <Bar dataKey="delta" radius={[0, 4, 4, 0]} maxBarSize={18}>
              {data.map((row) => (
                <Cell
                  key={`${row.fullName}-${row.delta}`}
                  fill={row.direction === "up" ? upColor : downColor}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
