"use client";

import { useId, useMemo } from "react";
import {
  Curve,
  Line,
  LineChart,
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
import { TeamLogo } from "@/components/brand/team-logo";
import { type } from "@/lib/design-system";
import { useChartTheme } from "@/lib/chart-theme";
import { formatNumber } from "@/lib/format";
import { percentileSavantColor } from "@/lib/player-grade";
import { cn } from "@/lib/utils";

/** Compact axis/tooltip labels — avoid raw float dumps like 8.012345678. */
function formatCareerChartNumber(value: number): string {
  if (!Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  if (abs >= 100 || Math.abs(value - Math.round(value)) < 1e-6) {
    return formatNumber(Math.round(value), 0);
  }
  return formatNumber(value, 1);
}

export type CareerSeriesPoint = {
  /** Short label on the axis, e.g. "16-17". */
  season: string;
  /** Canonical season id, e.g. "2016-17". */
  fullSeason?: string;
  /** Plotted Y when not using percentile mode; raw metric otherwise. */
  value: number;
  /** Raw metric retained when the chart plots percentile on Y. */
  rawValue?: number;
  teamId: string;
  teamAbbr: string;
  color: string;
  /** League percentile for Savant stroke / Y when plotPercentile. */
  percentile?: number;
};

type ChartRow = {
  season: string;
  fullSeason?: string;
  value: number;
  rawValue?: number;
  teamId: string;
  teamAbbr: string;
  color: string;
  percentile?: number;
};

export type CareerStrokeStop = {
  offset: string;
  color: string;
};

function toChartRows(points: CareerSeriesPoint[]): ChartRow[] {
  return points.map((p) => ({
    season: p.season,
    fullSeason: p.fullSeason,
    value: p.value,
    rawValue: p.rawValue,
    teamId: p.teamId,
    teamAbbr: p.teamAbbr,
    color: p.color,
    percentile: p.percentile,
  }));
}

/** Evenly spaced X stops so one monotone stroke can blend team / Savant colors. */
function buildStrokeStops(points: CareerSeriesPoint[]): CareerStrokeStop[] {
  if (points.length === 0) return [];
  if (points.length === 1) {
    return [{ offset: "0%", color: points[0]!.color }];
  }
  const last = points.length - 1;
  return points.map((p, i) => ({
    offset: `${((i / last) * 100).toFixed(4)}%`,
    color: p.color,
  }));
}

function franchiseLegendFrom(
  points: CareerSeriesPoint[]
): Array<{ teamId: string; teamAbbr: string; color: string }> {
  const legend: Array<{ teamId: string; teamAbbr: string; color: string }> = [];
  const seen = new Set<string>();
  for (const p of points) {
    if (seen.has(p.teamId)) continue;
    seen.add(p.teamId);
    legend.push({
      teamId: p.teamId,
      teamAbbr: p.teamAbbr,
      color: p.color,
    });
  }
  return legend;
}

function teamChangeSeasonsFrom(points: CareerSeriesPoint[]): string[] {
  const out: string[] = [];
  for (let i = 1; i < points.length; i++) {
    if (points[i]!.teamId !== points[i - 1]!.teamId) {
      out.push(points[i]!.season);
    }
  }
  return out;
}

/**
 * One continuous series for a single monotone stroke.
 * Color handoffs are gradient stops along that path (not separate Line pieces).
 */
export function buildTeamSegmentedChart(points: CareerSeriesPoint[]): {
  data: ChartRow[];
  strokeStops: CareerStrokeStop[];
  legend: Array<{ teamId: string; teamAbbr: string; color: string }>;
  teamChangeSeasons: string[];
} {
  if (points.length < 2) {
    return { data: [], strokeStops: [], legend: [], teamChangeSeasons: [] };
  }
  return {
    data: toChartRows(points),
    strokeStops: buildStrokeStops(points),
    legend: franchiseLegendFrom(points),
    teamChangeSeasons: teamChangeSeasonsFrom(points),
  };
}

/** Percentile strokes: same continuous path; colors from each point's Savant color. */
export function buildSavantSegmentedChart(points: CareerSeriesPoint[]): {
  data: ChartRow[];
  strokeStops: CareerStrokeStop[];
  teamChangeSeasons: string[];
} {
  if (points.length < 2) {
    return { data: [], strokeStops: [], teamChangeSeasons: [] };
  }
  return {
    data: toChartRows(points),
    strokeStops: buildStrokeStops(points),
    teamChangeSeasons: teamChangeSeasonsFrom(points),
  };
}

/**
 * One monotone curve colored with a user-space X gradient.
 * objectBoundingBox stroke gradients reverse on rising/falling segments;
 * anchoring to the plotted point xs keeps colors aligned with the dots.
 */
export function CareerMonotoneStroke(props: {
  points?: ReadonlyArray<{ x?: number | null; y?: number | null }>;
  strokeWidth?: number | string;
  gradientId: string;
  strokeStops: CareerStrokeStop[];
}) {
  const points = (props.points ?? []).filter(
    (p): p is { x: number; y: number } =>
      typeof p.x === "number" &&
      typeof p.y === "number" &&
      Number.isFinite(p.x) &&
      Number.isFinite(p.y)
  );
  if (points.length < 2 || props.strokeStops.length === 0) return null;

  const x1 = points[0]!.x;
  const x2 = points[points.length - 1]!.x;
  const strokeWidth =
    typeof props.strokeWidth === "number"
      ? props.strokeWidth
      : Number(props.strokeWidth) || 2.5;

  return (
    <g className="recharts-career-monotone-stroke">
      <defs>
        <linearGradient
          id={props.gradientId}
          gradientUnits="userSpaceOnUse"
          x1={x1}
          y1={0}
          x2={x2}
          y2={0}
        >
          {props.strokeStops.map((stop) => (
            <stop
              key={`${stop.offset}-${stop.color}`}
              offset={stop.offset}
              stopColor={stop.color}
            />
          ))}
        </linearGradient>
      </defs>
      <Curve
        type="monotone"
        points={points}
        stroke={`url(#${props.gradientId})`}
        strokeWidth={strokeWidth}
        fill="none"
      />
    </g>
  );
}

function TeamDot(props: {
  cx?: number;
  cy?: number;
  payload?: ChartRow;
  selectedSeason?: string;
  onSelect?: (row: ChartRow) => void;
  active?: boolean;
}) {
  const { cx, cy, payload, selectedSeason, onSelect, active } = props;
  if (cx == null || cy == null || !payload) return null;
  const selected = isSeasonSelected(payload, selectedSeason);
  const r = active || selected ? 6 : 4;
  return (
    <g
      className={onSelect ? "cursor-pointer" : undefined}
      onClick={
        onSelect
          ? (event) => {
              event.stopPropagation();
              onSelect(payload);
            }
          : undefined
      }
    >
      {/* Larger invisible hit target for easier clicks. */}
      {onSelect ? (
        <circle cx={cx} cy={cy} r={14} fill="transparent" stroke="none" />
      ) : null}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={payload.color}
        stroke={selected ? "var(--foreground)" : "var(--background)"}
        strokeWidth={selected ? 2 : 1.5}
      />
    </g>
  );
}

function isSeasonSelected(
  payload: ChartRow,
  selectedSeason?: string
): boolean {
  if (!selectedSeason) return false;
  if (payload.fullSeason === selectedSeason) return true;
  if (payload.season === selectedSeason) return true;
  if (payload.season === selectedSeason.slice(2)) return true;
  return false;
}

function SavantDot(props: {
  cx?: number;
  cy?: number;
  payload?: ChartRow;
  selectedSeason?: string;
  onSelect?: (row: ChartRow) => void;
  active?: boolean;
}) {
  const { cx, cy, payload, selectedSeason, onSelect, active } = props;
  if (cx == null || cy == null || !payload) return null;
  const selected = isSeasonSelected(payload, selectedSeason);
  const r = active || selected ? 6 : 4;
  return (
    <g
      className={onSelect ? "cursor-pointer" : undefined}
      onClick={
        onSelect
          ? (event) => {
              event.stopPropagation();
              onSelect(payload);
            }
          : undefined
      }
    >
      {onSelect ? (
        <circle cx={cx} cy={cy} r={14} fill="transparent" stroke="none" />
      ) : null}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={payload.color}
        stroke={selected ? "var(--foreground)" : "var(--background)"}
        strokeWidth={selected ? 2 : 1.5}
      />
    </g>
  );
}

function CareerChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{
    dataKey?: string | number;
    value?: number | string;
    payload?: ChartRow;
  }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as ChartRow | undefined;
  const item =
    payload.find((p) => p.dataKey !== "value" && p.value != null) ??
    payload.find((p) => p.dataKey === "value");
  const plotted =
    typeof item?.value === "number" ? item.value : Number(item?.value);
  const abbr = row?.teamAbbr;
  const pct =
    row?.percentile != null && Number.isFinite(row.percentile)
      ? Math.round(row.percentile)
      : null;
  const raw =
    row?.rawValue != null && Number.isFinite(row.rawValue)
      ? formatCareerChartNumber(row.rawValue)
      : Number.isFinite(plotted)
        ? formatCareerChartNumber(plotted)
        : null;

  return (
    <FrostRechartsTooltip active={active} className="w-max max-w-[12rem]">
      <p className={cn(type.caption, "font-semibold text-foreground")}>
        {abbr ? `${label} · ${abbr}` : String(label ?? "")}
      </p>
      <p
        className={cn(
          type.caption,
          "mt-0.5 tabular-nums text-muted-foreground"
        )}
      >
        {raw}
        {raw != null && pct != null ? " · " : null}
        {pct != null ? `${pct}th pct` : null}
        {raw == null && pct == null && Number.isFinite(plotted)
          ? formatCareerChartNumber(plotted)
          : null}
      </p>
    </FrostRechartsTooltip>
  );
}

export function CareerTeamTrendChart({
  points,
  height = 220,
  className,
  selectedSeason,
  onSeasonSelect,
  savantScale = false,
}: {
  points: CareerSeriesPoint[];
  height?: number;
  className?: string;
  selectedSeason?: string;
  onSeasonSelect?: (season: string) => void;
  /**
   * Percentile panel mode: Y = raw metric value; stroke + dots use Savant
   * colors from league percentile. Percentile stays in the tooltip.
   */
  savantScale?: boolean;
}) {
  const chartTheme = useChartTheme();
  const hasPercentileColors =
    savantScale && points.some((p) => p.percentile != null);

  const plotPoints = useMemo((): CareerSeriesPoint[] => {
    if (!hasPercentileColors) return points;
    return points.map((p) => {
      const pct =
        p.percentile != null && Number.isFinite(p.percentile)
          ? Math.max(0, Math.min(100, p.percentile))
          : null;
      return {
        ...p,
        // Keep Y as the raw metric; color encodes percentile.
        rawValue: p.rawValue ?? p.value,
        percentile: pct ?? p.percentile,
        color:
          pct != null ? percentileSavantColor(pct) : chartTheme.teamColor(p.teamId).color,
      };
    });
  }, [points, hasPercentileColors, chartTheme]);

  const themedPlotPoints = useMemo((): CareerSeriesPoint[] => {
    if (hasPercentileColors) return plotPoints;
    return plotPoints.map((point) => ({
      ...point,
      color: chartTheme.teamColor(point.teamId).color,
    }));
  }, [chartTheme, hasPercentileColors, plotPoints]);

  const strokeGradId = `career-stroke-${useId().replace(/:/g, "")}`;

  const { data, strokeStops, legend, teamChangeSeasons } = useMemo(() => {
    if (hasPercentileColors) {
      const savant = buildSavantSegmentedChart(plotPoints);
      const team = buildTeamSegmentedChart(themedPlotPoints);
      return {
        data: savant.data,
        strokeStops: savant.strokeStops,
        legend: team.legend,
        teamChangeSeasons: team.teamChangeSeasons,
      };
    }
    return buildTeamSegmentedChart(themedPlotPoints);
  }, [plotPoints, themedPlotPoints, hasPercentileColors]);

  const franchiseLegend = legend.filter(
    (t) => t.teamId !== "TOT" && t.teamId !== "2TM" && t.teamAbbr !== "-"
  );

  const visibleLegend = useMemo(
    () =>
      franchiseLegend.map((entry) => ({
        ...entry,
        color: chartTheme.teamColor(entry.teamId).color,
      })),
    [chartTheme, franchiseLegend]
  );

  const handleSelect = (row: ChartRow) => {
    if (!onSeasonSelect) return;
    const season = row.fullSeason ?? row.season;
    onSeasonSelect(season);
  };

  const useSavantDots = hasPercentileColors;

  const renderDot = (props: {
    cx?: number;
    cy?: number;
    payload?: ChartRow;
  }) => {
    const Dot = useSavantDots ? SavantDot : TeamDot;
    return (
      <Dot
        cx={props.cx}
        cy={props.cy}
        payload={props.payload}
        selectedSeason={selectedSeason}
        onSelect={onSeasonSelect ? handleSelect : undefined}
      />
    );
  };

  const renderActiveDot = (props: {
    cx?: number;
    cy?: number;
    payload?: ChartRow;
  }) => {
    const Dot = useSavantDots ? SavantDot : TeamDot;
    return (
      <Dot
        cx={props.cx}
        cy={props.cy}
        payload={props.payload}
        selectedSeason={selectedSeason}
        onSelect={onSeasonSelect ? handleSelect : undefined}
        active
      />
    );
  };

  if (data.length < 2) return null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="min-h-[220px] flex-1" style={{ minHeight: height }}>
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="season"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={36}
              domain={["auto", "auto"]}
              tickFormatter={formatCareerChartNumber}
            />
            <Tooltip
              cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
              wrapperStyle={rechartsFrostWrapperStyle}
              content={<CareerChartTooltip />}
            />
            {teamChangeSeasons.map((season) => (
              <ReferenceLine
                key={season}
                x={season}
                stroke="var(--border)"
                strokeWidth={1}
                strokeOpacity={0.85}
                ifOverflow="extendDomain"
              />
            ))}
            <Line
              type="monotone"
              dataKey="value"
              stroke={`url(#${strokeGradId})`}
              strokeWidth={2.5}
              shape={(shapeProps) => (
                <CareerMonotoneStroke
                  points={shapeProps.points}
                  strokeWidth={shapeProps.strokeWidth}
                  gradientId={strokeGradId}
                  strokeStops={strokeStops}
                />
              )}
              dot={renderDot}
              activeDot={onSeasonSelect ? renderActiveDot : renderDot}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {!useSavantDots && visibleLegend.length > 1 ? (
        <ul className="flex flex-wrap gap-x-3 gap-y-1">
          {visibleLegend.map((t) => (
            <li
              key={t.teamId}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground"
            >
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ backgroundColor: t.color }}
                aria-hidden
              />
              <TeamLogo teamKey={t.teamId} size="2xs" />
              {t.teamAbbr}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
