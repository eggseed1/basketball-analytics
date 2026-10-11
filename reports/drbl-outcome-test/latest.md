# DRBL outcome test

Generated 2026-10-11T18:38:57.012Z by `npm run drbl:outcome-test`.

R² is the share of final-margin variance explained beyond home court, out of sample. Slope is the final margin regressed on the margin the rating implies (on-court rating differences summed over every possession, per 100); 1 means the rating is in real points per 100, below 1 means it is spread too wide. ΔRMSE is the rating's error minus the error of Play-by-play DRBL/100 (EB1600, pre-blend) in points, with a 95% game-bootstrap interval. Negative means the rating predicts margins better.

Published DRBL/100 is DRBL/100, box blend (drbl-box-blend-v2). Its baseline here is the play-by-play-only rate it replaced in October 2026, which the artifacts keep as `drblPbp100`. A future replacement should beat published DRBL/100 in every cross-season test and never trail it within season. Play-by-play rate shrunk toward same-season box rating (blend half) is the same-season half of the blend, and Anchored lineup (drbl-anchored-lineup-v1) is stored as the shadow field `drblAnchored100`.

Cross-season rows use each season's shipped artifact; the section title names its pipeline version. Both box rows are rebuilt here from the rating window instead of read from the artifact. The blend's forward weights and calibration are refit for each test on earlier possessions only: through the rating season for cross-season tests, through the season before for within-season tests. The first local season has nothing earlier, so its within-season test has no blend row. When a within-season window is too short to fit its own box weights, the blend uses the previous season's, as the nightly compute does in opening week, and the row says so.

## 2020-21: first 60% of games → last 40%

432 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 15.94 | — | — | baseline |
| Team net rating (roster-blind) | 16.6% | 14.55 | 1.01 | -0.129 [-0.472, +0.239] | no clear difference |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 15.2% | 14.68 | 1.75 | — | baseline |
| DRBL-P raw rate (unshrunk) | 14.2% | 14.76 | 1.01 | +0.080 [-0.218, +0.382] | no clear difference |
| DRBL-LN (stored lineup) | 9.1% | 15.19 | 0.71 | +0.514 [+0.120, +0.915] | worse |
| DRBL-B (box) | 0.1% | 15.93 | 0.88 | +1.248 [+0.761, +1.775] | worse |
| Raw on-court +/- per 100 | 16.9% | 14.53 | 0.22 | -0.152 [-0.482, +0.199] | no clear difference |
| Scoreboard lineup ridge (λ=6400) | 17.3% | 14.49 | 1.50 | -0.186 [-0.475, +0.115] | no clear difference |
| Anchored lineup (drbl-anchored-lineup-v1) | 15.5% | 14.65 | 0.58 | -0.030 [-0.168, +0.118] | no clear difference |
| Play-by-play rate shrunk toward same-season box rating (blend half) | 19.4% | 14.30 | 0.54 | -0.374 [-0.811, +0.057] | no clear difference |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 15.1% | +0.009 [-0.083, +0.106] | no clear difference |
| Published + DRBL-LN (stored lineup) | 14.8% | +0.034 [-0.032, +0.111] | no clear difference |
| Published + DRBL-B (box) | 15.3% | -0.012 [-0.089, +0.089] | no clear difference |
| Published + Raw on-court +/- per 100 | 17.2% | -0.181 [-0.410, +0.066] | no clear difference |
| Published + Scoreboard lineup ridge (λ=6400) | 17.2% | -0.178 [-0.396, +0.053] | no clear difference |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 15.3% | -0.012 [-0.104, +0.089] | no clear difference |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 19.8% | -0.406 [-0.749, -0.075] | better |

## 2021-22: first 60% of games → last 40%

