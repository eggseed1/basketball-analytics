import { getDataProvider } from "@/data/providers";
import { NBADataProvider } from "@/data/providers/nba-data-provider";
import { resolveCanonicalTeam } from "@/data/identity/team-map";
import { listDrblSeasons, isDrblSeason } from "@/data/drbl/season-registry";
import type {
  BasketballFilters,
  Player,
  PlayerGame,
  PlayerSeason,
} from "@/data/types";
import { applyPlayerSeasonFilters } from "./filter-utils";
import { overlayDraftYears } from "@/data/providers/nba/draft-history";
import {
  getDarkoRatings,
  getHistoricalPlayerSeasons,
  getRaptorRatings,
} from "./historical";
import { normalizePlayerName } from "@/lib/player-name";
import {
  listCanonicalSeasons,
  startYearFromCanonicalSeason,
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { defaultCanonicalSeasons } from "@/data/providers/nba/season";
import {
  fetchEspnAthleteBio,
  mergePlayerBio,
} from "@/data/providers/nba/athlete-bio";
import {
  getPlayerIdAliasIndex,
  resolveNbaIdForDrbl,
} from "@/data/identity/player-identity";
import { resolvePlayerIdentityCached } from "@/data/identity/player-identity-cache";
import { isPreseasonRosterSeason } from "@/data/providers/nba/espn-roster-client";
import {
  priorSeasonForStats,
  seasonHasPlayedGames,
} from "@/lib/player-board-season";
import { shiftCanonicalSeason } from "@/lib/player-stat-comps";
import {
  fetchBrefAdvancedSeason,
  brefLookupKey,
  normalizePlayerName as normalizeBrefPlayerName,
} from "@/data/providers/nba/bref-scraper";
import {
  brefStaleMs,
  brefTtlMs,
  darkoStaleMs,
  darkoTtlMs,
} from "@/data/providers/nba/cache-policy";
import { fetchDarkoSeason, isDarkoSeasonAvailable } from "@/data/providers/nba/darko-scraper";
import { fetchDrblSeason } from "@/data/providers/nba/drbl-loader";
import { fetchHustleSeason } from "@/data/providers/nba/hustle-stats-loader";
import { isHustleStatsSeason } from "@/data/providers/nba/season";
import { hasHustleStats } from "@/data/transformers/hustle-stats";
import { getPlayerYearOverYearAdvanced } from "@/data/providers/nba/player-year-over-year";
import { ESPN_PLAYER_BOARD_RELIABLE_START_YEAR } from "@/data/diagnostics/provider-meta";
import { withBudgetOrThrow } from "@/data/queries/budget";
import { isProductionApprovedPlayerAlias } from "@/data/providers/impact/player-id-aliases";

/** Max seasons to scrape BRef/DARKO on career enrich (newest first). */
const CAREER_SCRAPE_SEASON_CAP = 30;

/**
 * ESPN athlete season boards are expected from this start year onward
 * (same floor as player-board health). Earlier seasons skip the network.
 */
export const TEAM_ROSTER_BOARD_EARLIEST_START_YEAR =
  ESPN_PLAYER_BOARD_RELIABLE_START_YEAR;

/** Soft budget for live ESPN athlete-board pulls on team destinations. */
export const TEAM_ROSTER_BOARD_BUDGET_MS = 5_000;

export type TeamRosterStatus =
  | "ok"
  | "unsupported"
  | "timeout"
  | "error";

export type TeamRosterResult = {
  players: PlayerSeason[];
  status: TeamRosterStatus;
  /** User-facing honest state (never invents roster rows). */
  warning?: string;
  /** Diagnostic detail. */
  error?: string;
};

export function isTeamRosterBoardSupported(season: string): boolean {
  try {
    return (
      startYearFromCanonicalSeason(season) >=
      TEAM_ROSTER_BOARD_EARLIEST_START_YEAR
    );
  } catch {
    return false;
  }
}

function classifyRosterError(error: unknown): string {
  if (!(error instanceof Error)) return "unknown provider error";
  if (/season_unsupported_before_/i.test(error.message)) {
    return error.message;
  }
  const status = /ESPN request failed \((\d+)\)/.exec(error.message)?.[1];
  if (status) return `ESPN HTTP ${status}`;
  if (/timed out|aborted|timeout_after_/i.test(error.message)) return "timeout";
  return error.message.slice(0, 160);
}

/**
 * Team destination roster uses the ESPN athlete board — same source as
 * getTeamSeasonBoard — not DATA_PROVIDER=local sample rows (slug ids like
 * "okc" never match canonical ESPN "25").
 */
let espnRosterProvider: NBADataProvider | null = null;

function espnPlayerSeasonProvider(): NBADataProvider {
  const active = getDataProvider();
  if (active instanceof NBADataProvider) return active;
  espnRosterProvider ??= new NBADataProvider();
  return espnRosterProvider;
}

function overlayDarko(
  seasons: PlayerSeason[],
  boardSeason: string,
  darko: Awaited<ReturnType<typeof getDarkoRatings>>,
  aliasByEspn: Map<string, { nbaPlayerId: string }>
): PlayerSeason[] {
  if (!darko.length) return seasons;
  const darkoByName = new Map(
    darko.map((row) => [normalizePlayerName(row.playerName), row])
  );
  const darkoByNbaId = new Map(
    darko
      .filter((row) => row.nbaPlayerId && /^\d+$/.test(row.nbaPlayerId))
      .map((row) => [row.nbaPlayerId!, row])
  );
  return seasons.map((row) => {
    const aliasNba = aliasByEspn.get(row.playerId)?.nbaPlayerId;
    const d =
      darkoByName.get(normalizePlayerName(row.playerName)) ??
      darkoByNbaId.get(row.playerId) ??
      (aliasNba ? darkoByNbaId.get(aliasNba) : undefined);
    if (!d || d.season !== boardSeason) return row;
    return {
      ...row,
      darkoDpm: d.impact,
      darkoOff: d.offensive,
      darkoDef: d.defensive,
    };
  });
}

function overlayRaptor(
  seasons: PlayerSeason[],
  boardSeason: string,
  raptor: Awaited<ReturnType<typeof getRaptorRatings>>,
  aliasByEspn: Map<string, { nbaPlayerId: string }>
): PlayerSeason[] {
  if (!raptor.length) return seasons;
  const byKey = new Map(
    raptor.map((row) => [
      `${normalizePlayerName(row.playerName)}:${row.season}`,
      row,
    ])
  );
  const byNbaId = new Map(
    raptor
      .filter((row) => row.nbaPlayerId && /^\d+$/.test(row.nbaPlayerId))
      .map((row) => [row.nbaPlayerId!, row])
  );
  return seasons.map((row) => {
    const aliasNba = aliasByEspn.get(row.playerId)?.nbaPlayerId;
    const l =
      byKey.get(`${normalizePlayerName(row.playerName)}:${boardSeason}`) ??
      byNbaId.get(row.playerId) ??
      (aliasNba ? byNbaId.get(aliasNba) : undefined);
    if (!l) return row;
    return {
      ...row,
      raptor: l.impact,
      oRaptor: l.offensive,
      dRaptor: l.defensive,
      winsAdded: l.winsAdded ?? row.winsAdded,
    };
  });
}

async function loadImpactOverlaysForSeason(
  boardSeason: string
): Promise<{
  darko: Awaited<ReturnType<typeof getDarkoRatings>>;
  raptor: Awaited<ReturnType<typeof getRaptorRatings>>;
}> {
  const {
    getBundledDarkoSeason,
    getBundledRaptorSeason,
  } = await import("@/data/runtime/impact-overlay-snapshot");

  let darko = getBundledDarkoSeason(boardSeason);
  let raptor = getBundledRaptorSeason(boardSeason);

  const { preferBundledProductDataOnEdge } = await import(
    "@/data/providers/nba/runtime-policy"
  );
  if (preferBundledProductDataOnEdge()) {
    return { darko, raptor };
  }

  if (!darko.length) {
    try {
      const { fetchDarkoSeason } = await import(
        "@/data/providers/nba/darko-scraper"
      );
      const scraped = await fetchDarkoSeason(boardSeason).catch(() => []);
      if (scraped.length) {
        darko = scraped.map((row) => ({
          playerId: row.nbaId,
          nbaPlayerId: row.nbaId,
          playerName: row.playerName,
          season: boardSeason,
          source: "darko" as const,
          impact: row.dpm,
          offensive: row.oDpm,
          defensive: row.dDpm,
        }));
      }
    } catch {
      /* bundled empty + live failed */
    }
  }

  if (!raptor.length) {
    raptor = await getRaptorRatings(boardSeason).catch(() => []);
  }

  return { darko, raptor };
}

/** Attach public DARKO + RAPTOR overlays for percentile / explore boards. */
const peerImpactBoardCache = new Map<string, PlayerSeason[]>();

export async function overlayImpactRatingsForPeers(
  seasons: PlayerSeason[],
  boardSeason: string
): Promise<PlayerSeason[]> {
  const key = String(boardSeason ?? "").trim();
  // Process-wide cache: percentile islands rematerialize the same board often.
  if (key && seasons.length >= 100) {
    const cached = peerImpactBoardCache.get(key);
    if (cached) return cached;
  }
  const overlaid = await overlayImpactRatings(seasons, boardSeason);
  if (key && overlaid.length >= 100) {
    peerImpactBoardCache.set(key, overlaid);
  }
  return overlaid;
}

/** Attach sealed DRBL / WAR1 onto a peer board (bundled on CF). */
const peerDrblBoardCache = new Map<string, PlayerSeason[]>();

export async function overlayDrblRatingsForPeers(
  seasons: PlayerSeason[],
  boardSeason: string
): Promise<PlayerSeason[]> {
  if (!seasons.length || !isDrblSeason(boardSeason)) return seasons;
  const key = String(boardSeason ?? "").trim();
  if (key && seasons.length >= 100) {
    const cached = peerDrblBoardCache.get(key);
    if (cached) return cached;
  }
  const drblRows = await fetchDrblSeason(boardSeason).catch(() => []);
  const overlaid = await overlayDrblRows(seasons, drblRows);
  if (key && overlaid.length >= 100) {
    peerDrblBoardCache.set(key, overlaid);
  }
  return overlaid;
}

async function overlayImpactRatings(
  seasons: PlayerSeason[],
  boardSeason: string
): Promise<PlayerSeason[]> {
  if (!seasons.length) return seasons;
  // Slim edge only — paid Workers pull bundled overlays below.
  const { slimEdgeProductEnabled } = await import(
    "@/data/providers/nba/runtime-policy"
  );
  if (slimEdgeProductEnabled()) return seasons;

  const { darko, raptor } = await loadImpactOverlaysForSeason(boardSeason);
  const aliases = await getPlayerIdAliasIndex();
  const aliasByEspn = new Map(
    [...aliases.byEspn.entries()].map(([espnId, alias]) => [
      espnId,
      { nbaPlayerId: alias.nbaPlayerId },
    ])
  );
  return overlayRaptor(
    overlayDarko(seasons, boardSeason, darko, aliasByEspn),
    boardSeason,
    raptor,
    aliasByEspn
  );
}

/** Overlay canonical DRBL fields; missing R1 metrics stay null (never 0). */
async function overlayDrblRows(
  seasons: PlayerSeason[],
  drblRows: Awaited<ReturnType<typeof fetchDrblSeason>>
): Promise<PlayerSeason[]> {
  if (!drblRows.length) return seasons;
  const drblById = new Map(drblRows.map((row) => [row.playerId, row]));
  // Production path: only productionApproved / approved-confidence aliases
  // (UNIQUE_NAME_ONLY excluded). Direct NBA-id board rows still join by id.
  const aliases = await getPlayerIdAliasIndex();
  return seasons.map((row) => {
    const alias = aliases.byEspn.get(row.playerId);
    const aliasNba =
      alias && isProductionApprovedPlayerAlias(alias)
        ? alias.nbaPlayerId
        : null;
    const drbl =
      drblById.get(row.playerId) ??
      (aliasNba && aliasNba !== row.playerId
        ? drblById.get(aliasNba)
        : undefined);
    if (!drbl) return row;
    return {
      ...row,
      drbl100: drbl.drbl100 ?? row.drbl100,
      rawAbilityRate: drbl.rawAbilityRate ?? row.rawAbilityRate,
      drblPossessions:
        drbl.actualPossessions ?? drbl.possessions ?? row.drblPossessions,
      abilityModelVersion:
        (drbl as { abilityModelVersion?: string } | undefined)
          ?.abilityModelVersion ?? row.abilityModelVersion,
      drblRank: drbl.rank ?? row.drblRank,
      drblP: drbl.drblP ?? row.drblP,
      drblLn: drbl.drblLn ?? row.drblLn,
      drblB: drbl.drblB ?? row.drblB,
      drblO: drbl.drblO ?? row.drblO,
      drblD: drbl.drblD ?? row.drblD,
      sdv100: drbl.sdv100 ?? row.sdv100,
      shotMaking100: drbl.shotMaking100 ?? row.shotMaking100,
      epvShootMean: drbl.epvShootMean ?? row.epvShootMean,
      vContMean: drbl.vContMean ?? row.vContMean,
      r1Points:
        drbl.r1Points != null && Number.isFinite(drbl.r1Points)
          ? drbl.r1Points
          : (row.r1Points ?? null),
      r1WinEquivalents:
        drbl.r1WinEquivalents != null && Number.isFinite(drbl.r1WinEquivalents)
          ? drbl.r1WinEquivalents
          : (row.r1WinEquivalents ?? null),
      r1PointValueVersion:
        drbl.r1PointValueVersion ?? row.r1PointValueVersion ?? null,
      r1WinEquivalentVersion:
        drbl.r1WinEquivalentVersion ?? row.r1WinEquivalentVersion ?? null,
      drblWar: drbl.drblWar ?? row.drblWar,
      drblSeasonalImpact: drbl.seasonalImpact ?? row.drblSeasonalImpact,
      drblL: drbl.drblL ?? row.drblL,
      drblMeanLeverage: drbl.meanLeverage ?? row.drblMeanLeverage,
      drblDisagreement: drbl.disagreement ?? row.drblDisagreement,
      drblUncertainty: drbl.uncertainty ?? row.drblUncertainty,
      drblIntervalLo: drbl.intervalLo ?? row.drblIntervalLo,
      drblIntervalHi: drbl.intervalHi ?? row.drblIntervalHi,
    };
  });
}

/** Attach NBA hustle tracking onto a peer board (bundled on CF). */
const peerHustleBoardCache = new Map<string, PlayerSeason[]>();

export async function overlayHustleRatingsForPeers(
  seasons: PlayerSeason[],
  boardSeason: string
): Promise<PlayerSeason[]> {
  if (!seasons.length || !isHustleStatsSeason(boardSeason)) return seasons;
  const key = String(boardSeason ?? "").trim();
  if (key && seasons.length >= 100) {
    const cached = peerHustleBoardCache.get(key);
    if (cached) return cached;
  }
  const overlaid = await overlayHustleRows(seasons, boardSeason);
  if (key && overlaid.length >= 100) {
    peerHustleBoardCache.set(key, overlaid);
  }
  return overlaid;
}

/** Overlay NBA hustle season totals onto board/roster rows (bundled on CF). */
async function overlayHustleRows(
  seasons: PlayerSeason[],
  boardSeason: string
): Promise<PlayerSeason[]> {
  if (!seasons.length || !isHustleStatsSeason(boardSeason)) return seasons;
  const hustleRows = await fetchHustleSeason(boardSeason).catch(() => []);
  if (!hustleRows.length) return seasons;

  const hustleById = new Map(
    hustleRows.map((row) => [row.playerId, row.patch] as const)
  );
  const aliases = await getPlayerIdAliasIndex();

  return seasons.map((row) => {
    if (hasHustleStats(row)) return row;
    const alias = aliases.byEspn.get(row.playerId);
    const aliasNba =
      alias && isProductionApprovedPlayerAlias(alias)
        ? alias.nbaPlayerId
        : null;
    const patch =
      hustleById.get(row.playerId) ??
      (aliasNba && aliasNba !== row.playerId
        ? hustleById.get(aliasNba)
        : undefined);
    if (!patch || !Object.keys(patch).length) return row;
    return { ...row, ...patch };
  });
}

async function loadEspnTeamRoster(
  canonicalTeamId: string,
  season: string,
  filters: Omit<BasketballFilters, "team" | "season">
): Promise<{ boardCount: number; players: PlayerSeason[] }> {
  const { preferBundledProductDataOnEdge } = await import(
    "@/data/providers/nba/runtime-policy"
  );

  async function fromBundledBref(): Promise<{
    boardCount: number;
    players: PlayerSeason[];
  } | null> {
    try {
      const { getBundledBrefPeerBoard } = await import(
        "@/data/runtime/bref-advanced-snapshot"
      );
      const bundled = getBundledBrefPeerBoard(season);
      if (bundled.length < 50) return null;
      let rows = await overlayImpactRatings(bundled, season);
      if (isHustleStatsSeason(season)) {
        rows = await overlayHustleRows(rows, season);
      }
      const players = applyPlayerSeasonFilters(rows, {
        ...filters,
        season,
        team: canonicalTeamId,
      });
      if (!players.length) return null;
      return { boardCount: bundled.length, players };
    } catch {
      return null;
    }
  }

  // Cloudflare: ESPN by-athlete boards hang / empty for older seasons — use
  // the baked BRef peer board (same source as explore players).
  if (preferBundledProductDataOnEdge()) {
    const bundled = await fromBundledBref();
    if (bundled) return bundled;
    return { boardCount: 0, players: [] };
  }

  let seasons = await espnPlayerSeasonProvider().getPlayerSeasons(season);
  seasons = await overlayImpactRatings(seasons, season);
  if (isHustleStatsSeason(season)) {
    seasons = await overlayHustleRows(seasons, season);
  }
  let players = applyPlayerSeasonFilters(seasons, {
    ...filters,
    season,
    team: canonicalTeamId,
  });

  if (players.length === 0) {
    const { fetchEspnTeamRosterPlayers } = await import(
      "@/data/providers/nba/espn-roster-client"
    );
    const roster = await fetchEspnTeamRosterPlayers(canonicalTeamId, season);
    let enriched = await overlayImpactRatings(roster, season);
    if (isHustleStatsSeason(season)) {
      enriched = await overlayHustleRows(enriched, season);
    }
    const filtered = applyPlayerSeasonFilters(enriched, {
      ...filters,
      season,
      team: canonicalTeamId,
    });
    if (filtered.length > 0) {
      return { boardCount: roster.length, players: filtered };
    }

    const bundled = await fromBundledBref();
    if (bundled) return bundled;
  }

  return { boardCount: seasons.length, players };
}


export async function getPlayers(): Promise<Player[]> {
  return getDataProvider().getPlayers();
}

export async function getPlayer(playerId: string): Promise<Player | null> {
  const identity = await resolvePlayerIdentityCached(playerId);
  const statsId = identity.nbaId ?? playerId;
  const nbaLookupId =
    identity.nbaId ?? (/^\d+$/.test(statsId.trim()) ? statsId.trim() : null);

  const [basePrimary, nbaBioEarly] = await Promise.all([
    getDataProvider().getPlayer(statsId).catch(() => null),
    nbaLookupId
      ? loadNbaCommonPlayerBio(nbaLookupId).catch(() => null)
      : Promise.resolve(null),
  ]);
  let base = basePrimary;
  if (!base && statsId !== playerId) {
    base = await getDataProvider().getPlayer(playerId).catch(() => null);
  }

  // Local/sample providers omit retired bios — fill from NBA commonplayerinfo.
  if (!base || !base.draftInfo || !base.college) {
    if (nbaBioEarly) {
      base = mergePlayerBio(base, nbaBioEarly) ?? nbaBioEarly;
    }
  }

  /**
   * ESPN athlete numbers collide with NBA PERSON_IDs (NBA 1718 = Paul Pierce,
   * ESPN 1718 = Fred Jones). Only fetch ESPN bio when:
   * - a production alias gives a true espnId, or
   * - the route is unresolved-as-ESPN and NBA Stats has no player at this id.
   */
  const espnBioId =
    identity.matchMethod === "alias_espn_to_nba" ||
    identity.matchMethod === "alias_nba_to_espn"
      ? identity.espnId
      : !base && identity.espnId
        ? identity.espnId
        : null;

  const bio = espnBioId ? await fetchEspnAthleteBio(espnBioId) : null;
  let merged = mergePlayerBio(base, bio);

  // Prefer draft-history team abbr when the bio draft line lacks one.
  // Skip the league-wide drafthistory table when commonplayerinfo already has
  // a usable draft line (team optional) — that table is a multi-MB cold hit.
  const nbaId = identity.nbaId ?? (base?.id && /^\d+$/.test(base.id) ? base.id : null);
  if (merged && nbaId && base?.id === nbaId) {
    const needsTeam =
      !merged.draftInfo || !/\([A-Z]{2,3}\)/.test(merged.draftInfo);
    const needsDraftLine = !merged.draftInfo;
    if (needsDraftLine || needsTeam) {
      try {
        const { getDraftPickByPlayerId, formatDraftPickDisplay } = await import(
          "@/data/providers/nba/draft-history"
        );
        const pick = (await getDraftPickByPlayerId()).get(nbaId);
        if (pick) {
          merged = {
            ...merged,
            draftInfo:
              needsDraftLine || needsTeam
                ? formatDraftPickDisplay(pick)
                : merged.draftInfo,
            college: merged.college || pick.organization || undefined,
          };
        }
      } catch {
        /* draft history optional */
      }
    }
  }

  return merged;
}

async function loadNbaCommonPlayerBio(nbaPlayerId: string) {
  const { statsNbaFetch, getResultSet, resultSetToObjects } = await import(
    "@/data/providers/nba/stats-nba-client"
  );
  const { transformStatsNbaCommonPlayerInfo } = await import(
    "@/data/transformers/stats-nba"
  );
  const { CACHE_TTL_MS } = await import("@/data/providers/nba/cache-policy");
  const response = await statsNbaFetch(
    "commonplayerinfo",
    { PlayerID: nbaPlayerId },
    { ttlMs: CACHE_TTL_MS.career, retries: 2 }
  );
  const set = getResultSet(response, "CommonPlayerInfo");
  if (!set) return null;
  const [row] = resultSetToObjects(set);
  return row ? transformStatsNbaCommonPlayerInfo(row) : null;
}

export async function getPlayerSeason(
  playerId: string,
  season: string,
  options?: { statsSeason?: string }
): Promise<PlayerSeason | null> {
  const nbaId = await resolveNbaIdForDrbl(playerId);
  const statsId =
    nbaId && nbaId !== playerId ? nbaId : playerId;
  const statsSeason = options?.statsSeason ?? season;

  async function loadSeason(targetSeason: string): Promise<PlayerSeason | null> {
    const primary = await getDataProvider()
      .getPlayerSeason(statsId, targetSeason)
      .catch(() => null);
    if (primary) return primary;
    if (statsId === playerId) return null;
    return getDataProvider().getPlayerSeason(playerId, targetSeason).catch(() => null);
  }

  let row = await loadSeason(statsSeason);

  if (
    statsSeason === season &&
    isPreseasonRosterSeason(season) &&
    !seasonHasPlayedGames(row ? [row] : [])
  ) {
    const prior = priorSeasonForStats(season);
    const priorRow = await loadSeason(prior);
    if (seasonHasPlayedGames(priorRow ? [priorRow] : [])) {
      row = priorRow;
    }
  }

  return (
    await import("@/data/queries/player-roster-overlay.server")
  ).overlayPreseasonRosterOnSeasonRow(playerId, season, row);
}

export async function getPlayerPlayoffCareerSeasons(
  playerId: string
): Promise<PlayerSeason[]> {
  const provider = getDataProvider();
  const fn = (
    provider as {
      getPlayerPlayoffCareerSeasons?: (
        id: string
      ) => Promise<PlayerSeason[]>;
    }
  ).getPlayerPlayoffCareerSeasons;
  if (typeof fn !== "function") return [];
  const nbaId = await resolveNbaIdForDrbl(playerId);
  const statsId = nbaId && nbaId !== playerId ? nbaId : playerId;
  let seasons = await fn.call(provider, statsId);
  if (seasons.length === 0 && statsId !== playerId) {
    seasons = await fn.call(provider, playerId);
  }
  return seasons;
}

export async function getPlayerCareerSeasons(
  playerId: string
): Promise<PlayerSeason[]> {
  const provider = getDataProvider();
  const nbaId = await resolveNbaIdForDrbl(playerId);
  const statsId =
    nbaId && nbaId !== playerId ? nbaId : playerId;
  let seasons =
    typeof provider.getPlayerCareerSeasons === "function"
      ? await provider.getPlayerCareerSeasons(statsId)
      : [];
  if (
    seasons.length === 0 &&
    statsId !== playerId &&
    typeof provider.getPlayerCareerSeasons === "function"
  ) {
    seasons = await provider.getPlayerCareerSeasons(playerId);
  }
  if (seasons.length === 0) {
    // Historical / all-era product fallback — factual counting seasons (no invented DRBL).
    const { getUniverseSeasonsForPlayer } = await import(
      "@/data/history/player-universe"
    );
    const { withPlayerSeasonDefaults } = await import(
      "@/data/transformers/player-season-defaults"
    );
    const hist = getUniverseSeasonsForPlayer(playerId);
    if (hist.length === 0) {
      return (
        await import("@/data/queries/player-roster-overlay.server")
      ).overlayPreseasonRosterOnCareer(playerId, seasons);
    }
    seasons = hist.map((h) => {
      const fga = h.fga ?? 0;
      const fgm = h.fgm ?? 0;
      const threePa = h.threePa ?? 0;
      const threePm = h.threePm ?? 0;
      const fta = h.fta ?? 0;
      const ftm = h.ftm ?? 0;
      const fgPct = fga > 0 ? fgm / fga : 0;
      const tpPct = threePa > 0 ? threePm / threePa : 0;
      const ftPct = fta > 0 ? ftm / fta : 0;
      const multi = h.teamIds.length > 1;
      return withPlayerSeasonDefaults({
        playerId: h.playerId,
        playerName: h.playerName,
        teamId: multi ? "TOT" : h.primaryTeamId,
        teamName: multi ? "Multiple Teams" : h.primaryTeamId,
        providerTeamId: h.primaryTeamId,
        teamIdProvider: "nba",
        nbaTeamId: h.primaryTeamId,
        season: h.season,
        gamesPlayed: h.gp,
        gamesStarted: h.gs ?? 0,
        minutes: h.minutes ?? 0,
        points: h.points ?? 0,
        rebounds: h.rebounds ?? 0,
        assists: h.assists ?? 0,
        steals: h.steals ?? 0,
        blocks: h.blocks ?? 0,
        turnovers: h.turnovers ?? 0,
        fieldGoalsMade: fgm,
        fieldGoalsAttempted: fga,
        threePointersMade: threePm,
        threePointersAttempted: threePa,
        freeThrowsMade: ftm,
        freeThrowsAttempted: fta,
        fieldGoalPct: fgPct,
        threePointPct: tpPct,
        freeThrowPct: ftPct,
        r1Points: null,
        r1WinEquivalents: null,
      });
    });
  }

  seasons = await repairSyntheticCareerPlayerNames(playerId, seasons);

  // Per-season bundled/live attach — not getDarkoRatings(), which is a
  // current-season snapshot and left every historical year blank.
  let enriched = seasons;
  try {
    enriched = await attachBrefDarkoRaptorToPlayerSeasons(playerId, seasons);
    enriched = await attachDrblToPlayerSeasons(playerId, enriched);
  } catch {
    // keep base seasons
  }

  return (
    await import("@/data/queries/player-roster-overlay.server")
  ).overlayPreseasonRosterOnCareer(playerId, enriched);
}

async function repairSyntheticCareerPlayerNames(
  playerId: string,
  seasons: PlayerSeason[]
): Promise<PlayerSeason[]> {
  const { isSyntheticPlayerDisplayName, firstUsablePlayerDisplayName } =
    await import("@/lib/player-display-name");
  if (!seasons.some((row) => isSyntheticPlayerDisplayName(row.playerName))) {
    return seasons;
  }
  const identity = await resolvePlayerIdentityCached(playerId);
  let resolved = firstUsablePlayerDisplayName(identity.displayName);
  if (!resolved) {
    const player = await getPlayer(playerId).catch(() => null);
    resolved = firstUsablePlayerDisplayName(player?.fullName);
  }
  if (!resolved) return seasons;
  return seasons.map((row) =>
    isSyntheticPlayerDisplayName(row.playerName)
      ? { ...row, playerName: resolved }
      : row
  );
}

export async function getPlayerGameLog(
  playerId: string,
  season: string
): Promise<PlayerGame[]> {
  const fromProvider = await getDataProvider().getPlayerGameLog(
    playerId,
    season
  );
  if (fromProvider.length > 0) return fromProvider;

  // Historical product fallback — precomputed player-game rows (no raw scan).
  const { getHistoryPlayerGames } = await import(
    "@/data/history/player-career"
  );
  const rows = getHistoryPlayerGames(playerId, season, { limit: 5000 });
  const { parseBasketballMinutes } = await import(
    "@/lib/parse-basketball-minutes"
  );
  return rows.map((r) => {
    const mins = parseBasketballMinutes(r.minutes);
    return {
      id: `${r.gameId}:${r.playerId}`,
      gameId: r.gameId,
      playerId: r.playerId,
      playerName: r.playerName,
      teamId: r.teamId,
      season: r.season,
      gameDate: r.date,
      opponentTeamId: r.opponentId,
      isHome: r.homeAway === "home",
      startPosition: r.starter ? "F" : undefined,
      minutes: mins,
      points: r.points,
      assists: r.assists,
      rebounds: r.rebounds,
      steals: r.steals,
      blocks: r.blocks,
      turnovers: r.turnovers,
      fieldGoalsMade: r.fgm,
      fieldGoalsAttempted: r.fga,
      threePointersMade: r.threePm,
      threePointersAttempted: r.threePa,
      freeThrowsMade: r.ftm,
      freeThrowsAttempted: r.fta,
      // plusMinus not always in historical box grain — leave typed 0 only when
      // source omitted; UI should not treat this as measured +/-.
      plusMinus: Number.NaN,
    } satisfies PlayerGame;
  });
}

/**
 * Returns player-season rows for a season, with optional filters applied
 * once in the query layer.
 *
 * Historical seasons (1996-97 → precompute end) use the factual player-season
 * registry as the universe — never DRBL / sample subsets.
 */
export async function getPlayersBySeason(
  season: string,
  filters: Omit<BasketballFilters, "season"> = {}
): Promise<PlayerSeason[]> {
  const {
    hasPlayerUniverseSeason,
    historyUniverseToPlayerSeasons,
    leftJoinPlayerUniverse,
  } = await import("@/data/history/player-universe");

  if (hasPlayerUniverseSeason(season)) {
    const universe = historyUniverseToPlayerSeasons(season);
    let overlay: PlayerSeason[] = [];
    try {
      overlay = await getDataProvider().getPlayerSeasons(season);
    } catch {
      overlay = [];
    }
    const merged = leftJoinPlayerUniverse(universe, overlay);
    if (isDrblSeason(season)) {
      const drblRows = await fetchDrblSeason(season).catch(() => []);
      return applyPlayerSeasonFilters(
        await overlayDrblRows(merged, drblRows),
        { ...filters, season }
      );
    }
    return applyPlayerSeasonFilters(merged, { ...filters, season });
  }

  const seasons = await getDataProvider().getPlayerSeasons(season);
  return applyPlayerSeasonFilters(seasons, { ...filters, season });
}

export async function getTeamPlayers(
  teamId: string,
  season: string,
  filters: Omit<BasketballFilters, "team" | "season"> = {}
): Promise<PlayerSeason[]> {
  const result = await getTeamRoster(teamId, season, filters);
  return result.players;
}

/**
 * Diagnosed team roster for destination islands.
 * Pre-modern seasons never hit ESPN athlete boards.
 */
export async function getTeamRoster(
  teamId: string,
  season: string,
  filters: Omit<BasketballFilters, "team" | "season"> = {},
  options?: { budgetMs?: number }
): Promise<TeamRosterResult> {
  if (!isTeamRosterBoardSupported(season)) {
    return {
      players: [],
      status: "unsupported",
      warning: `Historical roster data unavailable for ${season}.`,
      error: `unsupported_before_${TEAM_ROSTER_BOARD_EARLIEST_START_YEAR}`,
    };
  }

  const resolved = resolveCanonicalTeam(teamId);
  const canonicalTeamId =
    resolved.status === "resolved" ? resolved.team.canonicalTeamId : teamId;

  const budgetMs = options?.budgetMs ?? TEAM_ROSTER_BOARD_BUDGET_MS;
  try {
    const loaded = await withBudgetOrThrow(
      loadEspnTeamRoster(canonicalTeamId, season, filters),
      budgetMs,
      `timeout_after_${budgetMs}ms`
    );
    if (loaded.boardCount === 0 && loaded.players.length === 0) {
      return {
        players: [],
        status: "error",
        warning: `Roster data unavailable for ${season} (empty player board).`,
        error: "empty_espn_player_board",
      };
    }
    return { players: loaded.players, status: "ok" };
  } catch (error) {
    const detail = classifyRosterError(error);
    if (detail === "timeout" || /timeout_after_/.test(String(error))) {
      return {
        players: [],
        status: "timeout",
        warning: `Roster data unavailable for ${season} (provider timed out).`,
        error: detail.startsWith("timeout") ? detail : `timeout_after_${budgetMs}ms`,
      };
    }
    return {
      players: [],
      status: "error",
      warning: `Roster data unavailable for ${season} (provider failed).`,
      error: detail,
    };
  }
}

/**
 * General-purpose filtered player-season query used by explore views.
 * Modern seasons prefer ESPN (+ impact overlays) and skip BDL entirely.
 */
export async function getFilteredPlayerSeasons(
  filters: BasketballFilters = {}
): Promise<PlayerSeason[]> {
  const { rows } = await getFilteredPlayerSeasonsDetailed(filters);
  return rows;
}

/**
 * Prefer a season that exists in the bundled BRef peer board (≥100 rows).
 * On Cloudflare, current calendar season (e.g. 2026-27) is often empty —
 * fall back to prior / latest baked board so explore + compare stay usable.
 */
export async function resolveExploreBoardSeason(
  preferred: string
): Promise<string> {
  const preferredKey = String(preferred ?? "").trim();
  if (process.env.VERCEL === "1") return preferredKey;

  try {
    const { getBundledBrefPeerBoard, brefAdvancedSnapshotMeta } = await import(
      "@/data/runtime/bref-advanced-snapshot"
    );
    if (preferredKey && getBundledBrefPeerBoard(preferredKey).length >= 100) {
      return preferredKey;
    }
    const prior = shiftCanonicalSeason(preferredKey, -1);
    if (getBundledBrefPeerBoard(prior).length >= 100) return prior;
    const seasons = [...brefAdvancedSnapshotMeta().seasons].sort((a, b) =>
      b.localeCompare(a)
    );
    for (const season of seasons) {
      if (getBundledBrefPeerBoard(season).length >= 100) return season;
    }
  } catch {
    /* keep preferred */
  }
  return preferredKey;
}

async function loadExploreAllSeasonsBoard(
  filters: BasketballFilters
): Promise<{ rows: PlayerSeason[]; error: unknown | null }> {
  const preferredSeason =
    defaultCanonicalSeasons(1)[0] ??
    canonicalSeasonFromStartYear(currentNbaStartYear());
  const currentSeason = await resolveExploreBoardSeason(preferredSeason);

  const current = await getFilteredPlayerSeasonsDetailed({
    ...filters,
    season: currentSeason,
  });

  const needle = filters.player?.trim();
  if (!needle) {
    return current;
  }

  const seen = new Set(current.rows.map((row) => row.playerId));
  // Also treat same display name as already present (ESPN vs BRef id drift).
  const seenNames = new Set(
    current.rows.map((row) => row.playerName.toLowerCase())
  );
  const extras: PlayerSeason[] = [];

  const keepExtra = (row: PlayerSeason): boolean => {
    const kept = applyPlayerSeasonFilters([row], {
      ...filters,
      season: undefined,
      player: undefined,
      // Named search should still surface the player even under default minutes.
      minimumMinutes: undefined,
    });
    return Boolean(kept[0]);
  };

  // Cloudflare: slim search index + BRef career (never landmark ESPN fan-out).
  if (process.env.VERCEL !== "1") {
    try {
      const { getPlayerSearchIndex } = await import(
        "@/data/runtime/player-search-snapshot"
      );
      const { getBundledBrefCareerForPlayer } = await import(
        "@/data/runtime/bref-advanced-snapshot"
      );
      const q = needle.toLowerCase();
      const hits = getPlayerSearchIndex()
        .filter(
          (row) =>
            row.id.toLowerCase() === q ||
            row.nameLower.includes(q) ||
            row.nameLower.split(/\s+/).some((t) => t.startsWith(q))
        )
        .slice(0, 40);

      for (const hit of hits) {
        if (seen.has(hit.id) || seenNames.has(hit.nameLower)) continue;
        const career = getBundledBrefCareerForPlayer({
          playerId: hit.id,
          playerName: hit.name,
        });
        const latest = career[0];
        if (!latest || !keepExtra(latest)) continue;
        extras.push(latest);
        seen.add(hit.id);
        seenNames.add(hit.nameLower);
      }
    } catch {
      /* fall through empty extras */
    }

    return {
      rows: [...current.rows, ...extras],
      error: current.error,
    };
  }

  const { getMasterPlayerRegistry, searchMasterPlayers } = await import(
    "@/data/history/player-universe"
  );
  getMasterPlayerRegistry();
  const masterHits = searchMasterPlayers(needle, { limit: 40 });

  for (const hit of masterHits) {
    if (seen.has(hit.playerId)) continue;
    const career = await getPlayerCareerSeasons(hit.playerId);
    const latest = [...career].sort((a, b) =>
      b.season.localeCompare(a.season)
    )[0];
    if (!latest || !keepExtra(latest)) continue;
    extras.push(latest);
    seen.add(hit.playerId);
  }

  // Master registry may be empty locally — sample landmark seasons for name hits.
  if (extras.length === 0) {
    const modern = [...listCanonicalSeasons(1996)].reverse();
    const landmarks = modern.filter((_, i) => i > 0 && i % 2 === 1).slice(0, 12);
    const boards = await Promise.all(
      landmarks.map((season) =>
        getPlayersBySeason(season).catch(() => [] as PlayerSeason[])
      )
    );
    const byId = new Map<string, PlayerSeason>();
    const q = needle.toLowerCase();
    for (const rows of boards) {
      for (const row of rows) {
        if (seen.has(row.playerId) || byId.has(row.playerId)) continue;
        const name = row.playerName.toLowerCase();
        if (row.playerId.toLowerCase() !== q && !name.includes(q)) {
          continue;
        }
        const existing = byId.get(row.playerId);
        if (!existing || row.season > existing.season) {
          byId.set(row.playerId, row);
        }
      }
    }
    for (const row of byId.values()) {
      if (!keepExtra(row)) continue;
      extras.push(row);
      seen.add(row.playerId);
    }
  }

  return {
    rows: [...current.rows, ...extras],
    error: current.error,
  };
}

/**
 * Same board load as getFilteredPlayerSeasons, plus the first load error
 * (if any) so diagnostics can distinguish failure from empty/unsupported.
 *
 * Invariant: for seasons with a historical player-season registry, the board
 * universe is that registry (LEFT JOIN overlays). DRBL never defines membership.
 */
async function attachDraftYears(rows: PlayerSeason[]): Promise<PlayerSeason[]> {
  if (!rows.length) return rows;
  try {
    const { getBundledDraftYearMap } = await import(
      "@/data/runtime/draft-year-snapshot"
    );
    const bundled = getBundledDraftYearMap();
    if (bundled.size > 0) {
      return overlayDraftYears(rows, bundled);
    }
  } catch {
    /* fall through */
  }
  // Local / Vercel: live drafthistory is fine; Workers must not hit this path
  // when the bake is empty (Error 1102 risk).
  if (process.env.VERCEL === "1" || process.env.NODE_ENV !== "production") {
    try {
      const { getDraftYearByPlayerId } = await import(
        "@/data/providers/nba/draft-history"
      );
      const live = await getDraftYearByPlayerId();
      return overlayDraftYears(rows, live);
    } catch {
      return rows;
    }
  }
  return rows;
}

async function filterPlayerSeasonsWithDraft(
  rows: PlayerSeason[],
  filters: BasketballFilters
): Promise<PlayerSeason[]> {
  const withDraft = await attachDraftYears(rows);
  return applyPlayerSeasonFilters(withDraft, filters);
}

export async function getFilteredPlayerSeasonsDetailed(
  filters: BasketballFilters = {}
): Promise<{ rows: PlayerSeason[]; error: unknown | null }> {
  // All seasons: current board + career matches for the player name search.
  if (String(filters.season ?? "").trim().toUpperCase() === "ALL") {
    return loadExploreAllSeasonsBoard(filters);
  }

  let seasons: PlayerSeason[] = [];
  let error: unknown | null = null;
  const start = filters.season
    ? (() => {
        try {
          return startYearFromCanonicalSeason(filters.season);
        } catch {
          return null;
        }
      })()
    : null;

  // Prefer bundled BRef peers on slim edge — site.api hangs uncancellably.
  // Paid full-edge still prefers the bundle when present (fast + reliable),
  // then falls through to live ESPN when the season is missing from the snapshot.
  if (filters.season && process.env.VERCEL !== "1") {
    try {
      const { getBundledBrefPeerBoard } = await import(
        "@/data/runtime/bref-advanced-snapshot"
      );
      const bundled = getBundledBrefPeerBoard(filters.season);
      if (bundled.length >= 100) {
        let rows = await overlayImpactRatings(bundled, filters.season);
        if (isDrblSeason(filters.season)) {
          const drblRows = await fetchDrblSeason(filters.season).catch(() => []);
          rows = await overlayDrblRows(rows, drblRows);
        }
        if (isHustleStatsSeason(filters.season)) {
          rows = await overlayHustleRows(rows, filters.season);
        }
        return {
          rows: await filterPlayerSeasonsWithDraft(rows, filters),
          error: null,
        };
      }
    } catch {
      // fall through to live / registry paths
    }
  }

  const {
    hasPlayerUniverseSeason,
    historyUniverseToPlayerSeasons,
    leftJoinPlayerUniverse,
  } = await import("@/data/history/player-universe");

  // ── Historical factual universe (1996-97 → precompute corpus) ──────────
  if (filters.season && hasPlayerUniverseSeason(filters.season)) {
    const universe = historyUniverseToPlayerSeasons(filters.season);
    let overlay: PlayerSeason[] = [];
    try {
      if (
        start != null &&
        start >= TEAM_ROSTER_BOARD_EARLIEST_START_YEAR
      ) {
        overlay = await getDataProvider().getPlayerSeasons(filters.season);
        // Enrichment only — never shrink to ESPN/sample size.
        if (
          overlay.length > 0 &&
          overlay.length < 200 &&
          universe.length >= 200
        ) {
          // Suspiciously small overlay (e.g. local sample) — ignore for membership.
          overlay = [];
        }
      }
    } catch (e) {
      error = e;
      overlay = [];
    }

    seasons = leftJoinPlayerUniverse(universe, overlay);

    seasons = await overlayImpactRatings(seasons, filters.season);

    if (isDrblSeason(filters.season)) {
      const drblRows = await fetchDrblSeason(filters.season).catch(() => []);
      seasons = await overlayDrblRows(seasons, drblRows);
    }
    if (isHustleStatsSeason(filters.season)) {
      seasons = await overlayHustleRows(seasons, filters.season);
    }

    return {
      rows: await filterPlayerSeasonsWithDraft(seasons, filters),
      error: seasons.length ? null : error,
    };
  }

  // Pre-ESPN athlete-board seasons: use NBA Stats league boards when the
  // historical registry is missing (so percentiles / explore still work).
  if (
    start != null &&
    start < TEAM_ROSTER_BOARD_EARLIEST_START_YEAR &&
    filters.season
  ) {
    try {
      seasons = await getDataProvider().getPlayerSeasons(filters.season);
      if (seasons.length > 0) {
        return {
          rows: await filterPlayerSeasonsWithDraft(seasons, filters),
          error: null,
        };
      }
    } catch (e) {
      error = e;
    }
    return {
      rows: [],
      error:
        error ??
        new Error(
          `season_unsupported_before_${TEAM_ROSTER_BOARD_EARLIEST_START_YEAR}`
        ),
    };
  }

  // Prefer bundled BRef when available (all non-Vercel hosts). Live ESPN is
  // still attempted below when the snapshot misses the season.
  if (
    start != null &&
    start >= TEAM_ROSTER_BOARD_EARLIEST_START_YEAR &&
    filters.season &&
    process.env.VERCEL !== "1"
  ) {
    try {
      const { getBundledBrefPeerBoard } = await import(
        "@/data/runtime/bref-advanced-snapshot"
      );
      const bundled = getBundledBrefPeerBoard(filters.season);
      if (bundled.length) {
        seasons = bundled;
      }
    } catch {
      // fall through to live ESPN
    }
  }

  if (
    seasons.length === 0 &&
    start != null &&
    start >= TEAM_ROSTER_BOARD_EARLIEST_START_YEAR &&
    filters.season
  ) {
    try {
      const { withBudget } = await import("@/data/queries/budget");
      const live = await withBudget(
        getDataProvider().getPlayerSeasons(filters.season),
        (await import("@/data/providers/nba/runtime-policy"))
          .longUpstreamBudgetsEnabled()
          ? 25_000
          : 3_500,
        [] as PlayerSeason[]
      );
      seasons = live.value;
    } catch (e) {
      error = e;
      seasons = [];
    }
  }

  // Cloudflare: ESPN/NBA boards often empty — use bundled BRef peers.
  if (seasons.length === 0 && filters.season) {
    try {
      const { getBundledBrefPeerBoard } = await import(
        "@/data/runtime/bref-advanced-snapshot"
      );
      const bundled = getBundledBrefPeerBoard(filters.season);
      if (bundled.length) {
        seasons = bundled;
        error = null;
      }
    } catch {
      // keep prior error
    }
  }

  if (seasons.length === 0 && filters.season) {
    // Only attempt historical enrichment when the season is in the supported window.
    // Pre-2000 already returned above; do not re-hit ESPN via historical service.
    if (
      start != null &&
      start >= TEAM_ROSTER_BOARD_EARLIEST_START_YEAR
    ) {
      try {
        seasons = await getHistoricalPlayerSeasons(filters.season);
        if (seasons.length > 0) error = null;
      } catch (e) {
        if (!error) error = e;
        seasons = [];
      }
    }
  }
  if (
    seasons.length === 0 &&
    start != null &&
    start >= TEAM_ROSTER_BOARD_EARLIEST_START_YEAR
  ) {
    try {
      seasons = await getDataProvider().getPlayerSeasons(filters.season);
      if (seasons.length > 0) error = null;
    } catch (e) {
      if (!error) error = e;
      seasons = [];
    }
  }

  // Canonical DRBL + impact overlays for explore board rows.
  if (seasons.length > 0 && filters.season) {
    seasons = await overlayImpactRatings(seasons, filters.season);
    if (isDrblSeason(filters.season)) {
      const drblRows = await fetchDrblSeason(filters.season).catch(() => []);
      seasons = await overlayDrblRows(seasons, drblRows);
    }
    if (isHustleStatsSeason(filters.season)) {
      seasons = await overlayHustleRows(seasons, filters.season);
    }
  }

  return {
    rows: await filterPlayerSeasonsWithDraft(seasons, filters),
    error,
  };
}

export async function getAvailableSeasons(): Promise<string[]> {
  // Full NBA archive window for filters (1960 → current).
  // DRBL availability is gated separately via getDrblAvailableSeasons /
  // listDrblSeasons — never invent DRBL for unsupported years.
  return [...listCanonicalSeasons()].reverse();
}

/** DRBL-published seasons only (single source: drbl/historical/season-registry). */
export async function getDrblAvailableSeasons(): Promise<string[]> {
  return listDrblSeasons();
}

/**
 * Career rows enriched with DARKO + BRef advanced + DRBL so timeline charts
 * can show impact metrics across seasons — not just counting stats.
 */
export async function getPlayerCareerTimelineSeasons(
  playerId: string
): Promise<PlayerSeason[]> {
  const career = await getPlayerCareerSeasons(playerId);
  if (career.length === 0) return [];

  const uniqueSeasons = [...new Set(career.map((row) => row.season))];
  // Cap expensive DARKO / BRef scrapes — recent seasons matter most.
  const scrapeSeasons = [...uniqueSeasons]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 8);
  // Always overlay every DRBL registry season the player has (precomputed, cheap).
  const drblSeasons = uniqueSeasons.filter((season) => isDrblSeason(season));
  const overlaySeasons = [
    ...new Set([...scrapeSeasons, ...drblSeasons]),
  ];

  const overlays = await Promise.all(
    overlaySeasons.map(async (season) => {
      const scrape = scrapeSeasons.includes(season);
      const [darkoRows, brefRows, drblRows] = await Promise.all([
        scrape
          ? fetchDarkoSeason(season, {
              ttlMs: darkoTtlMs(season),
              staleMs: darkoStaleMs(season),
            }).catch(() => [])
          : Promise.resolve([]),
        scrape
          ? fetchBrefAdvancedSeason(season, {
              ttlMs: brefTtlMs(season),
              staleMs: brefStaleMs(season),
            }).catch(() => [])
          : Promise.resolve([]),
        isDrblSeason(season)
          ? fetchDrblSeason(season).catch(() => [])
          : Promise.resolve([]),
      ]);
      const darkoById = new Map(darkoRows.map((row) => [row.nbaId, row]));
      const brefByKey = new Map(
        brefRows.map((row) => [
          brefLookupKey(row.playerName, row.teamAbbr),
          row,
        ])
      );
      const brefByName = new Map(
        brefRows.map((row) => [normalizeBrefPlayerName(row.playerName), row])
      );
      const drblById = new Map(drblRows.map((row) => [row.playerId, row]));
      return { season, darkoById, brefByKey, brefByName, drblById };
    })
  );

  const bySeason = new Map(overlays.map((o) => [o.season, o]));

  const nbaIdForDrbl = await resolveNbaIdForDrbl(playerId);

  const enriched = await Promise.all(
    career.map(async (row) => {
      const overlay = bySeason.get(row.season);
      if (!overlay) return row;
      const darko =
        overlay.darkoById.get(playerId) ??
        (nbaIdForDrbl ? overlay.darkoById.get(nbaIdForDrbl) : undefined);
      const abbr = (row.teamAbbreviation ?? "").toUpperCase();
      const bref =
        overlay.brefByKey.get(brefLookupKey(row.playerName, abbr)) ??
        overlay.brefByName.get(normalizeBrefPlayerName(row.playerName));
      const drbl =
        overlay.drblById.get(playerId) ??
        (nbaIdForDrbl && nbaIdForDrbl !== playerId
          ? overlay.drblById.get(nbaIdForDrbl)
          : undefined);

      return {
        ...row,
        dpm: darko?.dpm ?? row.dpm,
        oDpm: darko?.oDpm ?? row.oDpm,
        dDpm: darko?.dDpm ?? row.dDpm,
        boxDpm: darko?.boxDpm ?? row.boxDpm,
        onOffDpm: darko?.onOffDpm ?? row.onOffDpm,
        per: bref?.per ?? row.per,
        ows: bref?.ows ?? row.ows,
        dws: bref?.dws ?? row.dws,
        winShares: bref?.winShares ?? row.winShares,
        winSharesPer48: bref?.winSharesPer48 ?? row.winSharesPer48,
        obpm: bref?.obpm ?? row.obpm,
        dbpm: bref?.dbpm ?? row.dbpm,
        bpm: bref?.bpm ?? row.bpm,
        vorp: bref?.vorp ?? row.vorp,
        usagePct: row.usagePct || bref?.usagePct || 0,
        trueShootingPct: row.trueShootingPct || bref?.trueShootingPct || 0,
        drbl100: drbl?.drbl100 ?? row.drbl100,
        rawAbilityRate: drbl?.rawAbilityRate ?? row.rawAbilityRate,
        drblPossessions:
          drbl?.actualPossessions ??
          drbl?.possessions ??
          row.drblPossessions,
        abilityModelVersion:
          (drbl as { abilityModelVersion?: string } | undefined)
            ?.abilityModelVersion ?? row.abilityModelVersion,
        drblRank: drbl?.rank ?? row.drblRank,
        drblP: drbl?.drblP ?? row.drblP,
        drblLn: drbl?.drblLn ?? row.drblLn,
        drblB: drbl?.drblB ?? row.drblB,
        drblO: drbl?.drblO ?? row.drblO,
        drblD: drbl?.drblD ?? row.drblD,
        sdv100: drbl?.sdv100 ?? row.sdv100,
        shotMaking100: drbl?.shotMaking100 ?? row.shotMaking100,
        epvShootMean: drbl?.epvShootMean ?? row.epvShootMean,
        vContMean: drbl?.vContMean ?? row.vContMean,
        r1Points:
          drbl?.r1Points != null && Number.isFinite(drbl.r1Points)
            ? drbl.r1Points
            : (row.r1Points ?? null),
        r1WinEquivalents:
          drbl?.r1WinEquivalents != null &&
          Number.isFinite(drbl.r1WinEquivalents)
            ? drbl.r1WinEquivalents
            : (row.r1WinEquivalents ?? null),
        r1PointValueVersion:
          drbl?.r1PointValueVersion ?? row.r1PointValueVersion ?? null,
        r1WinEquivalentVersion:
          drbl?.r1WinEquivalentVersion ?? row.r1WinEquivalentVersion ?? null,
        drblWar: drbl?.drblWar ?? row.drblWar,
        drblSeasonalImpact: drbl?.seasonalImpact ?? row.drblSeasonalImpact,
        drblL: drbl?.drblL ?? row.drblL,
        drblMeanLeverage: drbl?.meanLeverage ?? row.drblMeanLeverage,
        drblDisagreement: drbl?.disagreement ?? row.drblDisagreement,
        drblUncertainty: drbl?.uncertainty ?? row.drblUncertainty,
        drblIntervalLo: drbl?.intervalLo ?? row.drblIntervalLo,
        drblIntervalHi: drbl?.intervalHi ?? row.drblIntervalHi,
      };
    })
  );

  // Overlay ORtg / DRtg / NET from one year-over-year Advanced call —
  // never N× league-dash boards on the timeline path.
  const yoyId = nbaIdForDrbl || playerId;
  const ratingsBySeason = await getPlayerYearOverYearAdvanced(yoyId).catch(
    () => new Map()
  );

  const withRatings = enriched.map((row) => {
    const rich = ratingsBySeason.get(row.season);
    if (!rich) return row;
    return {
      ...row,
      offensiveRating:
        rich.offensiveRating != null && rich.offensiveRating > 0
          ? rich.offensiveRating
          : row.offensiveRating,
      defensiveRating:
        rich.defensiveRating != null && Number.isFinite(rich.defensiveRating)
          ? rich.defensiveRating
          : row.defensiveRating,
      netRating:
        rich.netRating != null && Number.isFinite(rich.netRating)
          ? rich.netRating
          : row.netRating,
      usagePct: row.usagePct || rich.usagePct,
      trueShootingPct: row.trueShootingPct || rich.trueShootingPct,
      effectiveFieldGoalPct:
        row.effectiveFieldGoalPct || rich.effectiveFieldGoalPct,
      assistPct:
        rich.assistPct != null && rich.assistPct > 0
          ? rich.assistPct
          : row.assistPct,
      turnoverPct:
        rich.turnoverPct != null && rich.turnoverPct > 0
          ? rich.turnoverPct
          : row.turnoverPct,
      offensiveReboundPct:
        rich.offensiveReboundPct != null && rich.offensiveReboundPct > 0
          ? rich.offensiveReboundPct
          : row.offensiveReboundPct,
      defensiveReboundPct:
        rich.defensiveReboundPct != null && rich.defensiveReboundPct > 0
          ? rich.defensiveReboundPct
          : row.defensiveReboundPct,
      reboundPct:
        rich.reboundPct != null && rich.reboundPct > 0
          ? rich.reboundPct
          : row.reboundPct,
      pie: rich.pie != null && rich.pie > 0 ? rich.pie : row.pie,
    };
  });

  return withRatings.sort((a, b) => a.season.localeCompare(b.season));
}

