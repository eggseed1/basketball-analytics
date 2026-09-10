"use client";

import Link from "next/link";

import { GlassSurface } from "@/components/brand/glass-surface";
import { TeamLogo } from "@/components/brand/team-logo";
import {
  QueryNavProvider,
  TransitionLink,
} from "@/components/continuity/query-nav";
import { LiveScoreboardScope } from "@/components/sports/live-scoreboard-scope";
import { UpcomingGameList } from "@/components/sports/upcoming-game-list";
import type { GameSummary } from "@/data/types";
import {
  isFinalStatus,
  isLiveLikeStatus,
  shouldDisplayScores,
  statusHeadline,
} from "@/lib/game-status";
import { gameSideBrandKey } from "@/lib/game-team-identity";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

export type GamefeedView = "week" | "month" | "list";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Local date helpers - keep Gamefeed client-safe (no data/queries import). */
function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfWeekSundayIso(input: Date | string = new Date()): string {
  const d =
    typeof input === "string"
      ? new Date(`${input.slice(0, 10)}T12:00:00Z`)
      : new Date(
          Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate())
        );
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return toIsoDate(d);
}

function addDaysIso(isoDate: string, n: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return toIsoDate(d);
}

function shiftMonthKey(monthKey: string, delta: number): string {
  const [ys, ms] = monthKey.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const idx = y * 12 + (m - 1) + delta;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthLabel(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function weekRangeLabel(weekStart: string, weekEnd: string) {
  const start = new Date(`${weekStart}T12:00:00Z`);
  const end = new Date(`${weekEnd}T12:00:00Z`);
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  };
  const left = start.toLocaleDateString("en-US", opts);
  const right = end.toLocaleDateString("en-US", {
    ...opts,
    year: start.getUTCFullYear() === end.getUTCFullYear() ? undefined : "numeric",
  });
  return `${left} - ${right}`;
}

function groupByDate(games: GameSummary[]) {
  const map = new Map<string, GameSummary[]>();
  for (const g of games) {
    const list = map.get(g.gameDate) ?? [];
    list.push(g);
    map.set(g.gameDate, list);
  }
  return map;
}

function abbr(game: GameSummary, side: "away" | "home") {
  const key = gameSideBrandKey(game, side);
  return (
    resolveTeamBrand(key)?.abbr ??
    (side === "away" ? game.awayTeamAbbr : game.homeTeamAbbr) ??
    String(key).slice(0, 3).toUpperCase()
  );
}

function tipLabel(game: GameSummary): string {
  if (isFinalStatus(game.status)) return "Final";
  if (isLiveLikeStatus(game.status)) return statusHeadline(game.status);
  if (
    game.status === "postponed" ||
    game.status === "cancelled" ||
    game.status === "suspended" ||
    game.status === "delayed"
  ) {
    return statusHeadline(game.status);
  }
  if (game.statusDetail) {
    const tip = game.statusDetail.split(" - ").slice(1).join(" - ").trim();
    if (tip) return tip;
    return game.statusDetail;
  }
  if (game.tipOffAt) {
    try {
      return new Date(game.tipOffAt).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      });
    } catch {
      // fall through
    }
  }
  return "TBD";
}

function scoresHref(params: {
  view: GamefeedView;
  month?: string;
  week?: string;
}) {
  const sp = new URLSearchParams();
  sp.set("view", params.view);
  if (params.view === "month" && params.month) sp.set("month", params.month);
  if (params.view === "week" && params.week) sp.set("week", params.week);
  return `/scores?${sp.toString()}`;
}

