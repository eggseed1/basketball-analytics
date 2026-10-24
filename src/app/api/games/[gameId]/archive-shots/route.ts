import { loadRawArchiveShotEventsAsync } from "@/data/history/raw-archive-shots";
import { jsonError, jsonOk } from "@/app/api/_lib/http";

/** Archive PBP-derived floor shots for historical Game Lab (client-loaded). */
export async function GET(
  _request: Request,
  context: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await context.params;
    const shots = await loadRawArchiveShotEventsAsync(gameId);
    return jsonOk({
      data: { shots },
      gameId,
      shotCount: shots.length,
    });
  } catch (error) {
    return jsonError(error);
  }
}
