# WAR accounting universe contract

```text
hasValidWarAccountingInput(row) iff:
  finite full-precision rawAbilityRateExact
  AND finite validatedDRBL100
  AND seasonN > 0
  AND >=1 valid team stint
  AND sum(teamN) == seasonN
```

```text
WAR_TEAM_AGGREGATION_USES_PUBLIC_DISPLAY_UNIVERSE = NO
WAR_TEAM_AGGREGATION_USES_500_MINUTE_RULE = NO
```

Public product board uses `minimumActualPossessions=50` for display eligibility.
WAR accounting includes low-exposure PBP players with N>0.
