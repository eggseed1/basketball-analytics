"use client";

import { useDeferredValue, useId, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import {
  FrostRechartsTooltip,
  rechartsFrostWrapperStyle,
} from "@/components/brand/frost-recharts-tooltip";
import { useQueryNavOptional } from "@/components/continuity/query-nav";
import { useChartTheme } from "@/lib/chart-theme";
import { type } from "@/lib/design-system";
import { formatPct } from "@/lib/format";
import {
  usageEfficiencyMedians,
  type UsageEfficiencyPoint,
} from "@/lib/player-usage-efficiency";
import { fitNumericDomain } from "@/lib/chart-numeric-domain";
import { cn } from "@/lib/utils";

type ChartPoint = UsageEfficiencyPoint & {
  usageDisplay: number;
  tsDisplay: number;
  z: number;
  fill: string;
};

type ScatterShapeProps = {
  cx?: number;
  cy?: number;
  size?: number;
  payload?: ChartPoint;
};

function PeerDot({ cx = 0, cy = 0, size = 36, payload }: ScatterShapeProps) {
  const r = Math.max(3, Math.sqrt(size) / 2);
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill={payload?.fill ?? "currentColor"}
      fillOpacity={0.72}
    />
  );
}

function PinDot({ cx = 0, cy = 0, size = 140, payload }: ScatterShapeProps) {
  const r = Math.max(5, Math.sqrt(size) / 2);
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill={payload?.fill ?? "currentColor"}
      stroke="var(--background)"
      strokeWidth={2}
    />
  );
}

