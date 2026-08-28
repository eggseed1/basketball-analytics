import type {
  AdvancedPlayerGameStats,
  DarkoRating,
  Game,
  GameBoxScore,
  RaptorRating,
  PlayerGame,
  PlayerSeason,
  Team,
} from "@/data/types";
import {
  BallDontLieError,
  createBallDontLieClient,
  type BallDontLieClient,
} from "@/data/providers/balldontlie/client";
import { fetchDarkoRatings } from "@/data/providers/impact/darko-client";
import { loadRaptorRatings } from "@/data/providers/impact/raptor-store";
import {
  HISTORICAL_START_YEAR,
  listCanonicalSeasons,
  startYearFromCanonicalSeason,
} from "@/data/providers/historical/season-range";
import { NBADataProvider } from "@/data/providers/nba-data-provider";
import {
  transformBdlAdvanced,
  transformBdlBoxScore,
  transformBdlGame,
  transformBdlStatsRow,
  transformBdlTeam,
} from "@/data/transformers/balldontlie";
import { finalizeBoxScorePlayers } from "@/data/providers/nba/enrich-box-score";
import {
  findCachedGame,
  readGamesCache,
  writeGamesCache,
  isAdequateSeasonGamesCache,
} from "@/data/providers/historical/games-cache";

export interface HistoricalGamesQuery {
  season?: string;
  startSeason?: string;
  endSeason?: string;
  startDate?: string;
  endDate?: string;
  teamId?: string;
  /** Cap pages pulled from BallDontLie (100 games/page). */
  maxPages?: number;
  /**
   * Modern seasons (≥2000): prefer ESPN (seconds) over BallDontLie
   * pagination (can take minutes without a disk cache).
   * Deep history still uses BallDontLie / disk cache.
   */
  preferSource?: "auto" | "espn" | "balldontlie";
}

export interface HistoricalServiceStatus {
  ballDontLieConfigured: boolean;
  historicalGames: "balldontlie" | "unavailable";
  boxScores: "balldontlie" | "espn-fallback" | "unavailable";
  playerSeasons: "espn" | "unavailable";
  advancedStats: "balldontlie" | "derived" | "unavailable";
  darko: "live" | "unavailable";
  raptor: "csv-or-seed";
  seasonRange: { from: string; to: string };
  notes: string[];
}

/**
 * Facade for historical NBA stats APIs: BallDontLie (1946+) + ESPN season
 * stats + DARKO / RAPTOR impact overlays.
 */
export class HistoricalNbaService {
  private readonly espn = new NBADataProvider();
  private readonly bdl: BallDontLieClient | null;
  private teamsCache: Promise<Team[]> | null = null;

  constructor(signal?: AbortSignal) {
    this.bdl = createBallDontLieClient(signal);
  }

  getStatus(): HistoricalServiceStatus {
    const seasons = listCanonicalSeasons();
    const notes: string[] = [];
    if (!this.bdl) {
      notes.push(
        "Set BALLDONTLIE_API_KEY for games 1960-present (free tier covers games/players/teams)."
      );
      notes.push(
        "Box scores + advanced game stats require BallDontLie ALL-STAR/GOAT; without them ESPN covers recent box scores only."
      );
    } else {
      notes.push(
        "BallDontLie free tier: historical games. Upgrade for /stats, /box_scores, and /stats/advanced."
      );
    }
    notes.push(
      "DARKO is scraped from the public darko.app leaderboard. RAPTOR prefers the baked FiveThirtyEight overlay (see impact:sync); optional data/impact/raptor.csv overrides."
    );

    return {
      ballDontLieConfigured: Boolean(this.bdl),
      historicalGames: this.bdl ? "balldontlie" : "unavailable",
      boxScores: this.bdl ? "balldontlie" : "espn-fallback",
      playerSeasons: "espn",
      advancedStats: this.bdl ? "balldontlie" : "derived",
      darko: "live",
      raptor: "csv-or-seed",
      seasonRange: {
        from: seasons[0],
        to: seasons[seasons.length - 1],
      },
      notes,
    };
  }

  listSeasons(): string[] {
    return listCanonicalSeasons(HISTORICAL_START_YEAR);
  }

