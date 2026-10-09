"use client";

import { useDeferredValue, useId, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import {
  dotMarkByKey,
  nearestDotMark,
  sameMarkKey,
  StoreSnapLayer,
  useHoverLinkTarget,
  useHoverStore,
  type HoverMark,
} from "@/components/charts/hover-layer";
import { useChartTheme } from "@/lib/chart-theme";
import { type } from "@/lib/design-system";
import {
  leagueScatterMedians,
  leagueScatterMeta,
  type LeagueScatterKind,
  type LeagueScatterPoint,
} from "@/lib/league-player-scatter";
import { fitNumericDomain } from "@/lib/chart-numeric-domain";
import { cn } from "@/lib/utils";

type ChartPoint = LeagueScatterPoint & { z: number; fill: string };

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
      data-dot-key={payload?.playerId}
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
      data-dot-key={payload?.playerId}
      cx={cx}
      cy={cy}
      r={r}
      fill={payload?.fill ?? "currentColor"}
      stroke="var(--background)"
      strokeWidth={2}
    />
  );
}

export function LeaguePlayerScatterChart({
  kind,
  points,
  season,
  playerName,
  highlightLabel = "pin",
}: {
  kind: LeagueScatterKind;
  points: LeagueScatterPoint[];
  season: string;
  playerName?: string;
  highlightLabel?: "you" | "pin";
}) {
  const chartId = useId();
  const router = useRouter();
  const chartTheme = useChartTheme();
  const meta = leagueScatterMeta(kind);
  const focalName = playerName?.trim() ?? "";
  const deferredPoints = useDeferredValue(points);
  const plotRef = useRef<HTMLDivElement>(null);
  const hover = useHoverStore<HoverMark>(sameMarkKey);
  useHoverLinkTarget(null, {
    show: (id) => hover.set(plotRef.current ? dotMarkByKey(plotRef.current, [id]) : null),
    clear: () => hover.set(null),
  });

  const data = useMemo<ChartPoint[]>(
    () =>
      deferredPoints.map((p) => {
        const { color } = chartTheme.leagueTeamColor(p.teamId ?? p.teamAbbr);
        return {
          ...p,
          z: p.isSelf ? 140 : 36,
          fill: color,
        };
      }),
    [chartTheme, deferredPoints]
  );
  const byKey = useMemo(() => new Map(data.map((p) => [p.playerId, p])), [data]);
  const peers = useMemo(() => data.filter((p) => !p.isSelf), [data]);
  const pinned = useMemo(() => data.filter((p) => p.isSelf), [data]);
  const medians = useMemo(
    () => leagueScatterMedians(deferredPoints),
    [deferredPoints]
  );

  const domainX = useMemo(() => {
    if (!data.length) return [0, 50] as [number, number];
    return fitNumericDomain(
      data.map((p) => p.x),
      {
        padAbsolute: kind === "volume" ? 1.5 : kind === "defense" ? 0.35 : 1,
        padRatio: 0.14,
        minSpan: kind === "defense" ? 0.8 : 2,
      }
    );
  }, [data, kind]);

  const domainY = useMemo(() => {
    if (!data.length) return [0, 50] as [number, number];
    return fitNumericDomain(
      data.map((p) => p.y),
      {
        allowNegative: Boolean(meta.allowNegativeY),
        includeZero: Boolean(meta.allowNegativeY),
        padAbsolute:
          kind === "volume" ? 40 : kind === "impact" || kind === "bpm" ? 0.6 : 1,
        padRatio: 0.14,
        minSpan: kind === "impact" || kind === "bpm" ? 1.5 : kind === "volume" ? 100 : 2,
      }
    );
  }, [data, kind, meta.allowNegativeY]);

  return (
    <figure
      aria-labelledby={`${chartId}-title`}
      aria-describedby={`${chartId}-desc`}
      className="flex flex-col gap-3 rounded-xl border border-border/70 frost-surface p-4 sm:p-5"
    >
      <div className="min-w-0">
        <h2 id={`${chartId}-title`} className={type.heading}>
          {meta.title}
        </h2>
        <p
          id={`${chartId}-desc`}
          className={cn(type.bodySm, "mt-1 text-muted-foreground")}
        >
          {season} · {meta.blurb}
          {focalName ? ` · Highlighting ${focalName}` : ""}
        </p>
      </div>

      {data.length < 8 ? (
        <p
          className={cn(
            type.bodySm,
            "flex h-48 items-center justify-center text-muted-foreground"
          )}
        >
          Not enough qualified peers for {meta.title.toLowerCase()} in {season}.
        </p>
      ) : (
        <div
          ref={plotRef}
          data-snap-host
          className="relative h-[300px] w-full sm:h-[360px]"
          onPointerMove={(event) => {
            if (plotRef.current) hover.set(nearestDotMark(plotRef.current, event.clientX, event.clientY));
          }}
          onPointerLeave={() => hover.set(null)}
          onClick={() => {
            const key = hover.get()?.key;
            if (key) router.push(`/players/${key}`);
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 18, right: 28, bottom: 28, left: 12 }}>
              <CartesianGrid
                strokeDasharray="2 2"
                className="stroke-border"
                strokeOpacity={0.55}
              />
              <XAxis
                type="number"
                dataKey="x"
                name={meta.xLabel}
                domain={domainX}
                allowDataOverflow={false}
                padding={{ left: 10, right: 10 }}
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `${Math.round(Number(v))}`}
                label={{
                  value: meta.xLabel,
                  position: "insideBottom",
                  offset: -4,
                  style: { fontSize: 11 },
                }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name={meta.yLabel}
                domain={domainY}
                allowDataOverflow={false}
                padding={{ top: 10, bottom: 10 }}
                tick={{ fontSize: 11 }}
                tickFormatter={(v) =>
                  meta.allowNegativeY
                    ? Number(v).toFixed(Math.abs(Number(v)) < 10 ? 1 : 0)
                    : `${Math.round(Number(v))}`
                }
                label={{
                  value: meta.yLabel,
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 11, textAnchor: "middle" },
                }}
              />
              <ZAxis type="number" dataKey="z" range={[26, 120]} />
              {medians.x != null ? (
                <ReferenceLine
                  x={medians.x}
                  stroke="currentColor"
                  strokeOpacity={0.28}
                  strokeDasharray="4 4"
                />
              ) : null}
              {medians.y != null ? (
                <ReferenceLine
                  y={medians.y}
                  stroke="currentColor"
                  strokeOpacity={0.28}
                  strokeDasharray="4 4"
                />
              ) : null}
              <Scatter
                data={peers}
                name="Peers"
                isAnimationActive={false}
                shape={PeerDot}
              />
              {pinned.length ? (
                <Scatter
                  data={pinned}
                  name="Pinned"
                  isAnimationActive={false}
                  shape={PinDot}
                />
              ) : null}
            </ScatterChart>
          </ResponsiveContainer>
          <StoreSnapLayer
            store={hover}
            color={(m) => byKey.get(m.key)?.fill ?? "var(--foreground)"}
            render={(m) => {
              const p = byKey.get(m.key);
              if (!p) return null;
              return (
                <>
                  <p>
                    {p.playerName}
                    {p.isSelf ? ` · ${highlightLabel}` : ""}
                    {p.teamAbbr ? ` · ${p.teamAbbr}` : ""}
                  </p>
                  <p className="tabular-nums">{p.xTooltip}</p>
                  <p className="tabular-nums">{p.yTooltip}</p>
                </>
              );
            }}
          />
        </div>
      )}
      <p className={cn(type.caption, "text-muted-foreground")}>
        Dashed lines = peer median. Click a point to open that player. Dots use
        team colors
        {focalName ? `; ${highlightLabel} highlighted` : ""}.
      </p>
    </figure>
  );
}
