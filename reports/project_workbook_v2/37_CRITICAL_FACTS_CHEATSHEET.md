# 37 — Critical Facts Cheatsheet (P17.1)

## Commits / branch

| Role | Value |
|---|---|
| Branch | `product/drbl-site-completeness-v1_1` |
| HEAD | `64cc231a215c579f3498e6122a0230f7388971cc` |
| Worktree | **dirty** (uncommitted P17/P17.1 product work) |
| Integration commit | `28827fbdfb6509756b35284f80c27bafac1f356c` |
| Analytics premerge | `72272b23fe6e037b6d463de2c840f1ad2980b562` |

## Model freeze (unchanged)

```text
ability = drbl-ability-eb1600-r1-v1
k = 1600
P1 = 37.490662671779255   # exact
drbl100 = N/(N+1600) * rawAbilityRate
R1Points = ApproachBAttributedValue
R1WinEq = R1Points / P1
DRBL_V1_REOPENED = NO
```

## Crosswalk v1.1

| Item | Value |
|---|---|
| Aliases | **676** |
| productionApproved | **619** |
| VERIFIED_MULTI_FIELD | 270 |
| HIGH_CONFIDENCE_MULTI_FIELD | 349 |
| UNIQUE_NAME_ONLY | 57 (**not runtime**) |
| 1642935 Hepburn | UNRESOLVED |

## Join coverage

| Measure | Rate |
|---|---|
| Static any-alias 2024-25 / 2025-26 | 1.000 / 0.998261 |
| Static verified 2024-25 / 2025-26 | 0.920721 / 0.944348 |
| Live NBA board 2025-26 | **0.987973** (575/582) |
| Live ESPN estimated 2025-26 | **0.939446** (543/578) |
| Claim 100% join | **NO** |

## Team identity split

```text
MODERN_TEAM_IDENTITY_COMPLETE = YES
HISTORICAL_TEXT_IDENTITY_COMPLETE = YES
HISTORICAL_PALETTE_IDENTITY_COMPLETE = YES
HISTORICAL_LOGO_IDENTITY_COMPLETE = NO   # empty intentional
```

## Product surfaces (P17.1)

```text
ASK / COMPARE / HOME / HISTORY season leaders = DRBL FIXED
SEASON_COMPARE / SEASON_RANK = DRBL FIXED
DASHBOARD = INTENTIONALLY_DEFERRED
HISTORY all-time / GOAT = INTENTIONALLY_NOT_SUPPORTED
PRODUCT_COMPLETENESS = PASS_WITH_DEBT
```

## Research status

```text
M17b = STRONG_MULTI_SEASON_PASS
M18a = STRONG_PASS; UIR persistent; off-ball NO
M17c = NOT_STARTED
M18b = NOT_STARTED (M18b.0 readiness only)
precomputed EQUAL vs 28827fb = YES (six seasons)
mismatches = 0
```

## Engineering

```text
DRBL tests 201/201 PASS
typecheck PASS
build PASS
data-truth PASS
site-nav PASS
```
