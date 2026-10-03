"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  Tooltip,
} from "recharts";

import {
  FrostRechartsTooltip,
  rechartsFrostWrapperStyle,
} from "@/components/brand/frost-recharts-tooltip";
import type { ComparisonDimension } from "@/analytics";
import {
  compareScore,
  hasPeerPercentiles,
  pickRadarAxes,
} from "@/components/compare/compare-scale";
import { useChartTheme } from "@/lib/chart-theme";
import { type } from "@/lib/design-system";
import { formatOrdinal } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Rendered width of the tile, tracked so the radius can leave room for labels. */
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.round(el.getBoundingClientRect().width));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Height follows width so phones do not get a small shape floating in a tall
 * box, and the radius shrinks by the widest label so side labels never clip.
 */
function radarGeometry(width: number, labels: string[]) {
  const fontSize = width < 300 ? 10 : 11;
  const height = Math.round(Math.min(340, Math.max(210, width * 0.86)));
  const longest = labels.reduce((n, l) => Math.max(n, l.length), 0);
  const labelWidth = longest * fontSize * 0.6;
  const sideRoom = width / 2 - labelWidth - 8;
  const verticalRoom = height / 2 - fontSize - 14;
  const outerRadius = Math.max(48, Math.min(sideRoom, verticalRoom));
  return { fontSize, height, outerRadius };
}

/**
 * Spider overview for head-to-head compare. Outlines carry the read; fills stay
 * faint so two elite players do not merge into one blob.
 */
export function PlayerCompareRadar({
  axes,
  dimensions,
  aName,
  bName,
  aColor,
  bColor,
  className,
}: {
  /** Pre-picked axes; derived from `dimensions` when omitted. */
  axes?: ComparisonDimension[];
  dimensions: ComparisonDimension[];
  aName: string;
  bName: string;
  aColor: string;
  bColor: string;
  className?: string;
}) {
  const chartId = useId();
  const theme = useChartTheme();
  const [boxRef, width] = useElementWidth<HTMLDivElement>();

  const picked = useMemo(
    () => axes ?? pickRadarAxes(dimensions),
    [axes, dimensions]
  );
  const data = useMemo(
    () =>
      picked.map((d) => ({
        metric: d.label,
        a: compareScore(d, "a") ?? 0,
        b: compareScore(d, "b") ?? 0,
        aDisplay: d.aDisplay,
        bDisplay: d.bDisplay,
      })),
    [picked]
  );

  if (data.length < 3) return null;

  const usesPercentile = picked.every(hasPeerPercentiles);
  const geo = radarGeometry(
    width,
    data.map((d) => d.metric)
  );

  return (
    <figure
      aria-labelledby={`${chartId}-title`}
      aria-describedby={`${chartId}-desc`}
      className={cn("flex min-w-0 flex-col gap-2", className)}
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
            ? "Peer percentile on each axis. The outer ring is the top of the league."
            : "No league percentiles for these rows. The leader on each axis sits on the outer ring, and the other side is shorter by the percent gap."}
        </p>
      </div>
      <div
        ref={boxRef}
        className="mx-auto w-full min-w-0 max-w-md"
        style={{ height: geo.height }}
      >
        {width > 0 ? (
          <RadarChart
            width={width}
            height={geo.height}
            cx="50%"
            cy="50%"
            outerRadius={geo.outerRadius}
            margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
            data={data}
          >
            <PolarGrid
              stroke="currentColor"
              className="text-border"
              strokeOpacity={theme.gridOpacity() * 1.4}
            />
            <PolarAngleAxis
              dataKey="metric"
              tick={{
                fontSize: geo.fontSize,
                fontWeight: 600,
                fill: "var(--muted-foreground)",
              }}
              axisLine={false}
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
                      <span style={{ color: aColor }}>{aName}</span>
                      {": "}
                      {row.aDisplay}
                      {usesPercentile ? ` (${formatOrdinal(row.a)})` : ""}
                    </p>
                    <p className="text-[11px] tabular-nums">
                      <span style={{ color: bColor }}>{bName}</span>
                      {": "}
                      {row.bDisplay}
                      {usesPercentile ? ` (${formatOrdinal(row.b)})` : ""}
                    </p>
                  </FrostRechartsTooltip>
                );
              }}
              wrapperStyle={rechartsFrostWrapperStyle}
            />
            <Radar
              name={aName}
              dataKey="a"
              stroke={aColor}
              fill={aColor}
              fillOpacity={0.14}
              strokeWidth={2.5}
              dot={{ r: 3, fill: aColor, strokeWidth: 0 }}
              isAnimationActive={false}
            />
            <Radar
              name={bName}
              dataKey="b"
              stroke={bColor}
              fill={bColor}
              fillOpacity={0.1}
              strokeWidth={2.5}
              strokeDasharray="6 4"
              dot={{ r: 3, fill: bColor, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          </RadarChart>
        ) : null}
      </div>
      <div
        className={cn(
          type.caption,
          "flex flex-wrap items-center justify-center gap-x-4 gap-y-1 font-semibold"
        )}
      >
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden>
            <line x1="0" y1="3" x2="18" y2="3" stroke={aColor} strokeWidth="3" />
          </svg>
          {aName}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden>
            <line
              x1="0"
              y1="3"
              x2="18"
              y2="3"
              stroke={bColor}
              strokeWidth="3"
              strokeDasharray="5 3"
            />
          </svg>
          {bName}
        </span>
      </div>
    </figure>
  );
}
