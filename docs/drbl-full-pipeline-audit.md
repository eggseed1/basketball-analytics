# DRBL Full Pipeline Audit

## 1. Existing architecture (pre-fix)

```text
rawDRBL → (* 2.519 team-net through-origin) → calibrated → WAR with replacement=0
posteriorDRBL computed (EB) but bypassed for WAR
position proxy invented from impact-like rates (invalid)
archetypes mixed quality signals
```

## 2. Bugs found

1. **POSTERIOR_COMPUTED_BUT_UNUSED** — WAR calibrated raw, not posterior.
2. **Legacy 2.519** — in-sample through-origin slope raw-team-rate → net rating; global multiplier; not OOF.
3. **replacementLevel=0** — made WAR ≈ WAA on calibrated scale.
4. **Circular impliedReplacement** — algebraic identity, not validation.
5. **POSITION_PROXY_INVALID** — invented PG for centers.
6. **Archetype quality leakage risk** — prior labels used O/D impact rates with quality-like thresholds.

## 3. Posterior bypass diagnosis

Confirmed: `calibrated ≈ 2.519 * raw`. Posterior unused in WAR path.

## 4. Calibration constant diagnosis

`2.519` = through-origin OLS of (5 × possession-weighted raw DRBL) vs team net rating (2024-25).
Class: **learned in-sample scale factor**, not theoretical constant. Replaced by LOO fit.

## 5. Replacement-level diagnosis

Zero was R1-embedded on raw residual scale, but after multiplicative calibration and with EB prior at 0, treating 0 as replacement made WAR≈WAA.
New: fringe median of **finalAbility** (poss 200–800).

## 6–7. Position / archetype

Position = `UNKNOWN` / `unavailable` (no false proxies).
Archetypes = behavior-only category rates with EB shrink; no DRBL/WAR inputs.

## 8. Corrected architecture

```text
raw → posterior (EB) → LOO calibrate → finalAbility
  ├─ WAA
  └─ − replacement → WAR
metadata: position/archetype diagnostics only
```

## 9–12. Derivations

- Posterior: EB fused rate, prior 0, k=200
- Calibration: LOO team net rating, input=`posterior`, intercept=0, slope=5.8354, oofMae=3.121, oofCorr=0.809
- Replacement: fringe_median_poss_200_800, value=-1.4886, n=64
- Points/win: median margin/(wins−.500*G) = 38.714

## 15–18. Ablation / OOF / accounting

| Model | OOF MAE | OOF Corr | Slope |
|---|---:|---:|---:|
| calibrate(raw) | 2.897 | 0.945 | 3.376 |
| calibrate(posterior) | 3.121 | 0.809 | 5.835 |

Selected: **posterior**

Team WAR: slope=0.555, RMSE=8.12, corr=0.786
Team WAA: slope=0.560, RMSE=8.08, corr=0.788

League totals: WAA=-184.68, WAR=754.49

## 19. Before/after top WAR

1. Nikola Jokić: old=9.57 → WAR=28.914181 WAA=24.79
2. Shai Gilgeous-Alexander: old=10.03 → WAR=25.44048 WAA=21.26
3. Franz Wagner: old=3.62 → WAR=19.412415 WAA=16.26
4. Victor Wembanyama: old=1.36 → WAR=17.769549 WAA=15.45
5. Norman Powell: old=5.69 → WAR=17.317831 WAA=14.22
6. Payton Pritchard: old=4.98 → WAR=16.911761 WAA=13.44
7. Naz Reid: old=2.94 → WAR=16.685229 WAA=13.21
8. Jimmy Butler: old=4.38 → WAR=16.569911 WAA=13.89
9. Jaren Jackson Jr.: old=4.51 → WAR=16.501235 WAA=12.77
10. Zach LaVine: old=2.60 → WAR=14.986467 WAA=10.80
11. Ivica Zubac: old=4.63 → WAR=14.935679 WAA=10.81
12. DeMar DeRozan: old=2.99 → WAR=14.931806 WAA=10.53
13. Keon Ellis: old=4.08 → WAR=14.175524 WAA=11.09
14. Christian Braun: old=5.21 → WAR=13.732649 WAA=9.49
15. Tari Eason: old=3.47 → WAR=13.130717 WAA=10.89

## 20. Remaining limitations

- Team-net LOO calibration is still a coarse mapping from player-aggregated rates.
- Fringe replacement is possession-band based (no contract/two-way feed yet).
- Position metadata unavailable in this remaster pass.
- Approach B residual units remain model-specific; calibration approximates net-rating scale.
