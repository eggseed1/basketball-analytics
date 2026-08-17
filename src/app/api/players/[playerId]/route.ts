import {
  getPlayer,
  getPlayerCareerSeasons,
} from "@/data/queries";
import { jsonError, jsonOk } from "@/app/api/_lib/http";

/** Player profile + every season of counting / advanced stats. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ playerId: string }> }
) {
  try {
    const { playerId } = await context.params;
    const [player, seasons] = await Promise.all([
      getPlayer(playerId),
      getPlayerCareerSeasons(playerId),
    ]);

    if (!player && seasons.length === 0) {
      return jsonOk({ error: "Player not found", playerId }, { status: 404 });
    }

    return jsonOk({
      data: {
        player: player ?? {
          id: playerId,
          fullName: seasons[0]?.playerName ?? playerId,
          firstName: "",
          lastName: "",
        },
        seasons,
      },
      count: seasons.length,
    });
  } catch (error) {
    return jsonError(error);
  }
}
