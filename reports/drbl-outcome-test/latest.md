# DRBL outcome test

Generated 2026-10-11T02:30:14.603Z by `npm run drbl:outcome-test`.

R² is the share of final-margin variance explained beyond home court, out of sample. ΔRMSE is the candidate's error minus published DRBL/100's error in points, with a 95% game-bootstrap interval. Negative means the candidate predicts margins better.

Promotion rule: a candidate can replace published DRBL/100 only if its interval sits below 0 in every cross-season test and never above 0 within season. Passing makes it eligible; switching is still a product decision. Anchored lineup (drbl-anchored-lineup-v1) and DRBL-P shrunk toward box rating (drbl-box-prior-v1) are stored as the shadow fields `drblAnchored100` and `drblBox100`.

Cross-season rows use each season's shipped artifact as is; the section title names its pipeline version.

## 2022-23: first 60% of games → last 40%

492 games.

| Rating | R² | RMSE | ΔRMSE vs published [95% CI] | Verdict |
|---|---|---|---|---|
| Home court only | 0.0% | 14.40 | — | baseline |
| Team net rating (roster-blind) | 13.8% | 13.37 | +0.159 [-0.129, +0.449] | no clear difference |
| Published DRBL/100 | 15.8% | 13.21 | — | baseline |
| DRBL-P raw rate (unshrunk) | 16.7% | 13.14 | -0.070 [-0.250, +0.108] | no clear difference |
| DRBL-LN (stored lineup) | 11.5% | 13.55 | +0.338 [+0.035, +0.664] | worse |
| DRBL-B (box) | 2.5% | 14.22 | +1.005 [+0.565, +1.436] | worse |
| Raw on-court +/- per 100 | 17.5% | 13.08 | -0.134 [-0.360, +0.069] | no clear difference |
| Scoreboard lineup ridge (λ=6400) | 17.1% | 13.11 | -0.104 [-0.323, +0.109] | no clear difference |
| Anchored lineup (drbl-anchored-lineup-v1) | 16.5% | 13.15 | -0.057 [-0.183, +0.069] | no clear difference |
| DRBL-P shrunk toward box rating (drbl-box-prior-v1) | 21.4% | 12.76 | -0.449 [-0.793, -0.093] | better |

