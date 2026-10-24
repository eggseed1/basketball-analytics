import { NextResponse } from "next/server";

import { jsonError, jsonOk } from "@/app/api/_lib/http";
import { isPreseasonRosterSeason } from "@/data/providers/nba/espn-roster-client";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { getLeagueStandings } from "@/data/queries";
import { slimHomeStandingRow } from "@/lib/home-standings-slim";
import { shiftCanonicalSeason } from "@/lib/player-stat-comps";

export const dynamic = "force-dynamic";

/** Slim conference rows for the home standings / playoff-race cards. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const defaultSeason = canonicalSeasonFromStartYear(currentNbaStartYear());
    const season = searchParams.get("season") ?? defaultSeason;

    const initialSeason = isPreseasonRosterSeason(season)
      ? shiftCanonicalSeason(season, -1)
      : season;
    let data = await getLeagueStandings(initialSeason);
    let east =
      data.conferences.find((c) => c.conference === "East")?.rows ?? [];
    let west =
      data.conferences.find((c) => c.conference === "West")?.rows ?? [];
    let displaySeason = initialSeason;

    if (
      !east.length &&
      !west.length &&
      initialSeason === season &&
      isPreseasonRosterSeason(season)
    ) {
      const priorSeason = shiftCanonicalSeason(season, -1);
      data = await getLeagueStandings(priorSeason);
      east =
        data.conferences.find((c) => c.conference === "East")?.rows ?? [];
      west =
        data.conferences.find((c) => c.conference === "West")?.rows ?? [];
      displaySeason = priorSeason;
    }

    const response = jsonOk({
      season: displaySeason,
      requestSeason: season,
      east: east.map(slimHomeStandingRow),
      west: west.map(slimHomeStandingRow),
    });
    const headers = new Headers(response.headers);
    headers.set(
      "Cache-Control",
      "public, max-age=0, s-maxage=120, stale-while-revalidate=1800"
    );
    return new NextResponse(response.body, {
      status: response.status,
      headers,
    });
  } catch (error) {
    return jsonError(error);
  }
}
