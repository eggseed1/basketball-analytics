import { HomeStandingsBoard } from "@/components/home/home-standings-board";
import { isPreseasonRosterSeason } from "@/data/providers/nba/espn-roster-client";
import { getLeagueStandings } from "@/data/queries";
import { shiftCanonicalSeason } from "@/lib/player-stat-comps";

export async function HomeStandingsPanel({ season }: { season: string }) {
  try {
    const data = await getLeagueStandings(season);
    let east =
      data.conferences.find((c) => c.conference === "East")?.rows ?? [];
    let west =
      data.conferences.find((c) => c.conference === "West")?.rows ?? [];
    let displaySeason = season;

    if (!east.length && !west.length && isPreseasonRosterSeason(season)) {
      const priorSeason = shiftCanonicalSeason(season, -1);
      const prior = await getLeagueStandings(priorSeason);
      east =
        prior.conferences.find((c) => c.conference === "East")?.rows ?? [];
      west =
        prior.conferences.find((c) => c.conference === "West")?.rows ?? [];
      displaySeason = priorSeason;
    }

    if (!east.length && !west.length) return null;

    return (
      <HomeStandingsBoard
        season={displaySeason}
        east={east.slice(0, 8)}
        west={west.slice(0, 8)}
        subtitle={
          displaySeason !== season
            ? `${season} hasn't started — showing ${displaySeason} final standings`
            : undefined
        }
      />
    );
  } catch {
    return null;
  }
}
