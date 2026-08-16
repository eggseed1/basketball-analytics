import type {
  Game,
  GameBoxScore,
  Player,
  PlayerGame,
  PlayerSeason,
  Shot,
  Team,
} from "@/data/types";
import { espnFetchJson } from "./nba/espn-client";
import {
  defaultCanonicalSeasons,
  espnYearFromCanonicalSeason,
} from "./nba/season";
import { isDateInSeason } from "./nba/season-window";
import { ESPN_TEAM_META } from "./nba/team-meta";
import type { BasketballDataProvider } from "./types";
import {
  transformEspnBoxScore,
  transformEspnPlayerGame,
  transformEspnPlayerSeason,
  transformEspnScheduleEvent,
  transformEspnTeam,
  transformEspnTeamTotals,
  type EspnAthleteStatsRow,
  type EspnGameLogEvent,
  type EspnScheduleEvent,
  type EspnStatCategorySchema,
  type EspnSummaryResponse,
  type EspnTeamCard,
  type EspnTeamStatsRow,
  type TeamSeasonTotals,
} from "@/data/transformers/espn";
import {
  aggregatePlayerSeasonFromGames,
  transformEspnAthleteCareerStats,
  transformEspnAthleteProfile,
  type EspnAthleteCareerStatsResponse,
  type EspnAthleteProfileResponse,
} from "@/data/transformers/espn-career";

const SITE_WEB = "https://site.web.api.espn.com";
const SITE_API = "https://site.api.espn.com";

interface ByAthleteResponse {
  pagination?: { pages?: number; page?: number };
  athletes?: EspnAthleteStatsRow[];
  categories?: EspnStatCategorySchema[];
  requestedSeason?: { year?: number; displayName?: string };
}

interface ByTeamResponse {
  teams?: EspnTeamStatsRow[];
  categories?: EspnStatCategorySchema[];
}

interface TeamsResponse {
  sports?: Array<{
    leagues?: Array<{
      teams?: Array<{ team: EspnTeamCard }>;
      season?: { displayName?: string; year?: number };
    }>;
  }>;
}

interface GameLogResponse {
  names?: string[];
  events?: Record<string, EspnGameLogEvent>;
  seasonTypes?: Array<{
    displayName?: string;
    categories?: Array<{
      displayName?: string;
      events?: Array<{ eventId?: string; stats?: string[] }>;
    }>;
  }>;
  filters?: Array<{
    name?: string;
    options?: Array<{ value?: string; displayValue?: string }>;
  }>;
}

interface TeamScheduleResponse {
  events?: EspnScheduleEvent[];
}


/**
 * Live NBA data via ESPN public JSON endpoints.
 *
 * stats.nba.com is intentionally not used here: it is frequently blocked by
 * Akamai TLS fingerprinting from server environments. ESPN exposes the
 * counting stats needed for explore views; advanced rates (TS%, eFG%, USG%)
 * are derived in transformers / compute helpers.
 *
 * Set DATA_PROVIDER=nba to activate.
 */
export class NBADataProvider implements BasketballDataProvider {
  readonly name = "nba";

  private playerSeasonCache = new Map<string, Promise<PlayerSeason[]>>();
  private careerCache = new Map<string, Promise<PlayerSeason[]>>();
  private teamTotalsCache = new Map<
    string,
    Promise<Map<string, TeamSeasonTotals>>
  >();
  private gamesCache = new Map<string, Promise<Game[]>>();
  private boxScoreCache = new Map<string, Promise<GameBoxScore | null>>();
  private teamsPromise: Promise<Team[]> | null = null;

  async getPlayers(): Promise<Player[]> {
    const season = defaultCanonicalSeasons(1)[0];
    const seasons = await this.getPlayerSeasons(season);
    const byId = new Map<string, Player>();
    for (const row of seasons) {
      if (byId.has(row.playerId)) continue;
      byId.set(row.playerId, {
        id: row.playerId,
        fullName: row.playerName,
        firstName: row.playerName.split(" ")[0] ?? row.playerName,
        lastName: row.playerName.split(" ").slice(1).join(" ") || row.playerName,
        position: row.position,
        currentTeamId: row.teamId,
      });
    }
    return [...byId.values()].sort((a, b) =>
      a.fullName.localeCompare(b.fullName)
    );
  }

