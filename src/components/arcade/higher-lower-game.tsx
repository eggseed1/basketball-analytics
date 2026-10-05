"use client";

import { useRef, useState } from "react";

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
import { SpinWheel } from "@/components/arcade/spin-wheel";
import { useArcadeLeague } from "@/components/arcade/use-arcade-league";
import { Button } from "@/components/ui/button";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

type Round = { stat: HigherLowerStat; pool: ArcadeRow[]; shown: ArcadeRow; hidden: ArcadeRow };
type Outcome = { guess: "higher" | "lower"; correct: boolean } | null;

function teamsLabel(row: ArcadeRow): string {
  return row.teams.filter(isTeamCode).map(teamName).join(" / ");
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
  const advance = useRef<ReturnType<typeof setTimeout> | null>(null);

  function start(stat: HigherLowerStat) {
    const pool = higherLowerPool(league, stat);
    const shown = nextHigherLowerRow(pool, stat, null);
    setRound({ stat, pool, shown, hidden: nextHigherLowerRow(pool, stat, shown) });
    setOutcome(null);
    setStreak(0);
    setOver(false);
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
    }, 1100);
  }

  if (!round) {
    return (
      <section className="sports-card flex flex-col items-center gap-4 px-4 py-6 text-center">
        <div className="flex flex-col gap-1">
          <h2 className={type.heading}>Spin for a stat</h2>
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            The wheel picks what you compare all run long.
          </p>
        </div>
        <SpinWheel
          labels={HIGHER_LOWER_STATS.map((s) => s.short)}
          onResult={(index) => start(HIGHER_LOWER_STATS[index])}
        />
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
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <SeasonCard league={league} row={shown} stat={stat} revealed />
        <SeasonCard
          league={league}
          row={hidden}
          stat={stat}
          revealed={outcome != null}
          tone={outcome ? (outcome.correct ? "right" : "wrong") : null}
        >
          {outcome == null ? (
            <div className="grid grid-cols-2 gap-2">
              <Button size="lg" onClick={() => guess("higher")}>
                Higher
              </Button>
              <Button size="lg" variant="outline" onClick={() => guess("lower")}>
                Lower
              </Button>
            </div>
          ) : null}
        </SeasonCard>
      </div>

      {over ? (
        <div className="sports-card flex flex-col items-center gap-3 px-4 py-5 text-center">
          <p className={type.heading}>
            {streak === 0 ? "No streak this time" : `Streak over at ${streak}`}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="lg" onClick={() => start(stat)}>
              Same stat again
            </Button>
            <Button size="lg" variant="outline" onClick={() => setRound(null)}>
              Spin a new stat
            </Button>
          </div>
        </div>
      ) : null}
    </section>
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
  children?: React.ReactNode;
}) {
  const player = league.players[row.pid];
  const value = stat.value(row);
  return (
    <article
      className={cn(
        "sports-card flex flex-col gap-4 px-4 py-4 transition-colors",
        tone === "right" && "!border-[var(--chart-3)] bg-[color-mix(in_oklch,var(--chart-3),transparent_88%)]",
        tone === "wrong" && "!border-destructive bg-destructive/10"
      )}
    >
      <div className="flex items-center gap-3">
        <PlayerAvatar player={player} className="size-14 text-lg" />
        <div className="min-w-0">
          <p className={cn(type.body, "font-semibold")}>{playerLabel(league, row.pid)}</p>
          <p className={cn(type.caption, "text-muted-foreground")}>
            {row.season} · {teamsLabel(row)}
          </p>
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="score-num text-[2.75rem] leading-none" aria-live="polite">
          {revealed && value != null ? stat.format(value) : "?"}
        </span>
        <span className={cn(type.caption, "text-muted-foreground")}>{stat.short}</span>
      </div>
      {children}
    </article>
  );
}
