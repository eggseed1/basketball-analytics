# DRBL outcome test

Generated 2026-10-11T18:43:34.804Z by `npm run drbl:outcome-test`.

R² is the share of final-margin variance explained beyond home court, out of sample. Slope is the final margin regressed on the margin the rating implies (on-court rating differences summed over every possession, per 100); 1 means the rating is in real points per 100, below 1 means it is spread too wide. ΔRMSE is the rating's error minus the error of Play-by-play DRBL/100 (EB1600, pre-blend) in points, with a 95% game-bootstrap interval. Negative means the rating predicts margins better.

Published DRBL/100 is DRBL/100, box blend (drbl-box-blend-v2). Its baseline here is the play-by-play-only rate it replaced in October 2026, which the artifacts keep as `drblPbp100`. A future replacement should beat published DRBL/100 in every cross-season test and never trail it within season. Play-by-play rate shrunk toward same-season box rating (blend half) is the same-season half of the blend, and Anchored lineup (drbl-anchored-lineup-v1) is stored as the shadow field `drblAnchored100`.

Cross-season rows use each season's shipped artifact; the section title names its pipeline version. Both box rows are rebuilt here from the rating window instead of read from the artifact. The blend's forward weights and calibration are refit for each test on earlier possessions only: through the rating season for cross-season tests, through the season before for within-season tests. The first local season has nothing earlier, so its within-season test has no blend row. When a within-season window is too short to fit its own box weights, the blend uses the previous season's, as the nightly compute does in opening week, and the row says so.

## 2020-21: first 5% of games → last 95%

1026 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 15.08 | — | — | baseline |
| Team net rating (roster-blind) | 0.9% | 15.01 | 0.14 | +0.007 [-0.058, +0.067] | no clear difference |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 1.0% | 15.00 | 0.82 | — | baseline |
| DRBL-P raw rate (unshrunk) | 1.0% | 15.00 | 0.15 | -0.003 [-0.032, +0.026] | no clear difference |
| DRBL-LN (stored lineup) | -0.1% | 15.08 | -0.04 | +0.078 [-0.004, +0.177] | no clear difference |
| DRBL-B (box) | 0.4% | 15.05 | 1.40 | +0.042 [-0.055, +0.148] | no clear difference |
| Raw on-court +/- per 100 | 1.2% | 14.99 | 0.04 | -0.018 [-0.082, +0.044] | no clear difference |
| Scoreboard lineup ridge (λ=400) | 1.3% | 14.98 | 0.19 | -0.027 [-0.102, +0.050] | no clear difference |
| Anchored lineup (drbl-anchored-lineup-v1) | 1.1% | 15.00 | 0.21 | -0.008 [-0.022, +0.005] | no clear difference |
| Play-by-play rate shrunk toward same-season box rating (blend half) | 1.0% | 15.00 | 0.08 | -0.007 [-0.094, +0.082] | no clear difference |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 0.8% | +0.015 [-0.008, +0.038] | no clear difference |
| Published + DRBL-LN (stored lineup) | 1.5% | -0.042 [-0.106, +0.030] | no clear difference |
| Published + DRBL-B (box) | 1.2% | -0.015 [-0.065, +0.036] | no clear difference |
| Published + Raw on-court +/- per 100 | 1.1% | -0.014 [-0.068, +0.036] | no clear difference |
| Published + Scoreboard lineup ridge (λ=400) | 1.3% | -0.028 [-0.083, +0.028] | no clear difference |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 1.0% | -0.004 [-0.049, +0.040] | no clear difference |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 1.2% | -0.017 [-0.072, +0.033] | no clear difference |

## 2021-22: first 5% of games → last 95%

