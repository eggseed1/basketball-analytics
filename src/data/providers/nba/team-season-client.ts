import type { TeamSeasonStats } from "@/data/types/team-season";
import { listCanonicalTeams } from "@/data/identity/team-map";
import { espnFetchJson } from "@/data/providers/nba/espn-client";
import { espnYearFromCanonicalSeason } from "@/data/providers/nba/season";
import { ESPN_TEAM_META } from "@/data/providers/nba/team-meta";
import type {
  EspnStatCategorySchema,
  EspnTeamStatsRow,
} from "@/data/transformers/espn";
import { completeCategoryMap } from "@/data/providers/nba/espn-stat-integrity";
import {
  effectiveFieldGoalPct,
  trueShootingPct,
} from "@/data/providers/nba/compute-advanced";
import { runtimeTimeoutMs, preferBundledProductDataOnEdge } from "@/data/providers/nba/runtime-policy";
import { getRuntimeTeamBoardPayload } from "@/data/runtime/team-board-snapshot";

const SITE_WEB = "https://site.web.api.espn.com";

type ByTeamResponse = {
  teams?: EspnTeamStatsRow[];
  categories?: EspnStatCategorySchema[];
};

function num(
  map: Map<string, number>,
  key: string,
  fallback = Number.NaN
): number {
  const value = map.get(key);
  return value != null && Number.isFinite(value) ? value : fallback;
}

function finiteOr(...values: Array<number | undefined>): number {
  for (const value of values) {
    if (value != null && Number.isFinite(value)) return value;
  }
  return Number.NaN;
}

function pctToFraction(value: number): number {
  if (!Number.isFinite(value)) return Number.NaN;
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

function boardHasMeasuredGames(rows: TeamSeasonStats[]): boolean {
  return rows.some(
    (row) => Number.isFinite(row.gamesPlayed) && row.gamesPlayed > 0
  );
}

export function mapEspnByTeamPayload(
  season: string,
  payload: ByTeamResponse
): TeamSeasonStats[] {
  const schema = payload.categories ?? [];
  const teams = payload.teams ?? [];
  if (teams.length === 0) return [];

  return teams.map((row) => {
    const stats = completeCategoryMap(row.categories, schema);
    const teamId = String(row.team.id);
    const meta = ESPN_TEAM_META[teamId];
    const gamesPlayed = num(stats, "gamesPlayed");
    const points = num(stats, "points");
    const fgm = num(stats, "fieldGoalsMade");
    const fga = num(stats, "fieldGoalsAttempted");
    const tpm = num(stats, "threePointFieldGoalsMade");
    const tpa = num(stats, "threePointFieldGoalsAttempted");
    const ftm = num(stats, "freeThrowsMade");
    const fta = num(stats, "freeThrowsAttempted");
    const rebounds = num(stats, "totalRebounds", num(stats, "rebounds"));
    const assists = num(stats, "assists");
    const steals = num(stats, "steals");
    const blocks = num(stats, "blocks");
    const turnovers = num(stats, "turnovers");

    const perGame = (averageKey: string, total: number): number =>
      finiteOr(
        num(stats, averageKey),
        Number.isFinite(total) && gamesPlayed > 0
          ? total / gamesPlayed
          : undefined
      );

    const ppg = perGame("avgPoints", points);
    const rpg = perGame("avgRebounds", rebounds);
    const apg = perGame("avgAssists", assists);
    const spg = perGame("avgSteals", steals);
    const bpg = perGame("avgBlocks", blocks);
    const topg = perGame("avgTurnovers", turnovers);
    const avgDiff = num(stats, "avgPointsDifferential");
    const orbPct = num(stats, "offensiveReboundPct");
    const efg = effectiveFieldGoalPct(fgm, tpm, fga);
    const ts = trueShootingPct(points, fga, fta);
    const oppPpg =
      Number.isFinite(ppg) && Number.isFinite(avgDiff)
        ? Math.round((ppg - avgDiff) * 10) / 10
        : Number.NaN;

    const fieldGoalPct = finiteOr(
      pctToFraction(num(stats, "fieldGoalPct")),
      fga > 0 ? fgm / fga : undefined
    );
    const threePointPct = finiteOr(
      pctToFraction(
        num(stats, "threePointFieldGoalPct", num(stats, "threePointPct"))
      ),
      tpa > 0 ? tpm / tpa : undefined
    );
    const freeThrowPct = finiteOr(
      pctToFraction(num(stats, "freeThrowPct")),
      fta > 0 ? ftm / fta : undefined
    );

    return {
      season,
      teamId,
      abbreviation: row.team.abbreviation,
      fullName: row.team.displayName,
      conference: meta?.conference ?? "East",
      gamesPlayed,
      ppg,
      oppPpg,
      avgDiff,
      rpg,
      apg,
      spg,
      bpg,
      topg,
      fieldGoalPct,
      threePointPct,
      freeThrowPct,
      ...(efg != null ? { effectiveFieldGoalPct: efg } : {}),
      ...(ts != null ? { trueShootingPct: ts } : {}),
      assistToTurnover:
        Number.isFinite(assists) && Number.isFinite(turnovers) && turnovers > 0
          ? assists / turnovers
          : Number.NaN,
      offensiveReboundPct: pctToFraction(orbPct),
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

function fromRuntimeSnapshot(season: string): TeamSeasonStats[] | null {
  const payload = getRuntimeTeamBoardPayload(season);
  if (!payload) return null;
  const rows = mapEspnByTeamPayload(season, payload as ByTeamResponse);
  return rows.length ? rows : null;
}

export async function fetchTeamSeasonStats(
  season: string
): Promise<TeamSeasonStats[]> {
  if (preferBundledProductDataOnEdge()) {
    const snap = fromRuntimeSnapshot(season);
    if (snap && boardHasMeasuredGames(snap)) return snap;
  }

  const year = espnYearFromCanonicalSeason(season);
  const url =
    `${SITE_WEB}/apis/common/v3/sports/basketball/nba/statistics/byteam` +
    `?region=us&lang=en&contentorigin=espn&season=${year}&seasontype=2`;

  const timeoutMs = runtimeTimeoutMs(8_000, 2_500);

  let payload: ByTeamResponse | null = null;
  try {
    payload = await espnFetchJson<ByTeamResponse>(url, {
      ttlMs: 1000 * 60 * 30,
      retries: 1,
      timeoutMs,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    payload = null;
  }

  if (payload) {
    const live = mapEspnByTeamPayload(season, payload);
    if (live.length > 0 && boardHasMeasuredGames(live)) {
      return live;
    }
    // Live returned an empty/zero board (common CF timeout stub path) —
    // prefer a measured build-time snapshot when available.
    const snap = fromRuntimeSnapshot(season);
    if (snap && boardHasMeasuredGames(snap)) return snap;
    if (live.length > 0) return live;
  }

  const snap = fromRuntimeSnapshot(season);
  if (snap) return snap;

  // Last resort: paint the 30-team shell so destinations still resolve.
  return preseasonTeamBoard(season);
}
