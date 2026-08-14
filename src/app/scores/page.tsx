import { BrowseCircles } from "@/components/sports/browse-circles";
import {
  Gamefeed,
  type GamefeedView,
} from "@/components/sports/gamefeed";
import { GameScoreCard } from "@/components/sports/game-score-card";
import {
  addDaysIso,
  defaultScoreboardMonthKey,
  getRecentGameSummaries,
  getScoreboardMonthSummaries,
  getScoreboardWeekSummaries,
  getUpcomingGameSummaries,
  startOfWeekSundayIso,
  upcomingScheduleSeason,
} from "@/data/queries";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import type { GameSummary } from "@/data/types";

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
  let upcomingNextHref: string | null = null;
  let feedSeason = scheduleSeason;

  const recentPromise = getRecentGameSummaries({
    season: statsSeason,
    limit: 6,
  }).catch(() => [] as GameSummary[]);

  let recent: GameSummary[] = [];

  if (view === "month") {
    const [month, recentGames] = await Promise.all([
      getScoreboardMonthSummaries({ monthKey, season: scheduleSeason }),
      recentPromise,
    ]);
    monthGames = month.games;
    recent = recentGames;
    feedSeason = month.season;
  } else if (view === "week") {
    const [week, recentGames] = await Promise.all([
      getScoreboardWeekSummaries({ weekStart, season: scheduleSeason }),
      recentPromise,
    ]);
    weekGames = week.games;
    weekEnd = week.weekEnd;
    recent = recentGames;
    feedSeason = week.season;
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

    if (upcomingHasMore && upcomingGames.length) {
      const last = upcomingGames[upcomingGames.length - 1]!;
      const params = new URLSearchParams({ view: "list" });
      if (last.tipOffAt) params.set("after", last.tipOffAt);
      else params.set("after", `${last.gameDate}T00:00:00Z`);
      params.set("afterId", last.id);
      upcomingNextHref = `/scores?${params.toString()}`;
    }
  }

  return (
    <main className="site-shell flex flex-col gap-5 py-5 sm:gap-6 sm:py-7">
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
        upcomingNextHref={upcomingNextHref}
      />

      {recent.length ? (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-[17px] font-bold tracking-tight">
              Latest results
            </h2>
            <p className="text-[13px] text-muted-foreground">
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

      <section className="sports-card px-4 py-4 sm:px-5">
        <h2 className="mb-3 text-[15px] font-bold">Browse</h2>
        <BrowseCircles />
      </section>
    </main>
  );
}
