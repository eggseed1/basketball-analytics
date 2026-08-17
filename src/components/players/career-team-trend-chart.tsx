"use client";

import { useMemo } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { TeamLogo } from "@/components/brand/team-logo";
import { cn } from "@/lib/utils";

export type CareerSeriesPoint = {
  /** Short label on the axis, e.g. "16-17". */
  season: string;
  value: number;
  teamId: string;
  teamAbbr: string;
  color: string;
};

type TeamSegment = {
  key: string;
  teamId: string;
  teamAbbr: string;
  color: string;
};

type ChartRow = {
  season: string;
  value: number;
  teamId: string;
  teamAbbr: string;
  color: string;
  [segmentKey: string]: string | number | null;
};

/**
 * Contiguous team stretches → separate line series so the career arc
 * reads as Celtics green → Hawks red (etc.) instead of one flat brand stroke.
 */
export function buildTeamSegmentedChart(points: CareerSeriesPoint[]): {
  data: ChartRow[];
  segments: TeamSegment[];
  legend: Array<{ teamId: string; teamAbbr: string; color: string }>;
} {
  if (!points.length) return { data: [], segments: [], legend: [] };

  const segments: TeamSegment[] = [];
  let run = 0;
  let prevTeam: string | null = null;
  const segKeysForIndex: string[] = [];

  for (const p of points) {
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
      value: p.value,
      teamId: p.teamId,
      teamAbbr: p.teamAbbr,
      color: p.color,
    };
    for (const s of segments) {
      row[s.key] = null;
    }
    row[segKeysForIndex[i]!] = p.value;
    return row;
  });

  // Bridge team changes: new team stroke starts at the previous season's point
  // so the "move" is visually that team's color.
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

  return { data, segments, legend };
}

function TeamDot(props: {
  cx?: number;
  cy?: number;
  payload?: ChartRow;
}) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill={payload.color}
      stroke="#fff"
      strokeWidth={1.5}
    />
  );
}

export function CareerTeamTrendChart({
  points,
  height = 220,
  className,
}: {
  points: CareerSeriesPoint[];
  height?: number;
  className?: string;
}) {
  const { data, segments, legend } = useMemo(
    () => buildTeamSegmentedChart(points),
    [points]
  );

  if (data.length < 2) return null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="min-h-[220px] flex-1" style={{ minHeight: height }}>
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="season"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.08)",
                fontSize: 12,
              }}
              formatter={(value) => {
                const n = typeof value === "number" ? value : Number(value);
                return [Number.isFinite(n) ? n : "—", "Value"];
              }}
              labelFormatter={(label, payload) => {
                const row = payload?.[0]?.payload as ChartRow | undefined;
                const abbr = row?.teamAbbr;
                return abbr ? `${label} · ${abbr}` : String(label);
              }}
            />
            {segments.map((seg, idx) => (
              <Line
                key={seg.key}
                type="monotone"
                dataKey={seg.key}
                stroke={seg.color}
                strokeWidth={2.5}
                dot={idx === segments.length - 1 ? <TeamDot /> : false}
                activeDot={{ r: 5 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
            {/* Dots on every point via a transparent value line */}
            <Line
              type="monotone"
              dataKey="value"
              stroke="transparent"
              strokeWidth={0}
              dot={<TeamDot />}
              activeDot={false}
              legendType="none"
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {legend.length > 0 ? (
        <ul className="flex flex-wrap gap-x-3 gap-y-1">
          {legend.map((t) => (
            <li
              key={t.teamId}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground"
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
