"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Maximize2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import { TeamLogo } from "@/components/brand/team-logo";
import {
  hoverLinkRowProps,
  useHoverLink,
  useHoverLinkTarget,
  useHoverStore,
  type HoverLink,
} from "@/components/charts/hover-layer";
import {
  chartSvg,
  linePath,
  plotBox,
  plotY,
  pointerSvgY,
  raceLineClass,
  RaceHoverLayer,
  sameRaceHover,
  type RaceHover,
} from "@/components/charts/race-hover-layer";
import { useChartTheme } from "@/lib/chart-theme";
import { type } from "@/lib/design-system";
import { formatUsdCompact } from "@/lib/format-money";
import { shortDate } from "@/lib/salary-payoff";
import { cn } from "@/lib/utils";

export type PayoffLine = {
  id: string;
  name: string;
  /** ESPN team id. */
  teamId: string;
  salary: number;
  /** Percent of salary covered, one per date. */
  pct: number[];
  /** Dollars of worth earned, one per date. */
  earned: number[];
  href: string | null;
  /** Pinned, highlighted, or the team total. */
  strong?: boolean;
};

export type PayoffRow = {
  id: string;
  rank: number;
  name: string;
  teamId: string;
  href: string | null;
  salary: number;
  earned: number;
  pct: number;
  paidOff: string | null;
  projected: number | null;
  strong?: boolean;
};

/** Lines above this run off the top so the rest of the field stays readable. */
const Y_CAP = 400;

function pctLabel(pct: number): string {
  return `${Math.round(pct).toLocaleString()}%`;
}

function lastPoint(d: string): { x: number; y: number } | null {
  const nums = d.match(/-?\d*\.?\d+(?:e-?\d+)?/gi);
  if (!nums || nums.length < 2) return null;
  return { x: Number(nums[nums.length - 2]), y: Number(nums[nums.length - 1]) };
}

function payoffTicks(yMax: number): number[] {
  const step = yMax > 1500 ? 500 : yMax > 600 ? 250 : yMax > 200 ? 100 : 50;
  return Array.from({ length: Math.floor(yMax / step) + 1 }, (_, i) => i * step);
}

