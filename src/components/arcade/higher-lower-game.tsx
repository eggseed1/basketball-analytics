"use client";

import { ArrowDown, ArrowUp, Check, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import {
  HIGHER_LOWER_STATS,
  higherLowerPool,
  judgeHigherLower,
  nextHigherLowerRow,
  type HigherLowerStat,
} from "@/arcade/higher-lower";
import { playerLabel, type ArcadeLeague, type ArcadeRow } from "@/arcade/league";
import { isTeamCode, teamName } from "@/arcade/teams";
import { ArcadeLoading, PlayerAvatar, useBestScore } from "@/components/arcade/arcade-parts";
import {
  reducedMotion,
  reelStrip,
  SlotMachine,
  slotSpinMs,
  SpinButton,
  type SlotReel,
} from "@/components/arcade/slot-machine";
import { arcadeTeamLook } from "@/components/arcade/team-look";
import { useArcadeLeague } from "@/components/arcade/use-arcade-league";
import { HistoricalTeamMark } from "@/components/brand/historical-team-mark";
import { Button } from "@/components/ui/button";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

type Round = { stat: HigherLowerStat; pool: ArcadeRow[]; shown: ArcadeRow; hidden: ArcadeRow };
type Outcome = { guess: "higher" | "lower"; correct: boolean } | null;

function teamsLabel(row: ArcadeRow): string {
  return row.teams.filter(isTeamCode).map(teamName).join(" / ");
}

function StatCell({ stat }: { stat: HigherLowerStat }) {
  return (
    <span className="flex min-w-0 items-baseline gap-2.5">
      <span className="score-num text-[1.7rem] leading-none">{stat.short}</span>
      {stat.label !== stat.short ? (
        <span className="truncate text-[13px] font-semibold text-neutral-500">{stat.label}</span>
      ) : null}
    </span>
  );
}

const IDLE_REEL: SlotReel[] = [
  { cells: HIGHER_LOWER_STATS.slice(0, 3).map((stat) => <StatCell key={stat.id} stat={stat} />) },
];

/** Counts from 0 up to `value` once `run` turns on. */
function useCountUp(value: number | null, run: boolean, ms = 650): number | null {
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (!run || value == null) return;
    if (reducedMotion()) {
      const id = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(id);
    }
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / ms);
      setShown(value * (1 - (1 - t) ** 3));
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [value, run, ms]);
  return run ? shown : null;
}

export function HigherLowerGame() {
  const { league, failed, retry } = useArcadeLeague();
  if (!league) return <ArcadeLoading failed={failed} onRetry={retry} />;
  return <HigherLowerBoard league={league} />;
}

