# A1 / A2 path repair — STOP for audit

**Date:** 2026-08-12  
**Scope:** Path/display repair only. No statistical formulas, coefficients, M6, attribution math, fusion fit, or WAR calibration code changed.

## Fixes

### A1 — LN / B / SDV wipe
- **Cause:** `scripts/drbl-sequential-reattribute.ts` spread sequential finalize (no LN/B maps) over published rows.
- **Fix:** `drbl/models/ability-lineage.ts` → `mergeSequentialIntoPublishedPlayer` preserves LN/B/SDV/shot diagnostics from published; overlays sequential P/category fields only.
- **Tests:** `drbl/models/__tests__/ability-lineage.test.ts`

### A2 — Ability lineage
Canonical published ability (unchanged math, enforced field roles):

```text
rawAbilityRate       = DRBL-P residual rate (seq)
fusedRateRaw         = OOF fusion (or lite P+LN+B)
posteriorAbilityRate = EB(fusedRateRaw)     ← published ability
drbl100              = posteriorAbilityRate
```

- Ranking remaster no longer treats posterior `drbl100` as `fusedRateRaw` (no double-shrink).
- Metadata: `publishedAbilityInput: "fused_rate"`, `abilityLineageVersion: "ability-lineage-v1"`.
- Note: pipeline WAR may still set player `abilityInput: "raw"|"posterior"` for **WAR calibration input** (separate from published ability). That selection rule was not changed.

## Regenerated artifacts (400 games)

| Season | Games | LN nonzero | B nonzero | SDV nonzero | version |
|--------|------:|-----------:|----------:|------------:|---------|
| 2024-25 | 400 | restored | restored | restored | `drbl-ranking-v2-seq` + pipeline 4.0.0 |
| 2025-26 | 400 | restored | restored | restored | `drbl-ranking-v2-seq` (no team-season CSV → no v4 pipeline) |

## Explicitly NOT done
- No fusion weight / target changes
- No M6 fusion gate flip
- No Approach A replacement
- No WAR coefficient / 1/30 rule changes
- No full-season (>400) recompute
- No M15 model recommendations implemented

## STOP
Await re-audit / approval before further model changes.
