/**
 * Fetch + normalize stats.nba.com playerawards for identity badges.
 */

import { CACHE_TTL_MS } from "@/data/providers/nba/cache-policy";
import {
  getResultSet,
  resultSetToObjects,
  statsNbaFetch,
} from "@/data/providers/nba/stats-nba-client";
import {
  matchAwardDefinition,
  type AwardDefinition,
} from "@/content/awards/catalog";

export type RawPlayerAward = {
  personId: string;
  description: string;
  season: string | null;
  team: string | null;
  allNbaTeamNumber: string | null;
};

export type PlayerAccoladeBadge = {
  award: AwardDefinition;
  count: number;
  seasons: string[];
};

export async function fetchPlayerAwardsRaw(
  nbaPlayerId: string
): Promise<RawPlayerAward[]> {
  const response = await statsNbaFetch(
    "playerawards",
    { PlayerID: nbaPlayerId },
    {
      ttlMs: CACHE_TTL_MS.historicalSeasonStats,
      staleMs: CACHE_TTL_MS.brefHistorical,
      retries: 2,
    }
  );
  const set = getResultSet(response, "PlayerAwards");
  if (!set) return [];
  return resultSetToObjects(set).map((row) => ({
    personId: String(row.PERSON_ID ?? nbaPlayerId),
    description: String(row.DESCRIPTION ?? ""),
    season: row.SEASON != null ? String(row.SEASON) : null,
    team: row.TEAM != null ? String(row.TEAM) : null,
    allNbaTeamNumber:
      row.ALL_NBA_TEAM_NUMBER != null
        ? String(row.ALL_NBA_TEAM_NUMBER)
        : null,
  }));
}

/** Collapse raw awards into card badges (count + season list). */
export function summarizePlayerAccolades(
  rows: RawPlayerAward[]
): PlayerAccoladeBadge[] {
  const byId = new Map<
    string,
    { award: AwardDefinition; seasons: string[] }
  >();

  for (const row of rows) {
    const award = matchAwardDefinition(row.description);
    if (!award) continue;
    const entry = byId.get(award.id) ?? { award, seasons: [] };
    if (row.season && !entry.seasons.includes(row.season)) {
      entry.seasons.push(row.season);
    } else if (!row.season && entry.seasons.length === 0) {
      // HOF etc. may lack a season string — still count once.
      entry.seasons.push("inducted");
    }
    byId.set(award.id, entry);
  }

  return [...byId.values()]
    .map(({ award, seasons }) => ({
      award,
      count: seasons.length,
      seasons: [...seasons].sort((a, b) => a.localeCompare(b)),
    }))
    .filter((b) => b.count > 0)
    .sort((a, b) => a.award.sort - b.award.sort);
}