  async getTeams(): Promise<Team[]> {
    if (!this.teamsCache) {
      this.teamsCache = this.loadTeams();
    }
    return this.teamsCache;
  }

  async getGames(query: HistoricalGamesQuery = {}): Promise<Game[]> {
    const prefer = query.preferSource ?? "auto";
    const hasDateWindow = Boolean(query.startDate || query.endDate);

    // Season disk archive first — including team-scoped queries.
    // Filtering in memory avoids BDL crawls and ESPN↔BDL numeric id collisions
    // (e.g. ESPN 25 OKC ≠ BDL 25 POR).
    if (query.season && !query.startSeason && !query.endSeason) {
      const cached = await readGamesCache(query.season);
      if (
        cached &&
        isAdequateSeasonGamesCache(query.season, cached.games.length)
      ) {
        let games = cached.games;
        if (hasDateWindow) {
          const start = query.startDate ?? "1900-01-01";
          const end = query.endDate ?? "2100-12-31";
          games = games.filter(
            (g) => g.gameDate >= start && g.gameDate <= end
          );
        }
        if (query.teamId) {
          // Disk rows use canonical (ESPN) team ids. Bare numerics follow DRBL
          // convention (ESPN) — do not also match BDL provider ids (25≠POR).
          const needle = String(query.teamId);
          games = games.filter(
            (g) => g.homeTeamId === needle || g.awayTeamId === needle
          );
        }
        return games;
      }

      // Modern seasons: ESPN schedule is ~1s. Never block the UI on BDL
      // multi-page crawls when we don't already have a full disk cache.
      if (
        !hasDateWindow &&
        !query.teamId &&
        startYearFromCanonicalSeason(query.season) >= 2000 &&
        prefer !== "balldontlie"
      ) {
        try {
          const espnGames = await this.espn.getGames(query.season);
          if (espnGames.length > 0) return espnGames;
        } catch {
          // fall through to BallDontLie when configured
        }
      }
    }

    if (!this.bdl) {
      if (query.season) {
        const start = startYearFromCanonicalSeason(query.season);
        // ESPN schedule coverage is modern-era only; require BallDontLie earlier.
        if (start >= 2000) {
          return this.espn.getGames(query.season);
        }
      }
      throw new BallDontLieError(
        "BALLDONTLIE_API_KEY is required for multi-season / pre-2000 historical games.",
        401,
        "/nba/v1/games"
      );
    }

    const seasons = resolveSeasonYears(query);
    const isDeepHistory =
      seasons.length > 0 && seasons.every((y) => y < 2000);
    const rows = await this.bdl.paginateAll(
      (cursor) =>
        this.bdl!.getGames({
          seasons: seasons.length ? seasons : undefined,
          startDate: query.startDate,
          endDate: query.endDate,
          teamIds: query.teamId ? [Number(query.teamId)] : undefined,
          seasonType: "regular",
          cursor,
        }),
      {
        maxPages:
          query.maxPages ??
          (hasDateWindow ? 3 : isDeepHistory ? 60 : 40),
        delayMs: hasDateWindow ? 200 : isDeepHistory ? 900 : 250,
      }
    );

    const games = rows
      .map(transformBdlGame)
      .sort((a, b) =>
        a.gameDate === b.gameDate
          ? a.id.localeCompare(b.id)
          : a.gameDate.localeCompare(b.gameDate)
      );

    // Persist single-season pulls only when the slate looks complete.
    if (
      query.season &&
      !query.startDate &&
      !query.endDate &&
      !query.teamId &&
      games.length >= 1000
    ) {
      await writeGamesCache(query.season, games).catch(() => undefined);
    }

    return games;
  }

