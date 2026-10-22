"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CartesianGrid,
  ComposedChart,
  Curve,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  FrostRechartsTooltip,
  rechartsFrostWrapperStyle,
} from "@/components/brand/frost-recharts-tooltip";
import { TeamLogo } from "@/components/brand/team-logo";
import { useCareerChartReveal } from "@/components/players/career-chart-filter-wipe";
import { type } from "@/lib/design-system";
import { useChartTheme } from "@/lib/chart-theme";
import { distinctTeamColors, midpointChartColor } from "@/lib/nba-brand";
import { formatNumber } from "@/lib/format";
import { percentileSavantColor } from "@/lib/player-grade";
import { cn } from "@/lib/utils";

/** Compact axis/tooltip labels — avoid raw float dumps like 8.012345678. */
function formatCareerChartNumber(value: number): string {
  if (!Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  if (abs >= 100 || Math.abs(value - Math.round(value)) < 1e-6) {
    return formatNumber(Math.round(value), 0);
  }
  return formatNumber(value, 1);
}

export type CareerSeriesPoint = {
  /** Short label on the axis, e.g. "16-17". */
  season: string;
  /** Canonical season id, e.g. "2016-17". */
  fullSeason?: string;
  /** Plotted Y when not using percentile mode; raw metric otherwise. */
  value: number;
  /** Raw metric retained when the chart plots percentile on Y. */
  rawValue?: number;
  teamId: string;
  teamAbbr: string;
  color: string;
  /** League percentile for Savant stroke / Y when plotPercentile. */
  percentile?: number;
};

type ChartRow = {
  season: string;
  fullSeason?: string;
  value: number;
  rawValue?: number;
  teamId: string;
  teamAbbr: string;
  color: string;
  percentile?: number;
};

export type CareerStrokeStop = {
  offset: string;
  color: string;
};

function toChartRows(points: CareerSeriesPoint[]): ChartRow[] {
  return points.map((p) => ({
    season: p.season,
    fullSeason: p.fullSeason,
    value: p.value,
    rawValue: p.rawValue,
    teamId: p.teamId,
    teamAbbr: p.teamAbbr,
    color: p.color,
    percentile: p.percentile,
  }));
}

/** Evenly spaced X stops so one monotone stroke can blend team / Savant colors. */
function buildStrokeStops(points: CareerSeriesPoint[]): CareerStrokeStop[] {
  if (points.length === 0) return [];
  if (points.length === 1) {
    return [{ offset: "0%", color: points[0]!.color }];
  }
  const last = points.length - 1;
  return points.map((p, i) => ({
    offset: `${((i / last) * 100).toFixed(4)}%`,
    color: p.color,
  }));
}

function franchiseLegendFrom(
  points: CareerSeriesPoint[]
): Array<{ teamId: string; teamAbbr: string; color: string }> {
  const legend: Array<{ teamId: string; teamAbbr: string; color: string }> = [];
  const seen = new Set<string>();
  for (const p of points) {
    if (seen.has(p.teamId)) continue;
    seen.add(p.teamId);
    legend.push({
      teamId: p.teamId,
      teamAbbr: p.teamAbbr,
      color: p.color,
    });
  }
  return legend;
}

function teamChangeSeasonsFrom(points: CareerSeriesPoint[]): string[] {
  const out: string[] = [];
  for (let i = 1; i < points.length; i++) {
    if (points[i]!.teamId !== points[i - 1]!.teamId) {
      out.push(points[i]!.season);
    }
  }
  return out;
}

/**
 * One continuous series for a single monotone stroke.
 * Color handoffs are gradient stops along that path (not separate Line pieces).
 */
export function buildTeamSegmentedChart(points: CareerSeriesPoint[]): {
  data: ChartRow[];
  strokeStops: CareerStrokeStop[];
  legend: Array<{ teamId: string; teamAbbr: string; color: string }>;
  teamChangeSeasons: string[];
} {
  if (points.length < 2) {
    return { data: [], strokeStops: [], legend: [], teamChangeSeasons: [] };
  }
  return {
    data: toChartRows(points),
    strokeStops: buildStrokeStops(points),
    legend: franchiseLegendFrom(points),
    teamChangeSeasons: teamChangeSeasonsFrom(points),
  };
}

/** Percentile strokes: same continuous path; colors from each point's Savant color. */
export function buildSavantSegmentedChart(points: CareerSeriesPoint[]): {
  data: ChartRow[];
  strokeStops: CareerStrokeStop[];
  teamChangeSeasons: string[];
} {
  if (points.length < 2) {
    return { data: [], strokeStops: [], teamChangeSeasons: [] };
  }
  return {
    data: toChartRows(points),
    strokeStops: buildStrokeStops(points),
    teamChangeSeasons: teamChangeSeasonsFrom(points),
  };
}

/**
 * Left→right plot reveal (TalentYearChart clip + season stroke draw).
 * Sibling timings below stay locked to this pace (originally 720ms).
 */
const DRAW_MS = 1500;
const DRAW_EASING = "cubic-bezier(0.33, 1, 0.68, 1)";
/** Was +40ms at DRAW_MS=720. */
const DRAW_SETTLE_MS = Math.round((DRAW_MS * 40) / 720);
/** Axis tick glide — was 440ms / 30ms step at DRAW_MS=720. */
const AXIS_TICK_MS = Math.round((DRAW_MS * 440) / 720);
const AXIS_TICK_STAGGER_MS = Math.round((DRAW_MS * 30) / 720);

/** Hold a stroke fully undrawn (no flash of a complete line before WAAPI). */
function holdStrokeUndrawn(path: SVGPathElement): number {
  const length = path.getTotalLength();
  if (!(length > 0)) return 0;
  path.style.strokeDasharray = `${length} ${length}`;
  path.style.strokeDashoffset = `${length}`;
  // Kill any in-flight WAAPI so the hold is not overwritten.
  for (const a of path.getAnimations()) a.cancel();
  return length;
}

function clearStrokeDash(path: SVGPathElement) {
  path.style.strokeDasharray = "";
  path.style.strokeDashoffset = "";
}

/**
 * One draw-in per run, shared by the stroke and the dots. Progress is pinned
 * to the document timeline so Recharts path remounts continue the same fill
 * instead of restarting from empty.
 */
class DrawClock {
  private drawnRun = 0;
  private clockRun = 0;
  /** `Animation.startTime` on the document timeline for the active run. */
  private timelineStart: number | null = null;
  /** performance.now() anchor — used until timelineStart is assigned. */
  private anchorPerf = 0;
  private animation: Animation | null = null;
  /** Last path node we drew — Recharts often replaces the DOM mid-run. */
  private path: SVGPathElement | null = null;

  /** True once this run has begun drawing. */
  started(run: number): boolean {
    return this.clockRun === run && this.anchorPerf > 0;
  }

  /** Ms since this run started. 0 if not started. */
  elapsed(run: number): number {
    if (this.clockRun !== run || this.anchorPerf <= 0) return 0;
    if (this.timelineStart != null) {
      const now = document.timeline?.currentTime;
      if (typeof now === "number") return Math.max(0, now - this.timelineStart);
    }
    return Math.max(0, performance.now() - this.anchorPerf);
  }

  /**
   * Draws `path` in for `run`, or follows a reshape / DOM remount while that
   * run is still drawing. Pass `fromStart` only after the path geometry has
   * settled — ignored once the run is already on the timeline.
   */
  draw(
    path: SVGPathElement,
    run: number,
    opts?: { fromStart?: boolean }
  ): void {
    if (run < this.drawnRun) return;
    const samePath = this.path === path;
    const inFlight =
      samePath &&
      this.drawnRun === run &&
      this.animation?.playState === "running";
    if (run === this.drawnRun && samePath && !inFlight && !opts?.fromStart) {
      return;
    }

    const fresh = this.clockRun !== run;
    if (fresh) {
      this.clockRun = run;
      this.timelineStart = null;
      this.anchorPerf = performance.now();
    }
    this.drawnRun = run;
    this.path = path;

    const elapsed = this.elapsed(run);
    if (!fresh && elapsed >= DRAW_MS) {
      clearStrokeDash(path);
      return;
    }

    const length = path.getTotalLength();
    if (!(length > 0)) return;
    const dash = `${length} ${length}`;
    // Dash before any cancel so a replaced node never paints fully.
    path.style.strokeDasharray = dash;
    path.style.strokeDashoffset = `${length}`;
    this.animation?.cancel();
    const anim = path.animate(
      [
        { strokeDasharray: dash, strokeDashoffset: length },
        { strokeDasharray: dash, strokeDashoffset: 0 },
      ],
      {
        duration: DRAW_MS,
        easing: DRAW_EASING,
        fill: "forwards",
      }
    );
    if (!fresh) {
      if (this.timelineStart != null) {
        anim.startTime = this.timelineStart;
      } else {
        anim.currentTime = elapsed;
      }
    } else {
      requestAnimationFrame(() => {
        if (this.animation === anim && typeof anim.startTime === "number") {
          this.timelineStart = anim.startTime;
        }
      });
    }
    this.animation = anim;
    const done = () => {
      if (this.animation !== anim) return;
      clearStrokeDash(path);
    };
    void anim.finished.then(done).catch(done);
  }
}

const PLOT_CLIP_SEL = [
  ".recharts-cartesian-grid",
  ".recharts-reference-line",
  ".recharts-line",
  // Recharts parks dots in a separate z-index layer — not under .recharts-line.
  ".recharts-line-dots",
  ".recharts-area",
  ".recharts-scatter",
  ".recharts-career-monotone-stroke",
].join(", ");
/** Hidden — plot reads empty (same closed pose as the page LTR wipe). */
const PLOT_CLIP_CLOSED = "inset(-50% 150% -50% -50%)";
const PLOT_CLIP_OPEN = "inset(-50% -50% -50% -50%)";

/**
 * Reveal the plot left → right via clip-path. Survives Recharts path remounts
 * (stroke-dash restarts when the node is replaced; clip does not).
 */
function armPlotClipReveal(opts: {
  root: HTMLElement;
  isCancelled: () => boolean;
  onDone?: () => void;
}): void {
  const { root, isCancelled, onDone } = opts;
  let started = false;
  let settle = 0;
  let timelineStart: number | null = null;
  let doneTimer: number | null = null;

  const nodes = () =>
    [...root.querySelectorAll<HTMLElement | SVGElement>(PLOT_CLIP_SEL)];

  const holdClosed = () => {
    for (const el of nodes()) {
      for (const a of el.getAnimations()) a.cancel();
      el.style.clipPath = PLOT_CLIP_CLOSED;
    }
  };

  const attach = (el: HTMLElement | SVGElement) => {
    if (
      el
        .getAnimations()
        .some((a) => a.playState === "running" || a.playState === "finished")
    ) {
      return;
    }
    el.style.clipPath = PLOT_CLIP_CLOSED;
    const anim = el.animate(
      [{ clipPath: PLOT_CLIP_CLOSED }, { clipPath: PLOT_CLIP_OPEN }],
      {
        duration: DRAW_MS,
        easing: DRAW_EASING,
        fill: "forwards",
      }
    );
    if (timelineStart != null) {
      anim.startTime = timelineStart;
    } else if (typeof anim.startTime === "number") {
      timelineStart = anim.startTime;
    } else {
      requestAnimationFrame(() => {
        if (typeof anim.startTime === "number") {
          timelineStart = anim.startTime;
        }
      });
    }
  };

  const finish = () => {
    if (isCancelled()) return;
    for (const el of nodes()) {
      for (const a of el.getAnimations()) a.cancel();
      el.style.clipPath = "";
    }
    onDone?.();
  };

  const boot = () => {
    if (isCancelled()) return;
    const list = nodes();
    if (list.length === 0) {
      requestAnimationFrame(boot);
      return;
    }
    holdClosed();
    if (settle++ < 2) {
      requestAnimationFrame(boot);
      return;
    }
    if (started) return;
    started = true;
    for (const el of list) attach(el);
    doneTimer = window.setTimeout(finish, DRAW_MS + DRAW_SETTLE_MS);
  };

  holdClosed();
  const mo = new MutationObserver(() => {
    if (isCancelled()) return;
    if (!started) {
      holdClosed();
      return;
    }
    for (const el of nodes()) attach(el);
  });
  mo.observe(root, { childList: true, subtree: true });
  boot();

  // Caller cleanup should cancel; expose via returned disposer pattern by
  // listening to isCancelled on a short poll for disconnect.
  const watch = () => {
    if (isCancelled()) {
      mo.disconnect();
      if (doneTimer != null) window.clearTimeout(doneTimer);
      return;
    }
    requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);
}

/** Wait until the stroke path geometry settles, then draw from empty → full. */
function armStrokeDraw(opts: {
  getPath: () => SVGPathElement | null;
  drawClock: DrawClock;
  drawRun: number;
  isCancelled: () => boolean;
}): void {
  const { getPath, drawClock, drawRun, isCancelled } = opts;
  let waiting = 0;
  let stable = 0;
  let lastPath: SVGPathElement | null = null;
  let lastLen = -1;
  // Effect re-entry (Strict Mode / deps) must not re-hold a run already drawing.
  let committed = drawClock.started(drawRun);
  let follow = 0;

  const frame = () => {
    if (isCancelled()) return;
    const path = getPath();
    if (!path) {
      if (waiting++ < 120) requestAnimationFrame(frame);
      return;
    }
    const length = path.getTotalLength();
    if (!(length > 0)) {
      if (waiting++ < 120) requestAnimationFrame(frame);
      return;
    }

    if (committed) {
      if (path !== lastPath || Math.abs(length - lastLen) > 0.5) {
        lastPath = path;
        lastLen = length;
        // Recharts often replaces the node mid-draw; resume same clock.
        drawClock.draw(path, drawRun);
      }
    } else {
      holdStrokeUndrawn(path);
      if (path === lastPath && Math.abs(length - lastLen) < 0.5) {
        stable += 1;
      } else {
        stable = 0;
        lastPath = path;
        lastLen = length;
      }
      if (stable < 3) {
        if (waiting++ < 120) requestAnimationFrame(frame);
        return;
      }
      committed = true;
      drawClock.draw(path, drawRun, { fromStart: true });
    }

    if (follow++ < 90) requestAnimationFrame(frame);
  };
  frame();
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * One monotone curve colored with a user-space X gradient.
 * objectBoundingBox stroke gradients reverse on rising/falling segments;
 * anchoring to the plotted point xs keeps colors aligned with the dots.
 */
export function CareerMonotoneStroke(props: {
  points?: ReadonlyArray<{ x?: number | null; y?: number | null }>;
  strokeWidth?: number | string;
  gradientId: string;
  strokeStops: CareerStrokeStop[];
  /** Bumped when the plotted stat changes; the next new path draws in. */
  drawRun?: number;
  drawClock?: DrawClock;
}) {
  const points = (props.points ?? []).filter(
    (p): p is { x: number; y: number } =>
      typeof p.x === "number" &&
      typeof p.y === "number" &&
      Number.isFinite(p.x) &&
      Number.isFinite(p.y)
  );
  const groupRef = useRef<SVGGElement>(null);
  const shape = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const drawRun = props.drawRun ?? 0;
  const drawClock = props.drawClock;

  // drawRun < 0: painted (clip reveal owns motion). 0: hold empty.
  // >0: stroke-dash draw (legacy path; Talent/Career charts use clip).
  useLayoutEffect(() => {
    const getPath = () =>
      groupRef.current?.querySelector("path") ?? null;
    if (prefersReducedMotion() || drawRun < 0) {
      const path = getPath();
      if (path) clearStrokeDash(path);
      return;
    }
    if (!drawClock) return;

    if (drawRun === 0) {
      const path = getPath();
      if (path) holdStrokeUndrawn(path);
      return;
    }

    let cancelled = false;
    armStrokeDraw({
      getPath,
      drawClock,
      drawRun,
      isCancelled: () => cancelled,
    });
    return () => {
      cancelled = true;
    };
  }, [shape, drawRun, drawClock]);

  if (points.length < 2 || props.strokeStops.length === 0) return null;

  const x1 = points[0]!.x;
  const x2 = points[points.length - 1]!.x;
  const strokeWidth =
    typeof props.strokeWidth === "number"
      ? props.strokeWidth
      : Number(props.strokeWidth) || 2.5;

  return (
    <g ref={groupRef} className="recharts-career-monotone-stroke">
      <defs>
        <linearGradient
          id={props.gradientId}
          gradientUnits="userSpaceOnUse"
          x1={x1}
          y1={0}
          x2={x2}
          y2={0}
        >
          {props.strokeStops.map((stop) => (
            <stop
              key={`${stop.offset}-${stop.color}`}
              offset={stop.offset}
              stopColor={stop.color}
            />
          ))}
        </linearGradient>
      </defs>
      <Curve
        type="monotone"
        points={points}
        stroke={`url(#${props.gradientId})`}
        strokeWidth={strokeWidth}
        fill="none"
      />
    </g>
  );
}

/** Replays a dot's pop-in each draw run, timed to when the line reaches it. */
function DotDrawIn({
  run,
  delay,
  drawClock,
  children,
}: {
  run?: number;
  delay?: number;
  drawClock?: DrawClock;
  children: ReactNode;
}) {
  // Empty until the stroke draw is armed.
  if (run == null || run === 0) {
    return <g opacity={0}>{children}</g>;
  }
  // run < 0: show settled (no pop).
  if (run < 0 || delay == null || !drawClock) {
    return <>{children}</>;
  }
  return (
    <DotDrawInGroup key={run} run={run} delay={delay} drawClock={drawClock}>
      {children}
    </DotDrawInGroup>
  );
}

function DotDrawInGroup({
  run,
  delay,
  drawClock,
  children,
}: {
  run: number;
  delay: number;
  drawClock: DrawClock;
  children: ReactNode;
}) {
  const ref = useRef<SVGGElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const sync = () => {
      if (cancelled || !ref.current) return;
      if (!drawClock.started(run)) {
        ref.current.style.opacity = "0";
        ref.current.style.animation = "none";
        requestAnimationFrame(sync);
        return;
      }
      const elapsed = drawClock.elapsed(run);
      ref.current.style.opacity = "";
      ref.current.style.animation = "";
      ref.current.classList.add("career-dot-draw");
      ref.current.style.animationDelay = `${Math.round(delay - elapsed)}ms`;
    };
    sync();
    return () => {
      cancelled = true;
    };
  }, [run, delay, drawClock]);
  return (
    <g ref={ref} className="career-dot-draw" style={{ opacity: 0 }}>
      {children}
    </g>
  );
}

