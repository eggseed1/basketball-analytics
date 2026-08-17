# M16f1b full audit

## Reproduction
PASS within ±0.02 RMSE of M16f1.

## Support (SUPPORTED=0%)
Primary gate to SUPPORTED: known replacements in coefficient set must be ≥8 AND mean roleDistance ≤ 1.5.
Observed: nearly all cases are WEAK because known < 8 (coefficient set is top-160; R1 neighbors often outside) and/or roleDistance > 1.5.
SUPPORTED is **not** structurally impossible (probe count=0); policy NON_DEGENERATE.

## Unseen players
M16f1 “300” ≈ unique holdout player IDs absent from the **coefficient** set (300), not 300 never-seen-in-FIT box players (6).

## Stability
Player refit: STRONG (median Pearson 0.820, Spearman 0.812, ICC 0.786)
Delta: MODERATE
Replacement: ROBUST

## Aggregate signal
POSITIVE
player 0.099/0.114
block 0.152/0.159

## Status
READY_WITH_WARNINGS

Focal audit repaired: state 8334/8334, teammate 8334/8334.

