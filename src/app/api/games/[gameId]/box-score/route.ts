import { getGameBoxScore } from "@/data/queries";
import { jsonError, jsonOk } from "@/app/api/_lib/http";

export async function GET(
  _request: Request,
  context: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await context.params;
    const box = await getGameBoxScore(gameId);
    if (!box) {
      return jsonOk(
        { error: "Box score not found", gameId },
        { status: 404 }
      );
    }
    return jsonOk({
      data: box,
      count: box.players.length,
    });
  } catch (error) {
    return jsonError(error);
  }
}
