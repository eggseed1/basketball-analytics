"use client";

import { useMemo } from "react";

import {
  SCATTER_FIELDS,
  type CompareScatterSide,
  type ScatterField,
} from "@/analytics/compare-player-context";
import {
  SectionHeading,
  niceTicks,
  useElementWidth,
} from "@/components/compare/compare-ui";
import { type } from "@/lib/design-system";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ScatterPreset = {
  title: string;
  x: ScatterField;
  y: ScatterField;
  xLabel: string;
  yLabel: string;
  /** Lower is better on y, so the axis runs high-to-low and "up" stays good. */
  invertY?: boolean;
  caption: string;
};

export const SCATTER_PRESETS = {
  usage: {
    title: "Usage vs efficiency",
    x: "usg",
    y: "ts",
    xLabel: "USG%",
    yLabel: "TS%",
    caption: "Right means a bigger share of the offense. Up means more efficient scoring.",
  },
  creation: {
    title: "Creation vs care",
    x: "astPct",
    y: "tovPct",
    xLabel: "AST%",
    yLabel: "TOV%",
    invertY: true,
    caption:
      "Right means more teammate baskets assisted. The TOV% axis is flipped, so up means fewer turnovers.",
  },
  glass: {
    title: "Boards vs rim protection",
    x: "trbPct",
    y: "blkPct",
    xLabel: "TRB%",
    yLabel: "BLK%",
    caption: "Right means more of the available rebounds. Up means more of opponents' twos blocked.",
  },
  drbl: {
    title: "DRBL offense vs defense",
    x: "drblO",
    y: "drblD",
    xLabel: "DRBL-O",
    yLabel: "DRBL-D",
    caption: "Points per 100 possessions on each end, against an average player. Up and right helps on both.",
  },
} satisfies Record<string, ScatterPreset>;

const PCT_FIELDS = new Set<ScatterField>(["usg", "ts", "astPct", "tovPct", "trbPct", "blkPct"]);

function fmt(field: ScatterField, v: number): string {
  return PCT_FIELDS.has(field) ? `${formatNumber(v * 100, 1)}%` : formatNumber(v, 1);
}

