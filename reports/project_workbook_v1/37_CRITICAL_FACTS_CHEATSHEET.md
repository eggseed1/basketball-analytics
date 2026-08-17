# 37 — Critical Facts Cheatsheet

## Commits

| Role | SHA |
|---|---|
| HEAD (docs seal) | `64cc231a215c579f3498e6122a0230f7388971cc` |
| Integration commit | `28827fbdfb6509756b35284f80c27bafac1f356c` |
| Analytics premerge | `72272b23fe6e037b6d463de2c840f1ad2980b562` |
| Web premerge | `7e764ceb5c834a19696dad84ed6696e7e3289a6a` |
| Merge base | `629bb1b790bef21020940122194772b6921569ff` |

Branch: `integration/analytics-web`

## Model freeze

```text
ability = drbl-ability-eb1600-r1-v1
k = 1600
priorMean = 0
calibration = identity
P1 = 37.490662671779255
rawAbilityRate = 100 * ApproachBAttributedValue / N
validatedDRBL100 = N/(N+1600) * rawAbilityRate
drbl100 = validatedDRBL100
R1Points = ApproachBAttributedValue
R1WinEq = R1Points / P1
```

## Seasons

| Class | Seasons |
|---|---|
| Tier A | **NONE** |
| Tier B historical supported | 2020-21…2023-24 |
| Production | 2024-25, 2025-26 |

## Seals (do not invent)

| Item | Hash / verdict |
|---|---|
| Point estimate freeze | `942b21ef…` |
| M16j reserved point | `84f4eadc…` STRONG_PASS |
| M16l2 reserved value | `dc556c35…` STRONG_PASS |
| M16l3 migration | `48a9d39e…` |
| M17a.1 raw import | `b87fff81…` |
| M17a.2 corpus | `60ef9954…` |
| M17a.2 support tier freeze | `86b01c4a…` |
| M17b | `b606cf60…` **STRONG_MULTI_SEASON_PASS** |
| M18a | `ba98a652…` **STRONG_PASS**; UIR persistent; off-ball **NO** |
| M18b.0 | `ade47897…` T3 **POSSIBLE_REQUIRES_USER_ACCESS** |
| Integration | `76169541…` |

## Status flags

```text
M17c = NOT_STARTED
M18b = NOT_STARTED
UIR_PUBLIC_CANONICAL = NO
LEGACY_WAR_PUBLIC = NO
OFFBALL_VALUE_ESTABLISHED = NO
INTEGRATION_READY_FOR_RESEARCH = YES
PROJECT_SEMANTICS_CHANGED_BY_WORKBOOK = NO
```

## Product debt

1. ESPN ↔ NBA player identity → live DRBL may appear empty  
2. Team-evidence live fixture schedule/sample miss  

## Engineering gates (integration)

```text
DRBL tests 201/201 PASS
typecheck PASS
build PASS
production+historical precomputed mismatches = 0
```
