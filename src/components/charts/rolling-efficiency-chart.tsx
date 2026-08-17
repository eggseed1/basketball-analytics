"use client";

import { useId } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { RollingEfficiencyPoint } from "@/lib/rolling-efficiency";
import { formatPct } from "@/lib/format";
import { nbaTeamAbbr } from "@/data/providers/nba/nba-team-meta";

export interface RollingEfficiencyChartProps {
  points: RollingEfficiencyPoint[];
  /** League / season reference TS% (fraction). */
  referenceTrueShootingPct?: number;
}

export function RollingEfficiencyChart({
  points,
  referenceTrueShootingPct = 0.56,
}: RollingEfficiencyChartProps) {
  const chartId = useId();
  const data = points.map((p) => ({
    ...p,
    label: p.gameDate.slice(5),
    rollingTsDisplay: Number((p.rollingTrueShootingPct * 100).toFixed(1)),
    gameTsDisplay: Number((p.trueShootingPct * 100).toFixed(1)),
    refDisplay: Number((referenceTrueShootingPct * 100).toFixed(1)),
  }));

  return (
    <figure
      aria-labelledby={`${chartId}-title`}
      aria-describedby={`${chartId}-desc`}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <div>
        <h2 id={`${chartId}-title`} className="text-lg font-semibold">
          Rolling true shooting %
        </h2>
        <p id={`${chartId}-desc`} className="text-sm text-muted-foreground">
          10-game rolling true shooting % vs a league reference line.
        </p>
      </div>

      <div className="h-[280px] w-full sm:h-[320px]">
        {data.length === 0 ? (
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No game log available to chart rolling efficiency.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 8, right: 12, bottom: 8, left: 0 }}
              role="img"
              aria-label="Rolling true shooting percent over the season"
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis
                domain={[40, 80]}
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `${v}`}
                label={{
                  value: "TS %",
                  angle: -90,
                  position: "insideLeft",
                  style: { textAnchor: "middle" },
                }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as (typeof data)[number];
                  return (
                    <div
                      role="tooltip"
                      className="rounded-lg border border-border bg-popover px-3 py-2 text-sm shadow-md"
                    >
                      <p className="font-medium">{row.gameDate}</p>
                      <p>Game TS {formatPct(row.trueShootingPct)}</p>
                      <p>Rolling TS {formatPct(row.rollingTrueShootingPct)}</p>
                      <p className="text-muted-foreground">
                        {row.points} PTS vs {nbaTeamAbbr(row.opponentTeamId)}
                      </p>
                    </div>
                  );
                }}
              />
              <Legend />
              <ReferenceLine
                y={referenceTrueShootingPct * 100}
                stroke="currentColor"
                strokeDasharray="4 4"
                strokeOpacity={0.45}
                label={{ value: "Ref TS%", position: "insideTopRight" }}
              />
              <Line
                type="monotone"
                dataKey="gameTsDisplay"
                name="Game TS%"
                stroke="currentColor"
                strokeOpacity={0.35}
                dot={false}
                strokeWidth={1}
              />
              <Line
                type="monotone"
                dataKey="rollingTsDisplay"
                name="10-game TS%"
                stroke="currentColor"
                strokeWidth={2.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </figure>
  );
}