492 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 16.03 | — | — | baseline |
| Team net rating (roster-blind) | 14.1% | 14.85 | 0.93 | +0.113 [-0.207, +0.450] | no clear difference |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 15.4% | 14.74 | 1.63 | — | baseline |
| DRBL-P raw rate (unshrunk) | 18.8% | 14.44 | 1.11 | -0.299 [-0.539, -0.065] | better |
| DRBL-LN (stored lineup) | 9.5% | 15.24 | 0.75 | +0.505 [+0.145, +0.854] | worse |
| DRBL-B (box) | 13.5% | 14.91 | 4.44 | +0.172 [-0.315, +0.646] | no clear difference |
| Raw on-court +/- per 100 | 20.9% | 14.26 | 0.22 | -0.479 [-0.844, -0.124] | better |
| Scoreboard lineup ridge (λ=6400) | 17.7% | 14.54 | 1.34 | -0.199 [-0.446, +0.062] | no clear difference |
| Anchored lineup (drbl-anchored-lineup-v1) | 17.4% | 14.56 | 0.60 | -0.175 [-0.336, -0.022] | better |
| Play-by-play rate shrunk toward same-season box rating (blend half) | 19.9% | 14.34 | 0.62 | -0.397 [-0.766, -0.004] | better |
| DRBL/100, box blend (drbl-box-blend-v2) | 16.5% | 14.64 | 0.93 | -0.096 [-0.405, +0.250] | no clear difference |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 18.8% | -0.297 [-0.591, -0.010] | better |
| Published + DRBL-LN (stored lineup) | 15.3% | +0.012 [-0.052, +0.084] | no clear difference |
| Published + DRBL-B (box) | 19.2% | -0.334 [-0.601, -0.053] | better |
| Published + Raw on-court +/- per 100 | 20.5% | -0.445 [-0.820, -0.072] | better |
| Published + Scoreboard lineup ridge (λ=6400) | 17.6% | -0.185 [-0.384, +0.025] | no clear difference |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 17.2% | -0.152 [-0.341, +0.024] | no clear difference |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 19.8% | -0.388 [-0.707, -0.052] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) | 17.4% | -0.171 [-0.358, +0.044] | no clear difference |

## Shipped 2020-21 ratings (drbl-ranking-v2) → every 2021-22 game

1230 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 15.32 | — | — | baseline |
| Team net rating (roster-blind) | 6.4% | 14.82 | 0.56 | -0.030 [-0.250, +0.177] | no clear difference |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 6.0% | 14.85 | 1.18 | — | baseline |
| DRBL-P raw rate (unshrunk) | 8.6% | 14.64 | 0.88 | -0.210 [-0.319, -0.101] | better |
| DRBL-LN (stored lineup) | 3.9% | 15.02 | 0.41 | +0.166 [+0.021, +0.323] | worse |
| DRBL-B (box) | 0.4% | 15.29 | 0.93 | +0.439 [+0.230, +0.628] | worse |
| Raw on-court +/- per 100 | 9.9% | 14.53 | 0.17 | -0.315 [-0.492, -0.143] | better |
| Scoreboard lineup ridge (λ=6400) | 9.0% | 14.61 | 0.84 | -0.241 [-0.406, -0.090] | better |
| Anchored lineup (drbl-anchored-lineup-v1) | 7.5% | 14.73 | 0.38 | -0.120 [-0.179, -0.060] | better |
| Play-by-play rate shrunk toward same-season box rating (blend half) | 15.8% | 14.06 | 0.54 | -0.794 [-1.014, -0.590] | better |
| DRBL/100, box blend (drbl-box-blend-v2) | 13.3% | 14.26 | 0.92 | -0.587 [-0.777, -0.402] | better |
| DARKO 2020-21 (external) | 11.6% | 14.40 | 0.48 | -0.448 [-0.688, -0.223] | better |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 8.9% | -0.230 [-0.381, -0.079] | better |
| Published + DRBL-LN (stored lineup) | 6.3% | -0.021 [-0.069, +0.029] | no clear difference |
| Published + DRBL-B (box) | 6.3% | -0.022 [-0.081, +0.040] | no clear difference |
| Published + Raw on-court +/- per 100 | 9.9% | -0.314 [-0.466, -0.162] | better |
| Published + Scoreboard lineup ridge (λ=6400) | 9.0% | -0.240 [-0.376, -0.109] | better |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 7.8% | -0.145 [-0.258, -0.022] | better |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 16.4% | -0.849 [-1.120, -0.610] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) | 13.3% | -0.587 [-0.800, -0.380] | better |
| Published + DARKO 2020-21 (external) | 12.4% | -0.514 [-0.701, -0.335] | better |

