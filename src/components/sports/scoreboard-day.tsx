"use client";

import { TransitionLink } from "@/components/continuity/query-nav";
import { LiveScoreboardScope } from "@/components/sports/live-scoreboard-scope";
import { ScoreTile } from "@/components/sports/score-tile";
import type { GameSummary } from "@/data/types";
import { type } from "@/lib/design-system";
import { isFinalStatus, isLiveLikeStatus } from "@/lib/game-status";
import {
  formatIsoDay as formatDay,
  relativeDayLabel,
  scoresDayHref,
} from "@/lib/scoreboard-days";
import { cn } from "@/lib/utils";

export type ScoreboardStripDay = { date: string; count: number };

export type ScoreboardDayData = {
  date: string;
  today: string;
  strip: ScoreboardStripDay[];
  prevWeekDate: string;
  nextWeekDate: string;
  games: GameSummary[];
  /** Most recent earlier game day, shown under today's slate. */
  recent: { date: string; games: GameSummary[] } | null;
  /** Next date with games when the selected day has none. */
  nextGameDate: string | null;
  stale: boolean;
};

function tipSort(a: GameSummary, b: GameSummary): number {
  const ta = a.tipOffAt ?? `${a.gameDate}T23:59Z`;
  const tb = b.tipOffAt ?? `${b.gameDate}T23:59Z`;
  return ta.localeCompare(tb) || a.id.localeCompare(b.id);
}

function DateStrip({ data }: { data: ScoreboardDayData }) {
  const arrow =
    "glass-pill grid size-9 shrink-0 place-items-center rounded-md text-[18px] font-semibold text-muted-foreground hover:text-foreground";
  return (
    <nav aria-label="Pick a day" className="flex items-center gap-1.5">
      <TransitionLink
        href={scoresDayHref(data.prevWeekDate, data.today)}
        scroll={false}
        className={arrow}
        aria-label="Previous week"
      >
        ‹
      </TransitionLink>
      <div className="grid min-w-0 flex-1 grid-cols-7 gap-1">
        {data.strip.map((day) => {
          const active = day.date === data.date;
          const isToday = day.date === data.today;
          return (
            <TransitionLink
              key={day.date}
              href={scoresDayHref(day.date, data.today)}
              scroll={false}
              aria-current={active ? "date" : undefined}
              className={cn(
                "glass-pill flex min-w-0 flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-center transition-colors",
                active
                  ? "glass-pill-active text-foreground"
                  : "text-muted-foreground hover:text-foreground",
                day.count === 0 && !active && "opacity-60"
              )}
            >
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] sm:text-[11px]">
                {isToday ? "Today" : formatDay(day.date, { weekday: "short" })}
              </span>
              <span className="text-[18px] font-bold leading-none tabular-nums sm:text-[20px]">
                {formatDay(day.date, { day: "numeric" })}
              </span>
              <span className="hidden text-[11px] tabular-nums sm:block">
                {day.count === 0
                  ? "No games"
                  : `${day.count} game${day.count === 1 ? "" : "s"}`}
              </span>
              <span
                aria-hidden
                className={cn(
                  "h-1 w-1 rounded-full sm:hidden",
                  day.count > 0 ? "bg-current" : "bg-transparent"
                )}
              />
            </TransitionLink>
          );
        })}
      </div>
      <TransitionLink
        href={scoresDayHref(data.nextWeekDate, data.today)}
        scroll={false}
        className={arrow}
        aria-label="Next week"
      >
        ›
      </TransitionLink>
    </nav>
  );
}

function Section({
  title,
  meta,
  children,
  live = false,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
  live?: boolean;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3 px-0.5">
        <h2 className={cn(type.heading, "flex items-center gap-2")}>
          {live ? (
            <span
              aria-hidden
              className="relative inline-flex size-2.5 rounded-full bg-red-600 motion-safe:after:absolute motion-safe:after:inset-0 motion-safe:after:animate-ping motion-safe:after:rounded-full motion-safe:after:bg-red-600/70"
            />
          ) : null}
          {title}
        </h2>
        {meta ? (
          <span className={cn(type.caption, "text-muted-foreground")}>{meta}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function TileGrid({ games }: { games: GameSummary[] }) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
      {games.map((game, i) => (
        <ScoreTile key={game.id} game={game} motionIndex={i} />
      ))}
    </div>
  );
}

function countLabel(n: number) {
  return `${n} game${n === 1 ? "" : "s"}`;
}

export function ScoreboardDay({
  data,
  season,
}: {
  data: ScoreboardDayData;
  season: string;
}) {
  const dayIds = new Set(data.games.map((g) => g.id));
  const initial = [...data.games, ...(data.recent?.games ?? [])];
  const dayLabel = relativeDayLabel(data.date, data.today);

  return (
    <div className="flex flex-col gap-5">
      <DateStrip data={data} />
      {data.date !== data.today ? (
        <div className="-mt-2 flex justify-end">
          <TransitionLink
            href="/scores"
            scroll={false}
            className={cn(type.caption, "font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline")}
          >
            Back to today
          </TransitionLink>
        </div>
      ) : null}

      <LiveScoreboardScope games={initial} season={season}>
        {(games) => {
          const day = games.filter((g) => dayIds.has(g.id)).sort(tipSort);
          const recent = games.filter((g) => !dayIds.has(g.id)).sort(tipSort);
          const live = day.filter((g) => isLiveLikeStatus(g.status));
          const rest = day.filter((g) => !isLiveLikeStatus(g.status));
          const finals = rest.filter((g) => isFinalStatus(g.status)).length;
          const meta =
            day.length === 0
              ? undefined
              : finals > 0 && finals < rest.length
                ? `${countLabel(day.length)} · ${finals} final`
                : countLabel(day.length);
          return (
            <>
              {live.length ? (
                <Section title="Live now" meta={countLabel(live.length)} live>
                  <TileGrid games={live} />
                </Section>
              ) : null}

              <Section
                title={
                  live.length && rest.length
                    ? `More ${dayLabel === "Today" ? "today" : `on ${dayLabel}`}`
                    : dayLabel
                }
                meta={meta}
              >
                {rest.length ? (
                  <TileGrid games={rest} />
                ) : live.length ? null : (
                  <div className="rounded-md border border-dashed border-border px-4 py-8 text-center">
                    <p className={cn(type.body, "text-muted-foreground")}>
                      No games {dayLabel === "Today" ? "today" : `on ${dayLabel}`}.
                    </p>
                    {data.nextGameDate ? (
                      <TransitionLink
                        href={scoresDayHref(data.nextGameDate, data.today)}
                        scroll={false}
                        className={cn(type.bodySm, "mt-1 inline-block font-semibold underline underline-offset-4")}
                      >
                        Next games: {relativeDayLabel(data.nextGameDate, data.today)}
                      </TransitionLink>
                    ) : null}
                  </div>
                )}
              </Section>

              {data.recent && recent.length ? (
                <Section
                  title="Latest results"
                  meta={relativeDayLabel(data.recent.date, data.today)}
                >
                  <TileGrid games={recent} />
                </Section>
              ) : null}

              {data.stale ? (
                <p className={cn(type.caption, "text-muted-foreground")}>
                  Live scores are unavailable right now, so this shows the saved schedule.
                </p>
              ) : null}
            </>
          );
        }}
      </LiveScoreboardScope>
    </div>
  );
}
