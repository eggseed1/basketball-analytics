import { getHistoricalGames } from "@/data/queries";
import { parseSeasonParam } from "@/data/providers/historical/season-range";
import { jsonError, jsonOk, optionalInt } from "@/app/api/_lib/http";

/**
 * Historical games (1960-present via BallDontLie when keyed).
 *
 * Query: season | startSeason | endSeason | startDate | endDate | teamId | maxPages
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const season = parseSeasonParam(searchParams.get("season") ?? undefined);
    const startSeason = parseSeasonParam(
      searchParams.get("startSeason") ?? undefined
    );
    const endSeason = parseSeasonParam(
      searchParams.get("endSeason") ?? undefined
    );
    const startDate = searchParams.get("startDate") ?? undefined;
    const endDate = searchParams.get("endDate") ?? undefined;
    const teamId = searchParams.get("teamId") ?? undefined;
    const maxPages = optionalInt(searchParams.get("maxPages"), 20);

    if (!season && !startSeason && !endSeason && !startDate && !endDate) {
      throw new Error(
        "Provide season, startSeason/endSeason, or startDate/endDate."
      );
    }

    const data = await getHistoricalGames({
      season,
      startSeason,
      endSeason,
      startDate,
      endDate,
      teamId,
      maxPages,
    });

    return jsonOk({ count: data.length, data });
  } catch (error) {
    return jsonError(error);
  }
}
