"use client";

import { useMemo, useState, type MouseEvent } from "react";

import {
  ARC_FIELDS,
  type ArcField,
  type CompareArcPoint,
} from "@/analytics/compare-player-context";
import {
  SectionHeading,
  niceTicks,
  useElementWidth,
} from "@/components/compare/compare-ui";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { type } from "@/lib/design-system";
import {
  SHEET_STAT_BY_ID,
  formatSheetStatValue,
} from "@/lib/player-stat-sheet-registry";
import { cn } from "@/lib/utils";

const ARC_LABEL: Record<ArcField, string> = {
  pts: "PTS",
  trb: "REB",
  ast: "AST",
  atr: "AST/TO",
  ts: "TS%",
  usg: "USG%",
  per: "PER",
  bpm: "BPM",
  drbl100: "DRBL/100",
  war1: "WAR1",
};

type ArcSide = {
  name: string;
  color: string;
  points: CompareArcPoint[];
  /** Season being compared, ringed on the line. Career mode passes none. */
  focusSeason?: string;
};

function fmt(field: ArcField, v: number): string {
  return formatSheetStatValue(v, SHEET_STAT_BY_ID[field], "perGame");
}

export function CompareCareerArc({ a, b }: { a: ArcSide; b: ArcSide }) {
  const [boxRef, width] = useElementWidth<HTMLDivElement>();
  const available = useMemo(
    () =>
      ARC_FIELDS.filter((f) => {
        const i = ARC_FIELDS.indexOf(f);
        return [a, b].some((s) => s.points.some((p) => p.v[i] != null));
      }),
    [a, b]
  );
  const [field, setField] = useState<ArcField>("pts");
  const active = available.includes(field) ? field : (available[0] ?? "pts");
  const fi = ARC_FIELDS.indexOf(active);
  const [hoverX, setHoverX] = useState<number | null>(null);

  const byAge = [a, b].every(
    (s) => s.points.length > 0 && s.points.every((p) => p.age != null)
  );
  const lines = [a, b].map((s) => ({
    ...s,
    pts: s.points
      .map((p, i) => ({
        x: byAge ? p.age! : i + 1,
        y: p.v[fi],
        season: p.season,
        gp: p.gamesPlayed,
      }))
      .filter((p): p is typeof p & { y: number } => p.y != null),
  }));
  const all = lines.flatMap((l) => l.pts);
  if (!available.length || all.length < 2) return null;

  const xMin = Math.min(...all.map((p) => p.x));
  const xMax = Math.max(...all.map((p) => p.x));
  const yLo = Math.min(0, ...all.map((p) => p.y));
  const yHi = Math.max(...all.map((p) => p.y));
  const ySpan = yHi - yLo || 1;
  const y0 = yLo < 0 ? yLo - ySpan * 0.08 : yLo;
  const y1 = yHi + ySpan * 0.08;

  const height = Math.round(Math.min(340, Math.max(230, width * 0.5)));
  const m = { top: 14, right: 16, bottom: 34, left: 44 };
  const iw = Math.max(1, width - m.left - m.right);
  const ih = Math.max(1, height - m.top - m.bottom);
  const sx = (v: number) =>
    m.left + (xMax === xMin ? iw / 2 : ((v - xMin) / (xMax - xMin)) * iw);
  const sy = (v: number) => m.top + (1 - (v - y0) / (y1 - y0)) * ih;
  const xTicks = niceTicks(xMin, xMax, width < 420 ? 4 : 8).filter(
    (t) => Number.isInteger(t)
  );
  const yTicks = niceTicks(y0, y1, 4);

  const readout =
    hoverX != null
      ? lines.map((l) => ({
          name: l.name,
          color: l.color,
          point: l.pts.find((p) => p.x === hoverX) ?? null,
        }))
      : null;

  const onMove = (e: MouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const raw = xMin + ((e.clientX - rect.left) / rect.width) * (xMax - xMin);
    setHoverX(Math.max(xMin, Math.min(xMax, Math.round(raw))));
  };

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label="Career arc">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHeading
          title="Career arc"
          caption={`Per-game ${ARC_LABEL[active]} each season, by ${
            byAge ? "age" : "season of career"
          }. Traded seasons use the combined line. Gaps are seasons without the stat.`}
        />
      </div>
      <SegmentedControl
        size="sm"
        value={active}
        onChange={setField}
        className="min-w-0 max-w-full"
        options={available.map((f) => ({ id: f, label: ARC_LABEL[f] }))}
      />
      <p className={cn(type.caption, "min-h-5 tabular-nums")}>
        {readout ? (
          <>
            <span className="font-bold">
              {byAge ? `Age ${hoverX}` : `Season ${hoverX}`}
            </span>
            {readout.map((r) => (
              <span key={r.name} className="ml-3">
                <span className="font-bold" style={{ color: r.color }}>
                  {r.name}
                </span>{" "}
                {r.point
                  ? `${fmt(active, r.point.y)} (${r.point.season}, ${r.point.gp} GP)`
                  : "—"}
              </span>
            ))}
          </>
        ) : (
          <span className="text-muted-foreground">
            Hover or tap the chart to read a season.
          </span>
        )}
      </p>
      <div ref={boxRef} className="w-full min-w-0" style={{ height }}>
        {width > 0 ? (
          <svg width={width} height={height} role="img" aria-label={`Career ${ARC_LABEL[active]} arc`}>
            {yTicks.map((t) => (
              <g key={`y${t}`}>
                <line
                  x1={m.left}
                  x2={width - m.right}
                  y1={sy(t)}
                  y2={sy(t)}
                  stroke="currentColor"
                  className="text-border"
                  strokeOpacity={t === 0 && y0 < 0 ? 1 : 0.6}
                />
                <text x={m.left - 6} y={sy(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground" fontSize={10}>
                  {fmt(active, t)}
                </text>
              </g>
            ))}
            {xTicks.map((t) => (
              <text key={`x${t}`} x={sx(t)} y={height - m.bottom + 15} textAnchor="middle" className="fill-muted-foreground" fontSize={10}>
                {t}
              </text>
            ))}
            <text x={m.left + iw / 2} y={height - 3} textAnchor="middle" className="fill-muted-foreground" fontSize={11} fontWeight={700}>
              {byAge ? "Age" : "Season of career"}
            </text>
            {hoverX != null ? (
              <line
                x1={sx(hoverX)}
                x2={sx(hoverX)}
                y1={m.top}
                y2={m.top + ih}
                stroke="currentColor"
                className="text-foreground"
                strokeOpacity={0.25}
              />
            ) : null}
            {lines.map((l, li) => {
              const segments: Array<typeof l.pts> = [];
              let current: typeof l.pts = [];
              for (const p of l.pts) {
                const prev = current[current.length - 1];
                if (prev && p.x - prev.x > 1) {
                  segments.push(current);
                  current = [];
                }
                current.push(p);
              }
              if (current.length) segments.push(current);
              return (
                <g key={l.name + li}>
                  {segments.map((seg, si) =>
                    seg.length > 1 ? (
                      <polyline
                        key={si}
                        fill="none"
                        stroke={l.color}
                        strokeWidth={2.5}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        strokeDasharray={li === 1 ? "6 4" : undefined}
                        points={seg.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ")}
                      />
                    ) : null
                  )}
                  {l.pts.map((p) => {
                    const focus = p.season === l.focusSeason;
                    const hovered = p.x === hoverX;
                    return (
                      <circle
                        key={p.season}
                        cx={sx(p.x)}
                        cy={sy(p.y)}
                        r={focus ? 6 : hovered ? 5 : 3}
                        fill={focus ? "var(--background)" : l.color}
                        stroke={l.color}
                        strokeWidth={focus ? 3 : 0}
                      />
                    );
                  })}
                </g>
              );
            })}
            <rect
              x={m.left}
              y={m.top}
              width={iw}
              height={ih}
              fill="transparent"
              onMouseMove={onMove}
              onClick={onMove}
              onMouseLeave={() => setHoverX(null)}
            />
          </svg>
        ) : null}
      </div>
      <div className={cn(type.micro, "flex flex-wrap gap-4 font-semibold")}>
        {lines.map((l, li) => (
          <span key={l.name + li} className="inline-flex items-center gap-1.5">
            <svg width="18" height="6" aria-hidden>
              <line x1="0" y1="3" x2="18" y2="3" stroke={l.color} strokeWidth="3" strokeDasharray={li === 1 ? "5 3" : undefined} />
            </svg>
            {l.name}
            {l.focusSeason ? (
              <span className="text-muted-foreground">(ringed: {l.focusSeason})</span>
            ) : null}
          </span>
        ))}
      </div>
    </section>
  );
}
