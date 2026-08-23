import {
  getFilteredPlayerSeasonsCached,
  getPlayerSeasonCached,
  enrichPlayerCareerAdvancedCached,
  resolvePlayerIdentityCached,
} from "@/data/queries/request-cache";
import type { PlayerSeason } from "@/data/types";
import { shiftCanonicalSeason } from "@/lib/player-stat-comps";
import { resolvePlayerStatsSeason } from "@/lib/player-board-season";
import { buildPlayerPercentileMetrics } from "@/lib/player-percentile-metrics";
import { mergePlayerSeasonStats } from "@/lib/player-destination";
import {
  brandableTeamKey,
  brandableTeamKeyFromRow,
  isMultiTeamSeasonRow,
} from "@/lib/player-team-context";

/** Cap career peer-board fan-out in full mode; always keep selected + prior. */
const MAX_CAREER_PEER_SEASONS = 3;

export type PercentileLoadMode = "fast" | "full";

function careerSeasonsForPeerBoards(
  career: PlayerSeason[],
  season: string,
  priorSeason: string,
  mode: PercentileLoadMode
): string[] {
  if (mode === "fast") return [];

  const all = [
    ...new Set(
      career
        .map((r) => r.season)
        .filter((s): s is string => Boolean(s && s.trim()))
    ),
  ].sort((a, b) => b.localeCompare(a));

  const must = new Set([season, priorSeason].filter(Boolean));
  const out: string[] = [];
  for (const s of all) {
    if (must.has(s) || out.length < MAX_CAREER_PEER_SEASONS) {
      if (!out.includes(s)) out.push(s);
    }
  }
  for (const s of must) {
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

export async function loadPlayerPercentileMetrics(
  playerId: string,
  season: string,
  career: PlayerSeason[],
  identityTeamKey?: string | null,
  options?: {
    /**
     * fast — selected-season board only (hero LCP).
     * full — prior + capped career peer boards for sparkline accuracy.
     */
    mode?: PercentileLoadMode;
    /** Load prior-season peers for YoY comps (full mode default). */
    includePriorBoard?: boolean;
    /** When set, skips a redundant identity resolve on the hot path. */
    nbaId?: string | null;
  }
) {
  const mode = options?.mode ?? "full";
  const includePrior =
    mode === "full" && options?.includePriorBoard !== false;
  const statsCtx = resolvePlayerStatsSeason(career, season);
  const statsSeason = statsCtx.statsSeason;
  const priorSeason = shiftCanonicalSeason(statsSeason, -1);

  // Critical path: selected + (full) prior/career boards for charts.
  // DRBL + YoY share request cache with Statistics / Career islands.
  const careerSeasons = careerSeasonsForPeerBoards(
    career,
    statsSeason,
    includePrior ? priorSeason : statsSeason,
    mode
  );

  const careerHasSeason = career.some(
    (row) => row.season === statsSeason && row.gamesPlayed > 0
  );

  const [seasonRaw, peers, priorBoard, careerForMetrics, careerPeerEntries, identity] =
    await Promise.all([
      careerHasSeason
        ? Promise.resolve(null)
        : getPlayerSeasonCached(playerId, season, statsSeason),
      getFilteredPlayerSeasonsCached(statsSeason, 15).catch(
        () => [] as PlayerSeason[]
      ),
      includePrior
        ? getFilteredPlayerSeasonsCached(priorSeason, 15).catch(
            () => [] as PlayerSeason[]
          )
        : Promise.resolve([] as PlayerSeason[]),
      enrichPlayerCareerAdvancedCached(playerId, career).catch(() => career),
      Promise.all(
        careerSeasons.map(async (s) => {
          const rows = await getFilteredPlayerSeasonsCached(s, 15).catch(
            () => [] as PlayerSeason[]
          );
          return [s, rows] as const;
        })
      ),
      options?.nbaId != null
        ? Promise.resolve({ nbaId: options.nbaId })
        : resolvePlayerIdentityCached(playerId),
    ]);

  const peersBySeason = new Map<string, PlayerSeason[]>(careerPeerEntries);
  if (peers.length) peersBySeason.set(statsSeason, peers);
  if (priorBoard.length) peersBySeason.set(priorSeason, priorBoard);

  const careerSeason =
    careerForMetrics.find(
      (row) =>
        row.season === statsSeason &&
        (identityTeamKey
          ? brandableTeamKey(row.teamId) === identityTeamKey ||
            isMultiTeamSeasonRow(row)
          : true)
    ) ?? careerForMetrics.find((row) => row.season === statsSeason);
  const nbaId = options?.nbaId ?? identity.nbaId;
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
    playerId,
    peersBySeason
  );

  return { metrics, teamKey, mode, ...statsCtx };
}
