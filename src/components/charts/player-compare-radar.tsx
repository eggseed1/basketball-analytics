"use client";

import { useId, useMemo } from "react";
import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import {
  FrostRechartsTooltip,
  rechartsFrostWrapperStyle,
} from "@/components/brand/frost-recharts-tooltip";
import type { ComparisonDimension } from "@/analytics";
import { useChartTheme } from "@/lib/chart-theme";
import { type } from "@/lib/design-system";
import { teamBrandCompareBarFill } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

function axisScore(
  dimension: ComparisonDimension,
  side: "a" | "b"
): number | null {
  const pct = side === "a" ? dimension.aPercentile : dimension.bPercentile;
  if (pct != null && Number.isFinite(pct)) {
    return Math.max(0, Math.min(100, pct));
  }
  const bar = side === "a" ? dimension.aBar : dimension.bBar;
  if (bar != null && Number.isFinite(bar)) {
    return Math.max(0, Math.min(100, bar));
  }
  return null;
}

/**
 * Spider overview for head-to-head compare — shape of the matchup at a glance.
 * Prefer peer percentiles when present; otherwise relative matchup bars.
 */
export function PlayerCompareRadar({
  dimensions,
  aName,
  bName,
  aTeamKey,
  bTeamKey,
  className,
}: {
  dimensions: ComparisonDimension[];
  aName: string;
  bName: string;
  aTeamKey?: string | null;
  bTeamKey?: string | null;
  className?: string;
}) {
  const chartId = useId();
  const theme = useChartTheme();
  const aFill = teamBrandCompareBarFill(aTeamKey);
  const bFill = teamBrandCompareBarFill(bTeamKey);

  const data = useMemo(() => {
    const rows: Array<{
      metric: string;
      a: number;
      b: number;
      aDisplay: string;
      bDisplay: string;
    }> = [];
    for (const d of dimensions) {
      const a = axisScore(d, "a");
      const b = axisScore(d, "b");
      if (a == null && b == null) continue;
      rows.push({
        metric: d.label,
        a: a ?? 0,
        b: b ?? 0,
        aDisplay: d.aDisplay,
        bDisplay: d.bDisplay,
      });
      if (rows.length >= 8) break;
    }
    return rows;
  }, [dimensions]);

  if (data.length < 3) return null;

  const usesPercentile = dimensions.some(
    (d) => d.aPercentile != null || d.bPercentile != null
  );

  return (
    <figure
      aria-labelledby={`${chartId}-title`}
      aria-describedby={`${chartId}-desc`}
      className={cn(
        "flex flex-col gap-2 border-b border-border px-3 py-3 sm:px-5",
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
          Matchup shape
        </p>
        <p
          id={`${chartId}-desc`}
          className={cn(type.caption, "mt-0.5 text-muted-foreground")}
        >
          {usesPercentile
            ? "Peer percentiles across the sheet — larger area means higher league standing on that axis."
            : "Relative scale across the sheet — larger area means the stronger side of each matchup bar."}
        </p>
      </div>
      <div className="mx-auto h-64 w-full max-w-lg min-w-0 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="68%" data={data}>
            <PolarGrid
              stroke="currentColor"
              className="text-border"
              strokeOpacity={theme.gridOpacity()}
            />
            <PolarAngleAxis
              dataKey="metric"
              tick={{ fontSize: 11 }}
              className="fill-muted-foreground"
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={false}
              axisLine={false}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0]?.payload as
                  | (typeof data)[number]
                  | undefined;
                if (!row) return null;
                return (
                  <FrostRechartsTooltip active={active}>
                    <p className="text-[12px] font-semibold">{row.metric}</p>
                    <p className="mt-1 text-[11px] tabular-nums">
                      <span style={{ color: aFill }}>{aName}</span>
                      {": "}
                      {row.aDisplay}
                      {usesPercentile ? ` (${Math.round(row.a)}th)` : ""}
                    </p>
                    <p className="text-[11px] tabular-nums">
                      <span style={{ color: bFill }}>{bName}</span>
                      {": "}
                      {row.bDisplay}
                      {usesPercentile ? ` (${Math.round(row.b)}th)` : ""}
                    </p>
                  </FrostRechartsTooltip>
                );
              }}
              wrapperStyle={rechartsFrostWrapperStyle}
            />
            <Radar
              name={aName}
              dataKey="a"
              stroke={aFill}
              fill={aFill}
              fillOpacity={0.28}
              strokeWidth={2}
            />
            <Radar
              name={bName}
              dataKey="b"
              stroke={bFill}
              fill={bFill}
              fillOpacity={0.22}
              strokeWidth={2}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
              iconType="circle"
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
