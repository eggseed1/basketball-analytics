"use client";

import { useEffect, useRef, useState } from "react";

import { fmtCount, fmtSigned } from "@/components/on-off/on-off-parts";
import type { TrendPoint } from "@/lib/on-off/derive";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

const HEIGHT = 200;
const PAD = { top: 12, right: 10, bottom: 22, left: 34 };

function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.max(260, Math.round(el.getBoundingClientRect().width)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceCeil(v: number, step: number) {
  return Math.max(step, Math.ceil(v / step) * step);
}

function shortDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Season-to-date on/off swing after each team game, with the games he played marked below. */
export function OnOffTrendChart({ points, color }: { points: TrendPoint[]; color: string }) {
  const [wrapRef, width] = useWidth<HTMLDivElement>(720);
  const [hover, setHover] = useState<number | null>(null);

  const innerW = width - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const step = points.length ? innerW / points.length : innerW;
  const xAt = (i: number) => PAD.left + step * i + step / 2;
  const values = points.map((p) => p.swing).filter((v): v is number => v != null);
  const yMax = niceCeil(Math.min(40, Math.max(5, ...values.map(Math.abs))), 5);
  const yAt = (v: number) => PAD.top + innerH / 2 - (v / yMax) * (innerH / 2);

  let path = "";
  let drawing = false;
  points.forEach((p, i) => {
    if (p.swing == null) {
      drawing = false;
      return;
    }
    path += `${drawing ? "L" : "M"}${xAt(i).toFixed(1)},${yAt(p.swing).toFixed(1)}`;
    drawing = true;
  });

  const lastIndex = points.findLastIndex((p) => p.swing != null);
  const active = hover ?? (lastIndex >= 0 ? lastIndex : null);
  const activePoint = active != null ? points[active] : null;
  const playedCount = points.filter((p) => p.played).length;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div ref={wrapRef} className="w-full min-w-0 overflow-hidden">
        <svg
          width="100%"
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Season-to-date on/off swing over ${points.length} team games`}
          className="block touch-pan-y"
          onPointerMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = ((e.clientX - rect.left) * width) / Math.max(1, rect.width);
            const i = Math.floor((x - PAD.left) / step);
            setHover(i >= 0 && i < points.length ? i : null);
          }}
          onPointerLeave={() => setHover(null)}
        >
          {[-yMax, 0, yMax].map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={yAt(t)}
                y2={yAt(t)}
                className={t === 0 ? "stroke-foreground/25" : "stroke-foreground/10"}
                strokeDasharray={t === 0 ? undefined : "3 4"}
              />
              <text
                x={PAD.left - 6}
                y={yAt(t)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted-foreground text-[10px] tabular-nums"
              >
                {fmtSigned(t, 0)}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            p.played ? (
              <rect
                key={p.game}
                x={xAt(i) - Math.max(0.75, step * 0.3)}
                y={HEIGHT - PAD.bottom + 8}
                width={Math.max(1.5, step * 0.6)}
                height={5}
                rx={1}
                className="fill-foreground/25"
              />
            ) : null
          )}
          <path d={path} fill="none" stroke={color} strokeWidth={2.25} strokeLinejoin="round" />
          {activePoint && activePoint.swing != null && active != null ? (
            <>
              <line
                x1={xAt(active)}
                x2={xAt(active)}
                y1={PAD.top}
                y2={HEIGHT - PAD.bottom}
                className="stroke-foreground/20"
              />
              <circle
                cx={xAt(active)}
                cy={yAt(activePoint.swing)}
                r={4}
                fill={color}
                className="stroke-background"
                strokeWidth={2}
              />
            </>
          ) : null}
        </svg>
      </div>
      <p className={cn(type.caption, "min-h-[1.25rem] tabular-nums text-muted-foreground")} aria-live="polite">
        {activePoint ? (
          <>
            Game {activePoint.game}, {shortDate(activePoint.date)} {activePoint.home ? "vs" : "at"}{" "}
            {activePoint.opp}
            {activePoint.played ? "" : " (did not play)"}:{" "}
            <span className="font-semibold text-foreground">
              {activePoint.swing == null ? "not enough possessions yet" : `${fmtSigned(activePoint.swing)} to date`}
            </span>
            , {fmtCount(activePoint.onPoss)} poss on, {fmtCount(activePoint.offPoss)} off
          </>
        ) : null}
      </p>
      <p className={cn(type.caption, "text-muted-foreground")}>
        Each point is his swing from the team&apos;s first game through that one. Ticks along the bottom mark
        the {playedCount} games he played. The line starts once he has 250 possessions on and off,
        since early values swing wildly.
      </p>
    </div>
  );
}