## 2022-23: first 60% of games → last 40%

492 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 14.40 | — | — | baseline |
| Team net rating (roster-blind) | 13.8% | 13.37 | 1.05 | -0.253 [-0.626, +0.104] | no clear difference |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 10.5% | 13.62 | 1.57 | — | baseline |
| DRBL-P raw rate (unshrunk) | 8.7% | 13.76 | 0.90 | +0.136 [-0.070, +0.344] | no clear difference |
| DRBL-LN (stored lineup) | 6.4% | 13.93 | 0.56 | +0.307 [-0.012, +0.647] | no clear difference |
| DRBL-B (box) | 0.9% | 14.33 | 1.48 | +0.710 [+0.377, +1.072] | worse |
| Raw on-court +/- per 100 | 17.5% | 13.08 | 0.22 | -0.546 [-0.861, -0.243] | better |
| Scoreboard lineup ridge (λ=6400) | 17.1% | 13.11 | 1.34 | -0.516 [-0.828, -0.202] | better |
| Anchored lineup (drbl-anchored-lineup-v1) | 13.7% | 13.38 | 0.52 | -0.247 [-0.374, -0.127] | better |
| Play-by-play rate shrunk toward same-season box rating (blend half) | 19.7% | 12.90 | 0.70 | -0.723 [-1.088, -0.342] | better |
| DRBL/100, box blend (drbl-box-blend-v2) | 21.9% | 12.73 | 1.21 | -0.897 [-1.310, -0.495] | better |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 9.7% | +0.062 [+0.017, +0.107] | worse |
| Published + DRBL-LN (stored lineup) | 11.0% | -0.038 [-0.138, +0.077] | no clear difference |
| Published + DRBL-B (box) | 10.2% | +0.021 [+0.006, +0.036] | worse |
| Published + Raw on-court +/- per 100 | 17.3% | -0.533 [-0.837, -0.233] | better |
| Published + Scoreboard lineup ridge (λ=6400) | 17.0% | -0.505 [-0.806, -0.205] | better |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 14.4% | -0.302 [-0.529, -0.063] | better |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 19.6% | -0.710 [-1.104, -0.296] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) | 22.0% | -0.904 [-1.365, -0.458] | better |

## Shipped 2021-22 ratings (drbl-ranking-v2) → every 2022-23 game

