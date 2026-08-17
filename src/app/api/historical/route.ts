import { getHistoricalStatus } from "@/data/queries";
import { jsonOk } from "@/app/api/_lib/http";

/** Capability map for historical + impact feeds. */
export async function GET() {
  return jsonOk({
    service: "historical-nba",
    ...getHistoricalStatus(),
    endpoints: [
      "GET /api/historical",
      "GET /api/seasons",
      "GET /api/games?season=1969-70",
      "GET /api/games/[gameId]",
      "GET /api/games/[gameId]/box-score",
      "GET /api/stats/players?season=2024-25",
      "GET /api/stats/games?season=2024-25",
      "GET /api/stats/advanced?season=2024-25",
      "GET /api/impact/darko",
      "GET /api/impact/lebron?season=2024-25",
      "GET /api/teams",
      "GET /api/players/[playerId]",
      "GET /api/players/[playerId]/seasons",
      "GET /api/players/[playerId]/games?season=2024-25",
    ],
  });
}
