# Target zero semantics (M16h)

## Future target
`future_block_residual_per_100` as constructed in M16g fold rows:

```text
futureTarget = 100 * late.totalValue / late.possessions
```

where `totalValue` is accumulated by `attributeGamePlayerValue` against an
**R1 replacement pool** built from history (same fold's past games).

## What does future_block_residual_per_100 = 0 mean?

```text
TARGET_ZERO_SEMANTICS = R1_REPLACEMENT_BASELINE
```

Zero means the player's future-block Approach-B residual rate equals the
role-matched R1 replacement expectation (no above/below-replacement residual).

Not league average. Not an arbitrary centering after the fact.

## Construction trace
- target construction: future-block player residual rate from seq-attr vs R1
- replacement subtraction: inside attribution via R1 replacement EP
- residual definition: value relative to replacement context EP
- centering: none beyond R1 residual construction
- rate denominator: future combined possession appearances

## P_B_POSTERIOR zero
```text
P_B_POSTERIOR = 0  ⇒  R1 replacement baseline
```
(priorMean=0 on the same R1-centered rawAbilityRate scale)

## Alignment
```text
TARGET_ZERO_ALIGNED_WITH_P = YES
```

Both predictor and target are R1-centered Approach-B residual rates
(history estimate vs future realized residual).