1230 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 13.67 | — | — | baseline |
| Team net rating (roster-blind) | 4.4% | 13.37 | 0.41 | +0.124 [-0.027, +0.282] | no clear difference |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 6.1% | 13.25 | 1.26 | — | baseline |
| DRBL-P raw rate (unshrunk) | 8.3% | 13.09 | 0.97 | -0.157 [-0.224, -0.088] | better |
| DRBL-LN (stored lineup) | 5.6% | 13.28 | 0.45 | +0.038 [-0.156, +0.236] | no clear difference |
| DRBL-B (box) | 6.8% | 13.20 | 2.74 | -0.050 [-0.266, +0.159] | no clear difference |
| Raw on-court +/- per 100 | 9.5% | 13.01 | 0.15 | -0.237 [-0.406, -0.070] | better |
| Scoreboard lineup ridge (λ=6400) | 10.5% | 12.94 | 0.87 | -0.311 [-0.485, -0.139] | better |
| Anchored lineup (drbl-anchored-lineup-v1) | 9.5% | 13.01 | 0.45 | -0.238 [-0.323, -0.143] | better |
| Play-by-play rate shrunk toward same-season box rating (blend half) | 11.0% | 12.90 | 0.45 | -0.345 [-0.511, -0.177] | better |
| DRBL/100, box blend (drbl-box-blend-v2) | 11.3% | 12.88 | 0.76 | -0.369 [-0.535, -0.207] | better |
| DARKO 2021-22 (external) | 9.0% | 13.05 | 0.33 | -0.201 [-0.381, -0.004] | better |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 9.2% | -0.219 [-0.353, -0.085] | better |
| Published + DRBL-LN (stored lineup) | 8.3% | -0.153 [-0.260, -0.042] | better |
| Published + DRBL-B (box) | 9.1% | -0.208 [-0.343, -0.082] | better |
| Published + Raw on-court +/- per 100 | 9.3% | -0.222 [-0.366, -0.074] | better |
| Published + Scoreboard lineup ridge (λ=6400) | 10.2% | -0.289 [-0.450, -0.122] | better |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 10.6% | -0.316 [-0.474, -0.143] | better |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 10.8% | -0.333 [-0.498, -0.162] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) | 11.1% | -0.354 [-0.531, -0.183] | better |
| Published + DARKO 2021-22 (external) | 9.6% | -0.247 [-0.381, -0.094] | better |

## 2023-24: first 60% of games → last 40%

492 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 16.15 | — | — | baseline |
| Team net rating (roster-blind) | 16.0% | 14.80 | 0.82 | -0.325 [-0.722, +0.047] | no clear difference |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 12.3% | 15.12 | 1.74 | — | baseline |
| DRBL-P raw rate (unshrunk) | 10.3% | 15.29 | 0.95 | +0.167 [-0.051, +0.427] | no clear difference |
| DRBL-LN (stored lineup) | 7.5% | 15.53 | 0.72 | +0.409 [-0.008, +0.817] | no clear difference |
| DRBL-B (box) | 5.0% | 15.73 | 4.19 | +0.613 [+0.182, +1.058] | worse |
| Raw on-court +/- per 100 | 17.0% | 14.71 | 0.20 | -0.407 [-0.751, -0.047] | better |
| Scoreboard lineup ridge (λ=6400) | 18.2% | 14.60 | 1.28 | -0.518 [-0.841, -0.186] | better |
| Anchored lineup (drbl-anchored-lineup-v1) | 16.8% | 14.73 | 0.62 | -0.394 [-0.566, -0.202] | better |
| Play-by-play rate shrunk toward same-season box rating (blend half) | 21.9% | 14.27 | 0.63 | -0.853 [-1.241, -0.413] | better |
| DRBL/100, box blend (drbl-box-blend-v2) | 21.5% | 14.30 | 1.09 | -0.819 [-1.127, -0.507] | better |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 12.2% | +0.010 [-0.020, +0.046] | no clear difference |
| Published + DRBL-LN (stored lineup) | 13.2% | -0.080 [-0.236, +0.069] | no clear difference |
| Published + DRBL-B (box) | 11.9% | +0.037 [-0.078, +0.158] | no clear difference |
| Published + Raw on-court +/- per 100 | 16.9% | -0.403 [-0.695, -0.107] | better |
| Published + Scoreboard lineup ridge (λ=6400) | 18.0% | -0.498 [-0.825, -0.158] | better |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 17.8% | -0.478 [-0.813, -0.119] | better |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 21.5% | -0.814 [-1.238, -0.341] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) | 22.4% | -0.898 [-1.344, -0.460] | better |

## Shipped 2022-23 ratings (drbl-ranking-v2) → every 2023-24 game

