"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type PointerEvent } from "react";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import type { UsagePoint } from "@/lib/season-glance";
import { ChartTooltipSurface } from "@/components/charts/chart-tooltip";
import { cn } from "@/lib/utils";

const W = 360;
const H = 270;
const L = 34;
const R = 10;
const T = 10;
const B = H - 24;
const ABOVE = "#2f64d6";
const BELOW = "#e4553f";
const HIT_RADIUS = 18;
/** Usage averages 20% by construction: five players share 100% of a team's plays. */
const AVERAGE_USAGE = 20;
const CARD_W = 208;

function pct(v: number, digits = 0): string {
  return `${(v * 100).toFixed(digits)}%`;
}

function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(" ") : name;
}

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

function ticks(lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
    out.push(Number(v.toFixed(4)));
  }
  return out;
}

function pointKey(p: UsagePoint): string {
  return `${p.playerId ?? p.name}-${p.team}`;
}

type Hover = { index: number; px: number; py: number; w: number; h: number; touch: boolean };

export function UsageEfficiencyChart({
  points,
  leagueTs,
}: {
  points: UsagePoint[];
  leagueTs: number | null;
}) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const openOnClick = useRef(false);

  const scale = useMemo(() => {
    const usg = points.map((p) => p.usg);
    const ts = points.map((p) => p.ts);
    const xLo = Math.floor(Math.min(...usg)) - 1;
    const xHi = Math.ceil(Math.max(...usg)) + 1;
    const yLo = Math.min(...ts) - 0.01;
    const yHi = Math.max(...ts) + 0.01;
    const minMin = Math.min(...points.map((p) => p.minutes));
    const maxMin = Math.max(...points.map((p) => p.minutes));
    return {
      xLo,
      xHi,
      yLo,
      yHi,
      x: (v: number) => L + ((v - xLo) / (xHi - xLo)) * (W - L - R),
      y: (v: number) => T + ((yHi - v) / (yHi - yLo)) * (B - T),
      r: (m: number) => 2.4 + (maxMin > minMin ? ((m - minMin) / (maxMin - minMin)) * 2.2 : 1),
    };
  }, [points]);
  const { x, y, r, xLo, xHi, yLo, yHi } = scale;

  const ranks = useMemo(() => {
    const byUsg = [...points].sort((a, b) => b.usg - a.usg).map(pointKey);
    const byTs = [...points].sort((a, b) => b.ts - a.ts).map(pointKey);
    return new Map(
      points.map((p) => [
        pointKey(p),
        { usg: byUsg.indexOf(pointKey(p)) + 1, ts: byTs.indexOf(pointKey(p)) + 1 },
      ])
    );
  }, [points]);

  const labeled = points.filter((p) => p.labeled);
  // Overlapping labels step down one line; widths are estimated at 6.5px a character.
  const labelPos = useMemo(() => {
    const placed: { x0: number; x1: number; y: number }[] = [];
    const out = new Map<string, { x: number; y: number; end: boolean }>();
    for (const p of [...points.filter((q) => q.labeled)].sort((a, b) => y(a.ts) - y(b.ts))) {
      const end = x(p.usg) > W - 80;
      const lx = end ? x(p.usg) - 8 : x(p.usg) + 8;
      const width = lastName(p.name).length * 6.5;
      const x0 = end ? lx - width : lx;
      const x1 = end ? lx : lx + width;
      let ly = y(p.ts) + 4;
      for (const q of placed) {
        if (x0 < q.x1 && x1 > q.x0 && Math.abs(q.y - ly) < 12) ly = q.y + 12;
      }
      placed.push({ x0, x1, y: ly });
      out.set(pointKey(p), { x: lx, y: ly, end });
    }
    return out;
  }, [points, x, y]);

  const xTicks = ticks(xLo, xHi, 5).filter((v) => v > xLo && v < xHi);
  const yTicks = ticks(yLo, yHi, 0.05).filter((v) => v > yLo && v < yHi);
  const showLeague = leagueTs != null && leagueTs > yLo && leagueTs < yHi;
  const showAvgUsage = AVERAGE_USAGE > xLo && AVERAGE_USAGE < xHi;

  const locate = (e: PointerEvent<HTMLDivElement>): number => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return -1;
    const sx = ((e.clientX - box.left) / box.width) * W;
    const sy = ((e.clientY - box.top) / box.height) * H;
    let best = -1;
    let bestDist = HIT_RADIUS * HIT_RADIUS;
    points.forEach((p, i) => {
      const d = (x(p.usg) - sx) ** 2 + (y(p.ts) - sy) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    if (best < 0) {
      setHover(null);
      return -1;
    }
    const p = points[best]!;
    setHover({
      index: best,
      px: (x(p.usg) / W) * box.width,
      py: (y(p.ts) / H) * box.height,
      w: box.width,
      h: box.height,
      touch: e.pointerType !== "mouse",
    });
    return best;
  };

  const active = hover ? points[hover.index] ?? null : null;
  const activeRank = active ? ranks.get(pointKey(active)) : undefined;
  const tsDiff = active && leagueTs != null ? (active.ts - leagueTs) * 100 : null;
  const cardW = hover ? Math.min(CARD_W, hover.w) : CARD_W;
  const cardLeft = hover
    ? Math.min(Math.max(hover.px - cardW / 2, 0), hover.w - cardW)
    : 0;
  const cardBelow = hover ? hover.py < hover.h * 0.45 : true;
  const combined = active ? /^\d+TM$|^TOT$/.test(active.team) : false;
  const logoTeam = active
    ? combined
      ? active.stints?.[active.stints.length - 1] ?? null
      : active.team
    : null;

  return (
    <div
      ref={wrapRef}
      className={cn("relative touch-pan-y select-none", active?.playerId && "cursor-pointer")}
      onPointerMove={(e) => {
        if (e.pointerType === "mouse") locate(e);
      }}
      onPointerDown={(e) => {
        const before = hover?.index ?? -1;
        const index = locate(e);
        // Touch shows the card first; a second tap on the same dot opens the page.
        openOnClick.current = index >= 0 && (e.pointerType === "mouse" || index === before);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") setHover(null);
      }}
      onClick={() => {
        if (openOnClick.current && active?.playerId) {
          router.push(`/players/${encodeURIComponent(active.playerId)}`);
        }
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label={`Usage rate against true shooting for ${points.length} players. Labeled: ${labeled
          .map((p) => `${p.name} ${p.usg.toFixed(1)}% usage, ${pct(p.ts, 1)} TS`)
          .join("; ")}.`}
      >
        {showLeague && showAvgUsage ? (
          <rect
            x={x(AVERAGE_USAGE)}
            y={T}
            width={W - R - x(AVERAGE_USAGE)}
            height={y(leagueTs!) - T}
            fill={ABOVE}
            fillOpacity={0.05}
          />
        ) : null}
        {xTicks.map((v) => (
          <g key={`x${v}`}>
            <line x1={x(v)} x2={x(v)} y1={T} y2={B} stroke="var(--foreground)" strokeOpacity={0.05} />
            <text x={x(v)} y={B + 12} textAnchor="middle" className="fill-muted-foreground text-[9px] tabular-nums">
              {v}%
            </text>
          </g>
        ))}
        {yTicks.map((v) => (
          <g key={`y${v}`}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--foreground)" strokeOpacity={0.05} />
            <text x={L - 4} y={y(v) + 3} textAnchor="end" className="fill-muted-foreground text-[9px] tabular-nums">
              {pct(v)}
            </text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={B} y2={B} stroke="var(--border)" />
        <line x1={L} x2={L} y1={T} y2={B} stroke="var(--border)" />
        {showAvgUsage ? (
          <line
            x1={x(AVERAGE_USAGE)}
            x2={x(AVERAGE_USAGE)}
            y1={T}
            y2={B}
            stroke="var(--foreground)"
            strokeOpacity={0.2}
            strokeDasharray="2 3"
          />
        ) : null}
        {showLeague ? (
          <g>
            <line x1={L} x2={W - R} y1={y(leagueTs!)} y2={y(leagueTs!)} stroke="var(--foreground)" strokeOpacity={0.3} strokeDasharray="3 3" />
            <text x={W - R - 2} y={y(leagueTs!) - 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
              League avg {pct(leagueTs!, 1)}
            </text>
          </g>
        ) : null}
        {showLeague && showAvgUsage ? (
          <text x={W - R - 4} y={T + 11} textAnchor="end" className="text-[10px] font-semibold" fill={ABOVE} fillOpacity={0.85}>
            Heavy load, efficient
          </text>
        ) : null}
        <g>
          {points
            .filter((p) => !p.labeled)
            .map((p) => {
              const above = leagueTs == null || p.ts >= leagueTs;
              return (
                <circle
                  key={pointKey(p)}
                  cx={x(p.usg)}
                  cy={y(p.ts)}
                  r={r(p.minutes)}
                  fill={above ? ABOVE : BELOW}
                  fillOpacity={active ? 0.14 : 0.32}
                  className="transition-[fill-opacity] duration-150"
                />
              );
            })}
        </g>
        {labeled.map((p) => {
          const pos = labelPos.get(pointKey(p))!;
          const above = leagueTs == null || p.ts >= leagueTs;
          return (
            <g key={pointKey(p)} opacity={active && active !== p ? 0.45 : 1} className="transition-opacity duration-150">
              <circle cx={x(p.usg)} cy={y(p.ts)} r={4.5} fill="var(--card)" stroke={above ? ABOVE : BELOW} strokeWidth={2.25} />
              <text
                x={pos.x}
                y={pos.y}
                textAnchor={pos.end ? "end" : "start"}
                className="fill-foreground text-[11px] font-semibold"
                paintOrder="stroke"
                stroke="var(--card)"
                strokeWidth={3}
              >
                {lastName(p.name)}
              </text>
            </g>
          );
        })}
        {active ? (
          <g pointerEvents="none">
            <line x1={L} x2={x(active.usg)} y1={y(active.ts)} y2={y(active.ts)} stroke="var(--foreground)" strokeOpacity={0.35} strokeDasharray="2 2" />
            <line x1={x(active.usg)} x2={x(active.usg)} y1={y(active.ts)} y2={B} stroke="var(--foreground)" strokeOpacity={0.35} strokeDasharray="2 2" />
            <circle cx={x(active.usg)} cy={y(active.ts)} r={9} fill={leagueTs == null || active.ts >= leagueTs ? ABOVE : BELOW} fillOpacity={0.18} />
            <circle cx={x(active.usg)} cy={y(active.ts)} r={5} fill="var(--card)" stroke="var(--foreground)" strokeWidth={2.25} />
            <g transform={`translate(${x(active.usg)}, ${B})`}>
              <rect x={-19} y={1} width={38} height={14} rx={4} fill="var(--foreground)" />
              <text y={11} textAnchor="middle" className="fill-background text-[9px] font-bold tabular-nums">
                {active.usg.toFixed(1)}%
              </text>
            </g>
            <g transform={`translate(${L}, ${y(active.ts)})`}>
              <rect x={-33} y={-7} width={33} height={14} rx={4} fill="var(--foreground)" />
              <text x={-16.5} y={3} textAnchor="middle" className="fill-background text-[9px] font-bold tabular-nums">
                {pct(active.ts, 1)}
              </text>
            </g>
          </g>
        ) : null}
        <text x={(L + W - R) / 2} y={H - 1} textAnchor="middle" className="fill-muted-foreground text-[10px] font-semibold">
          Usage rate
        </text>
        <text
          transform={`translate(9, ${(T + B) / 2}) rotate(-90)`}
          textAnchor="middle"
          className="fill-muted-foreground text-[10px] font-semibold"
        >
          True shooting
        </text>
      </svg>

      {active && hover ? (
        <ChartTooltipSurface
          className="pointer-events-none absolute z-10"
          style={{
            width: cardW,
            left: cardLeft,
            ...(cardBelow ? { top: hover.py + 16 } : { bottom: hover.h - hover.py + 16 }),
          }}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <PlayerHeadshot
              playerId={active.playerId}
              espnId={active.playerId}
              name={active.name}
              teamKey={logoTeam}
              size="xs"
            />
            <span className="truncate">{active.name}</span>
          </div>
          <p className="flex items-center gap-1 text-muted-foreground">
            {logoTeam ? <TeamLogo teamKey={logoTeam} size="xs" className="!h-3.5 !w-3.5" /> : null}
            {combined && active.stints?.length ? active.stints.join(" → ") : active.team}
            {active.games != null ? ` · ${active.games} games` : null}
          </p>
          <p className="tabular-nums">
            Usage {active.usg.toFixed(1)}%
            {activeRank ? (
              <span className="text-muted-foreground"> · {ordinal(activeRank.usg)} of {points.length}</span>
            ) : null}
          </p>
          <p className="tabular-nums">
            TS {pct(active.ts, 1)}
            {tsDiff != null ? (
              <span
                className={cn(
                  "font-semibold",
                  tsDiff >= 0 ? "text-[#2f64d6] dark:text-[#7ea2ff]" : "text-[#c2410c] dark:text-[#fb923c]"
                )}
              >
                {" · "}
                {tsDiff >= 0 ? "+" : "−"}
                {Math.abs(tsDiff).toFixed(1)} vs league
              </span>
            ) : activeRank ? (
              <span className="text-muted-foreground"> · {ordinal(activeRank.ts)} of {points.length}</span>
            ) : null}
          </p>
          <p className="tabular-nums text-muted-foreground">
            {active.minutes.toLocaleString()} min · BPM{" "}
            {active.bpm == null
              ? "—"
              : `${active.bpm > 0 ? "+" : active.bpm < 0 ? "−" : ""}${Math.abs(active.bpm).toFixed(1)}`}
            {" · "}AST% {active.astPct == null ? "—" : active.astPct.toFixed(1)}
            {" · "}TOV% {active.tovPct == null ? "—" : active.tovPct.toFixed(1)}
          </p>
          {active.playerId ? (
            <p className="text-muted-foreground">
              {hover.touch ? "Tap again for the player page →" : "Open the player page →"}
            </p>
          ) : null}
        </ChartTooltipSurface>
      ) : null}
    </div>
  );
}
