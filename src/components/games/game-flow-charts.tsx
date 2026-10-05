"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { TeamLogo } from "@/components/brand/team-logo";
import type { PlayByPlayEvent } from "@/data/types";
import { type } from "@/lib/design-system";
import { formatNumber, formatPct } from "@/lib/format";
import type { ScoreTimelinePoint } from "@/lib/history/score-flow";
import {
  buildWinProbabilitySeries,
  type WinProbPoint,
} from "@/lib/game-win-probability";
import { useChartTheme } from "@/lib/chart-theme";
import { cn } from "@/lib/utils";

function periodMarksFor(maxT: number, maxPeriod: number): number[] {
  const marks: number[] = [];
  for (let p = 1; p < maxPeriod; p++) {
    const end = p <= 4 ? p * 12 * 60 : 4 * 12 * 60 + (p - 4) * 5 * 60;
    if (end < maxT) marks.push(end);
  }
  return marks;
}

function playForPoint(
  events: PlayByPlayEvent[] | undefined,
  eventIndex: number
): string | null {
  if (!events?.length || eventIndex < 0) return null;
  const byOrder = events[eventIndex];
  if (byOrder?.description) return byOrder.description;
  const match = events.find(
    (e) => e.actionNumber === eventIndex || e.orderNumber === eventIndex
  );
  return match?.description?.trim() || null;
}

function periodEndSeconds(period: number): number {
  return period <= 4 ? period * 720 : 4 * 720 + (period - 4) * 300;
}

function periodName(period: number): string {
  if (period <= 4) return `Q${period}`;
  return period === 5 ? "OT" : `${period - 4}OT`;
}

/**
 * Lead scale sized per side so a one-sided game doesn't leave half the chart
 * empty. Each side keeps at least one gridline step.
 */
function marginScale(
  homeMax: number,
  awayMax: number
): { up: number; down: number; ticksUp: number[]; ticksDown: number[] } {
  const maxAbs = Math.max(homeMax, awayMax, 1);
  const step = maxAbs <= 12 ? 5 : maxAbs <= 30 ? 10 : 15;
  const side = (v: number) => Math.max(step, Math.ceil(v / step) * step);
  const ticks = (max: number) => {
    const out: number[] = [];
    for (let v = step; v <= max; v += step) out.push(v);
    return out;
  };
  const up = side(homeMax);
  const down = side(awayMax);
  return { up, down, ticksUp: ticks(up), ticksDown: ticks(down) };
}

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Lead over game time as a stepped area: the home side shades above zero,
 * the away side below. Hover (or drag on touch) scrubs scoring plays.
 */
