import { getHistoricalPlayerSeasons } from "@/data/queries";
import { parseSeasonParam } from "@/data/providers/historical/season-range";
import { defaultCanonicalSeasons } from "@/data/providers/nba/season";
import { jsonError, jsonOk } from "@/app/api/_lib/http";

/**
 * Season player stats with derived advanced rates + DARKO/RAPTOR overlays.
 * ESPN-backed for seasons with published athlete stats (~2000-present reliably).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const season =
      parseSeasonParam(searchParams.get("season") ?? undefined) ??
      defaultCanonicalSeasons(1)[0];

    const data = await getHistoricalPlayerSeasons(season);
    return jsonOk({
      season,
      count: data.length,
      data,
      includes: {
        counting: true,
        advancedDerived: ["trueShootingPct", "effectiveFieldGoalPct", "usagePct"],
        impact: ["darkoDpm", "darkoOff", "darkoDef", "raptor", "oRaptor", "dRaptor"],
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
