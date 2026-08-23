"use client";

import { useMemo } from "react";
import {
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

type TeamSegment = {
  key: string;
  teamId: string;
  teamAbbr: string;
  color: string;
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
  [segmentKey: string]: string | number | null | undefined;
};

/**
 * Contiguous team stretches → separate line series so the career arc
 * reads as Celtics green → Hawks red (etc.) instead of one flat brand stroke.
 */
export function buildTeamSegmentedChart(points: CareerSeriesPoint[]): {
  data: ChartRow[];
  segments: TeamSegment[];
  legend: Array<{ teamId: string; teamAbbr: string; color: string }>;
  teamChangeSeasons: string[];
} {
  if (!points.length) {
    return { data: [], segments: [], legend: [], teamChangeSeasons: [] };
  }

  const segments: TeamSegment[] = [];
  let run = 0;
  let prevTeam: string | null = null;
  const segKeysForIndex: string[] = [];
  const teamChangeSeasons: string[] = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    if (i > 0 && p.teamId !== points[i - 1]!.teamId) {
      teamChangeSeasons.push(p.season);
    }
    if (p.teamId !== prevTeam) {
      run += 1;
      prevTeam = p.teamId;
      segments.push({
        key: `seg${run}`,
        teamId: p.teamId,
        teamAbbr: p.teamAbbr,
        color: p.color,
      });
    }
    segKeysForIndex.push(segments[segments.length - 1]!.key);
  }

  const data: ChartRow[] = points.map((p, i) => {
    const row: ChartRow = {
      season: p.season,
      fullSeason: p.fullSeason,
      value: p.value,
      rawValue: p.rawValue,
      teamId: p.teamId,
      teamAbbr: p.teamAbbr,
      color: p.color,
      percentile: p.percentile,
    };
    for (const s of segments) {
      row[s.key] = null;
    }
    row[segKeysForIndex[i]!] = p.value;
    return row;
  });

  for (let i = 1; i < points.length; i++) {
    const prevKey = segKeysForIndex[i - 1]!;
    const curKey = segKeysForIndex[i]!;
    if (prevKey === curKey) continue;
    data[i - 1]![curKey] = points[i - 1]!.value;
  }

  const legend: Array<{ teamId: string; teamAbbr: string; color: string }> = [];
  const seen = new Set<string>();
  for (const s of segments) {
    if (seen.has(s.teamId)) continue;
    seen.add(s.teamId);
    legend.push({
      teamId: s.teamId,
      teamAbbr: s.teamAbbr,
      color: s.color,
    });
  }

  return { data, segments, legend, teamChangeSeasons };
}

/** One stroke per season interval - Savant color matches the ranking bars. */
export function buildSavantSegmentedChart(points: CareerSeriesPoint[]): {
  data: ChartRow[];
  segments: TeamSegment[];
  teamChangeSeasons: string[];
} {
  if (points.length < 2) {
    return { data: [], segments: [], teamChangeSeasons: [] };
  }

  const segments: TeamSegment[] = [];
  const teamChangeSeasons: string[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const next = points[i + 1]!;
    if (next.teamId !== points[i]!.teamId) {
      teamChangeSeasons.push(next.season);
    }
    segments.push({
      key: `yr${i}`,
      teamId: next.teamId,
      teamAbbr: next.teamAbbr,
      color: next.color,
    });
  }

  const data: ChartRow[] = points.map((p) => {
    const row: ChartRow = {
      season: p.season,
      fullSeason: p.fullSeason,
      value: p.value,
      rawValue: p.rawValue,
      teamId: p.teamId,
      teamAbbr: p.teamAbbr,
      color: p.color,
      percentile: p.percentile,
    };
    for (const s of segments) {
      row[s.key] = null;
    }
    return row;
  });

  for (let i = 0; i < points.length - 1; i++) {
    const key = segments[i]!.key;
    data[i]![key] = points[i]!.value;
    data[i + 1]![key] = points[i + 1]!.value;
  }

  return { data, segments, teamChangeSeasons };
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
        stroke={selected ? "var(--foreground)" : "#fff"}
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
        stroke={selected ? "var(--foreground)" : "#fff"}
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
      : Number.isFinite(plotted) && pct == null
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
        {pct != null ? `${pct}th pct` : null}
        {pct != null && raw != null ? " · " : null}
        {raw}
        {pct == null && raw == null && Number.isFinite(plotted)
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
   * Percentile panel mode: Y = league percentile (0–100), Savant stroke
   * colors. Raw metric stays in the tooltip.
   */
  savantScale?: boolean;
}) {
  const plotPercentile =
    savantScale && points.some((p) => p.percentile != null);

  const plotPoints = useMemo((): CareerSeriesPoint[] => {
    if (!plotPercentile) return points;
    return points.map((p) => {
      const pct =
        p.percentile != null && Number.isFinite(p.percentile)
          ? Math.max(0, Math.min(100, p.percentile))
          : 50;
      return {
        ...p,
        rawValue: p.value,
        value: pct,
        percentile: pct,
        color: percentileSavantColor(pct),
      };
    });
  }, [points, plotPercentile]);

  const { data, segments, legend, teamChangeSeasons } = useMemo(() => {
    if (plotPercentile || savantScale) {
      const savant = buildSavantSegmentedChart(plotPoints);
      const team = buildTeamSegmentedChart(plotPoints);
      return {
        data: savant.data,
        segments: savant.segments,
        legend: team.legend,
        teamChangeSeasons: savant.teamChangeSeasons,
      };
    }
    return buildTeamSegmentedChart(plotPoints);
  }, [plotPoints, plotPercentile, savantScale]);

  const franchiseLegend = legend.filter(
    (t) => t.teamId !== "TOT" && t.teamId !== "2TM" && t.teamAbbr !== "-"
  );

  const handleSelect = (row: ChartRow) => {
    if (!onSeasonSelect) return;
    const season = row.fullSeason ?? row.season;
    onSeasonSelect(season);
  };

  const useSavantDots = plotPercentile || savantScale;

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
              domain={plotPercentile ? [0, 100] : ["auto", "auto"]}
              ticks={plotPercentile ? [0, 25, 50, 75, 100] : undefined}
              tickFormatter={
                plotPercentile
                  ? (v: number) => `${Math.round(v)}`
                  : formatCareerChartNumber
              }
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
            {segments.map((seg) => (
              <Line
                key={seg.key}
                type="monotone"
                dataKey={seg.key}
                stroke={seg.color}
                strokeWidth={2.5}
                dot={false}
                activeDot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
            <Line
              type="monotone"
              dataKey="value"
              stroke="transparent"
              strokeWidth={0}
              dot={renderDot}
              activeDot={onSeasonSelect ? renderActiveDot : renderDot}
              legendType="none"
              tooltipType="none"
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {!useSavantDots && franchiseLegend.length > 1 ? (
        <ul className="flex flex-wrap gap-x-3 gap-y-1">
          {franchiseLegend.map((t) => (
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
