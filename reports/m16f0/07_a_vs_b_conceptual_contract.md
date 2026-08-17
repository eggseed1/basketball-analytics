# A vs B conceptual contract

| dimension | Approach A | Approach B |
|---|---|---|
| question | Marginal expected presence value vs R1 swap | How to attribute realized residual along observed path |
| credit type | Counterfactual ΔV | Sequential residual shares |
| counterfactual | Explicit focal lineup swap | Contextual R1 EP (no lineup rescore) |
| event sequence | Not used in V | Used for attribution |
| additivity | Not required across players | Possession conservation intended |
| conservation | Local ΔV identity | sum credits ≈ Δ points vs replacementEp |
| replacement role | Score V under swapped IDs | Role-matched residual add-on to EPV |
| future realized path | Forbidden in V | Required for credits |
| rate denominator | combinedPossessionAppearances | combinedPossessionAppearances |
| output unit | expected net pts / 100 appearances vs R1 | attributed residual pts / 100 appearances |
| interpretation | Presence value | Path attribution |

## Shared future bakeoff contract

- same TRAIN / VALIDATION / Y / eligibility
- primary: native P_A vs P_B RMSE (pre-posterior)
- no WAR, no LN/B/M6 as features, no VAL tuning
- indistinguishable → keep B
