# DRBL outcome test

Generated 2026-10-11T18:45:59.595Z by `npm run drbl:outcome-test`.

R² is the share of final-margin variance explained beyond home court, out of sample. Slope is the final margin regressed on the margin the rating implies (on-court rating differences summed over every possession, per 100); 1 means the rating is in real points per 100, below 1 means it is spread too wide. ΔRMSE is the rating's error minus the error of Play-by-play DRBL/100 (EB1600, pre-blend) in points, with a 95% game-bootstrap interval. Negative means the rating predicts margins better.

Published DRBL/100 is DRBL/100, box blend (drbl-box-blend-v2). Its baseline here is the play-by-play-only rate it replaced in October 2026, which the artifacts keep as `drblPbp100`. A future replacement should beat published DRBL/100 in every cross-season test and never trail it within season. Play-by-play rate shrunk toward same-season box rating (blend half) is the same-season half of the blend, and Anchored lineup (drbl-anchored-lineup-v1) is stored as the shadow field `drblAnchored100`.

Cross-season rows use each season's shipped artifact; the section title names its pipeline version. Both box rows are rebuilt here from the rating window instead of read from the artifact. The blend's forward weights and calibration are refit for each test on earlier possessions only: through the rating season for cross-season tests, through the season before for within-season tests. The first local season has nothing earlier, so its within-season test has no blend row. When a within-season window is too short to fit its own box weights, the blend uses the previous season's, as the nightly compute does in opening week, and the row says so.

## 2020-21: first 15% of games → last 85%

918 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 15.12 | — | — | baseline |
| Team net rating (roster-blind) | 7.9% | 14.51 | 0.64 | -0.326 [-0.514, -0.132] | better |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 3.7% | 14.84 | 1.30 | — | baseline |
| DRBL-P raw rate (unshrunk) | 1.4% | 15.01 | 0.28 | +0.177 [+0.079, +0.288] | worse |
| DRBL-LN (stored lineup) | 2.2% | 14.95 | 0.48 | +0.116 [-0.036, +0.263] | no clear difference |
| DRBL-B (box) | -0.0% | 15.12 | -0.77 | +0.283 [+0.115, +0.479] | worse |
| Raw on-court +/- per 100 | 4.2% | 14.80 | 0.10 | -0.038 [-0.191, +0.121] | no clear difference |
| Scoreboard lineup ridge (λ=400) | 2.5% | 14.93 | 0.27 | +0.089 [-0.072, +0.253] | no clear difference |
| Anchored lineup (drbl-anchored-lineup-v1) | 4.1% | 14.81 | 0.38 | -0.033 [-0.067, +0.003] | no clear difference |
| Play-by-play rate shrunk toward same-season box rating (blend half) | 6.1% | 14.65 | 0.23 | -0.192 [-0.354, -0.018] | better |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 4.0% | -0.025 [-0.099, +0.050] | no clear difference |
| Published + DRBL-LN (stored lineup) | 3.9% | -0.015 [-0.062, +0.032] | no clear difference |
| Published + DRBL-B (box) | 3.8% | -0.009 [-0.078, +0.070] | no clear difference |
| Published + Raw on-court +/- per 100 | 4.5% | -0.065 [-0.162, +0.036] | no clear difference |
| Published + Scoreboard lineup ridge (λ=400) | 4.1% | -0.035 [-0.104, +0.034] | no clear difference |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 4.1% | -0.034 [-0.098, +0.034] | no clear difference |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 6.0% | -0.183 [-0.325, -0.033] | better |

## 2021-22: first 15% of games → last 85%

