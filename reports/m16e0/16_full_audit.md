# M16e0 full audit

## WAR verdict

2024-25 WAR reconstructs exactly from:

```text
finalAbility = 5.835416607524311 * posterior
WAR = (finalAbility - (-1.4886147765794517)) * n / 100 / 38.714285714285715
```

Primary inflation: **LOO calibration slope ≈ 5.84×** expanding residual-share rates onto net-rating-like units, plus replacement shift (~1.49 pts/100).

Double-exposure via season-total calibration: **NO**.

Appearance vs paired-possession ambiguity: **WARNING** (half-exposure diagnostic ≈2×).

## Jokic arithmetic check

{
  "player": "Nikola Jokić",
  "playerId": "203999",
  "displayedDRBL100": 1.5315,
  "posteriorAbilityRate": 1.5315,
  "rawAbilityRate": 2.6742,
  "warCalibrationInput": 1.5315,
  "looTransform": "0 + 5.835416607524311 * 1.5315",
  "warCalibratedRate": 8.936940534423483,
  "replacement": -1.4886147765794517,
  "aboveReplacementRate": 10.425555311002935,
  "actualOnCourtPossessions": 10737,
  "note_exposure": "off+def possession-appearances (combined-event count)",
  "seasonalImpact": "10.425555311002935 * 10737 / 100 = 1119.391873742385",
  "pointsPerWin": 38.714285714285715,
  "WAR": "1119.391873742385 / 38.714285714285715 = 28.914181240578213",
  "identity_raw": {
    "formula": "raw * n / 100",
    "value": 287.128854,
    "seasonalImpactStored": 287.12
  }
}

## M6

Formal winner P+M6; practical research base **P**.

## Statuses

- WAR_PRODUCTION_RECONSTRUCTS: PASS
- WAR_UNITS_DEFINED: PASS
- ABILITY_RATE_DENOMINATOR_IDENTIFIED: PASS
- WAR_EXPOSURE_DENOMINATOR_IDENTIFIED: PASS
- RATE_EXPOSURE_DIMENSIONAL_IDENTITY: PASS
- WAR_DOUBLE_EXPOSURE: NO
- WAR_CALIBRATION_TARGET_UNITS_VALID: PASS
- WAR_CALIBRATION_EXPOSURE_EMBEDDED: NO
- POINTS_PER_WIN_UNITS_VALID: PASS
- REPLACEMENT_SEMANTICS_VALID: WARNING
- WAR_UNEXPLAINED_SCALE_FACTOR: NO
- M16D_FORMAL_WINNER: P+M6
- M16E0_RESEARCH_BASE: P
- M6_PRACTICAL_EFFECT: DETECTABLE_ONLY
- P_CALIBRATION_RISK: NO
- POSTERIOR_INCREMENTAL_VALUE: UNSUPPORTED
- RESERVED_TEST_ACCESSED_FOR_MODEL_EVALUATION: NO
- PRODUCTION_DRBL_CHANGED: NO
- PRODUCTION_WAR_CHANGED: NO
