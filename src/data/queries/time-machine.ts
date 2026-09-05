/**
 * Time Machine snapshot queries — reuse existing boards / games / events.
 */

import { teamEraDisplay, resolveTeamEra } from "@/data/identity/team-era";
import { listCanonicalTeams } from "@/data/identity/team-map";
import { getFilteredGames } from "@/data/queries/games";
import { getPlayerSeasonBoardSnapshot } from "@/data/queries/player-data-health";
import { getTeamSeasonStats } from "@/data/queries/team-seasons";
import { listTransactionEvents } from "@/data/queries/offseason-tracker";
import { fetchDrblSeason } from "@/data/providers/nba/drbl-loader";
import { isDrblSeason } from "@/data/drbl/season-registry";
import { hasValidatedDrblEstimate } from "@/data/queries/percentiles";
import {
  getPlayerIdAliasIndex,
} from "@/data/identity/player-identity";
import { isProductionApprovedPlayerAlias } from "@/data/providers/impact/player-id-aliases";
import type { GameSummary } from "@/data/types";
import type { NbaTransactionEvent } from "@/data/types/transaction-event";
import type { TeamSeasonStats } from "@/data/types/team-season";
import {
  resolveHistoricalTeamBrand,
  type HistoricalLogoSource,
  type HistoricalTeamBrandPalette,
} from "@/lib/historical-team-brand";
import {
  clampDateToSeason,
  mapCalendarDayOntoSeason,
  nbaCalendarMonthDay,
  seasonDateBounds,
} from "@/themes/era-theme";

export type HistoricalTeamDirectoryRow = {
  canonicalTeamId: string;
  abbr: string;
  displayName: string;
  conference?: "East" | "West";
  avgDiff?: number;
  fromEra: boolean;
  /** Resolved logo URL when verified historical or safe current; null = text mark. */
  logoUrl: string | null;
  logoSource: HistoricalLogoSource;
  /** Era palette for historical_text monograms. */
  palette: HistoricalTeamBrandPalette | null;
  /** Season-board counting / rates when the team board is available. */
  gamesPlayed?: number;
  ppg?: number;
  oppPpg?: number;
  rpg?: number;
  apg?: number;
  spg?: number;
  bpg?: number;
  topg?: number;
  fieldGoalPct?: number;
  threePointPct?: number;
  freeThrowPct?: number;
  effectiveFieldGoalPct?: number;
  trueShootingPct?: number;
};

export type LeaderMetric = "ppg" | "rpg" | "apg" | "drbl100";

export type HistoricalLeaderRow = {
  playerId: string;
  playerName: string;
  teamAbbr: string;
  teamId?: string;
  value: number;
  metric: LeaderMetric;
};

/**
 * Teams that existed in the selected season (stats board), with era labels.
 * Falls back to era-mapped canonical franchises when the board is empty.
 */
export async function getHistoricalTeamDirectory(
  season: string
): Promise<{
  teams: HistoricalTeamDirectoryRow[];
  source: "season-board" | "era-fallback" | "unavailable";
  warning?: string;
}> {
  try {
    const board = await getTeamSeasonStats(season);
    if (board.length > 0) {
      const teams = board
        .map((row) => directoryFromBoardRow(row, season))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
      return { teams, source: "season-board" };
    }
  } catch {
    /* fall through */
  }

  return eraFallbackDirectory(season);
}

