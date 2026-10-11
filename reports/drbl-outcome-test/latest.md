# DRBL outcome test

Generated 2026-10-11T03:11:04.818Z by `npm run drbl:outcome-test`.

R² is the share of final-margin variance explained beyond home court, out of sample. ΔRMSE is the candidate's error minus published DRBL/100's error in points, with a 95% game-bootstrap interval. Negative means the candidate predicts margins better.

Promotion rule: a candidate can replace published DRBL/100 only if its interval sits below 0 in every cross-season test and never above 0 within season. Passing makes it eligible; switching is still a product decision. Anchored lineup (drbl-anchored-lineup-v1) and DRBL-P shrunk toward box rating (drbl-box-prior-v1) are stored as the shadow fields `drblAnchored100` and `drblBox100`.

Cross-season rows use each season's shipped artifact as is; the section title names its pipeline version.

## 2022-23: first 60% of games → last 40%

492 games.

| Rating | R² | RMSE | ΔRMSE vs published [95% CI] | Verdict |
|---|---|---|---|---|
| Home court only | 0.0% | 14.40 | — | baseline |
| Team net rating (roster-blind) | 13.8% | 13.37 | -0.253 [-0.626, +0.104] | no clear difference |
| Published DRBL/100 | 10.5% | 13.62 | — | baseline |
| DRBL-P raw rate (unshrunk) | 8.7% | 13.76 | +0.136 [-0.070, +0.344] | no clear difference |
| DRBL-LN (stored lineup) | 6.4% | 13.93 | +0.307 [-0.012, +0.647] | no clear difference |
| DRBL-B (box) | 0.9% | 14.33 | +0.710 [+0.377, +1.072] | worse |
| Raw on-court +/- per 100 | 17.5% | 13.08 | -0.546 [-0.861, -0.243] | better |
| Scoreboard lineup ridge (λ=6400) | 17.1% | 13.11 | -0.516 [-0.828, -0.202] | better |
| Anchored lineup (drbl-anchored-lineup-v1) | 13.7% | 13.38 | -0.247 [-0.374, -0.127] | better |
| DRBL-P shrunk toward box rating (drbl-box-prior-v1) | 19.7% | 12.90 | -0.723 [-1.088, -0.342] | better |