1046 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 15.49 | — | — | baseline |
| Team net rating (roster-blind) | 3.5% | 15.21 | 0.36 | +0.041 [-0.087, +0.158] | no clear difference |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 4.0% | 15.17 | 1.15 | — | baseline |
| DRBL-P raw rate (unshrunk) | 5.1% | 15.09 | 0.49 | -0.088 [-0.199, +0.015] | no clear difference |
| DRBL-LN (stored lineup) | 2.3% | 15.31 | 0.48 | +0.137 [-0.001, +0.272] | no clear difference |
| DRBL-B (box) | 6.7% | 14.96 | 3.32 | -0.211 [-0.461, +0.019] | no clear difference |
| Raw on-court +/- per 100 | 5.6% | 15.05 | 0.10 | -0.127 [-0.256, +0.024] | no clear difference |
| Scoreboard lineup ridge (λ=400) | 3.1% | 15.24 | 0.32 | +0.072 [-0.069, +0.218] | no clear difference |
| Anchored lineup (drbl-anchored-lineup-v1) | 4.2% | 15.16 | 0.34 | -0.016 [-0.053, +0.018] | no clear difference |
| Play-by-play rate shrunk toward same-season box rating (blend half) | 11.9% | 14.54 | 0.30 | -0.634 [-0.851, -0.407] | better |
| DRBL/100, box blend (drbl-box-blend-v2) | 9.7% | 14.72 | 0.86 | -0.458 [-0.631, -0.267] | better |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 4.9% | -0.072 [-0.184, +0.031] | no clear difference |
| Published + DRBL-LN (stored lineup) | 3.8% | +0.014 [-0.017, +0.047] | no clear difference |
| Published + DRBL-B (box) | 8.1% | -0.328 [-0.521, -0.156] | better |
| Published + Raw on-court +/- per 100 | 5.6% | -0.123 [-0.241, +0.011] | no clear difference |
| Published + Scoreboard lineup ridge (λ=400) | 4.4% | -0.030 [-0.091, +0.037] | no clear difference |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 3.9% | +0.009 [-0.030, +0.046] | no clear difference |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 12.1% | -0.652 [-0.901, -0.389] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) | 9.9% | -0.472 [-0.680, -0.250] | better |

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
| Scoreboard lineup ridge (λ=400) | 9.0% | 14.61 | 0.43 | -0.240 [-0.405, -0.065] | better |
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
| Published + Scoreboard lineup ridge (λ=400) | 9.1% | -0.244 [-0.383, -0.096] | better |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 7.8% | -0.145 [-0.258, -0.022] | better |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 16.4% | -0.849 [-1.120, -0.610] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) | 13.3% | -0.587 [-0.800, -0.380] | better |
| Published + DARKO 2020-21 (external) | 12.4% | -0.514 [-0.701, -0.335] | better |

## 2022-23: first 15% of games → last 85%

1046 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 13.77 | — | — | baseline |
| Team net rating (roster-blind) | 5.1% | 13.41 | 0.50 | -0.246 [-0.412, -0.077] | better |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 1.6% | 13.66 | 0.95 | — | baseline |
| DRBL-P raw rate (unshrunk) | 0.6% | 13.72 | 0.23 | +0.065 [-0.001, +0.125] | no clear difference |
| DRBL-LN (stored lineup) | 1.5% | 13.66 | 0.35 | +0.002 [-0.092, +0.105] | no clear difference |
| DRBL-B (box) | 0.3% | 13.74 | 0.63 | +0.085 [-0.009, +0.168] | no clear difference |
| Raw on-court +/- per 100 | 5.4% | 13.39 | 0.11 | -0.266 [-0.415, -0.115] | better |
| Scoreboard lineup ridge (λ=6400) | 5.4% | 13.39 | 1.20 | -0.268 [-0.418, -0.117] | better |
| Anchored lineup (drbl-anchored-lineup-v1) | 2.7% | 13.58 | 0.31 | -0.080 [-0.126, -0.031] | better |
| Play-by-play rate shrunk toward same-season box rating (blend half) | 5.0% | 13.42 | 0.18 | -0.239 [-0.377, -0.106] | better |
| DRBL/100, box blend (drbl-box-blend-v2) | 8.7% | 13.16 | 0.81 | -0.502 [-0.673, -0.321] | better |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 1.4% | +0.011 [-0.012, +0.033] | no clear difference |
| Published + DRBL-LN (stored lineup) | 1.8% | -0.020 [-0.073, +0.040] | no clear difference |
| Published + DRBL-B (box) | 1.4% | +0.010 [-0.003, +0.023] | no clear difference |
| Published + Raw on-court +/- per 100 | 5.2% | -0.251 [-0.410, -0.090] | better |
| Published + Scoreboard lineup ridge (λ=6400) | 5.2% | -0.256 [-0.410, -0.101] | better |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 3.7% | -0.150 [-0.272, -0.033] | better |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 5.0% | -0.238 [-0.393, -0.090] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) | 9.8% | -0.585 [-0.806, -0.351] | better |

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
| Scoreboard lineup ridge (λ=400) | 11.2% | 12.88 | 0.45 | -0.363 [-0.602, -0.136] | better |
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
| Published + Scoreboard lineup ridge (λ=400) | 11.5% | -0.387 [-0.579, -0.204] | better |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 10.6% | -0.316 [-0.474, -0.143] | better |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 10.8% | -0.333 [-0.498, -0.162] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) | 11.1% | -0.354 [-0.531, -0.183] | better |
| Published + DARKO 2021-22 (external) | 9.6% | -0.247 [-0.381, -0.094] | better |

