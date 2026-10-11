# DRBL outcome test

Generated 2026-10-11T18:41:15.471Z by `npm run drbl:outcome-test`.

R² is the share of final-margin variance explained beyond home court, out of sample. Slope is the final margin regressed on the margin the rating implies (on-court rating differences summed over every possession, per 100); 1 means the rating is in real points per 100, below 1 means it is spread too wide. ΔRMSE is the rating's error minus the error of Play-by-play DRBL/100 (EB1600, pre-blend) in points, with a 95% game-bootstrap interval. Negative means the rating predicts margins better.

Published DRBL/100 is DRBL/100, box blend (drbl-box-blend-v2). Its baseline here is the play-by-play-only rate it replaced in October 2026, which the artifacts keep as `drblPbp100`. A future replacement should beat published DRBL/100 in every cross-season test and never trail it within season. Play-by-play rate shrunk toward same-season box rating (blend half) is the same-season half of the blend, and Anchored lineup (drbl-anchored-lineup-v1) is stored as the shadow field `drblAnchored100`.

Cross-season rows use each season's shipped artifact; the section title names its pipeline version. Both box rows are rebuilt here from the rating window instead of read from the artifact. The blend's forward weights and calibration are refit for each test on earlier possessions only: through the rating season for cross-season tests, through the season before for within-season tests. The first local season has nothing earlier, so its within-season test has no blend row. When a within-season window is too short to fit its own box weights, the blend uses the previous season's, as the nightly compute does in opening week, and the row says so.

## 2020-21: first 3% of games → last 97%

1048 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 15.13 | — | — | baseline |
| Team net rating (roster-blind) | -0.1% | 15.13 | -0.02 | -0.002 [-0.032, +0.025] | no clear difference |
| Play-by-play DRBL/100 (EB1600, pre-blend) | -0.1% | 15.14 | 0.12 | — | baseline |
| DRBL-P raw rate (unshrunk) | -0.1% | 15.14 | 0.01 | +0.001 [-0.003, +0.005] | no clear difference |
| DRBL-LN (stored lineup) | -0.1% | 15.13 | 0.06 | -0.003 [-0.014, +0.009] | no clear difference |
| DRBL-B (box) | 1.0% | 15.05 | -1.77 | -0.086 [-0.180, +0.013] | no clear difference |
| Raw on-court +/- per 100 | -0.1% | 15.13 | -0.00 | -0.001 [-0.024, +0.018] | no clear difference |
| Scoreboard lineup ridge (λ=6400) | -0.1% | 15.13 | -0.12 | -0.001 [-0.029, +0.022] | no clear difference |
| Anchored lineup (drbl-anchored-lineup-v1) | -0.1% | 15.14 | 0.01 | +0.001 [-0.007, +0.008] | no clear difference |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | -0.3% | +0.014 [+0.005, +0.022] | worse |
| Published + DRBL-LN (stored lineup) | -0.3% | +0.011 [+0.003, +0.019] | worse |
| Published + DRBL-B (box) | 1.0% | -0.081 [-0.170, +0.018] | no clear difference |
| Published + Raw on-court +/- per 100 | -0.1% | -0.002 [-0.038, +0.034] | no clear difference |
| Published + Scoreboard lineup ridge (λ=6400) | 0.1% | -0.012 [-0.062, +0.036] | no clear difference |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 0.2% | -0.024 [-0.093, +0.049] | no clear difference |

## 2021-22: first 3% of games → last 97%

