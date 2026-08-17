# M16i3 full audit

## Decision

- RELIABILITY_FEATURE_AUDIT_RESULT: FEATURE_SET_FROZEN
- Eligible: TEMPORAL_SEGMENT_DISPERSION, SPLIT_HALF_P_SHIFT, APPEARANCE_VALUE_DISPERSION
- M16I4_RELIABILITY_BAKEOFF_READY: YES
- RESEARCH_RATE_MODEL_FREEZE_READY: NO

## Reconstruction

- max |raw residual|: 0.0000499649380416578
- count identity: true
- value-sum identity: true

## Outcome-blind

FEATURE_PIPELINE_READS_FUTURE_OUTCOMES = NO

## Availability

| Feature | Availability | Status |
|---------|--------------|--------|
| R1 | 100.00% | ELIGIBLE |
| R2 | 100.00% | ELIGIBLE |
| R3 | 100.00% | ELIGIBLE |

## Next

M16i4 may test frozen feature sets only after this audit is accepted.
No WIS/coverage modeling was performed here.
