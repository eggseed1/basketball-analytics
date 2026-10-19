"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { TeamLogo } from "@/components/brand/team-logo";
import type { GmLeagueState, GmScheduleGame } from "@/gm/types";
import { seasonMarks, type CalendarMark } from "@/gm/engine/calendar-marks";
import {
  formatTipDate,
  formatTipDateLong,
  monthKeyFromIso,
} from "@/gm/seed/real-schedule";
import { cn } from "@/lib/utils";
import { userRecord } from "@/gm/lib/selectors";
import { useGmStore } from "@/gm/state/gm-store";
import { Button } from "@/components/ui/button";

function opponentOf(game: GmScheduleGame, userTeamId: string) {
  return game.homeTeamId === userTeamId ? game.awayTeamId : game.homeTeamId;
}

function isHome(game: GmScheduleGame, userTeamId: string) {
  return game.homeTeamId === userTeamId;
}

function currentTipDate(league: GmLeagueState): string | undefined {
  const next = league.schedule.find(
    (g) =>
      !g.played &&
      (g.homeTeamId === league.userTeamId ||
        g.awayTeamId === league.userTeamId)
  );
  if (next?.gameDate) return next.gameDate;
  const any = league.schedule.find((g) => g.day === league.day && g.gameDate);
  return any?.gameDate ?? league.schedule.find((g) => g.gameDate)?.gameDate;
}

function slateDate(league: GmLeagueState): string | undefined {
  const onDay = league.schedule.find((g) => g.day === league.day && g.gameDate);
  return onDay?.gameDate ?? currentTipDate(league);
}

function seasonSpan(dates: string[]): { start: string; end: string } | null {
  if (!dates.length) return null;
  const sorted = dates.slice().sort();
  return { start: sorted[0]!, end: sorted[sorted.length - 1]! };
}

