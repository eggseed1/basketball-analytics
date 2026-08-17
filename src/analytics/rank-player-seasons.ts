/**
 * Rank My Seasons — multi-season aggregation of pairwise comparePlayerSeasons.
 *
 * No opaque universal season score. Ordering = Copeland-style pairwise points
 * from the existing overall category-plurality comparisons.
 */

import {
  CAREER_RESUME_MIN_GAMES,
  careerProductionIndex,
  isCareerQualifyingSeason,
} from "@/analytics/career-resume";
import {
  PLAYER_SEASON_COMPARE_METHODOLOGY,
  PLAYER_SEASON_COMPARE_VERSION,
  comparePlayerSeasons,
  seasonComparePath,
  type PlayerSeasonComparison,
  type SeasonCategoryWinner,
  type SeasonCompareEdge,
  type SeasonCoverageSnapshot,
  type SeasonImpactSnapshot,
} from "@/analytics/compare-player-seasons";
import type { PlayerSeason } from "@/data/types";
import type { TeamSeasonStats } from "@/data/types/team-season";
import { hasValidDrblEstimate } from "@/data/queries/percentiles";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";

export const PLAYER_SEASON_RANK_VERSION = "1.0";
export const PLAYER_SEASON_RANK_MIN = 2;
export const PLAYER_SEASON_RANK_MAX = 8;
export const PLAYER_SEASON_RANK_DEFAULT = 4;

export type PairwiseMatrixResult =
  | "win"
  | "loss"
  | "even"
  | "unavailable"
  | "self";

export type PairwiseMatchup = {
  seasonA: string;
  seasonB: string;
  /** Overall edge from comparePlayerSeasons (a = seasonA, b = seasonB). */
  overallEdge: SeasonCompareEdge;
  categoryWinsA: string[];
  categoryWinsB: string[];
  href: string;
  comparison: PlayerSeasonComparison;
};

export type PairwiseMatrixCell = {
  rowSeason: string;
  colSeason: string;
  result: PairwiseMatrixResult;
  href: string | null;
};

export type SeasonRankEntry = {
  /** 1-based among eligible seasons; null when not eligible for ranking. */
  rank: number | null;
  season: string;
  eligible: boolean;
  eligibilityNote: string | null;
  pairwiseWins: number;
  pairwiseLosses: number;
  pairwiseEvens: number;
  pairwiseUnavailable: number;
  /** Copeland points: win=1, even=0.5, else 0. */
  copelandPoints: number;
  /** Category labels this season won most often across decisive pairwise categories. */
  categoryWins: string[];
  coverage: SeasonCoverageSnapshot;
  /** League DRBL/100 rank from overlay when available (not Copeland). */
  drblLeagueRank: number | null;
  /** DRBL/100 value when valid. */
  drbl100: number | null;
  /** Percentile of DRBL/100 among selected seasons with valid estimates. */
  drblSelectedPercentile: number | null;
  /** Rank by R1 Points among selected seasons — labeled distinctly from DRBL. */
  r1PointsSelectedRank: number | null;
};

export type PlayerSeasonRankingMethodology = {
  version: string;
  scope: "regular_season";
  pairwiseRule: string;
  rankingRule: string;
  tieRule: string;
  cycleRule: string;
  impactRule: string;
  cpiNote: string;
  setLimits: string;
};

export const PLAYER_SEASON_RANK_METHODOLOGY: PlayerSeasonRankingMethodology = {
  version: PLAYER_SEASON_RANK_VERSION,
  scope: "regular_season",
  pairwiseRule: `Each pair uses comparePlayerSeasons (methodology v${PLAYER_SEASON_COMPARE_VERSION}): metric tolerances → category plurality → overall category plurality. Regular season only.`,
  rankingRule:
    "Copeland ranking: each overall pairwise win = 1 point, essentially even = 0.5, loss/unavailable = 0. Sort by points, then wins, then fewer losses, then season id for determinism. No opaque composite season score.",
  tieRule:
    "Equal Copeland points (and win/loss tie-breakers) share a contested band. UI reports close separations when the top two differ by ≤0.5 points.",
  cycleRule:
    "If the win graph among eligible seasons contains a cycle (A>B>C>A), the ranking is marked contested — order is still shown via Copeland points but is not claimed to be uniquely objective.",
  impactRule: PLAYER_SEASON_COMPARE_METHODOLOGY.impactRule,
  cpiNote: PLAYER_SEASON_COMPARE_METHODOLOGY.cpiNote,
  setLimits: `Select ${PLAYER_SEASON_RANK_MIN}–${PLAYER_SEASON_RANK_MAX} seasons (default ${PLAYER_SEASON_RANK_DEFAULT}). Pairwise cost is O(n²) on the selected set only.`,
};

