# Legacy calibration factor audit

## 5.835416607524311

- **Origin:** leave-one-out team regression slope mapping player **posterior ability** onto a **team netRating-like** target (pts/100 paired).
- **Fit type:** through-origin team-level LOO (`calibrationIntercept=0`, `calibrationSource=learned_leave_one_out`).
- **Input:** posterior (not raw).
- **Role:** ability-scale transform into netRating units — **not** a pure points→wins conversion.

## ≈2.918

- After unit-repair recognition that slope embeds a definitional factor of 2:
  `5.8354166 / 2 ≈ 2.917708`
- Remaining empirical scale after peeling the combined-vs-paired unit factor.
- **Not solved** by WAR 4.0.1 (exposure-only repair).

## LEGACY_ABILITY_CALIBRATION_REUSABLE

```text
NO
```

Reasons: different rate semantics than canonical validated DRBL; embeds old unit structure; would retune the reserved-tested rate scale if reused as a multiplier on `validatedDRBL100`.
