import {
  sharedClearPrefix,
  sharedGetOrSet,
  sharedPeek,
} from "@/data/cache/shared-ttl-cache";
import { CACHE_TTL_MS } from "./cache-policy";
import {
  isVercelRuntime,
  runtimeTimeoutMs,
  statsNbaNetworkEnabled,
} from "./runtime-policy";

const DEFAULT_TTL_MS = CACHE_TTL_MS.currentSeasonStats;
const DEFAULT_STALE_MS = CACHE_TTL_MS.currentSeasonStale;
const DEFAULT_RETRIES = 1;
const DEFAULT_TIMEOUT_MS = 4_000;
const VERCEL_TIMEOUT_MS = 1_800;
const BASE_URL = "https://stats.nba.com/stats";

/**
 * Vercel instances should try the same NBA Stats path as local/Cursor, but a
 * blocked origin must not tax every request. Two consecutive network failures
 * open a short per-instance circuit; shared/Next Data Cache is still checked
 * before this factory runs, so warm factual data continues to serve.
 */
const CIRCUIT_FAILURE_THRESHOLD = 2;
const CIRCUIT_OPEN_MS = 2 * 60 * 1000;
let consecutiveNetworkFailures = 0;
let circuitOpenUntil = 0;

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

function nbaStatsCircuitOpen(): boolean {
  return isVercelRuntime() && Date.now() < circuitOpenUntil;
}

function recordNbaStatsSuccess(): void {
  consecutiveNetworkFailures = 0;
  circuitOpenUntil = 0;
}

function recordNbaStatsFailure(): void {
  if (!isVercelRuntime()) return;
  consecutiveNetworkFailures += 1;
  if (consecutiveNetworkFailures >= CIRCUIT_FAILURE_THRESHOLD) {
    circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS;
  }
}

export async function statsNbaFetch(
  endpoint: string,
  params: Record<string, string | number | boolean | undefined> = {},
  options: StatsNbaFetchOptions = {}
): Promise<StatsNbaResponse> {
  const url = buildUrl(endpoint, params);
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;

  // sharedGetOrSet checks memory + Next Data Cache before invoking the factory.
  // Therefore a Vercel circuit only suppresses a known-bad network miss; it
  // never suppresses a warm cached NBA response.
  return sharedGetOrSet(
    `stats.nba:${url}`,
    { ttlMs, staleMs, tags: ["stats-nba", endpoint] },
    async () => {
      if (!statsNbaNetworkEnabled()) {
        throw new Error(`stats.nba.com network disabled: ${endpoint}`);
      }
      if (nbaStatsCircuitOpen()) {
        throw new Error(`stats.nba.com circuit open: ${endpoint}`);
      }
      return fetchStatsNba(url, options);
    }
  );
}

async function fetchStatsNba(
  url: string,
  options: StatsNbaFetchOptions
): Promise<StatsNbaResponse> {
  const retries = options.retries ?? DEFAULT_RETRIES;
  let lastError: unknown;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const timeoutMs = runtimeTimeoutMs(DEFAULT_TIMEOUT_MS, VERCEL_TIMEOUT_MS);

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        signal: options.signal ?? AbortSignal.timeout(timeoutMs),
        headers: NBA_HEADERS,
        // Shared across Vercel instances (Next Data Cache / CDN).
        next: { revalidate: Math.max(60, Math.floor(ttlMs / 1000)) },
      } as RequestInit);
      if (!response.ok) {
        throw new Error(`stats.nba.com failed (${response.status}): ${url}`);
      }
      const payload = (await response.json()) as StatsNbaResponse;
      recordNbaStatsSuccess();
      return payload;
    } catch (error) {
      lastError = error;
      // Do not add a backoff after the final failed attempt.
      if (attempt < retries - 1) {
        await delay(350 * (attempt + 1));
      }
    }
  }

  recordNbaStatsFailure();
  throw lastError instanceof Error
    ? lastError
    : new Error(`stats.nba.com failed: ${url}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function clearStatsNbaCache(): void {
  sharedClearPrefix("stats.nba:");
  consecutiveNetworkFailures = 0;
  circuitOpenUntil = 0;
}

/** Last known response in this process (stale ok) — critical-path fallback. */
export function peekStatsNbaCache(url: string): StatsNbaResponse | null {
  return sharedPeek(`stats.nba:${url}`);
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
