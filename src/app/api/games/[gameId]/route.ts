import { getHistoricalGame } from "@/data/queries";
import { jsonError, jsonOk } from "@/app/api/_lib/http";

export async function GET(
  _request: Request,
  context: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await context.params;
    const game = await getHistoricalGame(gameId);
    if (!game) {
      return jsonOk({ error: "Game not found", gameId }, { status: 404 });
    }
    return jsonOk({ data: game });
  } catch (error) {
    return jsonError(error);
  }
}
