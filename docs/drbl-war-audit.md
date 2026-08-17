# DRBL-WAR Audit

## 1. Original WAR formula

```text
seasonalImpact = rawAbilityRate * actualPossessions / 100   (= Approach B totalValue)
DRBL_WAR       = seasonalImpact * pointsPerWinField
```

where `pointsPerWinField` was stored as `1/30` (wins per point) despite the name.

## 2. Original units

| Field | Claimed unit | Actual unit |
| --- | --- | --- |
| rawAbilityRate / drbl100 | points / 100 poss | Approach B residual shares / 100 poss |
| seasonalImpact | points | residual-share points vs R1 |
| pointsPerWin | points / win | **wins / point (1/30)** — naming bug |
| DRBL_WAR | wins | wins (arithmetically impact/30) |

## 3. Bugs discovered

1. **POINTS_PER_WIN_UNIT_MISMATCH** — config field named `pointsPerWin` held `1/30` and `warFromImpact` multiplied.
2. **DRBL_RATE_NOT_TRUE_POINTS_PER_100** — Approach B team rates ≈ 3 pts/100 while NBA net ratings ≈ ±10; residual shares are compressed vs true margin.
3. Season WAR used raw rate (correct for totalValue conservation) while ability boards used posterior — documented, not silent `drblP` substitution.
4. `replacementLevelRate = 0` is correct for Approach B (R1 embedded); fringe raw median ≈ -0.435.
5. No double-/100 and no prior-as-exposure in current realized impact path.

## 4. WAR input-rate diagnosis

`warInputRate = rawAbilityRate` (realized season value = totalValue conservation).

Posterior is used for ability / forecast boards, not for realized season WAR.

## 5. Possession-denominator diagnosis

Exposure = `actualOnCourtPossessions` (= accumulator possession appearances). Prior strength (200) affects EB posterior only.

## 6. Per-100 scaling diagnosis

Identity `impact = rate * n / 100` holds. No double division detected.

## 7. Prior/exposure diagnosis

PASS — prior not in exposure.

## 8. Replacement-level diagnosis

Production replacement = **0** (residuals already vs R1).
Fringe empirical median (200–800 poss) = **-0.4347** pts/100.

## 9. Points-per-win diagnosis

Empirical median from team point differential / wins-above-.500: **38.714** (n=26).
Provisional 30 is justified.

## 10. Corrected formula

```text
calibratedRate = intercept + slope * warInputRate
aboveReplacement = calibratedRate - replacementLevel
impact = aboveReplacement * actualOnCourtPossessions / 100
WAR = impact / pointsPerWin
```

with `warFormulaVersion = 3.0.0`, slope=2.5190, intercept=0, pointsPerWin=38.714, replacement=0.

## 11. Replacement-level derivation

R1 is embedded in Approach B residual construction (`replacement.ts` role-matched EP). Additional rate-level replacement kept at 0. Fringe median reported for monitoring.

## 12. Points-per-win derivation

From `data/drbl/calibration/team-season-2024-25.csv`:
`pointsPerWin ≈ seasonPointDifferential / (wins - 0.5 * games)` → median **38.714**.

## 13. League-level calibration

After Phase 22 rate calibration:
- predictedWins ≈ 0.25*82 + teamWAR
- slope(actual on predicted) = 1.851
- intercept = -1.55
- corr = 0.728
- MAE = 18.27, RMSE = 20.61

## 14. Team-level reconciliation

DRBL team pts/100 (impact / (playerPoss/5)) vs net rating: corr=0.773, through-origin slope=2.519 (applied 2.519).

## 15. Synthetic test results

See `drbl/models/__tests__/war-math.test.ts` (Tests A–I).

## 16. Before/after leaderboard

| Metric | Old | New |
| --- | --- | --- |
| Max WAR | 3.15 | 6.15 |
| Median top-10 | 2.09 | 4.08 |
| League total | 38.28 | 74.73 |

Artifacts: `outputs/drbl_war_corrected.csv`, `outputs/drbl_war_audit.csv`, `outputs/drbl_war_before_after.csv`.

## 17. Remaining limitations

- Approach B is not a full lineup-swap counterfactual; R1 residual adj is clamped.
- Rate calibration maps team aggregates to net rating; player-level causal claims remain limited.
- Traded-player stints are already summed in season accumulators; re-check if multi-team rows reappear.
- Team win prediction still imperfect (luck, coaching, unmodeled factors).

