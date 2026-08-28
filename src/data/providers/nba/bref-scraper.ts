import {
  sharedClearPrefix,
  sharedGetOrSet,
  sharedPeek,
} from "@/data/cache/shared-ttl-cache";
import { CACHE_TTL_MS, isCurrentCanonicalSeason } from "./cache-policy";

const DEFAULT_TTL_MS = CACHE_TTL_MS.brefCurrent;
const BREF_HEADERS = {
  Accept: "text/html,application/xhtml+xml",
  "User-Agent":
    "Mozilla/5.0 (compatible; BasketballAnalytics/0.1; educational)",
};

export type BrefGrainRow = {
  playerName: string;
  /** Basketball-Reference player code, e.g. jamesle01 */
  brefId?: string;
  teamAbbr: string;
};

export interface BrefAdvancedRow extends BrefGrainRow {
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

export const BREF_COMBINED_TEAMS = new Set(["TOT", "2TM", "3TM", "4TM"]);

export function isBrefCombinedTeam(abbr: string): boolean {
  return BREF_COMBINED_TEAMS.has(abbr.trim().toUpperCase());
}

/**
 * Parse a BRef HTML table that uses data-stat attributes on <td>/<th>.
 */
export function parseBrefStatTable(
  html: string,
  options: { includeCombined?: boolean } = {}
): BrefAdvancedRow[] {
  const includeCombined = options.includeCombined ?? false;
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
    if (!teamAbbr) continue;
    if (!includeCombined && isBrefCombinedTeam(teamAbbr)) continue;

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
  // Cloudflare Workers: bundled snapshot first (live BRef is often blocked).
  try {
    const { getBundledBrefAdvancedSeason } = await import(
      "@/data/runtime/bref-advanced-snapshot"
    );
    const bundled = getBundledBrefAdvancedSeason(canonicalSeason);
    if (bundled?.length) return bundled;
  } catch {
    // fall through to live scrape
  }

  // Slim edge only: never hang on live BRef for missing seasons.
  const { slimEdgeProductEnabled } = await import(
    "@/data/providers/nba/runtime-policy"
  );
  if (slimEdgeProductEnabled()) {
    return [];
  }

  const year = brefSeasonYear(canonicalSeason);
  const url = `https://www.basketball-reference.com/leagues/NBA_${year}_advanced.html`;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const staleMs =
    options.staleMs ??
    (isCurrentCanonicalSeason(canonicalSeason)
      ? CACHE_TTL_MS.brefCurrentStale
      : 0);

  return sharedGetOrSet(
    `bref:advanced:${canonicalSeason}`,
    { ttlMs, staleMs, tags: ["bref", `bref:${canonicalSeason}`] },
    () => scrapeBrefAdvanced(url)
  );
}

/** One combined-or-only-team row per player for percentile cohorts. */
export function collapseBrefToSeasonGrain<T extends BrefGrainRow>(rows: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = row.brefId ?? normalizePlayerName(row.playerName);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  const out: T[] = [];
  for (const list of groups.values()) {
    const combined = list.find((r) => isBrefCombinedTeam(r.teamAbbr));
    out.push(combined ?? list[0]!);
  }
  return out;
}

export type BrefPerGameCohortRow = BrefGrainRow & {
  gamesPlayed: number;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
};

export function parseBrefPerGameTable(
  html: string,
  options: { includeCombined?: boolean } = {}
): BrefPerGameCohortRow[] {
  const includeCombined = options.includeCombined ?? false;
  const cleaned = html.replace(/<!--|-->/g, "");
  const cellRegex =
    /<(td|th)[^>]*data-stat="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/gi;
  const rows: BrefPerGameCohortRow[] = [];
  for (const rowMatch of cleaned.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = rowMatch[1] ?? "";
    const cells = new Map<string, string>();
    const idMatch = /data-append-csv="([^"]+)"/.exec(rowHtml);
    for (const cellMatch of rowHtml.matchAll(cellRegex)) {
      cells.set(cellMatch[2], decodeEntities(cellMatch[3] ?? ""));
    }
    const playerName = cells.get("name_display") ?? cells.get("player");
    if (!playerName || playerName === "Player") continue;
    const teamAbbr = (cells.get("team_name_abbr") ?? cells.get("team_id") ?? "")
      .toUpperCase()
      .trim();
    if (!teamAbbr) continue;
    if (!includeCombined && isBrefCombinedTeam(teamAbbr)) continue;
    rows.push({
      playerName,
      brefId: idMatch?.[1],
      teamAbbr,
      gamesPlayed: num(cells.get("games") ?? cells.get("g")),
      minutes: num(cells.get("mp_per_g") ?? cells.get("mp")),
      points: num(cells.get("pts_per_g") ?? cells.get("pts")),
      rebounds: num(cells.get("trb_per_g") ?? cells.get("trb")),
      assists: num(cells.get("ast_per_g") ?? cells.get("ast")),
    });
  }
  return rows;
}

