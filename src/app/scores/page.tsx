import { MotionReveal } from "@/components/continuity/motion-reveal";
import {
  Gamefeed,
  type GamefeedView,
} from "@/components/sports/gamefeed";
import {
  ScoreboardDay,
  type ScoreboardDayData,
} from "@/components/sports/scoreboard-day";
import { withBudget } from "@/data/queries/budget";
import { getScoreboardDateFeed } from "@/data/queries/scoreboard-feed";
import {
  addDaysIso,
  defaultScoreboardMonthKey,
  startOfWeekSundayIso,
  upcomingScheduleSeason,
} from "@/data/queries";
import {
  getRuntimeSnapshotGames,
  getRuntimeSnapshotWindow,
} from "@/data/runtime/game-snapshot";
import { toGameSummary } from "@/data/queries/filter-utils";
import { canonicalSeasonFromStartYear } from "@/data/providers/historical/season-range";
import type { Game, GameSummary } from "@/data/types";
import { isPreTipStatus } from "@/lib/game-status";
import { nbaTodayIso } from "@/lib/nba-calendar-date";

export const metadata = {
  title: "Games",
  description: "Live NBA scores, recent results, weekly and monthly schedules, and upcoming tip-offs.",
};

const LIST_PAGE_SIZE = 60;

interface ScoresPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function parseView(raw: string | undefined): GamefeedView {
  if (raw === "week" || raw === "month" || raw === "list") return raw;
  return "day";
}

function one(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

function tipKey(game: Pick<Game, "tipOffAt" | "gameDate" | "id">): string {
  return game.tipOffAt ?? `${game.gameDate}T00:00:00Z:${game.id}`;
}

function summaries(games: Game[]): GameSummary[] {
  return games.map(toGameSummary);
}

function sorted(games: Game[], direction: "asc" | "desc" = "asc"): Game[] {
  return games.slice().sort((a, b) => {
    const cmp = tipKey(a).localeCompare(tipKey(b)) || a.id.localeCompare(b.id);
    return direction === "asc" ? cmp : -cmp;
  });
}

export default async function ScoresPage({ searchParams }: ScoresPageProps) {
  const sp = await searchParams;
  const scheduleSeason = upcomingScheduleSeason();
  const view = parseView(one(sp, "view"));
  const today = nbaTodayIso();

  const monthParam = one(sp, "month");
  const monthKey =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam)
      ? monthParam
      : defaultScoreboardMonthKey(scheduleSeason);

  const weekParam = one(sp, "week");
  const weekSeed =
    weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)
      ? weekParam
      : today;
  const weekStart = startOfWeekSundayIso(weekSeed);
  const weekEnd = addDaysIso(weekStart, 6);

  const afterTip = one(sp, "after");
  const afterId = one(sp, "afterId");

  const schedule = getRuntimeSnapshotGames(scheduleSeason);
  const monthGames =
    view === "month"
      ? summaries(sorted(schedule.filter((game) => game.gameDate.startsWith(monthKey))))
      : [];
  const weekGames =
    view === "week"
      ? summaries(
          sorted(
            schedule.filter(
              (game) => game.gameDate >= weekStart && game.gameDate <= weekEnd
            )
          )
        )
      : [];

  let upcomingPool = schedule.filter(
    (game) =>
      game.gameDate >= today &&
      (isPreTipStatus(game.status) || game.status === "in_progress")
  );
  if (afterTip) {
    upcomingPool = upcomingPool.filter((game) => {
      const tip = game.tipOffAt ?? `${game.gameDate}T00:00:00Z`;
      if (tip > afterTip) return true;
      if (tip < afterTip) return false;
      return afterId ? game.id > afterId : false;
    });
  }
  upcomingPool = sorted(upcomingPool);
  const upcomingHasMore = upcomingPool.length > LIST_PAGE_SIZE;
  const upcomingGames =
    view === "list" ? summaries(upcomingPool.slice(0, LIST_PAGE_SIZE)) : [];

  const day = view === "day" ? await loadDayView(dateParam(one(sp, "date")) ?? today, today) : null;
  const daySeason = day ? seasonForDate(day.date) : scheduleSeason;

  return (
    <main data-motion-page className="site-shell flex flex-col gap-5 py-5 sm:gap-6 sm:py-7">
      <MotionReveal />
      <Gamefeed
        view={view}
        season={view === "day" ? daySeason : scheduleSeason}
        monthKey={monthKey}
        weekStart={weekStart}
        weekEnd={weekEnd}
        monthGames={monthGames}
        weekGames={weekGames}
        upcomingGames={upcomingGames}
        upcomingHasMore={upcomingHasMore}
      >
        {day ? <ScoreboardDay data={day} season={daySeason} /> : null}
      </Gamefeed>
    </main>
  );
}

