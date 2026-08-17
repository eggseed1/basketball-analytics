import type { DarkoRating } from "@/data/types";
import { canonicalSeasonFromStartYear } from "@/data/providers/historical/season-range";

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
    signal: options.signal ?? AbortSignal.timeout(8_000),
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

export function parseDarkoHtml(html: string): DarkoRating[] {
  const updatedAt = new Date().toISOString();
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
