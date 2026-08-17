import type { TeamSeasonStats } from "@/data/types/team-season";
import { espnFetchJson } from "@/data/providers/nba/espn-client";
import { espnYearFromCanonicalSeason } from "@/data/providers/nba/season";
import { ESPN_TEAM_META } from "@/data/providers/nba/team-meta";
import {
  categoryMap,
  type EspnStatCategorySchema,
  type EspnTeamStatsRow,
} from "@/data/transformers/espn";
import {
  effectiveFieldGoalPct,
  trueShootingPct,
} from "@/data/providers/nba/compute-advanced";

const SITE_WEB = "https://site.web.api.espn.com";

type ByTeamResponse = {
  teams?: EspnTeamStatsRow[];
  categories?: EspnStatCategorySchema[];
};

function num(map: Map<string, number>, key: string, fallback = 0): number {
  return map.get(key) ?? fallback;
}

function pctToFraction(value: number): number {
  if (value > 1) return value / 100;
  return value;
}

export async function fetchTeamSeasonStats(
  season: string
): Promise<TeamSeasonStats[]> {
  const year = espnYearFromCanonicalSeason(season);
  const url =
    `${SITE_WEB}/apis/common/v3/sports/basketball/nba/statistics/byteam` +
    `?region=us&lang=en&contentorigin=espn&season=${year}&seasontype=2`;
  // Secondary board: hard timeout + single retry budget (no multi-minute hangs).
  const payload = await espnFetchJson<ByTeamResponse>(url, {
    ttlMs: 1000 * 60 * 30,
    retries: 1,
    signal: AbortSignal.timeout(4_500),
  });
  const schema = payload.categories ?? [];

  return (payload.teams ?? []).map((row) => {
    const stats = categoryMap(row.categories, schema);
    const teamId = String(row.team.id);
    const meta = ESPN_TEAM_META[teamId];
    const points = num(stats, "points");
    const fgm = num(stats, "fieldGoalsMade");
    const fga = num(stats, "fieldGoalsAttempted");
    const tpm = num(stats, "threePointFieldGoalsMade");
    const tpa = num(stats, "threePointFieldGoalsAttempted");
    const ftm = num(stats, "freeThrowsMade");
    const fta = num(stats, "freeThrowsAttempted");
    const assists = num(stats, "assists");
    const turnovers = num(stats, "turnovers");
    const ppg = num(stats, "avgPoints");
    const avgDiff = num(stats, "avgPointsDifferential");
    const orbPct = num(stats, "offensiveReboundPct");
    const efg = effectiveFieldGoalPct(fgm, tpm, fga);
    const ts = trueShootingPct(points, fga, fta);

    return {
      season,
      teamId,
      abbreviation: row.team.abbreviation,
      fullName: row.team.displayName,
      conference: meta?.conference ?? "East",
      gamesPlayed: num(stats, "gamesPlayed"),
      ppg,
      oppPpg: Math.round((ppg - avgDiff) * 10) / 10,
      avgDiff,
      rpg: num(stats, "avgRebounds"),
      apg: num(stats, "avgAssists"),
      spg: num(stats, "avgSteals"),
      bpg: num(stats, "avgBlocks"),
      topg: num(stats, "avgTurnovers"),
      fieldGoalPct: pctToFraction(num(stats, "fieldGoalPct")),
      threePointPct: pctToFraction(
        num(stats, "threePointFieldGoalPct", num(stats, "threePointPct"))
      ),
      freeThrowPct: pctToFraction(num(stats, "freeThrowPct")),
      ...(efg != null ? { effectiveFieldGoalPct: efg } : {}),
      ...(ts != null ? { trueShootingPct: ts } : {}),
      assistToTurnover: turnovers > 0 ? assists / turnovers : assists,
      offensiveReboundPct: orbPct > 1 ? orbPct / 100 : orbPct,
      points,
      fieldGoalsMade: fgm,
      fieldGoalsAttempted: fga,
      threePointersMade: tpm,
      threePointersAttempted: tpa,
      freeThrowsMade: ftm,
      freeThrowsAttempted: fta,
      assists,
      turnovers,
    };
  });
}