1194 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 15.27 | — | — | baseline |
| Team net rating (roster-blind) | 0.4% | 15.23 | 0.07 | -0.001 [-0.050, +0.050] | no clear difference |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 0.4% | 15.23 | 0.76 | — | baseline |
| DRBL-P raw rate (unshrunk) | 1.3% | 15.17 | 0.16 | -0.064 [-0.106, -0.024] | better |
| DRBL-LN (stored lineup) | 1.2% | 15.18 | 0.50 | -0.058 [-0.124, +0.013] | no clear difference |
| DRBL-B (box) | 0.3% | 15.25 | 0.65 | +0.013 [-0.050, +0.074] | no clear difference |
| Raw on-court +/- per 100 | 1.6% | 15.15 | 0.03 | -0.088 [-0.159, -0.020] | better |
| Scoreboard lineup ridge (λ=3200) | 1.1% | 15.18 | 0.57 | -0.049 [-0.100, +0.004] | no clear difference |
| Anchored lineup (drbl-anchored-lineup-v1) | 0.6% | 15.22 | 0.20 | -0.013 [-0.025, -0.003] | better |
| DRBL/100, box blend (drbl-box-blend-v2) with last season's box weights | 1.8% | 15.13 | 1.24 | -0.107 [-0.189, -0.021] | better |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 2.5% | -0.160 [-0.269, -0.043] | better |
| Published + DRBL-LN (stored lineup) | 1.1% | -0.050 [-0.119, +0.023] | no clear difference |
| Published + DRBL-B (box) | 0.5% | -0.006 [-0.041, +0.031] | no clear difference |
| Published + Raw on-court +/- per 100 | 1.6% | -0.092 [-0.185, +0.001] | no clear difference |
| Published + Scoreboard lineup ridge (λ=3200) | 1.1% | -0.048 [-0.113, +0.020] | no clear difference |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 1.2% | -0.055 [-0.124, +0.016] | no clear difference |
| Published + DRBL/100, box blend (drbl-box-blend-v2) with last season's box weights | 1.8% | -0.108 [-0.207, -0.010] | better |

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

## 2022-23: first 3% of games → last 97%

1194 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 13.67 | — | — | baseline |
| Team net rating (roster-blind) | 0.5% | 13.64 | 0.09 | -0.021 [-0.085, +0.037] | no clear difference |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 0.2% | 13.66 | 0.53 | — | baseline |
| DRBL-P raw rate (unshrunk) | -0.0% | 13.67 | 0.04 | +0.012 [-0.006, +0.029] | no clear difference |
| DRBL-LN (stored lineup) | 0.3% | 13.65 | 0.33 | -0.006 [-0.041, +0.034] | no clear difference |
| DRBL-B (box) | 0.3% | 13.65 | 1.15 | -0.006 [-0.051, +0.039] | no clear difference |
| Raw on-court +/- per 100 | 0.7% | 13.62 | 0.03 | -0.038 [-0.104, +0.029] | no clear difference |
| Scoreboard lineup ridge (λ=1600) | 0.7% | 13.62 | 0.29 | -0.037 [-0.101, +0.028] | no clear difference |
| Anchored lineup (drbl-anchored-lineup-v1) | 0.3% | 13.65 | 0.16 | -0.011 [-0.026, +0.006] | no clear difference |
| DRBL/100, box blend (drbl-box-blend-v2) with last season's box weights | 3.5% | 13.43 | 1.47 | -0.231 [-0.351, -0.108] | better |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 0.1% | +0.002 [-0.031, +0.037] | no clear difference |
| Published + DRBL-LN (stored lineup) | 0.3% | -0.006 [-0.035, +0.028] | no clear difference |
| Published + DRBL-B (box) | 0.3% | -0.009 [-0.045, +0.025] | no clear difference |
| Published + Raw on-court +/- per 100 | 0.6% | -0.031 [-0.098, +0.035] | no clear difference |
| Published + Scoreboard lineup ridge (λ=1600) | 0.6% | -0.029 [-0.096, +0.036] | no clear difference |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 0.2% | -0.003 [-0.048, +0.046] | no clear difference |
| Published + DRBL/100, box blend (drbl-box-blend-v2) with last season's box weights | 4.4% | -0.295 [-0.452, -0.145] | better |

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
| Scoreboard lineup ridge (λ=3200) | 11.5% | 12.87 | 0.74 | -0.381 [-0.582, -0.187] | better |
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
| Published + Scoreboard lineup ridge (λ=3200) | 11.2% | -0.362 [-0.552, -0.178] | better |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 10.6% | -0.316 [-0.474, -0.143] | better |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 10.8% | -0.333 [-0.498, -0.162] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) | 11.1% | -0.354 [-0.531, -0.183] | better |
| Published + DARKO 2021-22 (external) | 9.6% | -0.247 [-0.381, -0.094] | better |

