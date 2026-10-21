import { WeekGameCalendarClient } from "@/components/home/week-game-calendar-client";
import { ScoreboardFeedNotice } from "@/components/sports/scoreboard-feed-notice";
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
  let source: "live-espn" | "cached-espn" | "unavailable" | undefined;
  let warnings: string[] = [];
  try {
    const strip = await getHomeWeekStripSummaries({ season, limit: 10 });
    mode = strip.mode;
    games = strip.games;
    source = strip.source;
    warnings = strip.warnings ?? [];
  } catch {
    games = [];
    source = "unavailable";
    warnings = ["Live scores temporarily unavailable."];
  }

  return (
    <div className="flex flex-col gap-2">
      <ScoreboardFeedNotice source={source} warnings={warnings} />
      <WeekGameCalendarClient season={season} mode={mode} games={games} />
    </div>
  );
}
