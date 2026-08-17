# Unit / estimand semantics (M16j0.1)

| Model | Numerator | Denominator | Per-100 | Zero | Calibrated | Direct RMSE vs target? |
|-------|-----------|-------------|---------|------|------------|------------------------|
| RESEARCH_FINAL | Approach-B attributed residual value (shrunk) | historical combined appearances N | yes | R1 replacement (priorMean=0) | IDENTITY (b=1) | YES |
| B0_RAW_P | Approach-B attributed residual value | historical N | yes | R1 | no | YES |
| B1_P_EB200 | Approach-B residual (EB200) | historical N | yes | R1 | no | YES |
| B2_BASELINE_M16A | OOF-fused P+LN+B residual prediction | published uses full-season N for EB | yes | R1 / priorMean=0 | none | YES **if** prediction existed leakage-free |
| TARGET | future-block Approach-B residual value | future-block possessions | yes | R1 | n/a | — |

## Key question

Can all predictions be directly compared via RMSE against `future_block_residual_per_100` without a new conversion?

- RESEARCH / B0 / B1: **YES**
- B2 unit family: **YES** (`B2_UNIT_COMPATIBLE=YES`) — same residual points/100 R1 scale
- B2 availability at cutoff: **NO** — cannot form the frozen prediction without future/full-season inputs

`B2_TARGET_COMPATIBLE=YES` (estimand matches) does **not** override leakage / reconstruction failure.

No new reserved calibration/conversion is introduced (`UNFROZEN_TARGET_SCALE_CONVERSION_REQUIRED` not used as reason; conversion is unnecessary because unit already matches — the blocker is prediction-time construction).
