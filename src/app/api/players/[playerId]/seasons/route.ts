import { getPlayerCareerSeasonsCached } from "@/data/queries";
import { jsonError, jsonOk } from "@/app/api/_lib/http";

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
    // Never CDN-cache an empty cold miss — clients retry and need a real payload.
    if (data.length === 0) {
      response.headers.set("Cache-Control", "no-store");
    }
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