  async getGame(gameId: string): Promise<Game | null> {
    // NBA Stats GameIDs must not enter the BallDontLie numeric path.
    if (/^00\d{8}$/.test(gameId)) {
      return this.espn.getGame(gameId);
    }
    if (this.bdl && /^\d+$/.test(gameId) && !/^40\d{7,}$/.test(gameId)) {
      try {
        const game = await this.bdl.getGame(Number(gameId));
        return transformBdlGame(game);
      } catch (error) {
        if (!(error instanceof BallDontLieError && error.status === 404)) {
          const cached = await findCachedGame(gameId);
          if (cached) return cached;
          throw error;
        }
      }
    }
    // Disk cache covers historical BDL ids when the live client is unavailable.
    if (/^\d+$/.test(gameId) && !/^40\d{7,}$/.test(gameId) && !/^00\d{8}$/.test(gameId)) {
      const cached = await findCachedGame(gameId);
      if (cached) return cached;
    }
    // ESPN event ids only — do not fan out schedule lookups for foreign ids.
    if (/^40\d{7,}$/.test(gameId)) {
      return this.espn.getGame(gameId);
    }
    return null;
  }

  async getGameBoxScore(gameId: string): Promise<GameBoxScore | null> {
    // ESPN event ids must not enter the BallDontLie path (different id space).
    if (/^40\d{7,}$/.test(gameId)) {
      return this.espn.getGameBoxScore(gameId);
    }

    // NBA Stats GameID — use ESPN-named NBADataProvider (stats.nba.com).
    if (/^00\d{8}$/.test(gameId)) {
      return this.espn.getGameBoxScore(gameId);
    }

    if (this.bdl && /^\d+$/.test(gameId)) {
      try {
        const game = await this.bdl.getGame(Number(gameId));
        const date = (game.date ?? "").slice(0, 10);
        if (date) {
          try {
            const boxes = await this.bdl.getBoxScores(date);
            const match = boxes.find(
              (box) =>
                box.home_team.team.id === game.home_team.id &&
                box.visitor_team.team.id === game.visitor_team.id
            );
            if (match) {
              const transformed = transformBdlBoxScore(match);
              return {
                game: { ...transformed.game, id: String(game.id) },
                players: finalizeBoxScorePlayers(
                  transformed.players.map((p) => ({
                    ...p,
                    gameId: String(game.id),
                  }))
                ),
              };
            }
          } catch (error) {
            if (!(error instanceof BallDontLieError && error.status === 401)) {
              throw error;
            }
          }
        }

        // ALL-STAR fallback: assemble box from /stats?game_ids[]=
        try {
          const stats = await this.bdl.paginateAll(
            (cursor) =>
              this.bdl!.getStats({ gameIds: [Number(gameId)], cursor }),
            { maxPages: 5, delayMs: 200 }
          );
          if (stats.length) {
            return {
              game: transformBdlGame(game),
              players: finalizeBoxScorePlayers(stats.map(transformBdlStatsRow)),
            };
          }
        } catch (error) {
          if (!(error instanceof BallDontLieError && error.status === 401)) {
            throw error;
          }
        }
      } catch (error) {
        // ESPN and BallDontLie use different numeric id spaces. 401/404 → stop.
        if (
          !(
            error instanceof BallDontLieError &&
            (error.status === 401 || error.status === 404)
          )
        ) {
          throw error;
        }
      }
    }

    // Do not call ESPN with a BallDontLie / non-event id — different id space.
    return null;
  }

  async getPlayerSeasons(season: string): Promise<PlayerSeason[]> {
    const [rows, darko, raptor] = await Promise.all([
      this.espn.getPlayerSeasons(season),
      fetchDarkoRatings().catch(() => [] as DarkoRating[]),
      loadRaptorRatings(season).catch(() => [] as RaptorRating[]),
    ]);

    const darkoByName = indexByName(darko);
    const raptorByName = indexByName(raptor);

    return rows.map((row) => {
      const d = darkoByName.get(normalizeName(row.playerName));
      // Live DARKO is a stamped-season snapshot — never overlay onto other years.
      const darkoApplies = d != null && d.season === season;
      const l = raptorByName.get(normalizeName(row.playerName));
      return {
        ...row,
        darkoDpm: darkoApplies ? d.impact : undefined,
        darkoOff: darkoApplies ? d.offensive : undefined,
        darkoDef: darkoApplies ? d.defensive : undefined,
        raptor: l?.impact,
        oRaptor: l?.offensive,
        dRaptor: l?.defensive,
        winsAdded: l?.winsAdded,
      };
    });
  }