function TeamDot(props: {
  cx?: number;
  cy?: number;
  payload?: ChartRow;
  selectedSeason?: string;
  onSelect?: (row: ChartRow) => void;
  active?: boolean;
  drawRun?: number;
  drawDelay?: number;
  drawClock?: DrawClock;
}) {
  const { cx, cy, payload, selectedSeason, onSelect, active } = props;
  if (cx == null || cy == null || !payload) return null;
  const selected = isSeasonSelected(payload, selectedSeason);
  const r = active || selected ? 6 : 4;
  return (
    <g
      className={onSelect ? "cursor-pointer" : undefined}
      onClick={
        onSelect
          ? (event) => {
              event.stopPropagation();
              onSelect(payload);
            }
          : undefined
      }
    >
      {/* Larger invisible hit target for easier clicks. */}
      {onSelect ? (
        <circle cx={cx} cy={cy} r={14} fill="transparent" stroke="none" />
      ) : null}
      <DotDrawIn run={props.drawRun} delay={props.drawDelay} drawClock={props.drawClock}>
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill={payload.color}
          stroke={selected ? "var(--foreground)" : "var(--background)"}
          strokeWidth={selected ? 2 : 1.5}
        />
      </DotDrawIn>
    </g>
  );
}

function isSeasonSelected(
  payload: ChartRow,
  selectedSeason?: string
): boolean {
  if (!selectedSeason) return false;
  if (payload.fullSeason === selectedSeason) return true;
  if (payload.season === selectedSeason) return true;
  if (payload.season === selectedSeason.slice(2)) return true;
  return false;
}

