import { jsonError, jsonOk } from "@/app/api/_lib/http";
import { getWatchlistStatus } from "@/data/queries/watchlist-status";
import { parseWatchIds, WATCHLIST_MAX_ITEMS } from "@/lib/watchlist-status";

/**
 * Last result, next game, injury, scoring trend and DRBL for pinned items.
 * Query: players=espnId,espnId&teams=espnTeamId,espnTeamId (12 items total).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const players = parseWatchIds(searchParams.get("players"));
    const teams = parseWatchIds(searchParams.get("teams")).slice(
      0,
      Math.max(0, WATCHLIST_MAX_ITEMS - players.length)
    );
    return jsonOk(await getWatchlistStatus({ players, teams }));
  } catch (error) {
    return jsonError(error);
  }
}
