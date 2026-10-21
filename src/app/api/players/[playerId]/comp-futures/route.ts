import { jsonError, jsonOk } from "@/app/api/_lib/http";
import { getPlayerCareerSeasonsCached } from "@/data/queries/request-cache";
import {
  COMP_METRICS,
  loadCompFutures,
  loadCompFuturesBundle,
  type CompMetricId,
} from "@/lib/player-comp-futures";
import { resolvePlayerSeason } from "@/lib/player-destination";

export const dynamic = "force-dynamic";

/**
 * Comps/futures for Trajectory.
 * - `metric=` → one metric (chip switch after primary paint)
 * - no metric / `primary=1` → first available metric only (one round trip)
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ playerId: string }> }
) {
  try {
    const { playerId } = await context.params;
    const url = new URL(request.url);
    const seasonParam = url.searchParams.get("season");
    const metricParam = url.searchParams.get("metric");
    const espnId = url.searchParams.get("espnId");
    const primaryOnly =
      !metricParam ||
      url.searchParams.get("primary") === "1" ||
      url.searchParams.get("primary") === "true";
    const career = await getPlayerCareerSeasonsCached(playerId);
    if (career.length === 0) {
      return jsonError(new Error("Player not found"), 404);
    }
    const season = resolvePlayerSeason(career, seasonParam);
    const focal =
      career.find((row) => row.season === season) ??
      career[career.length - 1] ??
      null;

    if (primaryOnly) {
      const bundle = loadCompFuturesBundle(focal, career, espnId, {
        primaryOnly: true,
      });
      if (!bundle) {
        return jsonError(new Error("Metric unavailable"), 404);
      }
      return jsonOk({ playerId, season, bundle, item: bundle.items[0] ?? null });
    }

    const metricId = COMP_METRICS.find((m) => m.id === metricParam)?.id as
      | CompMetricId
      | undefined;
    if (!metricId) {
      return jsonError(new Error("Unknown metric"), 400);
    }
    const item = loadCompFutures(focal, career, espnId, metricId);
    if (!item) {
      return jsonError(new Error("Metric unavailable"), 404);
    }
    return jsonOk({ playerId, season, item });
  } catch (error) {
    return jsonError(error);
  }
}
