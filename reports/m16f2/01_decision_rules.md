# M16f2 Decision Rules (LOCKED BEFORE VALIDATION OUTCOMES)

**Status:** IMMUTABLE for this milestone  
**Locked at:** written prior to loading VALIDATION predictive outcomes / targets  
**Milestone:** one-shot Approach A vs Approach B bakeoff

## Candidates

| ID | Definition |
|---|---|
| Approach A | `drbl-p-counterfactual-v1` via frozen `drbl-counterfactual-epv-v1` (λ=100, R1 k=8 equal weight, top-160 coefs ≥100 TRAIN appearances, FIT_ROW_STRIDE=2) |
| Approach B | Incumbent `drbl-seq-attr-v1` native `drblP` from M16b/M16c future-block stack construction |

## Target

- `future_block_residual_per_100` via `buildFutureBlockStackRows` (`earlyFrac=0.7`)
- Same construction as M16b/M16c
- No target redesign after outcomes

## Scales (primary)

- Primary: **native** frozen `P_A_raw` vs native frozen `P_B` (`drblP` as emitted by stack builder)
- No VALIDATION-fitted calibration for primary
- No posterior / WAR / production remapping for primary

## Eligibility / common universe (pre-outcome)

1. Start from M16b/M16c VALIDATION stack eligibility (`minPossessions=50`, `minFutureObservations=20`).
2. `B_evaluable` = all stack rows (Approach B always has `drblP` on eligible rows).
3. For Approach A, score early-block VALIDATION possessions with TRAIN-only roles/R1/coefs.
4. Per appearance support = frozen `supportStatus` (SUPPORTED / WEAK_SUPPORT / UNSUPPORTED).
5. Credits counted only for WEAK_SUPPORT or SUPPORTED appearances (UNSUPPORTED → no credit; no fill).
6. Player-row A status:
   - `UNSUPPORTED` if zero credited appearances OR majority of on-court coef-eligible attempts are UNSUPPORTED with zero credits
   - else `SUPPORTED` if ≥50% of credited appearances are SUPPORTED
   - else `WEAK_SUPPORT`
7. `A_evaluable` = status ∈ {SUPPORTED, WEAK_SUPPORT} and credited combined appearances ≥ 1.
8. **COMMON_UNIVERSE** = rows in `B_evaluable ∩ A_evaluable` (same playerId, same target).
9. Unsupported A rows are excluded from **both** A and B in the primary comparison.

## Primary metric

- RMSE on COMMON_UNIVERSE vs `targetPer100`
- Secondary: MAE, Pearson, Spearman, R², calibration intercept/slope

## Paired uncertainty

- `pairedBlockBootstrapRmseDiff` (M16b/M16c)
- Block IDs = `playerId` (same convention as M16c)
- Resamples = 1000, seed = 42, 95% CI
- Diff convention: `RMSE_A − RMSE_B` (negative ⇒ A better)
- `P(A beats B)` = share of resamples with `RMSE_A < RMSE_B`

## Practical significance

```text
PRACTICALLY_MEANINGFUL_RMSE_IMPROVEMENT = 0.5%
relativeImprovement = (RMSE_B − RMSE_A) / RMSE_B
must be >= 0.005 for A to win
```

## MODEL_SELECTION_RESULT hierarchy

### APPROACH_A_WINS — require ALL

1. `RMSE_A < RMSE_B`
2. relative improvement ≥ 0.5%
3. bootstrap `P(A beats B) ≥ 0.95`
4. 95% CI for deltaRMSE does not materially favor B (CI upper bound < 0, or at minimum does not place mass favoring B as the practical winner)
5. secondary metrics not catastrophically worse (Pearson/Spearman not strongly reversed vs B)
6. common-universe coverage sufficient (COMMON_N ≥ 50)

### APPROACH_B_WINS

- B materially better on RMSE, or bootstrap evidence materially favors B, or A degrades primary performance without meeting A-wins criteria in B’s favor strongly enough that B is clearly preferred

### PRACTICAL_TIE

- |relative RMSE difference| < 0.5%, or heavy CI overlap / ambiguous uncertainty
- **Tie → Approach B** (incumbent: simpler, higher coverage, mature)

## Diagnostics (non-decisive)

- TRAIN-only linear calibration `Y ~ a + b P` applied to VALIDATION (information vs scale)
- Static-only `P_A_static` vs full `P_A` (contextual incremental)
- Support-distance strata (TRAIN-geometry tertiles; not outcome-tuned)
- Exposure quartiles (TRAIN/early possessions)
- Coverage / coefficient / team concentration audits
- Offense/defense associations if exposed

## Explicit non-criteria

- No leaderboard / reputation / media ranking decisions
- No RESERVED_TEST access
- No post-outcome architecture changes
- Names may be restored only after `14_model_selection_decision.json` is written

## Incumbent after M16f2

| Result | RESEARCH_P_INCUMBENT |
|---|---|
| APPROACH_A_WINS | A (research only; no deploy) |
| APPROACH_B_WINS | B |
| PRACTICAL_TIE | B |
