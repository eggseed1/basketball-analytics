import { getLebronRatings } from "@/data/queries";
import { parseSeasonParam } from "@/data/providers/historical/season-range";
import { jsonError, jsonOk } from "@/app/api/_lib/http";

/**
 * LEBRON impact ratings.
 * Uses data/impact/lebron.csv when present; otherwise the in-repo seed snapshot.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const season = parseSeasonParam(searchParams.get("season") ?? undefined);
    const data = await getLebronRatings(season);
    return jsonOk({
      source: "lebron",
      attribution:
        "LEBRON methodology by BBall Index - https://www.bball-index.com/lebron-introduction/",
      count: data.length,
      data,
    });
  } catch (error) {
    return jsonError(error);
  }
}
