"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode, type SVGProps } from "react";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { ChartTooltipSurface } from "@/components/charts/chart-tooltip";
import { TransitionLink } from "@/components/continuity/query-nav";
import type { PlayByPlayEvent } from "@/data/types";
import { type } from "@/lib/design-system";
import {
  buildCourtEvents,
  periodName,
  periodStart,
  playerTally,
  shotZone,
  SHOT_ZONES,
  tallyAt,
  type CourtEvent,
  type ScoreMark,
  type ShotZone,
  type Side,
  type SideTally,
  type StatTick,
} from "@/lib/games/court-events";
import { elapsedGameSeconds, isLiveLikeStatus, type GameStatusKind } from "@/lib/game-status";
import { cn } from "@/lib/utils";

function latestPlay(events: PlayByPlayEvent[]): PlayByPlayEvent | null {
  let last: PlayByPlayEvent | null = null;
  let lastT = -1;
  for (const e of events) {
    const t = elapsedGameSeconds(e.period, e.clockSeconds);
    if (t >= lastT) {
      last = e;
      lastT = t;
    }
  }
  return last;
}

/** The set that reaches later in the game; the polled set on a tie, since it can carry corrections. */
function fresherEvents(
  fromPage: PlayByPlayEvent[],
  polled: PlayByPlayEvent[] | null
): PlayByPlayEvent[] {
  if (!polled?.length) return fromPage;
  const a = latestPlay(fromPage);
  const b = latestPlay(polled);
  if (!a || !b) return a ? fromPage : polled;
  const ta = elapsedGameSeconds(a.period, a.clockSeconds);
  const tb = elapsedGameSeconds(b.period, b.clockSeconds);
  return ta > tb ? fromPage : polled;
}

type Mode = "shots" | "game";
export type ShotChartPlayer = { playerId: string; name: string | null; side: Side };
type Layer = "makes" | "misses" | "assists" | "rebounds" | "blocks" | "steals" | "turnovers" | "fouls";

const COURT_W = 94;
const COURT_H = 50;
const RIM_FROM_BASELINE = 5.25;
const SPEEDS = [1, 2, 4] as const;
/** Real seconds a full regulation replay takes at 1x. */
const BASE_REPLAY_SECONDS = 40;
const LIVE_POLL_MS = 20_000;

const LAYERS: { id: Layer; label: string }[] = [
  { id: "makes", label: "Makes" },
  { id: "misses", label: "Misses" },
  { id: "assists", label: "Assists" },
  { id: "rebounds", label: "Rebounds" },
  { id: "blocks", label: "Blocks" },
  { id: "steals", label: "Steals" },
  { id: "turnovers", label: "Turnovers" },
  { id: "fouls", label: "Fouls" },
];

const STAT_COLUMNS: { label: string; title: string; value: (t: SideTally) => string }[] = [
  { label: "FG", title: "Field goals", value: (t) => `${t.fgm}-${t.fga}` },
  { label: "3P", title: "Three pointers", value: (t) => `${t.tpm}-${t.tpa}` },
  { label: "FT", title: "Free throws", value: (t) => `${t.ftm}-${t.fta}` },
  { label: "OREB", title: "Offensive rebounds", value: (t) => String(t.oreb) },
  { label: "DREB", title: "Defensive rebounds", value: (t) => String(t.dreb) },
  { label: "AST", title: "Assists", value: (t) => String(t.ast) },
  { label: "STL", title: "Steals", value: (t) => String(t.stl) },
  { label: "BLK", title: "Blocks", value: (t) => String(t.blk) },
  { label: "TOV", title: "Turnovers", value: (t) => String(t.tov) },
  { label: "PF", title: "Personal fouls", value: (t) => String(t.pf) },
];

/**
 * Feed spot (feet from the attacked rim) → full-court position. Both feeds put
 * negative x on the shooter's left ("Left Corner 3"), so a shooter facing the
 * left rim has their left toward the bottom edge, and the reverse at the right rim.
 */
function toCourt(ev: CourtEvent): { cx: number; cy: number } {
  const along = RIM_FROM_BASELINE + ev.y;
  const cx = ev.attack === "away" ? along : COURT_W - along;
  const cy = ev.attack === "away" ? COURT_H / 2 - ev.x : COURT_H / 2 + ev.x;
  return {
    cx: Math.min(Math.max(cx, 0.6), COURT_W - 0.6),
    cy: Math.min(Math.max(cy, 0.6), COURT_H - 0.6),
  };
}

