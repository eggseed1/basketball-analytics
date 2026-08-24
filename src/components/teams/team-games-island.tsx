import { TeamGamesSection } from "@/components/teams/team-games-section";
import { TeamGamesLog } from "@/components/teams/team-games-log";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import {
  hasHistoryTeamGameIndex,
} from "@/data/history/team-matchup-index";
import { getUpcomingGameSummaries } from "@/data/queries";
import { upcomingScheduleSeason } from "@/data/providers/nba/scoreboard-client";
import { getTeamSeasonGamesCached } from "@/data/queries/request-cache";
import type { TeamSeasonStats } from "@/data/types";
import type { TeamBrand } from "@/lib/nba-brand";

export async function TeamGamesIsland({
  team,
  brand,
  season,
  gamesPage = 1,
  fromHistory,
  theme,
}: {
  team: TeamSeasonStats;
  brand?: TeamBrand | null;
  season: string;
  gamesPage?: number;
  fromHistory?: boolean;
  theme?: string;
}) {
  const currentSeason = canonicalSeasonFromStartYear(currentNbaStartYear());
  const useProductIndex = hasHistoryTeamGameIndex(season);

  if (useProductIndex) {
    const {
      getCompactTeamSeasonGames,
      paginateCompactTeamGames,
      compactRowsToGameSummaries,
    } = await import("@/data/history/team-matchup-index");
    const all = getCompactTeamSeasonGames(team.teamId, season);
    const page = paginateCompactTeamGames(all, gamesPage);
    const recentPool = compactRowsToGameSummaries(all.slice(0, 8));

    return (
      <section
        id="games"
        className="scroll-mt-16 flex flex-col gap-3"
        aria-label="Games"
      >
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">Games</h2>
          <p className="text-[13px] text-muted-foreground">
            From local historical game index · opens Game Lab · bounded page (
            {page.pageSize} max)
          </p>
        </div>
        <div className="sports-card flex flex-col gap-5 p-4 sm:p-5">
          {page.total === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              Historical games unavailable for {season}.
            </p>
          ) : (
            <>
              <TeamGamesSection
                recentPool={recentPool}
                upcomingPool={[]}
                team={team}
                brand={brand}
                seasonAvgPpg={
                  Number.isFinite(team.ppg) ? team.ppg : null
                }
              />
              <TeamGamesLog
                teamId={team.teamId}
                season={season}
                rows={page.rows}
                total={page.total}
                page={page.page}
                pageCount={page.pageCount}
                fromHistory={fromHistory}
                theme={theme}
              />
            </>
          )}
        </div>
      </section>
    );
  }

  const [teamGames, upcomingBundle] = await Promise.all([
    getTeamSeasonGamesCached(
      team.teamId,
      season,
      team.abbreviation
    ).catch(() => ({
      games: [],
      source: "unavailable" as const,
      warning: `Historical games unavailable for ${season}.`,
    })),
    season === currentSeason
      ? getUpcomingGameSummaries({
          season: upcomingScheduleSeason(),
          limit: 40,
          monthCount: 3,
        }).catch(() => ({
          games: [],
        }))
      : Promise.resolve({ games: [] }),
  ]);

  // Cloudflare Workers often lack disk season archives; seed recent/upcoming from
  // the build-time schedule snapshot so the Games tab is never an empty shell.
  let recentPool = teamGames.games;
  let upcomingPool = upcomingBundle.games;
  if (recentPool.length === 0 || upcomingPool.length === 0) {
    const { getRuntimeSnapshotGames } = await import(
      "@/data/runtime/game-snapshot"
    );
    const { toGameSummary } = await import("@/data/queries/filter-utils");
    const today = new Date().toISOString().slice(0, 10);
    const snapshot = getRuntimeSnapshotGames(season).map(toGameSummary);
    if (upcomingPool.length === 0) {
      upcomingPool = snapshot.filter(
        (game) =>
          game.gameDate >= today &&
          (game.status === "scheduled" ||
            game.status === "pregame" ||
            game.status === "delayed" ||
            game.status === "in_progress")
      );
    }
    if (recentPool.length === 0) {
      recentPool = snapshot
        .filter(
          (game) =>
            game.gameDate < today ||
            game.status === "final" ||
            game.status === "halftime"
        )
        .reverse();
    }
  }

  const archiveNote =
    recentPool.length > 0 || upcomingPool.length > 0
      ? teamGames.source === "disk_cache"
        ? "From local historical game archive · opens Game Lab"
        : "Recent / upcoming from schedule · opens Game Lab"
      : teamGames.warning ??
        `Historical games unavailable for ${season}.`;

  return (
    <section
      id="games"
      className="scroll-mt-16 flex flex-col gap-3"
      aria-label="Games"
    >
      <div>
        <h2 className="text-[17px] font-bold tracking-tight">Games</h2>
        <p className="text-[13px] text-muted-foreground">{archiveNote}</p>
      </div>
      <div className="sports-card p-4 sm:p-5">
        {recentPool.length === 0 && upcomingPool.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            {teamGames.warning ??
              `Historical games unavailable for ${season}.`}
          </p>
        ) : (
          <TeamGamesSection
            recentPool={recentPool}
            upcomingPool={upcomingPool}
            team={team}
            brand={brand}
            seasonAvgPpg={
              Number.isFinite(team.ppg) ? team.ppg : null
            }
          />
        )}
      </div>
    </section>
  );
}