1230 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 15.65 | — | — | baseline |
| Team net rating (roster-blind) | 7.2% | 15.08 | 0.75 | +0.150 [-0.026, +0.346] | no clear difference |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 9.0% | 14.93 | 1.34 | — | baseline |
| DRBL-P raw rate (unshrunk) | 10.8% | 14.78 | 1.07 | -0.148 [-0.225, -0.070] | better |
| DRBL-LN (stored lineup) | 10.2% | 14.83 | 0.75 | -0.096 [-0.333, +0.143] | no clear difference |
| DRBL-B (box) | 5.2% | 15.24 | 7.06 | +0.308 [+0.084, +0.544] | worse |
| Raw on-court +/- per 100 | 13.7% | 14.54 | 0.25 | -0.384 [-0.585, -0.175] | better |
| Scoreboard lineup ridge (λ=6400) | 13.4% | 14.56 | 1.11 | -0.366 [-0.567, -0.157] | better |
| Anchored lineup (drbl-anchored-lineup-v1) | 13.0% | 14.60 | 0.49 | -0.328 [-0.429, -0.223] | better |
| Play-by-play rate shrunk toward same-season box rating (blend half) | 17.8% | 14.19 | 0.66 | -0.739 [-0.935, -0.523] | better |
| DRBL/100, box blend (drbl-box-blend-v2) | 17.3% | 14.24 | 1.18 | -0.692 [-0.856, -0.530] | better |
| DARKO 2022-23 (external) | 11.7% | 14.71 | 0.39 | -0.219 [-0.464, +0.037] | no clear difference |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 11.1% | -0.174 [-0.306, -0.042] | better |
| Published + DRBL-LN (stored lineup) | 11.8% | -0.231 [-0.372, -0.077] | better |
| Published + DRBL-B (box) | 10.4% | -0.108 [-0.202, -0.016] | better |
| Published + Raw on-court +/- per 100 | 13.6% | -0.382 [-0.568, -0.191] | better |
| Published + Scoreboard lineup ridge (λ=6400) | 13.5% | -0.367 [-0.544, -0.180] | better |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 14.4% | -0.447 [-0.637, -0.249] | better |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 18.3% | -0.784 [-1.022, -0.531] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) | 18.4% | -0.792 [-1.028, -0.554] | better |
| Published + DARKO 2022-23 (external) | 13.3% | -0.351 [-0.519, -0.180] | better |

## 2024-25: first 60% of games → last 40%

492 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 16.42 | — | — | baseline |
| Team net rating (roster-blind) | 20.5% | 14.64 | 0.92 | -0.590 [-1.049, -0.127] | better |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 14.0% | 15.23 | 1.83 | — | baseline |
| DRBL-P raw rate (unshrunk) | 12.6% | 15.35 | 1.16 | +0.126 [-0.165, +0.445] | no clear difference |
| DRBL-LN (stored lineup) | 6.1% | 15.91 | 0.56 | +0.684 [+0.276, +1.071] | worse |
| DRBL-B (box) | -0.2% | 16.43 | 0.48 | +1.209 [+0.733, +1.647] | worse |
| Raw on-court +/- per 100 | 23.8% | 14.33 | 0.21 | -0.896 [-1.307, -0.453] | better |
| Scoreboard lineup ridge (λ=6400) | 21.2% | 14.57 | 1.22 | -0.653 [-0.991, -0.299] | better |
| Anchored lineup (drbl-anchored-lineup-v1) | 17.6% | 14.90 | 0.63 | -0.323 [-0.489, -0.151] | better |
| Play-by-play rate shrunk toward same-season box rating (blend half) | 17.3% | 14.93 | 0.59 | -0.297 [-0.665, +0.079] | no clear difference |
| DRBL/100, box blend (drbl-box-blend-v2) | 18.6% | 14.81 | 1.00 | -0.418 [-0.684, -0.136] | better |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 13.9% | +0.009 [-0.109, +0.132] | no clear difference |
| Published + DRBL-LN (stored lineup) | 13.8% | +0.015 [-0.025, +0.060] | no clear difference |
| Published + DRBL-B (box) | 13.7% | +0.022 [-0.024, +0.075] | no clear difference |
| Published + Raw on-court +/- per 100 | 23.5% | -0.865 [-1.281, -0.429] | better |
| Published + Scoreboard lineup ridge (λ=6400) | 20.8% | -0.616 [-0.976, -0.246] | better |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 18.2% | -0.382 [-0.676, -0.079] | better |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 17.6% | -0.323 [-0.612, -0.031] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) | 18.2% | -0.383 [-0.663, -0.075] | better |

