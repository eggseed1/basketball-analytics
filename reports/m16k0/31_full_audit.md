# M16k0 full audit

## Readiness

**READY_WITH_BLOCKERS**

PRODUCTION_CUTOVER_READY = **NO**

### Blockers
- PERCENTILE_POPULATION_DECISION_REQUIRED: replace uncertainty>0 eligibility with approved metadata/exposure rule before cutover
- Glossary still describes DRBL/100 as fused posterior — update at cutover (classified; not model change)

## Validated model

`drbl-ability-eb1600-r1-v1`: `N/(N+1600)*rawAbilityRate`

Research/production-shadow equality: **PASS** (max residual 0)

## Live production

Unchanged. Legacy still fusion+EB200.

## Next

M16k0.1: approve percentile population rule (no uncertainty gate; no aesthetic threshold).
Then M16k1 controlled cutover.
