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
import { transformLocalPlayerSeasons } from "@/data/transformers/local";
import { transformNbaPlayByPlay } from "@/data/transformers/play-by-play";
import type { BasketballDataProvider } from "./types";
import {
  SAMPLE_GAMES,
  SAMPLE_PLAYER_GAMES,
  SAMPLE_PLAYERS,
  SAMPLE_PLAY_BY_PLAY,
  SAMPLE_RAW_PLAYER_SEASONS,
  SAMPLE_SHOTS,
  SAMPLE_TEAMS,
} from "./sample/local-sample-data";
import { perGame } from "./nba/compute-advanced";

/**
 * LocalDataProvider — loads the marked sample dataset and runs it through
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

  async getPlayers(_season?: string): Promise<Player[]> {
    return [...this.players];
  }

  async getPlayer(playerId: string, _season?: string): Promise<Player | null> {
    return this.players.find((p) => p.id === playerId) ?? null;
  }

  async getTeams(): Promise<Team[]> {
    return [...this.teams];
  }

  async getTeam(teamId: string): Promise<Team | null> {
    return this.teams.find((t) => t.id === teamId) ?? null;
  }

  async getTeamSeasons(season?: string): Promise<TeamSeason[]> {
    const seasons = new Set(
      this.playerSeasons
        .filter((r) => !season || r.season === season)
        .map((r) => r.season)
    );
    const out: TeamSeason[] = [];
    for (const s of seasons) {
      out.push(...synthesizeTeamSeasons(this.playerSeasons, this.teams, s));
    }
    return out.sort((a, b) => b.winPct - a.winPct);
  }

  async getTeamSeason(
    teamId: string,
    season: string
  ): Promise<TeamSeason | null> {
    const rows = await this.getTeamSeasons(season);
    return rows.find((r) => r.teamId === teamId) ?? null;
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

  async getGamePlayByPlay(gameId: string): Promise<GamePlayByPlay | null> {
    const raw = SAMPLE_PLAY_BY_PLAY[gameId];
    if (!raw) return null;
    const playByPlay = transformNbaPlayByPlay(gameId, raw, "sample");
    return playByPlay.events.length > 0 ? playByPlay : null;
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

/** Rough team season rows from aggregated player seasons (sample data only). */
function synthesizeTeamSeasons(
  players: PlayerSeason[],
  teams: Team[],
  season: string
): TeamSeason[] {
  const byTeam = new Map<string, PlayerSeason[]>();
  for (const row of players) {
    if (row.season !== season) continue;
    const list = byTeam.get(row.teamId) ?? [];
    list.push(row);
    byTeam.set(row.teamId, list);
  }

  const out: TeamSeason[] = [];
  for (const team of teams) {
    const roster = byTeam.get(team.id);
    if (!roster?.length) continue;
    const gp = Math.max(...roster.map((r) => r.gamesPlayed), 1);
    const pts = roster.reduce((s, r) => s + perGame(r.points, r.gamesPlayed), 0);
    const ast = roster.reduce((s, r) => s + perGame(r.assists, r.gamesPlayed), 0);
    const reb = roster.reduce((s, r) => s + perGame(r.rebounds, r.gamesPlayed), 0);
    const ts =
      roster.reduce((s, r) => s + r.trueShootingPct, 0) / roster.length;
    const efg =
      roster.reduce((s, r) => s + r.effectiveFieldGoalPct, 0) / roster.length;
    const ortg =
      roster.reduce((s, r) => s + r.offensiveRating, 0) / roster.length;
    const drtg =
      roster.reduce((s, r) => s + r.defensiveRating, 0) / roster.length;
    const wins = Math.round(gp * 0.55);
    out.push({
      teamId: team.id,
      teamName: team.fullName,
      teamAbbreviation: team.abbreviation,
      season,
      conference: team.conference,
      division: team.division,
      gamesPlayed: gp,
      wins,
      losses: gp - wins,
      winPct: wins / gp,
      pointsPerGame: pts,
      assistsPerGame: ast,
      reboundsPerGame: reb,
      offensiveReboundsPerGame: roster.reduce(
        (s, r) => s + perGame(r.offensiveRebounds, r.gamesPlayed),
        0
      ),
      defensiveReboundsPerGame: roster.reduce(
        (s, r) => s + perGame(r.defensiveRebounds, r.gamesPlayed),
        0
      ),
      stealsPerGame: roster.reduce(
        (s, r) => s + perGame(r.steals, r.gamesPlayed),
        0
      ),
      blocksPerGame: roster.reduce(
        (s, r) => s + perGame(r.blocks, r.gamesPlayed),
        0
      ),
      turnoversPerGame: roster.reduce(
        (s, r) => s + perGame(r.turnovers, r.gamesPlayed),
        0
      ),
      fieldGoalsMadePerGame: roster.reduce(
        (s, r) => s + perGame(r.fieldGoalsMade, r.gamesPlayed),
        0
      ),
      fieldGoalsAttemptedPerGame: roster.reduce(
        (s, r) => s + perGame(r.fieldGoalsAttempted, r.gamesPlayed),
        0
      ),
      threePointersMadePerGame: roster.reduce(
        (s, r) => s + perGame(r.threePointersMade, r.gamesPlayed),
        0
      ),
      threePointersAttemptedPerGame: roster.reduce(
        (s, r) => s + perGame(r.threePointersAttempted, r.gamesPlayed),
        0
      ),
      freeThrowsMadePerGame: roster.reduce(
        (s, r) => s + perGame(r.freeThrowsMade, r.gamesPlayed),
        0
      ),
      freeThrowsAttemptedPerGame: roster.reduce(
        (s, r) => s + perGame(r.freeThrowsAttempted, r.gamesPlayed),
        0
      ),
      fieldGoalPct:
        roster.reduce((s, r) => s + r.fieldGoalPct, 0) / roster.length,
      threePointPct:
        roster.reduce((s, r) => s + r.threePointPct, 0) / roster.length,
      freeThrowPct:
        roster.reduce((s, r) => s + r.freeThrowPct, 0) / roster.length,
      effectiveFieldGoalPct: efg,
      trueShootingPct: ts,
      offensiveRating: ortg,
      defensiveRating: drtg,
      netRating: ortg - drtg,
      pace: 100,
      assistPct: roster.reduce((s, r) => s + r.assistPct, 0) / roster.length,
      turnoverPct:
        roster.reduce((s, r) => s + r.turnoverPct, 0) / roster.length,
      offensiveReboundPct:
        roster.reduce((s, r) => s + r.offensiveReboundPct, 0) / roster.length,
      defensiveReboundPct:
        roster.reduce((s, r) => s + r.defensiveReboundPct, 0) / roster.length,
      reboundPct: roster.reduce((s, r) => s + r.reboundPct, 0) / roster.length,
      pie: roster.reduce((s, r) => s + r.pie, 0) / roster.length,
      plusMinus: ortg - drtg,
    });
  }
  return out;
}
