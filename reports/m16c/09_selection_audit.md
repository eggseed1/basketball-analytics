# M16c selection audit

## Predeclared rule (METRIC_CONTRACT)

- 1. Reject candidates materially worse on primary VALIDATION RMSE (paired CI excludes 0 improvement).
- 2. Among statistically indistinguishable models, prefer better calibration (slope nearer 1, intercept nearer 0).
- 3. If still tied, prefer simpler model (fewer components / fewer free parameters).
- 4. Rank correlation and top-k overlap are secondary and never override (1)–(3).

Primary metric: **validation_rmse**

## Result

- winner: **M16C_P** (M16C_BASE_WINNER)
- validation RMSE: 2.409176880654843
- runner-up: M16C_P_B (RMSE 2.4094358701877994)
- delta RMSE (winner − runner-up via paired bootstrap point on winner vs runner-up baseline): -0.000258989532956555
- 95% CI: [-0.0017002112040227502, 0.000979709111431415]
- indistinguishable under CI-includes-0: true
- complexity winner: 1 vs runner-up 2
- Phase 29: among RMSE-indistinguishable candidates, simpler model preferred
- calibration used only as same-complexity tiebreak
- indistinguishable under CI-includes-0 vs best RMSE: M16C_P, M16C_P_B, M16C_P_LN, M16C_P_LN_B

## Notes

- All fits used TRAIN only (`VALIDATION_ROWS_USED_IN_FIT = 0`).
- Reserved test not accessed for evaluation.
- No player-name / leaderboard aesthetics used in selection.
