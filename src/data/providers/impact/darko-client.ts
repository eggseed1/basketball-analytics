import type { DarkoRating } from "@/data/types";
import { canonicalSeasonFromStartYear } from "@/data/providers/historical/season-range";
import { runtimeTimeoutMs } from "@/data/providers/nba/runtime-policy";

const DARKO_URL = "https://www.darko.app/";
const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

type CacheEntry = { expiresAt: number; value: DarkoRating[] };
let memoryCache: CacheEntry | null = null;

/**
 * Pull the live DARKO DPM leaderboard embedded in darko.app HTML.
 * Official proprietary metric - we only mirror the public leaderboard snapshot.
 */
export async function fetchDarkoRatings(
  options: { force?: boolean; signal?: AbortSignal } = {}
): Promise<DarkoRating[]> {
  if (
    !options.force &&
    memoryCache &&
    memoryCache.expiresAt > Date.now()
  ) {
    return memoryCache.value;
  }

  const response = await fetch(DARKO_URL, {
    // Live DARKO is a secondary overlay. Never let it hold the player identity
    // route open for its former eight-second timeout on a cold Vercel function.
    signal:
      options.signal ??
      AbortSignal.timeout(runtimeTimeoutMs(8_000, 1_000)),
    headers: {
      Accept: "text/html",
      "User-Agent":
        "BasketballAnalytics/0.1 (+local; educational data exploration)",
    },
    next: { revalidate: 60 * 60 * 6 },
  } as RequestInit);

  if (!response.ok) {
    throw new Error(`DARKO fetch failed (${response.status})`);
  }

  const html = await response.text();
  const ratings = parseDarkoHtml(html);
  if (ratings.length === 0) {
    throw new Error("DARKO parse returned 0 players - page markup may have changed");
  }

  memoryCache = {
    value: ratings,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  return ratings;
}

/** Slice a balanced `[...]` literal starting at `start`, skipping string contents. */
function bracketLiteral(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "[") depth++;
    else if (c === "]" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/** JS array literal → JSON: devalue writes `.5` / `-.5` without the leading zero. */
function parseJsArray(literal: string): unknown {
  return JSON.parse(literal.replace(/(?<=[[,])(-?)\.(\d)/g, "$10.$2"));
}

/** Current markup: `players:{keys:[...],values:[[col0...],[col1...]]}` (column-major). */
function parseDarkoColumns(html: string, updatedAt: string): DarkoRating[] {
  const at = html.indexOf("players:{keys:");
  if (at < 0) return [];
  const keysStart = html.indexOf("[", at);
  const keysLiteral = bracketLiteral(html, keysStart);
  if (!keysLiteral) return [];
  const valuesAt = html.indexOf("values:", keysStart + keysLiteral.length);
  if (valuesAt < 0) return [];
  const valuesLiteral = bracketLiteral(html, html.indexOf("[", valuesAt));
  if (!valuesLiteral) return [];

  let keys: unknown;
  let values: unknown;
  try {
    keys = parseJsArray(keysLiteral);
    values = parseJsArray(valuesLiteral);
  } catch {
    return [];
  }
  if (!Array.isArray(keys) || !Array.isArray(values)) return [];
  const col = (name: string): unknown[] => {
    const i = keys.indexOf(name);
    return i >= 0 && Array.isArray(values[i]) ? (values[i] as unknown[]) : [];
  };
  const ids = col("nba_id");
  const names = col("player_name");
  const teams = col("team_name");
  const teamIds = col("tm_id");
  const positions = col("position");
  const seasons = col("season");
  const dpm = col("dpm");
  const oDpm = col("o_dpm");
  const dDpm = col("d_dpm");
  const boxDpm = col("box_dpm");
  const onOffDpm = col("on_off_dpm");
  const minutes = col("x_minutes");
  const finite = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  const byId = new Map<string, DarkoRating>();
  ids.forEach((rawId, i) => {
    const impact = finite(dpm[i]);
    const seasonYear = finite(seasons[i]);
    const name = names[i];
    if (rawId == null || impact == null || seasonYear == null || typeof name !== "string") {
      return;
    }
    const nbaId = String(rawId);
    byId.set(nbaId, {
      playerId: nbaId,
      nbaPlayerId: nbaId,
      playerName: name,
      teamName: typeof teams[i] === "string" && teams[i] ? (teams[i] as string) : undefined,
      teamId: teamIds[i] != null ? String(teamIds[i]) : undefined,
      position:
        typeof positions[i] === "string" && positions[i] ? (positions[i] as string) : undefined,
      season: canonicalSeasonFromStartYear(seasonYear - 1),
      source: "darko",
      impact,
      offensive: finite(oDpm[i]) ?? undefined,
      defensive: finite(dDpm[i]) ?? undefined,
      boxImpact: finite(boxDpm[i]) ?? undefined,
      onOffImpact: finite(onOffDpm[i]) ?? undefined,
      projectedMinutes: finite(minutes[i]) ?? undefined,
      updatedAt,
    });
  });
  return [...byId.values()].sort((a, b) => b.impact - a.impact);
}

export function parseDarkoHtml(html: string): DarkoRating[] {
  const updatedAt = new Date().toISOString();
  const columnar = parseDarkoColumns(html, updatedAt);
  if (columnar.length > 0) return columnar;

  const re =
    /\{nba_id:(\d+),player_name:"([^"]+)",team_name:"([^"]*)",tm_id:(\d+),position:"([^"]*)",season:(\d+),career_game_num:(\d+),dpm:(-?[\d.]+),o_dpm:(-?[\d.]+),d_dpm:(-?[\d.]+),box_dpm:(-?[\d.]+),on_off_dpm:(-?[\d.]+),x_minutes:(-?[\d.]+)/g;

  const byId = new Map<string, DarkoRating>();
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const nbaId = match[1];
    const seasonYear = Number(match[6]);
    // DARKO embeds ending calendar / projection year (e.g. 2026 for 2025-26).
    const season = canonicalSeasonFromStartYear(seasonYear - 1);
    const rating: DarkoRating = {
      playerId: nbaId,
      nbaPlayerId: nbaId,
      playerName: match[2],
      teamName: match[3] || undefined,
      teamId: match[4],
      position: match[5] || undefined,
      season,
      source: "darko",
      impact: Number(match[8]),
      offensive: Number(match[9]),
      defensive: Number(match[10]),
      boxImpact: Number(match[11]),
      onOffImpact: Number(match[12]),
      projectedMinutes: Number(match[13]),
      updatedAt,
    };
    byId.set(nbaId, rating);
  }

  return [...byId.values()].sort((a, b) => b.impact - a.impact);
}

export function clearDarkoCache(): void {
  memoryCache = null;
}
