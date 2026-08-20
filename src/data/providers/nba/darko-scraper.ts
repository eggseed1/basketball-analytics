import {
  CACHE_TTL_MS,
  isCurrentCanonicalSeason,
} from "./cache-policy";
import { brefSeasonYear } from "./bref-scraper";

type CacheEntry<T> = {
  freshUntil: number;
  staleUntil: number;
  value: T;
  refreshing?: boolean;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();
const DEFAULT_TTL_MS = CACHE_TTL_MS.darkoCurrent;

/** DARKO / darko.app season coverage starts with 1996-97. */
export const EARLIEST_DARKO_SEASON_YEAR = 1997;

export interface DarkoPlayerRow {
  /** stats.nba.com player id */
  nbaId: string;
  playerName: string;
  teamName: string;
  /** Ending calendar year, e.g. 2024 for 2023-24. */
  seasonYear: number;
  dpm: number;
  oDpm: number;
  dDpm: number;
  boxDpm: number;
  onOffDpm: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function num(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * Hydrate SvelteKit `devalue` payloads from `__data.json`.
 * Numbers inside objects/arrays are pointers into the flattened table;
 * values stored at those indices are literals.
 */
export function hydrateSvelteKitData(data: unknown[]): unknown {
  const hydrated: unknown[] = new Array(data.length);

  function hydrateIndex(i: number): unknown {
    if (hydrated[i] !== undefined) return hydrated[i];
    const value = data[i];
    if (value == null || typeof value !== "object") {
      hydrated[i] = value;
      return value;
    }
    if (Array.isArray(value)) {
      const arr: unknown[] = [];
      hydrated[i] = arr;
      for (const item of value) {
        arr.push(typeof item === "number" ? hydrateIndex(item) : item);
      }
      return arr;
    }
    const obj: Record<string, unknown> = {};
    hydrated[i] = obj;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      obj[k] = typeof v === "number" ? hydrateIndex(v) : v;
    }
    return obj;
  }

  return hydrateIndex(0);
}

export function darkoSeasonYear(canonicalSeason: string): number {
  return brefSeasonYear(canonicalSeason);
}

export function isDarkoSeasonAvailable(canonicalSeason: string): boolean {
  try {
    return darkoSeasonYear(canonicalSeason) >= EARLIEST_DARKO_SEASON_YEAR;
  } catch {
    return false;
  }
}

function darkoDataUrl(canonicalSeason: string): string {
  const base =
    "https://www.darko.app/__data.json?x-sveltekit-trailing-slash=1&x-sveltekit-invalidated=01";
  // "Current" board is the nightly live projection - prefer it for the
  // active season. Historical seasons use the ending calendar year.
  if (isCurrentCanonicalSeason(canonicalSeason)) {
    return base;
  }
  const year = darkoSeasonYear(canonicalSeason);
  return `${base}&season=${year}`;
}

function parseDarkoPlayers(decoded: unknown): DarkoPlayerRow[] {
  if (!decoded || typeof decoded !== "object") return [];
  const players = (decoded as { players?: unknown }).players;
  if (!Array.isArray(players)) return [];

  const rows: DarkoPlayerRow[] = [];
  for (const raw of players) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const nbaId = row.nba_id != null ? String(row.nba_id) : "";
    if (!nbaId) continue;
    rows.push({
      nbaId,
      playerName: String(row.player_name ?? ""),
      teamName: String(row.team_name ?? ""),
      seasonYear: num(row.season),
      dpm: num(row.dpm),
      oDpm: num(row.o_dpm),
      dDpm: num(row.d_dpm),
      boxDpm: num(row.box_dpm),
      onOffDpm: num(row.on_off_dpm),
    });
  }
  return rows;
}

export async function fetchDarkoSeason(
  canonicalSeason: string,
  options: { ttlMs?: number; staleMs?: number } = {}
): Promise<DarkoPlayerRow[]> {
  if (!isDarkoSeasonAvailable(canonicalSeason)) {
    return [];
  }

  const url = darkoDataUrl(canonicalSeason);
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const staleMs = options.staleMs ?? 0;
  const now = Date.now();
  const cached = memoryCache.get(url) as CacheEntry<DarkoPlayerRow[]> | undefined;

  if (cached && cached.freshUntil > now) {
    return cached.value;
  }

  if (cached && cached.staleUntil > now) {
    if (!cached.refreshing) {
      cached.refreshing = true;
      void scrapeDarko(url, ttlMs, staleMs)
        .catch(() => undefined)
        .finally(() => {
          const entry = memoryCache.get(url) as
            | CacheEntry<DarkoPlayerRow[]>
            | undefined;
          if (entry) entry.refreshing = false;
        });
    }
    return cached.value;
  }

  return scrapeDarko(url, ttlMs, staleMs);
}

/** Last known DARKO rows even if stale - used when the critical path times out. */
export function peekDarkoSeason(
  canonicalSeason: string
): DarkoPlayerRow[] | null {
  if (!isDarkoSeasonAvailable(canonicalSeason)) return null;
  const url = darkoDataUrl(canonicalSeason);
  const cached = memoryCache.get(url) as CacheEntry<DarkoPlayerRow[]> | undefined;
  return cached?.value ?? null;
}

async function scrapeDarko(
  url: string,
  ttlMs: number,
  staleMs: number
): Promise<DarkoPlayerRow[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (compatible; BasketballAnalytics/0.1; educational)",
        },
      });
      if (!response.ok) {
        throw new Error(`DARKO request failed (${response.status}): ${url}`);
      }
      const json = (await response.json()) as {
        nodes?: Array<{ type?: string; data?: unknown[] } | null>;
      };
      const node = json.nodes?.find((n) => n?.type === "data" && Array.isArray(n.data));
      if (!node?.data) {
        throw new Error(`DARKO payload missing data node: ${url}`);
      }
      const decoded = hydrateSvelteKitData(node.data);
      const rows = parseDarkoPlayers(decoded);
      if (rows.length === 0) {
        throw new Error(`DARKO player table empty: ${url}`);
      }
      const now = Date.now();
      memoryCache.set(url, {
        value: rows,
        freshUntil: now + ttlMs,
        staleUntil: now + ttlMs + staleMs,
      });
      return rows;
    } catch (error) {
      lastError = error;
      await delay(500 * (attempt + 1));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`DARKO scrape failed: ${url}`);
}

export function clearDarkoCache(): void {
  memoryCache.clear();
}
