/**
 * NBA CDN liveData + stats.nba.com download helpers for DRBL Phase A.
 */

const CDN_HEADERS: Record<string, string> = {
  Accept: "application/json, text/plain, */*",
  Origin: "https://www.nba.com",
  Referer: "https://www.nba.com/",
  "User-Agent":
    "Mozilla/5.0 (compatible; BasketballAnalytics-DRBL/0.1; educational)",
};

const STATS_HEADERS: Record<string, string> = {
  ...CDN_HEADERS,
  "x-nba-stats-origin": "stats",
  "x-nba-stats-token": "true",
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(
  url: string,
  headers: Record<string, string>,
  retries = 3
): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      await delay(400 * (attempt + 1));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Fetch failed: ${url}`);
}

export function cdnPlayByPlayUrl(gameId: string): string {
  return `https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_${gameId}.json`;
}

export function cdnBoxScoreUrl(gameId: string): string {
  return `https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${gameId}.json`;
}

export async function downloadCdnPlayByPlay(gameId: string): Promise<unknown> {
  return fetchJson(cdnPlayByPlayUrl(gameId), CDN_HEADERS);
}

export async function downloadCdnBoxScore(gameId: string): Promise<unknown> {
  return fetchJson(cdnBoxScoreUrl(gameId), CDN_HEADERS);
}

/** Fallback PBP via stats.nba.com playbyplayv3. */
export async function downloadStatsPlayByPlayV3(
  gameId: string
): Promise<unknown> {
  const url =
    `https://stats.nba.com/stats/playbyplayv3?GameID=${gameId}` +
    `&StartPeriod=0&EndPeriod=14`;
  return fetchJson(url, STATS_HEADERS);
}

/** Historical / CDN-missing box scores via stats.nba.com boxscoretraditionalv3. */
export async function downloadStatsBoxScoreTraditionalV3(
  gameId: string
): Promise<unknown> {
  const url =
    `https://stats.nba.com/stats/boxscoretraditionalv3?GameID=${gameId}` +
    `&StartPeriod=0&EndPeriod=14`;
  return fetchJson(url, STATS_HEADERS);
}
