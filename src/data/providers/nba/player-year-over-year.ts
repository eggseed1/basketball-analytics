/**
 * Single-player advanced ratings across seasons (one NBA Stats call).
 * Replaces N× league-dash board loads when enriching career ORtg/DRtg/NET.
 */

import { CACHE_TTL_MS, currentCanonicalSeason } from "./cache-policy";
import {
  getResultSet,
  resultSetToObjects,
  statsNbaFetch,
} from "./stats-nba-client";

export type PlayerYearAdvancedRatings = {
  season: string;
  offensiveRating: number;
  defensiveRating: number;
  netRating: number;
  usagePct: number;
  trueShootingPct: number;
  effectiveFieldGoalPct: number;
  /** Advanced possession rates as fractions in [0, 1]. */
  assistPct?: number;
  turnoverPct?: number;
  offensiveReboundPct?: number;
  defensiveReboundPct?: number;
  reboundPct?: number;
  pie?: number;
};

function num(
  row: Record<string, string | number | null>,
  key: string
): number {
  const value = row[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** NBA Advanced sometimes publishes 12.3, sometimes 0.123. */
function pctFrac(
  row: Record<string, string | number | null>,
  key: string
): number | undefined {
  const value = num(row, key);
  if (!(value > 0)) return undefined;
  return value > 1 ? value / 100 : value;
}

const memory = new Map<
  string,
  { freshUntil: number; bySeason: Map<string, PlayerYearAdvancedRatings> }
>();

/**
 * Year-over-year Advanced dashboard for one player.
 * `seasonHint` is required by the endpoint; any valid season works for coverage.
 */
export async function getPlayerYearOverYearAdvanced(
  playerId: string,
  seasonHint?: string
): Promise<Map<string, PlayerYearAdvancedRatings>> {
  const now = Date.now();
  const hit = memory.get(playerId);
  if (hit && hit.freshUntil > now && hit.bySeason.size > 0) {
    return hit.bySeason;
  }

  const season = seasonHint || currentCanonicalSeason();
  try {
    const response = await statsNbaFetch(
      "playerdashboardbyyearoveryear",
      {
        PlayerID: playerId,
        Season: season,
        SeasonType: "Regular Season",
        MeasureType: "Advanced",
        PerMode: "PerGame",
        PlusMinus: "N",
        PaceAdjust: "N",
        Rank: "N",
        LeagueID: "00",
        Outcome: "",
        Location: "",
        Month: 0,
        SeasonSegment: "",
        DateFrom: "",
        DateTo: "",
        OpponentTeamID: 0,
        VsConference: "",
        VsDivision: "",
        GameSegment: "",
        Period: 0,
        ShotClockRange: "",
        LastNGames: 0,
        PORound: 0,
      },
      { ttlMs: CACHE_TTL_MS.career, staleMs: CACHE_TTL_MS.career * 2, retries: 2 }
    );
    const set =
      getResultSet(response, "ByYearPlayerDashboard") ?? getResultSet(response);
    if (!set) return hit?.bySeason ?? new Map();

    const bySeason = new Map<string, PlayerYearAdvancedRatings>();
    for (const row of resultSetToObjects(set)) {
      const seasonId = String(row.GROUP_VALUE ?? "").trim();
      if (!/^\d{4}-\d{2}$/.test(seasonId)) continue;
      const ortg = num(row, "OFF_RATING");
      if (!(ortg > 0)) continue;
      const usg = pctFrac(row, "USG_PCT") ?? 0;
      const ts = pctFrac(row, "TS_PCT") ?? 0;
      const efg = pctFrac(row, "EFG_PCT") ?? 0;
      bySeason.set(seasonId, {
        season: seasonId,
        offensiveRating: ortg,
        defensiveRating: num(row, "DEF_RATING"),
        netRating: num(row, "NET_RATING"),
        usagePct: usg,
        trueShootingPct: ts,
        effectiveFieldGoalPct: efg,
        assistPct: pctFrac(row, "AST_PCT"),
        turnoverPct:
          pctFrac(row, "E_TOV_PCT") ?? pctFrac(row, "TM_TOV_PCT"),
        offensiveReboundPct: pctFrac(row, "OREB_PCT"),
        defensiveReboundPct: pctFrac(row, "DREB_PCT"),
        reboundPct: pctFrac(row, "REB_PCT"),
        pie: pctFrac(row, "PIE"),
      });
    }

    if (bySeason.size > 0) {
      memory.set(playerId, {
        bySeason,
        freshUntil: now + CACHE_TTL_MS.career,
      });
    }
    return bySeason.size > 0 ? bySeason : (hit?.bySeason ?? new Map());
  } catch {
    return hit?.bySeason ?? new Map();
  }
}
