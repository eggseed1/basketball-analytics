# M16j0 full audit

## Authorization

- M16J_ONE_SHOT_RESERVED_TEST_AUTHORIZED: **YES**
- RESERVED_TEST_SHOULD_OPEN_NEXT_MILESTONE: **YES**
- RESERVED_TEST_ACCESSED in M16j0: **NO**

## Point estimate

`FINAL_RESEARCH_DRBL100 = N/(N+1600)*rawAbilityRate` — frozen.
POINT_ESTIMATE_FREEZE_HASH = `942b21ef78ba0a142549f8a2b62338993e133f17b8bb1ff7b94fc8844ad9297c`

## Uncertainty

Unresolved. Excluded from M16j. No F0/U2 fallback.

## Reserved row protocol

Preexisting `buildFutureBlockStackRows` earlyFrac=0.7 on RESERVED_TEST game membership.
No new cutoffs invented.

## Comparators

- Primary: B0_RAW_P
- Secondary: B1_P_EB200
- Incumbent BASELINE_M16A: NOT_COMPARABLE (fusion vs P-only)

## Next

M16j one-shot point-estimate-only reserved test — after audit acceptance.
Production deployment remains disallowed until M16j result + audit.
