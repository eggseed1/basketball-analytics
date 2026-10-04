"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode, type SVGProps } from "react";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import type { PlayByPlayEvent } from "@/data/types";
import { type } from "@/lib/design-system";
import {
  buildCourtEvents,
  periodName,
  periodStart,
  tallyAt,
  type CourtEvent,
  type ScoreMark,
  type Side,
  type SideTally,
} from "@/lib/games/court-events";
import { isLiveLikeStatus, type GameStatusKind } from "@/lib/game-status";
import { cn } from "@/lib/utils";

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
  { id: "assists", label: "Assisted" },
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

/** Feed spot (feet from the attacked rim) → full-court position. */
function toCourt(ev: CourtEvent): { cx: number; cy: number } {
  const along = RIM_FROM_BASELINE + ev.y;
  const cx = ev.attack === "away" ? along : COURT_W - along;
  const cy = ev.attack === "away" ? COURT_H / 2 + ev.x : COURT_H / 2 - ev.x;
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

function playLabel(c: CourtEvent): string {
  const value = c.three ? "three" : "two";
  switch (c.kind) {
    case "make":
      return c.assisted ? `Made ${value}, assisted` : `Made ${value}`;
    case "miss":
      return c.blockedBy ? `Missed ${value}, blocked` : `Missed ${value}`;
    case "steal":
      return "Steal";
    case "turnover":
      return "Turnover";
    case "foul":
      return "Foul";
  }
}

function ModeChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        type.caption,
        "glass-pill rounded-md px-2.5 py-1 font-semibold transition-colors",
        active ? "glass-pill-active" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
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
  /** Box score roster, used to name the player on a hovered marker. */
  players?: ShotChartPlayer[];
}) {
  const live = isLiveLikeStatus(status as GameStatusKind);
  const [events, setEvents] = useState(initialEvents);
  const { court, ticks, marks, fga } = useMemo(
    () => buildCourtEvents(events, homeLabel, awayLabel),
    [events, homeLabel, awayLabel]
  );
  const located = court.filter((c) => c.kind === "make" || c.kind === "miss").length;
  const maxPeriod = Math.max(4, ...marks.map((m) => m.period));
  const endT = Math.max(periodStart(maxPeriod + 1), ...marks.map((m) => m.t));

  const [mode, setMode] = useState<Mode>("shots");
  const [layers, setLayers] = useState<Set<Layer>>(() => new Set(LAYERS.map((l) => l.id)));
  // null = everything so far. Final games start empty and replay on view.
  const [cutoff, setCutoff] = useState<number | null>(live ? null : 0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(2);
  const [focus, setFocus] = useState<CourtEvent | null>(null);
  const [side, setSide] = useState<Side | null>(null);
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
      if (playhead.current >= endT) {
        setCutoff(null);
        setPlaying(false);
        return;
      }
      setCutoff(playhead.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, endT]);

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
        if (!stopped && next?.length) {
          setEvents((prev) => (next.length >= prev.length ? next : prev));
        }
      } catch {
        // Keep the last good set; the next poll retries.
      }
    }, LIVE_POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [live, gameId]);

  const at = cutoff ?? endT;
  const visible = cutoff == null ? court : court.filter((c) => c.t <= cutoff);
  const inMode = visible.filter((c) =>
    mode === "shots"
      ? c.kind === "make" || c.kind === "miss"
      : c.kind === "make"
        ? layers.has("makes") || (layers.has("assists") && c.assisted)
        : c.kind === "miss"
          ? layers.has("misses") ||
            (layers.has("rebounds") && c.rebound != null) ||
            (layers.has("blocks") && c.blockedBy != null)
          : layers.has(c.kind === "steal" ? "steals" : c.kind === "turnover" ? "turnovers" : "fouls")
  );
  const shown = side
    ? inMode.filter((c) => c.side === side || (c.blockedBy === side && layers.has("blocks")))
    : inMode;
  const latest = inMode.at(-1) ?? null;
  let mark: ScoreMark | null = null;
  for (const m of marks) {
    if (m.t <= at) mark = m;
    else break;
  }
  const tally = useMemo(() => tallyAt(ticks, cutoff), [ticks, cutoff]);
  const ticker = focus ?? (playing || cutoff != null ? latest : null);
  const colorOf = (s: Side) => (s === "home" ? homeColor : awayColor);
  const labelOf = (s: Side) => (s === "home" ? homeLabel : awayLabel);
  const playerById = useMemo(() => new Map(players.map((p) => [p.playerId, p])), [players]);

  /** Player the marker credits. Steals list the ball handler, so the stealer comes from the play text. */
  const playerFor = (c: CourtEvent): ShotChartPlayer | null => {
    if (c.kind === "steal") {
      const name = /\(([^()]+?) steals?\)/i.exec(c.description)?.[1]?.trim().toLowerCase();
      if (!name) return null;
      return players.find((p) => p.side === c.side && p.name?.toLowerCase() === name) ?? null;
    }
    if (!c.playerId) return null;
    return playerById.get(c.playerId) ?? { playerId: c.playerId, name: null, side: c.side };
  };

  const layerCount = (layer: Layer) => {
    const pool = side ? visible.filter((c) => c.side === side) : visible;
    switch (layer) {
      case "makes":
        return pool.filter((c) => c.kind === "make").length;
      case "misses":
        return pool.filter((c) => c.kind === "miss").length;
      case "assists":
        return pool.filter((c) => c.assisted).length;
      case "rebounds":
        return pool.filter((c) => c.rebound).length;
      case "blocks":
        return (side ? visible.filter((c) => c.blockedBy === side) : visible.filter((c) => c.blockedBy)).length;
      case "steals":
        return pool.filter((c) => c.kind === "steal").length;
      case "turnovers":
        return pool.filter((c) => c.kind === "turnover").length;
      case "fouls":
        return pool.filter((c) => c.kind === "foul").length;
    }
  };

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
    if (cutoff == null || cutoff >= endT) seek(0);
    setFocus(null);
    setPlaying(true);
  };

  const toggleLayer = (layer: Layer) =>
    setLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });

  const tickerNote = (c: CourtEvent) => {
    if (mode !== "game" || c.kind !== "miss" || !c.rebound) return "";
    const kind = c.rebound.offensive ? "offensive" : "defensive";
    return ` · ${labelOf(c.rebound.side)} ${kind} rebound`;
  };

  const renderEvent = (c: CourtEvent) => {
    const { cx, cy } = toCourt(c);
    const color = colorOf(c.side);
    const isFocus = focus?.id === c.id;
    const grow = isFocus ? 1.5 : 1;
    const bg = "var(--background)";
    let body: ReactNode;
    if (c.kind === "make") {
      const showMake = mode === "shots" || layers.has("makes");
      const ring = mode === "game" && layers.has("assists") && c.assisted;
      body = (
        <>
          <circle cx={cx} cy={cy} r={0.8} fill={color} className="shot-ripple" />
          {ring ? (
            <circle cx={cx} cy={cy} r={1.35 * grow} fill="none" stroke={color} strokeWidth={0.2} className="shot-miss" />
          ) : null}
          <circle
            cx={cx}
            cy={cy}
            r={(showMake ? 0.8 : 0.5) * grow}
            fill={color}
            stroke={bg}
            strokeWidth={0.22}
            className="shot-make"
          />
        </>
      );
    } else if (c.kind === "miss") {
      const rebound = mode === "game" && layers.has("rebounds") ? c.rebound : null;
      const blocked = mode === "game" && layers.has("blocks") ? c.blockedBy : null;
      body = (
        <g className="shot-miss">
          <circle
            cx={cx}
            cy={cy}
            r={0.65 * grow}
            fill="none"
            stroke={color}
            strokeWidth={0.26}
            strokeOpacity={isFocus ? 1 : mode === "game" && !layers.has("misses") ? 0.3 : 0.6}
          />
          {rebound ? <circle cx={cx} cy={cy} r={0.3 * grow} fill={colorOf(rebound.side)} /> : null}
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
      <g key={c.id} className="cursor-pointer" onPointerEnter={() => setFocus(c)} onClick={() => setFocus(c)}>
        {body}
        <circle cx={cx} cy={cy} r={1.8} fill="transparent" />
      </g>
    );
  };

  const focusCard = () => {
    if (!focus) return null;
    const who = playerFor(focus);
    if (!who) return null;
    const { cx, cy } = toCourt(focus);
    const left = ((cx + 1) / (COURT_W + 2)) * 100;
    const top = ((cy + 1) / (COURT_H + 2)) * 100;
    const below = top < 32;
    const shiftX = left < 16 ? "-1rem" : left > 84 ? "calc(-100% + 1rem)" : "-50%";
    const shiftY = below ? "1rem" : "calc(-100% - 1rem)";
    return (
      <div
        key={focus.id}
        className="pointer-events-none absolute z-10 flex items-center gap-2 whitespace-nowrap rounded-lg border border-border/60 bg-background/95 py-1.5 pl-1.5 pr-3 shadow-lg backdrop-blur-sm"
        style={{ left: `${left}%`, top: `${top}%`, transform: `translate(${shiftX}, ${shiftY})` }}
        aria-hidden
      >
        <PlayerHeadshot
          playerId={who.playerId}
          name={who.name}
          teamKey={who.side === "home" ? homeTeamKey : awayTeamKey}
          size="sm"
        />
        <span className="flex flex-col">
          {who.name ? <span className={cn(type.caption, "font-bold text-foreground")}>{who.name}</span> : null}
          <span className={cn(type.micro, "tabular-nums text-muted-foreground")}>
            {periodName(focus.period)} {focus.clock} · {playLabel(focus)}
          </span>
        </span>
      </div>
    );
  };

  return (
    <div ref={rootRef} className="flex flex-col gap-3">
      <div role="tablist" aria-label="Chart type" className="flex flex-wrap gap-1.5">
        <ModeChip active={mode === "shots"} onClick={() => setMode("shots")}>
          Shots
        </ModeChip>
        <ModeChip active={mode === "game"} onClick={() => setMode("game")}>
          Game chart
        </ModeChip>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
        {(["away", "home"] as const).map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => setSide((v) => (v === s ? null : s))}
            aria-pressed={side === s}
            className={cn(
              "min-w-0 rounded-md transition-opacity",
              i === 0 ? "order-1 text-left" : "order-3 text-right",
              side && side !== s && "opacity-45"
            )}
          >
            <span className={cn(type.title, "block font-bold")} style={{ color: colorOf(s) }}>
              {labelOf(s)}
            </span>
            <StatLine {...tally[s]} />
          </button>
        ))}
        <div className="order-2 text-center tabular-nums">
          <span className={cn(type.title, "block font-bold")}>
            {mark ? `${mark.away} – ${mark.home}` : "0 – 0"}
          </span>
          <span className={cn(type.caption, "block text-muted-foreground")}>
            {cutoff == null && !playing
              ? live
                ? "Live"
                : "Final"
              : mark
                ? `${periodName(mark.period)} ${mark.clock}`
                : "Tip-off"}
          </span>
        </div>
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
          onPointerLeave={() => setFocus(null)}
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
                const ft = tally[s];
                const x = s === "away" ? 19 : COURT_W - 19;
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
                    opacity={side && side !== s ? 0.25 : 0.7}
                  >
                    FT {ft.ftm}-{ft.fta}
                  </text>
                );
              })
            : null}

          {shown.map(renderEvent)}

          {latest && (playing || cutoff != null) && (!side || latest.side === side) ? (
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
          "Filled dots are makes, rings are misses. Tap a team to isolate its shots."
        ) : (
          "Markers take the color of the team credited with the play. Tap a team to isolate it."
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
          <input
            type="range"
            min={0}
            max={endT}
            step={1}
            value={Math.round(at)}
            aria-label="Game time"
            onChange={(e) => {
              setPlaying(false);
              setFocus(null);
              const v = Number(e.target.value);
              seek(v >= endT ? null : v);
            }}
            className="w-full accent-current"
          />
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

      {mode === "game" ? (
        <div className="board-scroll-host overflow-x-auto rounded-md">
          <table className="w-full min-w-[34rem] text-right">
            <thead className={cn(type.caption, "uppercase tracking-wide text-muted-foreground")}>
              <tr className="border-b border-border/60">
                <th className="py-1.5 pr-2 text-left font-semibold">Team</th>
                {STAT_COLUMNS.map((col) => (
                  <th key={col.label} title={col.title} className="px-2 py-1.5 font-semibold">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={cn(type.caption, "tabular-nums")}>
              {(["away", "home"] as const).map((s) => (
                <tr key={s} className="border-b border-border/40">
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
            </tbody>
          </table>
        </div>
      ) : null}

      <p className={cn(type.micro, "text-muted-foreground")}>
        {mode === "game"
          ? "Spots are ESPN's, logged on a half court from the basket being attacked. Rebounds have no spot of their own, so the dot inside each miss shows who got the ball. Free throws have no spot and only show at each line as a running count. "
          : located < fga
            ? `${located} of ${fga} field goal attempts have a location. `
            : ""}
        Counts come from play-by-play and can differ slightly from the official box score, for example on heaves or stat corrections made after the game.
      </p>
    </div>
  );
}
