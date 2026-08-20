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
import {
  getDraftYearByPlayerId,
  overlayDraftYears,
} from "@/data/providers/nba/draft-history";
import {
  getDarkoRatings,
  getHistoricalPlayerSeasons,
  getLebronRatings,
} from "./historical";
import { normalizePlayerName } from "@/lib/player-name";
import {
  listCanonicalSeasons,
  startYearFromCanonicalSeason,
} from "@/data/providers/historical/season-range";
import {
  fetchEspnAthleteBio,
  mergePlayerBio,
} from "@/data/providers/nba/athlete-bio";
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
import { fetchDarkoSeason } from "@/data/providers/nba/darko-scraper";
import { fetchDrblSeason } from "@/data/providers/nba/drbl-loader";
import { ESPN_PLAYER_BOARD_RELIABLE_START_YEAR } from "@/data/diagnostics/provider-meta";
import { withBudgetOrThrow } from "@/data/queries/budget";
import {
  getPlayerIdAliasIndex,
  resolveNbaIdForDrbl,
} from "@/data/identity/player-identity";
import { isProductionApprovedPlayerAlias } from "@/data/providers/impact/player-id-aliases";

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
 * Team destination roster uses the ESPN athlete board - same source as
 * getTeamSeasonBoard - not DATA_PROVIDER=local sample rows (slug ids like
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
  darko: Awaited<ReturnType<typeof getDarkoRatings>>
): PlayerSeason[] {
  if (!darko.length) return seasons;
  const darkoByName = new Map(
    darko.map((row) => [normalizePlayerName(row.playerName), row])
  );
  return seasons.map((row) => {
    const d = darkoByName.get(normalizePlayerName(row.playerName));
    if (!d || d.season !== boardSeason) return row;
    return {
      ...row,
      darkoDpm: d.impact,
      darkoOff: d.offensive,
      darkoDef: d.defensive,
    };
  });
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

async function loadEspnTeamRoster(
  canonicalTeamId: string,
  season: string,
  filters: Omit<BasketballFilters, "team" | "season">
): Promise<{ boardCount: number; players: PlayerSeason[] }> {
  let seasons = await espnPlayerSeasonProvider().getPlayerSeasons(season);
  const darko = await getDarkoRatings().catch(() => []);
  seasons = overlayDarko(seasons, season, darko);
  // Canonical ESPN team id only - do not expand BDL ids (ESPN 21 = PHX, BDL 21 = OKC).
  const players = applyPlayerSeasonFilters(seasons, {
    ...filters,
    season,
    team: canonicalTeamId,
  }).filter((row) => row.teamId === canonicalTeamId);
  return { boardCount: seasons.length, players };
}


export async function getPlayers(): Promise<Player[]> {
  return getDataProvider().getPlayers();
}

export async function getPlayer(playerId: string): Promise<Player | null> {
  const nbaId = await resolveNbaIdForDrbl(playerId);
  const statsId =
    nbaId && nbaId !== playerId ? nbaId : playerId;
  const [basePrimary, bio] = await Promise.all([
    getDataProvider().getPlayer(statsId).catch(() => null),
    fetchEspnAthleteBio(playerId),
  ]);
  let base = basePrimary;
  if (!base && statsId !== playerId) {
    base = await getDataProvider().getPlayer(playerId).catch(() => null);
  }
  return mergePlayerBio(base, bio);
}

export async function getPlayerSeason(
  playerId: string,
  season: string
): Promise<PlayerSeason | null> {
  const nbaId = await resolveNbaIdForDrbl(playerId);
  const statsId =
    nbaId && nbaId !== playerId ? nbaId : playerId;
  const primary = await getDataProvider()
    .getPlayerSeason(statsId, season)
    .catch(() => null);
  if (primary) return primary;
  if (statsId !== playerId) {
    return getDataProvider()
      .getPlayerSeason(playerId, season)
      .catch(() => null);
  }
  return null;
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
  if (seasons.length === 0) return seasons;

  try {
    const darko = await getDarkoRatings().catch(() => []);
    const lebronSeasons = [...new Set(seasons.map((s) => s.season))];
    const lebronRows = (
      await Promise.all(
        lebronSeasons.map((season) =>
          getLebronRatings(season).catch(() => [])
        )
      )
    ).flat();

    const darkoByName = new Map(
      darko.map((row) => [normalizePlayerName(row.playerName), row])
    );
    const lebronByKey = new Map(
      lebronRows.map((row) => [
        `${normalizePlayerName(row.playerName)}:${row.season}`,
        row,
      ])
    );

    return seasons.map((row) => {
      const d = darkoByName.get(normalizePlayerName(row.playerName));
      // Live DARKO is a current-season snapshot - never stamp it onto other years.
      const darkoApplies = d != null && d.season === row.season;
      const l = lebronByKey.get(
        `${normalizePlayerName(row.playerName)}:${row.season}`
      );
      return {
        ...row,
        darkoDpm: darkoApplies ? d.impact : undefined,
        darkoOff: darkoApplies ? d.offensive : undefined,
        darkoDef: darkoApplies ? d.defensive : undefined,
        lebron: l?.impact,
        oLebron: l?.offensive,
        dLebron: l?.defensive,
        winsAdded: l?.winsAdded,
      };
    });
  } catch {
    return seasons;
  }
}

export async function getPlayerPlayoffCareerSeasons(
  playerId: string
): Promise<PlayerSeason[]> {
  const provider = getDataProvider();
  if (typeof provider.getPlayerPlayoffCareerSeasons !== "function") {
    return [];
  }
  const nbaId = await resolveNbaIdForDrbl(playerId);
  const statsId = nbaId && nbaId !== playerId ? nbaId : playerId;
  let seasons = await provider.getPlayerPlayoffCareerSeasons(statsId);
  if (seasons.length === 0 && statsId !== playerId) {
    seasons = await provider.getPlayerPlayoffCareerSeasons(playerId);
  }
  return seasons;
}

export async function getPlayerGameLog(
  playerId: string,
  season: string
): Promise<PlayerGame[]> {
  const provider = getDataProvider();
  const nbaId = await resolveNbaIdForDrbl(playerId);
  const statsId = nbaId && nbaId !== playerId ? nbaId : playerId;
  let games = await provider.getPlayerGameLog(statsId, season);
  if (games.length === 0 && statsId !== playerId) {
    games = await provider.getPlayerGameLog(playerId, season);
  }
  return games;
}

/**
 * Returns player-season rows for a season, with optional filters applied
 * once in the query layer.
 */
export async function getPlayersBySeason(
  season: string,
  filters: Omit<BasketballFilters, "season"> = {}
): Promise<PlayerSeason[]> {
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
    if (loaded.boardCount === 0) {
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
 * Same board load as getFilteredPlayerSeasons, plus the first load error
 * (if any) so diagnostics can distinguish failure from empty/unsupported.
 */
export async function getFilteredPlayerSeasonsDetailed(
  filters: BasketballFilters = {}
): Promise<{ rows: PlayerSeason[]; error: unknown | null }> {
  let seasons: PlayerSeason[] = [];
  let error: unknown | null = null;
  const draftPromise = getDraftYearByPlayerId();
  const start = filters.season
    ? (() => {
        try {
          return startYearFromCanonicalSeason(filters.season);
        } catch {
          return null;
        }
      })()
    : null;

  // Pre-modern ESPN athlete boards are unsupported - fail fast, no network.
  if (
    start != null &&
    start < TEAM_ROSTER_BOARD_EARLIEST_START_YEAR &&
    filters.season
  ) {
    return {
      rows: [],
      error: new Error(
        `season_unsupported_before_${TEAM_ROSTER_BOARD_EARLIEST_START_YEAR}`
      ),
    };
  }

  // Modern: ESPN is enough and much faster than historical enrichment path.
  if (start != null && start >= TEAM_ROSTER_BOARD_EARLIEST_START_YEAR && filters.season) {
    try {
      seasons = await getDataProvider().getPlayerSeasons(filters.season);
      // Attach DARKO quickly (name join); LEBRON is optional / non-blocking.
      const darko = await getDarkoRatings().catch(() => []);
      if (darko.length) {
        const darkoByName = new Map(
          darko.map((row) => [normalizePlayerName(row.playerName), row])
        );
        const boardSeason = filters.season;
        seasons = seasons.map((row) => {
          const d = darkoByName.get(normalizePlayerName(row.playerName));
          // Only overlay live DARKO onto the season the snapshot actually represents.
          if (!d || d.season !== boardSeason) return row;
          return {
            ...row,
            darkoDpm: d.impact,
            darkoOff: d.offensive,
            darkoDef: d.defensive,
          };
        });
      }
    } catch (e) {
      error = e;
      seasons = [];
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

  // Canonical DRBL overlay for registry seasons only (Explore board rows).
  if (seasons.length > 0 && filters.season && isDrblSeason(filters.season)) {
    const drblRows = await fetchDrblSeason(filters.season).catch(() => []);
    seasons = await overlayDrblRows(seasons, drblRows);
  }

  const draftById = await draftPromise;
  if (seasons.length > 0) {
    seasons = overlayDraftYears(seasons, draftById);
  }

  return {
    rows: applyPlayerSeasonFilters(seasons, filters),
    error,
  };
}

export async function getAvailableSeasons(): Promise<string[]> {
  // Full NBA archive window for filters (1960 → current).
  // DRBL availability is gated separately via getDrblAvailableSeasons /
  // listDrblSeasons - never invent DRBL for unsupported years.
  return [...listCanonicalSeasons()].reverse();
}

/** DRBL-published seasons only (single source: drbl/historical/season-registry). */
export async function getDrblAvailableSeasons(): Promise<string[]> {
  return listDrblSeasons();
}

/**
 * Career rows enriched with DARKO + BRef advanced + DRBL so timeline charts
 * can show impact metrics across seasons - not just counting stats.
 */
export async function getPlayerCareerTimelineSeasons(
  playerId: string
): Promise<PlayerSeason[]> {
  const career = await getPlayerCareerSeasons(playerId);
  if (career.length === 0) return [];

  const uniqueSeasons = [...new Set(career.map((row) => row.season))];
  // Cap expensive scrapes - recent seasons matter most for the timeline.
  const overlaySeasons = [...uniqueSeasons]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 8);

  const overlays = await Promise.all(
    overlaySeasons.map(async (season) => {
      const [darkoRows, brefRows, drblRows] = await Promise.all([
        fetchDarkoSeason(season, {
          ttlMs: darkoTtlMs(season),
          staleMs: darkoStaleMs(season),
        }).catch(() => []),
        fetchBrefAdvancedSeason(season, {
          ttlMs: brefTtlMs(season),
          staleMs: brefStaleMs(season),
        }).catch(() => []),
        fetchDrblSeason(season).catch(() => []),
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

  return enriched.sort((a, b) => a.season.localeCompare(b.season));
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
  const seasons = [
    ...new Set(rows.map((r) => r.season).filter((s) => isDrblSeason(s))),
  ];
  if (!seasons.length) return rows;

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

