import { WeekGameCalendarClient } from "@/components/home/week-game-calendar-client";
import { ScoreboardFeedNotice } from "@/components/sports/scoreboard-feed-notice";
import { getHomeWeekStripSummaries } from "@/data/queries";
import type { GameSummary } from "@/data/types";

type StripGame = GameSummary & {
  awayStarters: Array<{ id: string; name: string }>;
  homeStarters: Array<{ id: string; name: string }>;
};

/** Strip cards + live poller only need identity, tip, status, and scores. */
function slimStripGame(game: StripGame): StripGame {
  return {
    id: game.id,
    season: game.season,
    gameDate: game.gameDate,
    tipOffAt: game.tipOffAt,
    statusDetail: game.statusDetail,
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    homeTeamAbbr: game.homeTeamAbbr,
    awayTeamAbbr: game.awayTeamAbbr,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    status: game.status,
    period: game.period,
    displayClock: game.displayClock,
    gameType: game.gameType,
    totalPoints: game.totalPoints,
    margin: game.margin,
    absMargin: game.absMargin,
    awayStarters: [],
    homeStarters: [],
  };
}

/** Horizontal week strip - this week's games, or upcoming previews when quiet. */
export async function WeekGameCalendar({ season }: { season: string }) {
  let mode: "week" | "upcoming" = "week";
  let games: StripGame[] = [];
  let source: "live-espn" | "cached-espn" | "unavailable" | undefined;
  let warnings: string[] = [];
  try {
    const strip = await getHomeWeekStripSummaries({ season, limit: 10 });
    mode = strip.mode;
    games = strip.games.map(slimStripGame);
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