/**
 * League advanced including TOT/2TM, collapsed to one row per player.
 * Separate cache from `fetchBrefAdvancedSeason` (which still drops combined rows).
 */
export async function fetchBrefAdvancedCohort(
  canonicalSeason: string,
  options: { ttlMs?: number; staleMs?: number } = {}
): Promise<BrefAdvancedRow[]> {
  const year = brefSeasonYear(canonicalSeason);
  const url = `https://www.basketball-reference.com/leagues/NBA_${year}_advanced.html`;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const staleMs =
    options.staleMs ??
    (isCurrentCanonicalSeason(canonicalSeason)
      ? CACHE_TTL_MS.brefCurrentStale
      : 0);

  return sharedGetOrSet(
    `bref:advanced-cohort:${canonicalSeason}`,
    { ttlMs, staleMs, tags: ["bref", `bref:${canonicalSeason}`] },
    async () => {
      const html = await fetchBrefHtml(url);
      return collapseBrefToSeasonGrain(
        parseBrefStatTable(html, { includeCombined: true })
      );
    }
  );
}

/**
 * League per-game including TOT/2TM, collapsed to one row per player.
 * Used for PTS/REB/AST percentiles (advanced tables have no counting stats).
 */
export async function fetchBrefPerGameCohort(
  canonicalSeason: string,
  options: { ttlMs?: number; staleMs?: number } = {}
): Promise<BrefPerGameCohortRow[]> {
  const year = brefSeasonYear(canonicalSeason);
  const url = `https://www.basketball-reference.com/leagues/NBA_${year}_per_game.html`;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const staleMs =
    options.staleMs ??
    (isCurrentCanonicalSeason(canonicalSeason)
      ? CACHE_TTL_MS.brefCurrentStale
      : 0);

  return sharedGetOrSet(
    `bref:per-game:${canonicalSeason}`,
    { ttlMs, staleMs, tags: ["bref", `bref:${canonicalSeason}`] },
    async () => {
      const html = await fetchBrefHtml(url);
      return collapseBrefToSeasonGrain(
        parseBrefPerGameTable(html, { includeCombined: true })
      );
    }
  );
}

/** Last known BRef rows even if stale - used when the critical path times out. */
export function peekBrefAdvancedSeason(
  canonicalSeason: string
): BrefAdvancedRow[] | null {
  return sharedPeek(`bref:advanced:${canonicalSeason}`);
}

async function fetchBrefHtml(url: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: BREF_HEADERS,
        next: { revalidate: 3600 },
      } as RequestInit);
      if (!response.ok) {
        throw new Error(`BRef request failed (${response.status}): ${url}`);
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      await delay(500 * (attempt + 1));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`BRef scrape failed: ${url}`);
}

async function scrapeBrefAdvanced(url: string): Promise<BrefAdvancedRow[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const html = await fetchBrefHtml(url);
      const rows = parseBrefStatTable(html);
      if (rows.length === 0) {
        throw new Error(`BRef advanced table empty: ${url}`);
      }
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
  sharedClearPrefix("bref:");
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
