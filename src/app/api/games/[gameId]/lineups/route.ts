import { jsonError, jsonOk } from "@/app/api/_lib/http";
import { fetchEspnGameLineups } from "@/data/providers/nba/espn-lineups";

export async function GET(
  _request: Request,
  context: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await context.params;
    const lineups = await fetchEspnGameLineups(gameId);
    return jsonOk({ data: lineups });
  } catch (error) {
    return jsonError(error);
  }
}