function SavantDot(props: {
  cx?: number;
  cy?: number;
  payload?: ChartRow;
  selectedSeason?: string;
  onSelect?: (row: ChartRow) => void;
  active?: boolean;
  drawRun?: number;
  drawDelay?: number;
  drawClock?: DrawClock;
}) {
  const { cx, cy, payload, selectedSeason, onSelect, active } = props;
  if (cx == null || cy == null || !payload) return null;
  const selected = isSeasonSelected(payload, selectedSeason);
  const r = active || selected ? 6 : 4;
  return (
    <g
      className={onSelect ? "cursor-pointer" : undefined}
      onClick={
        onSelect
          ? (event) => {
              event.stopPropagation();
              onSelect(payload);
            }
          : undefined
      }
    >
      {onSelect ? (
        <circle cx={cx} cy={cy} r={14} fill="transparent" stroke="none" />
      ) : null}
      <DotDrawIn run={props.drawRun} delay={props.drawDelay} drawClock={props.drawClock}>
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill={payload.color}
          stroke={selected ? "var(--foreground)" : "var(--background)"}
          strokeWidth={selected ? 2 : 1.5}
        />
      </DotDrawIn>
    </g>
  );
}

function CareerChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{
    dataKey?: string | number;
    value?: number | string;
    payload?: ChartRow;
  }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as ChartRow | undefined;
  const item =
    payload.find((p) => p.dataKey !== "value" && p.value != null) ??
    payload.find((p) => p.dataKey === "value");
  const plotted =
    typeof item?.value === "number" ? item.value : Number(item?.value);
  const abbr = row?.teamAbbr;
  const pct =
    row?.percentile != null && Number.isFinite(row.percentile)
      ? Math.round(row.percentile)
      : null;
  const raw =
    row?.rawValue != null && Number.isFinite(row.rawValue)
      ? formatCareerChartNumber(row.rawValue)
      : Number.isFinite(plotted)
        ? formatCareerChartNumber(plotted)
        : null;

  return (
    <FrostRechartsTooltip active={active} className="w-max max-w-[12rem]">
      <p className={cn(type.caption, "font-semibold text-foreground")}>
        {abbr ? `${label} · ${abbr}` : String(label ?? "")}
      </p>
      <p
        className={cn(
          type.caption,
          "mt-0.5 tabular-nums text-muted-foreground"
        )}
      >
        {raw}
        {raw != null && pct != null ? " · " : null}
        {pct != null ? `${pct}th pct` : null}
        {raw == null && pct == null && Number.isFinite(plotted)
          ? formatCareerChartNumber(plotted)
          : null}
      </p>
    </FrostRechartsTooltip>
  );
}