/**
 * Attach sealed DRBL overlay fields onto existing career/board rows for the
 * given player via production-approved identity. Does not recompute models.
 */
export async function attachDrblToPlayerSeasons(
  playerId: string,
  rows: PlayerSeason[]
): Promise<PlayerSeason[]> {
  if (!rows.length) return rows;
  let seasons = [
    ...new Set(rows.map((r) => r.season).filter((s) => isDrblSeason(s))),
  ];
  if (!seasons.length) return rows;

  // CF: cap overlay fan-out (DRBL only exists for recent seasons anyway).
  const { preferBundledProductDataOnEdge } = await import(
    "@/data/providers/nba/runtime-policy"
  );
  if (preferBundledProductDataOnEdge() && seasons.length > 8) {
    seasons = [...seasons].sort((a, b) => b.localeCompare(a)).slice(0, 8);
  }

  const nbaId = await resolveNbaIdForDrbl(playerId);
  const overlays = await Promise.all(
    seasons.map(async (season) => {
      const drblRows = await fetchDrblSeason(season).catch(() => []);
      return [season, new Map(drblRows.map((r) => [r.playerId, r]))] as const;
    })
  );
  const bySeason = new Map(overlays);

  return rows.map((row) => {
    const map = bySeason.get(row.season);
    if (!map) return row;
    const drbl =
      map.get(playerId) ??
      (nbaId && nbaId !== playerId ? map.get(nbaId) : undefined) ??
      map.get(row.playerId);
    if (!drbl) return row;
    return {
      ...row,
      drbl100: drbl.drbl100 ?? row.drbl100,
      rawAbilityRate: drbl.rawAbilityRate ?? row.rawAbilityRate,
      drblPossessions:
        drbl.actualPossessions ?? drbl.possessions ?? row.drblPossessions,
      abilityModelVersion:
        (drbl as { abilityModelVersion?: string } | undefined)
          ?.abilityModelVersion ?? row.abilityModelVersion,
      drblRank: drbl.rank ?? row.drblRank,
      drblP: drbl.drblP ?? row.drblP,
      drblLn: drbl.drblLn ?? row.drblLn,
      drblB: drbl.drblB ?? row.drblB,
      drblO: drbl.drblO ?? row.drblO,
      drblD: drbl.drblD ?? row.drblD,
      sdv100: drbl.sdv100 ?? row.sdv100,
      shotMaking100: drbl.shotMaking100 ?? row.shotMaking100,
      epvShootMean: drbl.epvShootMean ?? row.epvShootMean,
      vContMean: drbl.vContMean ?? row.vContMean,
      r1Points:
        drbl.r1Points != null && Number.isFinite(drbl.r1Points)
          ? drbl.r1Points
          : (row.r1Points ?? null),
      r1WinEquivalents:
        drbl.r1WinEquivalents != null && Number.isFinite(drbl.r1WinEquivalents)
          ? drbl.r1WinEquivalents
          : (row.r1WinEquivalents ?? null),
      r1PointValueVersion:
        drbl.r1PointValueVersion ?? row.r1PointValueVersion ?? null,
      r1WinEquivalentVersion:
        drbl.r1WinEquivalentVersion ?? row.r1WinEquivalentVersion ?? null,
    };
  });
}