## Player traces

```text
Player: Nikola Jokić (203999)
rawDRBL100                 = 2.81
posteriorDRBL100           = 1.0173
drblP / drblLn / drblB     = 2.65 / 0 / 0
warInputRate               = 2.81
calibratedWarInputRate     = 7.078439081879945
replacementLevelDRBL100    = 0
aboveReplacementRate       = 7.078439081879945
actualOnCourtPossessions   = 3365
modelObservationCount      = 3365
seasonImpactAboveReplacement = 238.18947510526013
pointsPerWin               = 38.714285714285715
DRBL_WAR                   = 6.152495666925538

calibratedWarInputRate = 0 + 2.5190174668611904 * 2.81 = 7.078439081879945
aboveReplacementRate = 7.078439081879945 - (0) = 7.078439081879945 points / 100 possessions
impactAboveReplacement = 7.078439081879945 * 3365 / 100 = 238.18947510526013 points
DRBL_WAR = 238.18947510526013 / 38.714285714285715 = 6.152495666925538 wins
```

```text
Player: Jayson Tatum (1628369)
rawDRBL100                 = 1.6766
posteriorDRBL100           = 0.6144
drblP / drblLn / drblB     = 1.59 / 0 / 0
warInputRate               = 1.6766
calibratedWarInputRate     = 4.2233846849394725
replacementLevelDRBL100    = 0
aboveReplacementRate       = 4.2233846849394725
actualOnCourtPossessions   = 3770
modelObservationCount      = 3770
seasonImpactAboveReplacement = 159.22160262221811
pointsPerWin               = 38.714285714285715
DRBL_WAR                   = 4.112735123083125

calibratedWarInputRate = 0 + 2.5190174668611904 * 1.6766 = 4.2233846849394725
aboveReplacementRate = 4.2233846849394725 - (0) = 4.2233846849394725 points / 100 possessions
impactAboveReplacement = 4.2233846849394725 * 3770 / 100 = 159.22160262221811 points
DRBL_WAR = 159.22160262221811 / 38.714285714285715 = 4.112735123083125 wins
```

```text
Player: Shai Gilgeous-Alexander (1628983)
rawDRBL100                 = 1.6374
posteriorDRBL100           = 0.6002
drblP / drblLn / drblB     = 1.56 / 0 / 0
warInputRate               = 1.6374
calibratedWarInputRate     = 4.124639200238513
replacementLevelDRBL100    = 0
aboveReplacementRate       = 4.124639200238513
actualOnCourtPossessions   = 3782
modelObservationCount      = 3782
seasonImpactAboveReplacement = 155.99385455302055
pointsPerWin               = 38.714285714285715
DRBL_WAR                   = 4.0293615567200884

calibratedWarInputRate = 0 + 2.5190174668611904 * 1.6374 = 4.124639200238513
aboveReplacementRate = 4.124639200238513 - (0) = 4.124639200238513 points / 100 possessions
impactAboveReplacement = 4.124639200238513 * 3782 / 100 = 155.99385455302055 points
DRBL_WAR = 155.99385455302055 / 38.714285714285715 = 4.0293615567200884 wins
```

```text
Player: Victor Wembanyama (1641705)
rawDRBL100                 = 1.1718
posteriorDRBL100           = 0.4174
drblP / drblLn / drblB     = 1.1 / 0 / 0
warInputRate               = 1.1718
calibratedWarInputRate     = 2.9517846676679427
replacementLevelDRBL100    = 0
aboveReplacementRate       = 2.9517846676679427
actualOnCourtPossessions   = 2937
modelObservationCount      = 2937
seasonImpactAboveReplacement = 86.69391568940748
pointsPerWin               = 38.714285714285715
DRBL_WAR                   = 2.23932623551975

calibratedWarInputRate = 0 + 2.5190174668611904 * 1.1718 = 2.9517846676679427
aboveReplacementRate = 2.9517846676679427 - (0) = 2.9517846676679427 points / 100 possessions
impactAboveReplacement = 2.9517846676679427 * 2937 / 100 = 86.69391568940748 points
DRBL_WAR = 86.69391568940748 / 38.714285714285715 = 2.23932623551975 wins
```
