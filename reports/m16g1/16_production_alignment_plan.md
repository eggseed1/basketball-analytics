# Production alignment plan (NOT executed)

## Current production

1. `rawAbilityRate` unshrunk Approach B
2. `drblP = EB(raw, k=200)`
3. LN/B also EB(k=200)
4. `fusedRateRaw = fuse(drblP, drblLn, drblB)` or OOF fusion of same
5. `posteriorAbilityRate = EB(fused, k=200) = drbl100`
6. WAR consumes published posterior

## Research architecture (if selected k is locked)

```
rawAbilityRate → EB(SELECTED_RESEARCH_K) → P_B_posterior
```

Selected research k: **1600** (PLATEAU_SELECTED)

## Gaps / risks

- Production embeds k=200 in `drblP` then again on fused ability (multi-stage).
- Promoting research EB on raw P_B requires deciding whether to **remove** component EB and/or fused EB.
- Accidental double-shrinkage risk if research EB is stacked on already-EB `drblP`.

## Fields needing clarification (rename candidates)

See `17_field_naming_audit.csv`.

## Required before deploy

- Explicit single-posterior decision document
- Artifact recompute for affected seasons
- Tests: reconstruct EB identities; no +k in seasonalImpact
- Do NOT deploy in M16g1