function PayoffPlot({
  dates,
  pace,
  lines,
  colorById,
  totalId,
  hoverLink,
  cap,
  className,
}: {
  dates: string[];
  pace: number[];
  lines: PayoffLine[];
  colorById: Map<string, string>;
  totalId?: string;
  hoverLink?: HoverLink;
  /** Top of the y axis at most; null fits every line. */
  cap: number | null;
  className: string;
}) {
  const theme = useChartTheme();
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const hover = useHoverStore<RaceHover>(sameRaceHover);

  const rows = useMemo(
    () =>
      dates.map((date, i) => {
        const row: Record<string, number | string> = { i, date, pace: Math.round(pace[i] * 10) / 10 };
        for (const line of lines) row[line.id] = Math.round((line.pct[i] ?? 0) * 10) / 10;
        return row;
      }),
    [dates, lines, pace]
  );

  const peak = Math.max(110, ...lines.map((l) => Math.max(...l.pct)));
  const step = payoffTicks(Math.ceil(peak / 50) * 50)[1] ?? 50;
  const yMax = Math.min(cap ?? Infinity, Math.ceil(peak / step) * step);
  const domain: [number, number] = [0, yMax];
  const ticks = payoffTicks(yMax);
  const lineById = useMemo(() => new Map(lines.map((l) => [l.id, l])), [lines]);
  const anyStrong = lines.some((l) => l.strong && l.id !== totalId);

  const hoverAt = (id: string, i: number, at: { x: number; y?: number } | null): RaceHover | null => {
    const root = rootRef.current;
    const svg = chartSvg(root);
    const plot = svg ? plotBox(svg) : null;
    const line = lineById.get(id);
    if (!root || !svg || !plot || !line) return null;
    const previous = hover.get();
    const d = previous?.id === id ? previous.d : linePath(svg, id);
    const end = at ?? (d ? lastPoint(d) : null);
    if (!end) return null;
    return {
      key: `${id}|${i}`,
      id,
      label: String(i),
      x: end.x,
      y: end.y ?? plotY(plot, domain, Math.min(line.pct[i] ?? 0, yMax)),
      width: root.clientWidth,
      height: root.clientHeight,
      color: colorById.get(id) ?? "var(--foreground)",
      d,
      plot,
      guides: [],
    };
  };

  useHoverLinkTarget(hoverLink, {
    show(id) {
      hover.set(hoverAt(id, dates.length - 1, null));
    },
    clear: () => hover.set(null),
  });

  return (
    <div ref={rootRef} className={cn("relative w-full", className)}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows}
            margin={{ top: 10, right: 12, bottom: 4, left: 0 }}
            style={{ cursor: "pointer" }}
            onMouseMove={(state, event) => {
              const i = state.activeLabel != null ? Number(state.activeLabel) : Number.NaN;
              const x = state.activeCoordinate?.x;
              const svg = chartSvg(rootRef.current);
              const plot = svg ? plotBox(svg) : null;
              const pointerY = svg ? pointerSvgY(svg, event.clientX, event.clientY) : null;
              if (!Number.isInteger(i) || x == null || !plot || pointerY == null) {
                hover.set(null);
                return;
              }
              let best: string | null = null;
              let bestGap = Infinity;
              for (const line of lines) {
                const gap = Math.abs(plotY(plot, domain, Math.min(line.pct[i] ?? 0, yMax)) - pointerY);
                if (gap < bestGap) {
                  bestGap = gap;
                  best = line.id;
                }
              }
              hover.set(best ? hoverAt(best, i, { x }) : null);
            }}
            onClick={() => {
              const href = lineById.get(hover.get()?.id ?? "")?.href;
              if (href) router.push(href);
            }}
            onMouseLeave={() => hover.set(null)}
          >
            <CartesianGrid strokeDasharray="3 6" vertical={false} className="stroke-border/50" />
            <XAxis
              dataKey="i"
              tickFormatter={(i: number) => (dates[i] ? shortDate(dates[i]) : "")}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              minTickGap={36}
            />
            <YAxis
              domain={domain}
              ticks={ticks}
              allowDataOverflow
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <ReferenceLine
              y={100}
              stroke="var(--foreground)"
              strokeOpacity={theme.referenceOpacity()}
              strokeDasharray="4 4"
              label={{ value: "Salary covered", position: "insideTopLeft", fill: "var(--muted-foreground)", fontSize: 10 }}
            />
            <Line
              dataKey="pace"
              stroke="var(--muted-foreground)"
              strokeWidth={1.5}
              strokeDasharray="2 5"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
            {lines.map((line) => {
              const total = line.id === totalId;
              return (
                <Line
                  key={line.id}
                  className={raceLineClass(line.id)}
                  type="monotone"
                  dataKey={line.id}
                  stroke={colorById.get(line.id)}
                  strokeWidth={total ? 3 : line.strong ? 2.25 : 1.3}
                  strokeOpacity={theme.lineOpacity(
                    total || line.strong ? "selected" : anyStrong ? "muted" : "default"
                  )}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
        <RaceHoverLayer
          store={hover}
          render={(h) => {
            const line = lineById.get(h.id);
            const i = Number(h.label);
            if (!line || !dates[i]) return null;
            const coveredOn = dates[line.pct.findIndex((p) => p >= 100)];
            return (
              <>
                <p className="flex items-center gap-1.5">
                  {line.id !== totalId ? <TeamLogo teamKey={line.teamId} size="xs" /> : null}
                  {line.name}
                </p>
                {(line.pct[i] ?? 0) >= 100 ? (
                  <>
                    <p className="tabular-nums">
                      {shortDate(dates[i])} · <span className="font-semibold">100% paid off</span>
                      {coveredOn ? ` on ${shortDate(coveredOn)}` : ""}
                    </p>
                    <p className="tabular-nums">
                      <span className="font-semibold">+{pctLabel((line.pct[i] ?? 0) - 100)}</span> over ·{" "}
                      {formatUsdCompact((line.earned[i] ?? 0) - line.salary)} beyond the {formatUsdCompact(line.salary)} salary
                    </p>
                    <p className="tabular-nums text-muted-foreground">
                      {formatUsdCompact(line.earned[i] ?? 0)} earned · season {pctLabel(pace[i] ?? 0)} paid
                    </p>
                  </>
                ) : (
                  <>
                    <p className="tabular-nums">
                      {shortDate(dates[i])} · <span className="font-semibold">{pctLabel(line.pct[i] ?? 0)}</span> of{" "}
                      {formatUsdCompact(line.salary)}
                    </p>
                    <p className="tabular-nums text-muted-foreground">
                      {formatUsdCompact(line.earned[i] ?? 0)} earned · season {pctLabel(pace[i] ?? 0)} paid
                    </p>
                  </>
                )}
                {line.href ? <p className="text-muted-foreground">Click to open</p> : null}
              </>
            );
          }}
        />
    </div>
  );
}

export function SalaryPayoffChart({
  dates,
  pace,
  lines,
  colors = "league",
  totalId,
  hoverLink,
  title,
  className,
}: {
  dates: string[];
  pace: number[];
  lines: PayoffLine[];
  /** `team` gives one franchise's lines separable shades of its color. */
  colors?: "league" | "team";
  /** A line drawn as the team total: thicker and in the ink color. */
  totalId?: string;
  hoverLink?: HoverLink;
  /** Heading for the full-screen view. */
  title: string;
  className?: string;
}) {
  const theme = useChartTheme();
  const [full, setFull] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const colorById = useMemo(() => {
    const out = new Map<string, string>();
    const palette = colors === "team" && lines[0] ? theme.teamPalette(lines[0].teamId, Math.max(lines.length, 2)) : null;
    lines.forEach((line, i) => {
      out.set(
        line.id,
        line.id === totalId ? "var(--foreground)" : palette ? palette[i % palette.length] : theme.leagueTeamColor(line.teamId).color
      );
    });
    return out;
  }, [colors, lines, theme, totalId]);

  useEffect(() => {
    if (!full) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFull(false);
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [full]);

  if (!dates.length || !lines.length) return null;
  const clipped = lines.some((l) => l.pct.some((p) => p > Y_CAP));
  const plot = { dates, pace, lines, colorById, totalId };

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <PayoffPlot {...plot} hoverLink={hoverLink} cap={Y_CAP} className="h-[min(360px,62vw)] min-h-[240px]" />
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className={cn(type.caption, "text-muted-foreground")}>
          The dotted line is the share of the season&apos;s salary paid out so far.
          {clipped ? ` Lines above ${Y_CAP}% run off the top here; full screen fits every line.` : ""}
        </p>
        <button
          type="button"
          onClick={() => setFull(true)}
          className={cn(type.caption, "inline-flex items-center gap-1 font-semibold text-muted-foreground hover:text-foreground")}
        >
          <Maximize2 aria-hidden className="size-3.5" />
          Full screen
        </button>
      </div>
      {full
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={title}
              className="fixed inset-0 z-[100] flex flex-col gap-3 bg-background p-4 sm:p-6"
            >
              <div className="flex items-center justify-between gap-4">
                <h2 className={type.heading}>{title}</h2>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={() => setFull(false)}
                  className={cn(type.caption, "glass-pill inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-semibold")}
                >
                  <X aria-hidden className="size-3.5" />
                  Close
                </button>
              </div>
              <PayoffPlot {...plot} cap={null} className="min-h-0 flex-1" />
              <p className={cn(type.caption, "text-muted-foreground")}>
                The dotted line is the share of the season&apos;s salary paid out so far. Press Esc to close.
              </p>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

/** Chart with a ranked list beside it; hovering a row lights its line. */
export function SalaryPayoffPanel({
  dates,
  pace,
  lines,
  rows,
  colors,
  totalId,
  title,
  listLabel,
}: {
  dates: string[];
  pace: number[];
  lines: PayoffLine[];
  rows: PayoffRow[];
  colors?: "league" | "team";
  totalId?: string;
  /** Heading for the full-screen view. */
  title: string;
  listLabel: string;
}) {
  const hoverLink = useHoverLink();
  const pacePct = pace.at(-1) ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <SalaryPayoffChart
        dates={dates}
        pace={pace}
        lines={lines}
        colors={colors}
        totalId={totalId}
        hoverLink={hoverLink}
        title={title}
      />
      <PayoffList rows={rows} pacePct={pacePct} hoverLink={hoverLink} label={listLabel} />
    </div>
  );
}

const ROW =
  "grid grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,6rem)_3.5rem] items-center gap-2 sm:grid-cols-[2rem_minmax(0,12rem)_minmax(0,1fr)_4rem_8rem_6.5rem]";

/** Bar track runs to this percent; past it the bar is full and the number tells the rest. */
const TRACK_MAX = 200;

function PayoffList({
  rows,
  pacePct,
  hoverLink,
  label,
}: {
  rows: PayoffRow[];
  pacePct: number;
  hoverLink: HoverLink;
  label: string;
}) {
  const at = (pct: number) => `${(Math.min(pct, TRACK_MAX) / TRACK_MAX) * 100}%`;
  return (
    <div className="flex flex-col gap-1">
      <div
        aria-hidden
        className={cn(ROW, type.micro, "hidden font-semibold uppercase tracking-wide text-muted-foreground sm:grid")}
      >
        <span>#</span>
        <span>Player</span>
        <span />
        <span className="text-right">Covered</span>
        <span className="text-right">Earned</span>
        <span className="text-right">Paid off</span>
      </div>
      <ol className="flex flex-col" aria-label={label}>
        {rows.map((r, i) => (
          <li
            key={r.id}
            {...hoverLinkRowProps(hoverLink, r.id)}
            data-hover-item
            className={cn(
              ROW,
              "rounded-md border-t border-border/40 px-1 py-1.5 transition-colors first:border-t-0 hover:bg-secondary/60",
              r.strong && "bg-secondary hover:bg-secondary"
            )}
          >
            <span className={cn(type.caption, "tabular-nums text-muted-foreground")}>{r.rank}</span>
            <span className="flex min-w-0 items-center gap-1.5">
              <TeamLogo teamKey={r.teamId} size="xs" />
              {r.href ? (
                <Link href={r.href} className={cn(type.bodySm, "truncate font-semibold underline-offset-2 hover:underline")}>
                  {r.name}
                </Link>
              ) : (
                <span className={cn(type.bodySm, "truncate font-semibold")}>{r.name}</span>
              )}
            </span>
            <span className="relative h-3 rounded-sm bg-muted/70">
              <span
                aria-hidden
                data-motion-bar="x"
                className="absolute inset-y-0 left-0 rounded-sm"
                style={{
                  ...({ "--i": Math.min(i, 16) } as CSSProperties),
                  width: at(r.pct),
                  background: r.pct >= 100 ? "var(--chart-3)" : r.pct >= pacePct ? "var(--chart-2)" : "var(--destructive)",
                }}
              />
              <span aria-hidden className="absolute inset-y-[-2px] w-px bg-foreground/50" style={{ left: at(100) }} />
              {pacePct < 100 ? (
                <span
                  aria-hidden
                  className="absolute inset-y-[-2px] w-px border-l border-dashed border-foreground/50"
                  style={{ left: at(pacePct) }}
                />
              ) : null}
            </span>
            <span className={cn(type.bodySm, "text-right font-semibold tabular-nums")}>{pctLabel(r.pct)}</span>
            <span className={cn(type.caption, "hidden whitespace-nowrap text-right tabular-nums text-muted-foreground sm:block")}>
              {formatUsdCompact(r.earned)} / {formatUsdCompact(r.salary)}
            </span>
            <span className={cn(type.caption, "hidden text-right tabular-nums text-muted-foreground sm:block")}>
              {r.paidOff
                ? shortDate(r.paidOff)
                : r.projected != null
                  ? `On pace for ${pctLabel(r.projected)}`
                  : "Not yet"}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
