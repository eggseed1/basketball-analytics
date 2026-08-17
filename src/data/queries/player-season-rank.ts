/**
 * Query wrapper for Rank My Seasons.
 * Loads career once; batches impact + team boards for the selected set.
 * DRBL overlay via approved identity for registry seasons.
 */

import {
  defaultRankSeasons,
  rankPlayerSeasons,
  PLAYER_SEASON_RANK_MAX,
  PLAYER_SEASON_RANK_MIN,
  type PlayerSeasonRanking,
} from "@/analytics/rank-player-seasons";
import type { SeasonImpactSnapshot } from "@/analytics/compare-player-seasons";
import { dedupeCareerSeasons } from "@/analytics/career-resume";
import {
  attachDrblToPlayerSeasons,
  getPlayer,
  getPlayerCareerSeasons,
} from "@/data/queries/players";
import { getPlayerHistoricalImpact } from "@/data/queries/historical-impact";
import { getTeamSeasonStats } from "@/data/queries/team-seasons";
import type { PlayerSeason } from "@/data/types";
import type { TeamSeasonStats } from "@/data/types/team-season";
import { hasValidDrblEstimate } from "@/data/queries/percentiles";
import { isDrblSeason } from "@/data/drbl/season-registry";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
  parseSeasonParam,
} from "@/data/providers/historical/season-range";

function pickSeason(
  career: PlayerSeason[],
  season: string
): PlayerSeason | null {
  const matches = career.filter((r) => r.season === season);
  if (!matches.length) return null;
  return matches.reduce((best, row) =>
    row.gamesPlayed > best.gamesPlayed ? row : best
  );
}

async function impactSnapshot(
  playerId: string,
  season: string,
  playerName: string,
  seasonRow: PlayerSeason | null
): Promise<SeasonImpactSnapshot | null> {
  if (seasonRow && isDrblSeason(season) && hasValidDrblEstimate(seasonRow)) {
    return {
      metricId: "drbl100",
      label: "DRBL/100",
      value: seasonRow.drbl100,
      source: "DRBL season overlay (validated ability)",
    };
  }
  const rows = await getPlayerHistoricalImpact(playerId, season, {
    playerName,
  }).catch(() => []);
  if (!rows.length) return null;
  const darko = rows.find((r) => r.metric === "darko_dpm");
  const lebron = rows.find((r) => r.metric === "lebron");
  const pick = darko ?? lebron ?? rows[0];
  if (!pick || !Number.isFinite(pick.value)) return null;
  return {
    metricId: pick.metric,
    label: pick.metric === "darko_dpm" ? "DARKO DPM" : pick.metric.toUpperCase(),
    value: pick.value,
    source: pick.source,
  };
}

export function parseSeasonListParam(
  raw: string | undefined
): string[] | { error: string } {
  if (!raw?.trim()) return [];
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    try {
      const season = parseSeasonParam(part)!;
      if (!out.includes(season)) out.push(season);
    } catch {
      return { error: `Invalid season "${part}". Use YYYY-YY.` };
    }
  }
  return out;
}

export async function getPlayerSeasonRanking(options: {
  playerId: string;
  seasons?: string[];
}): Promise<{
  ranking: PlayerSeasonRanking | null;
  careerSeasons: string[];
  error: string | null;
}> {
  const [player, careerRaw] = await Promise.all([
    getPlayer(options.playerId).catch(() => null),
    getPlayerCareerSeasons(options.playerId).catch(() => [] as PlayerSeason[]),
  ]);
  const career = dedupeCareerSeasons(careerRaw);
  const careerSeasons = career.map((r) => r.season);
  const name =
    player?.fullName || career[0]?.playerName || options.playerId;
  const nowSeason = canonicalSeasonFromStartYear(currentNbaStartYear());

  let selected = options.seasons?.length
    ? options.seasons
    : defaultRankSeasons(career, { nowSeason });

  if (selected.length < PLAYER_SEASON_RANK_MIN) {
    return {
      ranking: null,
      careerSeasons,
      error: `Need at least ${PLAYER_SEASON_RANK_MIN} career seasons to rank.`,
    };
  }
  if (selected.length > PLAYER_SEASON_RANK_MAX) {
    selected = selected.slice(0, PLAYER_SEASON_RANK_MAX);
  }

  let rows: PlayerSeason[] = [];
  for (const season of selected) {
    const row = pickSeason(career, season);
    if (!row) {
      return {
        ranking: null,
        careerSeasons,
        error: `Missing season row for ${season}.`,
      };
    }
    rows.push(row);
  }

  rows = await attachDrblToPlayerSeasons(options.playerId, rows);

  const uniqueSeasons = [...new Set(selected)];
  const [impactsList, teamBoards] = await Promise.all([
    Promise.all(
      uniqueSeasons.map(async (season) => {
        const seasonRow = rows.find((r) => r.season === season) ?? null;
        const snap = await impactSnapshot(
          options.playerId,
          season,
          name,
          seasonRow
        );
        return [season, snap] as const;
      })
    ),
    Promise.all(
      uniqueSeasons.map(async (season) => {
        const board = await getTeamSeasonStats(season).catch(
          () => [] as TeamSeasonStats[]
        );
        return [season, board] as const;
      })
    ),
  ]);

  const impacts = new Map<string, SeasonImpactSnapshot | null>(impactsList);
  const teams = new Map<
    string,
    Pick<TeamSeasonStats, "avgDiff" | "abbreviation"> | null
  >();
  for (const [season, board] of teamBoards) {
    const row = rows.find((r) => r.season === season);
    const team =
      row != null
        ? board.find((t) => t.teamId === row.teamId) ?? null
        : null;
    teams.set(season, team);
  }

  const ranking = rankPlayerSeasons({
    playerId: options.playerId,
    playerName: name,
    seasons: rows,
    impacts,
    teams,
    nowSeason,
  });

  return {
    ranking: ranking.error ? null : ranking,
    careerSeasons,
    error: ranking.error,
  };
}