## Shipped 2023-24 ratings (drbl-ranking-v2) → every 2024-25 game

1230 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 15.90 | — | — | baseline |
| Team net rating (roster-blind) | 9.0% | 15.17 | 0.60 | +0.446 [+0.200, +0.688] | worse |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 14.2% | 14.72 | 1.66 | — | baseline |
| DRBL-P raw rate (unshrunk) | 15.8% | 14.59 | 1.18 | -0.135 [-0.263, -0.007] | better |
| DRBL-LN (stored lineup) | 7.3% | 15.31 | 0.60 | +0.587 [+0.324, +0.856] | worse |
| DRBL-B (box) | 4.7% | 15.52 | 3.25 | +0.797 [+0.556, +1.051] | worse |
| Raw on-court +/- per 100 | 14.1% | 14.73 | 0.18 | +0.011 [-0.251, +0.258] | no clear difference |
| Scoreboard lineup ridge (λ=6400) | 14.3% | 14.72 | 1.00 | -0.007 [-0.244, +0.222] | no clear difference |
| Anchored lineup (drbl-anchored-lineup-v1) | 15.2% | 14.64 | 0.53 | -0.084 [-0.178, +0.005] | no clear difference |
| Play-by-play rate shrunk toward same-season box rating (blend half) | 20.3% | 14.19 | 0.65 | -0.531 [-0.756, -0.321] | better |
| DRBL/100, box blend (drbl-box-blend-v2) | 19.0% | 14.31 | 1.07 | -0.417 [-0.607, -0.230] | better |
| DARKO 2023-24 (external) | 12.6% | 14.86 | 0.48 | +0.141 [-0.112, +0.423] | no clear difference |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 15.6% | -0.119 [-0.233, -0.006] | better |
| Published + DRBL-LN (stored lineup) | 14.5% | -0.025 [-0.078, +0.027] | no clear difference |
| Published + DRBL-B (box) | 14.1% | +0.013 [-0.007, +0.031] | no clear difference |
| Published + Raw on-court +/- per 100 | 16.2% | -0.167 [-0.304, -0.037] | better |
| Published + Scoreboard lineup ridge (λ=6400) | 16.0% | -0.151 [-0.276, -0.030] | better |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 15.1% | -0.074 [-0.153, +0.004] | no clear difference |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 20.2% | -0.519 [-0.734, -0.321] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) | 18.9% | -0.407 [-0.599, -0.215] | better |
| Published + DARKO 2023-24 (external) | 16.3% | -0.182 [-0.305, -0.053] | better |

## 2025-26: first 60% of games → last 40%