export type PlayerSeasonRanking = {
  playerId: string;
  playerName: string;
  seasons: string[];
  scope: "regular_season";
  ranking: SeasonRankEntry[];
  pairwise: PairwiseMatchup[];
  matrix: PairwiseMatrixCell[][];
  topSeasonWhy: string[];
  contested: boolean;
  contestedNote: string | null;
  closeTop: boolean;
  closeTopNote: string | null;
  methodology: PlayerSeasonRankingMethodology;
  /** Production-only appendix (CPI) — not the ranking model. */
  productionAppendix: Array<{ season: string; cpi: number }>;
  error: string | null;
};

function categoryWinsFor(
  categories: SeasonCategoryWinner[],
  edge: "a" | "b"
): string[] {
  return categories.filter((c) => c.edge === edge).map((c) => c.label);
}

function hasWinCycle(
  seasons: string[],
  beats: Map<string, Set<string>>
): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function dfs(node: string): boolean {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of beats.get(node) ?? []) {
      if (dfs(next)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  }

  for (const s of seasons) {
    if (dfs(s)) return true;
  }
  return false;
}

function buildTopWhy(
  top: SeasonRankEntry,
  pairwise: PairwiseMatchup[],
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
      `${top.season} wins its overall pairwise comparisons against ${beaten.join(", ")} (${top.pairwiseWins}–${top.pairwiseLosses}${top.pairwiseEvens ? `, ${top.pairwiseEvens} even` : ""}).`
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
    "This is a Copeland aggregation of existing season comparisons — not a universal 'best season' score."
  );

  if (closeTop) {
    lines.push(
      "The top of the ranking is close; small evidence gaps separate the leaders."
    );
  }
  if (contested) {
    lines.push(
      "Pairwise results include a cycle among eligible seasons — treat the order as contested."
    );
  }
  return lines;
}

/**
 * Rank a selected set of the same player's seasons via pairwise comparePlayerSeasons.
 */
