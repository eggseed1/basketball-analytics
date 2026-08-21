import { TeamGamesSection } from "@/components/teams/team-games-section";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { getUpcomingGameSummaries } from "@/data/queries";
import { getTeamSeasonGamesCached } from "@/data/queries/request-cache";
import type { TeamSeasonStats } from "@/data/types";
import type { TeamBrand } from "@/lib/nba-brand";

export async function TeamGamesIsland({
  team,
  brand,
  season,
}: {
  team: TeamSeasonStats;
  brand?: TeamBrand | null;
  season: string;
}) {
  const currentSeason = canonicalSeasonFromStartYear(currentNbaStartYear());
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
      ? getUpcomingGameSummaries({ season, limit: 40 }).catch(() => ({
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
        <h2 className="text-[20px] font-bold tracking-tight">Games</h2>
        <p className="text-[14px] text-muted-foreground">{archiveNote}</p>
      </div>
      <div className="sports-card p-4 sm:p-5">
        {teamGames.source === "unavailable" && teamGames.games.length === 0 ? (
          <p className="text-[14px] text-muted-foreground">
            {teamGames.warning ??
              `Historical games unavailable for ${season}.`}
          </p>
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
