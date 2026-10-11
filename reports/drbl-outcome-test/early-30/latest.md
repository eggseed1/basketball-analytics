# DRBL outcome test

Generated 2026-10-11T18:48:34.885Z by `npm run drbl:outcome-test`.

R² is the share of final-margin variance explained beyond home court, out of sample. Slope is the final margin regressed on the margin the rating implies (on-court rating differences summed over every possession, per 100); 1 means the rating is in real points per 100, below 1 means it is spread too wide. ΔRMSE is the rating's error minus the error of Play-by-play DRBL/100 (EB1600, pre-blend) in points, with a 95% game-bootstrap interval. Negative means the rating predicts margins better.

Published DRBL/100 is DRBL/100, box blend (drbl-box-blend-v2). Its baseline here is the play-by-play-only rate it replaced in October 2026, which the artifacts keep as `drblPbp100`. A future replacement should beat published DRBL/100 in every cross-season test and never trail it within season. Play-by-play rate shrunk toward same-season box rating (blend half) is the same-season half of the blend, and Anchored lineup (drbl-anchored-lineup-v1) is stored as the shadow field `drblAnchored100`.

Cross-season rows use each season's shipped artifact; the section title names its pipeline version. Both box rows are rebuilt here from the rating window instead of read from the artifact. The blend's forward weights and calibration are refit for each test on earlier possessions only: through the rating season for cross-season tests, through the season before for within-season tests. The first local season has nothing earlier, so its within-season test has no blend row. When a within-season window is too short to fit its own box weights, the blend uses the previous season's, as the nightly compute does in opening week, and the row says so.

## 2020-21: first 30% of games → last 70%

756 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 15.28 | — | — | baseline |
| Team net rating (roster-blind) | 9.1% | 14.57 | 0.69 | -0.096 [-0.326, +0.129] | no clear difference |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 7.9% | 14.67 | 1.53 | — | baseline |
| DRBL-P raw rate (unshrunk) | 6.8% | 14.75 | 0.71 | +0.083 [-0.066, +0.234] | no clear difference |
| DRBL-LN (stored lineup) | 3.5% | 15.01 | 0.53 | +0.347 [+0.108, +0.585] | worse |
| DRBL-B (box) | -0.1% | 15.29 | -0.91 | +0.624 [+0.327, +0.898] | worse |
| Raw on-court +/- per 100 | 8.3% | 14.64 | 0.15 | -0.030 [-0.255, +0.181] | no clear difference |
| Scoreboard lineup ridge (λ=6400) | 8.7% | 14.60 | 1.32 | -0.062 [-0.239, +0.096] | no clear difference |
| Anchored lineup (drbl-anchored-lineup-v1) | 8.1% | 14.65 | 0.48 | -0.019 [-0.101, +0.064] | no clear difference |
| Play-by-play rate shrunk toward same-season box rating (blend half) | 12.9% | 14.26 | 0.41 | -0.402 [-0.695, -0.122] | better |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 7.8% | +0.011 [-0.018, +0.043] | no clear difference |
| Published + DRBL-LN (stored lineup) | 7.8% | +0.009 [-0.025, +0.045] | no clear difference |
| Published + DRBL-B (box) | 7.6% | +0.020 [-0.017, +0.054] | no clear difference |
| Published + Raw on-court +/- per 100 | 8.8% | -0.070 [-0.203, +0.055] | no clear difference |
| Published + Scoreboard lineup ridge (λ=6400) | 8.8% | -0.073 [-0.183, +0.031] | no clear difference |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 7.9% | -0.003 [-0.061, +0.055] | no clear difference |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 12.8% | -0.397 [-0.643, -0.161] | better |

## 2021-22: first 30% of games → last 70%

861 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 15.47 | — | — | baseline |
| Team net rating (roster-blind) | 8.2% | 14.82 | 0.61 | +0.049 [-0.141, +0.243] | no clear difference |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 8.8% | 14.77 | 1.39 | — | baseline |
| DRBL-P raw rate (unshrunk) | 9.6% | 14.71 | 0.81 | -0.067 [-0.235, +0.094] | no clear difference |
| DRBL-LN (stored lineup) | 3.7% | 15.18 | 0.52 | +0.406 [+0.201, +0.598] | worse |
| DRBL-B (box) | 1.9% | 15.32 | 1.32 | +0.542 [+0.276, +0.820] | worse |
| Raw on-court +/- per 100 | 12.2% | 14.49 | 0.16 | -0.279 [-0.485, -0.073] | better |
| Scoreboard lineup ridge (λ=6400) | 9.4% | 14.72 | 1.18 | -0.054 [-0.191, +0.090] | no clear difference |
| Anchored lineup (drbl-anchored-lineup-v1) | 9.4% | 14.72 | 0.46 | -0.048 [-0.137, +0.033] | no clear difference |
| Play-by-play rate shrunk toward same-season box rating (blend half) | 14.6% | 14.30 | 0.39 | -0.478 [-0.739, -0.196] | better |
| DRBL/100, box blend (drbl-box-blend-v2) | 13.4% | 14.40 | 0.78 | -0.377 [-0.621, -0.132] | better |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 9.5% | -0.059 [-0.192, +0.069] | no clear difference |
| Published + DRBL-LN (stored lineup) | 8.3% | +0.040 [+0.022, +0.058] | worse |
| Published + DRBL-B (box) | 10.2% | -0.118 [-0.246, -0.003] | better |
| Published + Raw on-court +/- per 100 | 12.1% | -0.269 [-0.463, -0.069] | better |
| Published + Scoreboard lineup ridge (λ=6400) | 9.6% | -0.065 [-0.163, +0.034] | no clear difference |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 9.1% | -0.028 [-0.108, +0.047] | no clear difference |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 14.6% | -0.484 [-0.725, -0.241] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) | 13.3% | -0.375 [-0.596, -0.152] | better |

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

