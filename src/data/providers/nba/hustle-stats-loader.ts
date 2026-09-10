import { sharedGetOrSet, sharedPeek } from "@/data/cache/shared-ttl-cache";
import { hustlePatchFromStatsNbaRow } from "@/data/transformers/hustle-stats";
import { seasonStatsStaleMs, seasonStatsTtlMs } from "./cache-policy";
import { isHustleStatsSeason } from "./season";
import { preferBundledProductDataOnEdge } from "./runtime-policy";
import {
  getResultSet,
  resultSetToObjects,
  statsNbaFetch,
} from "./stats-nba-client";

export type HustlePlayerRow = {
  playerId: string;
  playerName: string;
  teamId?: string;
  patch: ReturnType<typeof hustlePatchFromStatsNbaRow>;
};

function parseRows(
  rows: Array<Record<string, string | number | null>>
): HustlePlayerRow[] {
  return rows
    .filter((row) => row.PLAYER_ID != null)
    .map((row) => ({
      playerId: String(row.PLAYER_ID),
      playerName: String(row.PLAYER_NAME ?? ""),
      teamId: row.TEAM_ID != null ? String(row.TEAM_ID) : undefined,
      patch: hustlePatchFromStatsNbaRow(row),
    }))
    .filter((row) => Object.keys(row.patch).length > 0);
}

async function loadBundledHustleSeason(season: string): Promise<HustlePlayerRow[]> {
  const { getBundledHustleSeason } = await import(
    "@/data/runtime/hustle-overlay-snapshot"
  );
  return getBundledHustleSeason(season).map((row) => ({
    playerId: row.playerId,
    playerName: "",
    teamId: row.teamId,
    patch: row.patch,
  }));
}

async function loadHustleSeasonUncached(
  season: string,
  seasonType = "Regular Season"
): Promise<HustlePlayerRow[]> {
  if (!isHustleStatsSeason(season)) return [];

  const response = await statsNbaFetch(
    "leaguehustlestatsplayer",
    {
      College: "",
      Conference: "",
      Country: "",
      DateFrom: "",
      DateTo: "",
      Division: "",
      DraftPick: "",
      DraftYear: "",
      GameScope: "",
      Height: "",
      LastNGames: 0,
      LeagueID: "00",
      Location: "",
      Month: 0,
      OpponentTeamID: 0,
      Outcome: "",
      PORound: 0,
      PerMode: "Totals",
      PlayerExperience: "",
      PlayerPosition: "",
      Season: season,
      SeasonSegment: "",
      SeasonType: seasonType,
      StarterBench: "",
      TeamID: 0,
      VsConference: "",
      VsDivision: "",
      Weight: "",
    },
    {
      ttlMs: seasonStatsTtlMs(season),
      staleMs: seasonStatsStaleMs(season),
    }
  );
  const set = getResultSet(response);
  return set ? parseRows(resultSetToObjects(set)) : [];
}

export function peekHustleSeason(season: string): HustlePlayerRow[] | null {
  return sharedPeek(`hustle:totals:${season}`);
}

export async function fetchHustleSeason(season: string): Promise<HustlePlayerRow[]> {
  if (!isHustleStatsSeason(season)) return [];

  if (preferBundledProductDataOnEdge()) {
    return loadBundledHustleSeason(season);
  }

  return sharedGetOrSet(
    `hustle:totals:${season}`,
    {
      ttlMs: seasonStatsTtlMs(season),
      staleMs: seasonStatsStaleMs(season),
      tags: ["hustle", `hustle:totals:${season}`],
    },
    async () => {
      const live = await loadHustleSeasonUncached(season).catch(() => []);
      if (live.length) return live;
      return loadBundledHustleSeason(season);
    }
  );
}

/** Warm cache without blocking callers (e.g. board overlay). */
export function warmHustleSeason(season: string): void {
  void fetchHustleSeason(season).catch(() => []);
}
