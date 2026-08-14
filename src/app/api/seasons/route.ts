import { getHistoricalSeasons } from "@/data/queries";
import { jsonOk } from "@/app/api/_lib/http";

export async function GET() {
  const seasons = getHistoricalSeasons();
  return jsonOk({
    from: seasons[0],
    to: seasons[seasons.length - 1],
    count: seasons.length,
    seasons,
  });
}
