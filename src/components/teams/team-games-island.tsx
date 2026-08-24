import { TeamGamesSection } from "@/components/teams/team-games-section";
import { TeamGamesLog } from "@/components/teams/team-games-log";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import {
  hasHistoryTeamGameIndex,
} from "@/data/history/team-matchup-index";
import { toGameSummary } from "@/data/queries/filter-utils";
import { getRuntimeSnapshotGames } from "@/data/runtime/game-snapshot";
import { getTeamSeasonGamesCached } from "@/data/queries/request-cache";
import type { GameSummary, TeamSeasonStats } from "@/data/types";
import type { TeamBrand } from "@/lib/nba-brand";
import { withBudget } from "@/data/queries/budget";

function snapshotPoolsForSeason(season: string): {
  recentPool: GameSummary[];
  upcomingPool: GameSummary[];
} {
  const today = new Date().toISOString().slice(0, 10);
  const snapshot = getRuntimeSnapshotGames(season).map(toGameSummary);
  return {
    upcomingPool: snapshot.filter(
      (game) =>
        game.gameDate >= today &&
        (game.status === "scheduled" ||
          game.status === "pregame" ||
          game.status === "delayed" ||
          game.status === "in_progress")
    ),
    recentPool: snapshot
      .filter(
        (game) =>
          game.gameDate < today ||
          game.status === "final" ||
          game.status === "halftime"
      )
      .reverse(),
  };
}

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
    const snapshot =
      all.length === 0 && season >= currentSeason
        ? snapshotPoolsForSeason(season)
        : null;

    return (
      <section
        id="games"
        className="scroll-mt-16 flex flex-col gap-3"
        aria-label="Games"
      >
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">Games</h2>
          <p className="text-[13px] text-muted-foreground">
            {snapshot
              ? "Recent / upcoming from schedule · opens Game Lab"
              : `From local historical game index · opens Game Lab · bounded page (${page.pageSize} max)`}
          </p>
        </div>
        <div className="sports-card flex flex-col gap-5 p-4 sm:p-5">
          {page.total === 0 && !snapshot ? (
            <p className="text-[13px] text-muted-foreground">
              Historical games unavailable for {season}.
            </p>
          ) : snapshot ? (
            <TeamGamesSection
              recentPool={snapshot.recentPool}
              upcomingPool={snapshot.upcomingPool}
              team={team}
              brand={brand}
              seasonAvgPpg={null}
            />
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

  // Prefer snapshot for the live/current season so Cloudflare Workers never
  // block the Games tab on slow ESPN season crawls (CPU time / soft-fail).
  if (season >= currentSeason) {
    const snapshot = snapshotPoolsForSeason(season);
    return (
      <section
        id="games"
        className="scroll-mt-16 flex flex-col gap-3"
        aria-label="Games"
      >
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">Games</h2>
          <p className="text-[13px] text-muted-foreground">
            Recent / upcoming from schedule · opens Game Lab
          </p>
        </div>
        <div className="sports-card p-4 sm:p-5">
          <TeamGamesSection
            recentPool={snapshot.recentPool}
            upcomingPool={snapshot.upcomingPool}
            team={team}
            brand={brand}
            seasonAvgPpg={
              Number.isFinite(team.ppg) ? team.ppg : null
            }
          />
        </div>
      </section>
    );
  }

  const teamGames = (
    await withBudget(
      getTeamSeasonGamesCached(team.teamId, season, team.abbreviation),
      2_500,
      {
        games: [] as GameSummary[],
        source: "unavailable" as const,
        warning: `Historical games unavailable for ${season}.`,
      }
    )
  ).value;

  return (
    <section
      id="games"
      className="scroll-mt-16 flex flex-col gap-3"
      aria-label="Games"
    >
      <div>
        <h2 className="text-[17px] font-bold tracking-tight">Games</h2>
        <p className="text-[13px] text-muted-foreground">
          {teamGames.source === "disk_cache"
            ? "From local historical game archive · opens Game Lab"
            : "Recent / upcoming from schedule · opens Game Lab"}
        </p>
      </div>
      <div className="sports-card p-4 sm:p-5">
        {teamGames.games.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            {teamGames.warning ??
              `Historical games unavailable for ${season}.`}
          </p>
        ) : (
          <TeamGamesSection
            recentPool={teamGames.games}
            upcomingPool={[]}
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
