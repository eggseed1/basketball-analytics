import Link from "next/link";

import { StandingsConferenceTable } from "@/components/standings/standings-conference-table";
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
      <section className="sports-card flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-[17px] font-bold tracking-tight">
              {season} standings
            </h2>
            <p className="text-[13px] text-muted-foreground">East &amp; West</p>
          </div>
          <Link
            href="/standings"
            className="text-[13px] font-semibold text-muted-foreground underline-offset-4 hover:underline"
          >
            Full board
          </Link>
        </div>
        <div className="grid gap-3">
          <StandingsConferenceTable
            title="West"
            rows={west.slice(0, 8)}
            compact
          />
          <StandingsConferenceTable
            title="East"
            rows={east.slice(0, 8)}
            compact
          />
        </div>
      </section>
    );
  } catch {
    return null;
  }
}
