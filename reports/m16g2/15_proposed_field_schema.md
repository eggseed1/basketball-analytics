# Proposed canonical future field schema (NOT deployed)

Design only — production still uses legacy names.

| Proposed field | Meaning |
|----------------|---------|
| rawP100 | Unshrunk Approach-B rate (`rawAbilityRate`) |
| posteriorP100 | EB1600(rawP100) |
| drbl100 | Final displayed ability after posterior **and** any future calibration |
| drblO100 / drblD100 | Only if algebraically canonical (currently NOT) |
| lnDiagnostic100 | LN diagnostic |
| bDiagnostic100 | B diagnostic |
| m6Diagnostic100 | M6 diagnostic |
| abilityReliability | N/(N+k) |
| abilityPosteriorK | 1600 |
| abilityPriorMean | 0 |
| abilityLineageVersion | research/production lineage id |
| seasonalImpact | posterior_or_final_rate * actualN / 100 |
| war | separate conversion after calibration/replacement lock |

Naming rule: never overload `raw` / `posterior` / `fused` / `calibrated` ambiguously.
