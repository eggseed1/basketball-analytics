import { jsonError, jsonOk } from "@/app/api/_lib/http";
import { summarizePlayerAccolades } from "@/data/providers/nba/player-awards";
import { getBundledPlayerAwardsRaw } from "@/data/runtime/player-awards-snapshot";

/** Real NBA awards baked for this player. Counts and seasons only. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ playerId: string }> }
) {
  try {
    const { playerId } = await context.params;
    const badges = summarizePlayerAccolades(getBundledPlayerAwardsRaw(playerId));
    return jsonOk({
      playerId,
      awards: badges.map((badge) => ({
        label: badge.award.shortLabel,
        count: badge.count,
        seasons: badge.seasons.filter((season) => season !== "inducted"),
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}
