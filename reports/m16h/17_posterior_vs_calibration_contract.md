# Posterior vs calibration contract (M16h)

## Posterior
```text
reliability adjustment based on sample information
P_post = N/(N+1600) * rawAbilityRate
```
Version: `drbl-eb-posterior-k1600-v1`

## Calibration
```text
global mapping of the posterior rate onto a better predictive scale
```
Selected: **IDENTITY_SELECTED**
Final coefficient b_final = 1 (drbl-calibration-identity-v1)

These are **separate layers**. Do not collapse k and b into one coefficient.

## Final research point-estimate lineage
rawAbilityRate → EB1600 → FINAL_RESEARCH_DRBL100

- fusion = NONE
- LN/B/M6 = DIAGNOSTIC
- posterior count = 1
- calibration layer count = 0
