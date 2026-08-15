/**
 * Season Evidence — deterministic representative games for a season profile.
 *
 * Uses lightweight GameSummary scoreboard rows only (no Game Lab / box fetch).
 * Descriptive, not causal. No opaque “best game” score.
 * v1: team subject. Player subjects can reuse the same shape later.
 */

import type { GameSummary } from "@/data/types";
import { seasonEvidenceGameLabHref } from "@/analytics/game-season-context";

export const SEASON_EVIDENCE_VERSION = "1.0";
export const SEASON_EVIDENCE_MAX_GAMES = 5;

export type SeasonEvidenceSubjectKind = "team"; // future: "player"

export type SeasonEvidenceCategoryId =
  | "largest_win"
  | "largest_loss"
  | "highest_scoring"
  | "lowest_scoring"
  | "best_defense";

export type SeasonEvidenceCategoryDef = {
  id: SeasonEvidenceCategoryId;
  label: string;
  formula: string;
  /** Ranking categories this evidence can illustrate when present. */
  rankHints: string[];
};

/** Supported v1 categories — schedule scores only. */
export const SEASON_EVIDENCE_CATEGORIES: SeasonEvidenceCategoryDef[] = [
  {
    id: "largest_win",
    label: "Largest win",
    formula:
      "max(teamPoints − opponentPoints) among final regular-season wins; ties → higher teamPoints, then later gameDate, then game id",
    rankHints: ["Performance"],
  },
  {
    id: "largest_loss",
    label: "Largest defeat",
    formula:
      "min(teamPoints − opponentPoints) among final regular-season losses; ties → lower teamPoints, then later gameDate, then game id",
    rankHints: ["Performance"],
  },
  {
    id: "highest_scoring",
    label: "Highest-scoring game",
    formula:
      "max(teamPoints); ties → larger margin, then later gameDate, then game id",
    rankHints: ["Performance", "Shooting"],
  },
  {
    id: "lowest_scoring",
    label: "Lowest-scoring game",
    formula:
      "min(teamPoints); ties → smaller (more negative) margin, then later gameDate, then game id",
    rankHints: ["Performance"],
  },
  {
    id: "best_defense",
    label: "Best defensive result",
    formula:
      "min(opponentPoints); ties → larger margin, then later gameDate, then game id",
    rankHints: ["Performance"],
  },
];

/** Documented as unavailable without per-game team box aggregates. */
export const SEASON_EVIDENCE_UNSUPPORTED = [
  "Best / worst eFG% or TS% game — not on schedule rows; requires box/Game Lab aggregates.",
  "Best rebounding game — no team game rebound fields on GameSummary.",
  "Turnover differential — not on GameSummary.",
  "Pace / possessions / win probability / PBP importance — not available.",
] as const;

export type SeasonEvidenceMethodology = {
  version: string;
  scope: "regular_season";
  selectionRule: string;
  groupingRule: string;
  tieRule: string;
  languageRule: string;
  unsupportedNote: string;
};

export const SEASON_EVIDENCE_METHODOLOGY: SeasonEvidenceMethodology = {
  version: SEASON_EVIDENCE_VERSION,
  scope: "regular_season",
  selectionRule:
    "Each category picks one final regular-season game by an explicit formula on team/opponent points. No composite game score.",
  groupingRule:
    "Findings that land on the same game are merged into one card listing every reason it appears (max 5 games).",
  tieRule:
    "Ties break by secondary score criteria (documented per category), then later gameDate, then game id.",
  languageRule:
    "Labels are descriptive (largest win, highest-scoring). Never “most important” or causal “won because.”",
  unsupportedNote: SEASON_EVIDENCE_UNSUPPORTED.join(" "),
};

export type SeasonEvidenceSubject = {
  kind: SeasonEvidenceSubjectKind;
  teamId: string;
  abbreviation: string;
  fullName: string;
  /** Extra ids/abbrs that identify the same franchise on game rows. */
  matchTeamIds: string[];
  matchAbbrs: string[];
};

export type SeasonEvidenceFinding = {
  categoryId: SeasonEvidenceCategoryId;
  label: string;
  valueDisplay: string;
  formula: string;
  gameId: string;
  rankHints: string[];
};

export type SeasonEvidenceGameCard = {
  gameId: string;
  gameDate: string;
  season: string;
  opponentLabel: string;
  isHome: boolean;
  teamScore: number;
  opponentScore: number;
  margin: number;
  result: "W" | "L" | "—";
  findings: Array<{
    categoryId: SeasonEvidenceCategoryId;
    label: string;
    valueDisplay: string;
  }>;
  href: string;
};

export type SeasonEvidenceCategoryCoverage = {
  id: SeasonEvidenceCategoryId;
  label: string;
  available: boolean;
  note: string | null;
};

