import { getPlayerCareerSeasons } from "@/data/queries";
import { jsonError, jsonOk } from "@/app/api/_lib/http";

/** Season-by-season stats for one player (career). */
export async function GET(
  _request: Request,
  context: { params: Promise<{ playerId: string }> }
) {
  try {
    const { playerId } = await context.params;
    const data = await getPlayerCareerSeasons(playerId);
    return jsonOk({
      playerId,
      count: data.length,
      data,
    });
  } catch (error) {
    return jsonError(error);
  }
}
