import type {
  Game,
  GameBoxScore,
  Player,
  PlayerGame,
  PlayerSeason,
  Shot,
  ShotFilters,
  Team,
} from "@/data/types";

/**
 * Provider contract. Adapters fetch / load external data and return
 * canonical types only. Queries never talk to APIs directly.
 */
export interface BasketballDataProvider {
  readonly name: string;

  getPlayers(): Promise<Player[]>;
  getPlayer(playerId: string): Promise<Player | null>;
  getTeams(): Promise<Team[]>;
  getTeam(teamId: string): Promise<Team | null>;
  getPlayerSeasons(season?: string): Promise<PlayerSeason[]>;
  getPlayerSeason(
    playerId: string,
    season: string
  ): Promise<PlayerSeason | null>;
  /** Every season row for one player (career). */
  getPlayerCareerSeasons(playerId: string): Promise<PlayerSeason[]>;
  getPlayerGameLog(
    playerId: string,
    season: string
  ): Promise<PlayerGame[]>;
  getGames(season?: string): Promise<Game[]>;
  getGame(gameId: string): Promise<Game | null>;
  getGameBoxScore(gameId: string): Promise<GameBoxScore | null>;
  getShots(filters?: ShotFilters): Promise<Shot[]>;
}
