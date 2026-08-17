# Zero semantics for P_B

## What P_B = 0 means

**Category: REPLACEMENT_LEVEL**

Evidence:
1. Sequential attribution credits are computed vs R1 role-matched replacement (`replacementPool` level `R1`).
2. `ranking.replacementLevelRate = 0` in `ranking-config.ts`.
3. `seasonalImpact = (rawAbilityRate - replacementLevelRate) * N / 100` with replacementLevelRate=0.
4. Production EB uses `priorMean = 0` identically.

Therefore `rawAbilityRate = 0` means: **same expected points contribution as the R1 replacement baseline**, not league-average talent.

## priorMean = 0

VALID for this scale: shrink toward replacement-level impact.

TRAIN sample means may be nonzero; that does not redefine the prior.

## WAR zero

WAR zero semantics (wins above replacement) are **related but not automatically identical** as a numeric identity to P_B=0 without the WAR conversion chain. Status: **NOT ESTABLISHED as identical**, but both use the same replacement baseline concept.

## Verdict

`PRIOR_MEAN_VALID = PASS`
`ZERO_SEMANTICS = REPLACEMENT_LEVEL`
