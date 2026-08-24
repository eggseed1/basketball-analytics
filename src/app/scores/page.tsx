import {
  Gamefeed,
  type GamefeedView,
} from "@/components/sports/gamefeed";
import { GameScoreCard } from "@/components/sports/game-score-card";
import { ScoreboardFeedNotice } from "@/components/sports/scoreboard-feed-notice";
import {
  addDaysIso,
  defaultScoreboardMonthKey,
  getScoreboardMonthSummaries,
  getScoreboardWeekSummaries,
  getUpcomingGameSummaries,
  startOfWeekSundayIso,
  upcomingScheduleSeason,
} from "@/data/queries";
import {
  getRecentScoreboardFeed,
  type ScoreboardFeedSource,
} from "@/data/queries/scoreboard-feed";
import { fetchNbaCdnSchedule } from "@/data/providers/nba/nba-cdn-game-client";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { toGameSummary } from "@/data/queries/filter-utils";
import type { Game, GameSummary } from "@/data/types";
import { isPreTipStatus } from "@/lib/game-status";

export const metadata = {
  title: "Games",
  description: "NBA scores, weekly and monthly schedules, and upcoming tip-offs.",
};

const LIST_PAGE_SIZE = 60;

interface ScoresPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function parseView(raw: string | undefined): GamefeedView {
  if (raw === "week" || raw === "month" || raw === "list") return raw;
  return "list";
}

