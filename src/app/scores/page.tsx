import { Gamefeed, type GamefeedView } from "@/components/sports/gamefeed";
import { GameScoreCard } from "@/components/sports/game-score-card";
import { RuntimeScoreboardFallback } from "@/components/sports/runtime-scoreboard-fallback";
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
import { getRecentScoreboardFeed, type ScoreboardFeedSource } from "@/data/queries/scoreboard-feed";
import { canonicalSeasonFromStartYear, currentNbaStartYear } from "@/data/providers/historical/season-range";
import type { GameSummary } from "@/data/types";

export const metadata = { title: "Games", description: "NBA scores, weekly and monthly schedules, and upcoming tip-offs." };
const LIST_PAGE_SIZE = 60;
interface ScoresPageProps { searchParams: Promise<Record<string, string | string[] | undefined>>; }
function parseView(raw?: string): GamefeedView { return raw === "week" || raw === "month" || raw === "list" ? raw : "list"; }
function one(sp: Record<string, string | string[] | undefined>, key: string) { const v = sp[key]; return Array.isArray(v) ? v[0] : v; }

export default async function ScoresPage({ searchParams }: ScoresPageProps) {
  const sp = await searchParams;
  const statsSeason = canonicalSeasonFromStartYear(currentNbaStartYear());
  const scheduleSeason = upcomingScheduleSeason();
  const view = parseView(one(sp, "view"));
  const monthParam = one(sp, "month");
  const monthKey = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : defaultScoreboardMonthKey(scheduleSeason);
  const weekParam = one(sp, "week");
  const weekSeed = weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? weekParam : new Date().toISOString().slice(0, 10);
  const weekStart = startOfWeekSundayIso(weekSeed);
  let weekEnd = addDaysIso(weekStart, 6);
  let monthGames: GameSummary[] = [];
  let weekGames: GameSummary[] = [];
  let upcomingGames: GameSummary[] = [];
  let upcomingHasMore = false;
  let feedSeason = scheduleSeason;
  let feedSource: ScoreboardFeedSource | undefined;
  let feedWarnings: string[] = [];

  const recentPromise = getRecentScoreboardFeed({ season: statsSeason, limit: 6 }).then(f => f.data).catch(() => [] as GameSummary[]);
  const afterTip = one(sp, "after");
  const afterId = one(sp, "afterId");

  if (view === "month") {
    const month = await getScoreboardMonthSummaries({ monthKey, season: scheduleSeason }).catch(() => null);
    if (month) { monthGames = month.games; feedSeason = month.season; feedSource = month.source; feedWarnings = month.warnings ?? []; }
  } else if (view === "week") {
    const week = await getScoreboardWeekSummaries({ weekStart, season: scheduleSeason }).catch(() => null);
    if (week) { weekGames = week.games; weekEnd = week.weekEnd; feedSeason = week.season; feedSource = week.source; feedWarnings = week.warnings ?? []; }
  } else {
    const fromDate = afterTip && afterTip.length >= 10 ? afterTip.slice(0, 10) : new Date().toISOString().slice(0, 10);
    const upcoming = await getUpcomingGameSummaries({ season: scheduleSeason, fromDate, afterTipOffAt: afterTip, afterId, monthCount: 8, limit: LIST_PAGE_SIZE }).catch(() => null);
    if (upcoming) { upcomingGames = upcoming.games; upcomingHasMore = upcoming.hasMore; feedSeason = upcoming.season; feedSource = upcoming.source; feedWarnings = upcoming.warnings ?? []; }
  }

  const recent = await recentPromise;
  const hasServerGames = view === "month" ? monthGames.length > 0 : view === "week" ? weekGames.length > 0 : upcomingGames.length > 0;

  return (
    <main className="site-shell flex flex-col gap-5 py-5 sm:gap-6 sm:py-7">
      {hasServerGames ? <ScoreboardFeedNotice source={feedSource} warnings={feedWarnings} /> : null}
      {hasServerGames ? (
        <Gamefeed view={view} season={feedSeason} monthKey={monthKey} weekStart={weekStart} weekEnd={weekEnd} monthGames={monthGames} weekGames={weekGames} upcomingGames={upcomingGames} upcomingHasMore={upcomingHasMore} />
      ) : (
        <RuntimeScoreboardFallback view={view} season={scheduleSeason} monthKey={monthKey} weekStart={weekStart} weekEnd={weekEnd} />
      )}
      {recent.length ? <section className="flex flex-col gap-3"><div><h2 className="text-[20px] font-bold tracking-tight">Latest results</h2><p className="text-[14px] text-muted-foreground">Jump into a recent box score.</p></div><div className="flex flex-col gap-1">{recent.map(game => <GameScoreCard key={game.id} game={game} />)}</div></section> : null}
    </main>
  );
}
