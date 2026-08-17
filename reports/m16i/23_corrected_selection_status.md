# M16i corrected audit status (addendum)

This file does **not** rewrite M16i's original execution artifacts.

M16i execution remains: **PASS**.

Under the frozen catastrophic conditional-coverage gates applied to **every** candidate (including U0):

```text
M16I_UNCERTAINTY_SELECTION = NO_ELIGIBLE_CANDIDATE
UNCERTAINTY_SELECTION_RESULT = UNCERTAINTY_BLOCKED
BLOCK_REASON = NO_CANDIDATE_PASSES_FROZEN_CONDITIONAL_COVERAGE_GATES
RESEARCH_RATE_MODEL_FREEZE_READY = NO
RESERVED_TEST_SHOULD_OPEN = NO
```

Evidence: U0 Q1 PI80 ≈ 61.3% and Q1 PI95 ≈ 82.3% fail the catastrophic thresholds (PI80 < 70% or PI95 < 85%). U1 and U2 also fail coverage integrity.

See `reports/m16i1/01_m16i_reproduction.json` for the formal reproduction of this correction.
