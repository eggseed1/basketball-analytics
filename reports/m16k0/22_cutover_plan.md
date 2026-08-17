# Controlled cutover plan (NOT executed in M16k0)

1. Merge validated production implementation (`computeValidatedAbilityV1`)
2. Continue shadow generation / CI equality checks
3. Resolve percentile population rule (blocker)
4. Update glossary: DRBL/100 = validated EB1600(raw); remove fused wording; quarantine uncertainty copy
5. Rebuild precomputed artifacts with `drbl100 = validatedDRBL100` + `abilityModelVersion`
6. Switch canonical `drbl100` source in `finalizePlayerSeasonRows` (or post-pass)
7. Switch `rank` to descending unrounded validatedDRBL100
8. Remove/hide incompatible uncertainty from validated display
9. Keep WAR pinned to `raw_realized` / seasonalImpact
10. Keep O/D as diagnostic; rewrite copy so it does not claim O+D=total
11. Full product regression
12. Feature flag / previous artifact rollback ready

`LIVE_DRBL100_SOURCE_CHANGED = NO` in M16k0.
