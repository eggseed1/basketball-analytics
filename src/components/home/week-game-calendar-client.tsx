"use client";

import Link from "next/link";

import { GameScoreCard } from "@/components/sports/game-score-card";
import { LiveScoreboardScope } from "@/components/sports/live-scoreboard-scope";
import type { GameSummary } from "@/data/types";

type StripGame = GameSummary & {
  awayStarters: Array<{ id: string; name: string }>;
  homeStarters: Array<{ id: string; name: string }>;
};

/** Client strip — reuses the shared live scoreboard poller (no separate architecture). */
export function WeekGameCalendarClient({
  season,
  mode,
  games: initialGames,
}: {
  season: string;
  mode: "week" | "upcoming";
  games: StripGame[];
}) {
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

      {initialGames.length === 0 ? (
        <div className="rounded-md border border-dashed border-black/10 px-4 py-10 text-center text-[13px] text-muted-foreground">
          No upcoming games on the scoreboard yet.
        </div>
      ) : (
        <LiveScoreboardScope games={initialGames} season={season}>
          {(games) => (
            <div className="-mx-1 flex gap-2 overflow-x-auto overflow-y-visible px-1 pb-8">
              {games.map((game) => {
                const starters = initialGames.find((g) => g.id === game.id);
                return (
                  <div key={game.id} className="min-w-[16rem] shrink-0">
                    <GameScoreCard
                      game={game}
                      awayStarters={starters?.awayStarters}
                      homeStarters={starters?.homeStarters}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </LiveScoreboardScope>
      )}
    </section>
  );
}
