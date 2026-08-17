/**
 * Fixed-fit vs refit convergence framework (M16b).
 * Does not change formulas — documents what can / cannot be scored fixed.
 */

export type FixedFitStatus =
  | "AVAILABLE"
  | "PARTIAL"
  | "NOT_IDENTIFIABLE_FIXED_FIT";

export interface FixedVsRefitPlan {
  experimentA: "FIXED_FIT_MORE_DATA";
  experimentB: "REFIT_MORE_DATA";
  components: Array<{
    name: string;
    fixedFitStatus: FixedFitStatus;
    notes: string;
  }>;
  playerFields: string[];
  decomposition: string[];
}

/**
 * Current DRBL components: which admit fixed-coefficient scoring on more data.
 */
export const FIXED_VS_REFIT_PLAN: FixedVsRefitPlan = {
  experimentA: "FIXED_FIT_MORE_DATA",
  experimentB: "REFIT_MORE_DATA",
  components: [
    {
      name: "DRBL-P / sequential attribution",
      fixedFitStatus: "AVAILABLE",
      notes:
        "P is possession-level residual attribution; re-aggregating on more games with same EPV/replacement rules is fixed-fit expansion of evidence.",
    },
    {
      name: "DRBL-LN",
      fixedFitStatus: "PARTIAL",
      notes:
        "Ridge Λ fixed, but coefficients are fit on lineup rows. Applying 400-game LN coefficients to new lineup rows is possible (FIXED); refitting on 1225 is REFIT. Both are identifiable.",
    },
    {
      name: "DRBL-B",
      fixedFitStatus: "PARTIAL",
      notes: "Same as LN: freeze behavior ridge betas vs refit.",
    },
    {
      name: "Fusion OOF stack",
      fixedFitStatus: "PARTIAL",
      notes:
        "Freeze fold/final ridge betas from 400-game fit and score new P/LN/B inputs (FIXED). Refitting folds on full sample is REFIT. OOF fold membership differs under REFIT.",
    },
    {
      name: "Posterior EB",
      fixedFitStatus: "AVAILABLE",
      notes: "priorMean=0 and k=200 are frozen constants; EB is a fixed transform of fusedRateRaw.",
    },
    {
      name: "WAR LOO calibration",
      fixedFitStatus: "PARTIAL",
      notes:
        "Can freeze slope/intercept/replacement from 400-game pipeline and apply to full-season posterior (FIXED). Refitting LOO on full sample is REFIT. Team-season CSV required.",
    },
  ],
  playerFields: [
    "score400_original",
    "scoreFull_fixedFit",
    "scoreFull_refit",
    "deltaEvidence",
    "deltaRefit",
    "deltaTotal",
  ],
  decomposition: [
    "deltaEvidence = scoreFull_fixedFit - score400_original",
    "deltaRefit = scoreFull_refit - scoreFull_fixedFit",
    "deltaTotal = scoreFull_refit - score400_original",
  ],
};

export function decomposeConvergence(args: {
  score400: number;
  scoreFullFixed: number | null;
  scoreFullRefit: number;
}): {
  deltaEvidence: number | null;
  deltaRefit: number | null;
  deltaTotal: number;
  status: FixedFitStatus;
} {
  const deltaTotal = args.scoreFullRefit - args.score400;
  if (args.scoreFullFixed == null || !Number.isFinite(args.scoreFullFixed)) {
    return {
      deltaEvidence: null,
      deltaRefit: null,
      deltaTotal,
      status: "NOT_IDENTIFIABLE_FIXED_FIT",
    };
  }
  return {
    deltaEvidence: args.scoreFullFixed - args.score400,
    deltaRefit: args.scoreFullRefit - args.scoreFullFixed,
    deltaTotal,
    status: "AVAILABLE",
  };
}
