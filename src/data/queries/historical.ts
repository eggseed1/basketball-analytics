import {
  HistoricalNbaService,
  type HistoricalGamesQuery,
  type HistoricalServiceStatus,
} from "@/data/providers/historical/historical-nba-service";
import type {
  AdvancedPlayerGameStats,
  DarkoRating,
  Game,
  GameBoxScore,
  LebronRating,
  PlayerGame,
  PlayerSeason,
  Team,
} from "@/data/types";

export type { HistoricalGamesQuery, HistoricalServiceStatus };

export function getHistoricalService(signal?: AbortSignal): HistoricalNbaService {
  return new HistoricalNbaService(signal);
}

export function getHistoricalStatus(): HistoricalServiceStatus {
  return getHistoricalService().getStatus();
}

export function getHistoricalSeasons(): string[] {
  return getHistoricalService().listSeasons();
}

export async function getHistoricalGames(
  query: HistoricalGamesQuery = {}
): Promise<Game[]> {
  return getHistoricalService().getGames(query);
}

export async function getHistoricalGame(
  gameId: string
): Promise<Game | null> {
  return getHistoricalService().getGame(gameId);
}

export async function getHistoricalBoxScore(
  gameId: string
): Promise<GameBoxScore | null> {
  return getHistoricalService().getGameBoxScore(gameId);
}

export async function getHistoricalPlayerSeasons(
  season: string
): Promise<PlayerSeason[]> {
  return getHistoricalService().getPlayerSeasons(season);
}

export async function getHistoricalGameStats(params: {
  season?: string;
  gameId?: string;
  playerId?: string;
  startDate?: string;
  endDate?: string;
  maxPages?: number;
}): Promise<PlayerGame[]> {
  return getHistoricalService().getGameStats(params);
}

export async function getHistoricalAdvancedStats(params: {
  season?: string;
  gameId?: string;
  playerId?: string;
  startDate?: string;
  endDate?: string;
  maxPages?: number;
}): Promise<AdvancedPlayerGameStats[]> {
  return getHistoricalService().getAdvancedStats(params);
}

export async function getDarkoRatings(
  season?: string
): Promise<DarkoRating[]> {
  return getHistoricalService().getDarko(season);
}

export async function getLebronRatings(
  season?: string
): Promise<LebronRating[]> {
  return getHistoricalService().getLebron(season);
}

export async function getHistoricalTeams(): Promise<Team[]> {
  return getHistoricalService().getTeams();
}
