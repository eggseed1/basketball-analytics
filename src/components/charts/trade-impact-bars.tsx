"use client";

import { useId, useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
import { formatNumber } from "@/lib/format";
import { teamBrandCompareBarFill } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

export type TradeImpactSideValues = {
  abbr: string;
  teamKey?: string | null;
  drblNet: number | null;
  war1Net: number | null;
  bpmNet: number | null;
};

/**
 * Head-to-head net impact bars for a sketched trade — DRBL / WAR1 / BPM.
 * Missing model rows stay off the chart (not drawn as zero).
 */
export function TradeImpactBars({
  sideA,
  sideB,
  className,
}: {
  sideA: TradeImpactSideValues;
  sideB: TradeImpactSideValues;
  className?: string;
}) {
  const chartId = useId();
  const theme = useChartTheme();
  const aFill = teamBrandCompareBarFill(sideA.teamKey ?? sideA.abbr);
  const bFill = teamBrandCompareBarFill(sideB.teamKey ?? sideB.abbr);

  const data = useMemo(() => {
    const rows: Array<{
      metric: string;
      a: number | null;
      b: number | null;
      aDisplay: string;
      bDisplay: string;
    }> = [];
    const push = (
      metric: string,
      a: number | null,
      b: number | null,
      digits: number
    ) => {
      if (a == null && b == null) return;
      rows.push({
        metric,
        a,
        b,
        aDisplay: a == null ? "—" : formatSigned(a, digits),
        bDisplay: b == null ? "—" : formatSigned(b, digits),
      });
    };
    push("DRBL", sideA.drblNet, sideB.drblNet, 2);
    push("WAR1", sideA.war1Net, sideB.war1Net, 2);
    push("BPM", sideA.bpmNet, sideB.bpmNet, 2);
    return rows;
  }, [sideA, sideB]);

  if (!data.length) return null;

  return (
    <figure
      aria-labelledby={`${chartId}-title`}
      aria-describedby={`${chartId}-desc`}
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border/60 bg-background/40 p-3",
        className
      )}
    >
      <div>
        <p
          id={`${chartId}-title`}
          className={cn(
            type.micro,
            "font-bold uppercase tracking-[0.12em] text-muted-foreground"
          )}
        >
          Net impact
        </p>
        <p
          id={`${chartId}-desc`}
          className={cn(type.caption, "mt-0.5 text-muted-foreground")}
        >
          Who gains on the model nets — blank sides mean a moved player has no
          row (missing ≠ 0).
        </p>
      </div>
      <div className="h-44 w-full min-w-0 sm:h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
            barCategoryGap="28%"
          >
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-border"
              vertical={false}
              strokeOpacity={theme.gridOpacity()}
            />
            <XAxis
              dataKey="metric"
              tick={{ fontSize: 11 }}
              className="fill-muted-foreground"
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10 }}
              className="fill-muted-foreground"
              width={36}
              tickFormatter={(v: number) => formatNumber(v, 1)}
            />
            <Tooltip
              cursor={{ fill: "currentColor", fillOpacity: 0.04 }}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as
                  | (typeof data)[number]
                  | undefined;
                if (!active || !row) return null;
                return (
                  <FrostRechartsTooltip active={active}>
                    <p className="text-[12px] font-semibold">{row.metric}</p>
                    <p className="mt-1 text-[11px] tabular-nums">
                      <span style={{ color: aFill }}>{sideA.abbr}</span>
                      {": "}
                      {row.aDisplay}
                    </p>
                    <p className="text-[11px] tabular-nums">
                      <span style={{ color: bFill }}>{sideB.abbr}</span>
                      {": "}
                      {row.bDisplay}
                    </p>
                  </FrostRechartsTooltip>
                );
              }}
              wrapperStyle={rechartsFrostWrapperStyle}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 2 }}
              iconType="circle"
            />
            <Bar
              name={sideA.abbr}
              dataKey="a"
              fill={aFill}
              radius={[3, 3, 0, 0]}
              maxBarSize={28}
            />
            <Bar
              name={sideB.abbr}
              dataKey="b"
              fill={bFill}
              radius={[3, 3, 0, 0]}
              maxBarSize={28}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

function formatSigned(value: number, digits: number): string {
  const body = formatNumber(value, digits);
  return value > 0 ? `+${body}` : body;
}
