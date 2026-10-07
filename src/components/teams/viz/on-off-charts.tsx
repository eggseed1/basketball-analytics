"use client";

import Link from "next/link";
import type { CSSProperties } from "react";

import { Z95, type LineupRow, type OnOffPlayerRow } from "@/lib/on-off/derive";
import { type } from "@/lib/design-system";
import { formatNumber } from "@/lib/format";
import { playerHref } from "@/lib/player-page-contract";
import { cn } from "@/lib/utils";

import { clamp, lastName, LegendSwatch, LOSS, signed, ticks, WIN } from "./viz-kit";

const SWING_ROWS = 12;
const LINEUP_DOTS = 20;

function finite(n: number | null | undefined): n is number {
  return n != null && Number.isFinite(n);
}

/**
 * Each regular's off-floor net rating (ring) slides to his on-floor net
 * rating (dot). The bar between them is the swing, green when the team was
 * better with him on.
 */
export function OnOffSwingChart({
  rows,
  season,
}: {
  rows: OnOffPlayerRow[];
  season: string;
}) {
  const shown = rows
    .filter((r) => finite(r.cmp.on.net) && finite(r.cmp.off.net) && finite(r.cmp.netDiff))
    .sort((a, b) => b.poss - a.poss)
    .slice(0, SWING_ROWS)
    .sort((a, b) => (b.cmp.netDiff as number) - (a.cmp.netDiff as number));
  if (shown.length < 3) return null;
  const nets = shown.flatMap((r) => [r.cmp.on.net as number, r.cmp.off.net as number]);
  const lo = Math.min(0, Math.floor((Math.min(...nets) - 1) / 5) * 5);
  const hi = Math.max(0, Math.ceil((Math.max(...nets) + 1) / 5) * 5);
  const x = (v: number) => ((clamp(v, lo, hi) - lo) / (hi - lo)) * 100;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <LegendSwatch color="var(--foreground)" shape="dot" outline label="Net rating with him off" />
        <LegendSwatch color="var(--foreground)" shape="dot" label="With him on" />
        <LegendSwatch color={WIN} shape="line" label="Better with him" />
        <LegendSwatch color={LOSS} shape="line" label="Worse with him" />
      </div>
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-[8.5rem] right-14 sm:left-[11rem]">
          {ticks(lo, hi, 6).map((t) => (
            <div
              key={t}
              aria-hidden
              className={cn("absolute inset-y-0 border-l", t === 0 ? "border-foreground/40" : "border-dashed border-border/70")}
              style={{ left: `${x(t)}%` }}
            />
          ))}
        </div>
        <div className="relative flex flex-col">
          {shown.map((r, i) => {
            const on = r.cmp.on.net as number;
            const off = r.cmp.off.net as number;
            const diff = r.cmp.netDiff as number;
            const left = Math.min(x(on), x(off));
            const right = Math.max(x(on), x(off));
            const tone = diff >= 0 ? WIN : LOSS;
            const range = finite(r.cmp.netDiffSe) ? ` · ±${formatNumber(Z95 * r.cmp.netDiffSe, 1)}` : "";
            return (
              <div
                key={r.id}
                data-viz-row
                className="grid grid-cols-[8rem_minmax(0,1fr)_3.25rem] items-center gap-2 rounded-md py-1 pl-1 sm:grid-cols-[10.5rem_minmax(0,1fr)_3.25rem]"
              >
                <Link
                  href={playerHref({ playerId: r.id, season, view: "onoff" })}
                  data-viz-label
                  className={cn(type.bodySm, "truncate font-semibold text-muted-foreground hover:underline")}
                  title={r.name}
                >
                  {r.name}
                  {r.smallSample ? <span className="ml-1 text-[10px] font-normal">(small)</span> : null}
                </Link>
                <div className="relative h-6">
                  <span
                    data-viz-bar
                    data-motion-bar="x"
                    aria-hidden
                    className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
                    style={
                      {
                        left: `${left}%`,
                        width: `${right - left}%`,
                        background: tone,
                        transformOrigin: x(on) >= x(off) ? "left" : "right",
                        "--i": i,
                      } as CSSProperties
                    }
                  />
                  <span
                    data-viz-mark
                    data-motion-dot
                    data-tip={`${r.name} off the floor`}
                    data-tip-sub={`Team net ${signed(off)} per 100 · ORtg ${formatNumber(r.cmp.off.ortg ?? Number.NaN, 1)} · DRtg ${formatNumber(r.cmp.off.drtg ?? Number.NaN, 1)}`}
                    className="absolute top-1/2 h-3 w-3 rounded-full bg-background"
                    style={
                      {
                        left: `${x(off)}%`,
                        translate: "-50% -50%",
                        boxShadow: "inset 0 0 0 2px var(--foreground)",
                        "--i": i,
                      } as CSSProperties
                    }
                  />
                  <span
                    data-viz-mark
                    data-motion-dot
                    data-tip={`${r.name} on the floor`}
                    data-tip-sub={`Team net ${signed(on)} per 100 · ${formatNumber(r.poss, 0)} poss · swing ${signed(diff)}${range}`}
                    className="absolute top-1/2 h-3.5 w-3.5 rounded-full border-2 border-background bg-foreground"
                    style={{ left: `${x(on)}%`, translate: "-50% -50%", "--i": i + 2 } as CSSProperties}
                  />
                </div>
                <span className={cn(type.bodySm, "text-right font-bold tabular-nums")} style={{ color: tone }}>
                  {signed(diff)}
                </span>
              </div>
            );
          })}
        </div>
        <div className="relative ml-[8.5rem] mr-14 h-5 sm:ml-[11rem]">
          {ticks(lo, hi, 6).map((t) => (
            <span
              key={t}
              className={cn(type.micro, "absolute top-1 -translate-x-1/2 tabular-nums text-muted-foreground")}
              style={{ left: `${x(t)}%` }}
            >
              {t > 0 ? `+${t}` : t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Most-used five-man groups placed by points scored (right is better) and
 * points allowed (up is better), sized by possessions.
 */
export function LineupQuadrant({ lineups }: { lineups: LineupRow[] }) {
  const dots = lineups
    .filter((l) => finite(l.ratings.ortg) && finite(l.ratings.drtg) && l.poss > 0)
    .slice(0, LINEUP_DOTS);
  if (dots.length < 3) return null;
  const poss = dots.reduce((s, l) => s + l.poss, 0);
  const avgO = dots.reduce((s, l) => s + (l.ratings.ortg as number) * l.poss, 0) / poss;
  const avgD = dots.reduce((s, l) => s + (l.ratings.drtg as number) * l.poss, 0) / poss;
  const os = dots.map((l) => l.ratings.ortg as number);
  const ds = dots.map((l) => l.ratings.drtg as number);
  const xLo = Math.floor(Math.min(...os) / 5) * 5 - 5;
  const xHi = Math.ceil(Math.max(...os) / 5) * 5 + 5;
  const dLo = Math.floor(Math.min(...ds) / 5) * 5 - 5;
  const dHi = Math.ceil(Math.max(...ds) / 5) * 5 + 5;
  const x = (v: number) => ((v - xLo) / (xHi - xLo)) * 100;
  /** Low DRtg is good, so it sits at the top. */
  const y = (v: number) => ((dHi - v) / (dHi - dLo)) * 100;
  const maxPoss = Math.max(...dots.map((l) => l.poss));

  return (
    <div className="flex flex-col gap-2">
      <div className="relative ml-9 mr-2 mb-9 mt-4 h-[300px] sm:h-[340px]">
        <div
          aria-hidden
          className="absolute right-0 top-0 bg-[color-mix(in_oklab,var(--data-positive)_8%,transparent)]"
          style={{ left: `${x(avgO)}%`, bottom: `${y(avgD)}%` }}
        />
        <div
          aria-hidden
          className="absolute bottom-0 left-0 bg-[color-mix(in_oklab,var(--data-negative)_7%,transparent)]"
          style={{ right: `${100 - x(avgO)}%`, top: `${100 - y(avgD)}%` }}
        />
        <div aria-hidden className="absolute inset-y-0 border-l border-dashed border-foreground/30" style={{ left: `${x(avgO)}%` }} />
        <div aria-hidden className="absolute inset-x-0 border-t border-dashed border-foreground/30" style={{ bottom: `${y(avgD)}%` }} />
        <span className={cn(type.micro, "absolute right-1.5 top-1 font-semibold uppercase tracking-wide text-muted-foreground")}>
          Score and stop
        </span>
        <span className={cn(type.micro, "absolute bottom-1 left-1.5 font-semibold uppercase tracking-wide text-muted-foreground")}>
          Struggle both ends
        </span>
        <span className={cn(type.micro, "absolute left-1.5 top-1 font-semibold uppercase tracking-wide text-muted-foreground")}>
          Defense first
        </span>
        <span className={cn(type.micro, "absolute bottom-1 right-1.5 font-semibold uppercase tracking-wide text-muted-foreground")}>
          Offense first
        </span>
        {ticks(xLo, xHi, 5).map((t) => (
          <span key={`x${t}`} className={cn(type.micro, "absolute -bottom-5 -translate-x-1/2 tabular-nums text-muted-foreground")} style={{ left: `${x(t)}%` }}>
            {t}
          </span>
        ))}
        {ticks(dLo, dHi, 4).map((t) => (
          <span key={`y${t}`} className={cn(type.micro, "absolute -left-8 translate-y-1/2 tabular-nums text-muted-foreground")} style={{ bottom: `${100 - ((t - dLo) / (dHi - dLo)) * 100}%` }}>
            {t}
          </span>
        ))}
        <span className={cn(type.micro, "absolute -bottom-9 left-1/2 -translate-x-1/2 font-semibold uppercase tracking-wide text-muted-foreground")}>
          Points scored per 100 →
        </span>
        <span className={cn(type.micro, "absolute -left-9 -top-5 font-semibold uppercase tracking-wide text-muted-foreground")}>
          ↑ Fewer allowed
        </span>
        {[...dots]
          .sort((a, b) => b.poss - a.poss)
          .map((l, i) => {
            const net = l.ratings.net ?? (l.ratings.ortg as number) - (l.ratings.drtg as number);
            const s = 10 + 22 * Math.sqrt(l.poss / maxPoss);
            return (
              <span
                key={l.ids.join("-")}
                data-viz-mark
                data-motion-dot
                tabIndex={0}
                data-tip={l.names.map(lastName).join(" · ")}
                data-tip-sub={`Net ${signed(net)} · ORtg ${formatNumber(l.ratings.ortg as number, 1)} · DRtg ${formatNumber(l.ratings.drtg as number, 1)} · ${formatNumber(l.poss, 0)} poss`}
                className="absolute rounded-full border-2 border-background"
                style={
                  {
                    left: `${clamp(x(l.ratings.ortg as number), 0, 100)}%`,
                    bottom: `${clamp(y(l.ratings.drtg as number), 0, 100)}%`,
                    width: s,
                    height: s,
                    translate: "-50% 50%",
                    background: `color-mix(in oklab, ${net >= 0 ? WIN : LOSS} 80%, transparent)`,
                    zIndex: 2 + i,
                    "--i": i,
                  } as CSSProperties
                }
              />
            );
          })}
      </div>
      <p className={cn(type.caption, "text-muted-foreground")}>
        Dashed lines are the possession-weighted average of these {dots.length} groups. Bigger
        circles played more together. Lineup ratings swing a lot in small samples.
      </p>
    </div>
  );
}