function HigherLowerBoard({ league }: { league: ArcadeLeague }) {
  const [round, setRound] = useState<Round | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [streak, setStreak] = useState(0);
  const [over, setOver] = useState(false);
  const [best, saveBest] = useBestScore("drbl-arcade-higher-lower-best");
  const [spinId, setSpinId] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [reels, setReels] = useState<SlotReel[]>(IDLE_REEL);
  const advance = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (advance.current) clearTimeout(advance.current);
  }, []);

  function start(stat: HigherLowerStat) {
    const pool = higherLowerPool(league, stat);
    const shown = nextHigherLowerRow(pool, stat, null);
    setRound({ stat, pool, shown, hidden: nextHigherLowerRow(pool, stat, shown) });
    setOutcome(null);
    setStreak(0);
    setOver(false);
  }

  function spin() {
    if (spinning) return;
    const stat = HIGHER_LOWER_STATS[Math.floor(Math.random() * HIGHER_LOWER_STATS.length)]!;
    setReels([{ cells: reelStrip(HIGHER_LOWER_STATS, stat, 18).map((s, i) => <StatCell key={i} stat={s} />) }]);
    setSpinId((id) => id + 1);
    setSpinning(true);
    if (advance.current) clearTimeout(advance.current);
    advance.current = setTimeout(() => {
      setSpinning(false);
      start(stat);
    }, slotSpinMs(1) + 450);
  }

  function guess(choice: "higher" | "lower") {
    if (!round || outcome) return;
    const { stat, pool, shown, hidden } = round;
    const correct = judgeHigherLower(choice, stat.value(shown)!, stat.value(hidden)!);
    setOutcome({ guess: choice, correct });
    if (!correct) {
      setOver(true);
      saveBest(streak);
      return;
    }
    const nextStreak = streak + 1;
    setStreak(nextStreak);
    saveBest(nextStreak);
    if (advance.current) clearTimeout(advance.current);
    advance.current = setTimeout(() => {
      setRound({ stat, pool, shown: hidden, hidden: nextHigherLowerRow(pool, stat, hidden) });
      setOutcome(null);
    }, 1300);
  }

  if (!round) {
    return (
      <section className="sports-card relative isolate flex flex-col items-center gap-5 overflow-hidden px-4 py-7 text-center">
        <span aria-hidden className="strip-orb -z-10" style={{ left: -30, top: -30, "--orb-color": "#ff9f0a" } as CSSProperties} />
        <span
          aria-hidden
          className="strip-orb strip-orb--b -z-10"
          style={{ right: -30, bottom: -30, "--orb-color": "#0a84ff" } as CSSProperties}
        />
        <div className="flex flex-col gap-1">
          <h2 className={type.heading}>Spin for a stat</h2>
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            The reel picks what you compare all run long.
          </p>
        </div>
        <SlotMachine reels={reels} spinId={spinId} spinning={spinning} cellHeight={60} className="w-full max-w-sm" />
        <SpinButton spinning={spinning} onClick={spin} className="w-full max-w-sm" />
        {best != null ? (
          <p className={cn(type.caption, "text-muted-foreground")}>Best streak: {best}</p>
        ) : null}
      </section>
    );
  }

  const { stat, shown, hidden } = round;
  return (
    <section className="flex flex-col gap-4">
      <div className="sports-card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className={cn(type.caption, "font-semibold uppercase tracking-wide text-muted-foreground")}>
            Stat
          </p>
          <p className={cn(type.body, "font-semibold")}>{stat.label}</p>
          <p className={cn(type.caption, "text-muted-foreground")}>{stat.blurb}</p>
        </div>
        <div className="flex items-center gap-5 text-center">
          <div>
            <p className="score-num text-[2rem] leading-none">{streak}</p>
            <p className={cn(type.caption, "text-muted-foreground")}>Streak</p>
          </div>
          <div>
            <p className="score-num text-[2rem] leading-none text-muted-foreground">{best ?? 0}</p>
            <p className={cn(type.caption, "text-muted-foreground")}>Best</p>
          </div>
        </div>
        {streak > 0 ? (
          <div className="flex w-full flex-wrap gap-1" aria-hidden>
            {Array.from({ length: Math.min(streak, 20) }, (_, i) => (
              <span
                key={i}
                className="arcade-pop size-2.5 rounded-full bg-[#ff9f0a] shadow-[inset_0_-1px_0_rgb(0_0_0/0.25)]"
              />
            ))}
            {streak > 20 ? <span className="text-[11px] font-semibold text-muted-foreground">+{streak - 20}</span> : null}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-stretch gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <SeasonCard key={`shown-${shown.pid}-${shown.season}`} league={league} row={shown} stat={stat} revealed />
        <div className="flex items-center justify-center">
          <span className="score-num flex size-12 items-center justify-center rounded-full bg-foreground text-[15px] text-background shadow-lg">
            VS
          </span>
        </div>
        <SeasonCard
          key={`hidden-${hidden.pid}-${hidden.season}`}
          league={league}
          row={hidden}
          stat={stat}
          revealed={outcome != null}
          tone={outcome ? (outcome.correct ? "right" : "wrong") : null}
        >
          {outcome == null ? (
            <div className="grid grid-cols-2 gap-2">
              <GuessButton onClick={() => guess("higher")} icon={<ArrowUp className="size-4" strokeWidth={3} />}>
                Higher
              </GuessButton>
              <GuessButton onClick={() => guess("lower")} icon={<ArrowDown className="size-4" strokeWidth={3} />} quiet>
                Lower
              </GuessButton>
            </div>
          ) : null}
        </SeasonCard>
      </div>

      {over ? (
        <div className="sports-card arcade-pop flex flex-col items-center gap-3 px-4 py-5 text-center">
          <p className={type.heading}>
            {streak === 0 ? "No streak this time" : `Streak over at ${streak}`}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="lg" onClick={() => start(stat)}>
              Same stat again
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => {
                setRound(null);
                setSpinId(0);
                setReels(IDLE_REEL);
              }}
            >
              Spin a new stat
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function GuessButton({
  onClick,
  icon,
  quiet,
  children,
}: {
  onClick: () => void;
  icon: ReactNode;
  quiet?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-bold transition-[transform,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px",
        quiet
          ? "bg-background text-foreground ring-1 ring-border hover:bg-secondary/70"
          : "bg-foreground text-background shadow-[0_6px_16px_-8px_rgb(0_0_0/0.5)] hover:opacity-90"
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function SeasonCard({
  league,
  row,
  stat,
  revealed,
  tone,
  children,
}: {
  league: ArcadeLeague;
  row: ArcadeRow;
  stat: HigherLowerStat;
  revealed: boolean;
  tone?: "right" | "wrong" | null;
  children?: ReactNode;
}) {
  const player = league.players[row.pid];
  const value = stat.value(row);
  const counted = useCountUp(value, revealed && tone != null);
  const team = row.teams.find(isTeamCode);
  const look = team ? arcadeTeamLook(team, row.season) : null;
  return (
    <article
      className={cn(
        "sports-card arcade-pop relative isolate flex flex-col items-center gap-3 overflow-hidden px-4 pb-4 pt-5 text-center transition-[box-shadow]",
        tone === "right" && "ring-2 ring-[var(--chart-3)]",
        tone === "wrong" && "ring-2 ring-destructive"
      )}
      style={look ? ({ "--orb-color": look.primary } as CSSProperties) : undefined}
    >
      {look ? (
        <>
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-1.5"
            style={{ background: `linear-gradient(90deg, ${look.primary}, ${look.secondary})` }}
          />
          <span aria-hidden className="strip-orb -z-10" style={{ left: -40, top: -50, "--orb-strength": 1.6 } as CSSProperties} />
          <span
            aria-hidden
            className="strip-orb strip-orb--b -z-10"
            style={{ right: -50, top: 10, "--orb-strength": 1.2, "--orb-color": look.secondary } as CSSProperties}
          />
        </>
      ) : null}
      {tone ? (
        <span
          className={cn(
            "absolute right-3 top-3 flex size-7 items-center justify-center rounded-full text-white",
            tone === "right" ? "bg-[var(--chart-3)]" : "bg-destructive"
          )}
          aria-label={tone === "right" ? "Correct" : "Wrong"}
        >
          {tone === "right" ? <Check className="size-4" strokeWidth={3} /> : <X className="size-4" strokeWidth={3} />}
        </span>
      ) : null}
      <PlayerAvatar player={player} className="size-24 text-2xl ring-4 ring-background shadow-lg" />
      <div className="min-w-0">
        <p className={cn(type.body, "font-semibold")}>{playerLabel(league, row.pid)}</p>
        <p className={cn(type.caption, "flex items-center justify-center gap-1.5 text-muted-foreground")}>
          {look?.brand ? <HistoricalTeamMark brand={look.brand} size="2xs" /> : null}
          {row.season} · {teamsLabel(row)}
        </p>
      </div>
      <div className="flex min-h-[4.25rem] items-center justify-center gap-2" aria-live="polite">
        {revealed && value != null ? (
          <>
            <span className="score-num text-[3.25rem] leading-none">
              {stat.format(tone != null ? (counted ?? 0) : value)}
            </span>
            <span className={cn(type.caption, "font-semibold text-muted-foreground")}>{stat.short}</span>
          </>
        ) : (
          <span className="score-num flex h-16 w-28 items-center justify-center rounded-2xl border-2 border-dashed border-foreground/20 text-[2.25rem] text-muted-foreground">
            ?
          </span>
        )}
      </div>
      {children ? <div className="w-full">{children}</div> : null}
    </article>
  );
}
