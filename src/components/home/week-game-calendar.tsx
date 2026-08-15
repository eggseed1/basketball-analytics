import Link from "next/link";

import { GameScoreCard } from "@/components/sports/game-score-card";
import { getHomeWeekStripSummaries } from "@/data/queries";
import type { GameSummary } from "@/data/types";

type StripGame = GameSummary & {
  awayStarters: Array<{ id: string; name: string }>;
  homeStarters: Array<{ id: string; name: string }>;
};

/** Horizontal week strip - this week's games, or upcoming previews when quiet. */
export async function WeekGameCalendar({ season }: { season: string }) {
  let mode: "week" | "upcoming" = "week";
  let games: StripGame[] = [];
  try {
    // Skip starter headshots on the home strip — they flood the network and
    // hydrate dozens of client islands, which feels like an infinite load.
    const strip = await getHomeWeekStripSummaries({
      season,
      limit: 8,
      includeStarters: false,
    });
    mode = strip.mode;
    games = strip.games;
  } catch {
    games = [];
  }

  const title = mode === "upcoming" ? "Upcoming" : "This week";
  const subtitle =
    mode === "upcoming"
      ? `Next tip-offs on the board - ${season}`
      : `This week's slate - ${season}`;

  return (
    <section className="sports-card flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">{title}</h2>
          <p className="text-[13px] text-muted-foreground">{subtitle}</p>
        </div>
        <Link
          href="/scores?view=list"
          className="text-[13px] font-semibold text-muted-foreground underline-offset-4 hover:underline"
        >
          Full gamefeed
        </Link>
      </div>

      {games.length === 0 ? (
        <div className="rounded-md border border-dashed border-black/10 px-4 py-10 text-center text-[13px] text-muted-foreground">
          No upcoming games on the scoreboard yet.
        </div>
      ) : (
        <div className="-mx-1 flex gap-2 overflow-x-auto overflow-y-visible px-1 pb-8">
          {games.map((game) => (
            <GameScoreCard
              key={game.id}
              game={game}
              awayStarters={game.awayStarters}
              homeStarters={game.homeStarters}
              className="w-[280px] shrink-0 overflow-visible sm:w-[300px]"
            />
          ))}
        </div>
      )}
    </section>
  );
}
