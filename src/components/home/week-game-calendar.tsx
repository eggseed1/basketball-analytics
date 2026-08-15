import { WeekGameCalendarClient } from "@/components/home/week-game-calendar-client";
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
    const strip = await getHomeWeekStripSummaries({ season, limit: 10 });
    mode = strip.mode;
    games = strip.games;
  } catch {
    games = [];
  }

  return (
    <WeekGameCalendarClient season={season} mode={mode} games={games} />
  );
}