export function CareerTeamTrendChart({
  points,
  height = 220,
  className,
  selectedSeason,
  onSeasonSelect,
  savantScale = false,
  showLegend = true,
  drawKey,
}: {
  points: CareerSeriesPoint[];
  height?: number;
  className?: string;
  selectedSeason?: string;
  onSeasonSelect?: (season: string) => void;
  /**
   * Percentile panel mode: Y = raw metric value; stroke + dots use Savant
   * colors from league percentile. Percentile stays in the tooltip.
   */
  savantScale?: boolean;
  /** Franchise color key under the plot. Default on. */
  showLegend?: boolean;
  /** The plotted stat; switching it draws the line in again. */
  drawKey?: string;
}) {
  const chartTheme = useChartTheme();
  const wrapRef = useRef<HTMLDivElement>(null);
  // 0 = empty (clipped). >0 = LTR clip reveal. Remount (key=drawKey) to replay.
  const [drawRun, setDrawRun] = useState(0);
  const enteredRef = useRef(false);
  void drawKey;

  useEffect(() => {
    if (enteredRef.current) return;
    const root = wrapRef.current;
    if (!root) return;

    const enter = () => {
      if (enteredRef.current) return;
      enteredRef.current = true;
      setDrawRun((run) => (run <= 0 ? 1 : run + 1));
    };

    if (prefersReducedMotion()) {
      enter();
      return;
    }

    const rect = root.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      enter();
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        io.disconnect();
        enter();
      },
      { threshold: 0.05, rootMargin: "0px 0px 40px 0px" }
    );
    io.observe(root);
    return () => io.disconnect();
  }, []);

  useLayoutEffect(() => {
    const root = wrapRef.current;
    if (!root || prefersReducedMotion()) return;
    if (drawRun !== 0) return;
    let cancelled = false;
    const hold = () => {
      if (cancelled) return;
      for (const el of root.querySelectorAll<HTMLElement | SVGElement>(
        PLOT_CLIP_SEL
      )) {
        el.style.clipPath = PLOT_CLIP_CLOSED;
      }
    };
    hold();
    const mo = new MutationObserver(hold);
    mo.observe(root, { childList: true, subtree: true });
    return () => {
      cancelled = true;
      mo.disconnect();
    };
  }, [drawRun]);

  useLayoutEffect(() => {
    const root = wrapRef.current;
    if (!root) return;
    if (prefersReducedMotion()) {
      for (const el of root.querySelectorAll<HTMLElement | SVGElement>(
        PLOT_CLIP_SEL
      )) {
        el.style.clipPath = "";
      }
      return;
    }
    if (drawRun <= 0) return;
    let cancelled = false;
    armPlotClipReveal({
      root,
      isCancelled: () => cancelled,
    });
    return () => {
      cancelled = true;
    };
  }, [drawRun]);

  const palette = useMemo(
    () => distinctTeamColors(points.map((p) => p.teamId), chartTheme.surface),
    [points, chartTheme.surface]
  );
  const teamColor = useCallback(
    (teamId?: string | null) =>
      (teamId && palette.get(teamId)) || chartTheme.teamColor(teamId).color,
    [palette, chartTheme]
  );
  // Percentile mode never falls back to team colors: a season not ranked yet
  // (fast payload, missing peer board) stays neutral until its percentile lands.
  const hasPercentileColors = savantScale;

  const plotPoints = useMemo((): CareerSeriesPoint[] => {
    if (!hasPercentileColors) return points;
    return points.map((p) => {
      const pct =
        p.percentile != null && Number.isFinite(p.percentile)
          ? Math.max(0, Math.min(100, p.percentile))
          : null;
      return {
        ...p,
        // Keep Y as the raw metric; color encodes percentile.
        rawValue: p.rawValue ?? p.value,
        percentile: pct ?? p.percentile,
        color:
          pct != null
            ? percentileSavantColor(pct, chartTheme.surface)
            : "var(--muted-foreground)",
      };
    });
  }, [points, hasPercentileColors, chartTheme.surface]);

  const themedPlotPoints = useMemo((): CareerSeriesPoint[] => {
    if (hasPercentileColors) return plotPoints;
    return colorSeasonMarksWithHandoffs(plotPoints, teamColor);
  }, [teamColor, hasPercentileColors, plotPoints]);

  const strokeGradId = `career-stroke-${useId().replace(/:/g, "")}`;

  const { data, strokeStops, legend, teamChangeSeasons } = useMemo(() => {
    if (hasPercentileColors) {
      const savant = buildSavantSegmentedChart(plotPoints);
      const team = buildTeamSegmentedChart(themedPlotPoints);
      return {
        data: savant.data,
        strokeStops: savant.strokeStops,
        legend: team.legend,
        teamChangeSeasons: team.teamChangeSeasons,
      };
    }
    return buildTeamSegmentedChart(themedPlotPoints);
  }, [plotPoints, themedPlotPoints, hasPercentileColors]);

  const franchiseLegend = useMemo(
    () =>
      legend.filter(
        (t) => t.teamId !== "TOT" && t.teamId !== "2TM" && t.teamAbbr !== "-"
      ),
    [legend]
  );

  const visibleLegend = useMemo(
    () =>
      franchiseLegend.map((entry) => ({
        ...entry,
        color: teamColor(entry.teamId),
      })),
    [teamColor, franchiseLegend]
  );

  const handleSelect = useCallback(
    (row: ChartRow) => {
      if (!onSeasonSelect) return;
      const season = row.fullSeason ?? row.season;
      onSeasonSelect(season);
    },
    [onSeasonSelect]
  );

  const useSavantDots = hasPercentileColors;
  const canSelect = Boolean(onSeasonSelect);

  // Stable Recharts render props — new function identities every paint make
  // Recharts Redux notify in a loop (React #185 on the player route).
  const renderDot = useCallback(
    (props: {
      cx?: number;
      cy?: number;
      payload?: ChartRow;
      index?: number;
    }) => {
      const Dot = useSavantDots ? SavantDot : TeamDot;
      return (
        <Dot
          cx={props.cx}
          cy={props.cy}
          payload={props.payload}
          selectedSeason={selectedSeason}
          onSelect={canSelect ? handleSelect : undefined}
          drawRun={-1}
        />
      );
    },
    [useSavantDots, selectedSeason, canSelect, handleSelect]
  );

  const renderActiveDot = useCallback(
    (props: {
      cx?: number;
      cy?: number;
      payload?: ChartRow;
    }) => {
      const Dot = useSavantDots ? SavantDot : TeamDot;
      return (
        <Dot
          cx={props.cx}
          cy={props.cy}
          payload={props.payload}
          selectedSeason={selectedSeason}
          onSelect={canSelect ? handleSelect : undefined}
          active
        />
      );
    },
    [useSavantDots, selectedSeason, canSelect, handleSelect]
  );

  const renderXTick = useCallback((props: {
    x?: number | string;
    y?: number | string;
    payload?: { value?: string | number };
    textAnchor?: "start" | "middle" | "end" | "inherit";
    index?: number;
  }) => <CareerAxisTick {...props} axis="x" fontSize={12} />, []);

  const renderYTick = useCallback((props: {
    x?: number | string;
    y?: number | string;
    payload?: { value?: string | number };
    textAnchor?: "start" | "middle" | "end" | "inherit";
    index?: number;
  }) => (
    <CareerAxisTick
      {...props}
      axis="y"
      fontSize={12}
      formatter={formatCareerChartNumber}
    />
  ), []);

  const renderStroke = useCallback(
    (shapeProps: {
      points?: ReadonlyArray<{ x?: number | null; y?: number | null }>;
      strokeWidth?: number | string;
    }) => (
      <CareerMonotoneStroke
        points={shapeProps.points}
        strokeWidth={shapeProps.strokeWidth}
        gradientId={strokeGradId}
        strokeStops={strokeStops}
        drawRun={-1}
      />
    ),
    [strokeGradId, strokeStops]
  );

  if (data.length < 2) return null;

  const showFranchiseLegend =
    showLegend && !useSavantDots && visibleLegend.length > 1;

  return (
    <div ref={wrapRef} className={cn("flex min-w-0 flex-col", className)}>
      {/*
        Explicit px height on ResponsiveContainer (not %). Percentage height
        can resolve against a taller ancestor and paint the SVG over siblings
        (legend / "Closest …" headings).
      */}
      <div
        className="relative w-full min-w-0 shrink-0 overflow-hidden"
        style={{ height }}
      >
        <ResponsiveContainer width="100%" height={height}>
          <LineChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 2 }}
          >
            <XAxis
              dataKey="season"
              tick={renderXTick}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={renderYTick}
              tickLine={false}
              axisLine={false}
              width={36}
              domain={["auto", "auto"]}
              tickFormatter={formatCareerChartNumber}
            />
            <Tooltip
              cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
              wrapperStyle={rechartsFrostWrapperStyle}
              content={<CareerChartTooltip />}
            />
            {teamChangeSeasons.map((season) => (
              <ReferenceLine
                key={season}
                x={season}
                stroke="var(--border)"
                strokeWidth={1}
                strokeOpacity={0.85}
                ifOverflow="extendDomain"
              />
            ))}
            <Line
              type="monotone"
              dataKey="value"
              stroke={`url(#${strokeGradId})`}
              strokeWidth={2.5}
              shape={renderStroke}
              dot={renderDot}
              activeDot={renderActiveDot}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {showFranchiseLegend ? (
        <ul
          className="mt-1 flex shrink-0 flex-wrap gap-x-3 gap-y-1 border-t border-border/40 pt-2"
          aria-label="Franchise colors"
        >
          {visibleLegend.map((t) => (
            <li
              key={t.teamId}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground"
            >
              <span
                className="inline-block size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: t.color }}
                aria-hidden
              />
              <TeamLogo teamKey={t.teamId} size="2xs" />
              {t.teamAbbr}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function valueAxisTicks(min: number, max: number): number[] {
  const span = max - min;
  const step = span > 20 ? 5 : span > 10 ? 2 : 1;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= max + 1e-6; value += step) ticks.push(value);
  if (min < 0 && max > 0 && !ticks.includes(0)) ticks.push(0);
  return ticks.sort((a, b) => a - b);
}

function yearAxisTicks(min: number, max: number): number[] {
  const start = min % 2 === 0 ? min : min + 1;
  const ticks: number[] = [];
  for (let year = start; year <= max; year += 2) ticks.push(year);
  return ticks;
}

const AXIS_TICK_EASE = "cubic-bezier(0.33, 1, 0.68, 1)";

/**
 * Axis marks stay visible across filter wipes (plot-only clip). When the scale
 * changes, each tick eases into its new position / label.
 */
function CareerAxisTick({
  x = 0,
  y = 0,
  payload,
  textAnchor = "middle",
  index = 0,
  axis,
  formatter,
  fontSize = 11,
}: {
  /** Recharts may pass string coordinates; coerce for SVG. */
  x?: number | string;
  y?: number | string;
  payload?: { value?: string | number };
  textAnchor?: "start" | "middle" | "end" | "inherit";
  index?: number;
  axis: "x" | "y";
  formatter?: (value: number) => string;
  fontSize?: number;
}) {
  const xNum = typeof x === "number" ? x : Number(x) || 0;
  const yNum = typeof y === "number" ? y : Number(y) || 0;
  const reveal = useCareerChartReveal();
  const ref = useRef<SVGGElement>(null);
  const primed = useRef(false);
  const prevKey = useRef<string | null>(null);
  const raw = payload?.value;
  const label =
    typeof raw === "number"
      ? formatter
        ? formatter(raw)
        : String(raw)
      : raw != null
        ? String(raw)
        : "";
  const markKey = `${label}|${Math.round(xNum)}|${Math.round(yNum)}`;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const rest = () => {
      el.style.opacity = "1";
      el.style.transform = `translate(${xNum}px, ${yNum}px)`;
    };

    // First paint: show immediately. Line/dot draw owns scroll entry motion.
    if (!primed.current) {
      primed.current = true;
      prevKey.current = markKey;
      rest();
      return;
    }

    // Same mark after a parent re-render — keep it put.
    if (prevKey.current === markKey && reveal !== "swap") {
      rest();
      return;
    }
    const scaleSwap = reveal === "swap" || prevKey.current !== markKey;
    prevKey.current = markKey;

    if (!scaleSwap || prefersReducedMotion()) {
      rest();
      return;
    }

    const fromX = axis === "y" ? xNum - 8 : xNum;
    const fromY = axis === "x" ? yNum + 8 : yNum;
    const delay = Math.min(index, 10) * AXIS_TICK_STAGGER_MS;
    for (const a of el.getAnimations()) a.cancel();
    const anim = el.animate(
      [
        { opacity: 0, transform: `translate(${fromX}px, ${fromY}px)` },
        { opacity: 1, transform: `translate(${xNum}px, ${yNum}px)` },
      ],
      {
        duration: AXIS_TICK_MS,
        delay,
        easing: AXIS_TICK_EASE,
        fill: "forwards",
      }
    );
    void anim.finished
      .then(() => {
        try {
          anim.commitStyles();
        } catch {
          /* ignore */
        }
        anim.cancel();
        rest();
      })
      .catch(() => rest());

    return () => {
      anim.cancel();
      rest();
    };
  }, [xNum, yNum, label, markKey, axis, index, reveal]);

  return (
    <g
      ref={ref}
      style={{ opacity: 1, transform: `translate(${xNum}px, ${yNum}px)` }}
    >
      <text
        x={0}
        y={0}
        dy={axis === "x" ? 12 : 4}
        textAnchor={textAnchor}
        fill="var(--muted-foreground)"
        fontSize={fontSize}
      >
        {label}
      </text>
    </g>
  );
}

type TalentSeasonPoint = {
  year: number;
  value: number;
  season?: string;
  teamId?: string;
  teamAbbr?: string;
  color?: string;
};

type TalentGamePoint = {
  year: number;
  value: number;
  teamId?: string;
  teamAbbr?: string;
  color?: string;
};

/** Trade / multi-team season rows sit between two franchise colors on the line. */
function isTeamHandoffSeason(point: {
  teamId?: string;
  teamAbbr?: string;
}): boolean {
  if (!point.teamId && !point.teamAbbr) return false;
  if (point.teamId === "TOT" || point.teamId === "2TM") return true;
  return (point.teamAbbr ?? "").includes("/");
}

/**
 * Season marks: solid franchise color, or the gradient midpoint when the
 * season is a handoff between two clubs (matches the stroke blend).
 */
function colorSeasonMarksWithHandoffs<
  T extends { teamId?: string; teamAbbr?: string },
>(points: T[], colorFor: (teamId?: string) => string): Array<T & { color: string }> {
  return points.map((point, index) => {
    const base = colorFor(point.teamId);
    if (!isTeamHandoffSeason(point)) {
      return { ...point, color: base };
    }
    let left: string | null = null;
    let right: string | null = null;
    for (let i = index - 1; i >= 0; i--) {
      const neighbor = points[i]!;
      if (isTeamHandoffSeason(neighbor)) continue;
      if (!neighbor.teamId) continue;
      left = colorFor(neighbor.teamId);
      break;
    }
    for (let i = index + 1; i < points.length; i++) {
      const neighbor = points[i]!;
      if (isTeamHandoffSeason(neighbor)) continue;
      if (!neighbor.teamId) continue;
      right = colorFor(neighbor.teamId);
      break;
    }
    if (left && right) {
      return { ...point, color: midpointChartColor(left, right) };
    }
    return { ...point, color: left ?? right ?? base };
  });
}

function TalentChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    dataKey?: string | number;
    value?: number | string;
    payload?: TalentSeasonPoint;
  }>;
}) {
  if (!active || !payload?.length) return null;
  const row =
    payload.find((item) => item.payload?.season)?.payload ??
    payload.find((item) => item.payload != null)?.payload;
  if (!row || !Number.isFinite(row.value)) return null;
  const label = row.season ?? String(Math.round(row.year));
  return (
    <FrostRechartsTooltip active={active} className="w-max max-w-[12rem]">
      <p className={cn(type.caption, "font-semibold text-foreground")}>
        {label}
      </p>
      <p
        className={cn(
          type.caption,
          "mt-0.5 tabular-nums text-muted-foreground"
        )}
      >
        {formatCareerChartNumber(row.value)}
      </p>
    </FrostRechartsTooltip>
  );
}

