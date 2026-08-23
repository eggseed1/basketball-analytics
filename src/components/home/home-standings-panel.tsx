import { HomeStandingsBoard } from "@/components/home/home-standings-board";
import { isPreseasonRosterSeason } from "@/data/providers/nba/espn-roster-client";
import { getLeagueStandings } from "@/data/queries";
import { shiftCanonicalSeason } from "@/lib/player-stat-comps";

export async function HomeStandingsPanel({ season }: { season: string }) {
  try {
    // In the offseason, skip a guaranteed-empty current-season request and
    // load the completed standings directly.
    const initialSeason = isPreseasonRosterSeason(season)
      ? shiftCanonicalSeason(season, -1)
      : season;
    const data = await getLeagueStandings(initialSeason);
    let east =
      data.conferences.find((c) => c.conference === "East")?.rows ?? [];
    let west =
      data.conferences.find((c) => c.conference === "West")?.rows ?? [];
    let displaySeason = initialSeason;

    if (
      !east.length &&
      !west.length &&
      initialSeason === season &&
      isPreseasonRosterSeason(season)
    ) {
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
      />
    );
  } catch {
    return null;
  }
}
