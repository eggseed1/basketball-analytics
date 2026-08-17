# Approach A specification v1

**Name:** DRBL-P Counterfactual Presence  
**Version:** `drbl-p-counterfactual-v1`  
**Status:** PRODUCT DECISIONS LOCKED — implementation **blocked/partial** pending player-sensitive V engine choice  
**Date:** 2026-08-12T18:01:26.254Z

## Research question

> Before the possession outcome is known, how much does expected possession value change because this focal player is present instead of a role-matched R1 replacement, holding possession-start context and all other players fixed?

## Locked decisions (1–12)

| # | Decision | Lock |
|---|---|---|
| 1 | Counterfactual object | `FOCAL_PLAYER_ONLY_SWAP` |
| 2 | Replacement | Same frozen R1 role-matched distribution; `E_r[V(...)]` equal-weight over k nearest unless R1 already defines weights |
| 3 | State engine | `DETERMINISTIC_COUNTERFACTUAL_EPV` |
| 4 | Path measure | `EXPECTED_VALUE_ONLY` (no Monte Carlo) |
| 5 | Credit | Focal player only |
| 6 | Defense | Identical swap; credit = `replacementOpponentEPV − actualOpponentEPV` |
| 7 | Conservation | Local identity only; **no** cross-player additivity |
| 8 | Rate denominator | `combinedPossessionAppearances` (match P/B) |
| 9 | Leakage | Possession-start features only; TRAIN-only / protocol-safe fits |
| 10 | Version | `drbl-p-counterfactual-v1` + frozen config record |
| 11 | Non-goal | **Not** a sequential-attribution redesign |
| 12 | Support | Explicit support policy; unsupported → no credit |

## Counterfactual object

```text
L_actual
vs
L_i→r   (only focal slot replaced)
```

## Value function (required form)

```text
V(s0, L) = expected possession points | possession-start state s0, lineup L
```

### Feasibility finding

- Pure M5 `EPV(s0)` **does not depend on L** → cannot implement A.
- Existing player-sensitive deterministic scorer: **LN ridge residual** on lineup IDs.
- Engineering candidate (requires product acknowledgment of LN dependence):

```text
V(s0, L) := EPV_M5(s0) + LN_residual(L; β_TRAIN_ONLY)
```

## Offense

```text
actualEPV = V(s0, L_actual)
replacementEPV = mean_r V(s0, L_i→r)
offensiveCounterfactualCredit = actualEPV - replacementEPV
```

Under additive LN: `= β_i - mean_r(β_r)` (offense).

## Defense

```text
actualOpponentEPV = V_opp(s0, L_actual)
replacementOpponentEPV = mean_r V_opp(s0, L_i→r)
defensiveCounterfactualCredit = replacementOpponentEPV - actualOpponentEPV
```

Positive = focal suppresses opponent expectation vs replacement.

## Rate

```text
P_A = 100 * (sum off credits + sum def credits) / combinedPossessionAppearances
```

```text
rateUnit = expected net points per 100 combined possession appearances
           relative to role-matched R1 replacement
```

## Local identity (required)

```text
credit_i - (actualEPV - replacementEPV_i) ≈ 0
```

## Support policy (`counterfactualSupportPolicy`)

| Status | Definition |
|---|---|
| SUPPORTED | Focal and all used replacement IDs have TRAIN-fit LN coefficients (or successor player-sensitive V features); role match succeeds with ≥1 candidate |
| WEAK_SUPPORT | Focal supported but <k replacements; or replacement feature distance high (predeclared threshold — **not** VAL-tuned; v1 default: k<3) |
| UNSUPPORTED | Missing coefficient / role match failure / missing lineup |

**Unsupported behavior:** no Approach A credit for that appearance; mark missing; common-universe rule deferred to M16f.

Do **not** fall back to league-average EPV without separate approval.

## Frozen configuration keys

```text
approachVersion = drbl-p-counterfactual-v1
replacementPoolVersion = R1_buildReplacementPool
roleMatchVersion = roleDistance_k8
stateFeatureVersion = PossessionEpState_m5
epvModelVersion = epv-ridge-v1
lineupValueVersion = drbl-ln-ridge-v1 (ENGINEERING CANDIDATE ONLY)
trainingProcedureVersion = TRAIN_only_or_protocol_OOF
supportPolicyVersion = coef_membership_v1
rateDenominatorVersion = combinedPossessionAppearances
defenseSignConvention = replacementOppEPV - actualOppEPV
replacementAggregationRule = equal_weight_mean_over_k_nearest_R1
```

## Out of scope for v1

- full five-man replacement
- Monte Carlo / event resimulation
- Shapley / interaction decomposition
- multi-player swaps
- validation-fitted role matching
- WAR
- posterior tuning
- silently inventing a new EPV with player features without a separate engineering milestone

## Leakage / training rules

- No VALIDATION labels in fitting
- No RESERVED_TEST for selection
- Y may not enter V features
