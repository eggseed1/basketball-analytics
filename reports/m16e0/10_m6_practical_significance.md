
# M6 practical-significance closure

## Preserve formal result

```text
M16D_FORMAL_WINNER = P + M6
```

Paired RMSE CI excluded 0 (delta≈-0.000395, P(beats)≈0.986).

## Framework (for M16e+; applied transparently to M16d)

Categories:

| Category | Criteria (all must be considered) |
|---|---|
| STATISTICALLY_DETECTABLE_ONLY | CI excludes 0 OR P(beats)>0.95, but relative RMSE gain < noise scale (~same order as near-tie deltas ~0.0003) AND effective contribution SD ≪ primary component AND residual Corr≈0 AND/or fold sign instability |
| PRACTICALLY_SMALL | Formal improvement with relative gain small vs RMSE, weak residual signal, unstable weights |
| PRACTICALLY_MEANINGFUL | Formal improvement AND residual Corr clearly nonzero AND effective contribution material AND fold-stable sign AND not only one subgroup |
| ROBUSTLY_MEANINGFUL | PRACTICALLY_MEANINGFUL across exposure strata + calibration improvement |

Complexity rule: if STATISTICALLY_DETECTABLE_ONLY or PRACTICALLY_SMALL, prefer simpler base for subsequent architecture research while retaining component as research debt.

## Apply to M16d M6

| Evidence | Value |
|---|---|
| relative RMSE gain | 0.0164% |
| abs delta | 0.000395 |
| residual Corr(M6,R_P) | ≈ -0.021 |
| effective contrib SD | ≈ 0.0044 vs P ≈ 0.666 |
| wM6 | ≈ -0.002, sign-unstable across folds |
| residual model | no gain |

**Practical category: STATISTICALLY_DETECTABLE_ONLY**

## Decision

```text
M16D_FORMAL_WINNER = P + M6
M16E0_RESEARCH_BASE = P
M6_FORMAL_STATISTICAL_WIN = true
M6_PRACTICAL_BASE_INCLUDED = false
M6_STATUS = research_component_needs_redesign_or_stronger_effect
```

Reason: microscopic relative gain (~0.016%), null residual association, negligible effective contribution, unstable coefficient — complexity not earned for Approach A/B base architecture.
