# Production gap (M16g)

## Production posterior lineage

| Item | Production |
|---|---|
| Component P field | `drblP` = EB(rawAbilityRate, k=200, priorMean=0) |
| Published ability input | `fusedRateRaw` (P+LN+B fusion / lite) |
| Published posterior | `posteriorAbilityRate` = EB(fusedRateRaw, k=200) |
| Exposure | actual possessions (no +k in impact/WAR) |

## Research decision (M16g)

| Item | Research |
|---|---|
| Shrinkage input | **unshrunk** `rawAbilityRate` (Approach B seq-attr rate) |
| Selected k | **800** |
| Prior mean | 0 |
| Result | `STRONG_SHRINKAGE_SELECTED` |

## Semantic differences

- Production embeds k=200 inside `drblP` **and** again on fused ability.
- Research asks whether EB on **raw** P_B improves future-block RMSE under TRAIN chronological folds.
- Selected research k=800 ⇒ research would apply EB(k=800) to raw P_B.

## Production change made

**NO**