## 2022-23: first 30% of games → last 70%

861 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 13.85 | — | — | baseline |
| Team net rating (roster-blind) | 8.4% | 13.25 | 0.64 | -0.231 [-0.444, -0.003] | better |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 5.2% | 13.48 | 1.24 | — | baseline |
| DRBL-P raw rate (unshrunk) | 3.9% | 13.57 | 0.50 | +0.089 [-0.013, +0.181] | no clear difference |
| DRBL-LN (stored lineup) | 3.8% | 13.58 | 0.48 | +0.094 [-0.073, +0.266] | no clear difference |
| DRBL-B (box) | 0.3% | 13.83 | 1.26 | +0.344 [+0.151, +0.534] | worse |
| Raw on-court +/- per 100 | 9.6% | 13.17 | 0.13 | -0.319 [-0.514, -0.120] | better |
| Scoreboard lineup ridge (λ=6400) | 10.3% | 13.12 | 1.16 | -0.367 [-0.567, -0.164] | better |
| Anchored lineup (drbl-anchored-lineup-v1) | 7.5% | 13.32 | 0.39 | -0.169 [-0.245, -0.091] | better |
| Play-by-play rate shrunk toward same-season box rating (blend half) | 10.7% | 13.09 | 0.37 | -0.398 [-0.601, -0.212] | better |
| DRBL/100, box blend (drbl-box-blend-v2) | 13.1% | 12.91 | 1.00 | -0.578 [-0.807, -0.364] | better |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 4.9% | +0.017 [+0.002, +0.031] | worse |
| Published + DRBL-LN (stored lineup) | 5.5% | -0.026 [-0.100, +0.049] | no clear difference |
| Published + DRBL-B (box) | 5.3% | -0.012 [-0.065, +0.038] | no clear difference |
| Published + Raw on-court +/- per 100 | 9.5% | -0.313 [-0.496, -0.124] | better |
| Published + Scoreboard lineup ridge (λ=6400) | 10.1% | -0.357 [-0.548, -0.167] | better |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 8.5% | -0.242 [-0.393, -0.091] | better |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 10.7% | -0.398 [-0.624, -0.180] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) | 13.4% | -0.600 [-0.881, -0.349] | better |

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

## 2023-24: first 30% of games → last 70%

861 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 16.03 | — | — | baseline |
| Team net rating (roster-blind) | 14.0% | 14.86 | 0.71 | -0.441 [-0.718, -0.163] | better |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 8.9% | 15.30 | 1.66 | — | baseline |
| DRBL-P raw rate (unshrunk) | 8.3% | 15.35 | 0.79 | +0.050 [-0.117, +0.233] | no clear difference |
| DRBL-LN (stored lineup) | 3.9% | 15.71 | 0.61 | +0.409 [+0.157, +0.667] | worse |
| DRBL-B (box) | 1.2% | 15.93 | 1.15 | +0.630 [+0.376, +0.896] | worse |
| Raw on-court +/- per 100 | 13.1% | 14.94 | 0.15 | -0.364 [-0.630, -0.107] | better |
| Scoreboard lineup ridge (λ=3200) | 13.8% | 14.88 | 1.00 | -0.420 [-0.689, -0.168] | better |
| Anchored lineup (drbl-anchored-lineup-v1) | 13.4% | 14.92 | 0.60 | -0.384 [-0.514, -0.256] | better |
| Play-by-play rate shrunk toward same-season box rating (blend half) | 18.5% | 14.47 | 0.49 | -0.835 [-1.166, -0.535] | better |
| DRBL/100, box blend (drbl-box-blend-v2) | 18.0% | 14.51 | 1.13 | -0.789 [-1.025, -0.543] | better |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 8.8% | +0.003 [-0.052, +0.068] | no clear difference |
| Published + DRBL-LN (stored lineup) | 8.8% | +0.002 [-0.030, +0.033] | no clear difference |
| Published + DRBL-B (box) | 8.8% | +0.007 [-0.012, +0.028] | no clear difference |
| Published + Raw on-court +/- per 100 | 13.2% | -0.366 [-0.582, -0.146] | better |
| Published + Scoreboard lineup ridge (λ=3200) | 13.8% | -0.417 [-0.644, -0.205] | better |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 15.2% | -0.540 [-0.798, -0.294] | better |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 18.3% | -0.810 [-1.157, -0.496] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) | 18.6% | -0.842 [-1.157, -0.525] | better |

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

