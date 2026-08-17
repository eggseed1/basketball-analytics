# M16k0.1 full audit

## Verdict

`READY_FOR_CONTROLLED_CUTOVER`

`PRODUCTION_CUTOVER_READY = YES`
`PRODUCTION_LIVE_CUTOVER = NO`

## Provenance

- POINT_ESTIMATE_FREEZE_HASH = `942b21ef78ba0a142549f8a2b62338993e133f17b8bb1ff7b94fc8844ad9297c`
- RESERVED_RESULT_SEAL_HASH = `84f4eadccb536f058194acb4db730c044ea413036456e072952d89a64600d742`
- VALIDATED_POINT_MODEL_CHANGED = NO
- POST_RESERVED_MODEL_TUNING = NO

## Percentile

Live rule still: `minutes >= 500 AND drblUncertainty > 0` (legacy).
Validated rule frozen: `minutes >= 500 AND hasValidatedDrblEstimate`.
No new scientific exposure threshold.

### Population

| Season | Old eligible | Validated eligible | Added | Removed |
|--------|--------------|--------------------|-------|---------|
| 2024-25 | 375 | 375 | 0 | 0 |
| 2025-26 | 378 | 378 | 0 | 0 |

## Copy

Canonical descriptions frozen; live fused/± wording deferred to M16k1
(`COPY_CUTOVER_DEFERRED_TO_M16K1 = YES`).

## Explore

`GENERAL_PLAYER_EXPLORER` with default sort `pointsPerGame`.
Not a cutover blocker.

## Equality

rows=1130, maxResidual=0, mismatch=0 → PASS

## Next

M16k1 controlled production cutover. Do not reopen point-model research.