function eraFallbackDirectory(season: string): {
  teams: HistoricalTeamDirectoryRow[];
  source: "era-fallback" | "unavailable";
  warning?: string;
} {
  // Graceful degradation: only franchises with an era covering this season.
  // Continuous franchises without relocation eras need the season board.
  const teams: HistoricalTeamDirectoryRow[] = [];
  for (const t of listCanonicalTeams()) {
    const era = resolveTeamEra(t.canonicalTeamId, season);
    if (!era) continue;
    const brand = resolveHistoricalTeamBrand(
      t.canonicalTeamId,
      season,
      "era"
    );
    teams.push({
      canonicalTeamId: t.canonicalTeamId,
      abbr: era.abbr,
      displayName: era.displayName,
      fromEra: true,
      logoUrl: brand?.logoUrl ?? null,
      logoSource: brand?.source ?? "text_fallback",
      palette: brand?.palette ?? null,
    });
  }
  teams.sort((a, b) => a.displayName.localeCompare(b.displayName));
  if (teams.length === 0) {
    return {
      teams: [],
      source: "unavailable",
      warning: "Team directory unavailable for this season.",
    };
  }
  return {
    teams,
    source: "era-fallback",
    warning:
      "Season team board unavailable; showing relocation-era franchises only (incomplete).",
  };
}

function directoryFromBoardRow(
  row: TeamSeasonStats,
  season: string
): HistoricalTeamDirectoryRow {
  const era = teamEraDisplay(row.teamId, season, {
    abbr: row.abbreviation,
    displayName: row.fullName,
  });
  const brand = resolveHistoricalTeamBrand(row.teamId, season, "era");
  return {
    canonicalTeamId: row.teamId,
    abbr: era.abbr,
    displayName: era.displayName,
    conference: row.conference,
    avgDiff: row.avgDiff,
    fromEra: era.fromEra,
    logoUrl: brand?.logoUrl ?? null,
    logoSource: brand?.source ?? "text_fallback",
    palette: brand?.palette ?? null,
    gamesPlayed: row.gamesPlayed,
    ppg: row.ppg,
    oppPpg: row.oppPpg,
    rpg: row.rpg,
    apg: row.apg,
    spg: row.spg,
    bpg: row.bpg,
    topg: row.topg,
    fieldGoalPct: row.fieldGoalPct,
    threePointPct: row.threePointPct,
    freeThrowPct: row.freeThrowPct,
    effectiveFieldGoalPct: row.effectiveFieldGoalPct,
    trueShootingPct: row.trueShootingPct,
  };
}

function perGameRate(
  row: { points: number; rebounds: number; assists: number; gamesPlayed: number },
  metric: Exclude<LeaderMetric, "drbl100">
): number {
  const gp = Math.max(1, row.gamesPlayed);
  if (metric === "ppg") return row.points / gp;
  if (metric === "rpg") return row.rebounds / gp;
  return row.assists / gp;
}

function leadersFromBoard(
  rows: Awaited<ReturnType<typeof getPlayerSeasonBoardSnapshot>>["rows"],
  season: string,
  metric: Exclude<LeaderMetric, "drbl100">,
  limit: number,
  warning?: string
): { leaders: HistoricalLeaderRow[]; warning?: string } {
  if (rows.length === 0) {
    return {
      leaders: [],
      warning: warning ?? "No player-season rows for this season.",
    };
  }
  const sorted = [...rows].sort(
    (a, b) => perGameRate(b, metric) - perGameRate(a, metric)
  );
  const leaders = sorted.slice(0, limit).map((row) => {
    const teamId = row.teamId ? String(row.teamId) : undefined;
    const era =
      teamId != null
        ? teamEraDisplay(teamId, season, {
            displayName: row.teamName,
          })
        : null;
    return {
      playerId: String(row.playerId),
      playerName: row.playerName,
      teamAbbr: era?.abbr ?? "—",
      teamId,
      value: perGameRate(row, metric),
      metric,
    };
  });
  return { leaders, warning };
}

export async function getHistoricalLeaders(
  season: string,
  metric: LeaderMetric,
  limit = 10
): Promise<{ leaders: HistoricalLeaderRow[]; warning?: string }> {
  if (metric === "drbl100") {
    const bundle = await getHistoricalLeadersBundle(season, limit);
    return {
      leaders: bundle.drbl,
      warning: bundle.drblNote ?? bundle.warning,
    };
  }
  try {
    const snap = await getPlayerSeasonBoardSnapshot({
      season,
      minimumGames: 10,
    });
    return leadersFromBoard(
      snap.rows,
      season,
      metric,
      limit,
      snap.warnings[0]
    );
  } catch {
    return {
      leaders: [],
      warning: "Player leaders unavailable for this season.",
    };
  }
}

