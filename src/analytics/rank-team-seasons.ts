/**
 * Rank Team Seasons - Copeland aggregation of pairwise compareTeamSeasons.
 *
 * Same product philosophy as Player Rank My Seasons:
 * compare → aggregate → explain. No opaque team-season score.
 * Does not modify compareTeamSeasons or Player Rank My Seasons.
 */

import {
  TEAM_COMPARE_MIN_GAMES,
  TEAM_SEASON_COMPARE_METHODOLOGY,
  TEAM_SEASON_COMPARE_VERSION,
  compareTeamSeasons,
  teamComparePath,
  type TeamCompareCategoryWinner,
  type TeamCompareEdge,
  type TeamCompareSideCoverage,
  type TeamSeasonComparison,
} from "@/analytics/compare-team-seasons";
import type { TeamSeasonStats } from "@/data/types/team-season";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { seasonWinGraphHasCycle } from "@/analytics/rank-player-seasons";

export const TEAM_SEASON_RANK_VERSION = "1.0";
export const TEAM_SEASON_RANK_MIN = 2;
export const TEAM_SEASON_RANK_MAX = 8;
export const TEAM_SEASON_RANK_DEFAULT = 5;

/** Copeland gap (points) at/below which the top is marked close. */
export const TEAM_SEASON_RANK_CLOSE_TOP = 0.5;

export type TeamPairwiseMatrixResult =
  | "win"
  | "loss"
  | "even"
  | "unavailable"
  | "self";

export type TeamPairwiseMatchup = {
  seasonA: string;
  seasonB: string;
  overallEdge: TeamCompareEdge;
  categoryWinsA: string[];
  categoryWinsB: string[];
  href: string;
  comparison: TeamSeasonComparison;
};

export type TeamPairwiseMatrixCell = {
  rowSeason: string;
  colSeason: string;
  result: TeamPairwiseMatrixResult;
  href: string | null;
};

export type TeamSeasonDataCoverage = {
  performance: boolean;
  efficiency: boolean;
  shooting: boolean;
  rebounding: boolean;
  possession: boolean;
};

export type TeamSeasonRankEntry = {
  rank: number | null;
  season: string;
  eligible: boolean;
  eligibilityNote: string | null;
  pairwiseWins: number;
  pairwiseLosses: number;
  pairwiseEvens: number;
  pairwiseUnavailable: number;
  /** Copeland: win=1, even=0.5, loss/unavailable=0. */
  copelandPoints: number;
  categoryWins: string[];
  coverage: TeamCompareSideCoverage;
  dataCoverage: TeamSeasonDataCoverage;
};

export type TeamSeasonRankingMethodology = {
  version: string;
  scope: "regular_season";
  pairwiseRule: string;
  rankingRule: string;
  tieRule: string;
  cycleRule: string;
  setLimits: string;
  qualificationNote: string;
};

export const TEAM_SEASON_RANK_METHODOLOGY: TeamSeasonRankingMethodology = {
  version: TEAM_SEASON_RANK_VERSION,
  scope: "regular_season",
  pairwiseRule: `Each pair uses compareTeamSeasons (methodology v${TEAM_SEASON_COMPARE_VERSION}): metric tolerances → category plurality → overall category plurality. Regular season only.`,
  rankingRule:
    "Copeland ranking: each overall pairwise win = 1 point, essentially even = 0.5, loss/unavailable = 0. Sort by points, then wins, then fewer losses, then season id. No opaque team-season score.",
  tieRule: `Equal Copeland points (and win/loss tie-breakers) share a contested band. Close top when the leaders differ by ≤${TEAM_SEASON_RANK_CLOSE_TOP} points.`,
  cycleRule:
    "If the win graph among eligible seasons contains a cycle (A>B>C>A), the ranking is marked contested - Copeland order is still shown but is not claimed uniquely objective.",
  setLimits: `Select ${TEAM_SEASON_RANK_MIN}-${TEAM_SEASON_RANK_MAX} seasons (default ${TEAM_SEASON_RANK_DEFAULT}). Pairwise cost is O(n²) on the selected set only.`,
  qualificationNote: TEAM_SEASON_COMPARE_METHODOLOGY.qualifyingRule,
};

