/**
 * RAPTOR impact ratings (FiveThirtyEight open data).
 * Prefers the baked impact overlay; optional `data/impact/raptor.csv` overrides.
 */
import { getRaptorRatings } from "@/data/queries";
import { parseSeasonParam } from "@/data/providers/historical/season-range";
import { jsonError, jsonOk } from "@/app/api/_lib/http";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const season = parseSeasonParam(searchParams.get("season") ?? undefined);
    const data = await getRaptorRatings(season);
    return jsonOk({
      source: "raptor",
      attribution:
        "FiveThirtyEight RAPTOR — https://github.com/fivethirtyeight/data/tree/master/nba-raptor (CC BY 4.0)",
      count: data.length,
      data,
    });
  } catch (error) {
    return jsonError(error);
  }
}
