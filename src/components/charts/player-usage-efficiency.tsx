"use client";

import {
  useDeferredValue,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
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

import { ChartTooltipSurface } from "@/components/charts/chart-tooltip";
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

/** Pointer distance (px) that still snaps to the nearest dot. */
const SNAP_PX = 36;

function dotKey(p: Pick<ChartPoint, "isSelf" | "playerId">) {
  return `${p.isSelf ? "pin" : "peer"}-${p.playerId}`;
}

function signedPts(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}`;
}

type ScatterShapeProps = {
  cx?: number;
  cy?: number;
  size?: number;
  payload?: ChartPoint;
};

function PeerDot({ cx = 0, cy = 0, payload }: ScatterShapeProps) {
  return (
    <circle
      data-dot-key={payload ? dotKey(payload) : undefined}
      cx={cx}
      cy={cy}
      r={3.4}
      fill={payload?.fill ?? "currentColor"}
      fillOpacity={0.38}
    />
  );
}

/** Highlighted player: halo, solid dot and a name tag that flips toward the open side. */
function makePinDot(labelSide: (p: ChartPoint) => "left" | "right", showLabel: boolean) {
  return function PinDot({ cx = 0, cy = 0, payload }: ScatterShapeProps) {
    const fill = payload?.fill ?? "currentColor";
    const name = payload?.playerName ?? "";
    const side = payload ? labelSide(payload) : "right";
    const width = Math.max(40, name.length * 6.6 + 16);
    const x = side === "right" ? cx + 14 : cx - 14 - width;
    return (
      <g>
        <circle cx={cx} cy={cy} r={16} fill={fill} fillOpacity={0.14} />
        <circle cx={cx} cy={cy} r={11} fill="none" stroke={fill} strokeOpacity={0.45} strokeWidth={1.5} />
        <circle
          data-dot-key={payload ? dotKey(payload) : undefined}
          cx={cx}
          cy={cy}
          r={6.5}
          fill={fill}
          stroke="var(--background)"
          strokeWidth={2.5}
        />
        {showLabel && name ? (
          <g pointerEvents="none">
            <rect x={x} y={cy - 11} width={width} height={22} rx={11} fill={fill} />
            <text
              x={x + width / 2}
              y={cy + 4}
              textAnchor="middle"
              fontSize={11.5}
              fontWeight={700}
              fill="#fff"
            >
              {name}
            </text>
          </g>
        ) : null}
      </g>
    );
  };
}

function QuadrantLabels() {
  const label = cn(
    type.micro,
    "pointer-events-none absolute z-[1] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70"
  );
  return (
    <>
      <span className={cn(label, "left-[4.5rem] top-5")}>Efficient · lighter load</span>
      <span className={cn(label, "right-9 top-5 text-right")}>Efficient · heavy load</span>
      <span className={cn(label, "bottom-[3.9rem] left-[4.5rem]")}>Less efficient · lighter load</span>
      <span className={cn(label, "bottom-[3.9rem] right-9 text-right")}>Less efficient · heavy load</span>
    </>
  );
}

export function PlayerUsageEfficiencyChart({
  points,
  playerName,
  season,
  accentColor,
  teamKey,
  seasons = [],
  highlightLabel = "you",
}: {
  points: UsageEfficiencyPoint[];
  playerName?: string;
  season: string;
  accentColor?: string;
  /** Preferred over accentColor: picks a team color that reads in both themes. */
  teamKey?: string | null;
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

  const focalColor = teamKey
    ? chartTheme.teamColor(teamKey).color
    : accentColor?.trim() || null;
  const data = useMemo<ChartPoint[]>(
    () =>
      deferredPoints.map((p) => {
        const teamFill = chartTheme.leagueTeamColor(p.teamId ?? p.teamAbbr).color;
        return {
          ...p,
          usageDisplay: p.usagePct * 100,
          tsDisplay: p.trueShootingPct * 100,
          z: p.isSelf ? 140 : 36,
          fill: p.isSelf && focalColor ? focalColor : teamFill,
        };
      }),
    [chartTheme, deferredPoints, focalColor]
  );
  const byKey = useMemo(() => new Map(data.map((p) => [dotKey(p), p])), [data]);
  const plotRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState<{ key: string; x: number; y: number; width: number } | null>(null);
  const nearPoint = near ? byKey.get(near.key) : undefined;

  /** Snap to the closest rendered dot so the label follows the pointer, not just exact hits. */
  const trackPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = plotRef.current;
    const svg = box?.querySelector<SVGSVGElement>("svg.recharts-surface");
    if (!box || !svg) return;
    const boxRect = box.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    const mx = event.clientX - svgRect.left;
    const my = event.clientY - svgRect.top;
    let best: { key: string; x: number; y: number } | null = null;
    let bestDistance = SNAP_PX * SNAP_PX;
    for (const dot of svg.querySelectorAll<SVGCircleElement>("circle[data-dot-key]")) {
      const x = dot.cx.baseVal.value;
      const y = dot.cy.baseVal.value;
      const distance = (x - mx) ** 2 + (y - my) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { key: dot.dataset.dotKey ?? "", x, y };
      }
    }
    if (!best) {
      if (near) setNear(null);
      return;
    }
    if (near?.key === best.key) return;
    setNear({
      key: best.key,
      x: best.x + svgRect.left - boxRect.left,
      y: best.y + svgRect.top - boxRect.top,
      width: boxRect.width,
    });
  };

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

  const pinShape = useMemo(() => {
    const mid = (domainX[0] + domainX[1]) / 2;
    return makePinDot((p) => (p.usageDisplay > mid ? "left" : "right"), pinned.length <= 3);
  }, [domainX, pinned.length]);

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

      {pinned.length ? (
        <div className={cn(type.caption, "flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground")}>
          <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
            <span
              aria-hidden
              className="size-3 rounded-full ring-2 ring-background"
              style={{ background: pinned[0]!.fill, boxShadow: `0 0 0 4px color-mix(in oklab, ${pinned[0]!.fill} 22%, transparent)` }}
            />
            {pinned.length === 1 ? focalName || pinned[0]!.playerName : `${pinned.length} pinned players`}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full bg-muted-foreground/45" />
            Other qualified players, in team colors
          </span>
        </div>
      ) : null}

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
        <div
          ref={plotRef}
          className={cn("relative h-[320px] w-full sm:h-[380px]", nearPoint && "cursor-pointer")}
          onPointerMove={trackPointer}
          onPointerLeave={() => setNear(null)}
          onClick={() => {
            if (nearPoint?.playerId) router.push(`/players/${nearPoint.playerId}`);
          }}
        >
          <QuadrantLabels />
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
              {pinned.length === 1 && self ? (
                <ReferenceLine
                  segment={[
                    { x: self.usageDisplay, y: domainY[0] },
                    { x: self.usageDisplay, y: self.tsDisplay },
                  ]}
                  stroke={self.fill}
                  strokeOpacity={0.6}
                  strokeDasharray="3 3"
                  ifOverflow="hidden"
                />
              ) : null}
              {pinned.length === 1 && self ? (
                <ReferenceLine
                  segment={[
                    { x: domainX[0], y: self.tsDisplay },
                    { x: self.usageDisplay, y: self.tsDisplay },
                  ]}
                  stroke={self.fill}
                  strokeOpacity={0.6}
                  strokeDasharray="3 3"
                  ifOverflow="hidden"
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
                  name={focalName || "Pinned"}
                  isAnimationActive={false}
                  shape={pinShape}
                />
              ) : null}
            </ScatterChart>
          </ResponsiveContainer>
          {near && nearPoint ? (
            <>
              <span
                aria-hidden
                className="pointer-events-none absolute z-[2] size-4 rounded-full border-2 transition-[left,top] duration-150 ease-out motion-reduce:transition-none"
                style={{
                  left: near.x,
                  top: near.y,
                  translate: "-50% -50%",
                  borderColor: nearPoint.fill,
                  boxShadow: `0 0 0 3px color-mix(in oklab, ${nearPoint.fill} 24%, transparent)`,
                }}
              />
              <ChartTooltipSurface
                className="chart-tip-float pointer-events-none absolute z-[3]"
                style={{
                  left: near.x,
                  top: near.y,
                  translate: `${
                    near.x < 110 ? "12px" : near.x > near.width - 110 ? "calc(-100% - 12px)" : "-50%"
                  } ${near.y < 96 ? "14px" : "calc(-100% - 14px)"}`,
                }}
              >
                <p>
                  {nearPoint.playerName}
                  {nearPoint.isSelf ? ` · ${highlightLabel}` : ""}
                  {nearPoint.teamAbbr ? ` · ${nearPoint.teamAbbr}` : ""}
                </p>
                <p className="tabular-nums">
                  USG {formatPct(nearPoint.usagePct)} · TS {formatPct(nearPoint.trueShootingPct)}
                </p>
                {medians.usage != null && medians.ts != null ? (
                  <p className="tabular-nums text-muted-foreground">
                    vs median: {signedPts((nearPoint.usagePct - medians.usage) * 100)} USG ·{" "}
                    {signedPts((nearPoint.trueShootingPct - medians.ts) * 100)} TS
                  </p>
                ) : null}
              </ChartTooltipSurface>
            </>
          ) : null}
        </div>
      )}

      <p className={cn(type.caption, "text-muted-foreground")}>
        The grey dashed lines mark the median player, which splits the chart into four corners. Click
        any dot to open that player.
        {pinned.length === 1 && self
          ? ` ${focalName || self.playerName}: ${formatPct(self.usagePct)} USG · ${formatPct(self.trueShootingPct)} TS.`
          : pinned.length > 1
            ? ` ${pinned.length} pinned players highlighted.`
            : ""}
      </p>
    </figure>
  );
}