function CourtEnd() {
  const arcX = RIM_FROM_BASELINE + Math.sqrt(23.75 ** 2 - 22 ** 2);
  return (
    <>
      <rect x={0} y={17} width={19} height={16} />
      <path d="M 19 19 A 6 6 0 0 1 19 31" />
      <path d="M 19 31 A 6 6 0 0 1 19 19" strokeDasharray="3 4" />
      <line x1={4} x2={4} y1={22} y2={28} />
      <circle cx={RIM_FROM_BASELINE} cy={25} r={0.75} />
      <path d={`M ${RIM_FROM_BASELINE} 21 A 4 4 0 0 1 ${RIM_FROM_BASELINE} 29`} />
      <path d={`M 0 3 L ${arcX} 3 A 23.75 23.75 0 0 1 ${arcX} 47 L 0 47`} />
    </>
  );
}

function Diamond({ cx, cy, r, ...rest }: { cx: number; cy: number; r: number } & SVGProps<SVGPathElement>) {
  return <path d={`M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`} {...rest} />;
}

function Triangle({ cx, cy, r, ...rest }: { cx: number; cy: number; r: number } & SVGProps<SVGPathElement>) {
  return (
    <path
      d={`M ${cx - r} ${cy - r * 0.7} L ${cx + r} ${cy - r * 0.7} L ${cx} ${cy + r} Z`}
      strokeLinejoin="round"
      {...rest}
    />
  );
}

function Cross({ cx, cy, r, ...rest }: { cx: number; cy: number; r: number } & SVGProps<SVGPathElement>) {
  return (
    <path
      d={`M ${cx - r} ${cy - r} L ${cx + r} ${cy + r} M ${cx + r} ${cy - r} L ${cx - r} ${cy + r}`}
      strokeLinecap="round"
      {...rest}
    />
  );
}

/** Legend glyph for a layer chip, drawn in currentColor. */
function LayerGlyph({ layer }: { layer: Layer }) {
  const c = "currentColor";
  let glyph: ReactNode;
  switch (layer) {
    case "makes":
      glyph = <circle cx={6} cy={6} r={4} fill={c} />;
      break;
    case "misses":
      glyph = <circle cx={6} cy={6} r={3.6} fill="none" stroke={c} strokeWidth={1.5} />;
      break;
    case "assists":
      glyph = (
        <>
          <circle cx={6} cy={6} r={2.6} fill={c} />
          <circle cx={6} cy={6} r={5} fill="none" stroke={c} strokeWidth={1} />
        </>
      );
      break;
    case "rebounds":
      glyph = (
        <>
          <circle cx={6} cy={6} r={4} fill="none" stroke={c} strokeWidth={1.2} strokeOpacity={0.5} />
          <circle cx={6} cy={6} r={1.8} fill={c} />
        </>
      );
      break;
    case "blocks":
      glyph = <Cross cx={6} cy={6} r={3.6} fill="none" stroke={c} strokeWidth={1.6} />;
      break;
    case "steals":
      glyph = <Diamond cx={6} cy={6} r={4.6} fill={c} />;
      break;
    case "turnovers":
      glyph = <Triangle cx={6} cy={6} r={4.4} fill="none" stroke={c} strokeWidth={1.4} />;
      break;
    case "fouls":
      glyph = <rect x={2.2} y={2.2} width={7.6} height={7.6} fill="none" stroke={c} strokeWidth={1.4} />;
      break;
  }
  return (
    <svg viewBox="0 0 12 12" className="size-3 shrink-0" aria-hidden>
      {glyph}
    </svg>
  );
}

function StatLine({ fgm, fga, tpm, tpa }: Pick<SideTally, "fgm" | "fga" | "tpm" | "tpa">) {
  return (
    <span className={cn(type.caption, "block tabular-nums text-muted-foreground")}>
      <span className="block sm:inline">
        {fgm}-{fga} FG
      </span>
      <span className="hidden sm:inline"> · </span>
      <span className="block sm:inline">
        {tpm}-{tpa} 3P
      </span>
    </span>
  );
}

function Chip({
  active,
  onClick,
  children,
  role,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  role?: "tab";
  className?: string;
}) {
  return (
    <button
      type="button"
      role={role}
      aria-selected={role === "tab" ? active : undefined}
      aria-pressed={role === "tab" ? undefined : active}
      onClick={onClick}
      className={cn(
        type.caption,
        "glass-pill rounded-md px-2.5 py-1 font-semibold tabular-nums transition-colors",
        active ? "glass-pill-active text-foreground" : "text-muted-foreground hover:text-foreground",
        className
      )}
    >
      {children}
    </button>
  );
}

function pct(made: number, attempts: number): string {
  return attempts > 0 ? `${Math.round((made / attempts) * 100)}%` : "—";
}

/**
 * Full-court chart that fills in over game time. "Shots" plots field goals;
 * "Game chart" adds every other play the feed places on the floor. Final
 * games replay once when scrolled into view; live games poll for new plays.
 */
