# DRBL outcome test

Generated 2026-10-11T02:04:47.362Z by `npm run drbl:outcome-test`.

R² is the share of final-margin variance explained beyond home court, out of sample. ΔRMSE is the candidate's error minus published DRBL/100's error in points, with a 95% game-bootstrap interval. Negative means the candidate predicts margins better.

Promotion rule: a candidate replaces published DRBL/100 only if its cross-season interval sits below 0 and no within-season interval sits above 0. Anchored lineup (drbl-anchored-lineup-v1) is stored as the shadow field `drblAnchored100` until it passes.

## 2024-25: first 60% of games → last 40%

492 games.

| Rating | R² | RMSE | ΔRMSE vs published [95% CI] | Verdict |
|---|---|---|---|---|
| Home court only | 0.0% | 16.42 | — | baseline |
| Team net rating (roster-blind) | 20.5% | 14.64 | -0.034 [-0.326, +0.247] | no clear difference |
| Published DRBL/100 | 20.1% | 14.67 | — | baseline |
| DRBL-P raw rate (unshrunk) | 23.8% | 14.33 | -0.342 [-0.569, -0.106] | better |
| DRBL-LN (stored lineup) | 16.2% | 15.03 | +0.357 [-0.066, +0.781] | no clear difference |
| DRBL-B (box) | 2.4% | 16.22 | +1.551 [+1.000, +2.069] | worse |
| Raw on-court +/- per 100 | 23.8% | 14.33 | -0.339 [-0.568, -0.095] | better |
| Scoreboard lineup ridge (λ=6400) | 21.2% | 14.57 | -0.096 [-0.317, +0.146] | no clear difference |
| Anchored lineup (drbl-anchored-lineup-v1) | 22.0% | 14.50 | -0.169 [-0.368, +0.020] | no clear difference |

Added on top of published (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 23.9% | -0.352 [-0.682, +0.029] | no clear difference |
| Published + DRBL-LN (stored lineup) | 20.9% | -0.070 [-0.219, +0.079] | no clear difference |
| Published + DRBL-B (box) | 19.6% | +0.048 [+0.012, +0.087] | worse |
| Published + Raw on-court +/- per 100 | 23.6% | -0.324 [-0.573, -0.053] | better |
| Published + Scoreboard lineup ridge (λ=6400) | 21.1% | -0.091 [-0.249, +0.076] | no clear difference |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 21.6% | -0.137 [-0.327, +0.047] | no clear difference |

## 2025-26: first 60% of games → last 40%

492 games.

| Rating | R² | RMSE | ΔRMSE vs published [95% CI] | Verdict |
|---|---|---|---|---|
| Home court only | 0.0% | 17.74 | — | baseline |
| Team net rating (roster-blind) | 25.9% | 15.27 | -0.013 [-0.393, +0.367] | no clear difference |
| Published DRBL/100 | 25.7% | 15.29 | — | baseline |
| DRBL-P raw rate (unshrunk) | 26.8% | 15.17 | -0.114 [-0.374, +0.130] | no clear difference |
| DRBL-LN (stored lineup) | 20.4% | 15.82 | +0.536 [+0.069, +1.012] | worse |
| DRBL-B (box) | 2.4% | 17.53 | +2.241 [+1.627, +2.845] | worse |
| Raw on-court +/- per 100 | 24.1% | 15.46 | +0.172 [-0.198, +0.523] | no clear difference |
| Scoreboard lineup ridge (λ=1600) | 21.1% | 15.76 | +0.474 [+0.055, +0.901] | worse |
| Anchored lineup (drbl-anchored-lineup-v1) | 25.3% | 15.33 | +0.048 [-0.179, +0.262] | no clear difference |

Added on top of published (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 26.8% | -0.108 [-0.299, +0.076] | no clear difference |
| Published + DRBL-LN (stored lineup) | 26.5% | -0.075 [-0.232, +0.086] | no clear difference |
| Published + DRBL-B (box) | 25.4% | +0.029 [-0.047, +0.098] | no clear difference |
| Published + Raw on-court +/- per 100 | 26.2% | -0.052 [-0.196, +0.094] | no clear difference |
| Published + Scoreboard lineup ridge (λ=1600) | 26.1% | -0.041 [-0.161, +0.071] | no clear difference |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 25.8% | -0.007 [-0.102, +0.088] | no clear difference |

## Shipped 2024-25 ratings → every 2025-26 game

1230 games.

| Rating | R² | RMSE | ΔRMSE vs published [95% CI] | Verdict |
|---|---|---|---|---|
| Home court only | 0.0% | 16.43 | — | baseline |
| Team net rating (roster-blind) | 7.1% | 15.84 | +0.663 [+0.384, +0.939] | worse |
| Published DRBL/100 | 14.7% | 15.18 | — | baseline |
| DRBL-P raw rate (unshrunk) | 12.0% | 15.41 | +0.232 [+0.059, +0.399] | worse |
| DRBL-LN (stored lineup) | 6.8% | 15.86 | +0.684 [+0.408, +0.977] | worse |
| DRBL-B (box) | 1.4% | 16.32 | +1.137 [+0.830, +1.455] | worse |
| Raw on-court +/- per 100 | 9.8% | 15.61 | +0.427 [+0.195, +0.678] | worse |
| Scoreboard lineup ridge (λ=6400) | 10.5% | 15.55 | +0.365 [+0.157, +0.597] | worse |
| Anchored lineup (drbl-anchored-lineup-v1) | 15.3% | 15.13 | -0.055 [-0.156, +0.050] | no clear difference |
| DARKO 2024-25 (external) | 16.3% | 15.03 | -0.148 [-0.468, +0.122] | no clear difference |

Added on top of published (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 14.4% | +0.024 [+0.007, +0.044] | worse |
| Published + DRBL-LN (stored lineup) | 14.7% | -0.003 [-0.029, +0.026] | no clear difference |
| Published + DRBL-B (box) | 14.6% | +0.009 [-0.028, +0.047] | no clear difference |
| Published + Raw on-court +/- per 100 | 15.0% | -0.025 [-0.078, +0.029] | no clear difference |
| Published + Scoreboard lineup ridge (λ=6400) | 14.8% | -0.014 [-0.057, +0.032] | no clear difference |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 15.2% | -0.047 [-0.122, +0.029] | no clear difference |
| Published + DARKO 2024-25 (external) | 18.4% | -0.334 [-0.518, -0.171] | better |
