# WAR precision contract

```text
WAR_INTERNAL_RATE_PRECISION = FULL_AVAILABLE_PRECISION
WAR_RANKING_OR_VALUE_CALCULATION_USES_DISPLAY_ROUNDED_RATE = NO
```

## Full-precision sources for M16l1

1. Rebuilt Approach-B stream: `sum(appearance.value)`, `count(appearances)`
2. Or in-memory `DrblPlayerAccumulator.totalValue` / `possessions` before display rounding
3. `validatedDRBL100 = N/(N+1600)*rawAbilityRateExact` via `computeValidatedAbilityV1`

## Do not use for WAR math

- Published `rawAbilityRate` (4 dp)
- Published `drbl100` (2 dp)
- Published `seasonalImpact` (2 dp)

Live WAR unchanged in M16l0.1.