export type TeamCategoryLedger = {
  season: string;
  wins: string[];
  close: string[];
  lost: string[];
};

export type TeamSeasonRanking = {
  teamId: string;
  abbreviation: string;
  fullName: string;
  seasons: string[];
  scope: "regular_season";
  ranking: TeamSeasonRankEntry[];
  pairwise: TeamPairwiseMatchup[];
  matrix: TeamPairwiseMatrixCell[][];
  topSeasonWhy: string[];
  topCategorySummary: TeamCategoryLedger | null;
  contested: boolean;
  contestedNote: string | null;
  closeTop: boolean;
  closeTopNote: string | null;
  methodology: TeamSeasonRankingMethodology;
  error: string | null;
};

function categoryWinsFor(
  categories: TeamCompareCategoryWinner[],
  edge: "a" | "b"
): string[] {
  return categories.filter((c) => c.edge === edge).map((c) => c.label);
}

function dataCoverageFromRow(row: TeamSeasonStats): TeamSeasonDataCoverage {
  return {
    performance: Number.isFinite(row.avgDiff) || row.ppg > 0 || row.oppPpg > 0,
    efficiency:
      (row.trueShootingPct != null && row.trueShootingPct > 0) ||
      (row.effectiveFieldGoalPct != null && row.effectiveFieldGoalPct > 0),
    shooting:
      row.threePointPct > 0 ||
      (row.fieldGoalsAttempted > 0 && row.threePointersAttempted > 0),
    rebounding: row.offensiveReboundPct > 0,
    possession:
      Number.isFinite(row.topg) || Number.isFinite(row.assistToTurnover),
  };
}

/** Aggregate category edges for one season across all pairwise results. */
export function buildTeamCategoryLedger(
  season: string,
  pairwise: TeamPairwiseMatchup[]
): TeamCategoryLedger {
  const win = new Map<string, number>();
  const close = new Map<string, number>();
  const lost = new Map<string, number>();

  const bump = (map: Map<string, number>, label: string) => {
    map.set(label, (map.get(label) ?? 0) + 1);
  };

  for (const p of pairwise) {
    const asA = p.seasonA === season;
    const asB = p.seasonB === season;
    if (!asA && !asB) continue;
    for (const c of p.comparison.categories) {
      if (c.edge === "unavailable") continue;
      if (c.edge === "even") {
        bump(close, c.label);
        continue;
      }
      const seasonWins =
        (asA && c.edge === "a") || (asB && c.edge === "b");
      if (seasonWins) bump(win, c.label);
      else bump(lost, c.label);
    }
  }

  const ranked = (map: Map<string, number>) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([label]) => label);

  // Prefer decisive W/L over "close" when a label appears in both.
  const wins = ranked(win);
  const losses = ranked(lost).filter((l) => !wins.includes(l));
  const closes = ranked(close).filter(
    (l) => !wins.includes(l) && !losses.includes(l)
  );

  return { season, wins, close: closes, lost: losses };
}

function buildTopWhy(
  top: TeamSeasonRankEntry,
  pairwise: TeamPairwiseMatchup[],
  contested: boolean,
  closeTop: boolean
): string[] {
  const lines: string[] = [];
  const wins = pairwise.filter(
    (p) =>
      (p.seasonA === top.season && p.overallEdge === "a") ||
      (p.seasonB === top.season && p.overallEdge === "b")
  );
  const beaten = wins.map((p) =>
    p.seasonA === top.season ? p.seasonB : p.seasonA
  );
  if (beaten.length) {
    lines.push(
      `${top.season} wins its overall pairwise comparisons against ${beaten.join(", ")} (${top.pairwiseWins}-${top.pairwiseLosses}${top.pairwiseEvens ? `, ${top.pairwiseEvens} even` : ""}).`
    );
  } else if (top.pairwiseEvens > 0) {
    lines.push(
      `${top.season} sits at the top largely on even pairwise results rather than decisive wins.`
    );
  } else {
    lines.push(
      `${top.season} ranks first among the eligible set, but decisive pairwise wins are limited.`
    );
  }

  if (top.categoryWins.length) {
    lines.push(
      `Across pairs, its most frequent category edges are: ${top.categoryWins.join(", ")}.`
    );
  }

  lines.push(
    "This season ranks first under the current Team Season Ranking methodology - not a universal “best team” score."
  );

  if (closeTop) {
    lines.push(
      "The top of the ranking is close; small evidence gaps separate the leaders."
    );
  }
  if (contested) {
    lines.push(
      "The ordering is contested because the season comparisons contain mixed/cyclic results."
    );
  }
  return lines;
}

