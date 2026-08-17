# Aggregate ENGINE_HOLDOUT outcome proxy

## Not the M16b future-block validation target

Local diagnostic residual only.

### Offense possession
```
resid_off = points − M5(s0)
```

### Defense possession
```
resid_def = M5(s0) − points
```
(same possession viewed from defense: suppressing opponent points)

### Player aggregate
```
observedResidual100 = 100 * sum(resid_off + resid_def) / combinedAppearances
predictedCounterfactualValue100 = 100 * sum(counterfactualCredits) / combinedAppearances
```

### Blocks
Predeclared: chronological groups of **10 team-games** per player
(ordered by game date within ENGINE_HOLDOUT).
