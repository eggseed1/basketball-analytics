import { getDarkoRatings } from "@/data/queries";
import { parseSeasonParam } from "@/data/providers/historical/season-range";
import { jsonError, jsonOk } from "@/app/api/_lib/http";

/** Live DARKO DPM leaderboard (public darko.app snapshot). */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const season = parseSeasonParam(searchParams.get("season") ?? undefined);
    const data = await getDarkoRatings(season);
    return jsonOk({
      source: "darko",
      attribution: "DARKO / Kostya Medvedovsky - https://www.darko.app/",
      count: data.length,
      data,
    });
  } catch (error) {
    return jsonError(error);
  }
}
