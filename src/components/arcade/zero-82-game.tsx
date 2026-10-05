"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { playerLabel, randomItem, type ArcadeLeague, type ArcadeRow } from "@/arcade/league";
import { teamName } from "@/arcade/teams";
import {
  BENCH_BPM,
  eligibleRows,
  projectedRecord,
  spinTeamSeason,
  STARTER_MINUTES,
  WINS_PER_POINT,
  zero82TeamSeasons,
  ZERO_82_MIN_GAMES,
  ZERO_82_MIN_MINUTES,
  ZERO_82_SLOTS,
  type TeamSeason,
  type Zero82Slot,
} from "@/arcade/zero-82";
import { ArcadeLoading, PlayerAvatar, useBestScore } from "@/components/arcade/arcade-parts";
import { useArcadeLeague } from "@/components/arcade/use-arcade-league";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

type Mode = "worst" | "best";
type Picks = Partial<Record<Zero82Slot, ArcadeRow>>;

const SPIN_TICKS = 16;
const TICK_MS = 70;

export function Zero82Game() {
  const { league, failed, retry } = useArcadeLeague();
  if (!league) return <ArcadeLoading failed={failed} onRetry={retry} />;
  return <Zero82Board league={league} />;
}

function Zero82Board({ league }: { league: ArcadeLeague }) {
  const teamSeasons = useMemo(() => zero82TeamSeasons(league), [league]);
  const [mode, setMode] = useState<Mode>("worst");
  const [picks, setPicks] = useState<Picks>({});
  const [team, setTeam] = useState<TeamSeason | null>(null);
  const [ticker, setTicker] = useState<TeamSeason | null>(null);
  const [skips, setSkips] = useState(1);
  const [bestWorst, saveWorst] = useBestScore("drbl-arcade-0-82-best", "lower");
  const [bestBest, saveBest] = useBestScore("drbl-arcade-82-0-best", "higher");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  const openSlots = ZERO_82_SLOTS.filter((slot) => !picks[slot]);
  const usedPids = new Set(Object.values(picks).map((row) => row!.pid));
  const done = openSlots.length === 0;
  const record = done ? projectedRecord(ZERO_82_SLOTS.map((slot) => picks[slot]!.bpm!)) : null;

  function spin() {
    if (ticker || done) return;
    const target = spinTeamSeason(teamSeasons, openSlots, usedPids);
    setTeam(null);
    let ticks = 0;
    setTicker(randomItem(teamSeasons));
    timer.current = setInterval(() => {
      ticks += 1;
      if (ticks < SPIN_TICKS) {
        setTicker(randomItem(teamSeasons));
        return;
      }
      clearInterval(timer.current!);
      timer.current = null;
      setTicker(null);
      setTeam(target);
    }, TICK_MS);
  }

  function pick(row: ArcadeRow) {
    const slot = row.pos as Zero82Slot;
    const next = { ...picks, [slot]: row };
    setPicks(next);
    setTeam(null);
    if (ZERO_82_SLOTS.every((s) => next[s])) {
      const { wins } = projectedRecord(ZERO_82_SLOTS.map((s) => next[s]!.bpm!));
      if (mode === "worst") saveWorst(wins);
      else saveBest(wins);
    }
  }

  function reset(nextMode: Mode = mode) {
    setMode(nextMode);
    setPicks({});
    setTeam(null);
    setSkips(1);
  }

  const goal = mode === "worst" ? "0–82" : "82–0";
  const best = mode === "worst" ? bestWorst : bestBest;
  const offered = team ? eligibleRows(team, openSlots, usedPids) : [];

  return (
    <section className="flex flex-col gap-4">
      <div className="sports-card flex flex-wrap items-end justify-between gap-3 px-4 py-3">
        <SegmentedControl
          label="Goal"
          value={mode}
          onChange={(id) => reset(id)}
          options={[
            { id: "worst", label: "Worst team (0–82)" },
            { id: "best", label: "Best team (82–0)" },
          ]}
        />
        <p className={cn(type.caption, "text-muted-foreground")}>
          {best != null ? `Your best: ${best}–${82 - best}` : `Aim for ${goal}`}
        </p>
      </div>

      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-5">
        {ZERO_82_SLOTS.map((slot) => {
          const row = picks[slot];
          const player = row ? league.players[row.pid] : null;
          return (
            <li
              key={slot}
              className={cn(
                "sports-card flex min-w-0 items-center gap-3 px-3 py-2.5 sm:flex-col sm:items-start sm:gap-2",
                !row && "border-dashed opacity-80"
              )}
            >
              <span className={cn(type.caption, "w-7 shrink-0 font-bold text-muted-foreground")}>{slot}</span>
              {row && player ? (
                <span className="flex w-full min-w-0 items-center gap-2 sm:flex-col sm:items-start lg:flex-row lg:items-center">
                  <PlayerAvatar player={player} className="size-8 text-xs" />
                  <span className="w-full min-w-0">
                    <span className={cn(type.bodySm, "block truncate font-semibold")}>
                      {playerLabel(league, row.pid)}
                    </span>
                    <span className={cn(type.caption, "block truncate text-muted-foreground")}>
                      {row.season}
                      {record ? ` · BPM ${row.bpm! > 0 ? "+" : ""}${row.bpm!.toFixed(1)}` : ""}
                    </span>
                  </span>
                </span>
              ) : (
                <span className={cn(type.caption, "text-muted-foreground")}>Open</span>
              )}
            </li>
          );
        })}
      </ol>

      {record ? (
        <ResultCard mode={mode} record={record} onReplay={() => reset()} />
      ) : (
        <div className="sports-card flex flex-col gap-4 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className={cn(type.caption, "font-semibold uppercase tracking-wide text-muted-foreground")}>
                Pick {5 - openSlots.length + 1} of 5
              </p>
              <p className={cn(type.heading, "truncate")} aria-live="polite">
                {ticker
                  ? `${ticker.season} ${teamName(ticker.team)}`
                  : team
                    ? `${team.season} ${teamName(team.team)}`
                    : "Spin for a team"}
              </p>
            </div>
            <div className="flex gap-2">
              {team ? (
                <Button
                  variant="outline"
                  disabled={skips === 0}
                  onClick={() => {
                    setSkips(skips - 1);
                    spin();
                  }}
                >
                  Skip team ({skips} left)
                </Button>
              ) : (
                <Button size="lg" onClick={spin} disabled={Boolean(ticker)}>
                  {ticker ? "Spinning…" : "Spin"}
                </Button>
              )}
            </div>
          </div>
          {team ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {offered.map((row) => (
                <li key={row.pid}>
                  <OfferButton league={league} row={row} onPick={() => pick(row)} />
                </li>
              ))}
            </ul>
          ) : null}
          <p className={cn(type.caption, "text-muted-foreground")}>
            Each team shows its rotation players who fit an open spot (at least{" "}
            {ZERO_82_MIN_MINUTES} minutes and {ZERO_82_MIN_GAMES} games). A player fills only his
            listed position.
          </p>
        </div>
      )}
    </section>
  );
}

