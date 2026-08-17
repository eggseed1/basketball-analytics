# Updated cutover plan (M16k0.1 → M16k1)

M16k1 performs the controlled production switch. M16k0.1 does **not** flip live sources.

## Exact M16k1 checklist

1. Switch canonical `drbl100` source to `validatedDRBL100`
2. Switch canonical DRBL rank source to validated shadow rank logic (descending unrounded `validatedDRBL100`)
3. Rebuild canonical precomputed artifacts
4. Activate `abilityModelVersion` metadata (`drbl-ability-eb1600-r1-v1`)
5. Activate validated percentile eligibility:
   - `existingProductQualification` (`minutes >= 500`)
   - AND `hasValidatedDrblEstimate`
   - Remove `drblUncertainty > 0` from validated path
6. Remove legacy uncertainty from canonical validated displays (Savant / tooltips / glossary ±)
7. Apply frozen glossary / tooltip copy from `15_copy_replacement_contract.md`
8. Preserve WAR firewall (no WAR math change)
9. Preserve O/D firewall (do not imply O+D = validated DRBL)
10. Run full product regression suite
11. Verify public/default output
12. Retain rollback path (previous precomputed artifacts + feature flag)

## Explicit non-goals for k1

- No point-model retuning
- No predictive uncertainty resurrection
- No new scientific exposure threshold
- Explore default table sort may remain PPG (general explorer)
