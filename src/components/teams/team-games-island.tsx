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

  const archiveNote =
    teamGames.source === "unavailable"
      ? teamGames.warning ??
        `Historical games unavailable for ${season}.`
      : teamGames.source === "disk_cache"
        ? "From local historical game archive · opens Game Lab"
        : "Recent / upcoming from schedule · opens Game Lab";

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
        {teamGames.source === "unavailable" && teamGames.games.length === 0 ? (
          upcomingBundle.games.length > 0 ? (
            <TeamGamesSection
              recentPool={[]}
              upcomingPool={upcomingBundle.games}
              team={team}
              brand={brand}
              seasonAvgPpg={null}
            />
          ) : (
            <p className="text-[13px] text-muted-foreground">
              {teamGames.warning ??
                `Historical games unavailable for ${season}.`}
            </p>
          )
        ) : (
          <TeamGamesSection
            recentPool={teamGames.games}
            upcomingPool={upcomingBundle.games}
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
