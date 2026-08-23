import type { TeamSeasonStats } from "@/data/types/team-season";
import { listCanonicalTeams } from "@/data/identity/team-map";
import { espnFetchJson } from "@/data/providers/nba/espn-client";
import { isPreseasonRosterSeason } from "@/data/providers/nba/espn-roster-client";
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

function preseasonTeamBoard(season: string): TeamSeasonStats[] {
  return listCanonicalTeams().map((team) => {
    const meta = ESPN_TEAM_META[team.canonicalTeamId];
    return {
      season,
      teamId: team.canonicalTeamId,
      abbreviation: team.abbr,
      fullName: team.displayName,
      conference: meta?.conference ?? "East",
      gamesPlayed: 0,
      ppg: 0,
      oppPpg: 0,
      avgDiff: 0,
      rpg: 0,
      apg: 0,
      spg: 0,
      bpg: 0,
      topg: 0,
      fieldGoalPct: 0,
      threePointPct: 0,
      freeThrowPct: 0,
      assistToTurnover: 0,
      offensiveReboundPct: 0,
      points: 0,
      fieldGoalsMade: 0,
      fieldGoalsAttempted: 0,
      threePointersMade: 0,
      threePointersAttempted: 0,
      freeThrowsMade: 0,
      freeThrowsAttempted: 0,
      assists: 0,
      turnovers: 0,
    };
  });
}

export async function fetchTeamSeasonStats(
  season: string
): Promise<TeamSeasonStats[]> {
  const year = espnYearFromCanonicalSeason(season);
  const url =
    `${SITE_WEB}/apis/common/v3/sports/basketball/nba/statistics/byteam` +
    `?region=us&lang=en&contentorigin=espn&season=${year}&seasontype=2`;

  let payload: ByTeamResponse;
  try {
    payload = await espnFetchJson<ByTeamResponse>(url, {
      ttlMs: 1000 * 60 * 30,
      retries: 1,
      signal: AbortSignal.timeout(4_500),
    });
  } catch {
    if (isPreseasonRosterSeason(season)) {
      return preseasonTeamBoard(season);
    }
    throw new Error(`ESPN by-team stats unavailable for ${season}`);
  }

  const schema = payload.categories ?? [];
  const teams = payload.teams ?? [];

  if (teams.length === 0 && isPreseasonRosterSeason(season)) {
    return preseasonTeamBoard(season);
  }

  return teams.map((row) => {
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
