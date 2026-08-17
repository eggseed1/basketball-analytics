# Approach A/B readiness

## Selected base for Approach A vs B

```text
APPROACH_AB_BASE = M16E0_RESEARCH_BASE = P
```

M16D_FORMAL_WINNER remains P+M6 (statistical). Practical research base is P.

## Comparison contract (future milestone — do not execute)

- same TRAIN / VALIDATION hashes (drbl-eval-v1)
- same target: future_block_residual_per_100
- same eligibility / aggregation
- same metric contract (primary validation RMSE + paired bootstrap)
- same fusion rules where applicable
- same posterior treatment (document; do not retune k in bakeoff unless milestone says so)
- both approaches use base = P components only (no LN/B; M6 not in base)

## Primary question

Does Approach A produce better unseen predictive value than current Approach B?

## Reserved test

`RESERVED_TEST_ACCESSED_FOR_MODEL_EVALUATION = false`

Board visibility note: 2025-26 production board has been seen operationally → classify as `protected_test_not_fully_human-blind` but still do not use for candidate selection.

## Ready?

**YES** — pending audit approval of this M16e0 package (WAR not repaired; A not implemented).
