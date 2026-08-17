# Approach-B primitive equation

## Source

- `attributePossessionSequential` (`drbl-seq-attr-v1`)
- `attributeGamePlayerValue` with `startEp = replacementExpectedPoints(...)`
- `EXECUTION_SKILL_FRACTION = 1`

## Exact target

```text
Y  = possession.points          (scoreboard points on the possession)
V0 = replacementExpectedPoints(state, offenseRole, R1Pool)
   = clamp( EPV(S) + clamp(roleMatchedR1Residual, -0.08, 0.04), 0.7, 1.4 )

Δ  = Y − V0
```

## Credits

```text
sum(offense credit.amount) + unobserved  ≈  Δ
sum(defense credit.amount)               ≈ −Δ
```

Stable player totals use `stableAmount` (execution × EXECUTION_SKILL_FRACTION).

## Team-level implication (algebra)

For team T:

```text
Attributed_T
  ≈ Σ_{T offense} (Y − V0 − U_assigned_gap)
  + Σ_{T defense} (−(Y_opp − V0))

ActualNetPoints_T
  = PointsFor_T − PointsAgainst_T
  = Attributed_T + BaselineNet_T + UnassignedOff_T + numerical residue

BaselineNet_T
  = Σ_{T offense} V0 − Σ_{T defense} V0
```

Therefore Approach-B player value is a **scoreboard-point residual above R1/context EP**, not full scoreboard points themselves.
