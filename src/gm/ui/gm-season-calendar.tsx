"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { TeamLogo } from "@/components/brand/team-logo";
import type { GmLeagueState, GmScheduleGame } from "@/gm/types";
import {
  formatTipDate,
  formatTipDateLong,
  monthKeyFromIso,
} from "@/gm/seed/real-schedule";
import { cn } from "@/lib/utils";
import { userRecord } from "@/gm/lib/selectors";

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
    (tip && monthKeyFromIso(tip)) ||
    (userGames[0]?.gameDate
      ? monthKeyFromIso(userGames[0].gameDate)
      : `${league.season - 1}-10`);

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
    if (compact && tip) {
      const tipMonth = monthKeyFromIso(tip);
      if (months.includes(tipMonth)) setMonthKey(tipMonth);
    }
  }, [compact, tip, months]);

  const monthIndex = Math.max(0, months.indexOf(monthKey));
  const activeMonth = months[monthIndex] ?? defaultMonth;

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
      isToday: Boolean(tip && iso === tip),
    });
  }

  const todayGame = tip ? gameByDate.get(tip) : undefined;
  const goMonth = (delta: number) => {
    const next = months[monthIndex + delta];
    if (next) setMonthKey(next);
  };

  const monthTitle = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric", timeZone: "UTC" }
  );

  const winWash = "#34c759";
  const lossWash = "#ff3b30";

  return (
    <section className="sports-card flex flex-col gap-4 overflow-hidden p-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Season calendar
          </p>
          <h2 className="text-[20px] font-bold tracking-tight">{monthTitle}</h2>
          {todayGame ? (
            <p className="mt-1 text-[14px] text-muted-foreground">
              Game day:{" "}
              <span className="font-semibold text-foreground">
                {todayGame.awayTeamId.toUpperCase()} @{" "}
                {todayGame.homeTeamId.toUpperCase()}
              </span>
              {tip ? ` · ${formatTipDateLong(tip)}` : null}
            </p>
          ) : tip ? (
            <p className="mt-1 text-[14px] text-muted-foreground">
              Next tip · {formatTipDateLong(tip)}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
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

      <div
        className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
        aria-hidden
      >
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((cell, idx) => {
          if (!cell.inMonth) {
            return <div key={`pad-${idx}`} className="min-h-[4.5rem]" />;
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
            if (won) {
              return `color-mix(in oklab, ${winWash} 22%, #f2f2f7)`;
            }
            if (lost) {
              return `color-mix(in oklab, ${lossWash} 20%, #f2f2f7)`;
            }
            // Upcoming (including tip day) - clean white
            return "#ffffff";
          })();

          const inner = (
            <div
              className={cn(
                "flex min-h-[4.5rem] flex-col rounded-[0.9rem] p-1.5 transition-colors",
                !game && "bg-secondary/40",
                game &&
                  !won &&
                  !lost &&
                  "border border-black/10",
                cell.isToday &&
                  "ring-2 ring-foreground ring-offset-2 ring-offset-background"
              )}
              style={game ? { background: cellBackground } : undefined}
            >
              <div className="flex items-start justify-between gap-1">
                <span
                  className={cn(
                    "text-[12px] font-semibold tabular-nums",
                    won && "text-emerald-800",
                    lost && "text-red-800",
                    !won && !lost && (cell.isToday ? "text-foreground" : "text-muted-foreground")
                  )}
                >
                  {formatTipDate(cell.iso) || cell.label}
                </span>
                {game ? (
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      won && "bg-emerald-600",
                      lost && "bg-red-600",
                      !won && !lost && (home ? "bg-sky-600" : "bg-orange-700")
                    )}
                    title={
                      won
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
              {game && opp ? (
                <div className="mt-auto flex flex-col items-center gap-0.5 pb-0.5">
                  <TeamLogo teamKey={opp} size="xs" />
                  {game.played && decided ? (
                    <span
                      className={cn(
                        "text-[10px] font-bold tabular-nums",
                        won ? "text-emerald-800" : "text-red-800"
                      )}
                    >
                      {won ? "W" : "L"} {userScore}-{oppScore}
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {home ? "vs" : "@"} {opp.toUpperCase()}
                    </span>
                  )}
                </div>
              ) : (
                <div className="mt-auto flex flex-1 items-center justify-center">
                  <span className="text-[16px] font-light text-black/15">·</span>
                </div>
              )}
            </div>
          );

          if (game?.boxScoreId) {
            return (
              <Link key={cell.iso} href={`/gm/game/${game.boxScoreId}`}>
                {inner}
              </Link>
            );
          }
          return <div key={cell.iso}>{inner}</div>;
        })}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-black/5 pt-3 text-[12px]">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-600" /> Win
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-red-600" /> Loss
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-sky-600" /> Home
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-orange-700" /> Away
          </span>
          {!compact ? (
            <Link
              href="/gm"
              className="font-semibold text-foreground underline-offset-4 hover:underline"
            >
              Back to plan
            </Link>
          ) : (
            <Link
              href="/gm/schedule"
              className="font-semibold text-foreground underline-offset-4 hover:underline"
            >
              Full schedule
            </Link>
          )}
        </div>
        <p className="font-semibold text-foreground">
          W-L: {record?.wins ?? 0}-{record?.losses ?? 0}
        </p>
      </footer>

      <p className="text-[12px] text-muted-foreground">
        Official NBA tips · {userGames.length} games on your slate
        {userGames[0]?.gameDate ? "" : " · dates unavailable (generated schedule)"}
      </p>
    </section>
  );
}
