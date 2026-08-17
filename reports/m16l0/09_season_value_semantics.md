# Season-value semantics

## rawAttributedSeasonPoints

```text
rawAbilityRate * N / 100
```

= exact Approach-B attributed season points vs R1 (realized attribution).

## posteriorEstimatedSeasonPointsAboveReplacement

```text
validatedDRBL100 * N / 100
```

= estimated season impact using the reserved-tested rate over **actual** historical exposure.

Not equal to raw attributed points (shrinkage). Not a forecast. Not future possessions.

## Labels

| Name | Meaning |
|------|---------|
| rawAttributedSeasonPoints | realized attributed value |
| posteriorEstimatedSeasonPointsAboveReplacement | posterior estimated season value |
| WAR | either of the above / PPW (candidate-dependent) |
