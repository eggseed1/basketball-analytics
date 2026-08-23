import { fetchTeamSeasonStats } from "@/data/providers/nba/team-season-client";
import type { TeamSeasonStats } from "@/data/types/team-season";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
  startYearFromCanonicalSeason,
} from "@/data/providers/historical/season-range";
import { getAvailableSeasons } from "@/data/queries/players";
import { isSeasonAwaitingFirstGame } from "@/lib/nba-season-status";

/**
 * ESPN by-team season boards are reliable from this floor onward
 * (same floor as Team Arc). Earlier seasons skip the network call.
 */
export const TEAM_SEASON_BOARD_EARLIEST_SEASON = "2001-02";

/** Soft budget for live ESPN by-team pulls on destination pages. */
export const TEAM_SEASON_BOARD_BUDGET_MS = 5_000;

export type TeamSeasonBoardStatus =
  | "ok"
  | "preseason"
  | "unsupported"
  | "timeout"
  | "error";

export type TeamSeasonBoardResult = {
  rows: TeamSeasonStats[];
  status: TeamSeasonBoardStatus;
  /** User-facing honest state (never invents metrics). */
  warning?: string;
  /** Diagnostic detail (HTTP status, timeout, etc.). */
  error?: string;
};

function classifyBoardError(error: unknown): string {
  if (!(error instanceof Error)) return "unknown provider error";
  const status = /ESPN request failed \((\d+)\)/.exec(error.message)?.[1];
  if (status) return `ESPN HTTP ${status}`;
  if (/timed out|aborted|timeout_after_/i.test(error.message)) return "timeout";
  return error.message.slice(0, 160);
}

export function isTeamSeasonBoardSupported(season: string): boolean {
  try {
    return (
      startYearFromCanonicalSeason(season) >=
      startYearFromCanonicalSeason(TEAM_SEASON_BOARD_EARLIEST_SEASON)
    );
  } catch {
    return false;
  }
}

async function raceBudget<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timeout_after_${ms}ms`)),
          ms
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Bounded team-season board load with diagnosed unavailable states.
 * Pre-2001 seasons never hit ESPN (fail fast).
 */
export async function getTeamSeasonBoard(
  season: string,
  options?: { budgetMs?: number }
): Promise<TeamSeasonBoardResult> {
  if (!isTeamSeasonBoardSupported(season)) {
    return {
      rows: [],
      status: "unsupported",
      warning: `Historical team metrics unavailable for ${season}. ESPN by-team boards are not available before ${TEAM_SEASON_BOARD_EARLIEST_SEASON}.`,
      error: `unsupported_before_${TEAM_SEASON_BOARD_EARLIEST_SEASON}`,
    };
  }

  const budgetMs = options?.budgetMs ?? TEAM_SEASON_BOARD_BUDGET_MS;
  try {
    const rows = await raceBudget(
      fetchTeamSeasonStats(season).then((list) =>
        [...list].sort((a, b) => b.avgDiff - a.avgDiff)
      ),
      budgetMs
    );
    if (isSeasonAwaitingFirstGame(season, rows)) {
      return {
        rows,
        status: "preseason",
        warning: `Season hasn't started — ${season} rosters are live; team stats appear after tip-off.`,
      };
    }
    return { rows, status: "ok" };
  } catch (error) {
    const detail = classifyBoardError(error);
    if (detail === "timeout" || /timeout_after_/.test(String(error))) {
      return {
        rows: [],
        status: "timeout",
        warning: `Team metrics unavailable for ${season} (provider timed out).`,
        error: `timeout_after_${budgetMs}ms`,
      };
    }
    return {
      rows: [],
      status: "error",
      warning: `Team metrics unavailable for ${season} (provider failed).`,
      error: detail,
    };
  }
}

/**
 * Compatibility wrapper - returns rows only.
 * Prefer getTeamSeasonBoard when callers need diagnosed unavailable state.
 */
export async function getTeamSeasonStats(
  season?: string
): Promise<TeamSeasonStats[]> {
  const resolved =
    season ?? canonicalSeasonFromStartYear(currentNbaStartYear());
  const board = await getTeamSeasonBoard(resolved);
  return board.rows;
}

export async function getTeamExploreSeasons(): Promise<string[]> {
  return getAvailableSeasons();
}
