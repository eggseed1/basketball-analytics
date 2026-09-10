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
import {
  isConstrainedServerRuntime,
  preferBundledProductDataOnEdge,
} from "@/data/providers/nba/runtime-policy";

/** Cap career peer-board fan-out in full mode; always keep selected + prior. */
const MAX_CAREER_PEER_SEASONS = 6;
/** Spread of league seasons (excl. view year) for "Other seasons" comps. */
const MAX_HISTORICAL_COMP_SEASONS = 14;

export type PercentileLoadMode = "fast" | "full";

/**
 * Hero-path enrich: DRBL + bundled BRef/DARKO/RAPTOR only — no stats.nba YoY.
 * Stats / Career islands still run the full shared enricher.
 */
async function enrichCareerForFastHero(
  playerId: string,
  career: PlayerSeason[]
): Promise<PlayerSeason[]> {
  const { withBudget } = await import("@/data/queries/budget");
  const {
    attachDrblToPlayerSeasons,
    attachBrefDarkoRaptorToPlayerSeasons,
    attachHustleToPlayerSeasons,
    mergeOverlaySeasonFields,
  } = await import("@/data/queries/players");
  const { preferBundledProductDataOnEdge } = await import(
    "@/data/providers/nba/runtime-policy"
  );

  // Bundled DRBL is cheap (~300KB) and required for WAR1 / DRBL percentile
  // defaults — always attach it, including on Cloudflare.
  const drblBudget = preferBundledProductDataOnEdge() ? 800 : 1_500;
  const impactBudget = preferBundledProductDataOnEdge() ? 1_200 : 1_500;
  const hustleBudget = preferBundledProductDataOnEdge() ? 800 : 1_200;

  const [withDrbl, withImpact, withHustle] = await Promise.all([
    withBudget(
      attachDrblToPlayerSeasons(playerId, career).catch(() => career),
      drblBudget,
      career
    ).then((r) => r.value),
    withBudget(
      attachBrefDarkoRaptorToPlayerSeasons(playerId, career).catch(
        () => career
      ),
      impactBudget,
      career
    ).then((r) => r.value),
    withBudget(
      attachHustleToPlayerSeasons(playerId, career).catch(() => career),
      hustleBudget,
      career
    ).then((r) => r.value),
  ]);
  return career.map((row, index) => {
    let next = row;
    if (withDrbl[index]) next = mergeOverlaySeasonFields(next, withDrbl[index]!);
    if (withImpact[index]) {
      next = mergeOverlaySeasonFields(next, withImpact[index]!);
    }
    if (withHustle[index]) {
      next = mergeOverlaySeasonFields(next, withHustle[index]!);
    }
    return next;
  });
}

