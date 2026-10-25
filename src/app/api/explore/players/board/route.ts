import { jsonError, jsonOk } from "@/app/api/_lib/http";
import {
  getExplorePlayersBoardView,
  parseExplorePlayersPage,
  parseExplorePlayersSortDir,
} from "@/data/queries/explore-players-board";
import {
  parsePlayerBoardRate,
  parsePlayerBoardViews,
} from "@/lib/explore-players-display";
import { defaultExploreMinimumMinutes } from "@/lib/player-board-season";
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
    const season =
      !params.season || params.season.toUpperCase() === "ALL"
        ? "ALL"
        : params.season;
    const filters = filtersFromSearchParams({
      ...params,
      season,
      minimumMinutes:
        params.minimumMinutes ?? String(defaultExploreMinimumMinutes(season)),
    });
    const sortKey = parsePlayerSeasonSortKey(params.sort);
    const sortDir = sortKey
      ? parseExplorePlayersSortDir(params.dir, sortKey)
      : undefined;
    const page = parseExplorePlayersPage(params.page);
    const boardViews = parsePlayerBoardViews(params.view ?? null);

    const view = await getExplorePlayersBoardView({
      filters,
      sortKey,
      sortDir,
      rate: parsePlayerBoardRate(params.rate ?? null),
      boardViews,
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
