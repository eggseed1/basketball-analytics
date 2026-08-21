import { jsonError, jsonOk, optionalInt } from "@/app/api/_lib/http";
import { getUpcomingGameSummaries } from "@/data/queries";
import { upcomingCursorFromGames } from "@/lib/upcoming-cursor";

/**
 * Next page of upcoming tip-offs for the Games list.
 * Query: season?, after, afterId, limit?
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const season = searchParams.get("season") ?? undefined;
    const after = searchParams.get("after") ?? undefined;
    const afterId = searchParams.get("afterId") ?? undefined;
    const limit = Math.min(
      80,
      Math.max(1, optionalInt(searchParams.get("limit"), 40) ?? 40)
    );

    const fromDate =
      after && after.length >= 10 ? after.slice(0, 10) : undefined;

    const data = await getUpcomingGameSummaries({
      season,
      fromDate,
      afterTipOffAt: after,
      afterId,
      monthCount: 8,
      limit,
    });

    return jsonOk({
      season: data.season,
      count: data.games.length,
      hasMore: data.hasMore,
      next: upcomingCursorFromGames(data.games),
      data: data.games,
      source: data.source ?? "live-espn",
      warnings: data.warnings ?? [],
      isStale: data.isStale ?? false,
    });
  } catch (error) {
    return jsonError(error);
  }
}