  async getPlayer(playerId: string): Promise<Player | null> {
    // Prefer ESPN athlete profile so height/weight/DOB/draft populate.
    try {
      const url = `${SITE_WEB}/apis/common/v3/sports/basketball/nba/athletes/${playerId}`;
      const payload = await espnFetchJson<EspnAthleteProfileResponse>(url, {
        ttlMs: 1000 * 60 * 60 * 12,
        retries: 1,
      });
      const profile = transformEspnAthleteProfile(payload, playerId);
      if (profile) return profile;
    } catch {
      // fall through
    }

    const players = await this.getPlayers();
    const hit = players.find((p) => p.id === playerId);
    if (hit) return hit;

    const career = await this.getPlayerCareerSeasons(playerId);
    const row = career[0];
    if (!row) return null;
    return {
      id: row.playerId,
      fullName: row.playerName,
      firstName: row.playerName.split(" ")[0] ?? row.playerName,
      lastName: row.playerName.split(" ").slice(1).join(" ") || row.playerName,
      position: row.position,
      currentTeamId: row.teamId,
    };
  }

  async getTeams(): Promise<Team[]> {
    if (!this.teamsPromise) {
      this.teamsPromise = this.loadTeams().catch((error) => {
        // Do not poison the cache with a rejected promise — allow retry / soft-fail.
        this.teamsPromise = null;
        throw error;
      });
    }
    return this.teamsPromise;
  }

  async getTeam(teamId: string): Promise<Team | null> {
    const teams = await this.getTeams();
    return teams.find((t) => t.id === teamId) ?? null;
  }

  async getPlayerSeasons(season?: string): Promise<PlayerSeason[]> {
    const seasons = season ? [season] : defaultCanonicalSeasons(2);
    const chunks = await Promise.all(
      seasons.map((s) => this.loadPlayerSeasonsForSeason(s))
    );
    return chunks.flat();
  }

  async getPlayerSeason(
    playerId: string,
    season: string
  ): Promise<PlayerSeason | null> {
    const [career, boardRows] = await Promise.all([
      this.getPlayerCareerSeasons(playerId),
      this.loadPlayerSeasonsForSeason(season).catch(() => [] as PlayerSeason[]),
    ]);
    const fromCareer = career.find((row) => row.season === season) ?? null;
    const fromBoard =
      boardRows.find((row) => row.playerId === playerId) ?? null;

    if (fromCareer || fromBoard) {
      return mergeCareerWithBoard(fromCareer, fromBoard);
    }

    const games = await this.getPlayerGameLog(playerId, season);
    const player = await this.getPlayer(playerId);
    return aggregatePlayerSeasonFromGames(
      games,
      player?.fullName ?? playerId
    );
  }

  async getPlayerCareerSeasons(playerId: string): Promise<PlayerSeason[]> {
    const existing = this.careerCache.get(playerId);
    if (existing) return existing;

    const promise = this.fetchPlayerCareerSeasons(playerId);
    this.careerCache.set(playerId, promise);
    return promise;
  }

