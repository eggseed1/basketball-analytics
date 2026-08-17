# Rollback plan

Mechanism:

1. Keep previous `src/data/drbl/precomputed/{season}.json` artifacts versioned/backed up before cutover.
2. Feature flag `DRBL_VALIDATED_ABILITY_SHADOW` / cutover flag defaults to legacy until explicitly enabled.
3. Revert artifact + flag without recomputing science.

`CUTOVER_ROLLBACK_AVAILABLE = YES`

Rollback does **not** change the validated estimator mathematics — it restores the previous published artifact/source pointer.
