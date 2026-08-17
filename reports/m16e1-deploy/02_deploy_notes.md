# WAR 4.0.1 unit repair deployed

## Scope

Exposure-only unit repair for **2024-25** calibrated WAR.

```text
WAR = (finalAbilityPaired - replacementPaired) × pairedOnCourtPossessions / 100 / PPW
pairedOnCourtPossessions = combinedPossessionAppearances / 2
```

Frozen (unchanged):

- slope = 5.835416607524311
- intercept = 0
- replacement = -1.4886147765794517
- pointsPerWin = 38.714285714285715

## Naming

- `combinedPossessionAppearances` = N_off + N_def (raw rate denominator; board `actualPossessions`)
- `pairedOnCourtPossessions` = (N_off + N_def) / 2 (WAR exposure)

## Nuance

`N_combined / N_paired ≡ 2` by definition of the paired formula.
Independent confirmation of the bug remains: LOO netRating units × former combined exposure, candidate equivalence, team-wins slope improvement.

## WAR model calibration

**Not solved.** Remaining empirical factor ≈ 2.918 still open.

## Verification

exactHalfMatches=555/555
maxAbsRatioDeviationFromHalf=0

## Next

Freeze WAR. Proceed to Approach A vs B on research base P.
