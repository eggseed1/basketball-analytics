/**
 * Query wrapper for same-player season comparison.
 * Loads career once; joins season-true impact + team board without N+1 career fetches.
 * DRBL overlay via approved identity when registry seasons are selected.
 */

import { comparePlayerSeasons } from "@/analytics/compare-player-seasons";
import type {
  PlayerSeasonComparison,
  SeasonImpactSnapshot,
} from "@/analytics/compare-player-seasons";
import {
  attachDrblToPlayerSeasons,
  getPlayer,
  getPlayerCareerSeasons,
  getPlayerHistoricalImpact,
  getTeamSeasonStats,
} from "@/data/queries";
import { dedupeCareerSeasons } from "@/analytics/career-resume";
import type { PlayerSeason } from "@/data/types";
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

export async function getPlayerSeasonComparison(options: {
  playerId: string;
  seasonA: string;
  seasonB: string;
}): Promise<{
  comparison: PlayerSeasonComparison | null;
  careerSeasons: string[];
  error: string | null;
}> {
  let seasonA: string;
  let seasonB: string;
  try {
    seasonA = parseSeasonParam(options.seasonA)!;
    seasonB = parseSeasonParam(options.seasonB)!;
  } catch {
    return {
      comparison: null,
      careerSeasons: [],
      error: "Invalid season. Use YYYY-YY (e.g. 2012-13).",
    };
  }

  if (seasonA === seasonB) {
    return {
      comparison: null,
      careerSeasons: [],
      error: "Pick two different seasons.",
    };
  }

  const [player, careerRaw] = await Promise.all([
    getPlayer(options.playerId).catch(() => null),
    getPlayerCareerSeasons(options.playerId).catch(() => [] as PlayerSeason[]),
  ]);

  const career = dedupeCareerSeasons(careerRaw);
  const careerSeasons = career.map((r) => r.season);
  const name =
    player?.fullName ||
    career[0]?.playerName ||
    options.playerId;

  let a = pickSeason(career, seasonA);
  let b = pickSeason(career, seasonB);
  if (!a || !b) {
    return {
      comparison: null,
      careerSeasons,
      error: `Missing season row for ${!a ? seasonA : seasonB}.`,
    };
  }

  const [overlaid] = await Promise.all([
    attachDrblToPlayerSeasons(options.playerId, [a, b]),
  ]);
  a = overlaid.find((r) => r.season === seasonA) ?? a;
  b = overlaid.find((r) => r.season === seasonB) ?? b;

  const [impactA, impactB, teamBoardA, teamBoardB] = await Promise.all([
    impactSnapshot(options.playerId, seasonA, name, a),
    impactSnapshot(options.playerId, seasonB, name, b),
    getTeamSeasonStats(seasonA).catch(() => [] as Awaited<ReturnType<typeof getTeamSeasonStats>>),
    getTeamSeasonStats(seasonB).catch(() => [] as Awaited<ReturnType<typeof getTeamSeasonStats>>),
  ]);

  const teamA =
    teamBoardA.find((t) => t.teamId === a!.teamId) ?? null;
  const teamB =
    teamBoardB.find((t) => t.teamId === b!.teamId) ?? null;

  const comparison = comparePlayerSeasons({
    playerId: options.playerId,
    playerName: name,
    seasonA: a!,
    seasonB: b!,
    impactA,
    impactB,
    teamA,
    teamB,
    nowSeason: canonicalSeasonFromStartYear(currentNbaStartYear()),
  });

  return { comparison, careerSeasons, error: null };
}
