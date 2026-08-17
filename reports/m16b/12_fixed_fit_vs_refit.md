# Fixed-fit vs refit framework

Status: **PARTIAL**

{
  "experimentA": "FIXED_FIT_MORE_DATA",
  "experimentB": "REFIT_MORE_DATA",
  "components": [
    {
      "name": "DRBL-P / sequential attribution",
      "fixedFitStatus": "AVAILABLE",
      "notes": "P is possession-level residual attribution; re-aggregating on more games with same EPV/replacement rules is fixed-fit expansion of evidence."
    },
    {
      "name": "DRBL-LN",
      "fixedFitStatus": "PARTIAL",
      "notes": "Ridge Λ fixed, but coefficients are fit on lineup rows. Applying 400-game LN coefficients to new lineup rows is possible (FIXED); refitting on 1225 is REFIT. Both are identifiable."
    },
    {
      "name": "DRBL-B",
      "fixedFitStatus": "PARTIAL",
      "notes": "Same as LN: freeze behavior ridge betas vs refit."
    },
    {
      "name": "Fusion OOF stack",
      "fixedFitStatus": "PARTIAL",
      "notes": "Freeze fold/final ridge betas from 400-game fit and score new P/LN/B inputs (FIXED). Refitting folds on full sample is REFIT. OOF fold membership differs under REFIT."
    },
    {
      "name": "Posterior EB",
      "fixedFitStatus": "AVAILABLE",
      "notes": "priorMean=0 and k=200 are frozen constants; EB is a fixed transform of fusedRateRaw."
    },
    {
      "name": "WAR LOO calibration",
      "fixedFitStatus": "PARTIAL",
      "notes": "Can freeze slope/intercept/replacement from 400-game pipeline and apply to full-season posterior (FIXED). Refitting LOO on full sample is REFIT. Team-season CSV required."
    }
  ],
  "playerFields": [
    "score400_original",
    "scoreFull_fixedFit",
    "scoreFull_refit",
    "deltaEvidence",
    "deltaRefit",
    "deltaTotal"
  ],
  "decomposition": [
    "deltaEvidence = scoreFull_fixedFit - score400_original",
    "deltaRefit = scoreFull_refit - scoreFull_fixedFit",
    "deltaTotal = scoreFull_refit - score400_original"
  ]
}

## Current artifact comparison

M16a compared 400-game **refit** vs 1225-game **refit**.  
M16b provides the decomposition fields and component-level identifiability map.

`scoreFull_fixedFit` for fusion is **NOT_IDENTIFIABLE** until a harness applies frozen 400-game fold betas to full-sample inputs (no formula change).

Illustrative `deltaTotal` (refit only) is in `13_fixed_fit_vs_refit_players.csv`.
