# M16j0.1 full audit

## Decision

`B2_STATUS = NOT_COMPARABLE`

Reason codes: FUTURE_BLOCK_LEAKAGE, FULL_SEASON_INPUT_DEPENDENCY, HISTORICAL_RECONSTRUCTION_IMPOSSIBLE

`ARCHITECTURE_DIFFERENCE_ALONE_CAUSES_INCOMPARABILITY = NO`

## Authorization

- M16J_ONE_SHOT_RESERVED_TEST_AUTHORIZED: **YES**
- RESERVED_TEST_SHOULD_OPEN_NEXT_MILESTONE: **YES**
- Supersedes: `reports/m16j0/08_reserved_test_authorization.json`
- RESERVED_TEST_ACCESSED: **NO**

## Point estimate

Unchanged. POINT_ESTIMATE_FREEZE_HASH = `942b21ef78ba0a142549f8a2b62338993e133f17b8bb1ff7b94fc8844ad9297c`

## Incumbent

BASELINE_M16A located and hashed (`ea602c117f7d630cf6e777d6eeb7927783ab4f2d8cddc383fbdf13ee7ddec4e6`) but **NOT_COMPARABLE** for leakage-free cutoff evaluation under its frozen OOF definition. No replacement baseline added. Incumbent 0.5% regression rule: **NOT_APPLICABLE**.

## Primary hypothesis preserved

PRIMARY_COMPARATOR = B0_RAW_P; PRIMARY_SUCCESS_RULE unchanged.