export function rankPlayerSeasons(options: {
  playerId: string;
  playerName: string;
  seasons: PlayerSeason[];
  impacts?: Map<string, SeasonImpactSnapshot | null>;
  teams?: Map<string, Pick<TeamSeasonStats, "avgDiff" | "abbreviation"> | null>;
  nowSeason?: string;
  playerIdForLinks?: string;
}): PlayerSeasonRanking {
  const playerId = options.playerId;
  const linkId = options.playerIdForLinks ?? playerId;
  const nowSeason =
    options.nowSeason ??
    canonicalSeasonFromStartYear(currentNbaStartYear());

  const unique = new Map<string, PlayerSeason>();
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

  if (seasonIds.length < PLAYER_SEASON_RANK_MIN) {
    return {
      playerId,
      playerName: options.playerName,
      seasons: seasonIds,
      scope: "regular_season",
      ranking: [],
      pairwise: [],
      matrix: [],
      topSeasonWhy: [],
      contested: false,
      contestedNote: null,
      closeTop: false,
      closeTopNote: null,
      methodology: PLAYER_SEASON_RANK_METHODOLOGY,
      productionAppendix: [],
      error: `Select at least ${PLAYER_SEASON_RANK_MIN} seasons.`,
    };
  }
  if (seasonIds.length > PLAYER_SEASON_RANK_MAX) {
    return {
      playerId,
      playerName: options.playerName,
      seasons: seasonIds,
      scope: "regular_season",
      ranking: [],
      pairwise: [],
      matrix: [],
      topSeasonWhy: [],
      contested: false,
      contestedNote: null,
      closeTop: false,
      closeTopNote: null,
      methodology: PLAYER_SEASON_RANK_METHODOLOGY,
      productionAppendix: [],
      error: `Select at most ${PLAYER_SEASON_RANK_MAX} seasons (got ${seasonIds.length}).`,
    };
  }

  const pairwise: PairwiseMatchup[] = [];
  for (let i = 0; i < seasonRows.length; i++) {
    for (let j = i + 1; j < seasonRows.length; j++) {
      const a = seasonRows[i]!;
      const b = seasonRows[j]!;
      const comparison = comparePlayerSeasons({
        playerId,
        playerName: options.playerName,
        seasonA: a,
        seasonB: b,
        impactA: options.impacts?.get(a.season) ?? null,
        impactB: options.impacts?.get(b.season) ?? null,
        teamA: options.teams?.get(a.season) ?? null,
        teamB: options.teams?.get(b.season) ?? null,
        nowSeason,
      });
      pairwise.push({
        seasonA: a.season,
        seasonB: b.season,
        overallEdge: comparison.overall.edge,
        categoryWinsA: categoryWinsFor(comparison.categories, "a"),
        categoryWinsB: categoryWinsFor(comparison.categories, "b"),
        href: seasonComparePath(linkId, a.season, b.season),
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
    coverage: SeasonCoverageSnapshot | null;
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

  const drblPool = seasonRows
    .filter((r) => hasValidDrblEstimate(r))
    .map((r) => r.drbl100)
    .filter((n) => Number.isFinite(n));
  const r1Sorted = [...seasonRows]
    .filter(
      (r) =>
        hasValidDrblEstimate(r) &&
        r.r1Points != null &&
        Number.isFinite(r.r1Points)
    )
    .sort((a, b) => (b.r1Points ?? 0) - (a.r1Points ?? 0));
  const r1RankBySeason = new Map<string, number>();
  r1Sorted.forEach((r, i) => r1RankBySeason.set(r.season, i + 1));

  const entries: SeasonRankEntry[] = seasonRows.map((row) => {
    const a = acc.get(row.season)!;
    const coverage =
      a.coverage ??
      ({
        season: row.season,
        teamId: row.teamId,
        teamName: row.teamName,
        gamesPlayed: row.gamesPlayed,
        minutes: row.minutes,
        mpg: row.minutes / Math.max(1, row.gamesPlayed),
        qualifying: isCareerQualifyingSeason(row),
        incomplete:
          row.season === nowSeason &&
          row.gamesPlayed < CAREER_RESUME_MIN_GAMES,
        production: row.gamesPlayed > 0,
        efficiency: row.trueShootingPct != null && row.trueShootingPct > 0,
        historicalImpact: Boolean(options.impacts?.get(row.season)),
        teamContext: Boolean(options.teams?.get(row.season)),
      } satisfies SeasonCoverageSnapshot);

    const eligible = coverage.qualifying && !coverage.incomplete;
    let eligibilityNote: string | null = null;
    if (!coverage.qualifying) {
      eligibilityNote = "Not eligible — insufficient sample for overall verdicts.";
    } else if (coverage.incomplete) {
      eligibilityNote = "Limited evidence — current season still in progress.";
    }

    const categoryWins = [...a.categoryCounts.entries()]
      .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
      .filter(([, n]) => n > 0)
      .slice(0, 6)
      .map(([label]) => label);

    const validDrbl = hasValidDrblEstimate(row);
    let drblSelectedPercentile: number | null = null;
    if (validDrbl && drblPool.length) {
      const below = drblPool.filter((v) => v < row.drbl100).length;
      drblSelectedPercentile = (below / drblPool.length) * 100;
    }

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
      drblLeagueRank:
        validDrbl && row.drblRank != null && row.drblRank > 0
          ? row.drblRank
          : null,
      drbl100: validDrbl ? row.drbl100 : null,
      drblSelectedPercentile,
      r1PointsSelectedRank: r1RankBySeason.get(row.season) ?? null,
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
  const contested = hasWinCycle(eligibleIds, beats);
  const contestedNote = contested
    ? "Pairwise wins among eligible seasons form a cycle. The Copeland order is shown, but seasons are closely contested — inspect the matrix."
    : null;

  const closeTop =
    eligible.length >= 2 &&
    Math.abs(eligible[0]!.copelandPoints - eligible[1]!.copelandPoints) <= 0.5;
  const closeTopNote = closeTop
    ? `${eligible[0]!.season} and ${eligible[1]!.season} are separated by very little pairwise evidence.`
    : null;

  const matrix: PairwiseMatrixCell[][] = seasonIds.map((rowSeason) =>
    seasonIds.map((colSeason) => {
      if (rowSeason === colSeason) {
        return {
          rowSeason,
          colSeason,
          result: "self",
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
          result: "unavailable",
          href: seasonComparePath(linkId, rowSeason, colSeason),
        };
      }
      let result: PairwiseMatrixResult = "unavailable";
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

  const productionAppendix = seasonRows
    .map((r) => ({ season: r.season, cpi: careerProductionIndex(r) }))
    .sort((a, b) => b.cpi - a.cpi || a.season.localeCompare(b.season));

  return {
    playerId,
    playerName: options.playerName,
    seasons: seasonIds,
    scope: "regular_season",
    ranking,
    pairwise,
    matrix,
    topSeasonWhy,
    contested,
    contestedNote,
    closeTop,
    closeTopNote,
    methodology: PLAYER_SEASON_RANK_METHODOLOGY,
    productionAppendix,
    error: null,
  };
}

/**
 * Back-compat wrapper: multi-season ranking via pairwise Copeland.
 * Production appendix remains available; it is NOT the ranking model.
 */
export function comparePlayerSeasonSet(options: {
  playerId: string;
  playerName: string;
  seasons: PlayerSeason[];
  impacts?: Map<string, SeasonImpactSnapshot | null>;
  teams?: Map<string, Pick<TeamSeasonStats, "avgDiff" | "abbreviation"> | null>;
  nowSeason?: string;
}): PlayerSeasonRanking & {
  provisionalProductionRank: Array<{
    season: string;
    cpi: number;
    qualifying: boolean;
    incomplete: boolean;
  }>;
  note: string;
} {
  const ranking = rankPlayerSeasons(options);
  return {
    ...ranking,
    provisionalProductionRank: ranking.productionAppendix.map((r) => {
      const entry = ranking.ranking.find((x) => x.season === r.season);
      return {
        season: r.season,
        cpi: r.cpi,
        qualifying: entry?.coverage.qualifying ?? false,
        incomplete: entry?.coverage.incomplete ?? false,
      };
    }),
    note: "Overall ranking uses pairwise Copeland aggregation of comparePlayerSeasons. provisionalProductionRank / productionAppendix is CPI-only and is not the ranking model.",
  };
}

export function seasonWinGraphHasCycle(
  seasons: string[],
  beats: Map<string, Set<string>>
): boolean {
  return hasWinCycle(seasons, beats);
}

export function seasonRankPath(
  playerId: string,
  seasons: string[]
): string {
  const params = new URLSearchParams({
    seasons: seasons.join(","),
  });
  return `/players/${playerId}/season-rank?${params.toString()}`;
}

/** Default season picks: most recent qualifying seasons up to DEFAULT. */
export function defaultRankSeasons(
  career: PlayerSeason[],
  options: { nowSeason?: string; limit?: number; prefer?: string[] } = {}
): string[] {
  const limit = options.limit ?? PLAYER_SEASON_RANK_DEFAULT;
  const nowSeason =
    options.nowSeason ??
    canonicalSeasonFromStartYear(currentNbaStartYear());
  const prefer = options.prefer ?? [];
  const bySeason = new Map<string, PlayerSeason>();
  for (const row of career) {
    const existing = bySeason.get(row.season);
    if (!existing || row.gamesPlayed > existing.gamesPlayed) {
      bySeason.set(row.season, row);
    }
  }
  const qualifying = [...bySeason.values()]
    .filter(
      (r) =>
        isCareerQualifyingSeason(r) &&
        !(r.season === nowSeason && r.gamesPlayed < CAREER_RESUME_MIN_GAMES)
    )
    .sort(
      (a, b) =>
        careerProductionIndex(b) - careerProductionIndex(a) ||
        b.season.localeCompare(a.season)
    );

  const picked: string[] = [];
  for (const s of prefer) {
    if (bySeason.has(s) && !picked.includes(s)) picked.push(s);
  }
  for (const row of qualifying) {
    if (picked.length >= limit) break;
    if (!picked.includes(row.season)) picked.push(row.season);
  }
  // Fill with any remaining seasons if still short
  const rest = [...bySeason.keys()].sort((a, b) => b.localeCompare(a));
  for (const s of rest) {
    if (picked.length >= Math.min(limit, PLAYER_SEASON_RANK_MAX)) break;
    if (!picked.includes(s)) picked.push(s);
  }
  return picked.slice(0, PLAYER_SEASON_RANK_MAX);
}
