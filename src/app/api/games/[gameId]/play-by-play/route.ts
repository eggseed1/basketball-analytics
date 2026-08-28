import { fetchRawPlayByPlay } from "@/data/providers/nba/play-by-play-client";
import { transformNbaPlayByPlay } from "@/data/transformers/play-by-play";
import { jsonError, jsonOk } from "@/app/api/_lib/http";

export async function GET(
  _request: Request,
  context: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await context.params;
    const payload = await fetchRawPlayByPlay(gameId);
    if (!payload) {
      return jsonOk(
        { error: "Play-by-play not found", gameId, eventCount: 0 },
        { status: 404 }
      );
    }
    const source =
      payload.source === "disk" ? "cdn" : payload.source;
    const normalized = transformNbaPlayByPlay(gameId, payload.raw, source);
    return jsonOk({
      data: normalized,
      gameId,
      source: payload.source,
      eventCount: normalized.events.length,
    });
  } catch (error) {
    return jsonError(error);
  }
}