/** One player-board load → scoring / rebound / assist leaders (+ DRBL when registry). */
export async function getHistoricalLeadersBundle(
  season: string,
  limit = 10
): Promise<{
  ppg: HistoricalLeaderRow[];
  rpg: HistoricalLeaderRow[];
  apg: HistoricalLeaderRow[];
  drbl: HistoricalLeaderRow[];
  drblNote?: string;
  warning?: string;
}> {
  try {
    const snap = await getPlayerSeasonBoardSnapshot({
      season,
      minimumGames: 10,
    });
    const warning = snap.warnings[0];
    const base = {
      ppg: leadersFromBoard(snap.rows, season, "ppg", limit, warning).leaders,
      rpg: leadersFromBoard(snap.rows, season, "rpg", limit, warning).leaders,
      apg: leadersFromBoard(snap.rows, season, "apg", limit, warning).leaders,
      warning,
    };

    if (!isDrblSeason(season)) {
      return {
        ...base,
        drbl: [],
        drblNote: `DRBL/100 is not published for ${season} (registry seasons only).`,
      };
    }

    const [drblRows, aliases] = await Promise.all([
      fetchDrblSeason(season).catch(() => []),
      getPlayerIdAliasIndex().catch(() => ({
        byEspn: new Map(),
        byNba: new Map(),
      })),
    ]);
    const valid = drblRows.filter((row) =>
      hasValidatedDrblEstimate({
        validatedDRBL100: row.drbl100,
        validatedRawP100: row.rawAbilityRate,
        validatedActualPossessions:
          row.actualPossessions ?? row.possessions ?? 0,
      })
    );
    valid.sort((a, b) => b.drbl100 - a.drbl100);
    const drbl: HistoricalLeaderRow[] = valid.slice(0, limit).map((row) => {
      const nbaId = String(row.playerId);
      const alias = aliases.byNba.get(nbaId);
      const profileId =
        alias && isProductionApprovedPlayerAlias(alias)
          ? alias.espnPlayerId
          : nbaId;
      return {
        playerId: profileId,
        playerName: row.playerName,
        teamAbbr: row.teamId || "—",
        teamId: row.teamId,
        value: row.drbl100,
        metric: "drbl100" as const,
      };
    });

    return {
      ...base,
      drbl,
      drblNote:
        drbl.length === 0
          ? "DRBL overlay returned no valid estimates for this season."
          : undefined,
    };
  } catch {
    return {
      ppg: [],
      rpg: [],
      apg: [],
      drbl: [],
      warning: "Player leaders unavailable for this season.",
    };
  }
}

/**
 * One team-board load → directory + standings proxy.
 */
export async function getHistoricalTeamSnapshot(season: string): Promise<{
  directory: HistoricalTeamDirectoryRow[];
  directorySource: "season-board" | "era-fallback" | "unavailable";
  directoryWarning?: string;
  standings: {
    east: HistoricalTeamDirectoryRow[];
    west: HistoricalTeamDirectoryRow[];
    available: boolean;
    warning?: string;
  };
}> {
  try {
    const board = await getTeamSeasonStats(season);
    if (board.length > 0) {
      const directory = board
        .map((row) => directoryFromBoardRow(row, season))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
      const byDiff = [...directory].sort(
        (a, b) => (b.avgDiff ?? 0) - (a.avgDiff ?? 0)
      );
      return {
        directory,
        directorySource: "season-board",
        standings: {
          east: byDiff.filter((r) => r.conference === "East"),
          west: byDiff.filter((r) => r.conference === "West"),
          available: true,
        },
      };
    }
  } catch {
    /* fall through */
  }

  const fallback = eraFallbackDirectory(season);
  return {
    directory: fallback.teams,
    directorySource: fallback.source,
    directoryWarning: fallback.warning,
    standings: {
      east: [],
      west: [],
      available: false,
      warning:
        fallback.warning ??
        "Standings require season team board coverage.",
    },
  };
}