export function GameShotChart({
  gameId,
  status,
  events: initialEvents,
  homeLabel,
  awayLabel,
  homeColor,
  awayColor,
  homeTeamKey,
  awayTeamKey,
  players = [],
}: {
  gameId: string;
  status: string;
  events: PlayByPlayEvent[];
  homeLabel: string;
  awayLabel: string;
  homeColor: string;
  awayColor: string;
  homeTeamKey?: string;
  awayTeamKey?: string;
  /** Box score roster, used to name players on markers and in the player filter. */
  players?: ShotChartPlayer[];
}) {
  const live = isLiveLikeStatus(status as GameStatusKind);
  // The route re-renders with fresh plays while live, and this chart also polls;
  // show whichever set reaches later so the two never fall out of step.
  const [polled, setPolled] = useState<PlayByPlayEvent[] | null>(null);
  const events = useMemo(() => fresherEvents(initialEvents, polled), [initialEvents, polled]);
  const lastPlay = useMemo(() => latestPlay(events), [events]);
  const { court, ticks, marks, fga } = useMemo(
    () => buildCourtEvents(events, homeLabel, awayLabel),
    [events, homeLabel, awayLabel]
  );
  const located = court.filter((c) => c.kind === "make" || c.kind === "miss").length;
  const maxPeriod = Math.max(4, ...marks.map((m) => m.period));
  const endT = Math.max(periodStart(maxPeriod + 1), ...marks.map((m) => m.t));
  /** Live games stop at the latest play; the rest of the track hasn't happened. */
  const nowT = live
    ? Math.min(endT, Math.max(0, ...court.map((c) => c.t), ...marks.map((m) => m.t)))
    : endT;

  const [mode, setMode] = useState<Mode>("shots");
  const [layers, setLayers] = useState<Set<Layer>>(() => new Set(LAYERS.map((l) => l.id)));
  // null = everything so far. Final games start empty and replay on view.
  const [cutoff, setCutoff] = useState<number | null>(live ? null : 0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(2);
  const [hover, setHover] = useState<CourtEvent | null>(null);
  const [pinned, setPinned] = useState<CourtEvent | null>(null);
  const [side, setSide] = useState<Side | null>(null);
  const [quarter, setQuarter] = useState<number | null>(null);
  const [player, setPlayer] = useState<string | null>(null);
  const [zone, setZone] = useState<ShotZone | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const introDone = useRef(live);
  const playhead = useRef(0);

  const seek = (t: number | null) => {
    playhead.current = t ?? 0;
    setCutoff(t);
  };

  useEffect(() => {
    const el = rootRef.current;
    if (!el || introDone.current) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || introDone.current) return;
        introDone.current = true;
        io.disconnect();
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          setCutoff(null);
        } else {
          playhead.current = 0;
          setCutoff(0);
          setPlaying(true);
        }
      },
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const rate = (2880 / BASE_REPLAY_SECONDS) * speed;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      playhead.current += dt * rate;
      if (playhead.current >= nowT) {
        setCutoff(null);
        setPlaying(false);
        return;
      }
      setCutoff(playhead.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, nowT]);

  useEffect(() => {
    if (!live) return;
    let stopped = false;
    const id = window.setInterval(async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/games/${encodeURIComponent(gameId)}/play-by-play`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const body = (await res.json()) as { data?: { events?: PlayByPlayEvent[] } };
        const next = body.data?.events;
        if (!stopped && next?.length) setPolled(next);
      } catch {
        // Keep the last good set; the next poll retries.
      }
    }, LIVE_POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [live, gameId]);

  const roster = useMemo(() => new Map(players.map((p) => [p.playerId, p])), [players]);
  const nameOf = (id: string | null) => (id ? (roster.get(id)?.name ?? null) : null);
  const colorOf = (s: Side) => (s === "home" ? homeColor : awayColor);
  const labelOf = (s: Side) => (s === "home" ? homeLabel : awayLabel);
  const teamKeyOf = (s: Side) => (s === "home" ? homeTeamKey : awayTeamKey);
  const playerSide = player ? (roster.get(player)?.side ?? null) : null;

  /** Layers a play counts toward for the current team or player filter. */
  const layersOf = (c: CourtEvent): Layer[] => {
    const mine = (id: string | null, s: Side) => (player ? id === player : !side || s === side);
    const out: Layer[] = [];
    switch (c.kind) {
      case "make":
        if (mine(c.playerId, c.side)) out.push("makes");
        if (c.assisted && mine(c.assistId, c.side)) out.push("assists");
        break;
      case "miss":
        if (mine(c.playerId, c.side)) out.push("misses");
        if (c.rebound && mine(c.rebound.playerId, c.rebound.side)) out.push("rebounds");
        if (c.blockedBy && mine(c.blockId, c.blockedBy)) out.push("blocks");
        break;
      case "steal":
        if (mine(c.playerId, c.side)) out.push("steals");
        if (player && c.stolenFromId === player) out.push("turnovers");
        break;
      case "turnover":
        if (mine(c.playerId, c.side)) out.push("turnovers");
        break;
      case "foul":
        if (mine(c.playerId, c.side)) out.push("fouls");
        break;
    }
    return out;
  };
  const isShotBy = (c: CourtEvent) =>
    (c.kind === "make" || c.kind === "miss") && (player ? c.playerId === player : !side || c.side === side);

  const at = cutoff ?? nowT;
  const inQuarter = (period: number) => quarter == null || period === quarter;
  const pool = court.filter((c) => (cutoff == null || c.t <= cutoff) && inQuarter(c.period));
  const shown =
    mode === "shots"
      ? pool.filter((c) => isShotBy(c) && (!zone || shotZone(c) === zone))
      : pool.filter((c) => layersOf(c).some((l) => layers.has(l)));
  const latest = shown.at(-1) ?? null;
  let mark: ScoreMark | null = null;
  for (const m of marks) {
    if (m.t <= at) mark = m;
    else break;
  }
  const keepTick = (k: StatTick) => inQuarter(k.period);
  const tally = tallyAt(ticks, cutoff, keepTick);
  const subjectTally = player ? playerTally(ticks, cutoff, player, keepTick) : null;
  const focus = hover ?? pinned;
  const ticker = focus ?? (playing || cutoff != null ? latest : null);
  const filtersOn = quarter != null || player != null || side != null || zone != null;

  const layerCount = (layer: Layer) => pool.filter((c) => layersOf(c).includes(layer)).length;

  const periods = Array.from(
    new Set([...court.map((c) => c.period), ...ticks.map((k) => k.period)])
  ).sort((a, b) => a - b);

  /** Players with at least one play in the current mode, busiest first. */
  const playerOptions = useMemo(() => {
    const counts = new Map<string, number>();
    const bump = (id: string | null) => {
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    };
    for (const c of court) {
      if (c.kind === "make" || c.kind === "miss") bump(c.playerId);
      if (mode === "shots") continue;
      if (c.kind !== "make" && c.kind !== "miss") bump(c.playerId);
      bump(c.assistId);
      bump(c.blockId);
      bump(c.stolenFromId);
      bump(c.rebound?.playerId ?? null);
    }
    const bySide = { away: [] as (ShotChartPlayer & { n: number })[], home: [] as (ShotChartPlayer & { n: number })[] };
    for (const p of players) {
      const n = counts.get(p.playerId) ?? 0;
      if (n > 0 && p.name) bySide[p.side].push({ ...p, n });
    }
    bySide.away.sort((a, b) => b.n - a.n);
    bySide.home.sort((a, b) => b.n - a.n);
    return bySide;
  }, [court, players, mode]);

  /** Located field goals by zone for each team, or for the selected player. */
  const zoneRows = SHOT_ZONES.map((z) => ({ ...z, away: { m: 0, a: 0 }, home: { m: 0, a: 0 }, mine: { m: 0, a: 0 } }));
  for (const c of pool) {
    const row = zoneRows.find((r) => r.id === shotZone(c));
    if (!row) continue;
    const made = c.kind === "make" ? 1 : 0;
    row[c.side].a++;
    row[c.side].m += made;
    if (player && c.playerId === player) {
      row.mine.a++;
      row.mine.m += made;
    }
  }

  if (located === 0) {
    return (
      <p className={cn(type.bodySm, "text-muted-foreground")}>
        {fga > 0
          ? "This game's play-by-play has no shot locations, so there's no chart to draw."
          : "Shots appear here once the play-by-play has field goal attempts."}
      </p>
    );
  }

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (cutoff == null || cutoff >= nowT) seek(0);
    setHover(null);
    setPinned(null);
    setPlaying(true);
  };

  const toggleLayer = (layer: Layer) =>
    setLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });

  const choosePlayer = (id: string | null) => {
    setPlayer(id);
    setSide(null);
    setPinned(null);
  };

  const clearFilters = () => {
    setQuarter(null);
    setPlayer(null);
    setSide(null);
    setZone(null);
    setPinned(null);
  };

  const tickerNote = (c: CourtEvent) => {
    if (mode !== "game" || c.kind !== "miss" || !c.rebound) return "";
    const kind = c.rebound.offensive ? "offensive" : "defensive";
    return ` · ${labelOf(c.rebound.side)} ${kind} rebound`;
  };

  /** Who the card features and what they did, from the filtered player's point of view when they were involved. */
  const cardFor = (c: CourtEvent): { id: string; side: Side; label: string } | null => {
    const value = c.three ? "three" : "two";
    const shooter = nameOf(c.playerId);
    const theirs = shooter ? `${shooter}'s ${value}` : `a ${value}`;
    if (player && c.playerId !== player) {
      const s = playerSide ?? c.side;
      if (c.assistId === player) return { id: player, side: s, label: `Assist on ${theirs}` };
      if (c.blockId === player) return { id: player, side: s, label: `Blocked ${theirs}` };
      if (c.rebound?.playerId === player)
        return { id: player, side: s, label: c.rebound.offensive ? "Offensive rebound" : "Defensive rebound" };
      if (c.stolenFromId === player) {
        const by = nameOf(c.playerId);
        return { id: player, side: s, label: by ? `Turnover, stolen by ${by}` : "Turnover, stolen" };
      }
    }
    if (!c.playerId) return null;
    let label: string;
    switch (c.kind) {
      case "make": {
        const by = nameOf(c.assistId);
        label = c.assisted ? (by ? `Made ${value}, assist by ${by}` : `Made ${value}, assisted`) : `Made ${value}`;
        break;
      }
      case "miss": {
        const by = nameOf(c.blockId);
        label = c.blockedBy ? (by ? `Missed ${value}, blocked by ${by}` : `Missed ${value}, blocked`) : `Missed ${value}`;
        break;
      }
      case "steal": {
        const from = nameOf(c.stolenFromId);
        label = from ? `Steal from ${from}` : "Steal";
        break;
      }
      case "turnover":
        label = "Turnover";
        break;
      case "foul":
        label = "Foul";
        break;
    }
    return { id: c.playerId, side: c.side, label };
  };

  const renderEvent = (c: CourtEvent) => {
    const { cx, cy } = toCourt(c);
    const color = colorOf(c.side);
    const isFocus = focus?.id === c.id;
    const grow = isFocus ? 1.5 : 1;
    const bg = "var(--background)";
    const own = mode === "game" ? new Set(layersOf(c).filter((l) => layers.has(l))) : null;
    let body: ReactNode;
    if (c.kind === "make") {
      const full = !own || own.has("makes");
      const ring = own != null && layers.has("assists") && c.assisted;
      body = (
        <>
          <circle cx={cx} cy={cy} r={0.8} fill={color} className="shot-ripple" />
          {ring ? (
            <circle
              cx={cx}
              cy={cy}
              r={1.35 * grow}
              fill="none"
              stroke={color}
              strokeWidth={own?.has("assists") ? 0.3 : 0.2}
              className="shot-miss"
            />
          ) : null}
          <circle
            cx={cx}
            cy={cy}
            r={(full ? 0.8 : 0.5) * grow}
            fill={color}
            stroke={bg}
            strokeWidth={0.22}
            className="shot-make"
          />
        </>
      );
    } else if (c.kind === "miss") {
      const strong = !own || own.has("misses");
      const rebound = own && layers.has("rebounds") ? c.rebound : null;
      const blocked = own && layers.has("blocks") ? c.blockedBy : null;
      body = (
        <g className="shot-miss">
          <circle
            cx={cx}
            cy={cy}
            r={0.65 * grow}
            fill="none"
            stroke={color}
            strokeWidth={0.26}
            strokeOpacity={isFocus ? 1 : strong ? 0.6 : 0.3}
          />
          {rebound ? (
            <circle cx={cx} cy={cy} r={(own?.has("rebounds") ? 0.38 : 0.3) * grow} fill={colorOf(rebound.side)} />
          ) : null}
          {blocked ? (
            <Cross cx={cx} cy={cy} r={0.75 * grow} fill="none" stroke={colorOf(blocked)} strokeWidth={0.3} />
          ) : null}
        </g>
      );
    } else if (c.kind === "steal") {
      body = <Diamond cx={cx} cy={cy} r={0.95 * grow} fill={color} stroke={bg} strokeWidth={0.2} className="shot-miss" />;
    } else if (c.kind === "turnover") {
      body = <Triangle cx={cx} cy={cy} r={0.85 * grow} fill="none" stroke={color} strokeWidth={0.26} className="shot-miss" />;
    } else {
      const s = 1.4 * grow;
      body = (
        <rect
          x={cx - s / 2}
          y={cy - s / 2}
          width={s}
          height={s}
          fill="none"
          stroke={color}
          strokeWidth={0.26}
          className="shot-miss"
        />
      );
    }
    return (
      <g
        key={c.id}
        className="cursor-pointer"
        onPointerEnter={() => setHover(c)}
        onClick={(e) => {
          e.stopPropagation();
          setPinned((p) => (p?.id === c.id ? null : c));
        }}
      >
        {body}
        <circle cx={cx} cy={cy} r={1.8} fill="transparent" />
      </g>
    );
  };

  const focusCard = () => {
    if (!focus) return null;
    const card = cardFor(focus);
    if (!card) return null;
    const name = nameOf(card.id);
    const isPinned = pinned?.id === focus.id;
    const { cx, cy } = toCourt(focus);
    const left = ((cx + 1) / (COURT_W + 2)) * 100;
    const top = ((cy + 1) / (COURT_H + 2)) * 100;
    const below = top < 32;
    const shiftX = left < 16 ? "-1rem" : left > 84 ? "calc(-100% + 1rem)" : "-50%";
    const shiftY = below ? "1rem" : "calc(-100% - 1rem)";
    const onlyThem = player === card.id;
    return (
      <div
        key={focus.id}
        className={cn("absolute z-10", isPinned ? "pointer-events-auto" : "pointer-events-none")}
        style={{ left: `${left}%`, top: `${top}%`, transform: `translate(${shiftX}, ${shiftY})` }}
      >
        <ChartTooltipSurface>
          <div className="flex items-center gap-2">
            <PlayerHeadshot playerId={card.id} name={name} teamKey={teamKeyOf(card.side)} size="xs" />
            <span className="flex flex-col">
              {name ? (
                isPinned ? (
                  <TransitionLink
                    href={`/players/${encodeURIComponent(card.id)}`}
                    className="font-semibold text-foreground underline-offset-2 hover:underline"
                  >
                    {name}
                  </TransitionLink>
                ) : (
                  <span className="font-semibold text-foreground">{name}</span>
                )
              ) : null}
              <span className="font-normal tabular-nums text-muted-foreground">
                {periodName(focus.period)} {focus.clock} · {card.label}
              </span>
              {isPinned && name ? (
                <button
                  type="button"
                  onClick={() => choosePlayer(onlyThem ? null : card.id)}
                  className="self-start font-semibold text-foreground underline underline-offset-2"
                >
                  {onlyThem ? "Show everyone" : `Show only ${name.split(" ")[0]}`}
                </button>
              ) : null}
            </span>
          </div>
        </ChartTooltipSurface>
      </div>
    );
  };

  const subjectName = nameOf(player);

  return (
    <div ref={rootRef} className="flex flex-col gap-3">
      <div role="tablist" aria-label="Chart type" className="flex flex-wrap gap-1.5">
        <Chip role="tab" active={mode === "shots"} onClick={() => setMode("shots")}>
          Shots
        </Chip>
        <Chip
          role="tab"
          active={mode === "game"}
          onClick={() => {
            setMode("game");
            setZone(null);
          }}
        >
          Game chart
        </Chip>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
        {(["away", "home"] as const).map((s, i) => {
          const dim = player ? playerSide !== s : side != null && side !== s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => {
                setPlayer(null);
                setSide((v) => (v === s && !player ? null : s));
              }}
              aria-pressed={side === s}
              className={cn(
                "min-w-0 rounded-md transition-opacity",
                i === 0 ? "order-1 text-left" : "order-3 text-right",
                dim && "opacity-45"
              )}
            >
              <span className={cn(type.title, "block font-bold")} style={{ color: colorOf(s) }}>
                {labelOf(s)}
              </span>
              <StatLine {...tally[s]} />
            </button>
          );
        })}
        <div className="order-2 text-center tabular-nums">
          <span className={cn(type.title, "block font-bold")}>
            {mark ? `${mark.away} – ${mark.home}` : "0 – 0"}
          </span>
          <span className={cn(type.caption, "block text-muted-foreground")}>
            {cutoff == null && !playing
              ? live
                ? lastPlay
                  ? `Plays through ${periodName(lastPlay.period)} ${lastPlay.clock}`
                  : "Live"
                : "Final"
              : mark
                ? `${periodName(mark.period)} ${mark.clock}`
                : "Tip-off"}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <div role="group" aria-label="Quarter" className="flex flex-wrap gap-1">
          <Chip active={quarter == null} onClick={() => setQuarter(null)}>
            All
          </Chip>
          {periods.map((p) => (
            <Chip key={p} active={quarter === p} onClick={() => setQuarter((q) => (q === p ? null : p))}>
              {periodName(p)}
            </Chip>
          ))}
        </div>
        <select
          aria-label="Player"
          value={player ?? ""}
          onChange={(e) => choosePlayer(e.target.value || null)}
          className={cn(
            type.caption,
            "glass-pill h-7 max-w-[14rem] cursor-pointer rounded-md border-0 px-2 font-semibold text-foreground outline-none",
            "focus-visible:ring-2 focus-visible:ring-ring"
          )}
        >
          <option value="">All players</option>
          {(["away", "home"] as const).map((s) =>
            playerOptions[s].length ? (
              <optgroup key={s} label={labelOf(s)}>
                {playerOptions[s].map((p) => (
                  <option key={p.playerId} value={p.playerId}>
                    {p.name} ({p.n})
                  </option>
                ))}
              </optgroup>
            ) : null
          )}
        </select>
        {filtersOn ? (
          <button
            type="button"
            onClick={clearFilters}
            className={cn(type.caption, "px-1.5 font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground")}
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {mode === "game" ? (
        <div className="flex flex-wrap gap-1.5" aria-label="Plays to show">
          {LAYERS.map((l) => {
            const on = layers.has(l.id);
            return (
              <button
                key={l.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleLayer(l.id)}
                className={cn(
                  type.caption,
                  "glass-pill flex items-center gap-1.5 rounded-md px-2 py-1 font-semibold tabular-nums transition-opacity",
                  on ? "text-foreground" : "text-muted-foreground opacity-55"
                )}
              >
                <LayerGlyph layer={l.id} />
                {l.label}
                <span className="font-normal text-muted-foreground">{layerCount(l.id)}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="relative">
        <svg
          viewBox={`-1 -1 ${COURT_W + 2} ${COURT_H + 2}`}
          className="block h-auto w-full select-none"
          role="img"
          aria-label={`${mode === "shots" ? "Shot chart" : "Game chart"}. ${awayLabel} attacks the left basket, ${homeLabel} the right.`}
          onPointerLeave={() => setHover(null)}
          onClick={() => setPinned(null)}
        >
          <rect x={0} y={0} width={COURT_W / 2} height={COURT_H} fill={awayColor} fillOpacity={0.07} />
          <rect x={COURT_W / 2} y={0} width={COURT_W / 2} height={COURT_H} fill={homeColor} fillOpacity={0.07} />
          <g
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.28}
            strokeWidth={1}
            className="text-foreground [&_*]:[vector-effect:non-scaling-stroke]"
          >
            <rect x={0} y={0} width={COURT_W} height={COURT_H} />
            <line x1={COURT_W / 2} x2={COURT_W / 2} y1={0} y2={COURT_H} />
            <circle cx={COURT_W / 2} cy={COURT_H / 2} r={6} />
            <circle cx={COURT_W / 2} cy={COURT_H / 2} r={2} />
            <CourtEnd />
            <g transform={`rotate(180 ${COURT_W / 2} ${COURT_H / 2})`}>
              <CourtEnd />
            </g>
          </g>

          {mode === "game"
            ? (["away", "home"] as const).map((s) => {
                const ft = subjectTally && playerSide === s ? subjectTally : tally[s];
                const x = s === "away" ? 19 : COURT_W - 19;
                const dim = player ? playerSide !== s : side != null && side !== s;
                return (
                  <text
                    key={s}
                    x={x}
                    y={COURT_H / 2 + 0.9}
                    textAnchor="middle"
                    fontSize={1.8}
                    fontWeight={700}
                    fill={colorOf(s)}
                    className="pointer-events-none tabular-nums"
                    opacity={dim ? 0.25 : 0.7}
                  >
                    FT {ft.ftm}-{ft.fta}
                  </text>
                );
              })
            : null}

          {shown.map(renderEvent)}

          {latest && (playing || cutoff != null) ? (
            <circle
              key={`latest-${latest.id}`}
              cx={toCourt(latest).cx}
              cy={toCourt(latest).cy}
              r={2}
              fill="none"
              stroke={colorOf(latest.side)}
              strokeWidth={0.25}
              className="shot-latest pointer-events-none"
            />
          ) : null}

          {shown.length === 0 && filtersOn && cutoff == null ? (
            <text
              x={COURT_W / 2}
              y={COURT_H / 2 - 9}
              textAnchor="middle"
              fontSize={2.2}
              className="pointer-events-none fill-muted-foreground"
            >
              No plays match these filters
            </text>
          ) : null}
        </svg>
        {focusCard()}
      </div>

      <p
        className={cn(type.caption, "line-clamp-2 h-10 text-muted-foreground sm:line-clamp-1 sm:h-5")}
        aria-live="polite"
      >
        {ticker ? (
          <>
            <span className="font-semibold tabular-nums text-foreground">
              {periodName(ticker.period)} {ticker.clock}
            </span>{" "}
            {ticker.description}
            {tickerNote(ticker)}
          </>
        ) : mode === "shots" ? (
          "Filled dots are makes, rings are misses. Tap a dot to pin it, or a team to isolate its shots."
        ) : (
          "Markers take the color of the team credited with the play. Tap a marker to pin it, or a team to isolate it."
        )}
      </p>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          className={cn(type.caption, "glass-pill shrink-0 rounded-md px-3 py-1.5 font-semibold")}
        >
          {playing ? "Pause" : cutoff == null ? "Replay" : "Play"}
        </button>
        <div className="relative min-w-0 flex-1">
          <div className="relative">
          <input
            type="range"
            min={0}
            max={endT}
            step={1}
            value={Math.round(at)}
            aria-label="Game time"
            onChange={(e) => {
              setPlaying(false);
              setHover(null);
              setPinned(null);
              const v = Math.min(Number(e.target.value), nowT);
              seek(v >= nowT ? null : v);
            }}
            className="w-full accent-current"
          />
          {nowT < endT ? (
            <span
              aria-hidden
              title="No plays logged past this point yet"
              className="pointer-events-none absolute top-1/2 right-0 h-1.5 -translate-y-1/2 rounded-r-full bg-[repeating-linear-gradient(135deg,var(--border)_0_3px,transparent_3px_6px)]"
              style={{ left: `${(nowT / endT) * 100}%` }}
            />
          ) : null}
          </div>
          <div className={cn(type.micro, "relative h-4 text-muted-foreground")}>
            {Array.from({ length: maxPeriod }, (_, i) => i + 1).map((p) => (
              <span
                key={p}
                className="absolute -translate-x-1/2"
                style={{
                  left: `${((periodStart(p) + (Math.min(periodStart(p + 1), endT) - periodStart(p)) / 2) / endT) * 100}%`,
                }}
              >
                {periodName(p)}
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length]!)}
          className={cn(type.caption, "glass-pill shrink-0 rounded-md px-2.5 py-1.5 font-semibold tabular-nums")}
          aria-label={`Replay speed ${speed}x`}
        >
          {speed}×
        </button>
      </div>

      {mode === "shots" ? (
        <div className="board-scroll-host overflow-x-auto rounded-md">
          <table className="w-full min-w-[20rem] table-fixed text-right">
            <colgroup>
              <col className="w-[34%]" />
            </colgroup>
            <thead className={cn(type.caption, "uppercase tracking-wide text-muted-foreground")}>
              <tr className="border-b border-border/60">
                <th className="py-1.5 pr-2 text-left font-semibold">Zone</th>
                {player ? (
                  <th className="px-2 py-1.5 font-semibold" colSpan={2}>
                    {subjectName ?? "Player"}
                  </th>
                ) : (
                  (["away", "home"] as const).map((s) => (
                    <th key={s} className="px-2 py-1.5 font-semibold" colSpan={2} style={{ color: colorOf(s) }}>
                      {labelOf(s)}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody className={cn(type.caption, "tabular-nums")}>
              {zoneRows.map((row) => {
                const active = zone === row.id;
                const cells = player ? [row.mine] : [row.away, row.home];
                return (
                  <tr
                    key={row.id}
                    className={cn("border-b border-border/40 transition-colors", active && "bg-foreground/[0.06]")}
                  >
                    <th scope="row" className="py-0 pr-2 text-left font-semibold">
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => setZone((z) => (z === row.id ? null : row.id))}
                        className={cn(
                          "w-full py-1.5 text-left underline-offset-2 hover:underline",
                          zone && !active && "text-muted-foreground"
                        )}
                      >
                        {row.label}
                      </button>
                    </th>
                    {cells.map((cell, i) => (
                      <FgCells key={i} made={cell.m} attempts={cell.a} dim={!player && side != null && side !== (i === 0 ? "away" : "home")} />
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="board-scroll-host overflow-x-auto rounded-md">
          <table className="w-full min-w-[34rem] table-fixed text-right">
            <colgroup>
              <col className="w-[16%]" />
            </colgroup>
            <thead className={cn(type.caption, "uppercase tracking-wide text-muted-foreground")}>
              <tr className="border-b border-border/60">
                <th className="py-1.5 pr-2 text-left font-semibold">{player ? "Line" : "Team"}</th>
                {STAT_COLUMNS.map((col) => (
                  <th key={col.label} title={col.title} className="px-2 py-1.5 font-semibold">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={cn(type.caption, "tabular-nums")}>
              {(["away", "home"] as const).map((s) => (
                <tr key={s} className={cn("border-b border-border/40", player && "text-muted-foreground")}>
                  <td className="py-1.5 pr-2 text-left font-bold" style={{ color: colorOf(s) }}>
                    {labelOf(s)}
                  </td>
                  {STAT_COLUMNS.map((col) => (
                    <td key={col.label} className="px-2 py-1.5">
                      {col.value(tally[s])}
                    </td>
                  ))}
                </tr>
              ))}
              {subjectTally && player ? (
                <tr className="border-b border-border/40 bg-foreground/[0.04] font-semibold">
                  <td className="max-w-[9rem] truncate py-1.5 pr-2 text-left">{subjectName ?? "Player"}</td>
                  {STAT_COLUMNS.map((col) => (
                    <td key={col.label} className="px-2 py-1.5">
                      {col.value(subjectTally)}
                    </td>
                  ))}
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      <p className={cn(type.micro, "text-muted-foreground")}>
        {mode === "game"
          ? "Spots are as logged in the play-by-play, drawn on a half court from the basket being attacked. Rebounds have no spot of their own, so the dot inside each miss shows who got the ball. Free throws have no spot and only show at each line as a running count. "
          : `Zones use located attempts only${located < fga ? `, ${located} of ${fga} this game` : ""}. Tap a zone to show just those shots. `}
        Counts come from play-by-play and can differ slightly from the official box score, for example on heaves or stat corrections made after the game.
      </p>
    </div>
  );
}

function FgCells({ made, attempts, dim }: { made: number; attempts: number; dim?: boolean }) {
  return (
    <>
      <td className={cn("px-2 py-1.5", dim && "opacity-45")}>{attempts > 0 ? `${made}-${attempts}` : "—"}</td>
      <td className={cn("px-2 py-1.5 text-muted-foreground", dim && "opacity-45")}>{pct(made, attempts)}</td>
    </>
  );
}
