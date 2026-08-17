# Normalization version decision (M17a.2)

Keep **historical-pbp-normalized-v1**.

Rationale:
- Historical stats labels (`Made Shot`, `Missed Shot`, `Free Throw`, `SUB: X FOR Y`) already map into the existing normalize pipeline without changing estimand semantics.
- No new EPV/R1/attribution fields are required for frozen-v1 retrospective application.
- Creating v2 would be required only if the normalized schema meaning changed; it does not.

MODEL_SEMANTICS_CHANGED_BY_NORMALIZATION = NO
