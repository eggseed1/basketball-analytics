import { getPlayerCareerSeasonsCached } from "@/data/queries";
import { jsonError, jsonOk } from "@/app/api/_lib/http";
import { NextResponse } from "next/server";

/** Season-by-season stats for one player (career). */
export async function GET(
  _request: Request,
  context: { params: Promise<{ playerId: string }> }
) {
  try {
    const { playerId } = await context.params;
    const data = await getPlayerCareerSeasonsCached(playerId);
    const response = jsonOk({
      playerId,
      count: data.length,
      data,
    });
    const headers = new Headers(response.headers);
    headers.set(
      "Cache-Control",
      "public, max-age=0, s-maxage=900, stale-while-revalidate=21600"
    );
    return new NextResponse(response.body, {
      status: response.status,
      headers,
    });
  } catch (error) {
    return jsonError(error);
  }
}