## 2023-24: first 15% of games → last 85%

1046 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 15.95 | — | — | baseline |
| Team net rating (roster-blind) | 15.4% | 14.67 | 0.78 | -0.803 [-1.057, -0.522] | better |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 5.9% | 15.48 | 1.55 | — | baseline |
| DRBL-P raw rate (unshrunk) | 3.4% | 15.68 | 0.45 | +0.200 [+0.072, +0.327] | worse |
| DRBL-LN (stored lineup) | 2.7% | 15.73 | 0.53 | +0.259 [+0.106, +0.402] | worse |
| DRBL-B (box) | 0.4% | 15.92 | 0.86 | +0.444 [+0.228, +0.662] | worse |
| Raw on-court +/- per 100 | 11.8% | 14.98 | 0.15 | -0.492 [-0.705, -0.274] | better |
| Scoreboard lineup ridge (λ=800) | 10.3% | 15.11 | 0.65 | -0.367 [-0.566, -0.156] | better |
| Anchored lineup (drbl-anchored-lineup-v1) | 9.1% | 15.21 | 0.52 | -0.263 [-0.336, -0.185] | better |
| Play-by-play rate shrunk toward same-season box rating (blend half) | 14.6% | 14.74 | 0.38 | -0.734 [-1.011, -0.458] | better |
| DRBL/100, box blend (drbl-box-blend-v2) | 15.4% | 14.68 | 1.23 | -0.800 [-1.008, -0.571] | better |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 5.8% | +0.003 [-0.045, +0.053] | no clear difference |
| Published + DRBL-LN (stored lineup) | 5.8% | +0.009 [-0.001, +0.019] | no clear difference |
| Published + DRBL-B (box) | 6.2% | -0.026 [-0.089, +0.034] | no clear difference |
| Published + Raw on-court +/- per 100 | 11.6% | -0.475 [-0.695, -0.254] | better |
| Published + Scoreboard lineup ridge (λ=800) | 10.1% | -0.355 [-0.534, -0.159] | better |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 11.8% | -0.494 [-0.701, -0.279] | better |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 14.3% | -0.707 [-0.988, -0.422] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) | 16.1% | -0.869 [-1.158, -0.571] | better |

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

## 2024-25: first 15% of games → last 85%