function careerSeasonsForPeerBoards(
  career: PlayerSeason[],
  season: string,
  priorSeason: string,
  mode: PercentileLoadMode
): string[] {
  if (mode === "fast") return [];
  // Cloudflare: never fan out multi-season peer boards on slim edge (CPU 1102).
  if (isConstrainedServerRuntime()) return [];

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

/**
 * Spread of archived league seasons for cross-era comps (not just prior year).
 * Newest-first list → evenly spaced picks so 90s / 00s / 10s / 20s all appear.
 */
function pickSpreadSeasons(
  seasons: string[],
  max: number,
  exclude: Set<string>
): string[] {
  const pool = seasons.filter((s) => s && !exclude.has(s));
  if (pool.length <= max) return pool;
  const out: string[] = [];
  const step = (pool.length - 1) / Math.max(1, max - 1);
  for (let i = 0; i < max; i++) {
    const idx = Math.min(pool.length - 1, Math.round(i * step));
    const s = pool[idx];
    if (s && !out.includes(s)) out.push(s);
  }
  for (const s of pool) {
    if (out.length >= max) break;
    if (!out.includes(s)) out.push(s);
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
     * full — prior + career peer boards + spread archive for cross-era comps.
     */
    mode?: PercentileLoadMode;
    /** Load prior-season peers for YoY comps (full mode default). */
    includePriorBoard?: boolean;
    /** When set, skips a redundant identity resolve on the hot path. */
    nbaId?: string | null;
    espnId?: string | null;
  }
) {
  const constrained = isConstrainedServerRuntime();
  const preferBundled = preferBundledProductDataOnEdge();
  // Slim edge always fast. On CF, default to fast for LCP but honor explicit full.
  const mode = constrained
    ? "fast"
    : (options?.mode ?? (preferBundled ? "fast" : "full"));
  const includePrior =
    !constrained &&
    mode === "full" &&
    options?.includePriorBoard !== false;
  const statsCtx = resolvePlayerStatsSeason(career, season);
  const statsSeason = statsCtx.statsSeason;
  const priorSeason = shiftCanonicalSeason(statsSeason, -1);

  const careerSeasons = careerSeasonsForPeerBoards(
    career,
    statsSeason,
    includePrior ? priorSeason : statsSeason,
    mode
  );

  // Wide archive for "Other seasons" comps — not only the player's career / prior year.
  let historicalCompSeasons: string[] = [];
  if (mode === "full" && !constrained) {
    try {
      const { listBundledBrefSeasons } = await import(
        "@/data/runtime/bref-advanced-snapshot"
      );
      historicalCompSeasons = pickSpreadSeasons(
        listBundledBrefSeasons(),
        MAX_HISTORICAL_COMP_SEASONS,
        new Set([statsSeason, ...careerSeasons].filter(Boolean))
      );
    } catch {
      historicalCompSeasons = [];
    }
  }

  const careerHasSeason = career.some(
    (row) => row.season === statsSeason && row.gamesPlayed > 0
  );

  const enrichCareer =
    mode === "fast"
      ? enrichCareerForFastHero(playerId, career).catch(() => career)
      : enrichPlayerCareerAdvancedCached(playerId, career).catch(() => career);

  // Fast / CF: BRef peer board + DARKO + DRBL/WAR1 + hustle overlay.
  // Historical archive boards skip hustle (coverage is recent-only) to save CPU.
  const loadPeers = async (
    peerSeason: string,
    opts?: { archive?: boolean }
  ): Promise<PlayerSeason[]> => {
    if (mode === "fast" || preferBundled) {
      try {
        const { getBundledBrefPeerBoard } = await import(
          "@/data/runtime/bref-advanced-snapshot"
        );
        const {
          overlayImpactRatingsForPeers,
          overlayDrblRatingsForPeers,
          overlayHustleRatingsForPeers,
        } = await import("@/data/queries/players");
        const bundled = getBundledBrefPeerBoard(peerSeason);
        if (bundled.length >= 100) {
          const withImpact = await overlayImpactRatingsForPeers(
            bundled,
            peerSeason
          );
          const withDrbl = await overlayDrblRatingsForPeers(
            withImpact,
            peerSeason
          );
          if (opts?.archive) {
            return withDrbl.filter((row) => row.gamesPlayed >= 15);
          }
          const withHustle = await overlayHustleRatingsForPeers(
            withDrbl,
            peerSeason
          );
          return withHustle.filter((row) => row.gamesPlayed >= 15);
        }
      } catch {
        /* fall through */
      }
    }
    return getFilteredPlayerSeasonsCached(peerSeason, 15).catch(
      () => [] as PlayerSeason[]
    );
  };

  const [
    seasonRaw,
    peers,
    priorBoard,
    careerForMetrics,
    careerPeerEntries,
    historicalPeerEntries,
    identity,
  ] = await Promise.all([
    careerHasSeason || constrained || (preferBundled && mode === "fast")
      ? Promise.resolve(null)
      : getPlayerSeasonCached(playerId, season, statsSeason),
    loadPeers(statsSeason),
    includePrior
      ? loadPeers(priorSeason)
      : Promise.resolve([] as PlayerSeason[]),
    enrichCareer,
    Promise.all(
      careerSeasons.map(async (s) => {
        const rows = await loadPeers(s);
        return [s, rows] as const;
      })
    ),
    Promise.all(
      historicalCompSeasons.map(async (s) => {
        const rows = await loadPeers(s, { archive: true });
        return [s, rows] as const;
      })
    ),
    options?.nbaId != null && options?.espnId != null
      ? Promise.resolve({ nbaId: options.nbaId, espnId: options.espnId })
      : resolvePlayerIdentityCached(playerId),
  ]);

  const peersBySeason = new Map<string, PlayerSeason[]>([
    ...careerPeerEntries,
    ...historicalPeerEntries,
  ]);
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
  const espnId = options?.espnId ?? identity.espnId ?? null;
  const peerRow =
    peers.find((row) => row.playerId === playerId) ??
    (espnId ? peers.find((row) => row.playerId === espnId) : undefined) ??
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
    peersBySeason,
    { light: mode === "fast" }
  );

  return { metrics, teamKey, mode, ...statsCtx };
}
