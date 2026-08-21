import { HomeStandingsBoard } from "@/components/home/home-standings-board";
import { getLeagueStandings } from "@/data/queries";

export async function HomeStandingsPanel({ season }: { season: string }) {
  try {
    const data = await getLeagueStandings(season);
    const east =
      data.conferences.find((c) => c.conference === "East")?.rows ?? [];
    const west =
      data.conferences.find((c) => c.conference === "West")?.rows ?? [];
    if (!east.length && !west.length) return null;

    return (
      <HomeStandingsBoard
        season={season}
        east={east.slice(0, 8)}
        west={west.slice(0, 8)}
      />
    );
  } catch {
    return null;
  }
}
