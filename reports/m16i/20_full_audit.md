# M16i full audit

## Selection
**CONSTANT_SCALE_SELECTED** (U0)

## WIS
- U0: 4.43626047461963
- U1: 4.37438731883086 (rel 1.395%, P=1, folds 4/4)
- U2: 4.314058843592033 (rel 2.755%, P=1, folds 4/4)

## Selected coverage
50%=0.4963054187192118, 80%=0.7906403940886699, 95%=0.9353448275862069

## Final params
{
  "modelType": "U0_CONSTANT",
  "params": {
    "s": 2.6960956582451727
  },
  "quantiles": {
    "q50": 0.4950476886081375,
    "q80": 0.9906396697923614,
    "q95": 1.9842275977287305
  }
}

## Freeze readiness
RESEARCH_RATE_MODEL_FREEZE_READY = YES

## Charts
- charts/abs_error_vs_exposure.svg
- charts/bootstrap_delta_wis_u2_u0.svg
- charts/coverage_by_exposure_q_pi80.svg
- charts/coverage_vs_nominal.svg
- charts/legacy_hw_vs_abs_error.svg
- charts/mae_by_exposure_quartile.svg
- charts/per_fold_wis.svg
- charts/pi80_examples.svg
- charts/pi95_examples.svg
- charts/predicted_sigma_vs_exposure.svg
- charts/residual_signed_hist.svg
- charts/rmse_by_exposure_quartile.svg
- charts/sigma_vs_abs_error.svg
- charts/standardized_residual_abs.svg
- charts/width_by_exposure_q_pi80.svg
- charts/wis_by_candidate.svg
