import { jsonError, jsonOk } from "@/app/api/_lib/http";
import { getLiveScoreboardSummaries } from "@/data/queries";

/**
 * Batched live scoreboard refresh - one day fetch, optional id filter.
 * Query: season?, force=1, ids=id1,id2, dates=YYYY-MM-DD,... (earlier days)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const season = searchParams.get("season") ?? undefined;
    const force = searchParams.get("force") === "1";
    const idsRaw = searchParams.get("ids");
    const gameIds = idsRaw
      ? idsRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    const pastDates = searchParams
      .get("dates")
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const data = await getLiveScoreboardSummaries({
      season,
      force,
      gameIds,
      pastDates,
      signal: request.signal,
    });

    return jsonOk({
      retrievedAt: data.retrievedAt,
      season: data.season,
      count: data.games.length,
      data: data.games,
      source: data.source ?? "live-espn",
      warnings: data.warnings ?? [],
      isStale: data.isStale ?? false,
    });
  } catch (error) {
    return jsonError(error);
  }
}
