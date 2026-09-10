"use client";

import { useId, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import { AnalysisBoard } from "@/components/dashboard/analysis-board";
import type { DashboardPlayer } from "@/lib/dashboard-player";
import { fitNumericDomain } from "@/lib/chart-numeric-domain";
import { formatPct } from "@/lib/format";
import { nbaTeamAbbr } from "@/data/providers/nba/nba-team-meta";
import {
  FrostRechartsTooltip,
  rechartsFrostWrapperStyle,
} from "@/components/brand/frost-recharts-tooltip";

type Point = DashboardPlayer & {
  usageDisplay: number;
  tsDisplay: number;
};

export function ScatterBoard({
  title,
  subtitle,
  players,
}: {
  title: string;
  subtitle?: string;
  players: DashboardPlayer[];
}) {
  const chartId = useId();
  const router = useRouter();
  const data = useMemo<Point[]>(
    () =>
      players.map((p) => ({
        ...p,
        usageDisplay: p.usagePct * 100,
        tsDisplay: p.trueShootingPct * 100,
      })),
    [players]
  );

  const domainX = useMemo(
    () =>
      fitNumericDomain(
        data.map((p) => p.usageDisplay),
        { padAbsolute: 1.5, padRatio: 0.14, minSpan: 4 }
      ),
    [data]
  );
  const domainY = useMemo(
    () =>
      fitNumericDomain(
        data.map((p) => p.tsDisplay),
        { padAbsolute: 1.5, padRatio: 0.14, minSpan: 4 }
      ),
    [data]
  );

  return (
    <AnalysisBoard
      title={title}
      subtitle={
        subtitle ?? "Usage × true shooting · click a point to open profile"
      }
      footer={<span>{players.length} players in selection</span>}
    >
      <div className="h-[260px] w-full" aria-labelledby={`${chartId}-title`}>
        <span id={`${chartId}-title`} className="sr-only">
          {title}
        </span>
        {data.length === 0 ? (
          <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No players match the current filters
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 12, right: 20, bottom: 20, left: 8 }}>
              <CartesianGrid strokeDasharray="2 2" className="stroke-border" />
              <XAxis
                type="number"
                dataKey="usageDisplay"
                name="Usage %"
                domain={domainX}
                allowDataOverflow={false}
                padding={{ left: 8, right: 8 }}
                tick={{ fontSize: 10 }}
                label={{
                  value: "Usage %",
                  position: "insideBottom",
                  offset: -2,
                  style: { fontSize: 10 },
                }}
              />
              <YAxis
                type="number"
                dataKey="tsDisplay"
                name="TS %"
                domain={domainY}
                allowDataOverflow={false}
                padding={{ top: 8, bottom: 8 }}
                tick={{ fontSize: 10 }}
                label={{
                  value: "TS %",
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 10, textAnchor: "middle" },
                }}
              />
              <ZAxis range={[28, 28]} />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                wrapperStyle={rechartsFrostWrapperStyle}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as Point;
                  return (
                    <FrostRechartsTooltip active={active}>
                      <p className="font-medium">{p.playerName}</p>
                      <p className="text-muted-foreground">
                        {nbaTeamAbbr(p.teamId, p.teamAbbreviation)}
                      </p>
                      <p>USG {formatPct(p.usagePct)}</p>
                      <p>TS {formatPct(p.trueShootingPct)}</p>
                    </FrostRechartsTooltip>
                  );
                }}
              />
              <Scatter
                data={data}
                fill="currentColor"
                fillOpacity={0.7}
                name="Players"
                cursor="pointer"
                onClick={(point) => {
                  const p = point as unknown as Point;
                  if (p?.playerId) {
                    router.push(`/players/${p.playerId}`);
                  }
                }}
              />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>
    </AnalysisBoard>
  );
}