function OfferButton({ league, row, onPick }: { league: ArcadeLeague; row: ArcadeRow; onPick: () => void }) {
  const player = league.players[row.pid];
  const mpg = row.gp ? row.mp / row.gp : null;
  const line = [
    row.pts != null ? `${row.pts.toFixed(1)} PTS` : null,
    row.trb != null ? `${row.trb.toFixed(1)} REB` : null,
    row.ast != null ? `${row.ast.toFixed(1)} AST` : null,
    mpg != null ? `${mpg.toFixed(1)} MIN` : null,
  ].filter(Boolean);
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <PlayerAvatar player={player} className="size-10 text-sm" />
      <span className="min-w-0 flex-1">
        <span className={cn(type.bodySm, "block font-semibold")}>
          {playerLabel(league, row.pid)} <span className="text-muted-foreground">· {row.pos}</span>
        </span>
        <span className={cn(type.caption, "block text-muted-foreground")}>
          {line.join(" · ")} · {row.gp} GP
        </span>
      </span>
    </button>
  );
}

function ResultCard({
  mode,
  record,
  onReplay,
}: {
  mode: Mode;
  record: { wins: number; losses: number; net: number };
  onReplay: () => void;
}) {
  const perfect = mode === "worst" ? record.wins === 0 : record.wins === 82;
  return (
    <div className="sports-card flex flex-col items-center gap-3 px-4 py-6 text-center">
      <p className={cn(type.caption, "font-semibold uppercase tracking-wide text-muted-foreground")}>
        Projected record
      </p>
      <p className="score-num text-[3.5rem] leading-none">
        {record.wins}–{record.losses}
      </p>
      <p className={cn(type.bodySm, "text-muted-foreground")}>
        {perfect
          ? mode === "worst"
            ? "A winless season. That is hard to do."
            : "Undefeated. That is hard to do."
          : `Net rating ${record.net > 0 ? "+" : ""}${record.net.toFixed(1)}`}
      </p>
      <Button size="lg" onClick={onReplay}>
        Play again
      </Button>
      <p className={cn(type.caption, "max-w-prose text-muted-foreground")}>
        Each starter plays {STARTER_MINUTES} minutes at his Box Plus/Minus for that season. A
        replacement-level bench ({BENCH_BPM} BPM) covers the other minutes, and each point of net
        rating is worth {WINS_PER_POINT} wins over 82 games. BPM compares a player to the league
        average of his own season, so eras mix fairly.
      </p>
    </div>
  );
}