/**
 * Rank a selected set of the same team's seasons via pairwise compareTeamSeasons.
 */
export function rankTeamSeasons(options: {
  teamId: string;
  abbreviation: string;
  fullName: string;
  seasons: TeamSeasonStats[];
  nowSeason?: string;
}): TeamSeasonRanking {
  const nowSeason =
    options.nowSeason ??
    canonicalSeasonFromStartYear(currentNbaStartYear());

  const unique = new Map<string, TeamSeasonStats>();
  for (const row of options.seasons) {
    const existing = unique.get(row.season);
    if (!existing || row.gamesPlayed > existing.gamesPlayed) {
      unique.set(row.season, row);
    }
  }
  const seasonRows = [...unique.values()].sort((a, b) =>
    a.season.localeCompare(b.season)
  );
  const seasonIds = seasonRows.map((r) => r.season);

  const empty = (error: string): TeamSeasonRanking => ({
    teamId: options.teamId,
    abbreviation: options.abbreviation,
    fullName: options.fullName,
    seasons: seasonIds,
    scope: "regular_season",
    ranking: [],
    pairwise: [],
    matrix: [],
    topSeasonWhy: [],
    topCategorySummary: null,
    contested: false,
    contestedNote: null,
    closeTop: false,
    closeTopNote: null,
    methodology: TEAM_SEASON_RANK_METHODOLOGY,
    error,
  });

  if (seasonIds.length < TEAM_SEASON_RANK_MIN) {
    return empty(`Select at least ${TEAM_SEASON_RANK_MIN} seasons.`);
  }
  if (seasonIds.length > TEAM_SEASON_RANK_MAX) {
    return empty(
      `Select at most ${TEAM_SEASON_RANK_MAX} seasons (got ${seasonIds.length}).`
    );
  }

  const pairwise: TeamPairwiseMatchup[] = [];
  for (let i = 0; i < seasonRows.length; i++) {
    for (let j = i + 1; j < seasonRows.length; j++) {
      const a = seasonRows[i]!;
      const b = seasonRows[j]!;
      const comparison = compareTeamSeasons({
        teamA: a,
        teamB: b,
        nowSeason,
      });
      pairwise.push({
        seasonA: a.season,
        seasonB: b.season,
        overallEdge: comparison.overall.edge,
        categoryWinsA: categoryWinsFor(comparison.categories, "a"),
        categoryWinsB: categoryWinsFor(comparison.categories, "b"),
        href: teamComparePath({
          teamA: options.teamId,
          teamB: options.teamId,
          seasonA: a.season,
          seasonB: b.season,
        }),
        comparison,
      });
    }
  }

  type Acc = {
    wins: number;
    losses: number;
    evens: number;
    unavailable: number;
    points: number;
    categoryCounts: Map<string, number>;
    coverage: TeamCompareSideCoverage | null;
  };
  const acc = new Map<string, Acc>();
  for (const row of seasonRows) {
    acc.set(row.season, {
      wins: 0,
      losses: 0,
      evens: 0,
      unavailable: 0,
      points: 0,
      categoryCounts: new Map(),
      coverage: null,
    });
  }

  for (const p of pairwise) {
    const aAcc = acc.get(p.seasonA)!;
    const bAcc = acc.get(p.seasonB)!;
    if (!aAcc.coverage) aAcc.coverage = p.comparison.coverage.a;
    if (!bAcc.coverage) bAcc.coverage = p.comparison.coverage.b;

    const bumpCats = (labels: string[], map: Map<string, number>) => {
      for (const label of labels) {
        map.set(label, (map.get(label) ?? 0) + 1);
      }
    };

    if (p.overallEdge === "a") {
      aAcc.wins += 1;
      aAcc.points += 1;
      bAcc.losses += 1;
      bumpCats(p.categoryWinsA, aAcc.categoryCounts);
      bumpCats(p.categoryWinsB, bAcc.categoryCounts);
    } else if (p.overallEdge === "b") {
      bAcc.wins += 1;
      bAcc.points += 1;
      aAcc.losses += 1;
      bumpCats(p.categoryWinsA, aAcc.categoryCounts);
      bumpCats(p.categoryWinsB, bAcc.categoryCounts);
    } else if (p.overallEdge === "even") {
      aAcc.evens += 1;
      bAcc.evens += 1;
      aAcc.points += 0.5;
      bAcc.points += 0.5;
      bumpCats(p.categoryWinsA, aAcc.categoryCounts);
      bumpCats(p.categoryWinsB, bAcc.categoryCounts);
    } else {
      // unavailable - do NOT convert into losses/points
      aAcc.unavailable += 1;
      bAcc.unavailable += 1;
    }
  }

  const beats = new Map<string, Set<string>>();
  for (const id of seasonIds) beats.set(id, new Set());
  for (const p of pairwise) {
    if (p.overallEdge === "a") beats.get(p.seasonA)!.add(p.seasonB);
    if (p.overallEdge === "b") beats.get(p.seasonB)!.add(p.seasonA);
  }

  const rowBySeason = new Map(seasonRows.map((r) => [r.season, r]));

  const entries: TeamSeasonRankEntry[] = seasonRows.map((row) => {
    const a = acc.get(row.season)!;
    const coverage =
      a.coverage ??
      ({
        teamId: row.teamId,
        abbreviation: row.abbreviation,
        fullName: row.fullName,
        season: row.season,
        gamesPlayed: row.gamesPlayed,
        qualifying: row.gamesPlayed >= TEAM_COMPARE_MIN_GAMES,
        incomplete: row.season === nowSeason && row.gamesPlayed < 50,
        thin: row.gamesPlayed > 0 && row.gamesPlayed < TEAM_COMPARE_MIN_GAMES,
      } satisfies TeamCompareSideCoverage);

    const eligible = coverage.qualifying && !coverage.incomplete;
    let eligibilityNote: string | null = null;
    if (!coverage.qualifying) {
      eligibilityNote =
        "Not eligible - insufficient sample for overall verdicts (<20 GP).";
    } else if (coverage.incomplete) {
      eligibilityNote =
        "Current season in progress - limited evidence; not ranked as a completed season.";
    }

    const categoryWins = [...a.categoryCounts.entries()]
      .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
      .filter(([, n]) => n > 0)
      .slice(0, 6)
      .map(([label]) => label);

    return {
      rank: null,
      season: row.season,
      eligible,
      eligibilityNote,
      pairwiseWins: a.wins,
      pairwiseLosses: a.losses,
      pairwiseEvens: a.evens,
      pairwiseUnavailable: a.unavailable,
      copelandPoints: a.points,
      categoryWins,
      coverage,
      dataCoverage: dataCoverageFromRow(rowBySeason.get(row.season)!),
    };
  });

  const eligible = entries
    .filter((e) => e.eligible)
    .sort(
      (a, b) =>
        b.copelandPoints - a.copelandPoints ||
        b.pairwiseWins - a.pairwiseWins ||
        a.pairwiseLosses - b.pairwiseLosses ||
        a.season.localeCompare(b.season)
    );

  eligible.forEach((e, idx) => {
    e.rank = idx + 1;
  });

  const ineligible = entries
    .filter((e) => !e.eligible)
    .sort((a, b) => a.season.localeCompare(b.season));

  const ranking = [...eligible, ...ineligible];

  const eligibleIds = eligible.map((e) => e.season);
  const contested = seasonWinGraphHasCycle(eligibleIds, beats);
  const contestedNote = contested
    ? "The ordering is contested because the season comparisons contain mixed/cyclic results. Copeland order is shown - inspect the matrix."
    : null;

  const closeTop =
    eligible.length >= 2 &&
    Math.abs(
      eligible[0]!.copelandPoints - eligible[1]!.copelandPoints
    ) <= TEAM_SEASON_RANK_CLOSE_TOP;
  const closeTopNote = closeTop
    ? `${eligible[0]!.season} and ${eligible[1]!.season} are separated by very little pairwise evidence.`
    : null;

  const matrix: TeamPairwiseMatrixCell[][] = seasonIds.map((rowSeason) =>
    seasonIds.map((colSeason) => {
      if (rowSeason === colSeason) {
        return {
          rowSeason,
          colSeason,
          result: "self" as const,
          href: null,
        };
      }
      const match = pairwise.find(
        (p) =>
          (p.seasonA === rowSeason && p.seasonB === colSeason) ||
          (p.seasonA === colSeason && p.seasonB === rowSeason)
      );
      if (!match) {
        return {
          rowSeason,
          colSeason,
          result: "unavailable" as const,
          href: teamComparePath({
            teamA: options.teamId,
            teamB: options.teamId,
            seasonA: rowSeason,
            seasonB: colSeason,
          }),
        };
      }
      let result: TeamPairwiseMatrixResult = "unavailable";
      if (match.overallEdge === "even") result = "even";
      else if (match.overallEdge === "unavailable") result = "unavailable";
      else if (match.seasonA === rowSeason) {
        result = match.overallEdge === "a" ? "win" : "loss";
      } else {
        result = match.overallEdge === "b" ? "win" : "loss";
      }
      return {
        rowSeason,
        colSeason,
        result,
        href: match.href,
      };
    })
  );

  const top = eligible[0];
  const topSeasonWhy = top
    ? buildTopWhy(top, pairwise, contested, closeTop)
    : ["No eligible seasons to rank."];
  const topCategorySummary = top
    ? buildTeamCategoryLedger(top.season, pairwise)
    : null;

  return {
    teamId: options.teamId,
    abbreviation: options.abbreviation,
    fullName: options.fullName,
    seasons: seasonIds,
    scope: "regular_season",
    ranking,
    pairwise,
    matrix,
    topSeasonWhy,
    topCategorySummary,
    contested,
    contestedNote,
    closeTop,
    closeTopNote,
    methodology: TEAM_SEASON_RANK_METHODOLOGY,
    error: null,
  };
}