export type SeasonEvidenceCoverage = {
  gameCount: number;
  categories: SeasonEvidenceCategoryCoverage[];
  unsupported: string[];
};

export type TeamSeasonEvidence = {
  subject: SeasonEvidenceSubject;
  season: string;
  findings: SeasonEvidenceFinding[];
  games: SeasonEvidenceGameCard[];
  methodology: SeasonEvidenceMethodology;
  coverage: SeasonEvidenceCoverage;
  error: string | null;
};

type Perspective = {
  game: GameSummary;
  isHome: boolean;
  teamScore: number;
  oppScore: number;
  margin: number;
  oppLabel: string;
  result: "W" | "L" | "—";
};

function subjectAbbrs(subject: SeasonEvidenceSubject): Set<string> {
  return new Set(
    subject.matchAbbrs
      .map((a) => a.toLowerCase())
      .concat(subject.abbreviation.toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Franchise match for schedule rows.
 * When abbreviations are present on the game, prefer abbr — never treat bare
 * numeric team ids as cross-provider universal (ESPN 25 ≠ BDL 25).
 * Category formulas are unchanged; this is identity input only.
 */
function matchesTeam(game: GameSummary, subject: SeasonEvidenceSubject): boolean {
  const abbrs = subjectAbbrs(subject);
  const homeAbbr = game.homeTeamAbbr?.toLowerCase();
  const awayAbbr = game.awayTeamAbbr?.toLowerCase();
  const hasGameAbbr = Boolean(homeAbbr || awayAbbr);

  if (hasGameAbbr && abbrs.size > 0) {
    return (
      (!!homeAbbr && abbrs.has(homeAbbr)) ||
      (!!awayAbbr && abbrs.has(awayAbbr))
    );
  }

  // Id fallback only when schedule rows lack abbreviations.
  const ids = new Set(subject.matchTeamIds.map(String));
  return ids.has(game.homeTeamId) || ids.has(game.awayTeamId);
}

function perspective(
  game: GameSummary,
  subject: SeasonEvidenceSubject
): Perspective | null {
  if (!matchesTeam(game, subject)) return null;
  const abbrs = subjectAbbrs(subject);
  const homeAbbr = game.homeTeamAbbr?.toLowerCase();
  const awayAbbr = game.awayTeamAbbr?.toLowerCase();
  const hasGameAbbr = Boolean(homeAbbr || awayAbbr);

  let isHome: boolean;
  if (hasGameAbbr && abbrs.size > 0) {
    isHome = !!homeAbbr && abbrs.has(homeAbbr);
  } else {
    const ids = new Set(subject.matchTeamIds.map(String));
    isHome = ids.has(game.homeTeamId);
  }

  const teamScore = isHome ? game.homeScore : game.awayScore;
  const oppScore = isHome ? game.awayScore : game.homeScore;
  const oppLabel = isHome
    ? game.awayTeamAbbr ?? game.awayTeamName ?? "OPP"
    : game.homeTeamAbbr ?? game.homeTeamName ?? "OPP";
  let result: "W" | "L" | "—" = "—";
  if (teamScore > oppScore) result = "W";
  else if (teamScore < oppScore) result = "L";
  return {
    game,
    isHome,
    teamScore,
    oppScore,
    margin: teamScore - oppScore,
    oppLabel,
    result,
  };
}

function isEligibleFinal(game: GameSummary): boolean {
  if (game.gameType && game.gameType !== "regular") return false;
  if (game.status && game.status !== "final") return false;
  if (game.homeScore === 0 && game.awayScore === 0) return false;
  return true;
}

/** Later date wins; then larger game id lexicographically. */
function tieDateId(a: GameSummary, b: GameSummary): number {
  return b.gameDate.localeCompare(a.gameDate) || b.id.localeCompare(a.id);
}

function pickLargestWin(rows: Perspective[]): Perspective | null {
  const wins = rows.filter((r) => r.margin > 0);
  if (!wins.length) return null;
  return [...wins].sort(
    (a, b) =>
      b.margin - a.margin ||
      b.teamScore - a.teamScore ||
      tieDateId(a.game, b.game)
  )[0]!;
}

function pickLargestLoss(rows: Perspective[]): Perspective | null {
  const losses = rows.filter((r) => r.margin < 0);
  if (!losses.length) return null;
  return [...losses].sort(
    (a, b) =>
      a.margin - b.margin ||
      a.teamScore - b.teamScore ||
      tieDateId(a.game, b.game)
  )[0]!;
}

function pickHighestScoring(rows: Perspective[]): Perspective | null {
  if (!rows.length) return null;
  return [...rows].sort(
    (a, b) =>
      b.teamScore - a.teamScore ||
      b.margin - a.margin ||
      tieDateId(a.game, b.game)
  )[0]!;
}

function pickLowestScoring(rows: Perspective[]): Perspective | null {
  if (!rows.length) return null;
  return [...rows].sort(
    (a, b) =>
      a.teamScore - b.teamScore ||
      a.margin - b.margin ||
      tieDateId(a.game, b.game)
  )[0]!;
}

function pickBestDefense(rows: Perspective[]): Perspective | null {
  if (!rows.length) return null;
  return [...rows].sort(
    (a, b) =>
      a.oppScore - b.oppScore ||
      b.margin - a.margin ||
      tieDateId(a.game, b.game)
  )[0]!;
}

function valueFor(
  id: SeasonEvidenceCategoryId,
  row: Perspective
): string {
  switch (id) {
    case "largest_win":
      return `+${row.margin}`;
    case "largest_loss":
      return `${row.margin}`;
    case "highest_scoring":
    case "lowest_scoring":
      return `${row.teamScore} pts`;
    case "best_defense":
      return `${row.oppScore} opp pts`;
  }
}

/**
 * Build team season evidence from lightweight game summaries.
 * Does not fetch box scores or Game Lab.
 */
export function buildTeamSeasonEvidence(options: {
  subject: Omit<SeasonEvidenceSubject, "kind"> & {
    kind?: SeasonEvidenceSubjectKind;
  };
  season: string;
  games: GameSummary[];
  maxGames?: number;
}): TeamSeasonEvidence {
  const subject: SeasonEvidenceSubject = {
    kind: "team",
    teamId: options.subject.teamId,
    abbreviation: options.subject.abbreviation,
    fullName: options.subject.fullName,
    // Empty array = abbr-only matching (cross-provider safe). Undefined = legacy fallback.
    matchTeamIds:
      options.subject.matchTeamIds !== undefined
        ? options.subject.matchTeamIds
        : [options.subject.teamId],
    matchAbbrs: options.subject.matchAbbrs?.length
      ? options.subject.matchAbbrs
      : [options.subject.abbreviation],
  };
  const maxGames = options.maxGames ?? SEASON_EVIDENCE_MAX_GAMES;

  const emptyCoverage = (
    gameCount: number,
    available: Partial<Record<SeasonEvidenceCategoryId, boolean>> = {}
  ): SeasonEvidenceCoverage => ({
    gameCount,
    categories: SEASON_EVIDENCE_CATEGORIES.map((c) => ({
      id: c.id,
      label: c.label,
      available: available[c.id] ?? false,
      note: available[c.id]
        ? null
        : gameCount === 0
          ? "No final regular-season games in the loaded set."
          : "No game satisfied this category.",
    })),
    unsupported: [...SEASON_EVIDENCE_UNSUPPORTED],
  });

  const rows: Perspective[] = [];
  for (const g of options.games) {
    if (options.season && g.season && g.season !== options.season) continue;
    if (!isEligibleFinal(g)) continue;
    const p = perspective(g, subject);
    if (p) rows.push(p);
  }

  if (rows.length === 0) {
    return {
      subject,
      season: options.season,
      findings: [],
      games: [],
      methodology: SEASON_EVIDENCE_METHODOLOGY,
      coverage: emptyCoverage(0),
      error: `No final regular-season games found for ${subject.fullName} in ${options.season}.`,
    };
  }

  const picks: Array<{
    def: SeasonEvidenceCategoryDef;
    row: Perspective;
  }> = [];

  const add = (
    def: SeasonEvidenceCategoryDef,
    row: Perspective | null
  ) => {
    if (row) picks.push({ def, row });
  };

  add(SEASON_EVIDENCE_CATEGORIES[0]!, pickLargestWin(rows));
  add(SEASON_EVIDENCE_CATEGORIES[1]!, pickLargestLoss(rows));
  add(SEASON_EVIDENCE_CATEGORIES[2]!, pickHighestScoring(rows));
  add(SEASON_EVIDENCE_CATEGORIES[3]!, pickLowestScoring(rows));
  add(SEASON_EVIDENCE_CATEGORIES[4]!, pickBestDefense(rows));

  const findings: SeasonEvidenceFinding[] = picks.map(({ def, row }) => ({
    categoryId: def.id,
    label: def.label,
    valueDisplay: valueFor(def.id, row),
    formula: def.formula,
    gameId: row.game.id,
    rankHints: def.rankHints,
  }));

  // Group by game; preserve first-seen category order (priority list above).
  const byGame = new Map<
    string,
    { row: Perspective; findings: SeasonEvidenceFinding[] }
  >();
  for (const f of findings) {
    const pick = picks.find((p) => p.def.id === f.categoryId)!;
    const existing = byGame.get(f.gameId);
    if (existing) {
      existing.findings.push(f);
    } else {
      byGame.set(f.gameId, { row: pick.row, findings: [f] });
    }
  }

  // Prefer games that cover earlier (higher-priority) findings.
  const priority = new Map(
    SEASON_EVIDENCE_CATEGORIES.map((c, i) => [c.id, i])
  );
  const orderedGames = [...byGame.values()].sort((a, b) => {
    const pa = Math.min(...a.findings.map((f) => priority.get(f.categoryId)!));
    const pb = Math.min(...b.findings.map((f) => priority.get(f.categoryId)!));
    return pa - pb || b.row.game.gameDate.localeCompare(a.row.game.gameDate);
  });

  const games: SeasonEvidenceGameCard[] = orderedGames
    .slice(0, maxGames)
    .map(({ row, findings: fs }) => ({
      gameId: row.game.id,
      gameDate: row.game.gameDate,
      season: row.game.season,
      opponentLabel: row.oppLabel,
      isHome: row.isHome,
      teamScore: row.teamScore,
      opponentScore: row.oppScore,
      margin: row.margin,
      result: row.result,
      findings: fs.map((f) => ({
        categoryId: f.categoryId,
        label: f.label,
        valueDisplay: f.valueDisplay,
      })),
      href: seasonEvidenceGameLabHref(
        row.game.id,
        fs[0]?.categoryId ?? null
      ),
    }));

  const shownIds = new Set(games.map((g) => g.gameId));
  const findingsShown = findings.filter((f) => shownIds.has(f.gameId));

  const available: Partial<Record<SeasonEvidenceCategoryId, boolean>> = {};
  for (const f of findingsShown) available[f.categoryId] = true;

  return {
    subject,
    season: options.season,
    findings: findingsShown,
    games,
    methodology: SEASON_EVIDENCE_METHODOLOGY,
    coverage: {
      ...emptyCoverage(rows.length, available),
      categories: SEASON_EVIDENCE_CATEGORIES.map((c) => ({
        id: c.id,
        label: c.label,
        available: Boolean(available[c.id]),
        note: available[c.id]
          ? null
          : findings.some((f) => f.categoryId === c.id)
            ? "Selected but omitted from the display cap."
            : "No game satisfied this category.",
      })),
    },
    error: null,
  };
}

/**
 * Prefer evidence categories that illustrate rank ledger advantages.
 * Schedule-level data cannot illustrate Efficiency / Shooting / Rebounding /
 * Possessions with eFG/TS/ORB/TOV — those stay uncovered here.
 */
export function preferredEvidenceForRankHints(
  categoryLabels: string[]
): SeasonEvidenceCategoryId[] {
  const set = new Set(categoryLabels.map((l) => l.toLowerCase()));
  const out: SeasonEvidenceCategoryId[] = [];
  if (set.has("performance")) {
    out.push("largest_win", "best_defense", "highest_scoring");
  }
  // Efficiency / Shooting / Rebounding / Possessions: no schedule-level metric.
  return out;
}

/**
 * Compact Team Profile glimpse — prefers descriptive categories already present
 * on the evidence result. Does not re-score games.
 */
export const TEAM_PROFILE_EVIDENCE_SUMMARY_ORDER: SeasonEvidenceCategoryId[] = [
  "largest_win",
  "largest_loss",
  "highest_scoring",
  "best_defense",
  "lowest_scoring",
];

export type TeamProfileEvidenceSummaryItem = {
  categoryId: SeasonEvidenceCategoryId;
  label: string;
  /** Shorter label for dense Team Profile rows. */
  shortLabel: string;
  valueDisplay: string;
  gameId: string;
};

const SHORT_LABELS: Record<SeasonEvidenceCategoryId, string> = {
  largest_win: "Largest win",
  largest_loss: "Largest defeat",
  highest_scoring: "Highest scoring",
  lowest_scoring: "Lowest scoring",
  best_defense: "Best defense",
};

export function summarizeTeamSeasonEvidenceForProfile(
  evidence: TeamSeasonEvidence,
  options?: { maxItems?: number }
): TeamProfileEvidenceSummaryItem[] {
  const maxItems = options?.maxItems ?? 4;
  const byId = new Map(
    evidence.findings.map((f) => [f.categoryId, f] as const)
  );
  const out: TeamProfileEvidenceSummaryItem[] = [];
  for (const id of TEAM_PROFILE_EVIDENCE_SUMMARY_ORDER) {
    if (out.length >= maxItems) break;
    const f = byId.get(id);
    if (!f) continue;
    out.push({
      categoryId: f.categoryId,
      label: f.label,
      shortLabel: SHORT_LABELS[f.categoryId],
      valueDisplay: f.valueDisplay,
      gameId: f.gameId,
    });
  }
  return out;
}

export function gameLabPath(gameId: string): string {
  return seasonEvidenceGameLabHref(gameId);
}
