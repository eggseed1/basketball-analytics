/**
 * Thin BallDontLie NBA HTTP client.
 * Docs: https://docs.balldontlie.io/ - data from 1946-present.
 *
 * Free tier: teams, players, games.
 * ALL-STAR+: game player stats.
 * GOAT: season averages, box scores, advanced stats.
 */

export class BallDontLieError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string
  ) {
    super(message);
    this.name = "BallDontLieError";
  }
}

export interface BdlPagination {
  next_cursor?: number | null;
  per_page?: number;
}

export interface BdlListResponse<T> {
  data: T[];
  meta?: BdlPagination;
}

export interface BdlTeam {
  id: number;
  conference?: string;
  division?: string;
  city?: string;
  name?: string;
  full_name?: string;
  abbreviation?: string;
}

export interface BdlPlayer {
  id: number;
  first_name: string;
  last_name: string;
  position?: string;
  height?: string;
  weight?: string;
  jersey_number?: string;
  college?: string;
  country?: string;
  draft_year?: number | null;
  draft_round?: number | null;
  draft_number?: number | null;
  team_id?: number | null;
  team?: BdlTeam;
}

export interface BdlGame {
  id: number;
  date: string;
  season: number;
  status?: string | null;
  period?: number | null;
  time?: string | null;
  datetime?: string | null;
  postseason?: boolean;
  home_team_score: number;
  visitor_team_score: number;
  home_team: BdlTeam;
  visitor_team: BdlTeam;
}

export interface BdlStats {
  id: number;
  min?: string | null;
  fgm?: number;
  fga?: number;
  fg_pct?: number;
  fg3m?: number;
  fg3a?: number;
  fg3_pct?: number;
  ftm?: number;
  fta?: number;
  ft_pct?: number;
  oreb?: number;
  dreb?: number;
  reb?: number;
  ast?: number;
  stl?: number;
  blk?: number;
  turnover?: number;
  pf?: number;
  pts?: number;
  plus_minus?: number | null;
  player: BdlPlayer;
  team: BdlTeam;
  game: BdlGame;
}

export interface BdlBoxScorePlayerLine {
  min?: string | null;
  fgm?: number;
  fga?: number;
  fg_pct?: number;
  fg3m?: number;
  fg3a?: number;
  fg3_pct?: number;
  ftm?: number;
  fta?: number;
  ft_pct?: number;
  oreb?: number;
  dreb?: number;
  reb?: number;
  ast?: number;
  stl?: number;
  blk?: number;
  turnover?: number;
  pf?: number;
  pts?: number;
  plus_minus?: number | null;
  player: BdlPlayer;
}

export interface BdlBoxScore {
  date: string;
  season: number;
  status?: string;
  period?: number;
  time?: string;
  postseason?: boolean;
  home_team_score: number;
  visitor_team_score: number;
  home_team: { team: BdlTeam; players: BdlBoxScorePlayerLine[] };
  visitor_team: { team: BdlTeam; players: BdlBoxScorePlayerLine[] };
}

export interface BdlAdvancedStat {
  id?: number;
  pie?: number;
  pace?: number;
  assist_percentage?: number;
  assist_ratio?: number;
  assist_to_turnover?: number;
  defensive_rating?: number;
  defensive_rebound_percentage?: number;
  effective_field_goal_percentage?: number;
  net_rating?: number;
  offensive_rating?: number;
  offensive_rebound_percentage?: number;
  rebound_percentage?: number;
  true_shooting_percentage?: number;
  turnover_ratio?: number;
  usage_percentage?: number;
  player?: BdlPlayer;
  team?: BdlTeam;
  game?: BdlGame;
}

type QueryValue = string | number | boolean | Array<string | number> | undefined;

export interface BallDontLieClientOptions {
  apiKey: string;
  baseUrl?: string;
  /** Default 100 (API max). */
  perPage?: number;
  signal?: AbortSignal;
}