  async getPlayerGameLog(
    playerId: string,
    season: string
  ): Promise<PlayerGame[]> {
    const year = espnYearFromCanonicalSeason(season);
    const url = `${SITE_WEB}/apis/common/v3/sports/basketball/nba/athletes/${playerId}/gamelog?region=us&lang=en&contentorigin=espn&season=${year}&seasontype=2`;
    const payload = await espnFetchJson<GameLogResponse>(url);
    const names = payload.names ?? [];
    const metaById = payload.events ?? {};

    const preferred =
      payload.seasonTypes?.filter((st) =>
        /regular season/i.test(st.displayName ?? "")
      ) ?? [];
    const seasonBlocks =
      preferred.length > 0 ? preferred : payload.seasonTypes ?? [];

    const rows: PlayerGame[] = [];
    const seasonRow = await this.getPlayerSeasonLite(playerId, season);
    const teamId = seasonRow?.teamId ?? "";

    for (const block of seasonBlocks) {
      for (const category of block.categories ?? []) {
        for (const entry of category.events ?? []) {
          const eventId = entry.eventId;
          if (!eventId) continue;
          const meta = metaById[eventId] ?? { id: eventId };
          const event: EspnGameLogEvent = {
            ...meta,
            id: eventId,
            stats: entry.stats ?? meta.stats,
          };
          const game = transformEspnPlayerGame(
            event,
            names,
            playerId,
            teamId,
            season
          );
          const denom =
            2 * (game.fieldGoalsAttempted + 0.44 * game.freeThrowsAttempted);
          const trueShootingPct = denom > 0 ? game.points / denom : 0;
          const effectiveFieldGoalPct =
            game.fieldGoalsAttempted > 0
              ? (game.fieldGoalsMade + 0.5 * game.threePointersMade) /
                game.fieldGoalsAttempted
              : 0;
          rows.push({ ...game, trueShootingPct, effectiveFieldGoalPct });
        }
      }
    }

    return rows.sort((a, b) => b.gameDate.localeCompare(a.gameDate));
  }

  async getGames(season?: string): Promise<Game[]> {
    const canonical = season ?? defaultCanonicalSeasons(1)[0];
    return this.loadGamesForSeason(canonical);
  }

  async getGame(gameId: string): Promise<Game | null> {
    const seasons = defaultCanonicalSeasons(3);
    for (const season of seasons) {
      const games = await this.loadGamesForSeason(season);
      const hit = games.find((g) => g.id === gameId);
      if (hit) return hit;
    }

    const box = await this.getGameBoxScore(gameId);
    return box?.game ?? null;
  }

  async getGameBoxScore(gameId: string): Promise<GameBoxScore | null> {
    const existing = this.boxScoreCache.get(gameId);
    if (existing) return existing;

    const promise = this.fetchGameBoxScore(gameId);
    this.boxScoreCache.set(gameId, promise);
    return promise;
  }

  async getShots(): Promise<Shot[]> {
    // Shot charts are not available from the ESPN endpoints used here.
    // Keep the contract stable; ingest shot-level data separately later.
    return [];
  }

  private async getPlayerSeasonLite(
    playerId: string,
    season: string
  ): Promise<PlayerSeason | null> {
    const career = await this.getPlayerCareerSeasons(playerId);
    return career.find((row) => row.season === season) ?? null;
  }

  private async fetchPlayerCareerSeasons(
    playerId: string
  ): Promise<PlayerSeason[]> {
    const profileUrl = `${SITE_WEB}/apis/common/v3/sports/basketball/nba/athletes/${playerId}`;
    const statsUrl = `${SITE_WEB}/apis/common/v3/sports/basketball/nba/athletes/${playerId}/stats`;

    const [profile, stats] = await Promise.all([
      espnFetchJson<EspnAthleteProfileResponse>(profileUrl).catch(
        (): EspnAthleteProfileResponse => ({})
      ),
      espnFetchJson<EspnAthleteCareerStatsResponse>(statsUrl),
    ]);

    const playerName =
      profile.athlete?.displayName ??
      `Player ${playerId}`;

    return transformEspnAthleteCareerStats(playerId, playerName, stats);
  }

  private loadGamesForSeason(season: string): Promise<Game[]> {
    const existing = this.gamesCache.get(season);
    if (existing) return existing;
    const promise = this.fetchSeasonGames(season);
    this.gamesCache.set(season, promise);
    return promise;
  }