function ViewTabs({
  view,
  monthKey,
  weekStart,
}: {
  view: GamefeedView;
  monthKey: string;
  weekStart: string;
}) {
  const tabs: { id: GamefeedView; label: string; href: string }[] = [
    {
      id: "week",
      label: "Weekly",
      href: scoresHref({ view: "week", week: weekStart }),
    },
    {
      id: "month",
      label: "Monthly",
      href: scoresHref({ view: "month", month: monthKey }),
    },
    {
      id: "list",
      label: "List",
      href: scoresHref({ view: "list" }),
    },
  ];

  return (
    <div className="inline-flex rounded-md border border-border bg-secondary/40 p-0.5">
      {tabs.map((tab) => (
        <TransitionLink
          key={tab.id}
          href={tab.href}
          scroll={false}
          className={cn(
            "rounded-sm px-3 py-1.5 text-[14px] font-semibold transition-colors",
            view === tab.id
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {tab.label}
        </TransitionLink>
      ))}
    </div>
  );
}

function MonthGrid({
  monthKey,
  games,
}: {
  monthKey: string;
  games: GameSummary[];
}) {
  const [year, month] = monthKey.split("-").map(Number) as [number, number];
  const byDate = groupByDate(games);
  const dim = daysInMonth(year, month);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const cells: Array<{ iso: string | null; day: number | null }> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ iso: null, day: null });
  for (let d = 1; d <= dim; d++) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ iso, day: d });
  }
  while (cells.length % 7 !== 0) cells.push({ iso: null, day: null });
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="grid grid-cols-7 gap-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground sm:gap-2">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-1 py-1 text-center">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {cells.map((cell, idx) => {
          if (!cell.iso || cell.day == null) {
            return (
              <div
                key={`empty-${idx}`}
                className="min-h-[72px] rounded-md bg-transparent sm:min-h-[110px]"
              />
            );
          }
          const dayGames = byDate.get(cell.iso) ?? [];
          const isToday = cell.iso === todayIso;
          return (
            <div
              key={cell.iso}
              className={cn(
                "sports-card flex min-h-[72px] flex-col gap-1 p-1 sm:min-h-[110px] sm:p-1.5",
                isToday && "border-foreground/40 ring-1 ring-foreground/20"
              )}
            >
              <p
                className={cn(
                  "px-0.5 text-[12px] font-bold tabular-nums",
                  isToday ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {cell.day}
              </p>
              <div className="flex flex-col gap-0.5">
                {dayGames.slice(0, 4).map((g) => {
                  const away = abbr(g, "away");
                  const home = abbr(g, "home");
                  const finalish = shouldDisplayScores({
                    status: g.status,
                    homeScore: g.homeScore,
                    awayScore: g.awayScore,
                  });
                  return (
                    <Link
                      key={g.id}
                      href={`/games/${g.id}`}
                      className="rounded-sm bg-secondary/70 px-1 py-0.5 transition-colors hover:bg-secondary"
                      title={`${away} @ ${home}`}
                    >
                      <span className="flex items-center gap-1">
                        <TeamLogo
                          teamKey={g.awayTeamAbbr ?? g.awayTeamId}
                          size="xs"
                        />
                        <span className="min-w-0 flex-1 truncate text-[10px] font-semibold sm:text-[12px]">
                          {away}
                          {finalish ? (
                            <span className="tabular-nums text-muted-foreground">
                              {" "}
                              {g.awayScore}
                            </span>
                          ) : null}
                          <span className="text-muted-foreground"> @ </span>
                          {home}
                          {finalish ? (
                            <span className="tabular-nums text-muted-foreground">
                              {" "}
                              {g.homeScore}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </Link>
                  );
                })}
                {dayGames.length > 4 ? (
                  <p className="px-1 text-[10px] font-semibold text-muted-foreground">
                    +{dayGames.length - 4} more
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function WeekBoard({
  weekStart,
  games,
}: {
  weekStart: string;
  games: GameSummary[];
}) {
  const byDate = groupByDate(games);
  const todayIso = new Date().toISOString().slice(0, 10);
  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i));

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
      {days.map((iso) => {
        const dayGames = byDate.get(iso) ?? [];
        const isToday = iso === todayIso;
        const label = new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        });
        return (
          <div
            key={iso}
            className={cn(
              "sports-card flex min-h-[140px] flex-col gap-2 p-2.5",
              isToday && "border-foreground/40 ring-1 ring-foreground/20"
            )}
          >
            <p
              className={cn(
                "text-[12px] font-bold",
                isToday ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {label}
            </p>
            {dayGames.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">No games</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {dayGames.map((g) => {
                  const away = abbr(g, "away");
                  const home = abbr(g, "home");
                  const finalish = shouldDisplayScores({
                    status: g.status,
                    homeScore: g.homeScore,
                    awayScore: g.awayScore,
                  });
                  return (
                    <Link
                      key={g.id}
                      href={`/games/${g.id}`}
                      className="rounded-sm bg-secondary/70 px-2 py-1.5 transition-colors hover:bg-secondary"
                    >
                      <p className="text-[12px] font-semibold leading-tight">
                        {away}
                        {finalish ? ` ${g.awayScore}` : ""}
                        <span className="text-muted-foreground"> @ </span>
                        {home}
                        {finalish ? ` ${g.homeScore}` : ""}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {tipLabel(g)}
                      </p>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Gamefeed with weekly, monthly, and upcoming list views (ESPN scoreboard). */
export function Gamefeed({
  view,
  season,
  monthKey,
  weekStart,
  weekEnd,
  monthGames,
  weekGames,
  upcomingGames,
  upcomingHasMore = false,
  feedSource,
}: {
  view: GamefeedView;
  season: string;
  monthKey: string;
  weekStart: string;
  weekEnd: string;
  monthGames: GameSummary[];
  weekGames: GameSummary[];
  upcomingGames: GameSummary[];
  upcomingHasMore?: boolean;
  feedSource?: "live-espn" | "cached-espn" | "unavailable";
}) {
  const prevMonth = shiftMonthKey(monthKey, -1);
  const nextMonth = shiftMonthKey(monthKey, 1);
  const prevWeek = addDaysIso(weekStart, -7);
  const nextWeek = addDaysIso(weekStart, 7);
  // Keep month tab aligned with the week being viewed.
  const weekMonthKey = weekStart.slice(0, 7);

  const subtitle =
    view === "list"
      ? `Upcoming tip-offs from ESPN - ${season}`
      : view === "week"
        ? `Weekly slate - ${season}`
        : `Monthly calendar - ${season}`;

  return (
    <QueryNavProvider className="gap-0">
      <div className="flex flex-col gap-4">
        <GlassSurface as="section" className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-[28px] font-bold tracking-tight sm:text-[32px]">
                Scores
              </h1>
              <p className="mt-1 text-[14px] text-muted-foreground">{subtitle}</p>
            </div>
            <ViewTabs
              view={view}
              monthKey={view === "week" ? weekMonthKey : monthKey}
              weekStart={
                view === "month"
                  ? startOfWeekSundayIso(`${monthKey}-01`)
                  : weekStart
              }
            />
          </div>

          {view === "month" ? (
            <div className="flex items-center gap-2">
              <TransitionLink
                href={scoresHref({ view: "month", month: prevMonth })}
                scroll={false}
                className="rounded-md bg-secondary px-3 py-1.5 text-[14px] font-semibold"
              >
                Prev
              </TransitionLink>
              <p className="min-w-[9rem] flex-1 text-center text-[16px] font-bold tracking-tight sm:flex-none">
                {monthLabel(monthKey)}
              </p>
              <TransitionLink
                href={scoresHref({ view: "month", month: nextMonth })}
                scroll={false}
                className="rounded-md bg-secondary px-3 py-1.5 text-[14px] font-semibold"
              >
                Next
              </TransitionLink>
            </div>
          ) : null}

          {view === "week" ? (
            <div className="flex items-center gap-2">
              <TransitionLink
                href={scoresHref({ view: "week", week: prevWeek })}
                scroll={false}
                className="rounded-md bg-secondary px-3 py-1.5 text-[14px] font-semibold"
              >
                Prev
              </TransitionLink>
              <p className="min-w-[9rem] flex-1 text-center text-[16px] font-bold tracking-tight sm:flex-none">
                {weekRangeLabel(weekStart, weekEnd)}
              </p>
              <TransitionLink
                href={scoresHref({ view: "week", week: nextWeek })}
                scroll={false}
                className="rounded-md bg-secondary px-3 py-1.5 text-[14px] font-semibold"
              >
                Next
              </TransitionLink>
            </div>
          ) : null}
        </GlassSurface>

        <div className="query-updating-content flex flex-col gap-4">
          {view === "month" ? (
            <>
              <MonthGrid monthKey={monthKey} games={monthGames} />
              {monthGames.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-[14px] text-muted-foreground">
                  No games on the scoreboard for {monthLabel(monthKey)}. Try{" "}
                  <TransitionLink
                    href={scoresHref({ view: "list" })}
                    scroll={false}
                    className="underline"
                  >
                    List
                  </TransitionLink>{" "}
                  for upcoming tip-offs.
                </p>
              ) : (
                <p className="text-[12px] text-muted-foreground">
                  {monthGames.length} game
                  {monthGames.length === 1 ? "" : "s"} this month
                </p>
              )}
            </>
          ) : null}

          {view === "week" ? (
            <LiveScoreboardScope games={weekGames} season={season}>
              {(games) => (
                <>
                  <WeekBoard weekStart={weekStart} games={games} />
                  {games.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-[14px] text-muted-foreground">
                      No games this week.{" "}
                      <TransitionLink
                        href={scoresHref({ view: "list" })}
                        scroll={false}
                        className="underline"
                      >
                        See all upcoming
                      </TransitionLink>
                      .
                    </p>
                  ) : (
                    <p className="text-[12px] text-muted-foreground">
                      {games.length} game{games.length === 1 ? "" : "s"} this
                      week · live scores refresh automatically
                    </p>
                  )}
                </>
              )}
            </LiveScoreboardScope>
          ) : null}

          {view === "list" ? (
            <UpcomingGameList
              initialGames={upcomingGames}
              hasMore={upcomingHasMore}
              season={season}
              source={feedSource}
            />
          ) : null}
        </div>
      </div>
    </QueryNavProvider>
  );
}

/** @deprecated Prefer Gamefeed */
export { Gamefeed as GamefeedCalendar };
