import { getHistoricalGameStats } from "@/data/queries";
import { parseSeasonParam } from "@/data/providers/historical/season-range";
import { jsonError, jsonOk, optionalInt } from "@/app/api/_lib/http";

/** Per-game player box lines (BallDontLie /stats - ALL-STAR+). */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const season = parseSeasonParam(searchParams.get("season") ?? undefined);
    const gameId = searchParams.get("gameId") ?? undefined;
    const playerId = searchParams.get("playerId") ?? undefined;
    const startDate = searchParams.get("startDate") ?? undefined;
    const endDate = searchParams.get("endDate") ?? undefined;
    const maxPages = optionalInt(searchParams.get("maxPages"), 10);

    if (!season && !gameId && !playerId && !startDate) {
      throw new Error("Provide season, gameId, playerId, or startDate.");
    }

    const data = await getHistoricalGameStats({
      season,
      gameId,
      playerId,
      startDate,
      endDate,
      maxPages,
    });

    return jsonOk({ count: data.length, data });
  } catch (error) {
    return jsonError(error);
  }
}