function one(sp: Record<string, string | string[] | undefined>, key: string) {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

function gameSortKey(game: Pick<Game, "tipOffAt" | "gameDate" | "id">): string {
  return game.tipOffAt ?? `${game.gameDate}T00:00:00Z:${game.id}`;
}

function nbaScheduleWindow(options: {
  schedule: Game[];
  start?: string;
  end?: string;
  monthKey?: string;
  afterTip?: string;
  afterId?: string;
  upcomingOnly?: boolean;
}): GameSummary[] {
  const rows = options.schedule.filter((game) => {
    if (options.monthKey && !game.gameDate.startsWith(options.monthKey)) return false;
    if (options.start && game.gameDate < options.start) return false;
    if (options.end && game.gameDate > options.end) return false;
    if (options.upcomingOnly && !isPreTipStatus(game.status) && game.status !== "in_progress") {
      return false;
    }
    if (options.afterTip) {
      const tip = game.tipOffAt ?? `${game.gameDate}T00:00:00Z`;
      if (tip < options.afterTip) return false;
      if (tip === options.afterTip && options.afterId && game.id <= options.afterId) {
        return false;
      }
    }
    return true;
  });

  return rows
    .slice()
    .sort((a, b) => {
      const ta = gameSortKey(a);
      const tb = gameSortKey(b);
      if (ta !== tb) return ta.localeCompare(tb);
      return a.id.localeCompare(b.id);
    })
    .map(toGameSummary);
}

async function nbaScheduleFallback(season: string): Promise<Game[]> {
  try {
    return await fetchNbaCdnSchedule(season);
  } catch (error) {
    console.warn("[scores] official NBA schedule fallback unavailable", {
      season,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export default async function ScoresPage({ searchParams }: ScoresPageProps) {
  const sp = await searchParams;
  const statsSeason = canonicalSeasonFromStartYear(currentNbaStartYear());
  const scheduleSeason = upcomingScheduleSeason();
  const view = parseView(one(sp, "view"));

  const monthParam = one(sp, "month");
  const monthKey =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam)
      ? monthParam
      : defaultScoreboardMonthKey(scheduleSeason);

  const weekParam = one(sp, "week");
  const weekSeed =
    weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)
      ? weekParam
      : new Date().toISOString().slice(0, 10);
  const weekStart = startOfWeekSundayIso(weekSeed);

  const afterTip = one(sp, "after");
  const afterId = one(sp, "afterId");

  let monthGames: GameSummary[] = [];
  let weekGames: GameSummary[] = [];
  let weekEnd = addDaysIso(weekStart, 6);
  let upcomingGames: GameSummary[] = [];
  let upcomingHasMore = false;
  let feedSeason = scheduleSeason;
  let feedSource: ScoreboardFeedSource | undefined;
  let feedWarnings: string[] = [];

  // Keep the sidebar on the lightweight scoreboard cache. The old helper fell
  // through to a full-season schedule load when the current league year had no
  // completed games yet, which made the entire Games page wait on that crawl.
  const recentPromise = getRecentScoreboardFeed({
    season: statsSeason,
    limit: 6,
  })
    .then((feed) => feed.data)
    .catch(() => [] as GameSummary[]);

  let recent: GameSummary[] = [];

  if (view === "month") {
    const [month, recentGames] = await Promise.all([
      getScoreboardMonthSummaries({ monthKey, season: scheduleSeason }),
      recentPromise,
    ]);
    monthGames = month.games;
    recent = recentGames;
    feedSeason = month.season;
    feedSource = month.source;
    feedWarnings = month.warnings ?? [];

    if (monthGames.length === 0 && month.source === "unavailable") {
      const nbaSchedule = await nbaScheduleFallback(scheduleSeason);
      const fallback = nbaScheduleWindow({
        schedule: nbaSchedule,
        monthKey,
      });
      if (fallback.length > 0) {
        monthGames = fallback;
        feedSource = undefined;
        feedWarnings = [];
      }
    }
  } else if (view === "week") {
    const [week, recentGames] = await Promise.all([
      getScoreboardWeekSummaries({ weekStart, season: scheduleSeason }),
      recentPromise,
    ]);
    weekGames = week.games;
    weekEnd = week.weekEnd;
    recent = recentGames;
    feedSeason = week.season;
    feedSource = week.source;
    feedWarnings = week.warnings ?? [];

    if (weekGames.length === 0 && week.source === "unavailable") {
      const nbaSchedule = await nbaScheduleFallback(scheduleSeason);
      const fallback = nbaScheduleWindow({
        schedule: nbaSchedule,
        start: weekStart,
        end: weekEnd,
      });
      if (fallback.length > 0) {
        weekGames = fallback;
        feedSource = undefined;
        feedWarnings = [];
      }
    }
  } else {
    const fromDate =
      afterTip && afterTip.length >= 10
        ? afterTip.slice(0, 10)
        : new Date().toISOString().slice(0, 10);

    const [upcoming, recentGames] = await Promise.all([
      getUpcomingGameSummaries({
        season: scheduleSeason,
        fromDate,
        afterTipOffAt: afterTip,
        afterId,
        monthCount: 8,
        limit: LIST_PAGE_SIZE,
      }),
      recentPromise,
    ]);
    upcomingGames = upcoming.games;
    upcomingHasMore = upcoming.hasMore;
    feedSeason = upcoming.season;
    recent = recentGames;
    feedSource = upcoming.source;
    feedWarnings = upcoming.warnings ?? [];

    if (upcomingGames.length === 0 && upcoming.source === "unavailable") {
      const nbaSchedule = await nbaScheduleFallback(scheduleSeason);
      const fallback = nbaScheduleWindow({
        schedule: nbaSchedule,
        start: fromDate,
        afterTip,
        afterId,
        upcomingOnly: true,
      });
      if (fallback.length > 0) {
        upcomingGames = fallback.slice(0, LIST_PAGE_SIZE);
        upcomingHasMore = fallback.length > LIST_PAGE_SIZE;
        feedSource = undefined;
        feedWarnings = [];
      }
    }
  }

  return (
    <main className="site-shell flex flex-col gap-5 py-5 sm:gap-6 sm:py-7">
      <ScoreboardFeedNotice source={feedSource} warnings={feedWarnings} />

      <Gamefeed
        view={view}
        season={feedSeason}
        monthKey={monthKey}
        weekStart={weekStart}
        weekEnd={weekEnd}
        monthGames={monthGames}
        weekGames={weekGames}
        upcomingGames={upcomingGames}
        upcomingHasMore={upcomingHasMore}
      />

      {recent.length ? (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-[20px] font-bold tracking-tight">
              Latest results
            </h2>
            <p className="text-[14px] text-muted-foreground">
              Jump into a recent box score.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            {recent.map((game) => (
              <GameScoreCard key={game.id} game={game} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
