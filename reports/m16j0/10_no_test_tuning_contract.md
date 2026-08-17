# No-test-tuning contract (M16j0 → M16j)

Once RESERVED_TEST is opened in M16j:

```
RESERVED_2025_26_MAY_BE_USED_FOR_FUTURE_UNCERTAINTY_TUNING = NO
RESERVED_TEST_MAX_VALID_MODEL_RUNS = 1
```

Forbidden after opening:

- k retuning
- reserved affine recalibration
- feature / target / comparator changes
- player exclusions based on errors
- second official altered-model run
- using 2025-26 to fit or select uncertainty models

If an implementation bug invalidates the first valid scored run:

```
BUG_INVALIDATES_TEST = YES/NO
```

Stop for audit before any rerun. Do not quietly retune.

Post-M16j consequences (prospective):

| Verdict | Next |
|---------|------|
| STRONG_PASS | production shadow / cutover planning (uncertainty still unresolved) |
| SCIENTIFIC_PASS_PRODUCTION_MIXED | stop for analysis; no 2025-26 retuning |
| INCONCLUSIVE | no k change; 2025-26 consumed; future confirmation needs new holdout |
| FAIL | frozen generation failed; new generation needs new future holdout |

Raw sealed result artifact must be written before player-name inspection / narrative.