## 2023-24: first 3% of games → last 97%

1194 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 15.74 | — | — | baseline |
| Team net rating (roster-blind) | 3.3% | 15.47 | 0.24 | -0.079 [-0.193, +0.048] | no clear difference |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 2.3% | 15.55 | 1.87 | — | baseline |
| DRBL-P raw rate (unshrunk) | 2.4% | 15.55 | 0.27 | -0.004 [-0.042, +0.037] | no clear difference |
| DRBL-LN (stored lineup) | 0.1% | 15.73 | 0.38 | +0.176 [+0.072, +0.288] | worse |
| DRBL-B (box) | 0.8% | 15.68 | -2.18 | +0.122 [-0.023, +0.278] | no clear difference |
| Raw on-court +/- per 100 | 3.3% | 15.47 | 0.06 | -0.082 [-0.196, +0.031] | no clear difference |
| Scoreboard lineup ridge (λ=6400) | 3.0% | 15.50 | 1.60 | -0.054 [-0.151, +0.046] | no clear difference |
| Anchored lineup (drbl-anchored-lineup-v1) | 3.0% | 15.50 | 0.47 | -0.053 [-0.082, -0.027] | better |
| DRBL/100, box blend (drbl-box-blend-v2) with last season's box weights | 5.0% | 15.34 | 1.95 | -0.217 [-0.349, -0.090] | better |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 2.2% | +0.008 [-0.022, +0.037] | no clear difference |
| Published + DRBL-LN (stored lineup) | 2.4% | -0.008 [-0.043, +0.027] | no clear difference |
| Published + DRBL-B (box) | 3.1% | -0.066 [-0.152, +0.008] | no clear difference |
| Published + Raw on-court +/- per 100 | 3.3% | -0.079 [-0.168, +0.015] | no clear difference |
| Published + Scoreboard lineup ridge (λ=6400) | 3.0% | -0.054 [-0.123, +0.015] | no clear difference |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 3.7% | -0.115 [-0.213, -0.017] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) with last season's box weights | 4.9% | -0.207 [-0.353, -0.065] | better |

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
| Scoreboard lineup ridge (λ=1600) | 14.1% | 14.51 | 0.74 | -0.419 [-0.647, -0.186] | better |
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
| Published + Scoreboard lineup ridge (λ=1600) | 14.2% | -0.431 [-0.629, -0.232] | better |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 14.4% | -0.447 [-0.637, -0.249] | better |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 18.3% | -0.784 [-1.022, -0.531] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) | 18.4% | -0.792 [-1.028, -0.554] | better |
| Published + DARKO 2022-23 (external) | 13.3% | -0.351 [-0.519, -0.180] | better |

## 2024-25: first 3% of games → last 97%

