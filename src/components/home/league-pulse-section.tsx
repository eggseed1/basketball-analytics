import { LeaguePulse } from "@/components/home/league-pulse";
import { getLeagueStandings } from "@/data/queries";

/** Server wrapper - fetch standings, hand rows to expandable client UI. */
export async function LeaguePulseSection({ season }: { season: string }) {
  try {
    const data = await getLeagueStandings(season);
    const east =
      data.conferences.find((c) => c.conference === "East")?.rows ?? [];
    const west =
      data.conferences.find((c) => c.conference === "West")?.rows ?? [];
    if (!east.length && !west.length) return null;
    return <LeaguePulse east={east} west={west} />;
  } catch {
    return null;
  }
}
