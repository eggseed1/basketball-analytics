# 2025-26 WAR source

## M16a statement

> 2025-26: no team-season CSV → no v4 pipeline remaster; provisional season WAR only

## Production board

Non-null `drblWar` values are present for artifact players (e.g. SGA ≈ 10.01).

## Explanation

1. M16a **did** write provisional season WAR into the full artifact via ranking remaster / player-value finalize:
   - `seasonalImpact` from **raw** ability residual × possessions
   - `drblWar = warFromImpact(seasonalImpact, 30)` (provisional 1/30)
2. Pipeline v4 (`drbl:pipeline`) was **not** run for 2025-26 (missing `data/drbl/calibration/team-season-2025-26.csv`), so:
   - `warFormulaVersion` / `pipelineVersion` are **absent** on the artifact
   - replacement stays R1 baseline (0), not fringe LOO replacement
3. The website reads the **same** precomputed JSON (hash match vs M16a full).
4. It does **not** independently recompute WAR in the UI; transformers copy `drbl?.drblWar ?? 0`.

## Provenance fields

| Field | Value |
|---|---|
| when generated | `2026-08-12T15:24:34.333Z` |
| generating path | compute-season → ranking remaster → sequential reattribute (no pipeline) |
| artifact | `src/data/drbl/precomputed/2025-26.json` |
| formula version | provisional-seasonalImpact/30 (not WAR formula 4.0.0) |
| ability input | `rawAbilityRate` via `seasonalImpact` (NOT published `drbl100` / posterior) |
| parent artifact generation | `2025-26-g1225-2026-08-12T15-24-09-645Z` |

## Classification

**C. WAR uses raw ability** (via seasonal impact / provisional conversion).

Displayed DRBL/100 uses `posteriorAbilityRate` (`drbl100`). Therefore WAR input rate and displayed DRBL/100 **legitimately differ**.
