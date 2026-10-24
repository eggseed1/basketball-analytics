import { NextResponse } from "next/server";

import { jsonError, jsonOk } from "@/app/api/_lib/http";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { getTeamSeasonStats } from "@/data/queries/team-seasons";

export const dynamic = "force-dynamic";

/** Team efficiency board for Standings — client-fetched to keep HTML slim. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const defaultSeason = canonicalSeasonFromStartYear(currentNbaStartYear());
    const season = searchParams.get("season") ?? defaultSeason;
    const teams = await getTeamSeasonStats(season).catch(() => []);
    const response = jsonOk({ season, count: teams.length, data: teams });
    const headers = new Headers(response.headers);
    headers.set(
      "Cache-Control",
      "public, max-age=0, s-maxage=300, stale-while-revalidate=3600"
    );
    return new NextResponse(response.body, {
      status: response.status,
      headers,
    });
  } catch (error) {
    return jsonError(error);
  }
}
