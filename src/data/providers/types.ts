import type {
  Game,
  GameBoxScore,
  GamePlayByPlay,
  Player,
  PlayerGame,
  PlayerSeason,
  Shot,
  ShotFilters,
  Team,
  TeamSeason,
} from "@/data/types";

/**
 * Provider contract. Adapters fetch / load external data and return
 * canonical types only. Queries never talk to APIs directly.
 */
export interface BasketballDataProvider {
  readonly name: string;

  /**
   * Player directory for a season (defaults to current). Historical seasons
   * should return that year's roster so search/explore can include retired players.
   */
  getPlayers(season?: string): Promise<Player[]>;
  /**
   * Resolve a player identity. Optional `season` prefers that year's league row
   * (important for retired / historical players).
   */
  getPlayer(playerId: string, season?: string): Promise<Player | null>;
  getTeams(): Promise<Team[]>;
  getTeam(teamId: string): Promise<Team | null>;
  getPlayerSeasons(season?: string): Promise<PlayerSeason[]>;
  getPlayerSeason(
    playerId: string,
    season: string
  ): Promise<PlayerSeason | null>;
  /** Optional full-career season rows (providers may synthesize from season loads). */
  getPlayerCareerSeasons?(playerId: string): Promise<PlayerSeason[]>;
  /** Optional postseason career rows (stats.nba SeasonTotalsPostSeason). */
  getPlayerPlayoffCareerSeasons?(playerId: string): Promise<PlayerSeason[]>;
  getTeamSeasons?(season?: string): Promise<TeamSeason[]>;
  getTeamSeason?(teamId: string, season: string): Promise<TeamSeason | null>;
  getPlayerGameLog(
    playerId: string,
    season: string
  ): Promise<PlayerGame[]>;
  getGames(season?: string): Promise<Game[]>;
  getGame(gameId: string): Promise<Game | null>;
  getGameBoxScore(gameId: string): Promise<GameBoxScore | null>;
  /** Optional — providers without PBP can omit or return null. */
  getGamePlayByPlay?(gameId: string): Promise<GamePlayByPlay | null>;
  getShots(filters?: ShotFilters): Promise<Shot[]>;
}
