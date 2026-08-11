import { getDataProvider } from "@/data/providers";
import type {
  BasketballFilters,
  Game,
  GameBoxScore,
  GameSummary,
} from "@/data/types";
import { applyGameFilters } from "./filter-utils";

export async function getGames(season?: string): Promise<Game[]> {
  return getDataProvider().getGames(season);
}

export async function getGame(gameId: string): Promise<Game | null> {
  return getDataProvider().getGame(gameId);
}

export async function getGameBoxScore(
  gameId: string
): Promise<GameBoxScore | null> {
  return getDataProvider().getGameBoxScore(gameId);
}

/**
 * Filtered game summaries for explore views — one query feeds chart + table.
 */
export async function getFilteredGames(
  filters: BasketballFilters = {}
): Promise<GameSummary[]> {
  const games = await getDataProvider().getGames(filters.season);
  return applyGameFilters(games, filters);
}
