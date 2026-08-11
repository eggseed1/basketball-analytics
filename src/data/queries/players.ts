import { getDataProvider } from "@/data/providers";
import type {
  BasketballFilters,
  Player,
  PlayerGame,
  PlayerSeason,
} from "@/data/types";
import { applyPlayerSeasonFilters } from "./filter-utils";

export async function getPlayers(): Promise<Player[]> {
  return getDataProvider().getPlayers();
}

export async function getPlayer(playerId: string): Promise<Player | null> {
  return getDataProvider().getPlayer(playerId);
}

export async function getPlayerSeason(
  playerId: string,
  season: string
): Promise<PlayerSeason | null> {
  return getDataProvider().getPlayerSeason(playerId, season);
}

export async function getPlayerGameLog(
  playerId: string,
  season: string
): Promise<PlayerGame[]> {
  return getDataProvider().getPlayerGameLog(playerId, season);
}

/**
 * Returns player-season rows for a season, with optional filters applied
 * once in the query layer.
 */
export async function getPlayersBySeason(
  season: string,
  filters: Omit<BasketballFilters, "season"> = {}
): Promise<PlayerSeason[]> {
  const seasons = await getDataProvider().getPlayerSeasons(season);
  return applyPlayerSeasonFilters(seasons, { ...filters, season });
}

export async function getTeamPlayers(
  teamId: string,
  season: string,
  filters: Omit<BasketballFilters, "team" | "season"> = {}
): Promise<PlayerSeason[]> {
  const seasons = await getDataProvider().getPlayerSeasons(season);
  return applyPlayerSeasonFilters(seasons, {
    ...filters,
    season,
    team: teamId,
  });
}

/**
 * General-purpose filtered player-season query used by explore views.
 */
export async function getFilteredPlayerSeasons(
  filters: BasketballFilters = {}
): Promise<PlayerSeason[]> {
  const seasons = await getDataProvider().getPlayerSeasons(filters.season);
  return applyPlayerSeasonFilters(seasons, filters);
}

export async function getAvailableSeasons(): Promise<string[]> {
  const seasons = await getDataProvider().getPlayerSeasons();
  return [...new Set(seasons.map((s) => s.season))].sort().reverse();
}
