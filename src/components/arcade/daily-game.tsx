"use client";

import { ArrowDown, ArrowUp, Check, Copy, Share2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  DAILY_ROUNDS,
  dailyPuzzle,
  dailyRecordFor,
  dailyResults,
  dailyShareText,
  withGuess,
  type DailyPuzzle,
  type DailyRecord,
  type Guess,
} from "@/arcade/daily";
import { playerLabel, type ArcadeLeague } from "@/arcade/league";
import { ArcadeLoading } from "@/components/arcade/arcade-parts";
import { GuessButton, SeasonCard } from "@/components/arcade/higher-lower-game";
import { useArcadeLeague } from "@/components/arcade/use-arcade-league";
import { Button } from "@/components/ui/button";
import { type } from "@/lib/design-system";
import { nbaTodayIso } from "@/lib/nba-calendar-date";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "drbl-arcade-daily-v1";
const REVEAL_MS = 1300;

function readRecord(): DailyRecord | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DailyRecord) : null;
  } catch {
    return null;
  }
}

function writeRecord(record: DailyRecord) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Private mode: the game still plays, it just won't resume.
  }
}

export function DailyGame() {
  const { league, failed, retry } = useArcadeLeague();
  if (!league) return <ArcadeLoading failed={failed} onRetry={retry} />;
  return <DailyBoard league={league} />;
}

function DailyBoard({ league }: { league: ArcadeLeague }) {
  const [date] = useState(() => nbaTodayIso());
  const [puzzle] = useState(() => dailyPuzzle(league, date));
  const [record, setRecord] = useState<DailyRecord>(() => dailyRecordFor(readRecord(), date));
  /** The round whose answer is on screen, before moving on. */
  const [revealing, setRevealing] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const results = dailyResults(puzzle, record.guesses);
  const done = record.guesses.length >= DAILY_ROUNDS && revealing == null;
  const round = revealing ?? record.guesses.length;

  function guess(choice: Guess) {
    if (revealing != null || record.guesses.length >= DAILY_ROUNDS) return;
    const next = withGuess(record, choice);
    setRecord(next);
    writeRecord(next);
    setRevealing(record.guesses.length);
    timer.current = setTimeout(() => setRevealing(null), REVEAL_MS);
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="sports-card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className={cn(type.caption, "font-semibold uppercase tracking-wide text-muted-foreground")}>
            Daily #{puzzle.number} · {puzzle.stat.label}
          </p>
          <p className={cn(type.caption, "text-muted-foreground")}>{puzzle.stat.blurb}</p>
        </div>
        <div className="flex items-center gap-5 text-center">
          <div>
            <p className="score-num text-[2rem] leading-none">{results.filter(Boolean).length}</p>
            <p className={cn(type.caption, "text-muted-foreground")}>Right</p>
          </div>
          <div>
            <p className="score-num text-[2rem] leading-none text-muted-foreground">{record.streak}</p>
            <p className={cn(type.caption, "text-muted-foreground")}>Day streak</p>
          </div>
        </div>
        <ol className="flex w-full gap-1" aria-label="Rounds">
          {Array.from({ length: DAILY_ROUNDS }, (_, i) => (
            <li
              key={i}
              className={cn(
                "h-2 flex-1 rounded-full",
                results[i] === true
                  ? "bg-[var(--chart-3)]"
                  : results[i] === false
                    ? "bg-destructive"
                    : i === round
                      ? "bg-foreground/40"
                      : "bg-foreground/10"
              )}
            />
          ))}
        </ol>
      </div>

      {done ? (
        <DailySummary puzzle={puzzle} league={league} record={record} results={results} />
      ) : (
        <RoundBoard
          puzzle={puzzle}
          league={league}
          round={round}
          outcome={revealing != null ? results[revealing] ?? null : null}
          onGuess={guess}
        />
      )}
    </section>
  );
}

