"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { PlayByPlayEvent } from "@/data/types";
import { type } from "@/lib/design-system";
import { isLiveLikeStatus, type GameStatusKind } from "@/lib/game-status";
import { cn } from "@/lib/utils";

type Side = "home" | "away";

interface CourtShot {
  id: string;
  side: Side;
  made: boolean;
  three: boolean;
  /** Court position in feet on a 94 x 50 floor. */
  cx: number;
  cy: number;
  t: number;
  period: number;
  clock: string;
  description: string;
}

interface ScoreMark {
  t: number;
  home: number;
  away: number;
  period: number;
  clock: string;
}

const COURT_W = 94;
const COURT_H = 50;
const RIM_FROM_BASELINE = 5.25;
const SPEEDS = [1, 2, 4] as const;
/** Real seconds a full regulation replay takes at 1x. */
const BASE_REPLAY_SECONDS = 40;
const LIVE_POLL_MS = 20_000;

function elapsedSeconds(period: number, clockSeconds: number): number {
  if (period <= 4) return (period - 1) * 720 + (720 - clockSeconds);
  return 2880 + (period - 5) * 300 + (300 - clockSeconds);
}

function periodStart(period: number): number {
  return period <= 4 ? (period - 1) * 720 : 2880 + (period - 5) * 300;
}

function periodName(period: number): string {
  if (period <= 4) return `Q${period}`;
  return period === 5 ? "OT" : `${period - 4}OT`;
}

/** Learn which feed team id is home/away from who the scoreboard credits. */
function teamSides(
  events: PlayByPlayEvent[],
  homeLabel: string,
  awayLabel: string
): Map<string, Side> {
  const votes = new Map<string, { home: number; away: number }>();
  let home = 0;
  let away = 0;
  for (const e of events) {
    const key = e.teamId ?? e.teamTricode;
    if (key && (e.scoreHome !== home || e.scoreAway !== away)) {
      const v = votes.get(key) ?? { home: 0, away: 0 };
      if (e.scoreHome > home && e.scoreAway === away) v.home++;
      if (e.scoreAway > away && e.scoreHome === home) v.away++;
      votes.set(key, v);
    }
    if (e.scoreHome + e.scoreAway >= home + away) {
      home = e.scoreHome;
      away = e.scoreAway;
    }
  }
  const sides = new Map<string, Side>();
  for (const [key, v] of votes) {
    if (v.home !== v.away) sides.set(key, v.home > v.away ? "home" : "away");
  }
  for (const e of events) {
    const key = e.teamId ?? e.teamTricode;
    if (!key || sides.has(key)) continue;
    if (e.teamTricode === homeLabel) sides.set(key, "home");
    else if (e.teamTricode === awayLabel) sides.set(key, "away");
  }
  return sides;
}

