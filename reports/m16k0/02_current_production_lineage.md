# Current production ability lineage (live)

```
rawAbilityRate = 100 * totalValue / N
  → component EB200 → drblP / LN / B / O / D
  → fusion OOF (or lite) → fusedRateRaw
  → EB200(fusedRateRaw, N, priorMean=0) → posteriorAbilityRate
  → drbl100 (= posterior; display-rounded)
```

Sources:

- `drbl/models/player-value.ts` finalizePlayerSeasonRows
- `drbl/models/fusion.ts` / compute-season earlyFrac OOF
- `drbl/models/leaderboard.ts` empiricalBayesRate
- `POSTERIOR_VERSION` = eb-fused-v1
- production k = 200

## Validated shadow lineage (not live)

```
rawAbilityRate
  → ONE EB1600 (priorMean=0)
  → validatedDRBL100
```

version: `drbl-ability-eb1600-r1-v1`

## Equality

`CURRENT_PRODUCTION_EQUALS_VALIDATED_MODEL = NO`

Legacy uses fusion + EB200; validated is P-only EB1600.
