# M16d selection audit

## Frozen decision rule

- 1. Reject candidates materially worse on primary VALIDATION RMSE (paired CI excludes 0 improvement).
- 2. Among statistically indistinguishable models, prefer better calibration (slope nearer 1, intercept nearer 0).
- 3. If still tied, prefer simpler model (fewer components / fewer free parameters).
- 4. Rank correlation and top-k overlap are secondary and never override (1)–(3).

Phase 29: among RMSE-indistinguishable models, prefer simpler.

## Results

| Model | RMSE |
|---|---|
| P | 2.409176880654843 |
| P+M6 | 2.4087818289661365 |

- delta RMSE (P+M6 − P): -0.0003950516887063493
- relative delta: -0.016397786807541073%
- 95% CI: [-0.0007779925843007796, -0.000036465465131918506]
- probability P+M6 beats P: 0.986
- indistinguishable: false
- decision: **P+M6_validated_improvement**
- M16D_NEXT_BASE: **P + M6**
- M6 class: C
- fusionConstraintType: ridge_with_intercept

## Constraint note

Documentation historically said "simplex"; implementation predicts with **unconstrained ridge** (signed weights allowed). Simplex is report-only. M16c and M16d match.
