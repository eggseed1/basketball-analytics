# M18b.0 full audit

## Verdict

`TRACKING_ACQUISITION_STATUS = POSSIBLE_REQUIRES_USER_ACCESS`

`READINESS_VERDICT = TRACKING_ACCESS_REQUIRED`

## Why

- Local workspace: **T3** shot x/y only; no T0/T1 frames.
- Public SportVU **2015-16** can authorize a **method prototype** but has **zero overlap** with sealed UIR seasons (2020–25).
- Mediating UIR requires licensed modern optical (Second Spectrum / Hawk-Eye) overlapping validation/reserved eras.
- T2 aggregates are insufficient for tracking-EPV / counterfactual OBV.
- Ordinary PBP cannot identify gravity/spacing/deterrence; UIR must not be relabeled as off-ball.

## What M18a established vs what M18b.0 asks

- M18a: persistent player residual beyond DRBL-P / P_RAW (**YES**).
- M18b.0: do we possess independent spatial evidence capable of explaining that residual? **Not yet in this workspace** (access required).

## Authorizations

- M18B_METHOD_PROTOTYPE_AUTHORIZED = YES
- M18B_PLAYER_VALUE_VALIDATION_AUTHORIZED = NO
- OFFBALL_VALUE_ESTABLISHED = NO
- M17C_STATUS = AUTHORIZED_INDEPENDENT_PARALLEL_BRANCH

## Engineering

- TESTS: PASS (201/201)
- TYPECHECK: PASS
- BUILD: SKIPPED_NO_PRODUCT_CHANGE
- CURRENT_PRODUCTION_CHANGED: NO

## Next

USER_TRACKING_ACCESS_STEP (preferred), or M18b_1 method prototype on SportVU while access is pending; M17c remains available as parallel branch.

Seal: `ade47897cd8ca7c0786bee5d0925e86778c2f27c122e5cd332076e7d259e1763`
