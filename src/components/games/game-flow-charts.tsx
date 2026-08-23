"use client";

import { useMemo, useState } from "react";

import { TeamLogo } from "@/components/brand/team-logo";
import type { PlayByPlayEvent } from "@/data/types";
import { type } from "@/lib/design-system";
import { formatNumber, formatPct } from "@/lib/format";
import type { ScoreTimelinePoint } from "@/lib/history/score-flow";
import {
  buildWinProbabilitySeries,
  type WinProbPoint,
} from "@/lib/game-win-probability";
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

export function GameMarginFlowChart({
  timeline,
  homeLabel,
  awayLabel,
  homeTeamKey,
  awayTeamKey,
  homeColor,
  awayColor,
  events,
}: {
  timeline: ScoreTimelinePoint[];
  homeLabel: string;
  awayLabel: string;
  homeTeamKey: string;
  awayTeamKey: string;
  homeColor: string;
  awayColor: string;
  events?: PlayByPlayEvent[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const { maxAbs, maxT, periodMarks, maxPeriod } = useMemo(() => {
    if (!timeline.length) {
      return { maxAbs: 1, maxT: 1, periodMarks: [] as number[], maxPeriod: 4 };
    }
    const maxT = Math.max(...timeline.map((p) => p.elapsedGameTime), 1);
    const maxAbs = Math.max(...timeline.map((p) => Math.abs(p.margin)), 1);
    const maxPeriod = Math.max(...timeline.map((p) => p.period), 4);
    return {
      maxAbs,
      maxT,
      maxPeriod,
      periodMarks: periodMarksFor(maxT, maxPeriod),
    };
  }, [timeline]);

  if (!timeline.length) return null;

  const w = 640;
  const h = 200;
  const mid = h / 2;
  const padY = 16;
  const coords = timeline.map((p) => {
    const x = (p.elapsedGameTime / maxT) * w;
    const y = mid - (p.margin / maxAbs) * (mid - padY);
    return { x, y, p };
  });
  const poly = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const active = hover != null ? timeline[hover] : null;
  const activePlay =
    active != null ? playForPoint(events, active.eventIndex) : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p
            className={cn(
              type.caption,
              "font-semibold uppercase tracking-wide text-muted-foreground"
            )}
          >
            Score margin
          </p>
          <p className={cn(type.caption, "text-muted-foreground")}>
            {homeLabel} lead up · {awayLabel} lead down
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-[12px]">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: awayColor }}
            />
            {awayLabel}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[12px]">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: homeColor }}
            />
            {homeLabel}
          </span>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-auto w-full"
        role="img"
        aria-label="Score margin over game time"
      >
        <line
          x1={0}
          y1={mid}
          x2={w}
          y2={mid}
          stroke="currentColor"
          strokeOpacity={0.18}
        />
        {periodMarks.map((t, i) => {
          const x = (t / maxT) * w;
          return (
            <g key={t}>
              <line
                x1={x}
                y1={8}
                x2={x}
                y2={h - 8}
                stroke="currentColor"
                strokeOpacity={0.1}
              />
              <text
                x={x + 4}
                y={i % 2 === 0 ? 14 : h - 6}
                className="fill-muted-foreground"
                fontSize={11}
              >
                {i + 1 < maxPeriod ? `Q${i + 1}` : ""}
              </text>
            </g>
          );
        })}
        <polyline
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.35}
          strokeWidth={1.5}
          points={poly}
        />
        {coords.map(({ x, y, p }, i) => {
          const isHome =
            p.scoringTeamId === homeTeamKey ||
            (!p.scoringTeamId && p.margin >= 0);
          const color = isHome ? homeColor : awayColor;
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={hover === i ? 5 : 3.25}
              fill={color}
              stroke="var(--background)"
              strokeWidth={hover === i ? 1.5 : 0}
              className="cursor-pointer"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
      </svg>
      {active ? (
        <div className="rounded-md bg-foreground/[0.04] px-3 py-2">
          <p className={cn(type.caption, "font-semibold tabular-nums")}>
            Q{active.period} {active.clock} · {awayLabel} {active.awayScore}–
            {homeLabel} {active.homeScore}
            {active.points ? ` · +${active.points}` : ""}
            {active.scorerName ? ` · ${active.scorerName}` : ""}
          </p>
          {activePlay ? (
            <p className={cn(type.bodySm, "mt-0.5 text-muted-foreground")}>
              {activePlay}
            </p>
          ) : null}
        </div>
      ) : (
        <p className={cn(type.caption, "text-muted-foreground")}>
          Hover a scoring play for the correlated description.
        </p>
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
}) {
  const [hover, setHover] = useState<number | null>(null);
  const series = useMemo(
    () =>
      buildWinProbabilitySeries(timeline, {
        finalHomeScore,
        finalAwayScore,
      }),
    [timeline, finalHomeScore, finalAwayScore]
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
    const maxT = Math.max(...series.map((p) => p.elapsedGameTime), 1);
    const maxPeriod = Math.max(...series.map((p) => p.period), 4);
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
  }, [series]);

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
            strokeOpacity={0.2}
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
                  strokeOpacity={0.1}
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
            Approximate scoreboard model — not Vegas odds.
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