1169 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 15.32 | — | — | baseline |
| Team net rating (roster-blind) | 3.6% | 15.05 | 0.27 | -0.035 [-0.163, +0.095] | no clear difference |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 3.1% | 15.08 | 1.72 | — | baseline |
| DRBL-P raw rate (unshrunk) | 3.4% | 15.06 | 0.33 | -0.017 [-0.088, +0.057] | no clear difference |
| DRBL-LN (stored lineup) | 1.8% | 15.18 | 0.54 | +0.102 [+0.004, +0.207] | worse |
| DRBL-B (box) | 0.9% | 15.25 | 1.35 | +0.174 [+0.039, +0.311] | worse |
| Raw on-court +/- per 100 | 2.8% | 15.11 | 0.05 | +0.027 [-0.068, +0.138] | no clear difference |
| Scoreboard lineup ridge (λ=400) | 1.3% | 15.23 | 0.20 | +0.147 [+0.049, +0.251] | worse |
| Anchored lineup (drbl-anchored-lineup-v1) | 3.3% | 15.07 | 0.42 | -0.010 [-0.033, +0.013] | no clear difference |
| Play-by-play rate shrunk toward same-season box rating (blend half) | 5.2% | 14.92 | 0.16 | -0.158 [-0.304, -0.009] | better |
| DRBL/100, box blend (drbl-box-blend-v2) | 6.1% | 14.85 | 1.17 | -0.234 [-0.406, -0.065] | better |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 3.3% | -0.014 [-0.061, +0.036] | no clear difference |
| Published + DRBL-LN (stored lineup) | 3.2% | -0.000 [-0.025, +0.025] | no clear difference |
| Published + DRBL-B (box) | 3.3% | -0.013 [-0.058, +0.033] | no clear difference |
| Published + Raw on-court +/- per 100 | 3.4% | -0.018 [-0.065, +0.032] | no clear difference |
| Published + Scoreboard lineup ridge (λ=400) | 3.1% | +0.004 [-0.000, +0.008] | no clear difference |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 3.2% | -0.005 [-0.037, +0.026] | no clear difference |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 5.2% | -0.162 [-0.289, -0.032] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) | 6.1% | -0.231 [-0.394, -0.075] | better |

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

## 2022-23: first 5% of games → last 95%

1169 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 13.70 | — | — | baseline |
| Team net rating (roster-blind) | 0.2% | 13.69 | 0.08 | +0.003 [-0.045, +0.054] | no clear difference |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 0.2% | 13.68 | 0.52 | — | baseline |
| DRBL-P raw rate (unshrunk) | 0.1% | 13.69 | 0.09 | +0.009 [-0.007, +0.026] | no clear difference |
| DRBL-LN (stored lineup) | 0.1% | 13.69 | 0.18 | +0.007 [-0.025, +0.039] | no clear difference |
| DRBL-B (box) | -0.0% | 13.70 | -0.53 | +0.018 [-0.036, +0.073] | no clear difference |
| Raw on-court +/- per 100 | 0.3% | 13.67 | 0.03 | -0.008 [-0.060, +0.046] | no clear difference |
| Scoreboard lineup ridge (λ=800) | 0.1% | 13.69 | 0.10 | +0.009 [-0.032, +0.051] | no clear difference |
| Anchored lineup (drbl-anchored-lineup-v1) | 0.2% | 13.68 | 0.14 | -0.000 [-0.015, +0.014] | no clear difference |
| Play-by-play rate shrunk toward same-season box rating (blend half) | 2.6% | 13.52 | 0.09 | -0.161 [-0.269, -0.049] | better |
| DRBL/100, box blend (drbl-box-blend-v2) | 3.6% | 13.45 | 0.65 | -0.232 [-0.358, -0.108] | better |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | -0.0% | +0.017 [+0.005, +0.027] | worse |
| Published + DRBL-LN (stored lineup) | 0.2% | +0.002 [-0.016, +0.021] | no clear difference |
| Published + DRBL-B (box) | 0.3% | -0.005 [-0.048, +0.039] | no clear difference |
| Published + Raw on-court +/- per 100 | 0.3% | -0.007 [-0.054, +0.039] | no clear difference |
| Published + Scoreboard lineup ridge (λ=800) | 0.1% | +0.006 [-0.024, +0.038] | no clear difference |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | -0.0% | +0.017 [-0.007, +0.040] | no clear difference |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 2.8% | -0.179 [-0.307, -0.044] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) | 4.0% | -0.264 [-0.405, -0.115] | better |

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