## 2024-25: first 30% of games → last 70%

861 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 16.35 | — | — | baseline |
| Team net rating (roster-blind) | 15.2% | 15.06 | 0.68 | -0.321 [-0.571, -0.041] | better |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 11.5% | 15.38 | 1.73 | — | baseline |
| DRBL-P raw rate (unshrunk) | 9.9% | 15.52 | 0.91 | +0.143 [-0.006, +0.303] | no clear difference |
| DRBL-LN (stored lineup) | 4.9% | 15.94 | 0.54 | +0.563 [+0.297, +0.825] | worse |
| DRBL-B (box) | 1.5% | 16.23 | 4.98 | +0.849 [+0.510, +1.172] | worse |
| Raw on-court +/- per 100 | 17.4% | 14.86 | 0.15 | -0.516 [-0.768, -0.257] | better |
| Scoreboard lineup ridge (λ=6400) | 15.4% | 15.04 | 1.23 | -0.341 [-0.533, -0.130] | better |
| Anchored lineup (drbl-anchored-lineup-v1) | 14.7% | 15.10 | 0.56 | -0.273 [-0.371, -0.171] | better |
| Play-by-play rate shrunk toward same-season box rating (blend half) | 13.0% | 15.25 | 0.46 | -0.129 [-0.357, +0.124] | no clear difference |
| DRBL/100, box blend (drbl-box-blend-v2) | 16.4% | 14.95 | 1.05 | -0.429 [-0.613, -0.246] | better |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 11.2% | +0.026 [+0.011, +0.044] | worse |
| Published + DRBL-LN (stored lineup) | 11.4% | +0.011 [-0.022, +0.046] | no clear difference |
| Published + DRBL-B (box) | 12.6% | -0.093 [-0.204, +0.017] | no clear difference |
| Published + Raw on-court +/- per 100 | 17.2% | -0.503 [-0.744, -0.262] | better |
| Published + Scoreboard lineup ridge (λ=6400) | 15.2% | -0.325 [-0.506, -0.125] | better |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 16.5% | -0.441 [-0.690, -0.184] | better |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 13.5% | -0.172 [-0.329, -0.013] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) | 16.4% | -0.429 [-0.651, -0.205] | better |

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
| Scoreboard lineup ridge (λ=3200) | 14.2% | 14.73 | 0.82 | +0.004 [-0.234, +0.239] | no clear difference |
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
| Published + Scoreboard lineup ridge (λ=3200) | 16.1% | -0.157 [-0.281, -0.029] | better |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 15.1% | -0.074 [-0.153, +0.004] | no clear difference |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 20.2% | -0.519 [-0.734, -0.321] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) | 18.9% | -0.407 [-0.599, -0.215] | better |
| Published + DARKO 2023-24 (external) | 16.3% | -0.182 [-0.305, -0.053] | better |

## 2025-26: first 30% of games → last 70%

861 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 16.84 | — | — | baseline |
| Team net rating (roster-blind) | 15.6% | 15.46 | 0.68 | -0.373 [-0.659, -0.081] | better |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 11.5% | 15.84 | 1.81 | — | baseline |
| DRBL-P raw rate (unshrunk) | 8.8% | 16.07 | 0.78 | +0.237 [+0.054, +0.420] | worse |
| DRBL-LN (stored lineup) | 8.8% | 16.08 | 0.80 | +0.240 [-0.026, +0.529] | no clear difference |
| DRBL-B (box) | 9.4% | 16.02 | 5.80 | +0.184 [-0.158, +0.533] | no clear difference |
| Raw on-court +/- per 100 | 13.8% | 15.63 | 0.13 | -0.203 [-0.419, +0.051] | no clear difference |
| Scoreboard lineup ridge (λ=6400) | 13.1% | 15.69 | 1.15 | -0.142 [-0.332, +0.080] | no clear difference |
| Anchored lineup (drbl-anchored-lineup-v1) | 13.2% | 15.68 | 0.52 | -0.154 [-0.245, -0.067] | better |
| Play-by-play rate shrunk toward same-season box rating (blend half) | 19.4% | 15.11 | 0.50 | -0.723 [-1.010, -0.444] | better |
| DRBL/100, box blend (drbl-box-blend-v2) | 21.4% | 14.93 | 1.11 | -0.908 [-1.132, -0.671] | better |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 11.3% | +0.021 [+0.007, +0.035] | worse |
| Published + DRBL-LN (stored lineup) | 12.3% | -0.071 [-0.177, +0.034] | no clear difference |
| Published + DRBL-B (box) | 14.3% | -0.250 [-0.427, -0.070] | better |
| Published + Raw on-court +/- per 100 | 14.3% | -0.249 [-0.404, -0.076] | better |
| Published + Scoreboard lineup ridge (λ=6400) | 13.6% | -0.186 [-0.316, -0.030] | better |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 13.4% | -0.168 [-0.311, -0.027] | better |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 19.1% | -0.696 [-0.998, -0.405] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) | 22.9% | -1.051 [-1.380, -0.714] | better |

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
