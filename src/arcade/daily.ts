import {
  HIGHER_LOWER_STATS,
  higherLowerPool,
  judgeHigherLower,
  nextHigherLowerRow,
  type HigherLowerStat,
} from "@/arcade/higher-lower";
import type { ArcadeLeague, ArcadeRow } from "@/arcade/league";

export const DAILY_ROUNDS = 10;
/** Puzzle #1. */
export const DAILY_EPOCH = "2026-10-11";
/**
 * The nightly rebuild adds the season in progress; puzzles draw only from
 * finished seasons so a date's puzzle never changes.
 */
export const DAILY_LAST_SEASON = "2025-26";

export type Guess = "higher" | "lower";

export type DailyPuzzle = {
  date: string;
  number: number;
  stat: HigherLowerStat;
  /** DAILY_ROUNDS + 1 seasons; round i compares rows[i] with rows[i + 1]. */
  rows: ArcadeRow[];
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function dayIndex(date: string): number {
  return Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${DAILY_EPOCH}T12:00:00Z`)) / 86_400_000);
}

export function dailyNumber(date: string): number {
  return dayIndex(date) + 1;
}

export function dailyPuzzle(league: ArcadeLeague, date: string): DailyPuzzle {
  const rng = mulberry32(hash(`drbl-daily:${date}`));
  const stat = HIGHER_LOWER_STATS[Math.floor(rng() * HIGHER_LOWER_STATS.length)]!;
  const pool = higherLowerPool(league, stat)
    .filter((row) => row.season <= DAILY_LAST_SEASON)
    .sort((a, b) => (a.season === b.season ? a.pid - b.pid : a.season < b.season ? -1 : 1));
  const rows: ArcadeRow[] = [];
  const used = new Set<number>();
  let current: ArcadeRow | null = null;
  while (rows.length < DAILY_ROUNDS + 1) {
    let next = nextHigherLowerRow(pool, stat, current, rng);
    for (let tries = 0; used.has(next.pid) && tries < 20; tries++) next = nextHigherLowerRow(pool, stat, current, rng);
    used.add(next.pid);
    rows.push(next);
    current = next;
  }
  return { date, number: dailyNumber(date), stat, rows };
}

/** Right or wrong for each guess made so far. */
export function dailyResults(puzzle: DailyPuzzle, guesses: readonly Guess[]): boolean[] {
  return guesses.slice(0, DAILY_ROUNDS).map((guess, i) =>
    judgeHigherLower(guess, puzzle.stat.value(puzzle.rows[i]!)!, puzzle.stat.value(puzzle.rows[i + 1]!)!)
  );
}

export function dailyShareText(puzzle: DailyPuzzle, results: readonly boolean[], url: string): string {
  const score = results.filter(Boolean).length;
  return [
    `DRBL Daily #${puzzle.number}: ${score}/${DAILY_ROUNDS}`,
    `Higher or Lower, ${puzzle.stat.label}`,
    results.map((ok) => (ok ? "🟩" : "🟥")).join(""),
    url,
  ].join("\n");
}

export type DailyRecord = {
  date: string;
  guesses: Guess[];
  /** Consecutive days finished, through `lastFinished`. */
  streak: number;
  lastFinished: string | null;
};

function previousDay(date: string): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

/** Today's record: carries the streak, resets guesses on a new day. */
export function dailyRecordFor(saved: DailyRecord | null, date: string): DailyRecord {
  if (saved?.date === date) return saved;
  const alive = saved?.lastFinished === previousDay(date) || saved?.lastFinished === date;
  return { date, guesses: [], streak: alive ? saved!.streak : 0, lastFinished: saved?.lastFinished ?? null };
}

export function withGuess(record: DailyRecord, guess: Guess): DailyRecord {
  if (record.guesses.length >= DAILY_ROUNDS) return record;
  const guesses = [...record.guesses, guess];
  if (guesses.length < DAILY_ROUNDS) return { ...record, guesses };
  const continued = record.lastFinished === previousDay(record.date);
  return {
    ...record,
    guesses,
    streak: continued ? record.streak + 1 : 1,
    lastFinished: record.date,
  };
}