492 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 17.74 | — | — | baseline |
| Team net rating (roster-blind) | 25.9% | 15.27 | 1.19 | -0.716 [-1.257, -0.127] | better |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 18.7% | 15.99 | 2.18 | — | baseline |
| DRBL-P raw rate (unshrunk) | 15.8% | 16.28 | 1.14 | +0.291 [-0.027, +0.581] | no clear difference |
| DRBL-LN (stored lineup) | 10.2% | 16.81 | 0.80 | +0.821 [+0.332, +1.329] | worse |
| DRBL-B (box) | 2.4% | 17.52 | 1.78 | +1.535 [+0.960, +2.089] | worse |
| Raw on-court +/- per 100 | 24.1% | 15.46 | 0.24 | -0.531 [-0.997, -0.066] | better |
| Scoreboard lineup ridge (λ=1600) | 21.1% | 15.76 | 1.01 | -0.229 [-0.652, +0.221] | no clear difference |
| Anchored lineup (drbl-anchored-lineup-v1) | 20.9% | 15.78 | 0.67 | -0.213 [-0.394, -0.046] | better |
| Play-by-play rate shrunk toward same-season box rating (blend half) | 28.8% | 14.97 | 0.70 | -1.023 [-1.467, -0.581] | better |
| DRBL/100, box blend (drbl-box-blend-v2) | 30.9% | 14.74 | 1.32 | -1.248 [-1.595, -0.892] | better |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 18.5% | +0.023 [+0.002, +0.045] | worse |
| Published + DRBL-LN (stored lineup) | 19.3% | -0.052 [-0.194, +0.091] | no clear difference |
| Published + DRBL-B (box) | 19.1% | -0.035 [-0.176, +0.091] | no clear difference |
| Published + Raw on-court +/- per 100 | 25.0% | -0.630 [-0.966, -0.261] | better |
| Published + Scoreboard lineup ridge (λ=1600) | 22.6% | -0.382 [-0.652, -0.103] | better |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 20.6% | -0.189 [-0.417, +0.015] | no clear difference |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 28.6% | -1.004 [-1.473, -0.528] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) | 32.5% | -1.421 [-1.931, -0.934] | better |

## Shipped 2024-25 ratings (drbl-ranking-v2-seq) → every 2025-26 game

1230 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 16.43 | — | — | baseline |
| Team net rating (roster-blind) | 7.1% | 15.84 | 0.52 | +0.663 [+0.384, +0.939] | worse |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 14.7% | 15.18 | 1.87 | — | baseline |
| DRBL-P raw rate (unshrunk) | 12.0% | 15.41 | 1.12 | +0.232 [+0.059, +0.399] | worse |
| DRBL-LN (stored lineup) | 6.8% | 15.86 | 0.52 | +0.684 [+0.408, +0.977] | worse |
| DRBL-B (box) | 1.4% | 16.32 | 2.11 | +1.137 [+0.830, +1.455] | worse |
| Raw on-court +/- per 100 | 9.8% | 15.61 | 0.16 | +0.427 [+0.195, +0.678] | worse |
| Scoreboard lineup ridge (λ=6400) | 10.5% | 15.55 | 0.85 | +0.365 [+0.157, +0.597] | worse |
| Anchored lineup (drbl-anchored-lineup-v1) | 15.3% | 15.13 | 0.59 | -0.055 [-0.156, +0.050] | no clear difference |
| Play-by-play rate shrunk toward same-season box rating (blend half) | 17.9% | 14.89 | 0.65 | -0.288 [-0.519, -0.079] | better |
| DRBL/100, box blend (drbl-box-blend-v2) | 20.3% | 14.67 | 1.16 | -0.506 [-0.675, -0.338] | better |
| DARKO 2024-25 (external) | 16.3% | 15.03 | 0.60 | -0.148 [-0.468, +0.122] | no clear difference |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 14.4% | +0.024 [+0.007, +0.044] | worse |
| Published + DRBL-LN (stored lineup) | 14.7% | -0.003 [-0.029, +0.026] | no clear difference |
| Published + DRBL-B (box) | 14.6% | +0.009 [-0.028, +0.047] | no clear difference |
| Published + Raw on-court +/- per 100 | 15.0% | -0.025 [-0.078, +0.029] | no clear difference |
| Published + Scoreboard lineup ridge (λ=6400) | 14.8% | -0.014 [-0.057, +0.032] | no clear difference |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 15.2% | -0.047 [-0.122, +0.029] | no clear difference |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 18.4% | -0.331 [-0.503, -0.175] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) | 20.4% | -0.517 [-0.723, -0.314] | better |
| Published + DARKO 2024-25 (external) | 18.4% | -0.334 [-0.518, -0.171] | better |
