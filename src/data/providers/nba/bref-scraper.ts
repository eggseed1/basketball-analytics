import { CACHE_TTL_MS } from "./cache-policy";

type CacheEntry<T> = {
  freshUntil: number;
  staleUntil: number;
  value: T;
  refreshing?: boolean;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();
const DEFAULT_TTL_MS = CACHE_TTL_MS.brefCurrent;

export interface BrefAdvancedRow {
  playerName: string;
  /** Basketball-Reference player code, e.g. jamesle01 */
  brefId?: string;
  teamAbbr: string;
  position?: string;
  gamesPlayed: number;
  gamesStarted: number;
  minutes: number;
  per: number;
  trueShootingPct: number;
  threePointAttemptRate: number;
  freeThrowRate: number;
  offensiveReboundPct: number;
  defensiveReboundPct: number;
  reboundPct: number;
  assistPct: number;
  stealPct: number;
  blockPct: number;
  turnoverPct: number;
  usagePct: number;
  ows: number;
  dws: number;
  winShares: number;
  winSharesPer48: number;
  obpm: number;
  dbpm: number;
  bpm: number;
  vorp: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Basketball-Reference stores ending calendar year in league URLs:
 * 2024-25 → NBA_2025_advanced.html
 */
export function brefSeasonYear(canonicalSeason: string): number {
  const match = /^(\d{4})-(\d{2})$/.exec(canonicalSeason.trim());
  if (!match) {
    throw new Error(`Invalid season "${canonicalSeason}"`);
  }
  return Number(match[1]) + 1;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/<[^>]+>/g, "")
    .trim();
}

function num(raw: string | undefined): number {
  if (raw == null || raw === "" || raw === "-") return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function rateFraction(raw: string | undefined): number {
  const value = num(raw);
  if (value > 1) return value / 100;
  return value;
}

/**
 * Parse a BRef HTML table that uses data-stat attributes on <td>/<th>.
 */
export function parseBrefStatTable(html: string): BrefAdvancedRow[] {
  // Comments wrap some tables; unwrap so regex can see rows.
  const cleaned = html.replace(/<!--|-->/g, "");
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex =
    /<(td|th)[^>]*data-stat="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/gi;

  const rows: BrefAdvancedRow[] = [];

  for (const rowMatch of cleaned.matchAll(rowRegex)) {
    const rowHtml = rowMatch[1] ?? "";
    const cells = new Map<string, string>();
    let brefId: string | undefined;

    const idMatch = /data-append-csv="([^"]+)"/.exec(rowHtml);
    if (idMatch) brefId = idMatch[1];

    for (const cellMatch of rowHtml.matchAll(cellRegex)) {
      const stat = cellMatch[2];
      const value = decodeEntities(cellMatch[3] ?? "");
      cells.set(stat, value);
    }

    const playerName = cells.get("name_display") ?? cells.get("player");
    if (!playerName || playerName === "Player") continue;
    const teamAbbr = (cells.get("team_name_abbr") ?? cells.get("team_id") ?? "")
      .toUpperCase()
      .trim();
    // Skip league aggregate / multi-team total rows that confuse merges.
    if (!teamAbbr || teamAbbr === "TOT" || teamAbbr === "2TM" || teamAbbr === "3TM") {
      continue;
    }

    rows.push({
      playerName,
      brefId,
      teamAbbr,
      position: cells.get("pos"),
      gamesPlayed: num(cells.get("games") ?? cells.get("g")),
      gamesStarted: num(cells.get("games_started") ?? cells.get("gs")),
      minutes: num(cells.get("mp")),
      per: num(cells.get("per")),
      trueShootingPct: rateFraction(cells.get("ts_pct")),
      threePointAttemptRate: rateFraction(cells.get("fg3a_per_fga_pct")),
      freeThrowRate: rateFraction(cells.get("fta_per_fga_pct")),
      offensiveReboundPct: rateFraction(cells.get("orb_pct")),
      defensiveReboundPct: rateFraction(cells.get("drb_pct")),
      reboundPct: rateFraction(cells.get("trb_pct")),
      assistPct: rateFraction(cells.get("ast_pct")),
      stealPct: rateFraction(cells.get("stl_pct")),
      blockPct: rateFraction(cells.get("blk_pct")),
      turnoverPct: rateFraction(cells.get("tov_pct")),
      usagePct: rateFraction(cells.get("usg_pct")),
      ows: num(cells.get("ows")),
      dws: num(cells.get("dws")),
      winShares: num(cells.get("ws")),
      winSharesPer48: rateFraction(cells.get("ws_per_48")),
      obpm: num(cells.get("obpm")),
      dbpm: num(cells.get("dbpm")),
      bpm: num(cells.get("bpm")),
      vorp: num(cells.get("vorp")),
    });
  }

  return rows;
}

export async function fetchBrefAdvancedSeason(
  canonicalSeason: string,
  options: { ttlMs?: number; staleMs?: number } = {}
): Promise<BrefAdvancedRow[]> {
  const year = brefSeasonYear(canonicalSeason);
  const url = `https://www.basketball-reference.com/leagues/NBA_${year}_advanced.html`;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const staleMs = options.staleMs ?? 0;
  const now = Date.now();
  const cached = memoryCache.get(url) as CacheEntry<BrefAdvancedRow[]> | undefined;

  if (cached && cached.freshUntil > now) {
    return cached.value;
  }

  if (cached && cached.staleUntil > now) {
    if (!cached.refreshing) {
      cached.refreshing = true;
      void scrapeBrefAdvanced(url, ttlMs, staleMs)
        .catch(() => undefined)
        .finally(() => {
          const entry = memoryCache.get(url) as
            | CacheEntry<BrefAdvancedRow[]>
            | undefined;
          if (entry) entry.refreshing = false;
        });
    }
    return cached.value;
  }

  return scrapeBrefAdvanced(url, ttlMs, staleMs);
}

/** Last known BRef rows even if stale — used when the critical path times out. */
export function peekBrefAdvancedSeason(
  canonicalSeason: string
): BrefAdvancedRow[] | null {
  const year = brefSeasonYear(canonicalSeason);
  const url = `https://www.basketball-reference.com/leagues/NBA_${year}_advanced.html`;
  const cached = memoryCache.get(url) as CacheEntry<BrefAdvancedRow[]> | undefined;
  return cached?.value ?? null;
}

async function scrapeBrefAdvanced(
  url: string,
  ttlMs: number,
  staleMs: number
): Promise<BrefAdvancedRow[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent":
            "Mozilla/5.0 (compatible; BasketballAnalytics/0.1; educational)",
        },
      });
      if (!response.ok) {
        throw new Error(`BRef request failed (${response.status}): ${url}`);
      }
      const html = await response.text();
      const rows = parseBrefStatTable(html);
      if (rows.length === 0) {
        throw new Error(`BRef advanced table empty: ${url}`);
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
    : new Error(`BRef scrape failed: ${url}`);
}

export function clearBrefCache(): void {
  memoryCache.clear();
}

export function normalizePlayerName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function brefLookupKey(playerName: string, teamAbbr: string): string {
  return `${normalizePlayerName(playerName)}|${teamAbbr.toUpperCase()}`;
}
