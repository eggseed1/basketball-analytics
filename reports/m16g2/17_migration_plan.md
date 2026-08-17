# Migration plan (future — not executed in M16g2)

1. Add canonical research fields (`research*` / future `rawP100` / `posteriorP100`).
2. Recompute artifacts in shadow.
3. Add / keep invariant tests (single posterior, no pseudo-exposure, fusion independence).
4. Redesign/validate uncertainty if required (`REDESIGN_REQUIRED`).
5. Settle calibration (`CALIBRATION_NOT_YET_SELECTED`).
6. Freeze final rate semantics for displayed `drbl100`.
7. Reevaluate WAR conversion after rate/posterior/calibration/replacement lock.
8. Switch production display/rankings.
9. Deprecate legacy fused/double-EB fields after compatibility period.

Production alignment eventually means:
`displayed DRBL/100 = final selected posterior/calibrated research ability`
with **no** hidden legacy fusion/posterior.

M16g2 does **not** execute these production steps.
