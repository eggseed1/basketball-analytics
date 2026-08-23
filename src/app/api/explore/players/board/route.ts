import { jsonError, jsonOk } from "@/app/api/_lib/http";
import {
  getExplorePlayersBoardView,
  parseExplorePlayersPage,
  parseExplorePlayersSortDir,
} from "@/data/queries/explore-players-board";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { DEFAULT_PLAYER_MINIMUM_MINUTES } from "@/data/types";
import { parsePlayerSeasonSortKey } from "@/lib/player-season-sort";
import { filtersFromSearchParams } from "@/lib/search-params";

export const dynamic = "force-dynamic";

/**
 * Slim page window for the Players board infinite scroll.
 * The season snapshot is already cached from the first SSR load.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());
    const defaultSeason = canonicalSeasonFromStartYear(currentNbaStartYear());
    const filters = filtersFromSearchParams({
      ...params,
      season: params.season?.toUpperCase() === "ALL" ? "ALL" : params.season ?? defaultSeason,
      minimumMinutes:
        params.minimumMinutes ?? String(DEFAULT_PLAYER_MINIMUM_MINUTES),
    });
    const sortKey = parsePlayerSeasonSortKey(params.sort);
    const sortDir = sortKey
      ? parseExplorePlayersSortDir(params.dir, sortKey)
      : undefined;
    const page = parseExplorePlayersPage(params.page);

    const view = await getExplorePlayersBoardView({
      filters,
      sortKey,
      sortDir,
      page,
      includeContext: false,
    });

    return jsonOk({
      rows: view.rows,
      page: view.page,
      pageCount: view.pageCount,
      pageSize: view.pageSize,
      totalCount: view.totalCount,
    });
  } catch (error) {
    return jsonError(error);
  }
}
