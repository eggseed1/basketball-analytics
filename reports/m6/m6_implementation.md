# M6 Implementation Report (standalone)

**Version:** drbl-m6-shot-decision-v1  
**Generated:** 2026-08-12T03:05:07.256Z  
**Parser:** drbl-parser-2026.08.11  
**Reconstruction:** drbl-recon-2026.08.11  

## Status

M6 is implemented as a **standalone** subsystem.

**NOT integrated** into DRBL fusion, replacement, WAR, shrinkage, DRBL-L, or public leaderboard artifacts.

M15 freeze baseline under `reports/m15/` is preserved.

## Equations

```
ÊPV_shoot(S_t)    = P̂(make | S_t) · pointValue
ÊPV_continue(S_t) = EPV̂_possession(S_t)   // M5 expected points at pre-shot state
SDV(S_t)          = ÊPV_shoot(S_t) − ÊPV_continue(S_t)
ShotMaking        = observedShotPoints − ÊPV_shoot(S_t)
```

- `pointValue` ∈ {2,3} from attempt type (known at decision).
- `P̂(make)` = clamped linear probability from ridge features (chrono OOF).
- Pre-shot score: Made shots reverse `pointsOnAction` before building state.

## Data used

| Item | Value |
|------|------|
| Seasons | 2024-25 |
| Limit per season | 200 |
| Games processed (non-quarantine) | 200 |
| Games failed | 0 |
| Quarantined skipped | 0 |
| Train shots | 28351 |
| Holdout shots | 7139 |
| Holdout frac (by games) | 0.2 |

## Timestamp safety

See `m6_leakage_report.csv` and `m6_feature_provenance.csv`.

Key rules enforced:
1. No final box aggregates.
2. No same-possession realized points in training targets for P(make) or EPV_continue.
3. No future games in player priors at prediction time.
4. Make model coefficients fit on train games only.

## OOS results (holdout)

| Metric | Value |
|--------|------:|
| Make model MAE | 0.4790 |
| Make model RMSE | 0.4906 |
| Make model log-loss | 0.6740 |
| Bucket baseline MAE | 0.4814 |
| Bucket baseline log-loss | 0.6761 |
| ΔMAE (baseline − model) | 0.0024 |
| Shot points vs ÊPV_shoot MAE | 1.1545 |
| ShotMaking overall mean (should ≈ 0) | -0.0069 |
| SDV corr vs next offense poss. points | 0.0247 (n=7080) |
| Makes with SDV < 0 | 1737 |
| Misses with SDV > 0 | 1663 |

**Incremental information vs simple shot-quality baseline:** YES_but_small_MAE_gain_vs_bucket_baseline

## Known limitations (this pass)

1. `EPV_continue` uses M5 possession-state EPV at the shot timestamp — a coarse proxy for the true pass/dribble counterfactual (no shot-clock residual / action-graph model).
2. Make model is linear probability ridge (not logistic); gains vs distance-bucket baseline are small on this sample.
3. Lineup features are prior make-rate averages of on-court players (not a full RAPM lineup model).
4. SDV vs *next* offense possession is a weak diagnostic target; decision quality primarily concerns the *current* shot/continuation tradeoff.

## Files

- `drbl/models/shot-decision.ts`
- `drbl/models/__tests__/shot-decision.test.ts`
- `scripts/drbl-m6-validate.ts`
- Model artifact: `data/drbl/models/m6-make-coeffs.json` (written by this CLI)

## Explicit non-goals (this pass)

- No fusion weight changes
- No fusion target changes
- No replacement / WAR / shrinkage / DRBL-L changes
- No public `precomputed/*.json` rewrites