  private async fetchSeasonGames(season: string): Promise<Game[]> {
    const year = espnYearFromCanonicalSeason(season);
    const teamIds = Object.keys(ESPN_TEAM_META);
    const byId = new Map<string, Game>();

    // Bound concurrency so we do not stampede ESPN.
    const concurrency = 10;
    for (let i = 0; i < teamIds.length; i += concurrency) {
      const chunk = teamIds.slice(i, i + concurrency);
      const schedules = await Promise.all(
        chunk.map(async (teamId) => {
          const url =
            `${SITE_API}/apis/site/v2/sports/basketball/nba/teams/${teamId}` +
            `/schedule?season=${year}&seasontype=2`;
          return espnFetchJson<TeamScheduleResponse>(url);
        })
      );

      for (const schedule of schedules) {
        for (const event of schedule.events ?? []) {
          const game = transformEspnScheduleEvent(event, season);
          if (!game) continue;
          if (!isDateInSeason(game.gameDate, season)) continue;
          if (!byId.has(game.id)) {
            byId.set(game.id, game);
          }
        }
      }
    }

    return [...byId.values()].sort((a, b) =>
      a.gameDate === b.gameDate
        ? a.id.localeCompare(b.id)
        : a.gameDate.localeCompare(b.gameDate)
    );
  }

  private async fetchGameBoxScore(
    gameId: string
  ): Promise<GameBoxScore | null> {
    const url = `${SITE_API}/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`;
    let summary: EspnSummaryResponse & { gameInfo?: { date?: string } };
    try {
      summary = await espnFetchJson(url, { retries: 1 });
    } catch {
      return null;
    }

    const known = await this.findCachedGame(gameId);
    const season =
      known?.season ??
      defaultCanonicalSeasons(1)[0];

    const transformed = transformEspnBoxScore(summary, season);
    if (!transformed) return null;

    const game: Game = {
      ...transformed.game,
      gameDate: known?.gameDate || transformed.game.gameDate || (summary.gameInfo?.date ?? "").slice(0, 10),
      homeTeamAbbr: known?.homeTeamAbbr ?? transformed.game.homeTeamAbbr,
      awayTeamAbbr: known?.awayTeamAbbr ?? transformed.game.awayTeamAbbr,
      homeTeamName: known?.homeTeamName ?? transformed.game.homeTeamName,
      awayTeamName: known?.awayTeamName ?? transformed.game.awayTeamName,
      homeScore: known?.homeScore || transformed.game.homeScore,
      awayScore: known?.awayScore || transformed.game.awayScore,
      status: known?.status ?? transformed.game.status ?? "unknown",
      homePeriodScores:
        transformed.game.homePeriodScores ?? known?.homePeriodScores,
      awayPeriodScores:
        transformed.game.awayPeriodScores ?? known?.awayPeriodScores,
      period: transformed.game.period ?? known?.period,
      displayClock: transformed.game.displayClock ?? known?.displayClock,
      broadcasts: transformed.game.broadcasts?.length
        ? transformed.game.broadcasts
        : known?.broadcasts,
      tipOffAt: known?.tipOffAt ?? transformed.game.tipOffAt,
      retrievedAt: transformed.game.retrievedAt ?? new Date().toISOString(),
    };

    const players = transformed.players.map((p) => ({
      ...p,
      gameDate: game.gameDate,
    }));

    return { game, players };
  }

  private async findCachedGame(gameId: string): Promise<Game | undefined> {
    for (const promise of this.gamesCache.values()) {
      const games = await promise;
      const hit = games.find((g) => g.id === gameId);
      if (hit) return hit;
    }
    return undefined;
  }

  private async loadTeams(): Promise<Team[]> {
    const url = `${SITE_API}/apis/site/v2/sports/basketball/nba/teams`;
    const payload = await espnFetchJson<TeamsResponse>(url, {
      // Explore only needs this for filter metadata — fail fast on outage.
      retries: 1,
      signal: AbortSignal.timeout(5_000),
    });
    const rawTeams =
      payload.sports?.[0]?.leagues?.[0]?.teams?.map((entry) => entry.team) ??
      [];

    return rawTeams.map((raw) => {
      const base = transformEspnTeam(raw);
      const meta = ESPN_TEAM_META[raw.id];
      if (!meta) return base;
      return {
        ...base,
        city: meta.city,
        conference: meta.conference,
        division: meta.division,
      };
    });
  }