export function GameMarginFlowChart({
  timeline,
  homeLabel,
  awayLabel,
  homeColor,
  awayColor,
  events,
  live = false,
}: {
  timeline: ScoreTimelinePoint[];
  homeLabel: string;
  awayLabel: string;
  homeTeamKey: string;
  awayTeamKey: string;
  homeColor: string;
  awayColor: string;
  events?: PlayByPlayEvent[];
  /** Stop the line at the latest play instead of carrying it to the end. */
  live?: boolean;
}) {
  const chartTheme = useChartTheme();
  const clipId = useId().replace(/:/g, "");
  const [wrapRef, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    if (!timeline.length) return null;
    const maxPeriod = Math.max(...timeline.map((p) => p.period), 4);
    const endT = Math.max(
      periodEndSeconds(maxPeriod),
      ...timeline.map((p) => p.elapsedGameTime)
    );
    let homePeak: ScoreTimelinePoint | null = null;
    let awayPeak: ScoreTimelinePoint | null = null;
    for (const p of timeline) {
      if (p.margin > 0 && (!homePeak || p.margin > homePeak.margin)) homePeak = p;
      if (p.margin < 0 && (!awayPeak || p.margin < awayPeak.margin)) awayPeak = p;
    }
    const scale = marginScale(homePeak?.margin ?? 0, -(awayPeak?.margin ?? 0));
    return { maxPeriod, endT, scale, homePeak, awayPeak };
  }, [timeline]);

  if (!model) return null;

  const h = 236;
  const pad = { left: 34, right: 10, top: 12, bottom: 26 };
  const w = Math.max(width, 280);
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;
  const pxPerPoint = plotH / (model.scale.up + model.scale.down);
  const mid = pad.top + model.scale.up * pxPerPoint;
  const xOf = (t: number) => pad.left + (t / model.endT) * plotW;
  const yOf = (m: number) => mid - m * pxPerPoint;

  let line = `M ${xOf(0)} ${mid}`;
  let prevY = mid;
  for (const p of timeline) {
    const x = xOf(p.elapsedGameTime);
    const y = yOf(p.margin);
    line += ` L ${x} ${prevY} L ${x} ${y}`;
    prevY = y;
  }
  const lineEndT = live ? timeline[timeline.length - 1]!.elapsedGameTime : model.endT;
  line += ` L ${xOf(lineEndT)} ${prevY}`;
  const area = `${line} L ${xOf(lineEndT)} ${mid} L ${xOf(0)} ${mid} Z`;
  const fillOpacity = chartTheme.isDark ? 0.3 : 0.2;

  const periods = Array.from({ length: model.maxPeriod }, (_, i) => i + 1);
  const active = hover != null ? timeline[hover] : null;
  const activePlay = active ? playForPoint(events, active.eventIndex) : null;
  const activeX = active ? xOf(active.elapsedGameTime) : 0;
  const leadNote = (p: ScoreTimelinePoint | null, side: "home" | "away") => {
    const label = side === "home" ? homeLabel : awayLabel;
    return (
      <span>
        <span className="font-semibold" style={{ color: side === "home" ? homeColor : awayColor }}>
          {label} {p ? `+${Math.abs(p.margin)}` : "never led"}
        </span>
        {p ? (
          <span className="text-muted-foreground">
            {" "}
            {periodName(p.period)} {p.clock}
          </span>
        ) : null}
      </span>
    );
  };

  const scrub = (clientX: number, rect: DOMRect) => {
    const t = ((clientX - rect.left - pad.left) / plotW) * model.endT;
    let lo = 0;
    let hi = timeline.length - 1;
    let idx = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (timeline[m]!.elapsedGameTime <= t) {
        idx = m;
        lo = m + 1;
      } else hi = m - 1;
    }
    setHover(idx >= 0 ? idx : null);
  };

  const peak = (p: ScoreTimelinePoint | null, side: "home" | "away") => {
    if (!p) return null;
    return (
      <circle
        pointerEvents="none"
        cx={xOf(p.elapsedGameTime)}
        cy={yOf(p.margin)}
        r={4}
        fill={side === "home" ? homeColor : awayColor}
        stroke="var(--background)"
        strokeWidth={1.5}
      />
    );
  };

  return (
    <div ref={wrapRef}>
      <div className={cn(type.caption, "flex h-10 flex-col justify-center tabular-nums")} aria-live="polite">
        {active ? (
          <>
            <p className="flex items-baseline justify-between gap-3">
              <span className="font-semibold">
                {awayLabel} {active.awayScore} · {homeLabel} {active.homeScore}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {periodName(active.period)} {active.clock}
              </span>
            </p>
            {activePlay || active.scorerName ? (
              <p className="truncate text-muted-foreground">{activePlay ?? active.scorerName}</p>
            ) : null}
          </>
        ) : (
          <p className="flex flex-wrap gap-x-3">
            <span className="text-muted-foreground">Largest lead</span>
            {leadNote(model.awayPeak, "away")}
            {leadNote(model.homePeak, "home")}
          </p>
        )}
      </div>
      {width > 0 ? (
        <svg
          width={w}
          height={h}
          className="block touch-pan-y select-none"
          role="img"
          aria-label={`Score margin over game time. Largest leads: ${homeLabel} ${model.homePeak ? `+${model.homePeak.margin}` : "never led"}, ${awayLabel} ${model.awayPeak ? `+${-model.awayPeak.margin}` : "never led"}.`}
          onPointerMove={(e) => scrub(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerDown={(e) => scrub(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <clipPath id={`${clipId}-up`}>
              <rect x={0} y={0} width={w} height={mid} />
            </clipPath>
            <clipPath id={`${clipId}-down`}>
              <rect x={0} y={mid} width={w} height={h - mid} />
            </clipPath>
          </defs>

          {[...model.scale.ticksUp, ...model.scale.ticksDown.map((v) => -v)].map((m) => (
            <g key={m} className="text-muted-foreground">
              <line
                x1={pad.left}
                x2={w - pad.right}
                y1={yOf(m)}
                y2={yOf(m)}
                stroke="currentColor"
                strokeOpacity={chartTheme.gridOpacity()}
                strokeDasharray="2 4"
              />
              <text
                x={pad.left - 6}
                y={yOf(m) + 3.5}
                textAnchor="end"
                fontSize={10}
                className="fill-muted-foreground tabular-nums"
              >
                +{Math.abs(m)}
              </text>
            </g>
          ))}

          {periods.map((p) => {
            const start = p === 1 ? 0 : periodEndSeconds(p - 1);
            const end = Math.min(periodEndSeconds(p), model.endT);
            return (
              <g key={p}>
                {p > 1 ? (
                  <line
                    x1={xOf(start)}
                    x2={xOf(start)}
                    y1={pad.top}
                    y2={h - pad.bottom}
                    stroke="currentColor"
                    strokeOpacity={chartTheme.periodLineOpacity()}
                  />
                ) : null}
                <text
                  x={(xOf(start) + xOf(end)) / 2}
                  y={h - 7}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={600}
                  className="fill-muted-foreground"
                >
                  {periodName(p)}
                </text>
              </g>
            );
          })}

          <path d={area} fill={homeColor} fillOpacity={fillOpacity} clipPath={`url(#${clipId}-up)`} />
          <path d={area} fill={awayColor} fillOpacity={fillOpacity} clipPath={`url(#${clipId}-down)`} />
          <line
            x1={pad.left}
            x2={w - pad.right}
            y1={mid}
            y2={mid}
            stroke="currentColor"
            strokeOpacity={chartTheme.referenceOpacity()}
          />
          <path d={line} fill="none" stroke={homeColor} strokeWidth={2} strokeLinejoin="round" clipPath={`url(#${clipId}-up)`} />
          <path d={line} fill="none" stroke={awayColor} strokeWidth={2} strokeLinejoin="round" clipPath={`url(#${clipId}-down)`} />

          <g pointerEvents="none" fontSize={11} fontWeight={700}>
            <text x={pad.left + 6} y={pad.top + 11} fill={homeColor}>
              {homeLabel} ahead
            </text>
            <text x={pad.left + 6} y={h - pad.bottom - 6} fill={awayColor}>
              {awayLabel} ahead
            </text>
          </g>

          {peak(model.homePeak, "home")}
          {peak(model.awayPeak, "away")}

          {active ? (
            <g pointerEvents="none">
              <line
                x1={activeX}
                x2={activeX}
                y1={pad.top}
                y2={h - pad.bottom}
                stroke="currentColor"
                strokeOpacity={0.35}
              />
              <circle
                cx={activeX}
                cy={yOf(active.margin)}
                r={4.5}
                fill={active.margin > 0 ? homeColor : active.margin < 0 ? awayColor : "currentColor"}
                stroke="var(--background)"
                strokeWidth={2}
              />
            </g>
          ) : null}
        </svg>
      ) : (
        <div style={{ height: h }} />
      )}

    </div>
  );
}

export function GameWinProbabilityChart({
  timeline,
  homeLabel,
  awayLabel,
  homeTeamKey,
  awayTeamKey,
  homeColor,
  awayColor,
  finalHomeScore,
  finalAwayScore,
  events,
  final,
}: {
  timeline: ScoreTimelinePoint[];
  homeLabel: string;
  awayLabel: string;
  homeTeamKey: string;
  awayTeamKey: string;
  homeColor: string;
  awayColor: string;
  finalHomeScore: number;
  finalAwayScore: number;
  events?: PlayByPlayEvent[];
  /** Only a final game resolves to 100%; live games end at the current estimate. */
  final: boolean;
}) {
  const chartTheme = useChartTheme();
  const [hover, setHover] = useState<number | null>(null);
  const series = useMemo(
    () =>
      buildWinProbabilitySeries(timeline, {
        finalHomeScore,
        finalAwayScore,
        final,
      }),
    [timeline, finalHomeScore, finalAwayScore, final]
  );

  const { maxT, periodMarks, areaHome, areaAway } = useMemo(() => {
    if (!series.length) {
      return {
        maxT: 1,
        periodMarks: [] as number[],
        areaHome: "",
        areaAway: "",
      };
    }
    const maxPeriod = Math.max(...series.map((p) => p.period), 4);
    const maxT = Math.max(
      ...series.map((p) => p.elapsedGameTime),
      final ? 1 : periodEndSeconds(maxPeriod)
    );
    const w = 640;
    const h = 220;
    const mid = h / 2;
    const padY = 12;

    const xy = (p: WinProbPoint) => {
      const x = (p.elapsedGameTime / maxT) * w;
      const y = mid - (p.homeWp - 0.5) * 2 * (mid - padY);
      return { x, y };
    };

    // Build filled areas relative to the 50% midline.
    const homeParts: string[] = [];
    const awayParts: string[] = [];
    for (let i = 0; i < series.length - 1; i++) {
      const a = series[i]!;
      const b = series[i + 1]!;
      const pa = xy(a);
      const pb = xy(b);
      if (a.homeWp >= 0.5 && b.homeWp >= 0.5) {
        homeParts.push(
          `M ${pa.x} ${mid} L ${pa.x} ${pa.y} L ${pb.x} ${pb.y} L ${pb.x} ${mid} Z`
        );
      } else if (a.homeWp <= 0.5 && b.homeWp <= 0.5) {
        awayParts.push(
          `M ${pa.x} ${mid} L ${pa.x} ${pa.y} L ${pb.x} ${pb.y} L ${pb.x} ${mid} Z`
        );
      } else {
        // Crosses midline — split at 50%.
        const t =
          Math.abs(b.homeWp - a.homeWp) < 1e-9
            ? 0.5
            : (0.5 - a.homeWp) / (b.homeWp - a.homeWp);
        const cx = pa.x + (pb.x - pa.x) * t;
        if (a.homeWp >= 0.5) {
          homeParts.push(
            `M ${pa.x} ${mid} L ${pa.x} ${pa.y} L ${cx} ${mid} Z`
          );
          awayParts.push(
            `M ${cx} ${mid} L ${pb.x} ${pb.y} L ${pb.x} ${mid} Z`
          );
        } else {
          awayParts.push(
            `M ${pa.x} ${mid} L ${pa.x} ${pa.y} L ${cx} ${mid} Z`
          );
          homeParts.push(
            `M ${cx} ${mid} L ${pb.x} ${pb.y} L ${pb.x} ${mid} Z`
          );
        }
      }
    }

    return {
      maxT,
      periodMarks: periodMarksFor(maxT, maxPeriod),
      areaHome: homeParts.join(" "),
      areaAway: awayParts.join(" "),
    };
  }, [series, final]);

  if (series.length < 2) return null;

  const w = 640;
  const h = 220;
  const mid = h / 2;
  const padY = 12;
  const last = series[series.length - 1]!;
  const homeWpPct = last.homeWp * 100;
  const awayWpPct = (1 - last.homeWp) * 100;
  const active = hover != null ? series[hover] : null;
  const activePlay =
    active != null ? playForPoint(events, active.eventIndex) : null;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            type.caption,
            "mb-1 text-center font-semibold uppercase tracking-[0.14em] text-muted-foreground"
          )}
        >
          Game win probability
        </p>
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="h-auto w-full"
          role="img"
          aria-label="Approximate win probability over game time"
        >
          <line
            x1={0}
            y1={mid}
            x2={w}
            y2={mid}
            stroke="currentColor"
            strokeOpacity={chartTheme.referenceOpacity()}
          />
          {periodMarks.map((t, i) => {
            const x = (t / maxT) * w;
            return (
              <g key={t}>
                <line
                  x1={x}
                  y1={4}
                  x2={x}
                  y2={h - 4}
                  stroke="currentColor"
                  strokeOpacity={chartTheme.periodLineOpacity()}
                />
                <text
                  x={x + 3}
                  y={i % 2 === 0 ? 12 : h - 4}
                  className="fill-muted-foreground"
                  fontSize={10}
                >
                  {i + 1}
                </text>
              </g>
            );
          })}
          <path d={areaHome} fill={homeColor} fillOpacity={0.85} />
          <path d={areaAway} fill={awayColor} fillOpacity={0.85} />
          {series.map((p, i) => {
            if (i === 0 && p.eventIndex < 0) return null;
            const x = (p.elapsedGameTime / maxT) * w;
            const y = mid - (p.homeWp - 0.5) * 2 * (mid - padY);
            const isHome =
              p.scoringTeamId === homeTeamKey ||
              (p.scoringTeamId !== awayTeamKey && p.homeWp >= 0.5);
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={hover === i ? 4 : 0}
                fill={isHome ? homeColor : awayColor}
                className="cursor-pointer"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
          {/* Invisible hit targets */}
          {series.map((p, i) => {
            const x = (p.elapsedGameTime / maxT) * w;
            return (
              <rect
                key={`hit-${i}`}
                x={x - 4}
                y={0}
                width={8}
                height={h}
                fill="transparent"
                className="cursor-crosshair"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
        </svg>
        {active ? (
          <p className={cn(type.caption, "mt-1 tabular-nums text-muted-foreground")}>
            Q{active.period} {active.clock} · {awayLabel} {active.awayScore}–
            {homeLabel} {active.homeScore} ·{" "}
            {formatPct(active.homeWp)} {homeLabel} WP
            {activePlay ? ` · ${activePlay}` : ""}
          </p>
        ) : (
          <p className={cn(type.caption, "mt-1 text-muted-foreground")}>
            Approximate scoreboard model, not Vegas odds.
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-row items-center justify-center gap-4 sm:w-28 sm:flex-col sm:justify-between sm:gap-0 sm:py-6">
        <div className="flex items-center gap-2 sm:flex-col sm:gap-1.5">
          <span
            className="rounded px-2 py-0.5 text-[13px] font-bold tabular-nums text-white"
            style={{ backgroundColor: homeColor }}
          >
            {formatNumber(homeWpPct, 1)}%
          </span>
          <TeamLogo teamKey={homeTeamKey} size="sm" />
          <span className={cn(type.caption, "font-semibold sm:sr-only")}>
            {homeLabel}
          </span>
        </div>
        <div className="flex items-center gap-2 sm:flex-col sm:gap-1.5">
          <span
            className="rounded px-2 py-0.5 text-[13px] font-bold tabular-nums text-white"
            style={{ backgroundColor: awayColor }}
          >
            {formatNumber(awayWpPct, 1)}%
          </span>
          <TeamLogo teamKey={awayTeamKey} size="sm" />
          <span className={cn(type.caption, "font-semibold sm:sr-only")}>
            {awayLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
