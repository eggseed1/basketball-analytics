/**
 * Documented semantics for BDL advanced rating-like fields.
 *
 * FIELD NAME ≠ VERIFIED SEMANTICS.
 * Game-advanced attribute notes must not be assumed for season_averages.
 */

export type SemanticGrain =
  | "player-game"
  | "player-season"
  | "team-game"
  | "team-season"
  | "on-court-lineup"
  | "other"
  | "unknown";

export type SemanticCandidateUse =
  | "do_not_admit"
  | "candidate_individual_rating"
  | "candidate_on_court_rating"
  | "candidate_rate"
  | "unverified";

export type AdvancedFieldSemanticRow = {
  field: string;
  sourceDefinition: string;
  grain: SemanticGrain;
  meaning: string;
  candidateDrblUse: SemanticCandidateUse;
  evidence: string;
};

/**
 * Semantic audit table for candidate advanced fields.
 * Season-averages `stats` keys are not field-documented in BDL season_averages docs;
 * game-advanced notes are listed separately and must not be transplanted.
 */
export const BDL_ADVANCED_FIELD_SEMANTICS: AdvancedFieldSemanticRow[] = [
  {
    field: "offensive_rating (game advanced /nba/v2/stats/advanced)",
    sourceDefinition:
      "Team points scored per 100 possessions while the player is on court",
    grain: "on-court-lineup",
    meaning: "On-court team offensive rating for that game, not individual ORtg",
    candidateDrblUse: "do_not_admit",
    evidence: "BDL docs Game Advanced Stats Attributes (v1/v2)",
  },
  {
    field: "defensive_rating (game advanced /nba/v2/stats/advanced)",
    sourceDefinition:
      "Points per 100 possessions the team allows while that individual player is on the court",
    grain: "on-court-lineup",
    meaning: "On-court team defensive rating for that game, not individual DRtg",
    candidateDrblUse: "do_not_admit",
    evidence: "BDL docs Game Advanced Stats Attributes (v1/v2)",
  },
  {
    field: "net_rating (game advanced /nba/v2/stats/advanced)",
    sourceDefinition:
      "Team point differential per 100 possessions while the player is on court",
    grain: "on-court-lineup",
    meaning: "On-court team net rating for that game",
    candidateDrblUse: "do_not_admit",
    evidence: "BDL docs Game Advanced Stats Attributes (v1/v2)",
  },
  {
    field: "usage_percentage (game advanced)",
    sourceDefinition:
      "Percentage of team plays used by a player when they are on the floor",
    grain: "player-game",
    meaning: "Player usage share while on floor (game grain)",
    candidateDrblUse: "do_not_admit",
    evidence: "BDL docs Game Advanced Stats Attributes — game grain only",
  },
  {
    field: "true_shooting_percentage (game advanced)",
    sourceDefinition:
      "Shooting percentage factoring 2PT, 3PT, and free throws",
    grain: "player-game",
    meaning: "Player TS% for that game",
    candidateDrblUse: "do_not_admit",
    evidence: "BDL docs Game Advanced Stats Attributes — game grain only",
  },
  {
    field: "effective_field_goal_percentage (game advanced)",
    sourceDefinition:
      "FG% adjusting for made 3PT being 1.5× as valuable as 2PT",
    grain: "player-game",
    meaning: "Player eFG% for that game",
    candidateDrblUse: "do_not_admit",
    evidence: "BDL docs Game Advanced Stats Attributes — game grain only",
  },
  {
    field: "offensive_rating (season_averages general?type=advanced)",
    sourceDefinition:
      "Not field-documented in season_averages docs; stats keys are type-specific with additionalProperties",
    grain: "unknown",
    meaning:
      "Unknown — must not assume individual player ORtg or transplant game-advanced on-court definition",
    candidateDrblUse: "unverified",
    evidence:
      "BDL season_averages docs: shared row shape (player, season, season_type, stats); no advanced-type field glossary",
  },
  {
    field: "defensive_rating (season_averages general?type=advanced)",
    sourceDefinition:
      "Not field-documented in season_averages docs",
    grain: "unknown",
    meaning:
      "Unknown — must not assume individual player DRtg",
    candidateDrblUse: "unverified",
    evidence:
      "BDL season_averages docs lack per-field definitions for type=advanced",
  },
  {
    field: "net_rating (season_averages general?type=advanced)",
    sourceDefinition:
      "Not field-documented in season_averages docs",
    grain: "unknown",
    meaning:
      "Unknown — must not assume individual player NET",
    candidateDrblUse: "unverified",
    evidence:
      "BDL season_averages docs lack per-field definitions for type=advanced",
  },
  {
    field: "usage_percentage (season_averages general?type=advanced)",
    sourceDefinition:
      "Not field-documented in season_averages docs (usage also has type=usage)",
    grain: "unknown",
    meaning: "Unknown until live stats keys + glossary confirmed",
    candidateDrblUse: "unverified",
    evidence: "BDL season_averages docs; separate type=usage exists",
  },
  {
    field: "true_shooting_percentage (season_averages general?type=advanced)",
    sourceDefinition: "Not field-documented in season_averages docs",
    grain: "unknown",
    meaning: "Unknown until live stats keys + glossary confirmed",
    candidateDrblUse: "unverified",
    evidence: "BDL season_averages docs lack per-field definitions",
  },
  {
    field: "effective_field_goal_percentage (season_averages general?type=advanced)",
    sourceDefinition: "Not field-documented in season_averages docs",
    grain: "unknown",
    meaning: "Unknown until live stats keys + glossary confirmed",
    candidateDrblUse: "unverified",
    evidence: "BDL season_averages docs lack per-field definitions",
  },
];

export type SeasonAveragesSemanticAssessment = {
  /** Documented response shape grain for the row itself. */
  rowGrain: SemanticGrain;
  rowGrainEvidence: string;
  /** Whether rating-like stats may be admitted as individual season metrics. */
  ratingSemantics: "compatible" | "incompatible" | "unverified" | "unknown";
  multiTeamRepresentation: string;
  notes: string[];
  table: AdvancedFieldSemanticRow[];
};

/**
 * Assess season_averages advanced semantics from documentation (+ optional observed keys).
 * Observing field names alone does NOT verify meaning.
 */
export function assessBdlSeasonAveragesAdvancedSemantics(options?: {
  observedStatKeys?: string[];
  access?: "unauthorized" | "ok" | "error" | "skipped";
}): SeasonAveragesSemanticAssessment {
  const notes: string[] = [
    "Season averages rows are documented as player + season + season_type + stats (player-season shaped).",
    "Advanced type stats keys are not glossary-documented — FIELD NAME ≠ VERIFIED SEMANTICS.",
    "Game-advanced on-court rating definitions must not be transplanted onto season averages.",
  ];

  if (options?.access === "unauthorized") {
    notes.push(
      "Live response not observed (unauthorized) — Access remains the sole blocker to semantic verification of live field keys."
    );
  }

  if (options?.observedStatKeys?.length) {
    notes.push(
      `Observed stats keys (names only, meaning unverified): ${options.observedStatKeys
        .slice(0, 40)
        .join(", ")}`
    );
  } else {
    notes.push("No live stats keys observed.");
  }

  return {
    rowGrain: "player-season",
    rowGrainEvidence:
      "BDL season_averages example: one object with player, season, season_type, stats",
    ratingSemantics: "unverified",
    multiTeamRepresentation:
      "Unknown — documented example has no team split fields; do not aggregate multi-team rows if they appear",
    notes,
    table: BDL_ADVANCED_FIELD_SEMANTICS,
  };
}
