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
import { transformLocalPlayerSeasons } from "@/data/transformers/local";
import type { BasketballDataProvider } from "./types";
import {
  SAMPLE_GAMES,
  SAMPLE_PLAYER_GAMES,
  SAMPLE_PLAYERS,
  SAMPLE_RAW_PLAYER_SEASONS,
  SAMPLE_SHOTS,
  SAMPLE_TEAMS,
} from "./sample/local-sample-data";

/**
 * LocalDataProvider - loads the marked sample dataset and runs it through
 * transformers so the rest of the app never sees raw column names.
 *
 * Swap this for NBADataProvider / Supabase by changing DATA_PROVIDER env.
 */
export class LocalDataProvider implements BasketballDataProvider {
  readonly name = "local";

  private readonly players = SAMPLE_PLAYERS;
  private readonly teams = SAMPLE_TEAMS;
  private readonly games = SAMPLE_GAMES;
  private readonly playerGames = SAMPLE_PLAYER_GAMES;
  private readonly shots = SAMPLE_SHOTS;
  private readonly playerSeasons: PlayerSeason[];

  constructor() {
    this.playerSeasons = transformLocalPlayerSeasons(
      SAMPLE_RAW_PLAYER_SEASONS
    );
  }

  async getPlayers(): Promise<Player[]> {
    return [...this.players];
  }

  async getPlayer(playerId: string): Promise<Player | null> {
    return this.players.find((p) => p.id === playerId) ?? null;
  }

  async getTeams(): Promise<Team[]> {
    return [...this.teams];
  }

  async getTeam(teamId: string): Promise<Team | null> {
    return this.teams.find((t) => t.id === teamId) ?? null;
  }

  async getPlayerSeasons(season?: string): Promise<PlayerSeason[]> {
    if (!season) return [...this.playerSeasons];
    return this.playerSeasons.filter((s) => s.season === season);
  }

  async getPlayerSeason(
    playerId: string,
    season: string
  ): Promise<PlayerSeason | null> {
    return (
      this.playerSeasons.find(
        (s) => s.playerId === playerId && s.season === season
      ) ?? null
    );
  }

  async getPlayerCareerSeasons(playerId: string): Promise<PlayerSeason[]> {
    return this.playerSeasons
      .filter((s) => s.playerId === playerId)
      .sort((a, b) => b.season.localeCompare(a.season));
  }

  async getPlayerGameLog(
    playerId: string,
    season: string
  ): Promise<PlayerGame[]> {
    return this.playerGames.filter(
      (g) => g.playerId === playerId && g.season === season
    );
  }

  async getGames(season?: string): Promise<Game[]> {
    if (!season) return [...this.games];
    return this.games.filter((g) => g.season === season);
  }

  async getGame(gameId: string): Promise<Game | null> {
    return this.games.find((g) => g.id === gameId) ?? null;
  }

  async getGameBoxScore(gameId: string): Promise<GameBoxScore | null> {
    const game = await this.getGame(gameId);
    if (!game) return null;
    return {
      game,
      players: this.playerGames.filter((p) => p.gameId === gameId),
    };
  }

  async getShots(filters: ShotFilters = {}): Promise<Shot[]> {
    return this.shots.filter((shot) => {
      if (filters.season && shot.season !== filters.season) return false;
      if (filters.team && shot.teamId !== filters.team) return false;
      if (filters.player && shot.playerId !== filters.player) return false;
      if (filters.gameId && shot.gameId !== filters.gameId) return false;
      if (filters.made !== undefined && shot.made !== filters.made)
        return false;
      if (filters.shotType && shot.shotType !== filters.shotType)
        return false;
      if (filters.dateRange) {
        if (
          shot.gameDate < filters.dateRange.start ||
          shot.gameDate > filters.dateRange.end
        ) {
          return false;
        }
      }
      return true;
    });
  }
}
