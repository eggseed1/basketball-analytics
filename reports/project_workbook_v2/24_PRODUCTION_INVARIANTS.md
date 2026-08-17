# 24 — Production Invariants

These must remain true unless an explicitly authorized milestone reopens them.

## Model invariants

```text
CANONICAL_ABILITY_VERSION = drbl-ability-eb1600-r1-v1
validatedDRBL100 = N/(N+1600) * rawAbilityRate
K = 1600
PRIOR_MEAN = 0
CALIBRATION = IDENTITY
FUSION = NONE (for published ability)
R1Points = ApproachBAttributedValue
R1WinEq = R1Points / 37.490662671779255
P1 = 37.490662671779255 (frozen; do not refit)
DRBL_V1_REOPENED = NO
```

## Product / publication invariants

```text
Canonical rank = descending unrounded drbl100
LEGACY_WAR_PUBLIC = NO
UIR_PUBLIC_CANONICAL = NO
OFFBALL_VALUE_ESTABLISHED = NO  (until a future sealed milestone says otherwise)
Missing r1Points / r1WinEquivalents = null (never coerce to 0)
SEASON_REGISTRY_SINGLE_SOURCE = YES
CAREER_R1_VALUE_PUBLIC = NO
ALL_TIME_DRBL_RANKING = NO
UNASSIGNED_RESIDUAL_REDISTRIBUTED = NO
BASELINE_REDISTRIBUTED = NO
```

## Historical support invariants

```text
EARLIEST_TIER_A_SEASON = NONE
Supported retrospective Tier B = 2020-21..2023-24
Production seasons = 2024-25, 2025-26
HISTORICAL_P1_POLICY = FROZEN_V1_P1
P1_ERA_ROBUSTNESS = NOT_ESTABLISHED
```

## Integration invariants (post-merge)

```text
PRODUCTION_METRIC_SEMANTICS_PRESERVED = YES
WEB_DESIGN_INTENT_PRESERVED = YES
Precomputed overlays for 2020-21..2025-26 match analytics premerge (0 mismatches)
M17A_2 / M17B / M18A / M18B_0 seals unchanged by integration
M17C_EXECUTED = NO
PROJECT_SEMANTICS_CHANGED_BY_WORKBOOK = NO
```

## Research firewall

```text
Do not use player reputation for tuning
Do not use external metrics as acceptance targets for DRBL v1 retune
Do not relabel UIR as off-ball
Do not invent seals
```
