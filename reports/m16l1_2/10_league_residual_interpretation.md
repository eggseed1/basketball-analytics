# League residual identity

```text
Σ TeamR1Points + Σ UnassignedResidual ≈ -9.094947017729282e-13
LEAGUE_ATTRIBUTED_PLUS_UNASSIGNED_ZERO_SUM = YES
```

## Why

Per possession, offense credits + unobserved ≈ Δ and defense credits ≈ −Δ.
Across both teams on every possession, player O+D credits + unobserved ≈ 0
(up to numerical residue). League-wide, attributed player value and the
unobserved bucket therefore form an approximate/exact zero-sum pair.

## Interpretation

League sum of player R1Points is **not** evidence of league-wide wins created.
It is an accounting counterpart to unassigned residual under O/D zero-sum bookkeeping.
Do not force league R1WinEq to match league wins.
