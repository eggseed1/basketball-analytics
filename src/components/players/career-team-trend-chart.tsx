"use client";

import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Curve,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
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
import { distinctTeamColors } from "@/lib/nba-brand";
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

export type CareerGameDot = {
  /** Axis label matching `CareerSeriesPoint.season`, e.g. "24-25". */
  season: string;
  value: number;
  /** Fractional calendar year so games spread through the season. */
  year: number;
};

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

const DRAW_MS = 650;
const DRAW_EASING = "cubic-bezier(0.33, 1, 0.68, 1)";

/**
 * One draw-in per stat switch, shared by the stroke and the dots. Recharts
 * remounts both when the data changes, so the clock lives with the chart and
 * remounted pieces pick up mid-draw instead of starting over.
 */
class DrawClock {
  private drawnRun = 0;
  private clockRun = 0;
  private startedAt = 0;
  private animation: Animation | null = null;

  elapsed(run: number): number {
    const now = performance.now();
    if (this.clockRun !== run) {
      this.clockRun = run;
      this.startedAt = now;
    }
    return now - this.startedAt;
  }

  /** Draws `path` in for `run`, or follows a reshape while that run is still drawing. */
  draw(path: SVGPathElement, run: number): void {
    const inFlight = this.drawnRun === run && this.animation?.playState === "running";
    if (run <= this.drawnRun && !inFlight) return;
    this.drawnRun = run;
    const elapsed = this.elapsed(run);
    if (elapsed >= DRAW_MS) return;
    const length = path.getTotalLength();
    const dash = `${length} ${length}`;
    this.animation?.cancel();
    this.animation = path.animate(
      [
        { strokeDasharray: dash, strokeDashoffset: length },
        { strokeDasharray: dash, strokeDashoffset: 0 },
      ],
      { duration: DRAW_MS, easing: DRAW_EASING }
    );
    this.animation.currentTime = elapsed;
  }
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
  /** Bumped when the plotted stat changes; the next new path draws in. */
  drawRun?: number;
  drawClock?: DrawClock;
}) {
  const points = (props.points ?? []).filter(
    (p): p is { x: number; y: number } =>
      typeof p.x === "number" &&
      typeof p.y === "number" &&
      Number.isFinite(p.x) &&
      Number.isFinite(p.y)
  );
  const groupRef = useRef<SVGGElement>(null);
  const lastShape = useRef<string | null>(null);
  const shape = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const drawRun = props.drawRun ?? 0;
  const drawClock = props.drawClock;

  // Recharts can hand over the new points a render or two after the stat
  // switch (the axis domain settles last), so the draw starts when the path
  // itself changes. Refreshes of the same stat move the path without a
  // pending run and stay still.
  useLayoutEffect(() => {
    const changed = shape !== lastShape.current;
    lastShape.current = shape;
    if (!changed || !drawClock || drawRun === 0) return;
    const path = groupRef.current?.querySelector("path");
    if (!path || prefersReducedMotion()) return;
    drawClock.draw(path, drawRun);
  }, [shape, drawRun, drawClock]);

  if (points.length < 2 || props.strokeStops.length === 0) return null;

  const x1 = points[0]!.x;
  const x2 = points[points.length - 1]!.x;
  const strokeWidth =
    typeof props.strokeWidth === "number"
      ? props.strokeWidth
      : Number(props.strokeWidth) || 2.5;

  return (
    <g ref={groupRef} className="recharts-career-monotone-stroke">
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

/** Replays a dot's pop-in each draw run, timed to when the line reaches it. */
function DotDrawIn({
  run,
  delay,
  drawClock,
  children,
}: {
  run?: number;
  delay?: number;
  drawClock?: DrawClock;
  children: ReactNode;
}) {
  if (!run || delay == null || !drawClock) return <>{children}</>;
  return (
    <DotDrawInGroup key={run} run={run} delay={delay} drawClock={drawClock}>
      {children}
    </DotDrawInGroup>
  );
}

function DotDrawInGroup({
  run,
  delay,
  drawClock,
  children,
}: {
  run: number;
  delay: number;
  drawClock: DrawClock;
  children: ReactNode;
}) {
  const ref = useRef<SVGGElement>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const elapsed = drawClock.elapsed(run);
    ref.current.style.animationDelay = `${Math.round(delay - elapsed)}ms`;
  }, [run, delay, drawClock]);
  return (
    <g ref={ref} className="career-dot-draw">
      {children}
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
  drawRun?: number;
  drawDelay?: number;
  drawClock?: DrawClock;
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
      <DotDrawIn run={props.drawRun} delay={props.drawDelay} drawClock={props.drawClock}>
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill={payload.color}
          stroke={selected ? "var(--foreground)" : "var(--background)"}
          strokeWidth={selected ? 2 : 1.5}
        />
      </DotDrawIn>
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
  drawRun?: number;
  drawDelay?: number;
  drawClock?: DrawClock;
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
      <DotDrawIn run={props.drawRun} delay={props.drawDelay} drawClock={props.drawClock}>
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill={payload.color}
          stroke={selected ? "var(--foreground)" : "var(--background)"}
          strokeWidth={selected ? 2 : 1.5}
        />
      </DotDrawIn>
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
  gameDots,
  height = 220,
  className,
  selectedSeason,
  onSeasonSelect,
  savantScale = false,
  showLegend = true,
  drawKey,
}: {
  points: CareerSeriesPoint[];
  /** Individual games stacked on each season tick. Same units as the line. */
  gameDots?: CareerGameDot[];
  height?: number;
  className?: string;
  selectedSeason?: string;
  onSeasonSelect?: (season: string) => void;
  /**
   * Percentile panel mode: Y = raw metric value; stroke + dots use Savant
   * colors from league percentile. Percentile stays in the tooltip.
   */
  savantScale?: boolean;
  /** Franchise color key under the plot. Default on. */
  showLegend?: boolean;
  /** The plotted stat; switching it draws the line in again. */
  drawKey?: string;
}) {
  const chartTheme = useChartTheme();
  const [seenDrawKey, setSeenDrawKey] = useState(drawKey);
  const [drawRun, setDrawRun] = useState(0);
  const [drawClock] = useState(() => new DrawClock());
  if (drawKey !== seenDrawKey) {
    setSeenDrawKey(drawKey);
    setDrawRun((run) => run + 1);
  }
  const palette = useMemo(
    () => distinctTeamColors(points.map((p) => p.teamId), chartTheme.surface),
    [points, chartTheme.surface]
  );
  const teamColor = useCallback(
    (teamId?: string | null) =>
      (teamId && palette.get(teamId)) || chartTheme.teamColor(teamId).color,
    [palette, chartTheme]
  );
  // Percentile mode never falls back to team colors: a season not ranked yet
  // (fast payload, missing peer board) stays neutral until its percentile lands.
  const hasPercentileColors = savantScale;

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
          pct != null
            ? percentileSavantColor(pct, chartTheme.surface)
            : "var(--muted-foreground)",
      };
    });
  }, [points, hasPercentileColors, chartTheme.surface]);

  const themedPlotPoints = useMemo((): CareerSeriesPoint[] => {
    if (hasPercentileColors) return plotPoints;
    return plotPoints.map((point) => ({
      ...point,
      color: teamColor(point.teamId),
    }));
  }, [teamColor, hasPercentileColors, plotPoints]);

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
        color: teamColor(entry.teamId),
      })),
    [teamColor, franchiseLegend]
  );

  const handleSelect = (row: ChartRow) => {
    if (!onSeasonSelect) return;
    const season = row.fullSeason ?? row.season;
    onSeasonSelect(season);
  };

  const useSavantDots = hasPercentileColors;

  // The stroke eases out (cubic), so it reaches point i at 1 - (1 - f)^(1/3)
  // of the draw; each dot pops in as the line gets to it.
  const dotDelay = (index: number) => {
    const f = data.length > 1 ? index / (data.length - 1) : 0;
    return DRAW_MS * (1 - Math.cbrt(1 - f));
  };

  const renderDot = (props: {
    cx?: number;
    cy?: number;
    payload?: ChartRow;
    index?: number;
  }) => {
    const Dot = useSavantDots ? SavantDot : TeamDot;
    return (
      <Dot
        cx={props.cx}
        cy={props.cy}
        payload={props.payload}
        selectedSeason={selectedSeason}
        onSelect={onSeasonSelect ? handleSelect : undefined}
        drawRun={drawRun}
        drawDelay={props.index != null ? dotDelay(props.index) : undefined}
        drawClock={drawClock}
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

  const showFranchiseLegend =
    showLegend && !useSavantDots && visibleLegend.length > 1;

  const yearRows = useMemo(
    () =>
      data.map((row) => {
        const start = Number((row.fullSeason ?? "").slice(0, 4));
        const year = Number.isFinite(start) ? start + 0.72 : Number.NaN;
        return { ...row, year };
      }),
    [data]
  );
  const scatterDots = useMemo(
    () =>
      (gameDots ?? []).filter(
        (dot) => Number.isFinite(dot.year) && Number.isFinite(dot.value)
      ),
    [gameDots]
  );
  const useYearAxis = scatterDots.length > 0 && yearRows.every((row) => Number.isFinite(row.year));
  const yearTicks = useMemo(() => {
    if (!useYearAxis) return [];
    const years = [
      ...yearRows.map((row) => row.year),
      ...scatterDots.map((dot) => dot.year),
    ];
    const min = Math.floor(Math.min(...years));
    const max = Math.ceil(Math.max(...years));
    const ticks: number[] = [];
    for (let y = min + (min % 2); y <= max; y += 2) ticks.push(y);
    return ticks;
  }, [useYearAxis, yearRows, scatterDots]);

  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      {/*
        Explicit px height on ResponsiveContainer (not %). Percentage height
        can resolve against a taller ancestor and paint the SVG over siblings
        (legend / "Closest …" headings).
      */}
      <div
        className="relative w-full min-w-0 shrink-0 overflow-hidden"
        style={{ height }}
      >
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart
            data={useYearAxis ? yearRows : data}
            margin={{ top: 8, right: 8, left: 0, bottom: 2 }}
          >
            <XAxis
              dataKey={useYearAxis ? "year" : "season"}
              type={useYearAxis ? "number" : "category"}
              ticks={useYearAxis ? yearTicks : undefined}
              domain={useYearAxis ? ["dataMin - 0.3", "dataMax + 0.3"] : undefined}
              tickFormatter={useYearAxis ? (value: number) => String(Math.round(value)) : undefined}
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
            {teamChangeSeasons.map((season) => {
              const at = useYearAxis
                ? yearRows.find((row) => row.season === season)?.year
                : season;
              if (at == null) return null;
              return (
                <ReferenceLine
                  key={season}
                  x={at}
                  stroke="var(--border)"
                  strokeWidth={1}
                  strokeOpacity={0.85}
                  ifOverflow="extendDomain"
                />
              );
            })}
            {useYearAxis ? (
              <Scatter
                data={scatterDots}
                dataKey="value"
                fill={chartTheme.teamColor(themedPlotPoints[0]?.teamId).color}
                fillOpacity={chartTheme.isDark ? 0.45 : 0.35}
                stroke="none"
                r={2.4}
                isAnimationActive={false}
                legendType="none"
              />
            ) : null}
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
                  drawRun={drawRun}
                  drawClock={drawClock}
                />
              )}
              dot={useYearAxis ? false : renderDot}
              activeDot={useYearAxis ? false : renderActiveDot}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {showFranchiseLegend ? (
        <ul
          className="mt-2 flex shrink-0 flex-wrap gap-x-3 gap-y-1"
          aria-label="Franchise colors"
        >
          {visibleLegend.map((t) => (
            <li
              key={t.teamId}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground"
            >
              <span
                className="inline-block size-2.5 shrink-0 rounded-full"
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

function valueAxisTicks(min: number, max: number): number[] {
  const span = max - min;
  const step = span > 20 ? 5 : span > 10 ? 2 : 1;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= max + 1e-6; value += step) ticks.push(value);
  if (min < 0 && max > 0 && !ticks.includes(0)) ticks.push(0);
  return ticks.sort((a, b) => a - b);
}

function yearAxisTicks(min: number, max: number): number[] {
  const start = min % 2 === 0 ? min : min + 1;
  const ticks: number[] = [];
  for (let year = start; year <= max; year += 2) ticks.push(year);
  return ticks;
}

export function TalentYearChart({
  dots,
  line,
  kind,
  height = 260,
}: {
  dots: Array<{ year: number; value: number }>;
  line: Array<{ year: number; value: number }>;
  kind: "impact" | "box";
  height?: number;
}) {
  const theme = useChartTheme();
  const years = [...dots, ...line].map((point) => point.year);
  const xMin = Math.floor(Math.min(...years));
  const xMax = Math.ceil(Math.max(...years));
  const values = [...dots, ...line].map((point) => point.value);
  const yMin = Math.min(...values);
  const yMax = Math.max(...values);
  const yPad = Math.max(0.35, (yMax - yMin) * 0.12);
  const dotFill = theme.isDark ? "#93c5fd" : "#8eb8e6";
  const lineStroke = theme.isDark ? "#60a5fa" : "#2f6fed";
  const dotOpacity = kind === "impact" ? 0.32 : 0.18;
  const dotRadius = kind === "impact" ? 1.35 : 1.05;
  const ring = theme.isDark ? "#0b1220" : "#ffffff";
  return (
    <div className="relative w-full min-w-0 shrink-0" style={{ height }}>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid
            vertical={false}
            stroke="currentColor"
            strokeOpacity={theme.isDark ? 0.14 : 0.08}
            strokeDasharray="1 4"
          />
          <XAxis
            dataKey="year"
            type="number"
            domain={[xMin - 0.15, xMax + 0.15]}
            ticks={yearAxisTicks(xMin, xMax)}
            tickFormatter={(value: number) => String(value)}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            width={32}
            domain={[yMin - yPad, yMax + yPad]}
            ticks={valueAxisTicks(yMin - yPad, yMax + yPad)}
            tickFormatter={formatCareerChartNumber}
          />
          <ReferenceLine
            y={0}
            stroke="currentColor"
            strokeOpacity={0.35}
            strokeDasharray="4 4"
          />
          <Scatter
            data={dots}
            dataKey="value"
            tooltipType="none"
            isAnimationActive={false}
            legendType="none"
            shape={(props: { cx?: number; cy?: number }) => {
              if (props.cx == null || props.cy == null || !Number.isFinite(props.cx)) {
                return <g />;
              }
              return (
                <circle
                  cx={props.cx}
                  cy={props.cy}
                  r={dotRadius}
                  fill={dotFill}
                  fillOpacity={dotOpacity}
                  pointerEvents="none"
                />
              );
            }}
          />
          <Line
            data={line}
            type="monotone"
            dataKey="value"
            stroke={lineStroke}
            strokeWidth={2}
            dot={false}
            activeDot={false}
            tooltipType="none"
            style={{ pointerEvents: "none" }}
            isAnimationActive={false}
          />
          <Scatter
            data={line}
            name="season"
            dataKey="value"
            tooltipType="none"
            isAnimationActive={false}
            legendType="none"
            shape={(props: {
              cx?: number;
              cy?: number;
              payload?: { season?: string; value?: number };
            }) => {
              if (props.cx == null || props.cy == null || !Number.isFinite(props.cx)) {
                return <g />;
              }
              const value = props.payload?.value;
              const season = props.payload?.season;
              const label =
                value != null && Number.isFinite(value)
                  ? formatCareerChartNumber(value)
                  : null;
              return (
                <g
                  data-tip={season || label || undefined}
                  data-tip-sub={season && label ? label : undefined}
                >
                  <circle cx={props.cx} cy={props.cy} r={12} fill="transparent" />
                  <circle
                    data-tip-anchor=""
                    cx={props.cx}
                    cy={props.cy}
                    r={5.5}
                    fill={lineStroke}
                    stroke={ring}
                    strokeWidth={2}
                  />
                </g>
              );
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
