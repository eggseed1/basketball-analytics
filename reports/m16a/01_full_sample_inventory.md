# M16a — Full sample inventory

## Definition of “complete available season”

Local normalized game cache under `data/drbl/normalized/{season}/`:

| Season | Available game dirs (excl. `_`) | Processed | Failed | Quarantined |
|--------|--------------------------------:|----------:|-------:|------------:|
| 2024-25 | **1225** | **1225** | 0 | 0 |
| 2025-26 | **1225** | **1225** | 0 | 0 |

**Full available dataset** = 1225 cached games/season.  
**Theoretical NBA regular season** ≈ 1230 team-games / season schedule length — local cache is **near-complete** but may not equal a certified league schedule file.

## Artifacts

| Sample | Path | Games | Players (2024-25 / 2025-26) |
|--------|------|------:|------------------------------|
| Repaired 400 (frozen) | `reports/m16a/freeze/repaired-400-*.json` | 400 | 476-ish / 482-ish |
| Full available | `reports/m16a/artifacts/full-*.json` | 1225 | 555 / 575 |

## Unavoidable non-sample differences (documented)

Same code/hyperparameters, but **data-dependent fitted objects are re-estimated** on the larger sample:

- Fusion OOF stack weights (`simplexWeights`) — algorithm λ=8, folds=5 unchanged; weights differ
- Lineup / behavior ridge fits — λ unchanged; coefficients differ
- Pipeline LOO WAR calibration slope/intercept — formula unchanged; fit differs (2024-25 only; 2025-26 lacks team-season CSV so no v4 pipeline)
- Fringe replacement level re-estimated from sample

These are **not** manual coefficient edits.

## Possessions / leverage (from artifacts)

| Season | Sample | Leverage possessions (approx) |
|--------|--------|-------------------------------:|
| 2024-25 | full | ~2.44e6 |
| 2025-26 | full | ~2.46e6 |
