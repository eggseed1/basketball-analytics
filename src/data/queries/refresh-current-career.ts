import "server-only";

import { espnFetchJson } from "@/data/providers/nba/espn-client";
import { transformCompleteEspnAthleteCareerStats } from "@/data/providers/nba/espn-stat-integrity";
import type { EspnAthleteCareerStatsResponse } from "@/data/transformers/espn-career";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import type { PlayerSeason } from "@/data/types";
import { preferFreshCurrentCareerRows } from "@/data/queries/fresh-current-career";

const LIVE_CAREER_TTL_MS = 15 * 60 * 1000;

/**
 * An individual ESPN athlete request is much cheaper than crawling the
 * league-wide player board from Cloudflare. Only use its *current-season*
 * counting rows; the baked BRef source remains season-true history.
 * Failed/lagging ESPN responses never reduce a player's GP.
 */
export async function refreshCurrentCareerFromEspn(
  rows: PlayerSeason[],
  espnId: string | null | undefined,
  fallbackName?: string | null
): Promise<PlayerSeason[]> {
  if (!espnId || !/^\d+$/.test(espnId)) return rows;
  const season = canonicalSeasonFromStartYear(currentNbaStartYear());
  try {
    const payload = await espnFetchJson<EspnAthleteCareerStatsResponse>(
      `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${encodeURIComponent(espnId)}/stats`,
      { ttlMs: LIVE_CAREER_TTL_MS, retries: 1, timeoutMs: 2_500 }
    );
    const fresh = transformCompleteEspnAthleteCareerStats(
      espnId,
      fallbackName || rows[0]?.playerName || espnId,
      payload
    );
    return preferFreshCurrentCareerRows(rows, fresh, season);
  } catch {
    return rows;
  }
}
