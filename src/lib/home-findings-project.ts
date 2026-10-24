import type { RecentInsight, RecentInsightGame } from "@/lib/recent-insights";

/**
 * Compact projection for homepage Flight / HTML.
 * Keeps headlines, descriptions, heroes, box-score lines, and scorelines.
 * Drops chart payloads (flow polylines, moment marks, period bars, trends).
 */
export function projectHomeFindings(
  insights: RecentInsight[]
): RecentInsight[] {
  return insights.map(projectHomeFinding);
}

function projectHomeFinding(insight: RecentInsight): RecentInsight {
  const game = insight.game ? slimGame(insight.game) : undefined;
  return {
    id: insight.id,
    category: insight.category,
    headline: insight.headline,
    description: insight.description,
    context: insight.context,
    gameId: insight.gameId,
    playerId: insight.playerId,
    teamId: insight.teamId,
    gameDate: insight.gameDate,
    focus: insight.focus,
    line: insight.line,
    game,
    hero: insight.hero,
    priority: insight.priority,
    bucket: insight.bucket,
  };
}

function slimGame(game: RecentInsightGame): RecentInsightGame {
  return {
    away: {
      teamId: game.away.teamId,
      abbr: game.away.abbr,
      score: game.away.score,
      periods: game.away.periods,
    },
    home: {
      teamId: game.home.teamId,
      abbr: game.home.abbr,
      score: game.home.score,
      periods: game.home.periods,
    },
  };
}
