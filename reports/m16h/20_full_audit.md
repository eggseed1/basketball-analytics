# M16h full audit

## Decision
**IDENTITY_SELECTED** (b_final=1)

## Key numbers
- Identity RMSE: 2.781961911853985
- Zero-linear RMSE: 2.7817700526948723
- Relative improvement: 0.007%
- Bootstrap P(zero beats id): 0.636
- Fold wins: 2/4
- Rolling b: 1.0769, 0.9453, 0.9587, 0.9178
- Stability: STABLE
- Affine RMSE: 2.7772185435299996
- BASELINE_SHIFT_SIGNAL: NO

## Charts
- charts/affine_diagnostic_calibration.svg
- charts/bias_by_sign_bin.svg
- charts/bootstrap_delta_rmse.svg
- charts/calibration_residual_by_decile.svg
- charts/identity_calibration.svg
- charts/identity_vs_calibrated_scatter.svg
- charts/identity_vs_zero_residuals.svg
- charts/pred_vs_target_distributions.svg
- charts/rmse_by_exposure_quartile.svg
- charts/rolling_b_by_fold.svg
- charts/zero_linear_calibration.svg

## Frozen
Production / WAR / uncertainty / O/D unchanged. RESERVED_TEST closed. VALIDATION unused for selection.
