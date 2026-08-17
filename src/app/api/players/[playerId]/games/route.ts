import {
  getPlayerCareerSeasons,
  getPlayerGameLog,
} from "@/data/queries";
import { parseSeasonParam } from "@/data/providers/historical/season-range";
import { jsonError, jsonOk } from "@/app/api/_lib/http";

/**
 * Per-game box stats for a player.
 * Query: season=YYYY-YY (required unless a single career season exists).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ playerId: string }> }
) {
  try {
    const { playerId } = await context.params;
    const { searchParams } = new URL(request.url);
    let season = parseSeasonParam(searchParams.get("season") ?? undefined);

    if (!season) {
      const career = await getPlayerCareerSeasons(playerId);
      season = career[0]?.season;
    }

    if (!season) {
      throw new Error(
        "season is required (YYYY-YY), e.g. /api/players/1966/games?season=2024-25"
      );
    }

    const data = await getPlayerGameLog(playerId, season);
    return jsonOk({
      playerId,
      season,
      count: data.length,
      data,
    });
  } catch (error) {
    return jsonError(error);
  }
}
