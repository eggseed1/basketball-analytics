/**
 * Multi-season team board loader for Team Arc.
 * Batches season fetches - does not invent metrics or franchise merges.
 */

import { getTeamSeasonStats } from "@/data/queries/team-seasons";
import type { TeamSeasonStats } from "@/data/types/team-season";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
  listCanonicalSeasons,
  startYearFromCanonicalSeason,
} from "@/data/providers/historical/season-range";

/** ESPN team by-team boards are reliable from this season onward (ASK coverage). */
export const TEAM_ARC_EARLIEST_SEASON = "2001-02";

/** Default compact window: viewing season + prior years (inclusive). */
export const TEAM_ARC_DEFAULT_WINDOW = 6;

const FETCH_CONCURRENCY = 5;

export function listTeamArcCandidateSeasons(options?: {
  earliest?: string;
  latest?: string;
}): string[] {
  const earliest = options?.earliest ?? TEAM_ARC_EARLIEST_SEASON;
  const latest =
    options?.latest ??
    canonicalSeasonFromStartYear(currentNbaStartYear());
  const from = startYearFromCanonicalSeason(earliest);
  const to = startYearFromCanonicalSeason(latest);
  return listCanonicalSeasons(from, to).reverse();
}

/** Recent window ending at `anchorSeason` (inclusive), newest first. */
export function teamArcDefaultWindow(
  anchorSeason: string,
  windowSize = TEAM_ARC_DEFAULT_WINDOW,
  earliest = TEAM_ARC_EARLIEST_SEASON
): string[] {
  const all = listTeamArcCandidateSeasons({
    earliest,
    latest: anchorSeason,
  });
  return all.slice(0, Math.max(1, windowSize));
}

function matchTeamRow(
  board: TeamSeasonStats[],
  teamId: string,
  abbreviation?: string
): TeamSeasonStats | null {
  const byId = board.find((t) => t.teamId === teamId);
  if (byId) return byId;
  if (!abbreviation) return null;
  const abbr = abbreviation.toLowerCase();
  return (
    board.find((t) => t.abbreviation.toLowerCase() === abbr) ?? null
  );
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  }
  const n = Math.min(concurrency, Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

export type TeamSeasonArcLoadResult = {
  rows: TeamSeasonStats[];
  /** Seasons requested where the board loaded but this team was absent. */
  missingSeasons: string[];
  /** Seasons where the provider/board fetch failed. */
  failedSeasons: string[];
  requestedSeasons: string[];
};

/**
 * Load one team's season rows across seasons (batched board fetches).
 * Continuity is ESPN teamId (+ optional abbr fallback) - no franchise merge.
 */
export async function getTeamSeasonArc(options: {
  teamId: string;
  abbreviation?: string;
  seasons: string[];
  /** Optional preloaded boards keyed by season to avoid refetch. */
  preloadedBoards?: Record<string, TeamSeasonStats[]>;
}): Promise<TeamSeasonArcLoadResult> {
  const seasons = [...new Set(options.seasons)].sort((a, b) =>
    b.localeCompare(a)
  );
  const missingSeasons: string[] = [];
  const failedSeasons: string[] = [];
  const rows: TeamSeasonStats[] = [];

  const loaded = await mapPool(seasons, FETCH_CONCURRENCY, async (season) => {
    const cached = options.preloadedBoards?.[season];
    if (cached) {
      return { season, board: cached, error: false as const };
    }
    try {
      const board = await getTeamSeasonStats(season);
      return { season, board, error: false as const };
    } catch {
      return { season, board: [] as TeamSeasonStats[], error: true as const };
    }
  });

  for (const item of loaded) {
    if (item.error) {
      failedSeasons.push(item.season);
      continue;
    }
    const row = matchTeamRow(
      item.board,
      options.teamId,
      options.abbreviation
    );
    if (!row) {
      missingSeasons.push(item.season);
      continue;
    }
    rows.push(row);
  }

  rows.sort((a, b) => b.season.localeCompare(a.season));
  return {
    rows,
    missingSeasons,
    failedSeasons,
    requestedSeasons: seasons,
  };
}