/**
 * Attach NBA hustle tracking onto career/board rows via production identity.
 */
export async function attachHustleToPlayerSeasons(
  playerId: string,
  rows: PlayerSeason[]
): Promise<PlayerSeason[]> {
  if (!rows.length) return rows;
  let seasons = [
    ...new Set(rows.map((r) => r.season).filter((s) => isHustleStatsSeason(s))),
  ];
  if (!seasons.length) return rows;

  // CF: long careers (LeBron) fan out ~10 hustle seasons → 1102 risk.
  const { preferBundledProductDataOnEdge } = await import(
    "@/data/providers/nba/runtime-policy"
  );
  if (preferBundledProductDataOnEdge() && seasons.length > 6) {
    seasons = [...seasons].sort((a, b) => b.localeCompare(a)).slice(0, 6);
  }

  const nbaId = await resolveNbaIdForDrbl(playerId);
  const overlays = await Promise.all(
    seasons.map(async (season) => {
      const hustleRows = await fetchHustleSeason(season).catch(() => []);
      return [
        season,
        new Map(hustleRows.map((r) => [r.playerId, r.patch] as const)),
      ] as const;
    })
  );
  const bySeason = new Map(overlays);

  return rows.map((row) => {
    const map = bySeason.get(row.season);
    if (!map) return row;
    const patch =
      map.get(playerId) ??
      (nbaId && nbaId !== playerId ? map.get(nbaId) : undefined) ??
      map.get(row.playerId);
    if (!patch || !Object.keys(patch).length) return row;
    return { ...row, ...patch };
  });
}

