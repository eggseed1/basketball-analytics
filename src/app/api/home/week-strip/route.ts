import { NextResponse } from "next/server";

import { jsonError, jsonOk } from "@/app/api/_lib/http";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
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

export const dynamic = "force-dynamic";

/** Homepage week/upcoming game strip — client-fetched to keep glass cards out of first HTML. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const defaultSeason = canonicalSeasonFromStartYear(currentNbaStartYear());
    const season = searchParams.get("season") ?? defaultSeason;
    const strip = await getHomeWeekStripSummaries({ season, limit: 10 });
    const response = jsonOk({
      season,
      mode: strip.mode,
      games: strip.games.map(slimStripGame),
      source: strip.source,
      warnings: strip.warnings ?? [],
    });
    const headers = new Headers(response.headers);
    headers.set(
      "Cache-Control",
      "public, max-age=0, s-maxage=30, stale-while-revalidate=120"
    );
    return new NextResponse(response.body, {
      status: response.status,
      headers,
    });
  } catch (error) {
    return jsonError(error);
  }
}