function TalentSeasonDot({
  cx,
  cy,
  fill,
  ring,
  active = false,
  drawRun,
  drawDelay,
  drawClock,
}: {
  cx?: number;
  cy?: number;
  fill: string;
  ring: string;
  active?: boolean;
  drawRun?: number;
  drawDelay?: number;
  drawClock?: DrawClock;
}) {
  if (cx == null || cy == null || !Number.isFinite(cx)) return <g />;
  const r = active ? 7 : 5.5;
  const mark = (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill={fill}
      stroke={ring}
      strokeWidth={active ? 2.5 : 2}
    />
  );
  return (
    <g data-motion-static>
      <circle cx={cx} cy={cy} r={14} fill="transparent" stroke="none" />
      {!drawRun ? (
        <g opacity={0}>{mark}</g>
      ) : drawRun < 0 ? (
        mark
      ) : (
        <DotDrawIn run={drawRun} delay={drawDelay ?? 0} drawClock={drawClock}>
          {mark}
        </DotDrawIn>
      )}
    </g>
  );
}

/** Career page: small dots are games, large dots are seasons, the line runs through the seasons. */
export function TalentYearChart({
  dots,
  line,
  kind,
  height = 260,
}: {
  dots: TalentGamePoint[];
  line: TalentSeasonPoint[];
  kind: "impact" | "box";
  height?: number;
}) {
  const theme = useChartTheme();
  const wrapRef = useRef<HTMLDivElement>(null);
  // 0 = empty (clipped). >0 = LTR clip reveal in progress / done.
  const [drawRun, setDrawRun] = useState(0);
  const enteredRef = useRef(false);
  const strokeGradId = `talent-stroke-${useId().replace(/:/g, "")}`;
  const fallbackStroke = theme.isDark ? "#60a5fa" : "#2f6fed";
  const fallbackDot = theme.isDark ? "#93c5fd" : "#8eb8e6";

  const teamIds = useMemo(() => {
    const ids: string[] = [];
    for (const point of line) {
      if (point.teamId) ids.push(point.teamId);
    }
    for (const point of dots) {
      if (point.teamId) ids.push(point.teamId);
    }
    return ids;
  }, [dots, line]);

  const palette = useMemo(
    () => distinctTeamColors(teamIds, theme.surface),
    [teamIds, theme.surface]
  );

  const colorFor = useCallback(
    (teamId?: string) =>
      (teamId && palette.get(teamId)) ||
      (teamId ? theme.teamColor(teamId).color : fallbackStroke),
    [fallbackStroke, palette, theme]
  );

  const coloredDots = useMemo(
    (): TalentGamePoint[] =>
      dots.map((point) => ({
        ...point,
        color: colorFor(point.teamId),
      })),
    [colorFor, dots]
  );

  const coloredLine = useMemo(
    (): TalentSeasonPoint[] => colorSeasonMarksWithHandoffs(line, colorFor),
    [colorFor, line]
  );

  const strokeStops = useMemo(() => {
    if (coloredLine.length === 0) {
      return [{ offset: "0%", color: fallbackStroke }];
    }
    if (coloredLine.length === 1) {
      return [{ offset: "0%", color: coloredLine[0]!.color ?? fallbackStroke }];
    }
    const last = coloredLine.length - 1;
    return coloredLine.map((point, i) => ({
      offset: `${((i / last) * 100).toFixed(4)}%`,
      color: point.color ?? fallbackStroke,
    }));
  }, [coloredLine, fallbackStroke]);

  const legend = useMemo(() => {
    const out: Array<{
      teamId: string;
      teamAbbr: string;
      color: string;
      handoff?: boolean;
    }> = [];
    const seen = new Set<string>();
    for (const point of [...coloredLine, ...coloredDots]) {
      if (!point.teamId || seen.has(point.teamId)) continue;
      seen.add(point.teamId);
      const handoff = isTeamHandoffSeason(point);
      out.push({
        teamId: point.teamId,
        teamAbbr: point.teamAbbr ?? point.teamId,
        color: point.color ?? colorFor(point.teamId),
        handoff,
      });
    }
    return out;
  }, [colorFor, coloredDots, coloredLine]);

  // Arm once when in view. Filter wipe remounts this component empty.
  useEffect(() => {
    if (enteredRef.current) return;
    const root = wrapRef.current;
    if (!root) return;

    const enter = () => {
      if (enteredRef.current) return;
      enteredRef.current = true;
      setDrawRun(1);
    };

    if (prefersReducedMotion()) {
      enter();
      return;
    }

    const rect = root.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      enter();
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        io.disconnect();
        enter();
      },
      { threshold: 0.05, rootMargin: "0px 0px 40px 0px" }
    );
    io.observe(root);
    return () => io.disconnect();
  }, []);

  // Empty while waiting: clip the plot shut so nothing flashes full.
  useLayoutEffect(() => {
    const root = wrapRef.current;
    if (!root || prefersReducedMotion()) return;
    if (drawRun !== 0) return;
    let cancelled = false;
    const hold = () => {
      if (cancelled) return;
      for (const el of root.querySelectorAll<HTMLElement | SVGElement>(
        PLOT_CLIP_SEL
      )) {
        el.style.clipPath = PLOT_CLIP_CLOSED;
      }
    };
    hold();
    const mo = new MutationObserver(hold);
    mo.observe(root, { childList: true, subtree: true });
    return () => {
      cancelled = true;
      mo.disconnect();
    };
  }, [drawRun]);

  // Armed: smooth empty → full via clip (path remounts cannot restart it).
  useLayoutEffect(() => {
    const root = wrapRef.current;
    if (!root) return;
    if (prefersReducedMotion()) {
      for (const el of root.querySelectorAll<HTMLElement | SVGElement>(
        PLOT_CLIP_SEL
      )) {
        el.style.clipPath = "";
      }
      return;
    }
    if (drawRun <= 0) return;
    let cancelled = false;
    armPlotClipReveal({
      root,
      isCancelled: () => cancelled,
    });
    return () => {
      cancelled = true;
    };
  }, [drawRun]);

  const years = [...coloredDots, ...coloredLine].map((point) => point.year);
  const xMin = Math.floor(Math.min(...years));
  const xMax = Math.ceil(Math.max(...years));
  const values = [...coloredDots, ...coloredLine].map((point) => point.value);
  const yMin = Math.min(...values);
  const yMax = Math.max(...values);
  const yPad = Math.max(0.35, (yMax - yMin) * 0.12);
  const dotOpacity = kind === "impact" ? 0.32 : 0.18;
  const dotRadius = kind === "impact" ? 1.35 : 1.05;
  const ring = theme.isDark ? "#0b1220" : "#ffffff";
  const showLegend = legend.length > 1;

  const renderXTick = useCallback(
    (props: {
      x?: number | string;
      y?: number | string;
      payload?: { value?: string | number };
      textAnchor?: "start" | "middle" | "end" | "inherit";
      index?: number;
    }) => <CareerAxisTick {...props} axis="x" />,
    []
  );
  const renderYTick = useCallback(
    (props: {
      x?: number | string;
      y?: number | string;
      payload?: { value?: string | number };
      textAnchor?: "start" | "middle" | "end" | "inherit";
      index?: number;
    }) => (
      <CareerAxisTick
        {...props}
        axis="y"
        formatter={formatCareerChartNumber}
      />
    ),
    []
  );
  const renderGameDot = useCallback(
    (props: {
      cx?: number;
      cy?: number;
      payload?: TalentGamePoint;
    }) => {
      if (
        props.cx == null ||
        props.cy == null ||
        !Number.isFinite(props.cx)
      ) {
        return <g />;
      }
      return (
        <g data-motion-static>
          <circle
            cx={props.cx}
            cy={props.cy}
            r={dotRadius}
            fill={props.payload?.color ?? fallbackDot}
            fillOpacity={dotOpacity}
            pointerEvents="none"
          />
        </g>
      );
    },
    [dotOpacity, dotRadius, fallbackDot]
  );
  const renderStroke = useCallback(
    (shapeProps: {
      points?: ReadonlyArray<{ x?: number | null; y?: number | null }>;
      strokeWidth?: number | string;
    }) => (
      <CareerMonotoneStroke
        points={shapeProps.points}
        strokeWidth={shapeProps.strokeWidth}
        gradientId={strokeGradId}
        strokeStops={strokeStops}
        drawRun={-1}
      />
    ),
    [strokeGradId, strokeStops]
  );
  const renderSeasonDot = useCallback(
    (props: {
      cx?: number;
      cy?: number;
      payload?: TalentSeasonPoint;
    }) => (
      <TalentSeasonDot
        cx={props.cx}
        cy={props.cy}
        fill={props.payload?.color ?? fallbackStroke}
        ring={ring}
        drawRun={-1}
      />
    ),
    [fallbackStroke, ring]
  );
  const renderActiveSeasonDot = useCallback(
    (props: {
      cx?: number;
      cy?: number;
      payload?: TalentSeasonPoint;
    }) => (
      <TalentSeasonDot
        cx={props.cx}
        cy={props.cy}
        fill={props.payload?.color ?? fallbackStroke}
        ring={ring}
        active
      />
    ),
    [fallbackStroke, ring]
  );

  return (
    <div ref={wrapRef} className="flex min-w-0 flex-col" data-motion-static>
      <div
        className="relative w-full min-w-0 shrink-0"
        style={{ height }}
      >
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid
              vertical={false}
              stroke="currentColor"
              strokeOpacity={theme.isDark ? 0.14 : 0.08}
              strokeDasharray="1 4"
            />
            <XAxis
              dataKey="year"
              type="number"
              domain={[xMin - 0.15, xMax + 0.15]}
              ticks={yearAxisTicks(xMin, xMax)}
              tickFormatter={(value: number) => String(value)}
              tick={renderXTick}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={renderYTick}
              tickLine={false}
              axisLine={false}
              width={32}
              domain={[yMin - yPad, yMax + yPad]}
              ticks={valueAxisTicks(yMin - yPad, yMax + yPad)}
              tickFormatter={formatCareerChartNumber}
            />
            <ReferenceLine
              y={0}
              stroke="currentColor"
              strokeOpacity={0.35}
              strokeDasharray="4 4"
            />
            <Tooltip
              cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
              wrapperStyle={rechartsFrostWrapperStyle}
              content={<TalentChartTooltip />}
            />
            <Scatter
              data={coloredDots}
              dataKey="value"
              tooltipType="none"
              isAnimationActive={false}
              legendType="none"
              shape={renderGameDot}
            />
            <Line
              data={coloredLine}
              type="monotone"
              dataKey="value"
              stroke={`url(#${strokeGradId})`}
              strokeWidth={2}
              isAnimationActive={false}
              shape={renderStroke}
              dot={renderSeasonDot}
              activeDot={renderActiveSeasonDot}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {showLegend ? (
        <ul
          className="mt-1 flex shrink-0 flex-wrap gap-x-3 gap-y-1 border-t border-border/40 pt-2"
          aria-label="Franchise colors"
        >
          {legend.map((entry) => (
            <li
              key={entry.teamId}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground"
            >
              <span
                className="inline-block size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: entry.color }}
                aria-hidden
              />
              {entry.handoff ? null : (
                <TeamLogo teamKey={entry.teamId} size="2xs" />
              )}
              {entry.teamAbbr}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