/** Axis ticks drop a trailing ".0" so the labels stay short. */
function tickFmt(field: ScatterField, v: number): string {
  const n = PCT_FIELDS.has(field) ? v * 100 : v;
  const shown = Number(n.toFixed(1)) + 0;
  return PCT_FIELDS.has(field) ? `${shown}%` : String(shown);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

type Highlight = {
  name: string;
  color: string;
  values: Array<number | null> | null;
};

export function ComparePeerScatter({
  preset,
  sides,
  a,
  b,
  note,
  className,
}: {
  preset: ScatterPreset;
  sides: Array<CompareScatterSide | null>;
  a: Highlight;
  b: Highlight;
  note?: string;
  className?: string;
}) {
  const [boxRef, width] = useElementWidth<HTMLDivElement>();
  const xi = SCATTER_FIELDS.indexOf(preset.x);
  const yi = SCATTER_FIELDS.indexOf(preset.y);

  const seasons = useMemo(() => {
    const seen = new Map<string, CompareScatterSide>();
    for (const s of sides) if (s && !seen.has(s.season)) seen.set(s.season, s);
    return [...seen.values()];
  }, [sides]);

  const pool = useMemo(
    () =>
      seasons.flatMap((s) =>
        s.pool
          .map((p) => ({ id: p.id, name: p.name, season: s.season, x: p.v[xi], y: p.v[yi] }))
          .filter((p): p is typeof p & { x: number; y: number } => p.x != null && p.y != null)
      ),
    [seasons, xi, yi]
  );

  const marks = [a, b]
    .map((h) => ({ ...h, x: h.values?.[xi] ?? null, y: h.values?.[yi] ?? null }))
    .filter((h): h is typeof h & { x: number; y: number } => h.x != null && h.y != null);

  if (pool.length < 10 || !marks.length) return null;

  const xs = [...pool.map((p) => p.x), ...marks.map((m) => m.x)];
  const ys = [...pool.map((p) => p.y), ...marks.map((m) => m.y)];
  const pad = (lo: number, hi: number) => {
    const span = hi - lo || Math.abs(hi) || 1;
    return [lo - span * 0.06, hi + span * 0.06] as const;
  };
  const [x0, x1] = pad(Math.min(...xs), Math.max(...xs));
  const [y0, y1] = pad(Math.min(...ys), Math.max(...ys));
  const mx = median(pool.map((p) => p.x));
  const my = median(pool.map((p) => p.y));

  const height = Math.round(Math.min(380, Math.max(250, width * 0.62)));
  const m = { top: 12, right: 14, bottom: 36, left: 52 };
  const iw = Math.max(1, width - m.left - m.right);
  const ih = Math.max(1, height - m.top - m.bottom);
  const sx = (v: number) => m.left + ((v - x0) / (x1 - x0)) * iw;
  const sy = (v: number) =>
    preset.invertY
      ? m.top + ((v - y0) / (y1 - y0)) * ih
      : m.top + (1 - (v - y0) / (y1 - y0)) * ih;
  const xTicks = niceTicks(x0, x1, width < 420 ? 3 : 5);
  const yTicks = niceTicks(y0, y1, 4);
  const multiSeason = seasons.length > 1;

  return (
    <figure className={cn("flex min-w-0 flex-col gap-2", className)} aria-label={preset.title}>
      <SectionHeading
        title={preset.title}
        caption={`${preset.caption} Grey dots are ${
          multiSeason ? `players from ${seasons.map((s) => s.season).join(" and ")}` : `${seasons[0]!.season} players`
        } with 15+ games and 12+ minutes. Dashed lines mark the middle player.${note ? ` ${note}` : ""}`}
      />
      <div ref={boxRef} className="w-full min-w-0" style={{ height }}>
        {width > 0 ? (
          <svg width={width} height={height} role="img" aria-label={`${preset.title} scatter`}>
            {yTicks.map((t) => (
              <g key={`y${t}`}>
                <line
                  x1={m.left}
                  x2={width - m.right}
                  y1={sy(t)}
                  y2={sy(t)}
                  stroke="currentColor"
                  className="text-border"
                  strokeOpacity={0.6}
                />
                <text
                  x={m.left - 6}
                  y={sy(t)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-muted-foreground"
                  fontSize={10}
                >
                  {tickFmt(preset.y, t)}
                </text>
              </g>
            ))}
            {xTicks.map((t) => (
              <text
                key={`x${t}`}
                x={sx(t)}
                y={height - m.bottom + 14}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize={10}
              >
                {tickFmt(preset.x, t)}
              </text>
            ))}
            <text
              x={m.left + iw / 2}
              y={height - 4}
              textAnchor="middle"
              className="fill-muted-foreground"
              fontSize={11}
              fontWeight={700}
            >
              {preset.xLabel}
            </text>
            <text
              transform={`translate(10 ${m.top + ih / 2}) rotate(-90)`}
              textAnchor="middle"
              className="fill-muted-foreground"
              fontSize={11}
              fontWeight={700}
            >
              {preset.yLabel}
              {preset.invertY ? " (flipped)" : ""}
            </text>
            {mx != null ? (
              <line
                x1={sx(mx)}
                x2={sx(mx)}
                y1={m.top}
                y2={m.top + ih}
                stroke="currentColor"
                className="text-muted-foreground"
                strokeDasharray="4 4"
                strokeOpacity={0.5}
              />
            ) : null}
            {my != null ? (
              <line
                x1={m.left}
                x2={m.left + iw}
                y1={sy(my)}
                y2={sy(my)}
                stroke="currentColor"
                className="text-muted-foreground"
                strokeDasharray="4 4"
                strokeOpacity={0.5}
              />
            ) : null}
            <g className="text-foreground">
              {pool.map((p) => (
                <circle
                  key={`${p.season}-${p.id}`}
                  cx={sx(p.x)}
                  cy={sy(p.y)}
                  r={2.6}
                  fill="currentColor"
                  fillOpacity={0.2}
                >
                  <title>
                    {`${p.name}${multiSeason ? ` (${p.season})` : ""}: ${preset.xLabel} ${fmt(preset.x, p.x)}, ${preset.yLabel} ${fmt(preset.y, p.y)}`}
                  </title>
                </circle>
              ))}
            </g>
            {marks.map((mk, i) => {
              const cx = sx(mk.x);
              const cy = sy(mk.y);
              const right = cx < m.left + iw * 0.7;
              return (
                <g key={i}>
                  <circle
                    data-motion-dot
                    cx={cx}
                    cy={cy}
                    r={7}
                    fill={mk.color}
                    stroke="var(--background)"
                    strokeWidth={2.5}
                  >
                    <title>
                      {`${mk.name}: ${preset.xLabel} ${fmt(preset.x, mk.x)}, ${preset.yLabel} ${fmt(preset.y, mk.y)}`}
                    </title>
                  </circle>
                  <text
                    x={cx + (right ? 11 : -11)}
                    y={cy + (i === 0 ? -6 : 14)}
                    textAnchor={right ? "start" : "end"}
                    fontSize={12}
                    fontWeight={800}
                    fill={mk.color}
                    stroke="var(--background)"
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    {mk.name}
                  </text>
                </g>
              );
            })}
          </svg>
        ) : null}
      </div>
      <p className={cn(type.micro, "tabular-nums text-muted-foreground")}>
        {marks
          .map((mk) => `${mk.name} ${preset.xLabel} ${fmt(preset.x, mk.x)}, ${preset.yLabel} ${fmt(preset.y, mk.y)}`)
          .join(" · ")}
      </p>
    </figure>
  );
}
