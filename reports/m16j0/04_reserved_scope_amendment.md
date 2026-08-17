# Reserved-test scope amendment (M16j0)

## Previous implicit scope

Point estimate **and** predictive uncertainty were expected to be frozen before RESERVED_TEST access.

## New frozen scope (prospective)

```
M16J_RESERVED_TEST_SCOPE = POINT_ESTIMATE_ONLY
```

M16j will evaluate the frozen DRBL100 point estimator only.

## Explicit exclusions

- Predictive intervals / WIS / CCE / coverage
- WAR
- O/D
- Production UI cutover

## Scientific statement

> Predictive uncertainty remains unresolved. Its exclusion from M16j is not evidence that uncertainty is solved. It is a deliberate separation of an auxiliary interval-estimation problem from external validation of the already-frozen central point estimator.

## Timing

This amendment is committed **before** any RESERVED_TEST predictive metrics are opened.