const NOT_PLAYED = new Set<Game["status"]>(["postponed", "cancelled"]);
const PLAYABLE = { has: (status: Game["status"]) => !NOT_PLAYED.has(status) };
/** ESPN keeps day scoreboards forever, but only recent days are worth the round trip. */
const LIVE_FETCH_WINDOW_DAYS = 21;

/** NBA seasons roll over in July (schedule data starts with Summer League). */
function seasonForDate(date: string): string {
  const year = Number(date.slice(0, 4));
  return canonicalSeasonFromStartYear(Number(date.slice(5, 7)) >= 7 ? year : year - 1);
}

function dateParam(raw: string | undefined): string | null {
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(raw)) ? raw : null;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

/** Snapshot games for the date, overlaid with ESPN's day scoreboard when it's recent. */
async function gamesForDate(
  date: string,
  today: string
): Promise<{ games: GameSummary[]; stale: boolean }> {
  const snapshot = getRuntimeSnapshotWindow({ fromDate: date, toDate: date });
  if (Math.abs(daysBetween(date, today)) > LIVE_FETCH_WINDOW_DAYS) {
    return { games: summaries(snapshot), stale: false };
  }
  const { value: feed } = await withBudget(getScoreboardDateFeed({ date }), 3500, null);
  const byId = new Map<string, GameSummary>(summaries(snapshot).map((g) => [g.id, g]));
  for (const game of feed?.data ?? []) byId.set(game.id, game);
  return {
    games: [...byId.values()],
    stale: feed == null || feed.isStale || feed.source === "unavailable",
  };
}

async function loadDayView(date: string, today: string): Promise<ScoreboardDayData> {
  const stripStart = addDaysIso(date, -3);
  const stripEnd = addDaysIso(stripStart, 6);
  const counts = new Map<string, number>();
  for (const game of getRuntimeSnapshotWindow({ fromDate: stripStart, toDate: stripEnd })) {
    if (PLAYABLE.has(game.status)) counts.set(game.gameDate, (counts.get(game.gameDate) ?? 0) + 1);
  }

  let recentDate: string | null = null;
  let nextGameDate: string | null = null;
  for (const game of getRuntimeSnapshotWindow({})) {
    if (!PLAYABLE.has(game.status)) continue;
    if (game.gameDate < date && (!recentDate || game.gameDate > recentDate)) recentDate = game.gameDate;
    if (game.gameDate > date && (!nextGameDate || game.gameDate < nextGameDate)) nextGameDate = game.gameDate;
  }
  // Only today's slate gets the previous day's results underneath.
  const wantRecent = date === today && recentDate != null;

  const [selected, recent] = await Promise.all([
    gamesForDate(date, today),
    wantRecent ? gamesForDate(recentDate!, today) : Promise.resolve(null),
  ]);
  counts.set(date, selected.games.length);

  return {
    date,
    today,
    strip: Array.from({ length: 7 }, (_, i) => {
      const d = addDaysIso(stripStart, i);
      return { date: d, count: counts.get(d) ?? 0 };
    }),
    prevWeekDate: addDaysIso(date, -7),
    nextWeekDate: addDaysIso(date, 7),
    games: selected.games,
    recent:
      recent && recentDate
        ? { date: recentDate, games: recent.games.filter((g) => PLAYABLE.has(g.status)) }
        : null,
    nextGameDate: selected.games.length ? null : nextGameDate,
    stale: selected.stale,
  };
}