export class BallDontLieClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly perPage: number;
  private readonly signal?: AbortSignal;

  constructor(options: BallDontLieClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "https://api.balldontlie.io").replace(
      /\/$/,
      ""
    );
    this.perPage = options.perPage ?? 100;
    this.signal = options.signal;
  }

  async getTeams(): Promise<BdlTeam[]> {
    const payload = await this.get<BdlListResponse<BdlTeam>>("/nba/v1/teams");
    return payload.data ?? [];
  }

  async getPlayers(params: {
    search?: string;
    playerIds?: number[];
    cursor?: number;
  } = {}): Promise<BdlListResponse<BdlPlayer>> {
    return this.get("/nba/v1/players", {
      search: params.search,
      "player_ids[]": params.playerIds,
      cursor: params.cursor,
      per_page: this.perPage,
    });
  }

  async getGames(params: {
    seasons?: number[];
    teamIds?: number[];
    startDate?: string;
    endDate?: string;
    dates?: string[];
    seasonType?: string;
    cursor?: number;
  } = {}): Promise<BdlListResponse<BdlGame>> {
    return this.get("/nba/v1/games", {
      "seasons[]": params.seasons,
      "team_ids[]": params.teamIds,
      start_date: params.startDate,
      end_date: params.endDate,
      "dates[]": params.dates,
      season_type: params.seasonType,
      cursor: params.cursor,
      per_page: this.perPage,
    });
  }

  async getGame(id: number): Promise<BdlGame> {
    const payload = await this.get<{ data: BdlGame }>(`/nba/v1/games/${id}`);
    return payload.data;
  }

  /** ALL-STAR+ - per-game player counting stats. */
  async getStats(params: {
    seasons?: number[];
    playerIds?: number[];
    gameIds?: number[];
    startDate?: string;
    endDate?: string;
    cursor?: number;
  } = {}): Promise<BdlListResponse<BdlStats>> {
    return this.get("/nba/v1/stats", {
      "seasons[]": params.seasons,
      "player_ids[]": params.playerIds,
      "game_ids[]": params.gameIds,
      start_date: params.startDate,
      end_date: params.endDate,
      cursor: params.cursor,
      per_page: this.perPage,
    });
  }

  /** GOAT - full box scores for a date (YYYY-MM-DD). */
  async getBoxScores(date: string): Promise<BdlBoxScore[]> {
    const payload = await this.get<BdlListResponse<BdlBoxScore>>(
      "/nba/v1/box_scores",
      { date }
    );
    return payload.data ?? [];
  }

  /** GOAT - advanced per-game stats. */
  async getAdvancedStats(params: {
    seasons?: number[];
    playerIds?: number[];
    gameIds?: number[];
    startDate?: string;
    endDate?: string;
    cursor?: number;
  } = {}): Promise<BdlListResponse<BdlAdvancedStat>> {
    return this.get("/nba/v2/stats/advanced", {
      "seasons[]": params.seasons,
      "player_ids[]": params.playerIds,
      "game_ids[]": params.gameIds,
      start_date: params.startDate,
      end_date: params.endDate,
      cursor: params.cursor,
      per_page: this.perPage,
    });
  }

  /** Fetch every page until exhausted (respect free-tier rate limits). */
  async paginateAll<T>(
    fetchPage: (cursor?: number) => Promise<BdlListResponse<T>>,
    options: { maxPages?: number; delayMs?: number } = {}
  ): Promise<T[]> {
    const maxPages = options.maxPages ?? 500;
    const delayMs = options.delayMs ?? 250;
    const rows: T[] = [];
    let cursor: number | undefined;
    for (let page = 0; page < maxPages; page++) {
      const payload = await fetchPage(cursor);
      rows.push(...(payload.data ?? []));
      const next = payload.meta?.next_cursor;
      if (next == null) break;
      cursor = next;
      if (delayMs > 0) await delay(delayMs);
    }
    return rows;
  }

  private async get<T>(
    path: string,
    query: Record<string, QueryValue> = {}
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const item of value) {
          url.searchParams.append(key, String(item));
        }
      } else {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url, {
      signal: this.signal,
      headers: {
        Accept: "application/json",
        Authorization: this.apiKey,
      },
    });

    if (response.status === 429) {
      // Free-tier rate limit - exponential backoff, several attempts.
      for (let attempt = 1; attempt <= 6; attempt++) {
        const waitMs = Math.min(60_000, 2000 * 2 ** (attempt - 1));
        await delay(waitMs);
        const retry = await fetch(url, {
          signal: this.signal,
          headers: {
            Accept: "application/json",
            Authorization: this.apiKey,
          },
        });
        if (retry.status === 429) continue;
        if (!retry.ok) {
          const body = await retry.text().catch(() => "");
          throw new BallDontLieError(
            body || `BallDontLie ${retry.status} for ${path}`,
            retry.status,
            path
          );
        }
        return (await retry.json()) as T;
      }
      throw new BallDontLieError(
        "Too many requests, please try again later.",
        429,
        path
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new BallDontLieError(
        body || `BallDontLie ${response.status} for ${path}`,
        response.status,
        path
      );
    }

    return (await response.json()) as T;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getBallDontLieApiKey(): string | undefined {
  const key = process.env.BALLDONTLIE_API_KEY?.trim();
  return key || undefined;
}

export function createBallDontLieClient(
  signal?: AbortSignal
): BallDontLieClient | null {
  const apiKey = getBallDontLieApiKey();
  if (!apiKey) return null;
  return new BallDontLieClient({ apiKey, signal });
}
