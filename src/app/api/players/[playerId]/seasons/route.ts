import { getPlayerCareerSeasonsCached } from "@/data/queries";
import { enrichPlayerCareerAdvancedCached } from "@/data/queries/request-cache";
import { jsonError, jsonOk } from "@/app/api/_lib/http";

/** Season-by-season stats for one player (career). */
export async function GET(
  _request: Request,
  context: { params: Promise<{ playerId: string }> }
) {
  try {
    const { playerId } = await context.params;
    const raw = await getPlayerCareerSeasonsCached(playerId);
    // Overview client fallback builds the career board from this payload —
    // attach DARKO/WAR1 so it does not default to PTS.
    const data =
      raw.length > 0
        ? await enrichPlayerCareerAdvancedCached(playerId, raw).catch(() => raw)
        : raw;
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
