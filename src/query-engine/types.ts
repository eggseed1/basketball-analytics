/**
 * ASK DRBL AST + result contracts.
 * Expand executable fields only when an executor exists.
 */

export const ASK_DRBL_VERSION = 1;

/** @deprecated Prefer pickAskExamples() — kept for older imports. */
export const ASK_DRBL_EXAMPLE_PROMPTS = [
  "What was Jokic's TS% in 2024-25?",
  "What was Denver's point differential in 2023-24?",
  "Who led the NBA in TS% in 2024-25?",
  "Compare Jokic's 2023-24 and 2024-25 seasons.",
  "Rank Jokic's seasons.",
  "Compare Minnesota and Oklahoma City in 2024-25.",
  "What were Denver's biggest wins in 2023-24?",
  "What happened to Phoenix this offseason?",
] as const;

export type QueryEntity =
  | { kind: "player"; id: string; name?: string }
  | { kind: "team"; id: string; name?: string }
  | { kind: "lineup"; playerIds: string[] };

export type QueryWhen = {
  seasons?: string[];
  dateFrom?: string;
  dateTo?: string;
  gameId?: string;
  quarter?: number;
  /** Seconds remaining in period, inclusive upper bound. */
  clockMaxSeconds?: number;
  /** Absolute score margin band, e.g. within 5. */
  marginMax?: number;
};

export type QueryWhere =
  | { zone: "rim" | "paint" | "midrange" | "three" | "college_three" }
  | { custom: string };

export type QuerySituation = {
  homeAway?: "home" | "away";
  leading?: boolean;
  trailing?: boolean;
  clutch?: boolean;
  transition?: boolean;
  halfcourt?: boolean;
  afterOffensiveRebound?: boolean;
};

export type QueryEvent =
  | "fg"
  | "fg2"
  | "fg3"
  | "ft"
  | "reb"
  | "ast"
  | "tov"
  | "foul"
  | "possession";

/** Legacy stub metrics — prefer AskMetricId for ASK DRBL v1. */
export type QueryMetric =
  | "fg_pct"
  | "efg_pct"
  | "ts_pct"
  | "ppp"
  | "points"
  | "attempts"
  | "makes"
  | "frequency"
  | "rate"
  | "percentile";

export type QueryOperation =
  | "season_stat"
  | "team_season_stat"
  | "leaderboard"
  | "season_compare"
  | "team_season_compare"
  | "team_season_rank"
  | "team_season_game_evidence"
  | "season_rank"
  | "career_resume"
  | "game_lab"
  | "box_score_context"
  | "offseason_summary";

export type AskMetricId =
  | "ppg"
  | "rpg"
  | "apg"
  | "spg"
  | "bpg"
  | "tov"
  | "mpg"
  | "fg_pct"
  | "fg3_pct"
  | "ft_pct"
  | "ts_pct"
  | "efg_pct"
  | "usg_pct"
  | "darko"
  | "lebron"
  | "drbl100"
  | "r1_points"
  | "r1_win_eq"
  | "drbl_o"
  | "drbl_d"
  | "drbl_p"
  | "drbl_ln"
  | "drbl_b"
  | "cpi"
  | "team_ppg"
  | "team_opp_ppg"
  | "team_diff"
  | "team_efg"
  | "team_ts"
  | "team_fg3"
  | "team_tov"
  | "team_rpg"
  | "points"
  | "rebounds"
  | "assists";

export type AskMetricDef = {
  id: AskMetricId;
  label: string;
  synonyms: string[];
  /** Player-season board field or derived. */
  scope: "player_season" | "team_season" | "either" | "derived";
  learnHref?: string;
  format: "pct" | "number" | "per_game" | "impact";
};

/**
 * Structured Basketball Query AST.
 * Future PBP fields (where / situation / clock) may appear on the AST
 * only as unsupported markers until executors exist.
 */
export type BasketballQueryAst = {
  version: 1;
  operation: QueryOperation;
  entities: QueryEntity[];
  when?: QueryWhen;
  where?: QueryWhere;
  situation?: QuerySituation;
  event?: QueryEvent;
  /** Canonical ASK metric when the operation needs one. */
  metricId?: AskMetricId;
  /** Legacy stub field — kept for compatibility; prefer metricId. */
  metric?: QueryMetric;
  /** Human-readable interpretation shown with the result. */
  interpretation: string[];
  /** Unsupported clauses the parser refused to invent. */
  unsupported?: string[];
  unsupportedReason?: string;
  /** Set when entity resolution found multiple matches. */
  ambiguous?: Array<{
    kind: "player" | "team";
    query: string;
    candidates: Array<{ id: string; name: string; subtitle?: string }>;
  }>;
  rawQuery?: string;
  /** Season phrases that were mapped (e.g. last season → 2025-26). */
  seasonNotes?: string[];
  /**
   * How the active season(s) were chosen.
   * Precedence: explicit query > builder (via composed text) > Time Machine/URL > default.
   */
  seasonSource?: "explicit" | "time_machine" | "url" | "default";
  /** Time Machine date on the shareable URL — display only until date-capable executors exist. */
  contextDate?: string;
  /** Always false in v1 — date is never applied to season-level executors. */
  contextDateApplied?: boolean;
  /** When partial: deterministic rewrite for the supported clause. */
  partialSupportedQuery?: string;
  partialSupportedSummary?: string;
};

export type QueryValidation =
  | { ok: true; ast: BasketballQueryAst }
  | { ok: false; status: AskDrblStatus; errors: string[]; ast: BasketballQueryAst };

export type AskDrblStatus =
  | "ok"
  | "unsupported"
  | "partial"
  | "ambiguous"
  | "invalid"
  | "no_result"
  | "insufficient_data";

export type AskQueryPlanRow = { label: string; value: string };

export type AskDrblResult = {
  status: AskDrblStatus;
  version: number;
  rawQuery: string;
  ast: BasketballQueryAst;
  interpretation: string[];
  queryPlan?: AskQueryPlanRow[];
  headline?: string;
  valueDisplay?: string;
  detailLines?: string[];
  contextLines?: string[];
  methodology?: string[];
  source?: string;
  limitations?: string[];
  links?: Array<{ label: string; href: string }>;
  errors?: string[];
  /** Opaque payload for advanced UI sections (compare/rank/ambiguous/partial). */
  payload?: Record<string, unknown>;
};
