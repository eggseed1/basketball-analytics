"use client";

import { HomeGameStripCard } from "@/components/home/home-game-strip-card";
import { TextLink } from "@/components/ui/text-link";
import { LiveScoreboardScope } from "@/components/sports/live-scoreboard-scope";
import type { GameSummary } from "@/data/types";

type StripGame = GameSummary & {
  awayStarters: Array<{ id: string; name: string }>;
  homeStarters: Array<{ id: string; name: string }>;
};

/** Client strip - reuses the shared live scoreboard poller (no separate architecture). */
export function WeekGameCalendarClient({
  season,
  mode: _mode,
  games: initialGames,
}: {
  season: string;
  mode: "week" | "upcoming";
  games: StripGame[];
}) {
  return (
    <section className="sports-card flex flex-col gap-3 p-4 sm:p-[21px]">
      <div className="flex items-center justify-between gap-2">
        <h2 className="type-heading">Upcoming Games</h2>
        <TextLink
          href="/scores?view=week"
          className="type-body-sm text-muted-foreground"
        >
          See all schedule →
        </TextLink>
      </div>

      {initialGames.length === 0 ? (
        <div className="type-body-sm rounded-md border border-dashed border-border px-4 py-10 text-center text-muted-foreground">
          No upcoming games on the scoreboard yet.
        </div>
      ) : (
        <LiveScoreboardScope games={initialGames} season={season}>
          {(games) => (
            <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-1">
              {games.map((game) => (
                <HomeGameStripCard key={game.id} game={game} />
              ))}
            </div>
          )}
        </LiveScoreboardScope>
      )}
    </section>
  );
}