/**
 * Attach BRef advanced (PER/BPM/VORP/WS) + per-season DARKO + RAPTOR onto
 * career rows. Shared by Statistics / Career / percentile enrich paths.
 */
export async function attachBrefDarkoRaptorToPlayerSeasons(
  playerId: string,
  rows: PlayerSeason[]
): Promise<PlayerSeason[]> {
  if (!rows.length) return rows;

  const {
    slimEdgeProductEnabled,
    preferBundledProductDataOnEdge,
  } = await import("@/data/providers/nba/runtime-policy");
  const preferBundled =
    slimEdgeProductEnabled() || preferBundledProductDataOnEdge();

  if (preferBundled) {
    const { findBundledBrefPlayer } = await import(
      "@/data/runtime/bref-advanced-snapshot"
    );
    const {
      findBundledDarkoPlayer,
      findBundledRaptorPlayer,
    } = await import("@/data/runtime/impact-overlay-snapshot");
    const nbaId = await resolveNbaIdForDrbl(playerId).catch(() => null);

    return rows.map((row) => {
      let next = row;
      if (
        !(
          (row.per != null && row.per !== 0) ||
          (row.winShares != null && row.winShares !== 0) ||
          (row.vorp != null && row.vorp !== 0)
        )
      ) {
        const bref = findBundledBrefPlayer(
          row.season,
          row.playerName,
          row.teamAbbreviation
        );
        if (bref) {
          next = {
            ...next,
            per: bref.per !== 0 ? bref.per : next.per,
            ows: Number.isFinite(bref.ows) ? bref.ows : next.ows,
            dws: Number.isFinite(bref.dws) ? bref.dws : next.dws,
            winShares: bref.ws !== 0 ? bref.ws : next.winShares,
            winSharesPer48: bref.ws48 !== 0 ? bref.ws48 : next.winSharesPer48,
            obpm: Number.isFinite(bref.obpm) ? bref.obpm : next.obpm,
            dbpm: Number.isFinite(bref.dbpm) ? bref.dbpm : next.dbpm,
            bpm: Number.isFinite(bref.bpm) ? bref.bpm : next.bpm,
            vorp: Number.isFinite(bref.vorp) ? bref.vorp : next.vorp,
            usagePct:
              next.usagePct ||
              (bref.usg > 1 ? bref.usg / 100 : bref.usg) ||
              undefined,
            trueShootingPct:
              next.trueShootingPct ||
              (bref.ts > 1 ? bref.ts / 100 : bref.ts) ||
              undefined,
          };
        }
      }

      const darko = findBundledDarkoPlayer(row.season, {
        nbaId,
        playerId,
        playerName: row.playerName,
      });
      if (darko && Number.isFinite(darko.impact)) {
        const oDpm = darko.offensive;
        const dDpm = darko.defensive;
        next = {
          ...next,
          dpm: darko.impact,
          ...(typeof oDpm === "number" ? { oDpm } : {}),
          ...(typeof dDpm === "number" ? { dDpm } : {}),
          darkoDpm: darko.impact,
          darkoOff: oDpm,
          darkoDef: dDpm,
        };
      }

      const raptor = findBundledRaptorPlayer(row.season, {
        nbaId,
        playerId,
        playerName: row.playerName,
      });
      if (raptor && Number.isFinite(raptor.impact)) {
        next = {
          ...next,
          raptor: raptor.impact,
          oRaptor: raptor.offensive,
          dRaptor: raptor.defensive,
          winsAdded: raptor.winsAdded ?? next.winsAdded,
        };
      }
      return next;
    });
  }

  const uniqueSeasons = [...new Set(rows.map((r) => r.season))];
  const scrapeSeasons = [...uniqueSeasons]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, CAREER_SCRAPE_SEASON_CAP);

  const nbaId = await resolveNbaIdForDrbl(playerId);
  const allowLiveImpact = true;

  const [seasonOverlays, raptorAll, darkoLive] = await Promise.all([
    Promise.all(
      scrapeSeasons.map(async (season) => {
        const [darkoRows, brefRows] = await Promise.all([
          allowLiveImpact && isDarkoSeasonAvailable(season)
            ? fetchDarkoSeason(season, {
                ttlMs: darkoTtlMs(season),
                staleMs: darkoStaleMs(season),
              }).catch(() => [])
            : Promise.resolve([]),
          fetchBrefAdvancedSeason(season, {
            ttlMs: brefTtlMs(season),
            staleMs: brefStaleMs(season),
          }).catch(() => []),
        ]);
        return {
          season,
          darkoById: new Map(darkoRows.map((row) => [row.nbaId, row])),
          brefByKey: new Map(
            brefRows.map((row) => [
              brefLookupKey(row.playerName, row.teamAbbr),
              row,
            ])
          ),
          brefByName: new Map(
            brefRows.map((row) => [
              normalizeBrefPlayerName(row.playerName),
              row,
            ])
          ),
        };
      })
    ),
    getRaptorRatings().catch(() => []),
    getDarkoRatings().catch(() => []),
  ]);

  const bySeason = new Map(seasonOverlays.map((o) => [o.season, o]));
  const raptorByKey = new Map(
    raptorAll.map((row) => [
      `${normalizePlayerName(row.playerName)}:${row.season}`,
      row,
    ])
  );
  const darkoLiveByName = new Map(
    darkoLive.map((row) => [normalizePlayerName(row.playerName), row])
  );

  return rows.map((row) => {
    const overlay = bySeason.get(row.season);
    const darko =
      overlay?.darkoById.get(playerId) ??
      (nbaId ? overlay?.darkoById.get(nbaId) : undefined);
    const abbr = (row.teamAbbreviation ?? "").toUpperCase();
    const bref =
      overlay?.brefByKey.get(brefLookupKey(row.playerName, abbr)) ??
      overlay?.brefByName.get(normalizeBrefPlayerName(row.playerName));
    const raptor = raptorByKey.get(
      `${normalizePlayerName(row.playerName)}:${row.season}`
    );
    const live = darkoLiveByName.get(normalizePlayerName(row.playerName));
    const liveApplies = live != null && live.season === row.season;

    return {
      ...row,
      ...(bref
        ? {
            per: bref.per !== 0 ? bref.per : row.per,
            ows: Number.isFinite(bref.ows) ? bref.ows : row.ows,
            dws: Number.isFinite(bref.dws) ? bref.dws : row.dws,
            winShares:
              bref.winShares !== 0 ? bref.winShares : row.winShares,
            winSharesPer48:
              bref.winSharesPer48 !== 0
                ? bref.winSharesPer48
                : row.winSharesPer48,
            obpm: Number.isFinite(bref.obpm) ? bref.obpm : row.obpm,
            dbpm: Number.isFinite(bref.dbpm) ? bref.dbpm : row.dbpm,
            bpm: Number.isFinite(bref.bpm) ? bref.bpm : row.bpm,
            vorp: Number.isFinite(bref.vorp) ? bref.vorp : row.vorp,
            usagePct: row.usagePct || bref.usagePct || undefined,
            trueShootingPct:
              row.trueShootingPct || bref.trueShootingPct || undefined,
            threePointAttemptRate:
              row.threePointAttemptRate || bref.threePointAttemptRate || 0,
            freeThrowRate: row.freeThrowRate || bref.freeThrowRate || 0,
          }
        : {}),
      ...(darko
        ? {
            dpm: darko.dpm,
            oDpm: darko.oDpm,
            dDpm: darko.dDpm,
            boxDpm: darko.boxDpm,
            onOffDpm: darko.onOffDpm,
            darkoDpm: darko.dpm,
            darkoOff: darko.oDpm,
            darkoDef: darko.dDpm,
          }
        : liveApplies
          ? {
              darkoDpm: live.impact,
              darkoOff: live.offensive,
              darkoDef: live.defensive,
            }
          : {}),
      ...(raptor
        ? {
            raptor: raptor.impact,
            oRaptor: raptor.offensive,
            dRaptor: raptor.defensive,
            winsAdded: raptor.winsAdded ?? row.winsAdded,
          }
        : {}),
    };
  });
}

