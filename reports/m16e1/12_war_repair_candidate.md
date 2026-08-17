# WAR_REPAIR_CANDIDATE_V1 — DEPLOYED as WAR 4.0.1

Status: **DEPLOYED** (unit repair only; 2026-08-12T17:36:40.755Z)

## What changed

Exposure basis only: `pairedOnCourtPossessions = combinedPossessionAppearances / 2`.

Frozen: LOO slope 5.835416607524311, replacement -1.4886147765794517, PPW 38.714285714285715.

## What did NOT change

- WAR model calibration (remaining ~2.918 factor)
- Replacement definition/semantics
- PPW
- Posterior / P / M6
- 2025-26 provisional WAR

## Nuance

`mean combined/paired ratio = 2` is **by definition**, not independent evidence.
Independent evidence: LOO netRating units × prior combined exposure; formulation equivalence; team-wins slope 0.555 → 1.109.

See `reports/m16e1-deploy/`.
