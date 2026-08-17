import { getDataProvider } from "@/data/providers";
import { NBADataProvider } from "@/data/providers/nba-data-provider";
import { resolveCanonicalTeam } from "@/data/identity/team-map";
import type {
  BasketballFilters,
  Player,
  PlayerGame,
  PlayerSeason,
} from "@/data/types";
import { applyPlayerSeasonFilters } from "./filter-utils";
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
import { ESPN_PLAYER_BOARD_RELIABLE_START_YEAR } from "@/data/diagnostics/provider-meta";
import { withBudgetOrThrow } from "@/data/queries/budget";

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

async function loadEspnTeamRoster(
  canonicalTeamId: string,
  season: string,
  filters: Omit<BasketballFilters, "team" | "season">
): Promise<{ boardCount: number; players: PlayerSeason[] }> {
  let seasons = await espnPlayerSeasonProvider().getPlayerSeasons(season);
  const darko = await getDarkoRatings().catch(() => []);
  seasons = overlayDarko(seasons, season, darko);
  // Canonical ESPN team id only — do not expand BDL ids (ESPN 21 = PHX, BDL 21 = OKC).
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
  const [base, bio] = await Promise.all([
    getDataProvider().getPlayer(playerId).catch(() => null),
    fetchEspnAthleteBio(playerId),
  ]);
  return mergePlayerBio(base, bio);
}

export async function getPlayerSeason(
  playerId: string,
  season: string
): Promise<PlayerSeason | null> {
  return getDataProvider().getPlayerSeason(playerId, season);
}

export async function getPlayerCareerSeasons(
  playerId: string
): Promise<PlayerSeason[]> {
  const seasons = await getDataProvider().getPlayerCareerSeasons(playerId);
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
      // Live DARKO is a current-season snapshot — never stamp it onto other years.
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

export async function getPlayerGameLog(
  playerId: string,
  season: string
): Promise<PlayerGame[]> {
  return getDataProvider().getPlayerGameLog(playerId, season);
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
  const start = filters.season
    ? (() => {
        try {
          return startYearFromCanonicalSeason(filters.season);
        } catch {
          return null;
        }
      })()
    : null;

  // Pre-modern ESPN athlete boards are unsupported — fail fast, no network.
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
  return {
    rows: applyPlayerSeasonFilters(seasons, filters),
    error,
  };
}

export async function getAvailableSeasons(): Promise<string[]> {
  // Full NBA archive window for filters (1960 → current).
  return [...listCanonicalSeasons()].reverse();
}