/**
 * Merge overlay fields onto a career row without letting zero placeholders
 * clobber real advanced / impact values from another source.
 */
export function mergeOverlaySeasonFields(
  base: PlayerSeason,
  overlay: PlayerSeason
): PlayerSeason {
  const ZERO_MISSING = new Set([
    "per",
    "vorp",
    "winShares",
    "winSharesPer48",
    "ows",
    "dws",
    "bpm",
    "obpm",
    "dbpm",
    "offensiveRating",
    "defensiveRating",
    "netRating",
    "usagePct",
    "trueShootingPct",
    "effectiveFieldGoalPct",
    "assistPct",
    "turnoverPct",
    "offensiveReboundPct",
    "defensiveReboundPct",
    "reboundPct",
    "stealPct",
    "blockPct",
    "threePointAttemptRate",
    "freeThrowRate",
    "pie",
    "darkoDpm",
    "darkoOff",
    "darkoDef",
    "dpm",
    "oDpm",
    "dDpm",
    "raptor",
    "oRaptor",
    "dRaptor",
    "winsAdded",
    "drbl100",
    "war1",
    "drblO",
    "drblD",
    "drblP",
    "drblLn",
    "drblB",
  ]);
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (value == null) continue;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) continue;
      const prev = merged[key];
      const prevOk = typeof prev === "number" && Number.isFinite(prev);
      if (
        ZERO_MISSING.has(key) &&
        value === 0 &&
        prevOk &&
        (prev as number) !== 0
      ) {
        continue;
      }
      if (ZERO_MISSING.has(key) && prevOk && (prev as number) === 0 && value !== 0) {
        merged[key] = value;
        continue;
      }
      if (!prevOk || (ZERO_MISSING.has(key) && (prev as number) === 0)) {
        merged[key] = value;
        continue;
      }
      // Prefer overlay when both are non-zero advanced? Prefer base for counting.
      if (!ZERO_MISSING.has(key)) {
        // Counting / identity: keep base unless base missing.
        if (!prevOk) merged[key] = value;
      } else {
        merged[key] = value;
      }
      continue;
    }
    if (merged[key] == null || merged[key] === "") merged[key] = value;
  }
  return merged as unknown as PlayerSeason;
}

