import {
  Gamefeed,
  type GamefeedView,
} from "@/components/sports/gamefeed";
import { GameScoreCard } from "@/components/sports/game-score-card";
import {
  addDaysIso,
  defaultScoreboardMonthKey,
  startOfWeekSundayIso,
  upcomingScheduleSeason,
} from "@/data/queries";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import {
  getRuntimeSnapshotGames,
  getRuntimeSnapshotWindow,
} from "@/data/runtime/game-snapshot";
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
  const statsSeason = canonicalSeasonFromStartYear(currentNbaStartYear() - 1);
  const scheduleSeason = upcomingScheduleSeason();
  const view = parseView(one(sp, "view"));
  const today = new Date().toISOString().slice(0, 10);

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

  const recent = summaries(
    sorted(
      getRuntimeSnapshotWindow({ season: statsSeason, status: "final" }),
      "desc"
    ).slice(0, 6)
  );

  return (
    <main className="site-shell flex flex-col gap-5 py-5 sm:gap-6 sm:py-7">
      <Gamefeed
        view={view}
        season={scheduleSeason}
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
