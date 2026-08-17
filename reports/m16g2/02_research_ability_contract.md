# Research ability contract (M16g2)

## Versions
- research ability: `drbl-research-ability-v1`
- research posterior: `drbl-eb-posterior-k1600-v1`
- input estimator: `drbl-seq-attr-v1` (Approach B)
- ability lineage (production provenance): `ability-lineage-v1`

## Definitions

```text
P_B_RAW = rawAbilityRate
unit: points per 100 combined possession appearances
      relative to the frozen R1 baseline
```

```text
reliability = N / (N + 1600)
P_B_POSTERIOR = reliability * P_B_RAW + (1 - reliability) * 0
RESEARCH_DRBL100 = P_B_POSTERIOR
```

where `N = actualCombinedPossessionAppearances`.

## Explicit exclusions inside RESEARCH_DRBL100
- no P/LN/B fusion
- no second EB
- no calibration
- no WAR conversion
- no stacking on `drblP` / `fusedRateRaw` / `posteriorAbilityRate`

## Layer count
`RESEARCH_POSTERIOR_LAYER_COUNT = 1`

## Calibration boundary
`CALIBRATION_NOT_YET_SELECTED` — researchDRBL100 is pre-calibration posterior ability.
