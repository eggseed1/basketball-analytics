# Posterior technical debt

## Reconfirmed from M16c (not retuned)

| | Value |
|---|---|
| raw P RMSE | 2.40918 |
| EB(P) RMSE | 2.43343 |
| delta | +0.0243 (worse) |
| 95% CI | includes 0 |
| Q1 (low sample) delta | +0.047 (worse) |
| Q4 (high sample) delta | +0.009 (worse) |

Status: **POSTERIOR_INCREMENTAL_VALUE_UNPROVEN** (point estimate worse; do not remove EB)

## Future research questions (do not execute here)

1. Does any k improve validation?
2. Should prior strength depend on uncertainty rather than possessions only?
3. Should posterior use empirical SE?
4. Should prior be hierarchical?
5. Does shrinkage improve calibration even if RMSE changes little?
6. Is raw/fused P already regularized enough that EB double-shrinks?
