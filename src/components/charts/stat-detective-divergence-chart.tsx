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
import type {
  StatDetectiveMetricId,
  StatDetectiveRow,
} from "@/data/runtime/stat-detective-windows";
import { useChartTheme } from "@/lib/chart-theme";
import { formatNumber } from "@/lib/format";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

type ChartRow = {
  name: string;
  fullName: string;
  delta: number;
  windowValue: number;
  baselineValue: number;
  direction: "up" | "down";
};

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name.slice(0, 12);
  const last = parts[parts.length - 1]!;
  return last.length > 10 ? `${last.slice(0, 9)}…` : last;
}

function chartValues(
  row: StatDetectiveRow,
  metric: StatDetectiveMetricId
): { delta: number; window: number; baseline: number } | null {
  if (metric === "ppg") {
    return {
      delta: row.deltaPpg,
      window: row.windowPpg,
      baseline: row.baselinePpg,
    };
  }
  if (metric === "ts") {
    if (
      row.deltaTs == null ||
      row.windowTs == null ||
      row.baselineTs == null
    ) {
      return null;
    }
    return {
      delta: row.deltaTs * 100,
      window: row.windowTs * 100,
      baseline: row.baselineTs * 100,
    };
  }
  if (
    row.deltaRpg == null ||
    row.windowRpg == null ||
    row.baselineRpg == null
  ) {
    return null;
  }
  return {
    delta: row.deltaRpg,
    window: row.windowRpg,
    baseline: row.baselineRpg,
  };
}

/**
 * Signature Stat Detective chart — change vs the player's own baseline.
 * Zero = playing like themselves; bars = heating up / cooling off.
 */
export function StatDetectiveDivergenceChart({
  risers,
  fallers,
  metric = "ppg",
  className,
}: {
  risers: StatDetectiveRow[];
  fallers: StatDetectiveRow[];
  metric?: StatDetectiveMetricId;
  className?: string;
}) {
  const chartId = useId();
  const theme = useChartTheme();
  const unit = metric === "ppg" ? "PPG" : metric === "ts" ? "TS%" : "RPG";
  const title =
    metric === "ppg"
      ? "Scoring change (PPG)"
      : metric === "ts"
        ? "Efficiency change (TS%)"
        : "Rebound change (RPG)";

  const data = useMemo<ChartRow[]>(() => {
    const mapRows = (
      list: StatDetectiveRow[],
      direction: "up" | "down"
    ): ChartRow[] =>
      list
        .slice(0, 6)
        .map((row) => {
          const values = chartValues(row, metric);
          if (!values) return null;
          return {
            name: shortName(row.playerName),
            fullName: row.playerName,
            delta: Number(values.delta.toFixed(1)),
            windowValue: values.window,
            baselineValue: values.baseline,
            direction,
          };
        })
        .filter(Boolean) as ChartRow[];

    const up = mapRows(risers, "up");
    const down = mapRows(fallers, "down").reverse();
    return [...down, ...up];
  }, [risers, fallers, metric]);

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
          {title}
        </p>
        <p
          id={`${chartId}-desc`}
          className={cn(type.bodySm, "text-muted-foreground")}
        >
          Bars show how far each player is from their own usual {unit} — not
          from the league. Thin samples stay off the board (missing ≠ 0).
        </p>
      </div>
      <div className="h-[22rem] w-full min-w-0 sm:h-[26rem]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
            role="img"
            aria-label={`Player ${unit} change versus their own baseline`}
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
                      {formatNumber(row.delta, 1)} {unit}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatNumber(row.windowValue, 1)} in window ·{" "}
                      {formatNumber(row.baselineValue, 1)} baseline
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
