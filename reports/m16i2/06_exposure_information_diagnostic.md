# M16i2 exposure information diagnostic

Diagnostic only — does not alter candidate family.

- Spearman(N, absError) = -0.2404
- Spearman(logN, absError) = -0.2404
- Spearman(decileIndex, median absError) = -0.9394
- Spearman(decileIndex, P80 absError) = -0.9515
- Spearman(decileIndex, P95 absError) = -0.9273
- R² log(absError+ε) ~ logN = 0.0572
- Q1 MAE/RMSE = 2.917 / 4.308
- Q4 MAE/RMSE = 1.319 / 1.712
- Fold directional stability (Q1 median > Q4 median): 4/4 → YES

Interpretation: exposure contains real information about future |error| magnitude,
but row-level R² is modest — N alone cannot explain most residual variation.
