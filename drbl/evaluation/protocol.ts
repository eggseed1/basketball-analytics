/**
 * DRBL evaluation protocol (M16b) — frozen rules for future experiments.
 * Does NOT change model mathematics.
 */

export const EVALUATION_PROTOCOL_VERSION = "drbl-eval-v1";
export const ELIGIBILITY_VERSION = "drbl-eligibility-v1";
export const TARGET_VERSION = "drbl-targets-v1";
export const FOLD_ASSIGNMENT_VERSION = "drbl-fusion-oof-chrono-mod-v1";

export type SplitName = "TRAIN" | "VALIDATION" | "RESERVED_TEST";

export interface MetricContract {
  primary: {
    name: "validation_rmse";
    description: string;
  };
  secondary: string[];
  rankingSecondary: string[];
  uncertainty: string[];
  decisionRule: string[];
  practicalSignificance: {
    requirePairedUncertainty: boolean;
    bootstrapResamples: number;
    confidenceLevel: number;
    categories: string[];
  };
}

export const METRIC_CONTRACT: MetricContract = {
  primary: {
    name: "validation_rmse",
    description:
      "RMSE of model predictions vs frozen future-impact / residual target on VALIDATION entities",
  },
  secondary: [
    "mae",
    "pearson",
    "spearman",
    "r2",
    "calibration_slope",
    "calibration_intercept",
  ],
  rankingSecondary: ["spearman_rank", "top_k_overlap"],
  uncertainty: [
    "interval_coverage",
    "log_likelihood_if_available",
  ],
  decisionRule: [
    "1. Reject candidates materially worse on primary VALIDATION RMSE (paired CI excludes 0 improvement).",
    "2. Among statistically indistinguishable models, prefer better calibration (slope nearer 1, intercept nearer 0).",
    "3. If still tied, prefer simpler model (fewer components / fewer free parameters).",
    "4. Rank correlation and top-k overlap are secondary and never override (1)–(3).",
  ],
  practicalSignificance: {
    requirePairedUncertainty: true,
    bootstrapResamples: 1000,
    confidenceLevel: 0.95,
    categories: [
      "statistically_supported_improvement",
      "practically_meaningful_improvement_TBD_with_CI",
      "indistinguishable",
      "worse",
    ],
  },
};

export interface HorizonDefinition {
  id: string;
  name: string;
  definition: string;
}

export const EVALUATION_HORIZONS: HorizonDefinition[] = [
  {
    id: "short",
    name: "next chronological block (~20% of remaining season games)",
    definition:
      "Target formed from the next earlyFrac continuation of games after feature cutoff within season",
  },
  {
    id: "medium",
    name: "rest-of-season within same season",
    definition: "All remaining regular-season games after feature cutoff",
  },
  {
    id: "long",
    name: "next-season player impact",
    definition:
      "Player-season residual/impact in the subsequent season (when available)",
  },
];

export interface EligibilityRules {
  version: string;
  minPossessions: number;
  minFutureObservations: number;
  competition: "regular_season_only";
  tradedPlayerAggregation: "player_season_pooled";
  missingComponent: "null_or_redistribute_per_fusion_rules";
  entity: "player_season";
}

export const ELIGIBILITY_RULES: EligibilityRules = {
  version: ELIGIBILITY_VERSION,
  minPossessions: 50,
  minFutureObservations: 20,
  competition: "regular_season_only",
  tradedPlayerAggregation: "player_season_pooled",
  missingComponent: "null_or_redistribute_per_fusion_rules",
  entity: "player_season",
};