export function PlayerUsageEfficiencyChart({
  points,
  playerName,
  season,
  accentColor,
  seasons = [],
  highlightLabel = "you",
}: {
  points: UsageEfficiencyPoint[];
  playerName?: string;
  season: string;
  accentColor?: string;
  /** When set, shows season chips that update the page `season` query. */
  seasons?: string[];
  /** Tooltip/caption tag for highlighted points (player page vs league pin). */
  highlightLabel?: "you" | "pin";
}) {
  const chartId = useId();
  const router = useRouter();
  const queryNav = useQueryNavOptional();
  const chartTheme = useChartTheme();
  const focalName = playerName?.trim() ?? "";
  const deferredPoints = useDeferredValue(points);

  const data = useMemo<ChartPoint[]>(
    () =>
      deferredPoints.map((p) => {
        const teamFill = chartTheme.teamColor(p.teamId ?? p.teamAbbr).color;
        return {
          ...p,
          usageDisplay: p.usagePct * 100,
          tsDisplay: p.trueShootingPct * 100,
          z: p.isSelf ? 140 : 36,
          fill:
            p.isSelf && accentColor?.trim()
              ? accentColor.trim()
              : teamFill,
        };
      }),
    [accentColor, chartTheme, deferredPoints]
  );
  const peers = useMemo(() => data.filter((p) => !p.isSelf), [data]);
  const pinned = useMemo(() => data.filter((p) => p.isSelf), [data]);
  const self = pinned[0];
  const medians = useMemo(
    () => usageEfficiencyMedians(deferredPoints),
    [deferredPoints]
  );

  const domainX = useMemo(() => {
    if (!data.length) return [10, 40] as [number, number];
    return fitNumericDomain(
      data.map((p) => p.usageDisplay),
      { padAbsolute: 1.5, padRatio: 0.14, minSpan: 4 }
    );
  }, [data]);

  const domainY = useMemo(() => {
    if (!data.length) return [45, 70] as [number, number];
    return fitNumericDomain(
      data.map((p) => p.tsDisplay),
      { padAbsolute: 1.5, padRatio: 0.14, minSpan: 4 }
    );
  }, [data]);

  const quadrant =
    self && medians.usage != null && medians.ts != null
      ? self.usagePct >= medians.usage && self.trueShootingPct >= medians.ts
        ? "Above-average usage and efficiency"
        : self.usagePct >= medians.usage && self.trueShootingPct < medians.ts
          ? "High usage, below-median efficiency"
          : self.usagePct < medians.usage && self.trueShootingPct >= medians.ts
            ? "Efficient role / lower usage"
            : "Below-median usage and efficiency"
      : null;

  const seasonChips =
    seasons.length > 1 ? (
      <div
        className="flex flex-wrap gap-1"
        role="group"
        aria-label="Usage chart season"
      >
        {[...seasons]
          .sort((a, b) => b.localeCompare(a))
          .map((option) => {
            const active = option === season;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                onClick={() => queryNav?.replaceParams({ season: option })}
                className={cn(
                  type.caption,
                  "glass-pill rounded-md px-2 py-0.5 font-semibold tabular-nums transition-colors",
                  active
                    ? "glass-pill-active"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {option}
              </button>
            );
          })}
      </div>
    ) : null;

  return (
    <figure
      aria-labelledby={`${chartId}-title`}
      aria-describedby={`${chartId}-desc`}
      className="flex flex-col gap-3 rounded-xl border border-border/70 frost-surface p-4 sm:p-5"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id={`${chartId}-title`} className={type.heading}>
            Usage vs efficiency
          </h2>
          <p
            id={`${chartId}-desc`}
            className={cn(type.bodySm, "mt-1 text-muted-foreground")}
          >
            {season} qualified peers · USG% × TS%
            {quadrant && focalName
              ? ` · ${focalName}: ${quadrant.toLowerCase()}`
              : ""}
          </p>
        </div>
        {seasonChips}
      </div>

      {data.length < 8 ? (
        <p
          className={cn(
            type.bodySm,
            "flex h-48 items-center justify-center text-muted-foreground"
          )}
        >
          Not enough qualified peers with usage and true shooting for {season}.
        </p>
      ) : (
        <div className="h-[300px] w-full sm:h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 18, right: 28, bottom: 28, left: 12 }}>
              <CartesianGrid
                strokeDasharray="2 2"
                className="stroke-border"
                strokeOpacity={0.55}
              />
              <XAxis
                type="number"
                dataKey="usageDisplay"
                name="Usage %"
                domain={domainX}
                allowDataOverflow={false}
                padding={{ left: 10, right: 10 }}
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `${Math.round(Number(v))}`}
                label={{
                  value: "Usage %",
                  position: "insideBottom",
                  offset: -4,
                  style: { fontSize: 11 },
                }}
              />
              <YAxis
                type="number"
                dataKey="tsDisplay"
                name="TS %"
                domain={domainY}
                allowDataOverflow={false}
                padding={{ top: 10, bottom: 10 }}
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `${Math.round(Number(v))}`}
                label={{
                  value: "TS %",
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 11, textAnchor: "middle" },
                }}
              />
              <ZAxis type="number" dataKey="z" range={[26, 120]} />
              {medians.usage != null ? (
                <ReferenceLine
                  x={medians.usage * 100}
                  stroke="currentColor"
                  strokeOpacity={0.28}
                  strokeDasharray="4 4"
                />
              ) : null}
              {medians.ts != null ? (
                <ReferenceLine
                  y={medians.ts * 100}
                  stroke="currentColor"
                  strokeOpacity={0.28}
                  strokeDasharray="4 4"
                />
              ) : null}
              <Tooltip
                cursor={false}
                isAnimationActive={false}
                animationDuration={0}
                wrapperStyle={rechartsFrostWrapperStyle}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0]?.payload as ChartPoint;
                  return (
                    <FrostRechartsTooltip active={active}>
                      <p className="font-semibold">
                        {p.playerName}
                        {p.isSelf ? ` · ${highlightLabel}` : ""}
                      </p>
                      {p.teamAbbr ? (
                        <p className="text-muted-foreground">{p.teamAbbr}</p>
                      ) : null}
                      <p>USG {formatPct(p.usagePct)}</p>
                      <p>TS {formatPct(p.trueShootingPct)}</p>
                    </FrostRechartsTooltip>
                  );
                }}
              />
              <Scatter
                data={peers}
                name="Peers"
                cursor="pointer"
                isAnimationActive={false}
                shape={PeerDot}
                onClick={(point) => {
                  const p = point as unknown as ChartPoint;
                  if (p?.playerId) router.push(`/players/${p.playerId}`);
                }}
              />
              {pinned.length ? (
                <Scatter
                  data={pinned}
                  name={focalName || "Pinned"}
                  cursor="pointer"
                  isAnimationActive={false}
                  shape={PinDot}
                  onClick={(point) => {
                    const p = point as unknown as ChartPoint;
                    if (p?.playerId) router.push(`/players/${p.playerId}`);
                  }}
                />
              ) : null}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className={cn(type.caption, "text-muted-foreground")}>
        Dashed lines = peer median. Click a point to open that player. Points
        use team colors.
        {pinned.length === 1 && self
          ? ` ${focalName || self.playerName}: ${formatPct(self.usagePct)} USG · ${formatPct(self.trueShootingPct)} TS.`
          : pinned.length > 1
            ? ` ${pinned.length} pinned players highlighted.`
            : ""}
      </p>
    </figure>
  );
}
