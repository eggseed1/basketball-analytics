"use client";

import { useState } from "react";

import { useChartTheme } from "@/lib/chart-theme";
import { type } from "@/lib/design-system";
import { formatOrdinal } from "@/lib/format";
import { percentileSavantColor, percentileSavantForeground } from "@/lib/player-grade";
import type { DnaAxis } from "@/lib/team-overview-types";
import { cn } from "@/lib/utils";

const W = 420;
const H = 330;
const CX = W / 2;
const CY = H / 2;
const R = 112;

function point(i: number, n: number, pct: number) {
  const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
  const r = (pct / 100) * R;
  return [CX + Math.cos(a) * r, CY + Math.sin(a) * r] as const;
}

export function TeamDnaRadar({ axes, teamKey, season }: { axes: DnaAxis[]; teamKey: string; season: string }) {
  const chartTheme = useChartTheme();
  const accent = chartTheme.teamColor(teamKey).color;
  const [active, setActive] = useState<string | null>(null);
  const n = axes.length;
  if (n < 3) return null;

  const shape = axes.map((a, i) => point(i, n, Math.max(4, a.percentile)).join(",")).join(" ");
  const focus = axes.find((a) => a.key === active) ?? [...axes].sort((a, b) => b.percentile - a.percentile)[0]!;

  return (
    <section className="sports-card flex flex-col gap-3 p-4 sm:p-5" aria-label="Team profile">
      <div>
        <h2 className={type.heading}>Team profile</h2>
        <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
          League percentile on each stat for {season}. The dashed ring is the league median. 3PA rate and FT rate
          describe style, so a higher number is not automatically better.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[420px] shrink-0 sm:w-[54%]" role="img" aria-label="Team percentile radar">
          {[25, 50, 75, 100].map((ring) => (
            <polygon
              key={ring}
              points={axes.map((_, i) => point(i, n, ring).join(",")).join(" ")}
              fill={ring === 100 ? "currentColor" : "none"}
              fillOpacity={ring === 100 ? 0.025 : 0}
              stroke="currentColor"
              strokeOpacity={ring === 50 ? 0.4 : 0.1}
              strokeDasharray={ring === 50 ? "4 4" : undefined}
            />
          ))}
          {axes.map((a, i) => {
            const [x, y] = point(i, n, 100);
            return <line key={a.key} x1={CX} y1={CY} x2={x} y2={y} stroke="currentColor" strokeOpacity={0.08} />;
          })}
          <polygon points={shape} fill={accent} fillOpacity={0.22} stroke={accent} strokeWidth={2.5} strokeLinejoin="round" />
          {axes.map((a, i) => {
            const [x, y] = point(i, n, Math.max(4, a.percentile));
            const on = focus.key === a.key;
            return (
              <circle
                key={a.key}
                cx={x}
                cy={y}
                r={on ? 6.5 : 4.5}
                fill={percentileSavantColor(a.percentile, "auto")}
                stroke="var(--background)"
                strokeWidth={2}
              />
            );
          })}
          {axes.map((a, i) => {
            const [x, y] = point(i, n, 128);
            const anchor = Math.abs(x - CX) < 8 ? "middle" : x > CX ? "start" : "end";
            const on = focus.key === a.key;
            return (
              <g
                key={a.key}
                className="cursor-pointer"
                onPointerEnter={() => setActive(a.key)}
                onClick={() => setActive(a.key)}
              >
                <text
                  x={x}
                  y={y}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  fontSize={11.5}
                  fontWeight={on ? 700 : 600}
                  className={on ? "fill-foreground" : "fill-muted-foreground"}
                >
                  {a.label}
                </text>
                <text
                  x={x}
                  y={y + 13}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  fontSize={10}
                  className="fill-muted-foreground tabular-nums"
                >
                  {Math.round(a.percentile)}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="flex w-full min-w-0 flex-col gap-3">
          <div className="rounded-lg border border-border/70 p-3">
            <p className={cn(type.micro, "font-semibold uppercase tracking-wide text-muted-foreground")}>{focus.label}</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className={cn(type.title2, "font-bold tabular-nums")}>{focus.display}</span>
              <span className={cn(type.caption, "text-muted-foreground")}>{focus.rankLine ? `${focus.rankLine} in the league` : null}</span>
            </p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-foreground/[0.08]">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(3, focus.percentile)}%`, background: percentileSavantColor(focus.percentile, "auto") }}
              />
            </div>
            <p className={cn(type.caption, "mt-1 text-muted-foreground")}>
              {formatOrdinal(Math.round(focus.percentile))} percentile{focus.style ? " · style stat" : ""}
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-1.5">
            {axes.map((a) => (
              <li key={a.key}>
                <button
                  type="button"
                  onClick={() => setActive(a.key)}
                  onPointerEnter={() => setActive(a.key)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left transition",
                    focus.key === a.key ? "bg-muted" : "hover:bg-muted/60"
                  )}
                >
                  <span className={cn(type.caption, "truncate font-medium")}>{a.label}</span>
                  <span
                    className="min-w-[2rem] rounded px-1.5 text-center text-[11px] font-bold tabular-nums"
                    style={{ background: percentileSavantColor(a.percentile, "auto"), color: percentileSavantForeground(a.percentile) }}
                  >
                    {Math.round(a.percentile)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