  private loadPlayerSeasonsForSeason(season: string): Promise<PlayerSeason[]> {
    const existing = this.playerSeasonCache.get(season);
    if (existing) return existing;

    const promise = this.fetchPlayerSeasons(season).catch((error) => {
      // Do not poison the season cache with a rejected promise.
      this.playerSeasonCache.delete(season);
      throw error;
    });
    this.playerSeasonCache.set(season, promise);
    return promise;
  }

  private async fetchPlayerSeasons(season: string): Promise<PlayerSeason[]> {
    const year = espnYearFromCanonicalSeason(season);
    const teamTotals = await this.loadTeamTotals(season);
    const rows: EspnAthleteStatsRow[] = [];
    let schemaCategories: EspnStatCategorySchema[] = [];

    let page = 1;
    let pages = 1;
    do {
      const url =
        `${SITE_WEB}/apis/common/v3/sports/basketball/nba/statistics/byathlete` +
        `?region=us&lang=en&contentorigin=espn&isqualified=false` +
        `&page=${page}&limit=100&sort=general.minutes:desc` +
        `&season=${year}&seasontype=2`;
      const payload = await espnFetchJson<ByAthleteResponse>(url);
      if (payload.categories?.length) {
        schemaCategories = payload.categories;
      }
      rows.push(...(payload.athletes ?? []));
      pages = payload.pagination?.pages ?? page;
      page += 1;
    } while (page <= pages);

    return rows
      .filter((row) => row.athlete?.id && row.athlete.teamId)
      .map((row) =>
        transformEspnPlayerSeason(row, season, teamTotals, schemaCategories)
      )
      .filter((row) => row.gamesPlayed > 0);
  }

  private loadTeamTotals(
    season: string
  ): Promise<Map<string, TeamSeasonTotals>> {
    const existing = this.teamTotalsCache.get(season);
    if (existing) return existing;

    const promise = this.fetchTeamTotals(season);
    this.teamTotalsCache.set(season, promise);
    return promise;
  }

  private async fetchTeamTotals(
    season: string
  ): Promise<Map<string, TeamSeasonTotals>> {
    const year = espnYearFromCanonicalSeason(season);
    const url =
      `${SITE_WEB}/apis/common/v3/sports/basketball/nba/statistics/byteam` +
      `?region=us&lang=en&contentorigin=espn&season=${year}&seasontype=2`;
    const payload = await espnFetchJson<ByTeamResponse>(url);
    const schema = payload.categories ?? [];
    const map = new Map<string, TeamSeasonTotals>();
    for (const row of payload.teams ?? []) {
      const totals = transformEspnTeamTotals(row, schema);
      map.set(totals.teamId, totals);
    }
    return map;
  }
}

function mergeCareerWithBoard(
  career: PlayerSeason | null,
  board: PlayerSeason | null
): PlayerSeason | null {
  if (!career && !board) return null;
  if (!career) return board;
  if (!board) return career;
  return {
    ...career,
    // League board has team-relative usage; career ESPN table does not.
    usagePct: board.usagePct > 0 ? board.usagePct : career.usagePct,
    minutes: career.minutes > 0 ? career.minutes : board.minutes,
    gamesPlayed:
      career.gamesPlayed > 0 ? career.gamesPlayed : board.gamesPlayed,
    trueShootingPct:
      career.trueShootingPct > 0
        ? career.trueShootingPct
        : board.trueShootingPct,
    effectiveFieldGoalPct:
      career.effectiveFieldGoalPct > 0
        ? career.effectiveFieldGoalPct
        : board.effectiveFieldGoalPct,
    position: career.position ?? board.position,
    teamId: career.teamId || board.teamId,
    teamName:
      career.teamName && career.teamName !== "Unknown"
        ? career.teamName
        : board.teamName,
  };
}

export { canonicalSeasonFromEspnYear, defaultCanonicalSeasons } from "./nba/season";
