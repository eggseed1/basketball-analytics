import { getFilteredPlayerSeasons } from "@/data/queries";
import {
  attachDrblToPlayerSeasons,
  getPlayerCareerTimelineSeasons,
} from "@/data/queries/players";
import { getPlayerSeasonCached } from "@/data/queries/request-cache";
import { resolvePlayerIdentity } from "@/data/identity/player-identity";
import type { PlayerSeason } from "@/data/types";
import { shiftCanonicalSeason } from "@/lib/player-stat-comps";
import { buildPlayerPercentileMetrics } from "@/lib/player-percentile-metrics";
import { mergePlayerSeasonStats } from "@/lib/player-destination";
import {
  brandableTeamKey,
  brandableTeamKeyFromRow,
  isMultiTeamSeasonRow,
} from "@/lib/player-team-context";

export async function loadPlayerPercentileMetrics(
  playerId: string,
  season: string,
  career: PlayerSeason[],
  identityTeamKey?: string | null
) {
  const priorSeason = shiftCanonicalSeason(season, -1);
  const [seasonRaw, peers, priorBoard, timelineCareer] = await Promise.all([
    getPlayerSeasonCached(playerId, season),
    getFilteredPlayerSeasons({
      season,
      minimumGames: 15,
    }).catch(() => [] as PlayerSeason[]),
    getFilteredPlayerSeasons({
      season: priorSeason,
      minimumGames: 15,
    }).catch(() => [] as PlayerSeason[]),
    // Full impact overlays (DRBL for every registry season; DARKO/BRef recent).
    getPlayerCareerTimelineSeasons(playerId).catch(() => [] as PlayerSeason[]),
  ]);

  // Prefer timeline career; fall back to DRBL-attached page career.
  const careerForMetrics =
    timelineCareer.length > 0
      ? timelineCareer
      : await attachDrblToPlayerSeasons(playerId, career);

  const careerSeason =
    careerForMetrics.find(
      (row) =>
        row.season === season &&
        (identityTeamKey
          ? brandableTeamKey(row.teamId) === identityTeamKey ||
            isMultiTeamSeasonRow(row)
          : true)
    ) ?? careerForMetrics.find((row) => row.season === season);
  const identity = await resolvePlayerIdentity(playerId);
  const nbaId = identity.nbaId;
  const peerRow =
    peers.find((row) => row.playerId === playerId) ??
    (nbaId ? peers.find((row) => row.playerId === nbaId) : undefined) ??
    null;
  const seasonStats = mergePlayerSeasonStats(
    seasonRaw,
    careerSeason,
    peerRow
  );
  const teamKey =
    brandableTeamKey(identityTeamKey) ??
    brandableTeamKeyFromRow(seasonStats) ??
    undefined;
  const metrics = buildPlayerPercentileMetrics(
    seasonStats,
    careerForMetrics,
    peers,
    priorBoard,
    playerId
  );

  return { metrics, teamKey };
}