1194 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 15.89 | — | — | baseline |
| Team net rating (roster-blind) | 8.4% | 15.21 | 0.28 | -0.429 [-0.622, -0.246] | better |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 3.1% | 15.64 | 2.01 | — | baseline |
| DRBL-P raw rate (unshrunk) | 2.9% | 15.66 | 0.26 | +0.018 [-0.038, +0.076] | no clear difference |
| DRBL-LN (stored lineup) | 1.9% | 15.74 | 0.69 | +0.101 [-0.003, +0.207] | no clear difference |
| DRBL-B (box) | 2.0% | 15.73 | 2.30 | +0.092 [-0.045, +0.235] | no clear difference |
| Raw on-court +/- per 100 | 7.2% | 15.31 | 0.06 | -0.330 [-0.488, -0.164] | better |
| Scoreboard lineup ridge (λ=400) | 5.1% | 15.48 | 0.38 | -0.159 [-0.293, -0.009] | better |
| Anchored lineup (drbl-anchored-lineup-v1) | 4.6% | 15.53 | 0.53 | -0.116 [-0.160, -0.072] | better |
| DRBL/100, box blend (drbl-box-blend-v2) with last season's box weights | 4.2% | 15.56 | 1.39 | -0.082 [-0.181, +0.028] | no clear difference |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 2.9% | +0.019 [-0.005, +0.042] | no clear difference |
| Published + DRBL-LN (stored lineup) | 3.0% | +0.010 [-0.007, +0.027] | no clear difference |
| Published + DRBL-B (box) | 3.3% | -0.010 [-0.064, +0.047] | no clear difference |
| Published + Raw on-court +/- per 100 | 7.0% | -0.317 [-0.479, -0.144] | better |
| Published + Scoreboard lineup ridge (λ=400) | 5.1% | -0.159 [-0.270, -0.036] | better |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 7.5% | -0.358 [-0.537, -0.173] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) with last season's box weights | 4.0% | -0.065 [-0.146, +0.022] | no clear difference |

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

## 2025-26: first 3% of games → last 97%

1194 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 16.50 | — | — | baseline |
| Team net rating (roster-blind) | 2.3% | 16.31 | 0.21 | +0.029 [-0.131, +0.196] | no clear difference |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 2.7% | 16.28 | 2.21 | — | baseline |
| DRBL-P raw rate (unshrunk) | 2.6% | 16.28 | 0.30 | +0.008 [-0.045, +0.064] | no clear difference |
| DRBL-LN (stored lineup) | 2.8% | 16.26 | 1.24 | -0.013 [-0.132, +0.111] | no clear difference |
| DRBL-B (box) | -0.1% | 16.51 | 0.41 | +0.232 [+0.086, +0.387] | worse |
| Raw on-court +/- per 100 | 1.9% | 16.34 | 0.05 | +0.063 [-0.080, +0.202] | no clear difference |
| Scoreboard lineup ridge (λ=6400) | 2.1% | 16.33 | 1.52 | +0.051 [-0.081, +0.177] | no clear difference |
| Anchored lineup (drbl-anchored-lineup-v1) | 3.1% | 16.24 | 0.55 | -0.038 [-0.072, -0.004] | better |
| DRBL/100, box blend (drbl-box-blend-v2) with last season's box weights | 6.8% | 15.93 | 2.19 | -0.347 [-0.509, -0.189] | better |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 2.6% | +0.006 [-0.015, +0.029] | no clear difference |
| Published + DRBL-LN (stored lineup) | 3.1% | -0.039 [-0.101, +0.026] | no clear difference |
| Published + DRBL-B (box) | 2.6% | +0.004 [-0.020, +0.026] | no clear difference |
| Published + Raw on-court +/- per 100 | 3.1% | -0.034 [-0.096, +0.029] | no clear difference |
| Published + Scoreboard lineup ridge (λ=6400) | 3.0% | -0.028 [-0.080, +0.025] | no clear difference |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 3.1% | -0.040 [-0.109, +0.027] | no clear difference |
| Published + DRBL/100, box blend (drbl-box-blend-v2) with last season's box weights | 6.7% | -0.338 [-0.515, -0.171] | better |

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
| Scoreboard lineup ridge (λ=400) | 9.1% | 15.67 | 0.41 | +0.487 [+0.242, +0.760] | worse |
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
| Published + Scoreboard lineup ridge (λ=400) | 14.8% | -0.011 [-0.055, +0.034] | no clear difference |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 15.2% | -0.047 [-0.122, +0.029] | no clear difference |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 18.4% | -0.331 [-0.503, -0.175] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) | 20.4% | -0.517 [-0.723, -0.314] | better |
| Published + DARKO 2024-25 (external) | 18.4% | -0.334 [-0.518, -0.171] | better |
