import { CACHE_TTL_MS } from "./cache-policy";

type CacheEntry<T> = {
  freshUntil: number;
  staleUntil: number;
  value: T;
  refreshing?: boolean;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL_MS = CACHE_TTL_MS.currentSeasonStats;
const DEFAULT_STALE_MS = CACHE_TTL_MS.currentSeasonStale;
const DEFAULT_RETRIES = 1;
const DEFAULT_TIMEOUT_MS = 4_000;
const BASE_URL = "https://stats.nba.com/stats";

const NBA_HEADERS: Record<string, string> = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://www.nba.com",
  Referer: "https://www.nba.com/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "x-nba-stats-origin": "stats",
  "x-nba-stats-token": "true",
};

export interface StatsNbaResultSet {
  name: string;
  headers: string[];
  rowSet: Array<Array<string | number | null>>;
}

export interface StatsNbaResponse {
  resource?: string;
  resultSets?: StatsNbaResultSet[];
  /** Some endpoints (e.g. leagueleaders) return a singular resultSet. */
  resultSet?: StatsNbaResultSet;
}

export interface StatsNbaFetchOptions {
  ttlMs?: number;
  /** Extra time to serve stale JSON while a background refresh runs. */
  staleMs?: number;
  retries?: number;
  signal?: AbortSignal;
}

function buildUrl(
  endpoint: string,
  params: Record<string, string | number | boolean | undefined>
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.set(key, String(value));
  }
  return `${BASE_URL}/${endpoint}?${search.toString()}`;
}

export function resultSetToObjects(
  set: StatsNbaResultSet
): Array<Record<string, string | number | null>> {
  return set.rowSet.map((row) => {
    const obj: Record<string, string | number | null> = {};
    set.headers.forEach((header, index) => {
      obj[header] = row[index] ?? null;
    });
    return obj;
  });
}

export function getResultSet(
  response: StatsNbaResponse,
  name?: string
): StatsNbaResultSet | null {
  if (response.resultSets?.length) {
    if (!name) return response.resultSets[0] ?? null;
    return response.resultSets.find((set) => set.name === name) ?? null;
  }
  if (response.resultSet) {
    if (
      !name ||
      !response.resultSet.name ||
      response.resultSet.name === name
    ) {
      return response.resultSet;
    }
  }
  return null;
}

export async function statsNbaFetch(
  endpoint: string,
  params: Record<string, string | number | boolean | undefined> = {},
  options: StatsNbaFetchOptions = {}
): Promise<StatsNbaResponse> {
  const url = buildUrl(endpoint, params);
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const now = Date.now();
  const cached = memoryCache.get(url) as CacheEntry<StatsNbaResponse> | undefined;

  if (cached && cached.freshUntil > now) {
    return cached.value;
  }

  if (cached && cached.staleUntil > now) {
    if (!cached.refreshing) {
      cached.refreshing = true;
      void fetchStatsNba(url, ttlMs, staleMs, options)
        .catch(() => undefined)
        .finally(() => {
          const entry = memoryCache.get(url) as
            | CacheEntry<StatsNbaResponse>
            | undefined;
          if (entry) entry.refreshing = false;
        });
    }
    return cached.value;
  }

  return fetchStatsNba(url, ttlMs, staleMs, options);
}

async function fetchStatsNba(
  url: string,
  ttlMs: number,
  staleMs: number,
  options: StatsNbaFetchOptions
): Promise<StatsNbaResponse> {
  const retries = options.retries ?? DEFAULT_RETRIES;
  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        signal: options.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
        headers: NBA_HEADERS,
      });
      if (!response.ok) {
        throw new Error(`stats.nba.com failed (${response.status}): ${url}`);
      }
      const value = (await response.json()) as StatsNbaResponse;
      const now = Date.now();
      memoryCache.set(url, {
        value,
        freshUntil: now + ttlMs,
        staleUntil: now + ttlMs + staleMs,
      });
      return value;
    } catch (error) {
      lastError = error;
      await delay(350 * (attempt + 1));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`stats.nba.com failed: ${url}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function clearStatsNbaCache(): void {
  memoryCache.clear();
}

/** Common league-dash params for a season. */
export function leagueDashParams(
  season: string,
  measureType: string,
  seasonType = "Regular Season",
  perMode = "Totals"
): Record<string, string | number> {
  return {
    College: "",
    Conference: "",
    Country: "",
    DateFrom: "",
    DateTo: "",
    Division: "",
    DraftPick: "",
    DraftYear: "",
    GameScope: "",
    GameSegment: "",
    Height: "",
    LastNGames: 0,
    LeagueID: "00",
    Location: "",
    MeasureType: measureType,
    Month: 0,
    OpponentTeamID: 0,
    Outcome: "",
    PORound: 0,
    PaceAdjust: "N",
    PerMode: perMode,
    Period: 0,
    PlayerExperience: "",
    PlayerPosition: "",
    PlusMinus: "N",
    Rank: "N",
    Season: season,
    SeasonSegment: "",
    SeasonType: seasonType,
    ShotClockRange: "",
    StarterBench: "",
    TeamID: 0,
    VsConference: "",
    VsDivision: "",
    Weight: "",
  };
}