## 2023-24: first 5% of games → last 95%

1169 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 15.67 | — | — | baseline |
| Team net rating (roster-blind) | 5.1% | 15.27 | 0.30 | -0.256 [-0.412, -0.106] | better |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 1.9% | 15.52 | 1.31 | — | baseline |
| DRBL-P raw rate (unshrunk) | 1.3% | 15.57 | 0.24 | +0.048 [-0.002, +0.099] | no clear difference |
| DRBL-LN (stored lineup) | -0.1% | 15.68 | 0.25 | +0.156 [+0.063, +0.256] | worse |
| DRBL-B (box) | 0.0% | 15.67 | -0.69 | +0.151 [+0.035, +0.265] | worse |
| Raw on-court +/- per 100 | 6.2% | 15.18 | 0.08 | -0.340 [-0.494, -0.194] | better |
| Scoreboard lineup ridge (λ=6400) | 5.3% | 15.25 | 1.47 | -0.272 [-0.406, -0.139] | better |
| Anchored lineup (drbl-anchored-lineup-v1) | 3.1% | 15.43 | 0.38 | -0.090 [-0.127, -0.054] | better |
| Play-by-play rate shrunk toward same-season box rating (blend half) | 7.6% | 15.07 | 0.19 | -0.456 [-0.635, -0.268] | better |
| DRBL/100, box blend (drbl-box-blend-v2) | 7.1% | 15.11 | 1.05 | -0.416 [-0.555, -0.265] | better |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 1.8% | +0.011 [-0.010, +0.030] | no clear difference |
| Published + DRBL-LN (stored lineup) | 2.0% | -0.004 [-0.051, +0.045] | no clear difference |
| Published + DRBL-B (box) | 1.9% | +0.005 [-0.019, +0.028] | no clear difference |
| Published + Raw on-court +/- per 100 | 6.4% | -0.356 [-0.537, -0.179] | better |
| Published + Scoreboard lineup ridge (λ=6400) | 5.5% | -0.286 [-0.451, -0.125] | better |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 6.2% | -0.342 [-0.525, -0.167] | better |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 7.9% | -0.483 [-0.699, -0.260] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) | 8.3% | -0.516 [-0.724, -0.308] | better |

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
| Scoreboard lineup ridge (λ=800) | 14.1% | 14.51 | 0.64 | -0.419 [-0.656, -0.172] | better |
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
| Published + Scoreboard lineup ridge (λ=800) | 14.3% | -0.442 [-0.642, -0.233] | better |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 14.4% | -0.447 [-0.637, -0.249] | better |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 18.3% | -0.784 [-1.022, -0.531] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) | 18.4% | -0.792 [-1.028, -0.554] | better |
| Published + DARKO 2022-23 (external) | 13.3% | -0.351 [-0.519, -0.180] | better |

## 2024-25: first 5% of games → last 95%

1169 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 15.98 | — | — | baseline |
| Team net rating (roster-blind) | 10.5% | 15.12 | 0.45 | -0.647 [-0.875, -0.425] | better |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 2.7% | 15.76 | 1.51 | — | baseline |
| DRBL-P raw rate (unshrunk) | 1.9% | 15.83 | 0.29 | +0.063 [+0.003, +0.120] | worse |
| DRBL-LN (stored lineup) | 3.8% | 15.68 | 0.86 | -0.087 [-0.228, +0.052] | no clear difference |
| DRBL-B (box) | 0.3% | 15.96 | 1.09 | +0.195 [+0.073, +0.323] | worse |
| Raw on-court +/- per 100 | 8.7% | 15.27 | 0.09 | -0.491 [-0.696, -0.290] | better |
| Scoreboard lineup ridge (λ=6400) | 9.0% | 15.25 | 2.02 | -0.516 [-0.697, -0.330] | better |
| Anchored lineup (drbl-anchored-lineup-v1) | 4.9% | 15.59 | 0.48 | -0.178 [-0.239, -0.121] | better |
| Play-by-play rate shrunk toward same-season box rating (blend half) | 2.5% | 15.78 | 0.17 | +0.017 [-0.097, +0.138] | no clear difference |
| DRBL/100, box blend (drbl-box-blend-v2) | 6.2% | 15.48 | 1.57 | -0.287 [-0.420, -0.159] | better |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 2.5% | +0.015 [-0.005, +0.039] | no clear difference |
| Published + DRBL-LN (stored lineup) | 3.9% | -0.101 [-0.207, +0.003] | no clear difference |
| Published + DRBL-B (box) | 2.6% | +0.007 [-0.022, +0.036] | no clear difference |
| Published + Raw on-court +/- per 100 | 8.8% | -0.501 [-0.729, -0.275] | better |
| Published + Scoreboard lineup ridge (λ=6400) | 9.4% | -0.553 [-0.791, -0.317] | better |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 10.5% | -0.642 [-0.866, -0.389] | better |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 3.1% | -0.028 [-0.083, +0.032] | no clear difference |
| Published + DRBL/100, box blend (drbl-box-blend-v2) | 6.3% | -0.297 [-0.458, -0.139] | better |

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