export function teamSeasonRankPath(
  teamId: string,
  seasons: string[]
): string {
  const params = new URLSearchParams({
    mode: "teams",
    view: "rank",
    teamId,
    seasons: seasons.join(","),
  });
  return `/compare?${params.toString()}`;
}

/** Default recent eligible-ish seasons for rank (newest first, then sorted asc for URL). */
export function defaultTeamRankSeasons(
  rows: TeamSeasonStats[],
  options?: { nowSeason?: string; limit?: number; prefer?: string[] }
): string[] {
  const nowSeason =
    options?.nowSeason ??
    canonicalSeasonFromStartYear(currentNbaStartYear());
  const limit = options?.limit ?? TEAM_SEASON_RANK_DEFAULT;
  const prefer = new Set(options?.prefer ?? []);

  const chrono = [...rows].sort((a, b) => b.season.localeCompare(a.season));
  const picked: string[] = [];

  for (const pref of prefer) {
    if (chrono.some((r) => r.season === pref) && !picked.includes(pref)) {
      picked.push(pref);
    }
  }

  for (const row of chrono) {
    if (picked.includes(row.season)) continue;
    // Prefer completed qualifying seasons for the default set.
    const incomplete = row.season === nowSeason && row.gamesPlayed < 50;
    const qualifying = row.gamesPlayed >= TEAM_COMPARE_MIN_GAMES;
    if (!qualifying || incomplete) continue;
    picked.push(row.season);
    if (picked.length >= Math.min(limit, TEAM_SEASON_RANK_MAX)) break;
  }

  // If still short, allow incomplete/thin as last resort so the UI can show notes.
  if (picked.length < TEAM_SEASON_RANK_MIN) {
    for (const row of chrono) {
      if (picked.includes(row.season)) continue;
      picked.push(row.season);
      if (picked.length >= TEAM_SEASON_RANK_MIN) break;
    }
  }

  return picked
    .slice(0, TEAM_SEASON_RANK_MAX)
    .sort((a, b) => a.localeCompare(b));
}
