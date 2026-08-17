# Research input contract (M16g)

## Estimator under test

Approach B won M16f2. The **unshrunk** sequential attribution rate is the scientific object of shrinkage:

```
rawRate = rawAbilityRate = 100 * ΣApproachB_value / N
```

This is the pre-EB estimand underlying published `drblP`.

**Why not published `drblP` as the shrinkage input?**
Published `drblP` already applies EB(k=200). Using it as `rawRate` would make `k=0` mean “keep embedded shrinkage,” so the grid could not cleanly test “no shrinkage.”

M16g therefore tests:

```
posterior_k = N/(N+k) * rawAbilityRate + k/(N+k) * priorMean
```

with `k=0` ≡ identity (true no-shrinkage).

Published `drblP` is retained on each fold row for diagnostics / production-gap comparison only.

## Prior mean

`priorMean = 0`

Rationale: Approach B residuals are **vs R1 replacement**. Zero is replacement-level impact by construction (not a performance-tuned TRAIN mean). League mean of raw rates may be nonzero; that does **not** redefine the prior semantics.

## Exposure N

`N = actual combined on-court possession appearances` used to form the historical rate (same unit as `finalizePlayerSeasonRows.possessions`).

Rate unit: expected net points per 100 combined possession appearances vs R1.
Reliability: fraction of weight on the observed rate vs replacement-level prior.

## Out of scope

fused P+LN+B, calibratedDRBL100, WAR ability input, Approach A, VALIDATION k tuning.