  async getGameStats(params: {
    season?: string;
    gameId?: string;
    playerId?: string;
    startDate?: string;
    endDate?: string;
    maxPages?: number;
  }): Promise<PlayerGame[]> {
    if (!this.bdl) {
      throw new BallDontLieError(
        "BALLDONTLIE_API_KEY required for historical game player stats.",
        401,
        "/nba/v1/stats"
      );
    }

    const seasons = params.season
      ? [startYearFromCanonicalSeason(params.season)]
      : undefined;

    const rows = await this.bdl.paginateAll(
      (cursor) =>
        this.bdl!.getStats({
          seasons,
          gameIds: params.gameId ? [Number(params.gameId)] : undefined,
          playerIds: params.playerId ? [Number(params.playerId)] : undefined,
          startDate: params.startDate,
          endDate: params.endDate,
          cursor,
        }),
      { maxPages: params.maxPages ?? 20, delayMs: 220 }
    );

    return rows.map(transformBdlStatsRow);
  }

  async getAdvancedStats(params: {
    season?: string;
    gameId?: string;
    playerId?: string;
    startDate?: string;
    endDate?: string;
    maxPages?: number;
  }): Promise<AdvancedPlayerGameStats[]> {
    if (!this.bdl) {
      throw new BallDontLieError(
        "BALLDONTLIE_API_KEY required for advanced game stats.",
        401,
        "/nba/v2/stats/advanced"
      );
    }

    const seasons = params.season
      ? [startYearFromCanonicalSeason(params.season)]
      : undefined;

    try {
      const rows = await this.bdl.paginateAll(
        (cursor) =>
          this.bdl!.getAdvancedStats({
            seasons,
            gameIds: params.gameId ? [Number(params.gameId)] : undefined,
            playerIds: params.playerId ? [Number(params.playerId)] : undefined,
            startDate: params.startDate,
            endDate: params.endDate,
            cursor,
          }),
        { maxPages: params.maxPages ?? 20, delayMs: 220 }
      );
      return rows
        .map(transformBdlAdvanced)
        .filter((row): row is AdvancedPlayerGameStats => row != null);
    } catch (error) {
      if (error instanceof BallDontLieError && error.status === 401) {
        // Derive TS%/eFG% from counting stats when advanced tier unavailable.
        const counting = await this.getGameStats(params);
        return counting.map((row) => ({
          id: row.id,
          gameId: row.gameId,
          playerId: row.playerId,
          playerName: row.playerName,
          teamId: row.teamId,
          season: row.season,
          gameDate: row.gameDate,
          minutes: row.minutes,
          trueShootingPct: row.trueShootingPct,
          effectiveFieldGoalPct: row.effectiveFieldGoalPct,
          plusMinus: row.plusMinus,
        }));
      }
      throw error;
    }
  }

  async getDarko(season?: string): Promise<DarkoRating[]> {
    const rows = await fetchDarkoRatings();
    if (!season) return rows;
    return rows.filter((row) => row.season === season);
  }

  async getRaptor(season?: string): Promise<RaptorRating[]> {
    return loadRaptorRatings(season);
  }

  private async loadTeams(): Promise<Team[]> {
    if (this.bdl) {
      const teams = await this.bdl.getTeams();
      return teams.map(transformBdlTeam);
    }
    return this.espn.getTeams();
  }
}

function resolveSeasonYears(query: HistoricalGamesQuery): number[] {
  if (query.season) {
    return [startYearFromCanonicalSeason(query.season)];
  }
  if (query.startSeason || query.endSeason) {
    const start = startYearFromCanonicalSeason(
      query.startSeason ?? `${HISTORICAL_START_YEAR}-${String((HISTORICAL_START_YEAR + 1) % 100).padStart(2, "0")}`
    );
    const end = startYearFromCanonicalSeason(
      query.endSeason ??
        listCanonicalSeasons().slice(-1)[0]
    );
    const years: number[] = [];
    for (let y = start; y <= end; y++) years.push(y);
    return years;
  }
  return [];
}

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function indexByName<T extends { playerName: string }>(
  rows: T[]
): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    map.set(normalizeName(row.playerName), row);
  }
  return map;
}