export async function getHistoricalGamesForDate(
  season: string,
  date: string
): Promise<{ games: GameSummary[]; date: string; warning?: string }> {
  const clamped = clampDateToSeason(date, season);
  const load = async () => {
    const games = await getFilteredGames({
      season,
      dateRange: { start: clamped, end: clamped },
    });
    return { games, date: clamped };
  };
  try {
    // Bound network crawls so Time Machine primary UI stays responsive.
    const result = await Promise.race([
      load(),
      new Promise<{ games: GameSummary[]; date: string; warning: string }>(
        (resolve) =>
          setTimeout(
            () =>
              resolve({
                games: [],
                date: clamped,
                warning:
                  "Games for this date are still loading from the historical provider. Try again shortly, or prefetch the season archive.",
              }),
            8000
          )
      ),
    ]);
    return result;
  } catch {
    return {
      games: [],
      date: clamped,
      warning: "Games unavailable for this date.",
    };
  }
}

/**
 * Default Time Machine date: today’s month/day on the selected season’s
 * calendar. Offseason (Jul–Sep, or outside season bounds) → last game date
 * when available, else season-end bound.
 */
export async function resolveTimeMachineDate(
  season: string,
  dateParam?: string,
  now: Date = new Date()
): Promise<string> {
  if (dateParam) return clampDateToSeason(dateParam, season);

  const { month, day } = nbaCalendarMonthDay(now);
  const mapped = mapCalendarDayOntoSeason(season, month, day);
  if (mapped) return mapped;

  const lastGame = await lastGameDateForSeason(season);
  if (lastGame) return lastGame;
  return seasonDateBounds(season).end;
}

async function lastGameDateForSeason(season: string): Promise<string | null> {
  const maxDate = (dates: Iterable<string>): string | null => {
    let max: string | null = null;
    for (const raw of dates) {
      const d = String(raw ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      if (!max || d > max) max = d;
    }
    return max;
  };

  try {
    const { getRuntimeSnapshotGames } = await import(
      "@/data/runtime/game-snapshot"
    );
    const fromSnap = maxDate(
      getRuntimeSnapshotGames(season).map((g) => g.gameDate)
    );
    if (fromSnap) return fromSnap;
  } catch {
    /* fall through */
  }

  try {
    // Prefer local/bundled archive — avoid remote season crawls on default date.
    const games = await getFilteredGames(
      { season },
      { allowRemoteHistoricalCrawl: false }
    );
    return maxDate(games.map((g) => g.gameDate));
  } catch {
    return null;
  }
}

export async function getHistoricalTransactionsForDate(
  date: string
): Promise<{ events: NbaTransactionEvent[]; warning?: string }> {
  try {
    const page = await listTransactionEvents(
      { dateFrom: date, dateTo: date },
      { page: 1, pageSize: 30, force: false }
    );
    return { events: page.events };
  } catch {
    return {
      events: [],
      warning: "Transaction archive unavailable for this date.",
    };
  }
}

/** Season standings proxy: team board sorted by avgDiff (when available). */
export async function getHistoricalStandingsProxy(
  season: string
): Promise<{
  east: HistoricalTeamDirectoryRow[];
  west: HistoricalTeamDirectoryRow[];
  available: boolean;
  warning?: string;
}> {
  try {
    const board = await getTeamSeasonStats(season);
    if (board.length === 0) {
      return {
        east: [],
        west: [],
        available: false,
        warning: "Standings require season team board coverage.",
      };
    }
    const rows = board
      .map((r) => directoryFromBoardRow(r, season))
      .sort((a, b) => (b.avgDiff ?? 0) - (a.avgDiff ?? 0));
    return {
      east: rows.filter((r) => r.conference === "East"),
      west: rows.filter((r) => r.conference === "West"),
      available: true,
    };
  } catch {
    return {
      east: [],
      west: [],
      available: false,
      warning: "Standings unavailable for this season.",
    };
  }
}
