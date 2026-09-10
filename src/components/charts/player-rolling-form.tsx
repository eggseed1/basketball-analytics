"use client";

import { useId, useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  FrostRechartsTooltip,
  rechartsFrostWrapperStyle,
} from "@/components/brand/frost-recharts-tooltip";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { type } from "@/lib/design-system";
import { formatNumber, formatPct } from "@/lib/format";
import { nbaTeamAbbr } from "@/data/providers/nba/nba-team-meta";
import {
  buildRollingEfficiency,
  type RollingEfficiencyPoint,
} from "@/lib/rolling-efficiency";
import { useChartTheme } from "@/lib/chart-theme";
import { cn } from "@/lib/utils";

export type RollingFormGame = {
  gameId: string;
  gameDate: string;
  opponentTeamId: string;
  points: number;
  fieldGoalsAttempted: number;
  freeThrowsAttempted: number;
};

type WindowSize = "10" | "25";

type ChartRow = RollingEfficiencyPoint & {
  label: string;
  ptsDisplay: number;
  rollingPtsDisplay: number;
  tsDisplay: number;
  rollingTsDisplay: number;
};

/**
 * Game-by-game scoring + true shooting with a 10 / 25-game rolling window.
 */
export function PlayerRollingFormChart({
  games,
  season,
  accentColor,
}: {
  games: RollingFormGame[];
  season: string;
  accentColor?: string;
}) {
  const chartId = useId();
  const chartTheme = useChartTheme();
  const [windowSize, setWindowSize] = useState<WindowSize>("10");
  const accent = accentColor?.trim() || "currentColor";

  const data = useMemo<ChartRow[]>(() => {
    const window = windowSize === "25" ? 25 : 10;
    return buildRollingEfficiency(games, window).map((p) => ({
      ...p,
      label: p.gameDate.slice(5),
      ptsDisplay: Number(p.points.toFixed(1)),
      rollingPtsDisplay: Number(p.rollingPoints.toFixed(1)),
      tsDisplay: Number((p.trueShootingPct * 100).toFixed(1)),
      rollingTsDisplay: Number((p.rollingTrueShootingPct * 100).toFixed(1)),
    }));
  }, [games, windowSize]);

  const last = data[data.length - 1];

  return (
    <figure
      aria-labelledby={`${chartId}-title`}
      aria-describedby={`${chartId}-desc`}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${chartId}-title`} className={cn(type.heading)}>
            Rolling form
          </h2>
          <p
            id={`${chartId}-desc`}
            className={cn(type.bodySm, "mt-1 text-muted-foreground")}
          >
            {season} game-by-game scoring and true shooting — how the stretch is
            going, not just the season average.
          </p>
        </div>
        <SegmentedControl
          size="sm"
          label="Window"
          value={windowSize}
          onChange={setWindowSize}
          options={[
            { id: "10", label: "Last 10" },
            { id: "25", label: "Last 25" },
          ]}
        />
      </div>

      {last ? (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ["Rolling PTS", formatNumber(last.rollingPoints, 1)],
              ["Last game PTS", formatNumber(last.points, 0)],
              ["Rolling TS%", formatPct(last.rollingTrueShootingPct)],
              ["Last game TS%", formatPct(last.trueShootingPct)],
            ] as const
          ).map(([label, value]) => (
            <div
              key={label}
              className="rounded-md border border-border/70 px-3 py-2"
            >
              <dt
                className={cn(
                  type.micro,
                  "font-semibold uppercase tracking-wide text-muted-foreground"
                )}
              >
                {label}
              </dt>
              <dd className={cn(type.body, "mt-0.5 font-bold tabular-nums")}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="h-[280px] w-full sm:h-[320px]">
        {data.length === 0 ? (
          <p
            className={cn(
              type.bodySm,
              "flex h-full items-center justify-center text-muted-foreground"
            )}
          >
            No game log available to chart rolling form.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 8, right: 12, bottom: 8, left: 0 }}
              role="img"
              aria-label={`${windowSize}-game rolling points and true shooting`}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis
                yAxisId="pts"
                tick={{ fontSize: 11 }}
                width={36}
                label={{
                  value: "PTS",
                  angle: -90,
                  position: "insideLeft",
                  style: { textAnchor: "middle", fontSize: 11 },
                }}
              />
              <YAxis
                yAxisId="ts"
                orientation="right"
                domain={[30, 80]}
                tick={{ fontSize: 11 }}
                width={40}
                tickFormatter={(v) => `${v}`}
                label={{
                  value: "TS%",
                  angle: 90,
                  position: "insideRight",
                  style: { textAnchor: "middle", fontSize: 11 },
                }}
              />
              <Tooltip
                isAnimationActive={false}
                animationDuration={0}
                wrapperStyle={rechartsFrostWrapperStyle}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as ChartRow;
                  return (
                    <FrostRechartsTooltip active={active}>
                      <p className="font-medium">{row.gameDate}</p>
                      <p className="text-muted-foreground">
                        vs {nbaTeamAbbr(row.opponentTeamId)}
                      </p>
                      <p>
                        {formatNumber(row.points, 0)} PTS · TS{" "}
                        {formatPct(row.trueShootingPct)}
                      </p>
                      <p>
                        {windowSize}-g roll {formatNumber(row.rollingPoints, 1)}{" "}
                        PTS · {formatPct(row.rollingTrueShootingPct)} TS
                      </p>
                    </FrostRechartsTooltip>
                  );
                }}
              />
              <Legend />
              <Line
                yAxisId="pts"
                type="monotone"
                dataKey="ptsDisplay"
                name="Game PTS"
                stroke={accent}
                strokeOpacity={chartTheme.gridOpacity()}
                dot={false}
                strokeWidth={1}
              />
              <Line
                yAxisId="pts"
                type="monotone"
                dataKey="rollingPtsDisplay"
                name={`${windowSize}-g PTS`}
                stroke={accent}
                strokeWidth={2.5}
                dot={false}
              />
              <Line
                yAxisId="ts"
                type="monotone"
                dataKey="tsDisplay"
                name="Game TS%"
                stroke="currentColor"
                strokeOpacity={chartTheme.gridOpacity()}
                strokeDasharray="3 3"
                dot={false}
                strokeWidth={1}
              />
              <Line
                yAxisId="ts"
                type="monotone"
                dataKey="rollingTsDisplay"
                name={`${windowSize}-g TS%`}
                stroke="currentColor"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </figure>
  );
}