Added on top of published (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 9.7% | +0.062 [+0.017, +0.107] | worse |
| Published + DRBL-LN (stored lineup) | 11.0% | -0.038 [-0.138, +0.077] | no clear difference |
| Published + DRBL-B (box) | 10.2% | +0.021 [+0.006, +0.036] | worse |
| Published + Raw on-court +/- per 100 | 17.3% | -0.533 [-0.837, -0.233] | better |
| Published + Scoreboard lineup ridge (λ=6400) | 17.0% | -0.505 [-0.806, -0.205] | better |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 14.4% | -0.302 [-0.529, -0.063] | better |
| Published + DRBL-P shrunk toward box rating (drbl-box-prior-v1) | 19.6% | -0.710 [-1.104, -0.296] | better |

## 2023-24: first 60% of games → last 40%

492 games.

| Rating | R² | RMSE | ΔRMSE vs published [95% CI] | Verdict |
|---|---|---|---|---|
| Home court only | 0.0% | 16.15 | — | baseline |
| Team net rating (roster-blind) | 16.0% | 14.80 | -0.325 [-0.722, +0.047] | no clear difference |
| Published DRBL/100 | 12.3% | 15.12 | — | baseline |
| DRBL-P raw rate (unshrunk) | 10.3% | 15.29 | +0.167 [-0.051, +0.427] | no clear difference |
| DRBL-LN (stored lineup) | 7.5% | 15.53 | +0.409 [-0.008, +0.817] | no clear difference |
| DRBL-B (box) | 5.0% | 15.73 | +0.613 [+0.182, +1.058] | worse |
| Raw on-court +/- per 100 | 17.0% | 14.71 | -0.407 [-0.751, -0.047] | better |
| Scoreboard lineup ridge (λ=6400) | 18.2% | 14.60 | -0.518 [-0.841, -0.186] | better |
| Anchored lineup (drbl-anchored-lineup-v1) | 16.8% | 14.73 | -0.394 [-0.566, -0.202] | better |
| DRBL-P shrunk toward box rating (drbl-box-prior-v1) | 21.9% | 14.27 | -0.853 [-1.241, -0.413] | better |

Added on top of published (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 12.2% | +0.010 [-0.020, +0.046] | no clear difference |
| Published + DRBL-LN (stored lineup) | 13.2% | -0.080 [-0.236, +0.069] | no clear difference |
| Published + DRBL-B (box) | 11.9% | +0.037 [-0.078, +0.158] | no clear difference |
| Published + Raw on-court +/- per 100 | 16.9% | -0.403 [-0.695, -0.107] | better |
| Published + Scoreboard lineup ridge (λ=6400) | 18.0% | -0.498 [-0.825, -0.158] | better |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 17.8% | -0.478 [-0.813, -0.119] | better |
| Published + DRBL-P shrunk toward box rating (drbl-box-prior-v1) | 21.5% | -0.814 [-1.238, -0.341] | better |

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
| Team net rating (roster-blind) | 20.5% | 14.64 | -0.590 [-1.049, -0.127] | better |
| Published DRBL/100 | 14.0% | 15.23 | — | baseline |
| DRBL-P raw rate (unshrunk) | 12.6% | 15.35 | +0.126 [-0.165, +0.445] | no clear difference |
| DRBL-LN (stored lineup) | 6.1% | 15.91 | +0.684 [+0.276, +1.071] | worse |
| DRBL-B (box) | -0.2% | 16.43 | +1.209 [+0.733, +1.647] | worse |
| Raw on-court +/- per 100 | 23.8% | 14.33 | -0.896 [-1.307, -0.453] | better |
| Scoreboard lineup ridge (λ=6400) | 21.2% | 14.57 | -0.653 [-0.991, -0.299] | better |
| Anchored lineup (drbl-anchored-lineup-v1) | 17.6% | 14.90 | -0.323 [-0.489, -0.151] | better |
| DRBL-P shrunk toward box rating (drbl-box-prior-v1) | 17.3% | 14.93 | -0.297 [-0.665, +0.079] | no clear difference |

Added on top of published (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 13.9% | +0.009 [-0.109, +0.132] | no clear difference |
| Published + DRBL-LN (stored lineup) | 13.8% | +0.015 [-0.025, +0.060] | no clear difference |
| Published + DRBL-B (box) | 13.7% | +0.022 [-0.024, +0.075] | no clear difference |
| Published + Raw on-court +/- per 100 | 23.5% | -0.865 [-1.281, -0.429] | better |
| Published + Scoreboard lineup ridge (λ=6400) | 20.8% | -0.616 [-0.976, -0.246] | better |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 18.2% | -0.382 [-0.676, -0.079] | better |
| Published + DRBL-P shrunk toward box rating (drbl-box-prior-v1) | 17.6% | -0.323 [-0.612, -0.031] | better |

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
| Team net rating (roster-blind) | 25.9% | 15.27 | -0.716 [-1.257, -0.127] | better |
| Published DRBL/100 | 18.7% | 15.99 | — | baseline |
| DRBL-P raw rate (unshrunk) | 15.8% | 16.28 | +0.291 [-0.027, +0.581] | no clear difference |
| DRBL-LN (stored lineup) | 10.2% | 16.81 | +0.821 [+0.332, +1.329] | worse |
| DRBL-B (box) | 2.4% | 17.52 | +1.535 [+0.960, +2.089] | worse |
| Raw on-court +/- per 100 | 24.1% | 15.46 | -0.531 [-0.997, -0.066] | better |
| Scoreboard lineup ridge (λ=1600) | 21.1% | 15.76 | -0.229 [-0.652, +0.221] | no clear difference |
| Anchored lineup (drbl-anchored-lineup-v1) | 20.9% | 15.78 | -0.213 [-0.394, -0.046] | better |
| DRBL-P shrunk toward box rating (drbl-box-prior-v1) | 28.8% | 14.97 | -1.023 [-1.467, -0.581] | better |

Added on top of published (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 18.5% | +0.023 [+0.002, +0.045] | worse |
| Published + DRBL-LN (stored lineup) | 19.3% | -0.052 [-0.194, +0.091] | no clear difference |
| Published + DRBL-B (box) | 19.1% | -0.035 [-0.176, +0.091] | no clear difference |
| Published + Raw on-court +/- per 100 | 25.0% | -0.630 [-0.966, -0.261] | better |
| Published + Scoreboard lineup ridge (λ=1600) | 22.6% | -0.382 [-0.652, -0.103] | better |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 20.6% | -0.189 [-0.417, +0.015] | no clear difference |
| Published + DRBL-P shrunk toward box rating (drbl-box-prior-v1) | 28.6% | -1.004 [-1.473, -0.528] | better |

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
