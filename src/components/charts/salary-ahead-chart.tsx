"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { TeamLogo } from "@/components/brand/team-logo";
import { formatUsdCompact, formatUsdSignedCompact } from "@/lib/format-money";
import { shortDate } from "@/lib/salary-payoff";
import { cn } from "@/lib/utils";

const POSITIVE = "var(--chart-3)";
const NEGATIVE = "var(--destructive)";

export type AheadLine = {
  id: string;
  name: string;
  teamId: string;
  href: string | null;
  salary: number;
  /** Worth so far minus salary paid so far, dollars, one per date. */
  ahead: number[];
};

function niceStep(range: number, target: number): number {
  const raw = range / target;
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  return ([1, 2, 2.5, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow;
}

function yScale(values: number[], ticksWanted = 5) {
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const step = niceStep(hi - lo || 1e6, ticksWanted);
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Math.round(v));
  return { min, max: max === min ? min + step : max, ticks };
}

function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function lastName(name: string): string {
  const parts = name.split(" ");
  const tail = parts.at(-1) ?? name;
  return /^(Jr\.?|Sr\.?|II|III|IV)$/.test(tail) && parts.length > 2 ? parts.at(-2)! : tail;
}

function toneOf(value: number): string {
  return value >= 0 ? POSITIVE : NEGATIVE;
}

/** Labels at the right edge, nudged apart so none overlap. */
function spreadLabels(ys: number[], gap: number, top: number, bottom: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const out = new Array<number>(ys.length);
  let prev = -Infinity;
  for (const item of order) {
    const y = Math.max(item.y, prev + gap, top);
    out[item.i] = y;
    prev = y;
  }
  let next = Infinity;
  for (let k = order.length - 1; k >= 0; k--) {
    const i = order[k].i;
    out[i] = Math.min(out[i], next - gap, bottom);
    next = out[i];
  }
  return out;
}

/** Every line on one chart around a zero line, named at the right edge. */
export function AheadRace({
  dates,
  lines,
  totalId,
  height = 380,
}: {
  dates: string[];
  lines: AheadLine[];
  totalId?: string;
  height?: number;
}) {
  const router = useRouter();
  const [ref, width] = useWidth<HTMLDivElement>(720);
  const [hover, setHover] = useState<{ id: string; i: number } | null>(null);
  const narrow = width < 560;
  const m = { l: 60, r: narrow ? 92 : 150, t: 12, b: 26 };
  const innerW = Math.max(40, width - m.l - m.r);
  const innerH = height - m.t - m.b;
  const n = dates.length;
  const scale = useMemo(() => yScale(lines.flatMap((l) => l.ahead)), [lines]);
  const x = (i: number) => m.l + (n > 1 ? (i / (n - 1)) * innerW : 0);
  const y = (v: number) => m.t + ((scale.max - v) / (scale.max - scale.min)) * innerH;
  const path = (values: number[]) => values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");

  const ends = lines.map((l) => y(l.ahead.at(-1) ?? 0));
  const labelYs = spreadLabels(ends, 13, m.t + 4, height - m.b);
  const tickCount = Math.min(narrow ? 3 : 6, n);
  const xTicks = Array.from({ length: tickCount }, (_, k) => Math.round((k * (n - 1)) / Math.max(1, tickCount - 1)));
  const hovered = hover ? lines.find((l) => l.id === hover.id) : null;

  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - box.left;
    const py = event.clientY - box.top;
    if (px < m.l || px > m.l + innerW + 4) {
      setHover(null);
      return;
    }
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / innerW) * (n - 1))));
    let best: AheadLine | null = null;
    let gap = Infinity;
    for (const line of lines) {
      const d = Math.abs(y(line.ahead[i] ?? 0) - py);
      if (d < gap) {
        gap = d;
        best = line;
      }
    }
    setHover(best ? { id: best.id, i } : null);
  };

  return (
    <div ref={ref} className="relative w-full">
      <svg
        width={width}
        height={height}
        className="block select-none"
        role="img"
        aria-label="Each player's worth so far minus salary paid so far"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onClick={() => {
          if (hovered?.href) router.push(hovered.href);
        }}
        style={{ cursor: hovered?.href ? "pointer" : "default" }}
      >
        <rect x={m.l} y={m.t} width={innerW} height={Math.max(0, y(0) - m.t)} fill={POSITIVE} fillOpacity={0.05} />
        <rect x={m.l} y={y(0)} width={innerW} height={Math.max(0, height - m.b - y(0))} fill={NEGATIVE} fillOpacity={0.05} />
        {scale.ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={m.l + innerW} y1={y(t)} y2={y(t)} className="stroke-border/60" strokeDasharray={t === 0 ? undefined : "3 6"} />
            <text x={m.l - 6} y={y(t) + 3.5} textAnchor="end" className="fill-muted-foreground text-[10.5px] tabular-nums">
              {t === 0 ? "Even" : formatUsdSignedCompact(t)}
            </text>
          </g>
        ))}
        <line x1={m.l} x2={m.l + innerW} y1={y(0)} y2={y(0)} stroke="var(--foreground)" strokeOpacity={0.55} strokeWidth={1.25} />
        {xTicks.map((i) => (
          <text key={i} x={x(i)} y={height - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="fill-muted-foreground text-[10.5px]">
            {shortDate(dates[i])}
          </text>
        ))}
        {hover ? <line x1={x(hover.i)} x2={x(hover.i)} y1={m.t} y2={height - m.b} stroke="var(--foreground)" strokeOpacity={0.25} /> : null}
        {lines.map((line) => {
          const total = line.id === totalId;
          const active = hover?.id === line.id;
          return (
            <path
              key={line.id}
              d={path(line.ahead)}
              fill="none"
              stroke={total ? "var(--foreground)" : toneOf(line.ahead.at(-1) ?? 0)}
              strokeOpacity={total ? 0.9 : 0.8}
              strokeWidth={total ? 3 : active ? 2.75 : 1.4}
              strokeLinejoin="round"
            />
          );
        })}
        {lines.map((line, k) => {
          const total = line.id === totalId;
          const end = line.ahead.at(-1) ?? 0;
          const ly = labelYs[k];
          const active = hover?.id === line.id;
          return (
            <g key={`label-${line.id}`} onPointerEnter={() => setHover({ id: line.id, i: n - 1 })}>
              <line x1={m.l + innerW + 2} x2={m.l + innerW + 8} y1={ends[k]} y2={ly} stroke="var(--muted-foreground)" strokeOpacity={0.5} />
              <text
                x={m.l + innerW + 10}
                y={ly + 3.5}
                className={cn("text-[10.5px] tabular-nums", active || total ? "font-bold" : "font-medium")}
                fill={total ? "var(--foreground)" : toneOf(end)}
              >
                {narrow ? (total ? "Roster" : lastName(line.name)) : `${total ? "Roster" : lastName(line.name)} ${formatUsdSignedCompact(end)}`}
              </text>
            </g>
          );
        })}
        {hovered && hover ? (
          <circle cx={x(hover.i)} cy={y(hovered.ahead[hover.i] ?? 0)} r={4} fill={hovered.id === totalId ? "var(--foreground)" : toneOf(hovered.ahead[hover.i] ?? 0)} stroke="var(--background)" strokeWidth={1.5} />
        ) : null}
      </svg>
      {hovered && hover ? (
        <div
          className="glass-pill pointer-events-none absolute z-10 flex flex-col gap-0.5 rounded-md px-2.5 py-1.5 text-[12px] shadow-md"
          style={{
            left: Math.min(x(hover.i) + 12, width - 200),
            top: Math.max(0, Math.min(y(hovered.ahead[hover.i] ?? 0) - 30, height - 80)),
          }}
        >
          <p className="flex items-center gap-1.5 font-semibold">
            {hovered.id !== totalId ? <TeamLogo teamKey={hovered.teamId} size="xs" /> : null}
            {hovered.name}
          </p>
          <p className="tabular-nums">
            {shortDate(dates[hover.i])} ·{" "}
            <span className="font-semibold" style={{ color: hovered.id === totalId ? undefined : toneOf(hovered.ahead[hover.i] ?? 0) }}>
              {formatUsdSignedCompact(hovered.ahead[hover.i] ?? 0)}
            </span>{" "}
            {(hovered.ahead[hover.i] ?? 0) >= 0 ? "ahead" : "behind"}
          </p>
          <p className="tabular-nums text-muted-foreground">{formatUsdCompact(hovered.salary)} salary</p>
          {hovered.href ? <p className="text-muted-foreground">Click to open</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Team view: every player plus the roster total. */
export function TeamAheadView({
  dates,
  players,
  total,
  totalId,
}: {
  dates: string[];
  players: AheadLine[];
  total: AheadLine;
  totalId: string;
}) {
  return <AheadRace dates={dates} lines={[...players, total]} totalId={totalId} />;
}

/** Switch between two server-rendered views of the same lines. */
export function PayoffViewToggle({ views }: { views: Array<{ id: string; label: string; node: ReactNode }> }) {
  const [active, setActive] = useState(views[0]?.id);
  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Payoff view" className="inline-flex w-fit gap-1 rounded-lg bg-secondary p-1">
        {views.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={active === v.id}
            onClick={() => setActive(v.id)}
            className={cn(
              "rounded-md px-3 py-1 text-[13px] font-semibold",
              active === v.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {v.label}
          </button>
        ))}
      </div>
      {views.map((v) => (
        <div key={v.id} hidden={active !== v.id}>
          {v.node}
        </div>
      ))}
    </div>
  );
}