/**
 * One shared enricher for Statistics / Career / percentile islands:
 * sealed DRBL overlay + BRef/DARKO/RAPTOR + YoY Advanced (ORtg/DRtg/NET/USG).
 * Prefer request-cache wrapper so Suspense islands share one load.
 */
export async function enrichPlayerCareerAdvanced(
  playerId: string,
  career: PlayerSeason[]
): Promise<PlayerSeason[]> {
  if (!career.length) return career;

  const { withBudget } = await import("@/data/queries/budget");
  const {
    fullEdgeProductEnabled,
    slimEdgeProductEnabled,
    isVercelRuntime,
    preferBundledProductDataOnEdge,
  } = await import("@/data/providers/nba/runtime-policy");
  const fullProduct = isVercelRuntime() || fullEdgeProductEnabled();
  const slim = slimEdgeProductEnabled();
  const preferBundled = preferBundledProductDataOnEdge();

  // Bundled BRef attach is cheap and also fills DARKO/RAPTOR. Never skip it on
  // CF just because PER is already present — that left impact columns blank.
  const skipImpactAttach =
    slim &&
    !preferBundled &&
    career.length > 0 &&
    career.every(
      (row) =>
        ((row.per != null && row.per !== 0) ||
          (row.vorp != null && row.vorp !== 0)) &&
        row.gamesPlayed > 0
    );

  // Overlays touch largely disjoint fields — run in parallel to cut wall time.
  const drblBudget = fullProduct ? 2_500 : 800;
  const hustleBudget = fullProduct ? 2_000 : 800;
  const impactBudget = preferBundled ? 1_500 : fullProduct ? 8_000 : 1_500;

  const [withDrbl, withHustle, withImpactBase] = await Promise.all([
    withBudget(
      attachDrblToPlayerSeasons(playerId, career).catch(() => career),
      drblBudget,
      career
    ).then((r) => r.value),
    withBudget(
      attachHustleToPlayerSeasons(playerId, career).catch(() => career),
      hustleBudget,
      career
    ).then((r) => r.value),
    skipImpactAttach
      ? Promise.resolve(career)
      : withBudget(
          attachBrefDarkoRaptorToPlayerSeasons(playerId, career).catch(
            () => career
          ),
          impactBudget,
          career
        ).then((r) => r.value),
  ]);

  // Field-merge overlays so a later source can't wipe earlier non-zero values
  // with zero-filled ESPN placeholders.
  const withImpact = career.map((row, index) => {
    let next = row;
    if (withDrbl[index]) next = mergeOverlaySeasonFields(next, withDrbl[index]!);
    if (withHustle[index]) {
      next = mergeOverlaySeasonFields(next, withHustle[index]!);
    }
    if (withImpactBase[index]) {
      next = mergeOverlaySeasonFields(next, withImpactBase[index]!);
    }
    return next;
  });

  // Slim edge skips stats.nba YoY (hang risk). Paid + Vercel try it.
  // Cloudflare prefer-bundled: never start YoY — withBudget cannot cancel the
  // stats.nba fetch, and it stacks with Suspense islands into CF 1102.
  if (!fullProduct || preferBundled) return withImpact;

  const identity = await resolvePlayerIdentityCached(playerId).catch(() => null);
  const yoyId = identity?.nbaId || playerId;
  const yoyBudget = preferBundled ? 1_200 : 2_000;
  const yoy = await withBudget(
    getPlayerYearOverYearAdvanced(yoyId).catch(() => new Map()),
    yoyBudget,
    new Map()
  ).then((r) => r.value);
  if (!yoy.size) return withImpact;

  return withImpact.map((row) => {
    const rich = yoy.get(row.season);
    if (!rich) return row;
    return {
      ...row,
      offensiveRating:
        rich.offensiveRating > 0 ? rich.offensiveRating : row.offensiveRating,
      defensiveRating:
        Number.isFinite(rich.defensiveRating) && rich.defensiveRating > 0
          ? rich.defensiveRating
          : row.defensiveRating,
      netRating:
        Number.isFinite(rich.netRating) ? rich.netRating : row.netRating,
      usagePct: rich.usagePct > 0 ? rich.usagePct : row.usagePct,
      trueShootingPct:
        rich.trueShootingPct > 0
          ? rich.trueShootingPct
          : row.trueShootingPct,
      effectiveFieldGoalPct:
        rich.effectiveFieldGoalPct > 0
          ? rich.effectiveFieldGoalPct
          : row.effectiveFieldGoalPct,
      assistPct:
        rich.assistPct != null && rich.assistPct > 0
          ? rich.assistPct
          : row.assistPct,
      turnoverPct:
        rich.turnoverPct != null && rich.turnoverPct > 0
          ? rich.turnoverPct
          : row.turnoverPct,
      offensiveReboundPct:
        rich.offensiveReboundPct != null && rich.offensiveReboundPct > 0
          ? rich.offensiveReboundPct
          : row.offensiveReboundPct,
      defensiveReboundPct:
        rich.defensiveReboundPct != null && rich.defensiveReboundPct > 0
          ? rich.defensiveReboundPct
          : row.defensiveReboundPct,
      reboundPct:
        rich.reboundPct != null && rich.reboundPct > 0
          ? rich.reboundPct
          : row.reboundPct,
      pie: rich.pie != null && rich.pie > 0 ? rich.pie : row.pie,
    };
  });
}