function dayFraction(iso: string, start: string, end: string): number {
  const span = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  if (span <= 0) return 0;
  const here = Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.min(1, Math.max(0, here / span));
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function weekdayMondayFirst(year: number, month: number, day: number) {
  const js = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return (js + 6) % 7;
}

type DayCell = {
  iso: string;
  label: string;
  game?: GmScheduleGame;
  isToday: boolean;
  inMonth: boolean;
};

export function GmSeasonCalendar({
  league,
  compact = false,
}: {
  league: GmLeagueState;
  compact?: boolean;
}) {
  const userTeamId = league.userTeamId;
  const record = userRecord(league);
  const tip = currentTipDate(league);
  const simRun = useGmStore((s) => s.simRun);
  const startAutoSim = useGmStore((s) => s.startAutoSim);
  const stopAutoSim = useGmStore((s) => s.stopAutoSim);
  const path = usePathname();
  const running = simRun != null && simRun.kind !== "day";
  const cursor = running ? slateDate(league) ?? tip : tip;

  const userGames = useMemo(
    () =>
      league.schedule
        .filter(
          (g) => g.homeTeamId === userTeamId || g.awayTeamId === userTeamId
        )
        .slice()
        .sort(
          (a, b) =>
            (a.gameDate ?? "").localeCompare(b.gameDate ?? "") || a.day - b.day
        ),
    [league.schedule, userTeamId]
  );

  const defaultMonth =
    (cursor && monthKeyFromIso(cursor)) ||
    (userGames[0]?.gameDate
      ? monthKeyFromIso(userGames[0].gameDate)
      : `${league.season - 1}-10`);

  const marks = useMemo(() => seasonMarks(league.schedule), [league.schedule]);
  const marksByDate = useMemo(() => {
    const map = new Map<string, CalendarMark[]>();
    for (const mark of marks) {
      const list = map.get(mark.iso) ?? [];
      list.push(mark);
      map.set(mark.iso, list);
    }
    return map;
  }, [marks]);

  const months = useMemo(() => {
    const keys = [
      ...new Set(
        userGames
          .map((g) => g.gameDate)
          .filter((d): d is string => Boolean(d))
          .map(monthKeyFromIso)
      ),
    ].sort();
    return keys.length ? keys : [defaultMonth];
  }, [userGames, defaultMonth]);

  const [monthKey, setMonthKey] = useState(defaultMonth);

  useEffect(() => {
    if (!cursor) return;
    if (running || compact) {
      const tipMonth = monthKeyFromIso(cursor);
      if (months.includes(tipMonth)) setMonthKey(tipMonth);
    }
  }, [running, compact, cursor, months]);

  const seenResults = useRef<Set<string> | null>(null);
  const [landed, setLanded] = useState<Set<string>>(new Set());
  useEffect(() => {
    const played = new Set(
      userGames.filter((game) => game.played && game.gameDate).map((game) => game.gameDate!)
    );
    const previous = seenResults.current;
    seenResults.current = played;
    if (!previous) return;
    const fresh = [...played].filter((date) => !previous.has(date));
    if (!fresh.length) return;
    setLanded(new Set(fresh));
    const timer = window.setTimeout(() => setLanded(new Set()), 700);
    return () => window.clearTimeout(timer);
  }, [userGames]);

  const monthIndex = Math.max(0, months.indexOf(monthKey));
  const activeMonth = months[monthIndex] ?? defaultMonth;

  const secondNights = useMemo(() => {
    const marks = new Set<string>();
    for (let i = 1; i < userGames.length; i++) {
      const previous = userGames[i - 1]?.gameDate;
      const current = userGames[i]?.gameDate;
      if (!previous || !current) continue;
      const [py, pm, pd] = previous.split("-").map(Number);
      const [cy, cm, cd] = current.split("-").map(Number);
      const gap =
        (Date.UTC(cy!, (cm ?? 1) - 1, cd ?? 1) -
          Date.UTC(py!, (pm ?? 1) - 1, pd ?? 1)) /
        86_400_000;
      if (gap === 1) marks.add(current);
    }
    return marks;
  }, [userGames]);

  const gameByDate = useMemo(() => {
    const map = new Map<string, GmScheduleGame>();
    for (const g of userGames) {
      if (g.gameDate) map.set(g.gameDate, g);
    }
    return map;
  }, [userGames]);

  const [year, month] = activeMonth.split("-").map(Number) as [number, number];

  const cells: DayCell[] = [];
  const dim = daysInMonth(year, month);
  const startPad = weekdayMondayFirst(year, month, 1);
  for (let i = 0; i < startPad; i++) {
    cells.push({ iso: "", label: "", inMonth: false, isToday: false });
  }
  for (let d = 1; d <= dim; d++) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({
      iso,
      label: String(d),
      game: gameByDate.get(iso),
      inMonth: true,
      isToday: Boolean(cursor && iso === cursor),
    });
  }

  const todayGame = cursor ? gameByDate.get(cursor) : undefined;
  const span = seasonSpan(
    league.schedule.map((game) => game.gameDate).filter((date): date is string => Boolean(date))
  );
  const progress = cursor && span ? dayFraction(cursor, span.start, span.end) : 0;
  const monthMarks = marks.filter(
    (mark) => !mark.quiet && mark.label && monthKeyFromIso(mark.iso) === activeMonth
  );
  const goMonth = (delta: number) => {
    const next = months[monthIndex + delta];
    if (next) setMonthKey(next);
  };

  const monthTitle = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric", timeZone: "UTC" }
  );

  const winWash = "var(--data-positive)";
  const lossWash = "var(--data-negative)";

  return (
    <section className={cn("gm-cal sports-card flex flex-col gap-3 overflow-hidden p-4", running && "is-running")}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {running ? "Walking the slate" : "Calendar"}
          </p>
          <h2 key={activeMonth} className="gm-cal__title text-[28px] font-bold tracking-tight">
            {monthTitle}
          </h2>
          {running && cursor ? (
            <p className="mt-1 text-[14px] text-muted-foreground">
              {formatTipDateLong(cursor)}
              {todayGame ? (
                <>
                  {" "}
                  <span className="font-semibold text-foreground">
                    {todayGame.awayTeamId.toUpperCase()} @ {todayGame.homeTeamId.toUpperCase()}
                  </span>
                </>
              ) : null}
            </p>
          ) : todayGame ? (
            <p className="mt-1 text-[14px] text-muted-foreground">
              {todayGame.played ? "Last tip" : "Up next"}{" "}
              <span className="font-semibold text-foreground">
                {todayGame.awayTeamId.toUpperCase()} @ {todayGame.homeTeamId.toUpperCase()}
              </span>
              {cursor ? ` · ${formatTipDateLong(cursor)}` : null}
            </p>
          ) : cursor ? (
            <p className="mt-1 text-[14px] text-muted-foreground">
              Next tip · {formatTipDateLong(cursor)}
            </p>
          ) : null}
          {monthMarks.length ? (
            <p className="mt-1 text-[12px] text-muted-foreground">
              {monthMarks.map((mark) => `${mark.line} ${formatTipDate(mark.iso)}`).join(" · ")}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-1 text-[14px] font-semibold tabular-nums">
            {record?.wins ?? 0}-{record?.losses ?? 0}
          </p>
          {running ? (
            <Button onClick={() => stopAutoSim()}>Stop</Button>
          ) : league.phase === "regular" ? (
            <>
              <Button variant="outline" onClick={() => startAutoSim("day")}>
                Sim day
              </Button>
              <Button variant="outline" onClick={() => startAutoSim("next")}>
                Sim to my game
              </Button>
              <Button onClick={() => startAutoSim("season")}>Auto season</Button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => goMonth(-1)}
            disabled={monthIndex <= 0}
            className="rounded-full bg-secondary px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => goMonth(1)}
            disabled={monthIndex >= months.length - 1}
            className="rounded-full bg-secondary px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </header>

      {span && cursor ? (
        <div className="gm-cal__rail" aria-hidden>
          <span style={{ width: `${progress * 100}%` }} />
          {marks
            .filter((mark) => mark.label)
            .map((mark) => (
              <i
                key={`${mark.iso}-${mark.label}`}
                className={`is-${mark.kind}`}
                style={{ left: `${dayFraction(mark.iso, span.start, span.end) * 100}%` }}
                title={`${mark.line} · ${formatTipDate(mark.iso)}`}
              />
            ))}
        </div>
      ) : null}

      <div className="gm-cal__week" aria-hidden>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, index) => (
          <div key={d} className={index >= 5 ? "is-weekend" : undefined}>
            {d}
          </div>
        ))}
      </div>

      <div key={activeMonth} className="gm-cal__grid">
        {cells.map((cell, idx) => {
          if (!cell.inMonth) {
            return <div key={`pad-${idx}`} className="gm-cal__day is-pad" />;
          }
          const game = cell.game;
          const home = game ? isHome(game, userTeamId) : false;
          const opp = game ? opponentOf(game, userTeamId) : null;
          const userScore = game?.played
            ? home
              ? game.homeScore
              : game.awayScore
            : undefined;
          const oppScore = game?.played
            ? home
              ? game.awayScore
              : game.homeScore
            : undefined;
          const decided =
            userScore != null && oppScore != null && game?.played;
          const won = decided && userScore! > oppScore!;
          const lost = decided && userScore! < oppScore!;

          const cellBackground = (() => {
            if (!game) return undefined;
            if (won) return `color-mix(in oklab, ${winWash} 24%, var(--gm-day))`;
            if (lost) return `color-mix(in oklab, ${lossWash} 20%, var(--gm-day))`;
            return undefined;
          })();
          const past = Boolean(cursor && cell.iso < cursor);
          const weekend = idx % 7 >= 5;
          const dayMarks = marksByDate.get(cell.iso) ?? [];
          const named = dayMarks.filter((mark) => mark.label);
          const breakKind = dayMarks.find((mark) => mark.kind === "cup" || mark.kind === "break");

          const inner = (
            <div
              className={cn(
                "gm-cal__day",
                !game && "is-empty",
                game && "is-game",
                game && (home ? "is-home" : "is-away"),
                weekend && "is-weekend",
                won && "is-win",
                lost && "is-loss",
                cell.isToday && "is-today",
                past && !game && !breakKind && "is-past",
                breakKind && `is-${breakKind.kind}`,
                named.length > 0 && "is-marked",
                named[0] && `mark-${named[0].kind}`,
                landed.has(cell.iso) && "is-landed"
              )}
              style={cellBackground ? { background: cellBackground } : undefined}
              title={named.map((mark) => mark.title).join(". ") || undefined}
            >
              <div className="flex items-start justify-between gap-1">
                <span
                  className={cn(
                    "gm-cal__num tabular-nums",
                    won && "text-positive",
                    lost && "text-negative"
                  )}
                >
                  {cell.label}
                  {secondNights.has(cell.iso) ? (
                    <span className="gm-cal__b2b">2nd</span>
                  ) : null}
                </span>
                {game ? (
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      won && "bg-data-positive",
                      lost && "bg-data-negative",
                      !won && !lost && (home ? "bg-sky-600" : "bg-orange-700")
                    )}
                    title={
                      secondNights.has(cell.iso)
                        ? "Second night"
                        : won
                          ? "Win"
                          : lost
                            ? "Loss"
                            : home
                              ? "Home"
                              : "Away"
                    }
                  />
                ) : null}
              </div>
              {game && named.length ? (
                <p className="gm-cal__mark">
                  {named.map((mark) => (
                    <span key={mark.label} className={`is-${mark.kind}`}>
                      {mark.label}
                    </span>
                  ))}
                </p>
              ) : null}
              {game && opp ? (
                <div className="gm-cal__match">
                  <TeamLogo teamKey={opp} size="xs" />
                  {game.played && decided ? (
                    <span className={cn("tabular-nums", won ? "text-positive" : "text-negative")}>
                      {won ? "W" : "L"} {userScore}-{oppScore}
                    </span>
                  ) : (
                    <span>
                      {home ? "vs" : "@"} {opp.toUpperCase()}
                    </span>
                  )}
                </div>
              ) : (
                <div className="gm-cal__off">
                  {named.length ? (
                    <span className={cn("gm-cal__break", `is-${named[0]!.kind}`)}>
                      {named.map((mark) => mark.label).join(" ")}
                    </span>
                  ) : null}
                </div>
              )}
            </div>
          );

          if (game?.boxScoreId) {
            return (
              <Link key={cell.iso} href={`/gm/game/${game.boxScoreId}`} className="contents">
                {inner}
              </Link>
            );
          }
          return (
            <div key={cell.iso} className="contents">
              {inner}
            </div>
          );
        })}
      </div>

      <footer className="gm-cal__foot flex flex-wrap items-center justify-between gap-3 pt-1 text-[12px]">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-data-positive" /> Win
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-data-negative" /> Loss
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-sky-600" /> Home
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-orange-700" /> Away
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-amber-300" /> Holiday
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-orange-400" /> Deadline
          </span>
          {!compact && path !== "/gm/schedule" ? (
            <Link
              href="/gm/schedule"
              className="font-semibold text-foreground underline-offset-4 hover:underline"
            >
              Full schedule
            </Link>
          ) : path === "/gm/schedule" ? (
            <Link
              href="/gm"
              className="font-semibold text-foreground underline-offset-4 hover:underline"
            >
              Back home
            </Link>
          ) : null}
        </div>
        <p className="font-semibold text-foreground">
          W-L: {record?.wins ?? 0}-{record?.losses ?? 0}
        </p>
      </footer>

      <p className="text-[11px] text-muted-foreground">
        {userGames.filter((game) => game.cup !== "championship").length === 80
          ? "Published NBA schedule. Cup nights are group play. The knockout and the last two games are added after Nov. 27."
          : `${userGames.filter((game) => game.cup !== "championship").length} regular-season games. The NBA Cup championship is not one of them.`}
      </p>
    </section>
  );
}