1046 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 16.22 | — | — | baseline |
| Team net rating (roster-blind) | 17.1% | 14.77 | 0.69 | -0.687 [-0.987, -0.409] | better |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 9.2% | 15.46 | 2.06 | — | baseline |
| DRBL-P raw rate (unshrunk) | 5.5% | 15.77 | 0.62 | +0.313 [+0.163, +0.458] | worse |
| DRBL-LN (stored lineup) | 2.8% | 15.99 | 0.52 | +0.537 [+0.309, +0.764] | worse |
| DRBL-B (box) | 3.5% | 15.94 | 2.70 | +0.481 [+0.223, +0.749] | worse |
| Raw on-court +/- per 100 | 14.6% | 14.99 | 0.15 | -0.463 [-0.702, -0.235] | better |
| Scoreboard lineup ridge (λ=6400) | 13.8% | 15.06 | 1.57 | -0.395 [-0.616, -0.180] | better |
| Anchored lineup (drbl-anchored-lineup-v1) | 11.6% | 15.25 | 0.59 | -0.206 [-0.288, -0.120] | better |
| Play-by-play rate shrunk toward same-season box rating (blend half) | 10.4% | 15.35 | 0.38 | -0.106 [-0.298, +0.073] | no clear difference |
| DRBL/100, box blend (drbl-box-blend-v2) | 14.1% | 15.03 | 1.42 | -0.423 [-0.600, -0.255] | better |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 9.5% | -0.027 [-0.107, +0.051] | no clear difference |
| Published + DRBL-LN (stored lineup) | 9.1% | +0.005 [-0.000, +0.010] | no clear difference |
| Published + DRBL-B (box) | 9.7% | -0.042 [-0.117, +0.031] | no clear difference |
| Published + Raw on-court +/- per 100 | 14.5% | -0.458 [-0.673, -0.251] | better |
| Published + Scoreboard lineup ridge (λ=6400) | 13.7% | -0.391 [-0.593, -0.189] | better |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 12.6% | -0.294 [-0.462, -0.120] | better |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 10.8% | -0.141 [-0.272, -0.020] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) | 14.0% | -0.416 [-0.624, -0.221] | better |

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
| Scoreboard lineup ridge (λ=800) | 12.8% | 14.84 | 0.57 | +0.120 [-0.129, +0.378] | no clear difference |
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
| Published + Scoreboard lineup ridge (λ=800) | 15.9% | -0.144 [-0.259, -0.025] | better |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 15.1% | -0.074 [-0.153, +0.004] | no clear difference |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 20.2% | -0.519 [-0.734, -0.321] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) | 18.9% | -0.407 [-0.599, -0.215] | better |
| Published + DARKO 2023-24 (external) | 16.3% | -0.182 [-0.305, -0.053] | better |

## 2025-26: first 15% of games → last 85%

1046 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 16.56 | — | — | baseline |
| Team net rating (roster-blind) | 16.7% | 15.11 | 0.59 | -0.160 [-0.428, +0.131] | no clear difference |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 14.9% | 15.28 | 2.40 | — | baseline |
| DRBL-P raw rate (unshrunk) | 14.5% | 15.31 | 0.82 | +0.033 [-0.128, +0.200] | no clear difference |
| DRBL-LN (stored lineup) | 8.0% | 15.89 | 0.85 | +0.611 [+0.358, +0.862] | worse |
| DRBL-B (box) | 2.4% | 16.36 | 3.09 | +1.084 [+0.792, +1.372] | worse |
| Raw on-court +/- per 100 | 15.2% | 15.25 | 0.12 | -0.029 [-0.280, +0.230] | no clear difference |
| Scoreboard lineup ridge (λ=6400) | 13.0% | 15.45 | 1.35 | +0.170 [-0.069, +0.414] | no clear difference |
| Anchored lineup (drbl-anchored-lineup-v1) | 16.9% | 15.09 | 0.65 | -0.182 [-0.277, -0.088] | better |
| Play-by-play rate shrunk toward same-season box rating (blend half) | 19.6% | 14.85 | 0.41 | -0.426 [-0.675, -0.168] | better |
| DRBL/100, box blend (drbl-box-blend-v2) | 20.9% | 14.72 | 1.24 | -0.551 [-0.766, -0.331] | better |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 15.3% | -0.034 [-0.104, +0.037] | no clear difference |
| Published + DRBL-LN (stored lineup) | 14.9% | -0.000 [-0.040, +0.040] | no clear difference |
| Published + DRBL-B (box) | 14.8% | +0.005 [-0.009, +0.020] | no clear difference |
| Published + Raw on-court +/- per 100 | 17.0% | -0.185 [-0.315, -0.044] | better |
| Published + Scoreboard lineup ridge (λ=6400) | 15.9% | -0.093 [-0.190, +0.010] | no clear difference |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 17.0% | -0.192 [-0.326, -0.055] | better |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 19.6% | -0.431 [-0.635, -0.217] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) | 20.7% | -0.530 [-0.752, -0.299] | better |

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