## 2025-26: first 5% of games → last 95%

1169 games.

| Rating | R² | RMSE | Slope | ΔRMSE vs play-by-play DRBL/100 [95% CI] | Verdict |
|---|---|---|---|---|---|
| Home court only | 0.0% | 16.52 | — | — | baseline |
| Team net rating (roster-blind) | 4.7% | 16.13 | 0.31 | -0.000 [-0.225, +0.224] | no clear difference |
| Play-by-play DRBL/100 (EB1600, pre-blend) | 4.7% | 16.13 | 2.25 | — | baseline |
| DRBL-P raw rate (unshrunk) | 5.7% | 16.04 | 0.48 | -0.091 [-0.180, +0.000] | no clear difference |
| DRBL-LN (stored lineup) | 5.8% | 16.03 | 1.15 | -0.096 [-0.285, +0.077] | no clear difference |
| DRBL-B (box) | 3.2% | 16.26 | 4.11 | +0.125 [-0.086, +0.354] | no clear difference |
| Raw on-court +/- per 100 | 5.0% | 16.10 | 0.08 | -0.025 [-0.235, +0.176] | no clear difference |
| Scoreboard lineup ridge (λ=6400) | 4.7% | 16.13 | 1.59 | -0.002 [-0.192, +0.174] | no clear difference |
| Anchored lineup (drbl-anchored-lineup-v1) | 5.9% | 16.02 | 0.60 | -0.109 [-0.162, -0.055] | better |
| Play-by-play rate shrunk toward same-season box rating (blend half) | 5.9% | 16.02 | 0.21 | -0.106 [-0.263, +0.058] | no clear difference |
| DRBL/100, box blend (drbl-box-blend-v2) | 7.8% | 15.86 | 1.31 | -0.268 [-0.433, -0.109] | better |

Added on top of play-by-play DRBL/100 (two slopes):

| Combination | R² | ΔRMSE [95% CI] | Verdict |
|---|---|---|---|
| Published + DRBL-P raw rate (unshrunk) | 5.6% | -0.082 [-0.174, +0.015] | no clear difference |
| Published + DRBL-LN (stored lineup) | 6.3% | -0.138 [-0.255, -0.031] | better |
| Published + DRBL-B (box) | 5.7% | -0.090 [-0.185, +0.013] | no clear difference |
| Published + Raw on-court +/- per 100 | 6.2% | -0.127 [-0.244, -0.012] | better |
| Published + Scoreboard lineup ridge (λ=6400) | 5.8% | -0.096 [-0.199, +0.000] | no clear difference |
| Published + Anchored lineup (drbl-anchored-lineup-v1) | 6.6% | -0.163 [-0.288, -0.040] | better |
| Published + Play-by-play rate shrunk toward same-season box rating (blend half) | 6.1% | -0.122 [-0.228, -0.014] | better |
| Published + DRBL/100, box blend (drbl-box-blend-v2) | 7.6% | -0.253 [-0.407, -0.104] | better |

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