Added on top of published (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 16.2% | -0.031 [-0.180, +0.125] | no clear difference |
| Published + DRBL-LN (stored lineup) | 16.0% | -0.015 [-0.085, +0.066] | no clear difference |
| Published + DRBL-B (box) | 15.6% | +0.014 [-0.012, +0.040] | no clear difference |
| Published + Raw on-court +/- per 100 | 17.6% | -0.140 [-0.305, +0.014] | no clear difference |
| Published + Scoreboard lineup ridge (λ=6400) | 17.4% | -0.123 [-0.277, +0.030] | no clear difference |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 16.3% | -0.041 [-0.148, +0.063] | no clear difference |
| Published + DRBL-P shrunk toward box rating (drbl-box-prior-v1) | 21.2% | -0.432 [-0.753, -0.105] | better |

## 2023-24: first 60% of games → last 40%

492 games.

| Rating | R² | RMSE | ΔRMSE vs published [95% CI] | Verdict |
|---|---|---|---|---|
| Home court only | 0.0% | 16.15 | — | baseline |
| Team net rating (roster-blind) | 16.0% | 14.80 | +0.011 [-0.245, +0.269] | no clear difference |
| Published DRBL/100 | 16.1% | 14.78 | — | baseline |
| DRBL-P raw rate (unshrunk) | 18.3% | 14.60 | -0.190 [-0.322, -0.053] | better |
| DRBL-LN (stored lineup) | 17.9% | 14.63 | -0.157 [-0.550, +0.253] | no clear difference |
| DRBL-B (box) | 6.1% | 15.65 | +0.863 [+0.407, +1.351] | worse |
| Raw on-court +/- per 100 | 17.0% | 14.71 | -0.072 [-0.290, +0.154] | no clear difference |
| Scoreboard lineup ridge (λ=6400) | 18.2% | 14.60 | -0.183 [-0.401, +0.027] | no clear difference |
| Anchored lineup (drbl-anchored-lineup-v1) | 19.6% | 14.48 | -0.309 [-0.489, -0.116] | better |
| DRBL-P shrunk toward box rating (drbl-box-prior-v1) | 22.4% | 14.22 | -0.565 [-0.862, -0.229] | better |

Added on top of published (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 18.2% | -0.178 [-0.374, +0.025] | no clear difference |
| Published + DRBL-LN (stored lineup) | 19.1% | -0.264 [-0.510, -0.007] | better |
| Published + DRBL-B (box) | 15.8% | +0.029 [-0.050, +0.115] | no clear difference |
| Published + Raw on-court +/- per 100 | 17.1% | -0.084 [-0.229, +0.070] | no clear difference |
| Published + Scoreboard lineup ridge (λ=6400) | 17.9% | -0.158 [-0.360, +0.043] | no clear difference |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 19.6% | -0.312 [-0.562, -0.047] | better |
| Published + DRBL-P shrunk toward box rating (drbl-box-prior-v1) | 21.9% | -0.517 [-0.848, -0.145] | better |

## Shipped 2022-23 ratings (drbl-ranking-v2) → every 2023-24 game

1230 games.

| Rating | R² | RMSE | ΔRMSE vs published [95% CI] | Verdict |
|---|---|---|---|---|
| Home court only | 0.0% | 15.65 | — | baseline |
| Team net rating (roster-blind) | 7.2% | 15.08 | +0.150 [-0.026, +0.346] | no clear difference |
| Published DRBL/100 | 9.0% | 14.93 | — | baseline |
| DRBL-P raw rate (unshrunk) | 10.8% | 14.78 | -0.148 [-0.225, -0.070] | better |
| DRBL-LN (stored lineup) | 10.2% | 14.83 | -0.096 [-0.333, +0.143] | no clear difference |
| DRBL-B (box) | 5.2% | 15.24 | +0.308 [+0.084, +0.544] | worse |
| Raw on-court +/- per 100 | 13.7% | 14.54 | -0.384 [-0.585, -0.175] | better |
| Scoreboard lineup ridge (λ=6400) | 13.4% | 14.56 | -0.366 [-0.567, -0.157] | better |
| Anchored lineup (drbl-anchored-lineup-v1) | 13.0% | 14.60 | -0.328 [-0.429, -0.223] | better |
| DRBL-P shrunk toward box rating (drbl-box-prior-v1) | 17.8% | 14.19 | -0.739 [-0.935, -0.523] | better |
| DARKO 2022-23 (external) | 11.7% | 14.71 | -0.219 [-0.464, +0.037] | no clear difference |

Added on top of published (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 11.1% | -0.174 [-0.306, -0.042] | better |
| Published + DRBL-LN (stored lineup) | 11.8% | -0.231 [-0.372, -0.077] | better |
| Published + DRBL-B (box) | 10.4% | -0.108 [-0.202, -0.016] | better |
| Published + Raw on-court +/- per 100 | 13.6% | -0.382 [-0.568, -0.191] | better |
| Published + Scoreboard lineup ridge (λ=6400) | 13.5% | -0.367 [-0.544, -0.180] | better |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 14.4% | -0.447 [-0.637, -0.249] | better |
| Published + DRBL-P shrunk toward box rating (drbl-box-prior-v1) | 18.3% | -0.784 [-1.022, -0.531] | better |
| Published + DARKO 2022-23 (external) | 13.3% | -0.351 [-0.519, -0.180] | better |

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
| DRBL-P shrunk toward box rating (drbl-box-prior-v1) | 19.7% | 14.71 | +0.040 [-0.346, +0.410] | no clear difference |

Added on top of published (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 23.9% | -0.352 [-0.682, +0.029] | no clear difference |
| Published + DRBL-LN (stored lineup) | 20.9% | -0.070 [-0.219, +0.079] | no clear difference |
| Published + DRBL-B (box) | 19.6% | +0.048 [+0.012, +0.087] | worse |
| Published + Raw on-court +/- per 100 | 23.6% | -0.324 [-0.573, -0.053] | better |
| Published + Scoreboard lineup ridge (λ=6400) | 21.1% | -0.091 [-0.249, +0.076] | no clear difference |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 21.6% | -0.137 [-0.327, +0.047] | no clear difference |
| Published + DRBL-P shrunk toward box rating (drbl-box-prior-v1) | 21.4% | -0.113 [-0.311, +0.081] | no clear difference |

## Shipped 2023-24 ratings (drbl-ranking-v2) → every 2024-25 game

1230 games.

| Rating | R² | RMSE | ΔRMSE vs published [95% CI] | Verdict |
|---|---|---|---|---|
| Home court only | 0.0% | 15.90 | — | baseline |
| Team net rating (roster-blind) | 9.0% | 15.17 | +0.446 [+0.200, +0.688] | worse |
| Published DRBL/100 | 14.2% | 14.72 | — | baseline |
| DRBL-P raw rate (unshrunk) | 15.8% | 14.59 | -0.135 [-0.263, -0.007] | better |
| DRBL-LN (stored lineup) | 7.3% | 15.31 | +0.587 [+0.324, +0.856] | worse |
| DRBL-B (box) | 4.7% | 15.52 | +0.797 [+0.556, +1.051] | worse |
| Raw on-court +/- per 100 | 14.1% | 14.73 | +0.011 [-0.251, +0.258] | no clear difference |
| Scoreboard lineup ridge (λ=6400) | 14.3% | 14.72 | -0.007 [-0.244, +0.222] | no clear difference |
| Anchored lineup (drbl-anchored-lineup-v1) | 15.2% | 14.64 | -0.084 [-0.178, +0.005] | no clear difference |
| DRBL-P shrunk toward box rating (drbl-box-prior-v1) | 20.3% | 14.19 | -0.532 [-0.757, -0.321] | better |
| DARKO 2023-24 (external) | 12.6% | 14.86 | +0.141 [-0.112, +0.423] | no clear difference |

Added on top of published (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 15.6% | -0.119 [-0.233, -0.006] | better |
| Published + DRBL-LN (stored lineup) | 14.5% | -0.025 [-0.078, +0.027] | no clear difference |
| Published + DRBL-B (box) | 14.1% | +0.013 [-0.007, +0.031] | no clear difference |
| Published + Raw on-court +/- per 100 | 16.2% | -0.167 [-0.304, -0.037] | better |
| Published + Scoreboard lineup ridge (λ=6400) | 16.0% | -0.151 [-0.276, -0.030] | better |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 15.1% | -0.074 [-0.153, +0.004] | no clear difference |
| Published + DRBL-P shrunk toward box rating (drbl-box-prior-v1) | 20.2% | -0.520 [-0.735, -0.322] | better |
| Published + DARKO 2023-24 (external) | 16.3% | -0.182 [-0.305, -0.053] | better |

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
| DRBL-P shrunk toward box rating (drbl-box-prior-v1) | 30.5% | 14.78 | -0.502 [-0.899, -0.112] | better |

Added on top of published (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 26.8% | -0.108 [-0.299, +0.076] | no clear difference |
| Published + DRBL-LN (stored lineup) | 26.5% | -0.075 [-0.232, +0.086] | no clear difference |
| Published + DRBL-B (box) | 25.4% | +0.029 [-0.047, +0.098] | no clear difference |
| Published + Raw on-court +/- per 100 | 26.2% | -0.052 [-0.196, +0.094] | no clear difference |
| Published + Scoreboard lineup ridge (λ=1600) | 26.1% | -0.041 [-0.161, +0.071] | no clear difference |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 25.8% | -0.007 [-0.102, +0.088] | no clear difference |
| Published + DRBL-P shrunk toward box rating (drbl-box-prior-v1) | 30.5% | -0.498 [-0.824, -0.164] | better |

## Shipped 2024-25 ratings (drbl-ranking-v2-seq) → every 2025-26 game

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
| DRBL-P shrunk toward box rating (drbl-box-prior-v1) | 17.9% | 14.89 | -0.289 [-0.519, -0.080] | better |
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
| Published + DRBL-P shrunk toward box rating (drbl-box-prior-v1) | 18.4% | -0.331 [-0.504, -0.175] | better |
| Published + DARKO 2024-25 (external) | 18.4% | -0.334 [-0.518, -0.171] | better |