function buildShots(
  events: PlayByPlayEvent[],
  homeLabel: string,
  awayLabel: string
): { shots: CourtShot[]; marks: ScoreMark[]; attempts: number } {
  const sides = teamSides(events, homeLabel, awayLabel);
  const shots: CourtShot[] = [];
  const marks: ScoreMark[] = [];
  let attempts = 0;
  for (const e of events) {
    if (!e.period) continue;
    const t = elapsedSeconds(e.period, e.clockSeconds);
    marks.push({ t, home: e.scoreHome, away: e.scoreAway, period: e.period, clock: e.clock });
    if (!e.isFieldGoal || !e.shotResult) continue;
    attempts++;
    const side = sides.get(e.teamId ?? e.teamTricode ?? "");
    if (!side || e.shotX == null || e.shotY == null) continue;
    // Away shoots at the left basket, home at the right (rotated 180°).
    const along = RIM_FROM_BASELINE + e.shotY;
    const cx = side === "away" ? along : COURT_W - along;
    const cy = side === "away" ? COURT_H / 2 + e.shotX : COURT_H / 2 - e.shotX;
    shots.push({
      id: e.id,
      side,
      made: e.shotResult === "Made",
      three: e.actionType === "3pt",
      cx: Math.min(Math.max(cx, 0.6), COURT_W - 0.6),
      cy: Math.min(Math.max(cy, 0.6), COURT_H - 0.6),
      t,
      period: e.period,
      clock: e.clock,
      description: e.description,
    });
  }
  shots.sort((a, b) => a.t - b.t);
  return { shots, marks, attempts };
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

function sideLine(shots: CourtShot[], side: Side) {
  let fgm = 0;
  let fga = 0;
  let tpm = 0;
  let tpa = 0;
  for (const s of shots) {
    if (s.side !== side) continue;
    fga++;
    if (s.made) fgm++;
    if (s.three) {
      tpa++;
      if (s.made) tpm++;
    }
  }
  return { fgm, fga, tpm, tpa };
}

function StatLine({ line }: { line: ReturnType<typeof sideLine> }) {
  return (
    <span className={cn(type.caption, "block tabular-nums text-muted-foreground")}>
      <span className="block sm:inline">
        {line.fgm}-{line.fga} FG
      </span>
      <span className="hidden sm:inline"> · </span>
      <span className="block sm:inline">
        {line.tpm}-{line.tpa} 3P
      </span>
    </span>
  );
}

/**
 * Full-court shot chart that fills in over game time. Final games replay
 * once when scrolled into view; live games poll and animate new shots.
 */
export function GameShotChart({
  gameId,
  status,
  events: initialEvents,
  homeLabel,
  awayLabel,
  homeColor,
  awayColor,
}: {
  gameId: string;
  status: string;
  events: PlayByPlayEvent[];
  homeLabel: string;
  awayLabel: string;
  homeColor: string;
  awayColor: string;
}) {
  const live = isLiveLikeStatus(status as GameStatusKind);
  const [events, setEvents] = useState(initialEvents);
  const { shots, marks, attempts } = useMemo(
    () => buildShots(events, homeLabel, awayLabel),
    [events, homeLabel, awayLabel]
  );
  const maxPeriod = Math.max(4, ...marks.map((m) => m.period));
  const endT = Math.max(periodStart(maxPeriod + 1), ...marks.map((m) => m.t));

  // null = everything so far. Final games start empty and replay on view.
  const [cutoff, setCutoff] = useState<number | null>(live ? null : 0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(2);
  const [focus, setFocus] = useState<CourtShot | null>(null);
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

  const visible = cutoff == null ? shots : shots.filter((s) => s.t <= cutoff);
  const shown = side ? visible.filter((s) => s.side === side) : visible;
  const latest = visible.at(-1) ?? null;
  const at = cutoff ?? endT;
  let mark: ScoreMark | null = null;
  for (const m of marks) {
    if (m.t <= at) mark = m;
    else break;
  }
  const away = sideLine(visible, "away");
  const home = sideLine(visible, "home");
  const ticker = focus ?? (playing || cutoff != null ? latest : null);

  if (shots.length === 0) {
    return (
      <p className={cn(type.bodySm, "text-muted-foreground")}>
        {attempts > 0
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

  const statLine = (s: ReturnType<typeof sideLine>) =>
    `${s.fgm}-${s.fga} FG · ${s.tpm}-${s.tpa} 3P`;

  return (
    <div ref={rootRef} className="flex flex-col gap-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
        <button
          type="button"
          onClick={() => setSide((v) => (v === "away" ? null : "away"))}
          aria-pressed={side === "away"}
          className={cn(
            "min-w-0 rounded-md text-left transition-opacity",
            side === "home" && "opacity-45"
          )}
        >
          <span className={cn(type.title, "block font-bold")} style={{ color: awayColor }}>
            {awayLabel}
          </span>
          <StatLine line={away} />
        </button>
        <div className="text-center tabular-nums">
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
        <button
          type="button"
          onClick={() => setSide((v) => (v === "home" ? null : "home"))}
          aria-pressed={side === "home"}
          className={cn(
            "min-w-0 rounded-md text-right transition-opacity",
            side === "away" && "opacity-45"
          )}
        >
          <span className={cn(type.title, "block font-bold")} style={{ color: homeColor }}>
            {homeLabel}
          </span>
          <StatLine line={home} />
        </button>
      </div>

      <svg
        viewBox={`-1 -1 ${COURT_W + 2} ${COURT_H + 2}`}
        className="block h-auto w-full select-none"
        role="img"
        aria-label={`Shot chart. ${awayLabel} ${statLine(away)}, shooting at the left basket. ${homeLabel} ${statLine(home)}, shooting at the right basket.`}
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

        {shown.map((s) => {
          const color = s.side === "home" ? homeColor : awayColor;
          const isFocus = focus?.id === s.id;
          return (
            <g
              key={s.id}
              className="cursor-pointer"
              onPointerEnter={() => setFocus(s)}
              onClick={() => setFocus(s)}
            >
              {s.made ? (
                <>
                  <circle cx={s.cx} cy={s.cy} r={0.8} fill={color} className="shot-ripple" />
                  <circle
                    cx={s.cx}
                    cy={s.cy}
                    r={isFocus ? 1.25 : 0.8}
                    fill={color}
                    stroke="var(--background)"
                    strokeWidth={0.22}
                    className="shot-make"
                  />
                </>
              ) : (
                <circle
                  cx={s.cx}
                  cy={s.cy}
                  r={isFocus ? 1.1 : 0.65}
                  fill="none"
                  stroke={color}
                  strokeWidth={0.26}
                  strokeOpacity={isFocus ? 1 : 0.6}
                  className="shot-miss"
                />
              )}
              <circle cx={s.cx} cy={s.cy} r={1.8} fill="transparent" />
            </g>
          );
        })}

        {latest && (playing || cutoff != null) && (!side || latest.side === side) ? (
          <circle
            key={`latest-${latest.id}`}
            cx={latest.cx}
            cy={latest.cy}
            r={2}
            fill="none"
            stroke={latest.side === "home" ? homeColor : awayColor}
            strokeWidth={0.25}
            className="shot-latest pointer-events-none"
          />
        ) : null}
      </svg>

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
          </>
        ) : (
          "Filled dots are makes, rings are misses. Tap a team to isolate its shots."
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

      <p className={cn(type.micro, "text-muted-foreground")}>
        {shots.length < attempts
          ? `${shots.length} of ${attempts} field goal attempts have a location. `
          : ""}
        Counts come from play-by-play and can differ from the box score by a heave or two.
      </p>
    </div>
  );
}