function RoundBoard({
  puzzle,
  league,
  round,
  outcome,
  onGuess,
}: {
  puzzle: DailyPuzzle;
  league: ArcadeLeague;
  round: number;
  outcome: boolean | null;
  onGuess: (g: Guess) => void;
}) {
  const shown = puzzle.rows[round]!;
  const hidden = puzzle.rows[round + 1]!;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-stretch gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      <SeasonCard key={`shown-${round}`} league={league} row={shown} stat={puzzle.stat} revealed />
      <div className="flex items-center justify-center">
        <span className="score-num flex size-12 items-center justify-center rounded-full bg-foreground text-[15px] text-background shadow-lg">
          VS
        </span>
      </div>
      <SeasonCard
        key={`hidden-${round}`}
        league={league}
        row={hidden}
        stat={puzzle.stat}
        revealed={outcome != null}
        tone={outcome == null ? null : outcome ? "right" : "wrong"}
      >
        {outcome == null ? (
          <div className="grid grid-cols-2 gap-2">
            <GuessButton onClick={() => onGuess("higher")} icon={<ArrowUp className="size-4" strokeWidth={3} />}>
              Higher
            </GuessButton>
            <GuessButton onClick={() => onGuess("lower")} icon={<ArrowDown className="size-4" strokeWidth={3} />} quiet>
              Lower
            </GuessButton>
          </div>
        ) : null}
      </SeasonCard>
    </div>
  );
}

function untilNextPuzzle(now: number): string {
  const today = nbaTodayIso(new Date(now));
  let lo = now;
  let hi = now + 26 * 3_600_000;
  while (hi - lo > 60_000) {
    const mid = (lo + hi) / 2;
    if (nbaTodayIso(new Date(mid)) === today) lo = mid;
    else hi = mid;
  }
  const minutes = Math.max(1, Math.round((hi - now) / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function DailySummary({
  puzzle,
  league,
  record,
  results,
}: {
  puzzle: DailyPuzzle;
  league: ArcadeLeague;
  record: DailyRecord;
  results: boolean[];
}) {
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState<string | null>(null);
  const score = results.filter(Boolean).length;

  useEffect(() => {
    const tick = () => setCountdown(untilNextPuzzle(Date.now()));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  async function share() {
    const text = dailyShareText(puzzle, results, `${window.location.origin}/arcade/daily`);
    if (typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // Cancelled share sheet: fall back to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const fmt = (v: number | null) => (v == null ? "—" : puzzle.stat.format(v));

  return (
    <div className="flex flex-col gap-4">
      <div className="sports-card arcade-pop flex flex-col items-center gap-3 px-4 py-6 text-center">
        <p className="score-num text-[3rem] leading-none">
          {score}/{DAILY_ROUNDS}
        </p>
        <p className={type.heading}>
          {score === DAILY_ROUNDS ? "Perfect day" : score >= 7 ? "Good read" : "Tough one today"}
        </p>
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          {record.streak > 1 ? `${record.streak} days in a row. ` : ""}
          {countdown ? `Next puzzle in ${countdown}.` : null}
        </p>
        <Button size="lg" onClick={share} className="gap-2">
          {copied ? <Copy className="size-4" /> : <Share2 className="size-4" />}
          {copied ? "Copied" : "Share result"}
        </Button>
      </div>

      <ol className="sports-card flex flex-col divide-y divide-border px-4 py-1">
        {results.map((ok, i) => {
          const a = puzzle.rows[i]!;
          const b = puzzle.rows[i + 1]!;
          return (
            <li key={i} className="flex items-center gap-3 py-2.5 text-[13px]">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-white",
                  ok ? "bg-[var(--chart-3)]" : "bg-destructive"
                )}
                aria-label={ok ? "Right" : "Wrong"}
              >
                {ok ? <Check className="size-3.5" strokeWidth={3} /> : <X className="size-3.5" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {playerLabel(league, b.pid)} {b.season}{" "}
                <span className="text-muted-foreground">
                  vs {playerLabel(league, a.pid)} {a.season}
                </span>
              </span>
              <span className="shrink-0 tabular-nums">
                {fmt(puzzle.stat.value(b))}{" "}
                <span className="text-muted-foreground">vs {fmt(puzzle.stat.value(a))}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
